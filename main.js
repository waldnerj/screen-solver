const path = require('path');
const {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  desktopCapturer,
  systemPreferences,
  clipboard,
  ipcMain,
  net,
} = require('electron');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { marked } = require('marked');

// ───────────── Einstellungen ─────────────
const HOTKEYS = {
  solve: 'Control+Alt+S', // ⌃⌥S  → Bildschirm lesen und lösen
  toggle: 'Control+Alt+H', // ⌃⌥H  → Overlay ein-/ausblenden
  copy: 'Control+Alt+C', // ⌃⌥C  → Antwort in die Zwischenablage
  quit: 'Control+Alt+Q', // ⌃⌥Q  → App beenden
};
const OVERLAY = { width: 440, minHeight: 92, maxHeight: 560, margin: 16 };
const MAX_IMAGE_EDGE = 1280; // längste Kante des Screenshots in px
const JPEG_QUALITY = 70;
const SYSTEM_PROMPT = `Du siehst einen Screenshot vom Bildschirm des Nutzers.
Finde die Aufgabe, Frage oder das Problem, das dort zu sehen ist, und löse es.
Antworte auf Deutsch (außer der Inhalt ist eindeutig englisch) und so kurz wie möglich:
in der ersten Zeile nur das Ergebnis, fett. Danach höchstens zwei kurze Zeilen Begründung.
Bei mehreren Aufgaben nummeriere die Lösungen. Nutze Markdown.
Wenn nichts Lösbares zu sehen ist, fasse kurz zusammen, was am Bildschirm steht.`;
const USER_PROMPT = 'Löse, was am Bildschirm zu sehen ist.';

// Anbieter: "gemini" (kostenloser API-Key), "ollama" (lokal, ganz ohne Key)
// oder "anthropic" (kostenpflichtig). Wird automatisch aus der .env erkannt.
const env = (name) => (process.env[name] || '').trim();
const PROVIDER =
  env('SOLVER_PROVIDER') ||
  (env('GEMINI_API_KEY') ? 'gemini' : env('ANTHROPIC_API_KEY') ? 'anthropic' : 'ollama');
const MODELS = {
  gemini: env('GEMINI_MODEL') || 'gemini-flash-lite-latest', // schnellstes Modell
  ollama: env('OLLAMA_MODEL') || 'gemma3:4b',
  anthropic: env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
};
const GEMINI_FALLBACKS = (env('GEMINI_FALLBACK_MODELS') || 'gemini-flash-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_URL = env('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com';
const OLLAMA_URL = env('OLLAMA_URL') || 'http://127.0.0.1:11434';
const FIRST_BYTE_TIMEOUT = 15000; // ms, danach nächstes Modell
// Deckkraft des Overlay-Hintergrunds: 0.15 (fast durchsichtig) bis 1 (deckend)
const BG_OPACITY = Math.max(0.15, Math.min(1, parseFloat(env('OVERLAY_OPACITY')) || 0.5));
// ──────────────────────────────────────────

let win = null;
let currentAbort = null;
let currentDisplay = null;
let requestId = 0;
let lastAnswer = '';

// ───────────── Netzwerk ─────────────
// net.fetch nutzt den Chromium-Netzwerkstack: HTTP/2 und Verbindungen bleiben
// offen, dadurch entfällt bei jeder Anfrage der Verbindungsaufbau.
async function fetchWithTimeout(url, options, ms) {
  const outer = options.signal;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (outer) outer.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await net.fetch(url, { ...options, signal: ctl.signal });
  } catch (err) {
    if (outer && outer.aborted) throw err;
    const e = new Error(
      ctl.signal.aborted
        ? `Keine Antwort nach ${Math.round(ms / 1000)} s`
        : `Netzwerkfehler: ${err.cause?.message || err.message}`
    );
    e.retryable = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function* readLines(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

async function failIfNotOk(res) {
  if (res.ok) return;
  const body = (await res.text()).slice(0, 600);
  throw new Error(`HTTP ${res.status}\n${body}`);
}

// ───────────── Gemini ─────────────
// Fragt Google, welche Flash-Modelle der Key nutzen darf. Dient gleichzeitig
// dazu, die Verbindung vorzuwärmen.
let geminiModelCache = null;
async function listGeminiModels(signal) {
  try {
    const res = await fetchWithTimeout(
      `${GEMINI_URL}/v1beta/models?pageSize=1000`,
      { signal, headers: { 'x-goog-api-key': env('GEMINI_API_KEY') } },
      6000
    );
    if (!res.ok) return geminiModelCache || [];
    const data = await res.json();
    const names = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter(
        (n) =>
          /^gemini-.*flash/.test(n) &&
          !/(image|tts|audio|live|embedding|native|computer|robotics)/.test(n)
      );
    const isPreview = (n) => (/(preview|exp)/.test(n) ? 1 : 0);
    const isLite = (n) => (/lite/.test(n) ? 0 : 1);
    const version = (n) => parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) || [])[1] || 0);
    names.sort(
      (a, b) =>
        isPreview(a) - isPreview(b) ||
        isLite(a) - isLite(b) ||
        version(b) - version(a) ||
        a.length - b.length
    );
    geminiModelCache = names;
    return names;
  } catch {
    return geminiModelCache || [];
  }
}

// Modelle, die "Nachdenken aus" nicht akzeptieren (wird zur Laufzeit gelernt)
const thinkingOffRejected = new Set();
// Modell, das zuletzt funktioniert hat, kommt beim nächsten Mal zuerst dran
let preferredGeminiModel = null;

async function askGeminiModel(model, image, onText, signal) {
  const fast = !thinkingOffRejected.has(model);
  const res = await fetchWithTimeout(
    `${GEMINI_URL}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env('GEMINI_API_KEY'),
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          maxOutputTokens: 1500,
          ...(fast ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: image } },
              { text: USER_PROMPT },
            ],
          },
        ],
      }),
    },
    FIRST_BYTE_TIMEOUT
  );
  if (res.status === 400 && fast) {
    thinkingOffRejected.add(model);
    return askGeminiModel(model, image, onText, signal);
  }
  if ([404, 429, 500, 503].includes(res.status)) {
    const err = new Error(`HTTP ${res.status}\n${(await res.text()).slice(0, 600)}`);
    err.retryable = true;
    throw err;
  }
  await failIfNotOk(res);
  for await (const line of readLines(res)) {
    if (!line.startsWith('data:')) continue;
    let chunk;
    try {
      chunk = JSON.parse(line.slice(5));
    } catch {
      continue;
    }
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of parts) if (part.text && !part.thought) onText(part.text);
  }
}

async function askGemini(image, onText, signal) {
  const models = [
    ...new Set([preferredGeminiModel, MODELS.gemini, ...GEMINI_FALLBACKS].filter(Boolean)),
  ];
  const tried = [];
  let lastError;
  let discovered = false;
  for (let i = 0; i < models.length && i < 8; i++) {
    const model = models[i];
    tried.push(model);
    try {
      send({ label: model });
      await askGeminiModel(model, image, onText, signal);
      preferredGeminiModel = model;
      return model;
    } catch (err) {
      if (signal.aborted || !err.retryable) throw err;
      lastError = err;
      console.error(`${model}: ${err.message.split('\n')[0]}`);
      if (i === models.length - 1 && !discovered) {
        // Standardmodelle ausgefallen: nachsehen, was der Key sonst noch darf
        discovered = true;
        const more = geminiModelCache || (await listGeminiModels(signal));
        for (const m of more) if (!models.includes(m)) models.push(m);
      }
    }
  }
  throw new Error(
    `Kein Gemini-Modell hat geantwortet.\nProbiert: ${tried.join(', ')}\n\nLetzter Fehler: ${lastError.message}`
  );
}

// ───────────── Ollama / Anthropic ─────────────
async function askOllama(image, onText, signal) {
  let res;
  try {
    res = await net.fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS.ollama,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_PROMPT, images: [image] },
        ],
      }),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error(`Ollama ist nicht erreichbar (${OLLAMA_URL}). Läuft die Ollama-App?`);
  }
  await failIfNotOk(res);
  for await (const line of readLines(res)) {
    let chunk;
    try {
      chunk = JSON.parse(line);
    } catch {
      continue;
    }
    if (chunk.error) throw new Error(chunk.error);
    if (chunk.message?.content) onText(chunk.message.content);
  }
  return MODELS.ollama;
}

async function askAnthropic(image, onText, signal) {
  const mod = require('@anthropic-ai/sdk');
  const Anthropic = mod.default || mod;
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  const stream = client.messages.stream({
    model: MODELS.anthropic,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  });
  signal.addEventListener('abort', () => stream.abort());
  stream.on('text', onText);
  await stream.finalMessage();
  return MODELS.anthropic;
}

const PROVIDERS = { gemini: askGemini, ollama: askOllama, anthropic: askAnthropic };

function missingConfig() {
  if (!PROVIDERS[PROVIDER]) {
    return `Unbekannter Anbieter \`${PROVIDER}\`. Erlaubt: gemini, ollama, anthropic.`;
  }
  if (PROVIDER === 'gemini' && !env('GEMINI_API_KEY')) {
    return 'In der `.env` fehlt `GEMINI_API_KEY=...`';
  }
  if (PROVIDER === 'anthropic' && !env('ANTHROPIC_API_KEY')) {
    return 'In der `.env` fehlt `ANTHROPIC_API_KEY=...`';
  }
  return null;
}

// ───────────── Overlay ─────────────
function createOverlay() {
  win = new BrowserWindow({
    width: OVERLAY.width,
    height: OVERLAY.minHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false, // nimmt dir nie den Fokus weg
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('did-finish-load', () => send({ opacity: BG_OPACITY }));
  win.loadFile(path.join(__dirname, 'overlay.html'));
}

// Fenster unten rechts verankern; die Höhe richtet sich nach dem Inhalt.
function setOverlayHeight(height) {
  if (!win || win.isDestroyed()) return;
  const display = currentDisplay || screen.getPrimaryDisplay();
  const wa = display.workArea;
  const max = Math.min(OVERLAY.maxHeight, wa.height - 2 * OVERLAY.margin);
  const h = Math.max(OVERLAY.minHeight, Math.min(Math.ceil(height), max));
  win.setResizable(true);
  win.setBounds({
    x: wa.x + wa.width - OVERLAY.width - OVERLAY.margin,
    y: wa.y + wa.height - h - OVERLAY.margin,
    width: OVERLAY.width,
    height: h,
  });
  win.setResizable(false);
}

function send(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update', payload);
}

function showMessage(state, label, markdown) {
  send({ state, label, time: '', html: marked.parse(markdown || '') });
  win.showInactive();
}

async function captureDisplay(display) {
  const scale = Math.min(
    display.scaleFactor,
    MAX_IMAGE_EDGE / Math.max(display.size.width, display.size.height)
  );
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale),
    },
  });
  const source =
    sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) return null;
  return source.thumbnail.toJPEG(JPEG_QUALITY).toString('base64');
}

function screenAccessDenied() {
  return (
    process.platform === 'darwin' &&
    systemPreferences.getMediaAccessStatus('screen') === 'denied'
  );
}

async function solve() {
  const started = Date.now();
  const id = ++requestId;
  if (currentAbort) currentAbort.abort();
  const abort = new AbortController();
  currentAbort = abort;

  // Bildschirm, auf dem gerade die Maus ist
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  // Overlay für die Aufnahme unsichtbar machen, damit es nicht im Screenshot landet
  const wasVisible = win.isVisible();
  if (wasVisible) {
    win.setOpacity(0);
    await new Promise((r) => setTimeout(r, 40));
  }

  let image = null;
  try {
    image = await captureDisplay(display);
  } catch (err) {
    console.error(err);
  }
  if (id !== requestId) return;

  currentDisplay = display;
  setOverlayHeight(OVERLAY.minHeight);
  win.setOpacity(1);

  if (!image || screenAccessDenied()) {
    showMessage(
      'error',
      'Keine Berechtigung',
      'Bildschirmaufnahme ist nicht erlaubt.\n\n**Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme** öffnen, dort dein Terminal (bzw. Electron) aktivieren und die App neu starten.'
    );
    return;
  }

  const problem = missingConfig();
  if (problem) {
    showMessage('error', 'Konfiguration fehlt', problem);
    return;
  }

  send({ state: 'working', label: PROVIDER, time: '0.0 s', html: '', reset: true });
  win.showInactive();

  const elapsed = () => ((Date.now() - started) / 1000).toFixed(1) + ' s';
  const ticker = setInterval(() => {
    if (id !== requestId) return clearInterval(ticker);
    send({ time: elapsed() });
  }, 100);

  let text = '';
  let pending = null;
  const flush = () => {
    pending = null;
    if (id === requestId) send({ html: marked.parse(text) });
  };
  const onText = (delta) => {
    if (id !== requestId) return;
    text += delta;
    lastAnswer = text;
    if (!pending) pending = setTimeout(flush, 30);
  };

  try {
    const model = await PROVIDERS[PROVIDER](image, onText, abort.signal);
    if (id !== requestId) return;
    clearTimeout(pending);
    lastAnswer = text;
    send({
      state: 'done',
      label: model || PROVIDER,
      time: elapsed(),
      html: marked.parse(text || '_Keine Antwort erhalten._'),
    });
  } catch (err) {
    if (id !== requestId || abort.signal.aborted) return; // von neuer Anfrage abgelöst
    console.error(err);
    clearTimeout(pending);
    showMessage('error', 'Fehler', '```\n' + (err.message || String(err)) + '\n```');
  } finally {
    clearInterval(ticker);
  }
}

function toggle() {
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function copyAnswer() {
  if (!lastAnswer) return;
  clipboard.writeText(lastAnswer.trim());
  send({ flash: 'Kopiert' });
}

// Hält die Verbindung zu Google offen, damit die erste Anfrage nicht erst
// eine Verbindung aufbauen muss.
function keepWarm() {
  if (PROVIDER !== 'gemini' || !env('GEMINI_API_KEY')) return;
  const ping = () => listGeminiModels(new AbortController().signal);
  ping();
  setInterval(ping, 120000);
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide(); // kein Dock-Icon
  createOverlay();
  // Text im Overlay markieren → landet direkt in der Zwischenablage
  ipcMain.on('copy', (_event, text) => {
    if (typeof text !== 'string' || !text.trim()) return;
    clipboard.writeText(text.trim());
    send({ flash: 'Kopiert' });
  });
  ipcMain.on('height', (_event, height) => {
    if (typeof height === 'number' && height > 0) setOverlayHeight(height);
  });

  const failed = [];
  const register = (keys, fn) => {
    if (!globalShortcut.register(keys, fn)) failed.push(keys);
  };
  register(HOTKEYS.solve, solve);
  register(HOTKEYS.toggle, toggle);
  register(HOTKEYS.copy, copyAnswer);
  register(HOTKEYS.quit, () => app.quit());
  if (failed.length) {
    console.error('Hotkeys konnten nicht registriert werden:', failed.join(', '));
  }

  keepWarm();

  console.log(
    `Screen Solver läuft (Anbieter: ${PROVIDER}, Modell: ${MODELS[PROVIDER] || '?'}).\n  Lösen:    ${HOTKEYS.solve}\n  Overlay:  ${HOTKEYS.toggle}\n  Kopieren: ${HOTKEYS.copy}\n  Beenden:  ${HOTKEYS.quit}`
  );

  if (env('SOLVER_AUTORUN')) setTimeout(solve, Number(env('SOLVER_AUTORUN')) || 1500);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {}); // im Hintergrund weiterlaufen

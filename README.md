# Screen Solver

Ein kleines Hintergrund-Programm für macOS: Per Tastenkombination liest es deinen Bildschirm, schickt einen Screenshot an ein KI-Modell und zeigt die Lösung als unauffälligen Text unten rechts an.

- Kostenlos nutzbar mit einem Gemini-API-Key von Google
- Antwort erscheint live, das Ergebnis steht groß in der ersten Zeile
- Durchsichtiges Overlay, das nie den Tastaturfokus wegnimmt
- Wechselt automatisch das Modell, wenn eines überlastet ist

---

## Installation Schritt für Schritt

Du brauchst einen Mac. Alles Weitere wird hier erklärt.

### 1. Terminal öffnen

Drück ⌘ + Leertaste, tippe `Terminal` und drück Enter. In dieses Fenster fügst du die Befehle unten mit ⌘V ein und bestätigst jeweils mit Enter.

### 2. Node.js installieren

Prüfe, ob Node.js schon da ist:

```bash
node -v
```

Erscheint eine Versionsnummer (z. B. `v22.11.0`), kannst du zu Schritt 3 springen. Kommt `command not found`, lade Node.js von [nodejs.org](https://nodejs.org) herunter (Button „LTS"), installiere es per Doppelklick und öffne das Terminal danach neu.

### 3. Projekt herunterladen und einrichten

Diese eine Zeile lädt das Projekt in deinen Dokumente-Ordner, installiert alles Nötige und öffnet die Einstellungsdatei:

```bash
cd ~/Documents && git clone https://github.com/waldnerj/screen-solver.git && cd screen-solver && npm install && cp .env.example .env && open -e .env
```

Falls macOS beim ersten `git`-Aufruf fragt, ob die „Command Line Developer Tools" installiert werden sollen: bestätigen, warten, dann die Zeile nochmal ausführen.

<details>
<summary>Lieber ohne git? Als ZIP herunterladen</summary>

1. Oben auf dieser Seite auf den grünen Button **Code** klicken, dann **Download ZIP**.
2. Das ZIP im Downloads-Ordner per Doppelklick entpacken.
3. Im Terminal:

```bash
cd ~/Downloads/screen-solver-main && npm install && cp .env.example .env && open -e .env
```

</details>

### 4. Kostenlosen Gemini-Key holen

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) öffnen und mit einem Google-Konto anmelden.
2. Auf **API-Schlüssel erstellen** klicken.
3. Den Schlüssel kopieren.

### 5. Key eintragen

In Schritt 3 hat sich eine Textdatei geöffnet. Füge den Schlüssel direkt hinter `GEMINI_API_KEY=` ein, ohne Leerzeichen und ohne Anführungszeichen:

```
GEMINI_API_KEY=dein-schlüssel-hier
```

Mit ⌘S speichern und das Fenster schließen.

### 6. Starten

```bash
npm start
```

Im Terminal erscheint „Screen Solver läuft". Das Terminal-Fenster muss offen bleiben, solange du die App nutzt.

### 7. Bildschirmaufnahme erlauben (nur beim ersten Mal)

Drück Control + Option + S. macOS fragt nach der Berechtigung für die Bildschirmaufnahme:

1. Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme öffnen.
2. Den Schalter beim **Terminal** einschalten.
3. Im Terminal ⌃C drücken und `npm start` nochmal ausführen.

Fertig. Ab jetzt löst Control + Option + S, was am Bildschirm zu sehen ist.

---

## Später wieder starten

```bash
cd ~/Documents/screen-solver && npm start
```

## Auf die neueste Version aktualisieren

```bash
cd ~/Documents/screen-solver && git pull && npm install
```

## Tastenkombinationen

| Tasten | Aktion |
| --- | --- |
| ⌃⌥S (Control + Option + S) | Bildschirm lesen und lösen |
| ⌃⌥H (Control + Option + H) | Overlay ein-/ausblenden |
| ⌃⌥C (Control + Option + C) | Ganze Antwort in die Zwischenablage kopieren |
| ⌃⌥Q (Control + Option + Q) | App beenden |

Text im Overlay mit der Maus markieren kopiert ihn sofort in die Zwischenablage.

## Einstellungen

Alle Einstellungen stehen in der Datei `.env` im Projektordner. Öffnen mit:

```bash
cd ~/Documents/screen-solver && open -e .env
```

| Eintrag | Bedeutung |
| --- | --- |
| `GEMINI_API_KEY` | Dein Gemini-Key (Pflicht) |
| `GEMINI_MODEL` | Standard `gemini-flash-lite-latest` (am schnellsten). `gemini-flash-latest` ist stärker, aber etwas langsamer. |
| `OVERLAY_OPACITY` | Hintergrund des Overlays: `0` = nur Text (Standard), `1` = schwarzer Kasten |
| `OLLAMA_MODEL` | Lokales Modell über [Ollama](https://ollama.com) statt Gemini (dann `GEMINI_API_KEY` leer lassen) |
| `ANTHROPIC_API_KEY` | Claude statt Gemini (kostenpflichtig) |

Nach jeder Änderung die App neu starten. Tastenkürzel, Prompt und Overlay-Größe lassen sich oben in `main.js` ändern.

## Fehlerbehebung

| Problem | Lösung |
| --- | --- |
| `command not found: node` oder `npm` | Node.js installieren (Schritt 2) und Terminal neu öffnen |
| `no such file or directory` | Du bist im falschen Ordner: zuerst `cd ~/Documents/screen-solver` |
| „Keine Berechtigung" im Overlay | Bildschirmaufnahme für das Terminal erlauben (Schritt 7), App neu starten |
| „Konfiguration fehlt" | Key in der `.env` eintragen (Schritt 5) |
| HTTP 503 / „Kein Gemini-Modell hat geantwortet" | Google ist überlastet, kurz warten und nochmal versuchen |
| Hotkey reagiert nicht | Prüfen, ob `npm start` noch läuft und kein anderes Programm dasselbe Kürzel belegt |

## Gut zu wissen

- Es wird der Bildschirm aufgenommen, auf dem sich gerade die Maus befindet.
- Die Screenshots werden an den gewählten KI-Anbieter gesendet. Auf Googles kostenloser Stufe dürfen die Inhalte zur Produktverbesserung verwendet werden, also nichts Privates am Bildschirm haben.
- Die Datei `.env` enthält deinen Key. Gib sie nicht weiter und lade sie nirgends hoch.
- KI-Antworten können falsch sein, vor allem mit dem schnellen Standardmodell.
- Nicht für Tests, Prüfungen oder andere Situationen gedacht, in denen Hilfsmittel nicht erlaubt sind.

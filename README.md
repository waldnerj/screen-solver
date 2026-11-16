# Screen Solver

Liest per Hotkey den Bildschirm, schickt den Screenshot an ein KI-Modell (Standard: Gemini, kostenlos) und zeigt die Lösung in einem Overlay unten rechts.

## Setup (macOS)

```bash
cd screen-solver
npm install
cp .env.example .env   # dann den API-Key eintragen
npm start
```

Einen kostenlosen Gemini-Key bekommst du unter https://aistudio.google.com/apikey. Alternativen (Ollama lokal, Anthropic) stehen in `.env.example`.

Beim ersten Lösen fragt macOS nach der Berechtigung **Bildschirmaufnahme**
(Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme). Dort das Terminal aktivieren, aus dem du `npm start` ausführst, und die App neu starten.

## Hotkeys

| Tastenkombination | Aktion |
| --- | --- |
| ⌃⌥S (Control + Option + S) | Bildschirm lesen und lösen |
| ⌃⌥C (Control + Option + C) | Ganze Antwort in die Zwischenablage kopieren |
| ⌃⌥H (Control + Option + H) | Overlay ein-/ausblenden |
| ⌃⌥Q (Control + Option + Q) | App beenden |

Hotkeys, Modell, Overlay-Größe und der Prompt stehen oben in `main.js`.

## Hinweise

- Standard ist das schnellste Modell (`gemini-flash-lite-latest`). Für bessere Antworten bei kniffligen Aufgaben in der `.env` `GEMINI_MODEL=gemini-flash-latest` setzen.
- Es wird der Bildschirm aufgenommen, auf dem sich gerade die Maus befindet.
- Text im Overlay mit der Maus markieren kopiert ihn sofort in die Zwischenablage.
- Wie durchsichtig das Overlay ist, stellst du in der `.env` mit `OVERLAY_OPACITY` ein: 0 (nur Text, Standard) bis 1 (deckend).
- Das Overlay nimmt keinen Fokus weg; scrollen geht mit dem Trackpad, wenn die Maus darüber ist.
- Die App hat kein Dock-Icon und läuft im Hintergrund, bis du sie mit ⌃⌥Q beendest.

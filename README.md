# Dropline

A static, two-person browser voice-call app. One person opens a room and sends the generated invite link; the friend opens it and joins. Calls use WebRTC peer-to-peer audio, with PeerJS Cloud used only to introduce the two browsers.

## Run locally

Microphone access requires a secure origin, but browsers treat `localhost` as secure:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080> in Chrome or Edge.

## Deploy

This repository includes a GitHub Pages workflow. Push the `main` branch to GitHub, then set **Settings → Pages → Source** to **GitHub Actions**. The workflow publishes the static site.

## Browser notes

- Chrome or Edge is recommended on desktop.
- The app uses the browser's speech-recognition service when it is available. Depending on the browser, recognition audio may be processed by that browser vendor.
- If that service reports a network failure or is unavailable, the app automatically loads a roughly 39 MB Vosk English model and runs recognition locally in a Web Worker. The model is cached by the browser after the first download.
- Per-category and total counts are exchanged directly between the two browsers over the PeerJS data connection and reset for each call.
- Both people must leave the tab open for the duration of the call.
- Peer-to-peer WebRTC can be blocked by unusually restrictive school, office, hotel, or carrier networks because this static build has no dedicated TURN relay.
- The public PeerJS broker is convenient for a personal project, but a production service should run its own signaling service and TURN relay.

## Files

- `index.html` — all three UI states: lobby, waiting room, and active call
- `app.js` — PeerJS/WebRTC call logic, delayed outgoing audio processing, fallback speech engine, and synchronized leaderboard
- `profanity.js` — transcript matching and leaderboard categorization
- `styles.css` — responsive desktop/mobile interface
- `assets/` — the requested sound clips
- `.github/workflows/pages.yml` — GitHub Pages deployment

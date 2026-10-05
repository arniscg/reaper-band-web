# REAPER Band Remote

A web page for an iPad that controls the band's REAPER show project over the local network:
**Live** mode (setlist, Load / Start / Hold-to-stop) and **Practice** mode (songs or parts, pre-roll,
chosen players, tempo, Play last, Retry). Spec and mockups: [spec/](spec/).

- `src/` – the page (Preact + TypeScript + Vite), built to one self-contained `dist/index.html`
- `reaper/BandRemote_Bridge.lua` – background script in REAPER that runs requests from the page
- `reaper/functions/` – the REAPER logic; the page uploads these to the bridge automatically
- `reaper/BandRemote_TalkVoice.jsfx` – switches the vocal between song and talk paths
- `mock/` – fake REAPER for developing without REAPER; `tools/bridge.mjs` + `reaper/dev/` – test helpers

## REAPER setup (once)

1. **Web interface:** Preferences → Control/OSC/web → Add → *Web browser interface*, port e.g. `8080`.
2. **Bridge:** copy `reaper/BandRemote_Bridge.lua` to `<resource path>/Scripts/BandRemote/` and add this
   line to `<resource path>/Scripts/__startup.lua`, then restart REAPER:
   ```lua
   dofile(reaper.GetResourcePath() .. "/Scripts/BandRemote/BandRemote_Bridge.lua")
   ```
3. **Page:** `npm run build`, copy `dist/index.html` into `<resource path>/reaper_www_root/`,
   open `http://<reaper-pc-ip>:8080/index.html` on the iPad (Add to Home Screen; Auto-Lock off).
4. **Recording prompt off:** Preferences → Audio → Recording → don't prompt to save/delete new files.
5. **SWS extension** (recommended): lets REAPER itself stop each take at the song end, even if the
   bridge stops. Without it, takes are stopped by the bridge (Setup shows a note).
6. **Talk voice (optional):** copy the `.jsfx` into `<resource path>/Effects/`, put it on the vocal track,
   set that track to 4 channels; song FX sends use channels 1/2, a send from channels 3/4 feeds a
   "Vocal talk" bus.

## Project conventions

- Track tags in names: `[Live]` input tracks (one per player), `[Show]` show-only backing,
  `[Practice]` practice-only backing.
- Ruler lanes named **Songs** (one region per song) and **Parts** (regions for intro, verse…).
- Save the project, then on the page: Setup → **Mark as band project**, build the setlist,
  check Diagnostics.

## Development

Needs Node 22 (`nvm use 22`).

```sh
npm install
npm run mock                                    # fake REAPER on :8080 (switches: /mock/set?…)
npm run dev                                     # page on :5173, also reachable from the iPad
REAPER_URL=http://<reaper-pc-ip>:8080 npm run dev   # or against real REAPER
npm run build                                   # dist/index.html
```

Lua function changes need no copying: reload the page and it re-uploads them. Only a change to
`BandRemote_Bridge.lua` needs re-copying it and restarting REAPER.

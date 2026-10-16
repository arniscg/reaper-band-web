# REAPER Band Remote – Spec

Sep 29, 2026 · @Arnis · updated Oct 9, 2026 to match the built system

## Overview

A web page on an iPad controls the band's REAPER show project over the local network, in two modes: **Live** for performing and **Practice** for rehearsing songs or parts.

Goals:

- Live mode is foolproof: one big button, clear state, no way to start the wrong song or leave practice settings active.
- Every performance and every practice take is recorded and kept.
- One REAPER project for both modes, so the mix and effects never drift out of sync.
- Almost all logic lives in the web project; REAPER only needs a small bridge script and one JSFX installed once.

Non-goals for now: controlling from several devices at once (several open pages work side by side, but the design assumes one iPad in charge), per-musician monitor mixes, loop recording of parts.

## Project conventions

The page finds everything by name, so the project follows a few fixed conventions.

**Track tags.** The bridge matches whole bracketed tags exactly (case-insensitive, spaces inside the brackets ignored), never a word anywhere in the name.

| Tag | Goes on | Live mode | Practice mode | Example |
| --- | --- | --- | --- | --- |
| `[Live]` | Input tracks only, never folders; one track = one player | Armed, monitored, unmuted, all recorded | Armed and muted per player from the page (REAPER's own state); Record arms the chosen players and disarms the others | `Bass [Live]` |
| `[Show]` | Any track, folder or not | Unmuted | Muted | `Show backing [Show]` |
| `[Practice]` | Any track, folder or not | Muted | Unmuted | `Drums MIDI [Practice]` |

Mode switching mutes or unmutes only the tagged track itself; REAPER's own folder muting covers anything inside a tagged folder.

**Region lanes.** Ruler lanes are found by name, not position:

- **Songs** lane: one region per song, covering the whole song.
- **Parts** lane: regions labelling the parts of each song (intro, verse, chorus...). A part belongs to the song it starts in.

A new REAPER project already has two ruler lanes (the default lanes for regions and for markers); name them `Songs` and `Parts` in REAPER. Scripts can name lanes and move regions between them but can't create lanes, and a region's lane number and the lane's name use the same numbering (verified on REAPER 7.68). Markers are ignored, so the marker lane can double as the Parts lane.

**Song regions include the ring-out.** A song region ends only when the song has fully rung out: takes stop exactly at the region end.

**Automation at song start.** The value at the very start of each song region is that song's sound-check state. Loading a song moves the cursor there, and REAPER applies it while stopped. Fades or crescendos begin just after the start, never at it.

**Setlist.** Stored in the project's own saved data (project ext state), as an ordered list of song region GUIDs. Renaming, moving or renumbering regions doesn't break it.

**Recording folders.** Mode switching sets the project's record path: `Recordings/Live` or `Recordings/Practice`. File names are REAPER's defaults for now.

**Project marker.** A small key in the project's saved data identifies it as the band project; the page refuses to operate on any other project. It's set with **Mark as band project** in Setup, which needs the project to have been saved.

## Architecture

The page talks only to REAPER's built-in web server; a Lua bridge inside REAPER does everything the web API can't.

&#91;embedded content: architecture · page, web server, ext state, bridge\]

Simple reads go straight through the web server; anything else is a request in ext state that the bridge answers with the full API.

**Native web API (fast path).** Polled every \~200 ms in one chained request (`TRANSPORT;TRACK;GET/EXTSTATE/BandRemote/status`), giving play state, position, track flags (armed, muted, monitoring) and the bridge's status. Like REAPER's own `main.js`, the page sends only one request at a time; a request unanswered for 3 s is retried once, then the page shows "No REAPER". Requests average 30–55 ms on the band's network.

**Lua bridge (slow path).** One persistent background script, started automatically with REAPER (`__startup.lua`), running a `defer` loop. It is generic; all band logic lives in `reaper/functions/*.lua` in the web project.

- A request is base64url text split into chunks of at most 900 characters (`c.<id>.0`, `c.<id>.1`, …), because REAPER's web server keeps only about 1024 characters of a value; then `req.<slot>` = id, chunk count and total length, so a cut-off request is reported instead of run.
- The loop serves all 8 request slots every tick, runs each request in a protected call and writes the JSON answer to `r.<id>` (in 12,000-character chunks, deleted after a minute). While a call waits, the page checks its answer every 100 ms.
- Several pages may be open at once (a forgotten tab, a second device): each page uses its own random slot, and chunk and answer keys carry the request id, so they never overwrite each other. If two pages share a slot and a request is overwritten, the page writes it again after a second; the bridge remembers recent ids, so nothing runs twice.
- The bridge reports a protocol version; a page that needs a newer bridge says so ("Update bridge") instead of failing.
- Each function file is uploaded as-is, then the set is sealed with a hash. The page re-uploads when the bridge reports a different hash: after a REAPER restart or a changed file. The first upload takes about 10 s.
- A refusal (`error("message", 0)`) reaches the page as-is; any other error comes back with file, line and traceback. Errors never break the loop.
- Two functions are run by the loop itself every tick: `tick` (end of takes, watchdog) and `status` (the small table published with every poll, including change counters that tell the page when to reload).

**Talk-voice JSFX.** On the vocal track, which has no FX of its own and no master send; its sound comes from sends to FX buses with per-song automated levels. The track runs 4 channels: the JSFX puts the mic on channels 1/2 while playing or recording (the existing song sends) and on channels 3/4 while stopped or paused (one send to a "Vocal talk" bus with its own compression and EQ). It's an equal-power crossfade of about 150 ms, before the buses, so reverb tails ring out. Mode slider: Auto, Always song, Always talk. It follows REAPER's transport, so it works even if the page or bridge is down. Verified on REAPER with a test tone; how it sounds is still to be checked by ear.

**Development workflow.** One frontend project (Preact + TypeScript + Vite, plain CSS modules, system font), served during development by Vite, which proxies `/_/*` to REAPER (`REAPER_URL`) or to a mock REAPER (`npm run mock`) that speaks the same web API and bridge protocol. For shows, the built single-file page is copied into REAPER's `reaper_www_root`. `tools/bridge.mjs` uploads and calls a Lua file from the command line; dev-only scripts live in `reaper/dev/`. The Lua bridge and JSFX change rarely.

**Security.** Runs only on the band's closed network; a web interface password is recommended. The bridge can execute code by design.

## Live mode

Live mode is one big three-state button plus the setlist; everything shown comes from REAPER's reported state, never from the button press.

**Screen.**

- The whole setlist in its fixed order: the next, loaded or recording song highlighted. Tapping a song queues it.
- One big button (below).
- While recording: current song and part, elapsed and remaining time, a part bar, a clear REC indicator.
- Between songs: the next song, and which song's sound the instruments still have.
- Mode shown in its own color; connection status and the talk/song voice always visible.
- After each take, a short message says how it ended (e.g. "Northern Lights saved · REAPER stopped at the end").
- No setlist editing, tempo, or other controls.

**Big button.**

| State | Button shows | A tap does |
| --- | --- | --- |
| Song ended / idle | **Load: \<queued song>** | Moves the cursor to that song's start; its sound-check state applies |
| Song loaded | **Start recording: \<song>** | Runs the Start function: pre-flight checks, then recording |
| Recording | **Hold to stop** (\~1 s) | Stops and saves |

"Loaded" is derived from REAPER: stopped with the cursor at the queued song's start. Queuing a different song returns the button to Load. Song selection is locked while recording.

**Start function (one bridge call).**

1. Pre-flight checks (see Safety). All refusals come first; on any refusal nothing changes and the message is shown in big letters.
2. Fixes: all `[Live]` tracks armed, unmuted, record input on, monitoring on; playrate 1.0; `[Show]`/`[Practice]` mutes; record mode normal; repeat off.
3. Time selection and loop points = the song region; REAPER's stop points set at its end (see Song end). There is no tail: each song region must include the song's full ring-out.
4. Move to the song start and record.
5. Return the armed tracks. The page shows "recording" from the poll and warns if REAPER hasn't confirmed recording with those tracks armed within 2 s; the bridge also reports if REAPER never starts within 3 s.

**Song end.** Three layers stop a take at the end of its time selection:

1. **REAPER itself**, at an SWS action marker `!40667` ("Stop (save all recorded media)") that the bridge places at the stop point before each take and removes afterwards. This works during recording and playback, even if the bridge is gone. The bridge keeps the marker's GUID, so a marker left behind by a crash is removed at the next start. REAPER's `PLAYBACK_STOP` setting is also set, but REAPER honours it only for playback. Without SWS, Setup shows a note and the next layer does the job.
2. **The bridge**, 0.5 s after the end if REAPER didn't stop.
3. **The watchdog**, 2 s after the end (or far past the expected duration): stops again and shows a warning.

Then the bridge:

- Saves the project (the stop saved the media).
- Puts the cursor at the song end, so instruments keep the ended song's sound (room for an extended ending).
- Queues the next setlist song after the one just played, without loading it.
- Reports how the take ended: REAPER at the end, the bridge, the watchdog, or the Stop button.

The vocal switches to the talk voice as soon as the transport stops.

**Manual stop.** Hold-to-stop uses the "Stop (save all recorded media)" action; afterwards the same as song end.

**Tracks stay armed all show.** Arming is what enables monitoring, so `[Live]` tracks are never disarmed in Live mode. Instruments and vocals stay audible between songs.

## Practice mode

Practice mode keeps everything from Live mode and adds part selection, pre-roll, player choice, tempo and Play.

**Entering and leaving.** "Enter Practice" and "Enter Live" are single bridge calls that apply the full configuration for that mode (refused while recording):

| Setting | Live | Practice |
| --- | --- | --- |
| `[Show]` tracks | Unmuted | Muted |
| `[Practice]` tracks | Muted | Unmuted |
| Master playrate | 1.0 | Chosen tempo % |
| Preserve pitch on playrate change | Unchanged | On |
| Record mode | Normal | Time-selection auto-punch |
| `[Live]` tracks | All armed, unmuted | Unchanged; armed and muted per player from the page |
| Record path | `Recordings/Live` | `Recordings/Practice` |

The current mode, the players chosen for recording and the tempo are saved in the project; arm and mute are REAPER's own track state. All survive a restart.

**Screen.** Song list (setlist first, then other songs), then the parts of the selected song ("Whole song" first). Tapping a part selects it; tapping a second part extends the selection to a range of parts (e.g. Verse 2 → Outro, for "from here to the end"); tapping again after a range starts a new single selection. The selection is remembered by the page. Then:

- Players to record: chips for each `[Live]` track, default all.
- Per player, an **Armed** toggle (live input on/off) and a **Mute** toggle (plain track mute), plus "Disarm all / Arm all" and "Mute all / Unmute all". They show REAPER's own track flags, so changes made in REAPER show up too. Disarming everyone is the quick way to cut the live sound when it gets too loud; it also decides whether Play means play-along (armed) or listen-only (disarmed). Muting isolates takes, e.g. to practice alone with only the backing tracks.
- Pre-roll: 0–4 bars, remembered by the page; shown as "From start" where it doesn't apply.
- Tempo: 50–120% in 5% steps, plus reset to 100%.
- Buttons: Record, Play, Stop.
- Status line: REC / PLAYING / STOPPED, current song and part, time.

**Record.** One bridge call, the same pre-flight idea as Live minus the mode-specific checks:

1. Chosen players armed and recording; all other `[Live]` tracks disarmed (and they stay disarmed afterwards), so their existing takes play back as a backing band. Mutes are left as they are.
2. Time selection = the part, the range of parts, or the whole song.
3. Start position = the first part's start minus the pre-roll bars, converted with the tempo map, never before the song start. A whole-song take, or one starting with the song's first part, starts exactly at the start: no pre-roll, no count-in.
4. Record. Auto-punch records only inside the selection; REAPER stops at its end (the same three layers as Live).

**Play.** One bridge call: play the selected song or part with the same scope as Record (pre-roll; end of the part, range or song) at the current tempo. Nothing is armed, disarmed or muted: armed players play along, disarmed players just hear their takes. The newest recording is the active take, so it's what plays. Nothing is remembered between takes: the selection stays on screen, so recording again is just Record.

After a stop, REAPER returns the cursor to where the take started, so Play or Record repeats the same spot.

**Tempo.** Uses REAPER's master playrate with preserve pitch, never the project tempo. It's one number, reset to 1.0 by Enter Live and by Live Start. `[Practice]` MIDI drums follow any rate cleanly; rendered backing tracks are stretched and fine for practice in roughly the 70–110% range.

**After each take.** Same as Live: media and project saved, and a message says how it ended.

## Setup screen and setlist

The setup screen is where anything that changes structure happens, so Live mode never has to offer it. Changes are locked while recording.

- **Mode switch:** Enter Live / Enter Practice, with the resulting configuration shown.
- **Setlist editor:** all songs from the Songs lane on one side, the setlist on the other; add, remove and drag to reorder. Saved to the project on each change (the project is saved too). A song not in the setlist can be loaded from here.
- **Settings:** default pre-roll, expected number of `[Live]` tracks (defaults to the number found), minimum free disk space.
- **Diagnostics:** bridge status and session ID, web request timing (average, slowest, timeouts), last event, uploaded functions, REAPER version, project name and marker (with **Mark as band project**), whether REAPER stops takes itself (SWS), REAPER actions not found, tags found, lanes as REAPER reports them, record path, free disk.

In Live mode, the next song after a song ends is the one following it in the setlist, including after a song played out of order.

## Safety

Start re-asserts everything it depends on, so no leftover setting can reach a show.

**Pre-flight checks (Live Start).** All refusals are checked before anything changes; then the rest is fixed silently:

| Check | If wrong |
| --- | --- |
| Correct project (marker present), saved, in Live mode | Refuse |
| Not already recording | Refuse |
| Queued song exists in the Songs lane | Refuse |
| Number of `[Live]` tracks equals the setting | Refuse |
| Needed REAPER actions found (by name; ids verified) | Refuse |
| Free disk space on the record path above the minimum | Refuse |
| All `[Live]` tracks armed, unmuted, record input on, monitoring on | Fix |
| Master playrate 1.0 | Fix |
| `[Show]` unmuted, `[Practice]` muted | Fix |
| Record mode normal, repeat off | Fix |
| "Stop at end of loop if repeat is disabled" on (harmless; REAPER ignores it while recording) | Fix |
| No track or the global override in a writing automation mode | Fix (set to Read / clear) |
| Record path `Recordings/Live` | Fix |

Practice Record runs the same checks minus the mode-specific ones, and also refuses with no players chosen.

**Watchdog.** Described under Song end. The bridge also drops a take REAPER never started within 3 s and says so.

**No blocking dialogs.** A modal dialog on the laptop stops remote commands. The recording-save prompt is turned off in preferences, and every stop uses the save-all action. A blocked REAPER shows on the page as "No REAPER".

**Saving.** The project is saved after every take, so a crash never loses the link to recorded audio. It is never saved while recording, and never into a Save As dialog.

**Errors on screen.** Refusals and failures appear in big letters, with any Lua traceback small below. Errors in the bridge loop, watchdog stops, a dead bridge and lost connection are banners on every screen.

**State from REAPER only.** The page never assumes an action worked; it displays what the poll reports and warns when the expected state doesn't arrive.

**Accidental taps.** Hold-to-stop, separate Load and Start presses, song selection locked while recording.

## Bridge functions and polling

Everything not covered by the native web API is a bridge function, one file each in `reaper/functions/`.

| Function | Does |
| --- | --- |
| `getSnapshot` | Everything the page caches, in one call: project info, songs, tracks, setlist, settings |
| `getProjectInfo` | Project name, saved, marker, mode, REAPER version, record path, free disk, lanes, missing actions, stop-marker status |
| `getSongMap` | Songs and parts by lane name, with GUID, number, name, start, end, color |
| `getTracks` | Tagged tracks |
| `getSetlist` / `setSetlist` | Read and save the setlist |
| `getSettings` / `setSettings` | Read and save the settings |
| `getPracticeOptions` / `setPracticeOptions` | Players chosen for recording, tempo |
| `setPlayerState` | Arm/disarm and mute/unmute players (Practice only) |
| `markProject` | Mark the project as the band project |
| `queueSong` / `loadSong` | Queue a song; queue it and move the cursor to its start |
| `startLive` | Pre-flight, then record the song |
| `recordPractice` | Record a song, part or range of parts with pre-roll and chosen players |
| `play` | Play a song, part or range of parts with the same scope as Record |
| `stop` | Stop; save-all while recording |
| `setMode` | Apply the Live or Practice configuration |
| `ping` | Latency test |
| `tick`, `status` | Run by the bridge loop every tick (see Architecture) |
| `util` | Shared helpers for the other functions |

**Polling plan.**

- **Every \~200 ms, one request:** `TRANSPORT;TRACK;GET/EXTSTATE/BandRemote/status`.
- **On page load or when a status counter changes:** one `getSnapshot` call (at most every 1.5 s, not while recording).
- **On user action:** the relevant bridge call.

The page derives the current song and part from the transport position and the cached song map, so no bridge call is needed while playing.

## Venue and device setup

The band brings its own closed network, so the setup is the same at every venue.

- **Network:** own router; the PC wired, the iPad on Wi-Fi, only audio-setup devices allowed.
- **Fixed address:** a DHCP reservation for the PC in the router, so the iPad's bookmark always works. (During testing the PC's address changed between sessions.)
- **REAPER:** latest version, SWS installed; web interface enabled, serving the built page; bridge starts with REAPER; recording-save prompt off.
- **iPad:** Auto-Lock set to Never for the show (the browser's wake-lock needs HTTPS, which REAPER's web server doesn't offer); page added to the Home Screen so it opens full-screen.
- **Before each show:** open the setup screen, check diagnostics (bridge running, tags and lanes found, stop marker available, disk space), Enter Live.

## Early tests and milestones

Results from REAPER 7.68 with SWS 2.14, on a test project without an audio interface.

- [x] **Bridge round-trip:** works; web requests average 30–55 ms, the slowest about 2 s (while REAPER saved). Not checked: whether a non-deferred script action returns its result within one chained request (not needed).
- [x] **Request size:** REAPER's web server keeps only about 1024 characters of a value, so requests go in 900-character chunks.
- [ ] **Recording at a changed playrate:** record at 80%; check the take is in sync when played at 80%. Needs real audio.
- [x] **Stop-at-end option:** the action is found by name, but REAPER honours it (and `PLAYBACK_STOP`) only for playback. Recordings are stopped by the SWS stop marker instead.
- [ ] **Automation while stopped:** confirm moving the cursor to a song start applies send and volume automation without playing.

**Milestones.**

1. Bridge + test page: round-trip, `getSongMap`, `getProjectInfo`. **Done.**
2. Live mode: setlist view, Load / Start / Hold-to-stop, song-end handling, pre-flight checks, watchdog. **Done**, tested against REAPER.
3. Talk-voice JSFX on the vocal chain. **Done**, switching verified with a test tone.
4. Setup screen: setlist editor, mode switch, diagnostics. **Done.**
5. Practice mode: parts, pre-roll, players, Record / Play / Stop, tempo. **Done**, tested against REAPER.
6. Rehearsal run-through on the venue setup, then first show.

**Open items.** Recorded audio and the talk-voice crossfade checked by ear; the page on the real iPad (Safari); the two untested early tests above; recorded file names (REAPER defaults for now).

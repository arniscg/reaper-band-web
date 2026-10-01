# REAPER Band Remote – Spec

Sep 29, 2026 · @Arnis

## Overview

A web page on an iPad controls the band's REAPER show project over the local network, in two modes: **Live** for performing and **Practice** for rehearsing songs or parts.

Goals:

- Live mode is foolproof: one big button, clear state, no way to start the wrong song or leave practice settings active.
- Every performance and every practice take is recorded and kept.
- One REAPER project for both modes, so the mix and effects never drift out of sync.
- Almost all logic lives in the web project; REAPER only needs a small bridge script and one JSFX installed once.

Non-goals for now: multiple controlling devices at once, per-musician monitor mixes, loop recording of parts.

## Project conventions

The page finds everything by name, so the project follows a few fixed conventions.

**Track tags.** The bridge matches whole bracketed tags exactly (case-insensitive), never a word anywhere in the name. A tag on a folder track applies to everything inside it.

| Tag | Meaning | Live mode | Practice mode | Example |
| --- | --- | --- | --- | --- |
| `[Live]` | Instrument and vocal input tracks | Armed, monitored, all recorded | Armed, monitored; chosen players recorded, others monitor-only | `Bass [Live]` |
| `[Show]` | Show-only backing | Unmuted | Muted | `Drums rendered [Show]` |
| `[Practice]` | Practice-only backing | Muted | Unmuted | `Drums MIDI [Practice]` |

**Region lanes.** Ruler lanes are found by name, not position:

- **Songs** lane: one region per song, covering the whole song.
- **Parts** lane: sub-regions labelling the parts of each song (intro, verse, chorus...).

**Automation at song start.** The value at the very start of each song region is that song's sound-check state. Selecting a song moves the cursor there, and REAPER applies it while stopped. Fades or crescendos begin just after the start, never at it.

**Setlist.** Stored in the project's own saved data (project ext state), as an ordered list of song region IDs. Renaming or moving regions doesn't break it.

**Recording folders.** Mode switching sets the project's record path: `Recordings/Live` or `Recordings/Practice`. Filenames use wildcards for song, part (practice only), date and track.

**Project marker.** A small key in the project's saved data identifies it as the band project; the page refuses to operate on any other project.

## Architecture

The page talks only to REAPER's built-in web server; a Lua bridge inside REAPER does everything the web API can't.

&#91;embedded content: architecture · page, web server, ext state, bridge\]

Simple reads and writes go straight through the web server; anything else is a request in ext state that the bridge answers with the full API.

**Native web API (fast path).** Polled every \~200 ms in one chained request (`TRANSPORT;TRACK`), giving play state, position and track flags (armed, muted). Used as-is for anything it covers.

**Lua bridge (slow path).** One persistent background script, started automatically with REAPER (`__startup.lua`), running a `defer` loop:

- The page writes a request (ID + function name + arguments) into global ext state via `SET/EXTSTATE`; the loop picks it up within a tick, runs it and writes the result with the same ID.
- The page reads results with `GET/EXTSTATE`, in the same polled request as the transport data.
- Functions live in the web project and are uploaded to the bridge once per session (define, then call by name). The bridge exposes a session ID so the page notices a restart and re-uploads.
- Every function runs in a protected call; errors come back as messages, never break the loop.
- The same loop runs the watchdog and change counters (setlist, regions, mode).

**Talk-voice JSFX.** A small JSFX effect on the vocal chain reads REAPER's play state and crossfades between two paths: song vocal FX while playing or recording, a clean talk chain while stopped. It works even if the page or bridge is down.

**Development workflow.** One frontend project, served during development by a local dev server (e.g. Vite) that proxies `/_/*` to REAPER, so the browser sees one origin. For shows, the built page is copied or symlinked into REAPER's `reaper_www_root`. The Lua bridge and JSFX change rarely.

**Security.** Web interface password set; runs only on the band's closed network. The bridge can execute code by design.

## Live mode

Live mode is one big three-state button plus the setlist; everything shown comes from REAPER's reported state, never from the button press.

**Screen.**

- The whole setlist in its fixed order: played songs marked done, the queued song highlighted. Tapping a song queues it.
- One big button (below).
- Current song and part names, elapsed and remaining time, a clear recording indicator.
- Mode shown in its own color scheme; connection status always visible.
- No setlist editing, tempo, or other controls.

**Big button.**

| State | Button shows | A tap does |
| --- | --- | --- |
| Song ended / idle | **Load: \<queued song>** | Moves the cursor to that song's start; its sound-check state applies |
| Song loaded | **Start: \<song>** | Runs the Start function: pre-flight checks, then recording |
| Recording | **Hold to stop** (\~1 s) | Stops and saves |

Queuing a different song while loaded returns the button to Load. Song selection is locked while recording.

**Start function (one bridge call).**

1. Pre-flight checks (see Safety). Any failure: nothing changes, the error is shown in big letters.
2. Set all `[Live]` tracks to record mode (they're already armed).
3. Set time selection and loop points to the song region plus a configurable tail (default 2 s); repeat off; record mode normal.
4. Move to the song start and start recording.
5. Return OK. The page shows "recording" only after the poll confirms it with the expected tracks armed, and warns if that doesn't arrive within 2 s.

**Song end.** REAPER stops by itself at the end of the time selection. Then the bridge:

- Saves the recorded media and the project.
- Puts the cursor at the song end, so instruments keep the ended song's sound (room for an extended ending).
- Queues the next setlist song after the one just played, without loading it.

The vocal switches to the talk voice as soon as the transport stops.

**Manual stop.** Hold-to-stop uses the "stop, save all recorded media" action; afterwards the same as song end.

**Tracks stay armed all show.** Arming is what enables monitoring, so `[Live]` tracks are never disarmed in Live mode. Instruments and vocals stay audible between songs.

## Practice mode

Practice mode keeps everything from Live mode and adds part selection, pre-roll, player choice, tempo, Play last and Retry.

**Entering and leaving.** "Enter Practice" and "Enter Live" are single bridge calls that apply the full configuration for that mode:

| Setting | Live | Practice |
| --- | --- | --- |
| `[Show]` tracks | Unmuted | Muted |
| `[Practice]` tracks | Muted | Unmuted |
| Master playrate | 1.0 | Chosen tempo % |
| Preserve pitch on playrate change | Any | On |
| Record mode | Normal | Time-selection auto-punch |
| Recorded players | All `[Live]` tracks | Chosen subset |
| Record path | `Recordings/Live` | `Recordings/Practice` |

The current mode is saved in the project and survives a restart.

**Screen.** Song list (setlist first, then other songs), then the parts of the selected song, and:

- Players to record: chips for each `[Live]` track, default all. Each player also has a playback mute for their recorded takes, plus a global "Mute all players" toggle, e.g. to practice alone with only the backing tracks, or to isolate one take.
- Pre-roll: 0–4 bars, remembered by the page.
- Tempo: 60–110% in 5% steps, plus reset to 100%.
- Buttons: Record, Play last, Retry, Stop.
- Status: mode, playrate, position, recording indicator.

**Record.** One bridge call, same pre-flight idea as Live:

1. Chosen players' tracks set to record; other `[Live]` tracks disarmed, so their existing takes play back as a backing band (their live inputs are silent, since those players aren't practicing).
2. Time selection = the song or part (plus tail for a whole song).
3. Start position = part start minus the pre-roll bars, converted with the tempo map. For the first part of a song with no room before it, use REAPER's metronome count-in instead.
4. Record. Auto-punch records only inside the part; REAPER stops at its end.
5. The bridge remembers the last scope (song or part, range, pre-roll, players) for Play last and Retry.

**Play last.** One bridge call: turn off input monitoring on the recorded tracks, play from the same start position through the same range, then restore monitoring when it stops. The player mutes apply here too, so you can hear only your own take. The newest recording is the active take, so it's what plays.

**Retry.** Record again with the remembered scope and settings.

**Tempo.** Uses REAPER's master playrate with preserve pitch, never the project tempo. It's one number, reset to 1.0 by Enter Live and by Live Start. `[Practice]` MIDI drums follow any rate cleanly; rendered backing tracks are stretched and fine for practice in roughly the 70–110% range.

**After each take.** Same as Live: media and project saved.

## Setup screen and setlist

The setup screen is where anything that changes structure happens, so Live mode never has to offer it.

- **Setlist editor:** all songs from the Songs lane on one side, the setlist on the other; add, remove and drag to reorder. Saved to the project on each change (the project is saved too).
- **Mode switch:** Enter Live / Enter Practice, with the resulting configuration shown.
- **Settings:** song-end tail (seconds), default pre-roll, expected number of `[Live]` tracks, minimum free disk space.
- **Diagnostics:** bridge status and session ID, REAPER version, project name, tags found (which tracks match `[Live]`, `[Show]`, `[Practice]`), lanes found.

In Live mode, the next song after a song ends is the one following it in the setlist, including after a song played out of order. A song not in the setlist can still be loaded from the setup screen.

## Safety

Start re-asserts everything it depends on, so no leftover setting can reach a show.

**Pre-flight checks (Live Start).** Fixed silently where possible, otherwise Start refuses with a clear message:

| Check | If wrong |
| --- | --- |
| Correct project (marker present) and it's the active tab | Refuse |
| Not already recording | Refuse |
| Queued song exists in the Songs lane | Refuse |
| Expected number of `[Live]` tracks found and armed | Arm them; refuse if count differs |
| All `[Live]` tracks armed, unmuted and in record mode | Fix |
| Master playrate 1.0 | Fix |
| `[Show]` unmuted, `[Practice]` muted | Fix |
| Record mode normal, repeat off | Fix |
| "Stop at end of loop if repeat is disabled" option on | Fix, or refuse if not settable |
| All tracks in automation Read mode (no fader writing into send automation) | Fix |
| Free disk space on the record path above the minimum | Refuse |

Practice Record runs the same checks minus the mode-specific ones.

**Watchdog.** The bridge loop checks each tick: if still recording more than 2 s past the time selection end, it stops with "save all recorded media" and flags it in the UI.

**No blocking dialogs.** A modal dialog on the laptop stops remote commands. The recording-save prompt is turned off in preferences, and every stop uses the save-all action anyway.

**Saving.** The project is saved after every recording stops, so a crash never loses the link to recorded audio.

**State from REAPER only.** The page never assumes an action worked; it displays what the poll reports and warns when the expected state doesn't arrive.

**Accidental taps.** Hold-to-stop, separate Load and Start presses, song selection locked while recording.

## Bridge functions and polling

About a dozen bridge functions cover both modes; everything else is native web API.

| Function | Does | Key REAPER API |
| --- | --- | --- |
| `getProjectInfo` | Project name, marker check, mode, REAPER version, change counters | `EnumProjects`, `GetProjExtState`, `GetAppVersion` |
| `getSongMap` | Songs and parts with lane, name, ID, start, end, color | `GetRegionOrMarker`, `GetRegionOrMarkerInfo_Value` (`I_LANENUMBER`), `GetSetProjectInfo_String` (lane names) |
| `getTracks` | Tagged tracks and their state | `GetTrack`, `GetSetMediaTrackInfo_String` |
| `getSetlist` / `setSetlist` | Read and save the setlist | `GetProjExtState` / `SetProjExtState` |
| `loadSong` | Move cursor to song start | `SetEditCurPos` |
| `startLive` | Pre-flight, then record the song | `GetSet_LoopTimeRange2`, `SetMediaTrackInfo_Value` (`I_RECMODE`), `CSurf_OnRecord` |
| `stop` | Stop, save media and project, cursor to song end | Save-all stop action, `Main_SaveProject` |
| `setMode` | Apply Live or Practice configuration | Track mute, `CSurf_OnPlayRateChange`, record path via `GetSetProjectInfo_String` |
| `recordPractice` / `retry` | Record a song or part with pre-roll and chosen players | `TimeMap2_beatsToTime`, `I_RECMODE` |
| `playLast` | Replay the last take with monitoring off | `I_RECMON`, play action |

**Polling plan.**

- **Every \~200 ms, one request:** `TRANSPORT;TRACK;GET/EXTSTATE/bridge/resp;GET/EXTSTATE/bridge/counters`. Transport and track flags come native; bridge responses and change counters ride along at no extra cost.
- **On page load or when a counter changes:** `getProjectInfo`, `getSongMap`, `getTracks`, `getSetlist`.
- **On user action:** the relevant bridge call.

The page derives the current song and part from the transport position and the cached song map, so no bridge call is needed while playing.

## Venue and device setup

The band brings its own closed network, so the setup is the same at every venue.

- **Network:** own router; the PC wired, the iPad on Wi-Fi, only audio-setup devices allowed.
- **Fixed address:** a DHCP reservation for the PC in the router, so the iPad's bookmark always works.
- **REAPER:** latest version; web interface enabled with a password, serving the built page; bridge starts with REAPER.
- **iPad:** Auto-Lock set to Never for the show (the browser's wake-lock needs HTTPS, which REAPER's web server doesn't offer); page added to the Home Screen so it opens full-screen.
- **Before each show:** open the setup screen, check diagnostics (bridge running, tags and lanes found, disk space), Enter Live.

## Early tests and milestones

Five quick tests in REAPER decide details of the design and should run before building on them.

- [ ] **Bridge round-trip:** a background `defer` script answers an ext-state request; measure latency from the page. Also check whether a non-deferred script action returns its result within one chained request.
- [ ] **Request size:** find the practical URL length limit for code sent to the bridge.
- [ ] **Recording at a changed playrate:** record at 80%; check the take is in sync when played at 80%.
- [ ] **Stop-at-end option:** confirm the action name, and that a script can read and set its state.
- [ ] **Automation while stopped:** confirm moving the cursor to a song start applies send and volume automation without playing.

**Milestones.**

1. Bridge + test page: round-trip, `getSongMap`, `getProjectInfo`.
2. Live mode: setlist view, Load / Start / Hold-to-stop, song-end handling, pre-flight checks, watchdog.
3. Talk-voice JSFX on the vocal chain.
4. Setup screen: setlist editor, mode switch, diagnostics.
5. Practice mode: parts, pre-roll, players, Record / Play last / Retry, tempo.
6. Rehearsal run-through on the venue setup, then first show.

**Open items.** Song-end tail default (2 s assumed); tempo step range (60–110% assumed).

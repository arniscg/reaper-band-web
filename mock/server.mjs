// Mock REAPER for developing the page without REAPER.
//
// Speaks REAPER's web interface API on /_/ (TRANSPORT, TRACK, EXTSTATE, ...)
// and plays the part of the Lua bridge: it answers the same ext-state
// request protocol (see reaper/BandRemote_Bridge.lua). It does NOT run the
// uploaded Lua; each function name is served by a JavaScript stand-in below.
//
// Run: npm run mock   (then npm run dev in another terminal)
// Fault switches: http://localhost:8080/mock/set?bridge=0|1&stopAtEnd=0|1&diskMB=N&marker=0|1&hang=0|1
//   hang=1 leaves web API requests unanswered, like REAPER blocked by a modal dialog.
//   failFn=<name> makes that function fail like a Lua bug (with a traceback); failFn= clears it.
//   loopErr=1 reports an error from the bridge loop (tick/status); loopErr=0 clears it.
//   slowOnce=1 answers the next web API request after 3.5 s (past the page's timeout).
//   delayMs=N delays every web API answer by N ms.
//   stopAtEnd=0 REAPER doesn't stop at the end: the bridge stops 0.5 s later.
//   bridgeStop=0 the bridge's own stop fails too: the watchdog stops at +2 s.
//   sws=0 SWS not installed: Setup shows the stop-marker note.
// Inspect state:  http://localhost:8080/mock/state

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECTION = 'BandRemote';
const RESP_CHUNK = 12000;
const MAX_VALUE = 1023; // REAPER's web server cuts SET values to ~1024 chars
const TICK_MS = 33;

// ---------------------------------------------------------------------------
// Fake project
// ---------------------------------------------------------------------------

const guid = () => `{${randomUUID().toUpperCase()}}`;

const tracks = [
  { name: 'Show backing [Show]', depth: 1 },
  { name: 'Drums rendered', depth: 0 },
  { name: 'Keys rendered', depth: -1 },
  { name: 'Drums MIDI [Practice]', depth: 0 },
  { name: 'Bass [Live]', depth: 0 },
  { name: 'Vocals [Live]', depth: 0 },
  { name: 'Guitar 1 [Live]', depth: 0 },
  { name: 'Guitar 2 [Live]', depth: 0 },
].map((t) => ({ ...t, guid: guid(), mute: false, arm: false, mon: 0, recmon: 1 }));

const tagsOf = (name) => [...name.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase());
const hasTag = (t, tag) => tagsOf(t.name).includes(tag);
const liveTracks = () => tracks.filter((t) => hasTag(t, 'live'));

const SONG_NAMES = ['Northern Lights', 'Paper Boats', 'Slow Burn', 'Hold the Line', 'Glasshouse',
  'Midnight Radio', 'Undertow', 'Last Train Home', 'Wildfire', 'Salt & Iron'];
const PART_SHAPE = [['Intro', 1], ['Verse 1', 2], ['Chorus 1', 2], ['Verse 2', 2], ['Chorus 2', 2], ['Bridge', 1], ['Outro', 1]];

const songs = [];
{
  let t = 8;
  SONG_NAMES.forEach((name, i) => {
    const bars = 48 + ((i * 7) % 5) * 8; // 48..80 bars at 120 bpm 4/4 = 2 s per bar
    const len = bars * 2;
    const song = { id: guid(), num: i + 1, name, start: t, end: t + len, color: null, parts: [] };
    const units = PART_SHAPE.reduce((a, [, u]) => a + u, 0);
    let p = t;
    for (const [pname, u] of PART_SHAPE) {
      const plen = Math.round((len * u) / units / 2) * 2;
      const pend = pname === 'Outro' ? song.end : p + plen;
      song.parts.push({ id: guid(), name: pname, start: p, end: pend });
      p = pend;
    }
    songs.push(song);
    t = song.end + 12;
  });
}
const BAR_SECONDS = 2;

const proj = {
  name: 'Band Show 2026.rpp',
  marker: true,
  mode: 'live',
  setlist: songs.slice(0, 8).map((s) => s.id),
  settings: { tail: 2, prerollDefault: 2, liveCount: 4, minDiskGB: 5 },
  recordPath: 'Recordings/Live',
  practice: { players: liveTracks().map((t) => t.guid), mutes: [], rate: 1 },
  queued: songs[0].id,
  lastTake: null,
};

const transport = { state: 0, pos: songs[0].start - 4, rate: 1, repeat: false, sel: null };
const mock = { bridge: true, stopAtEnd: true, diskMB: 120_000, hang: false, failFn: '', loopErr: false, slowOnce: false, delayMs: 0, bridgeStop: true, sws: true };

// ---------------------------------------------------------------------------
// Transport simulation
// ---------------------------------------------------------------------------

let lastAdvance = Date.now();
function advance() {
  const now = Date.now();
  const dt = (now - lastAdvance) / 1000;
  lastAdvance = now;
  if (transport.state === 1 || transport.state === 5) {
    transport.pos += dt * transport.rate;
    // REAPER's "stop at end of loop if repeat is disabled" (switchable to test the watchdog)
    if (mock.stopAtEnd && transport.sel && transport.pos >= transport.sel.end) {
      transport.pos = transport.sel.end;
      transport.state = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Ext state
// ---------------------------------------------------------------------------

const ext = new Map();
const extKey = (s, k) => `${s}\u0000${k}`;
const getExt = (s, k) => ext.get(extKey(s, k)) ?? '';
const setExt = (s, k, v) => ext.set(extKey(s, k), v);
const delExt = (s, k) => ext.delete(extKey(s, k));
const escapeExt = (v) => v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');

// ---------------------------------------------------------------------------
// Bridge simulation
// ---------------------------------------------------------------------------

const bridge = {
  session: Math.random().toString(16).slice(2, 10),
  defs: new Set(),
  lib: null,
  counters: { songs: 1, tracks: 1, setlist: 1, settings: 1, project: 1 },
  active: null,
  watchdog: null,
  event: null,
  seq: 0,
  lastStatus: '',
};

const bump = (...names) => names.forEach((n) => bridge.counters[n]++);
const notice = (message) => ({ seq: ++bridge.seq, message });
const isRecording = () => transport.state === 5 || transport.state === 6;
const songById = (id) => songs.find((s) => s.id === id);
const refuse = (msg) => { throw new Error(msg); };

function applyMode(mode) {
  const practice = mode === 'practice';
  for (const t of tracks) {
    if (hasTag(t, 'show')) t.mute = practice;
    if (hasTag(t, 'practice')) t.mute = !practice;
  }
  if (practice) {
    applyPracticeTracks();
    transport.rate = proj.practice.rate;
    proj.recordPath = 'Recordings/Practice';
  } else {
    for (const t of liveTracks()) { t.arm = true; t.mute = false; t.recmon = 1; }
    transport.rate = 1;
    proj.recordPath = 'Recordings/Live';
  }
  proj.mode = mode;
  bump('tracks', 'project');
}

function applyPracticeTracks() {
  for (const t of liveTracks()) {
    t.arm = proj.practice.players.includes(t.guid);
    t.mute = proj.practice.mutes.includes(t.guid);
  }
}

function checkCommon() {
  if (!proj.marker) refuse('This is not the band project');
  if (isRecording()) refuse('Already recording');
  if (mock.diskMB < proj.settings.minDiskGB * 1024) refuse(`Low disk space: ${(mock.diskMB / 1024).toFixed(1)} GB free`);
}

function startTake(kind, song, part, prerollBars, record) {
  const range = part ? { start: part.start, end: part.end } : { start: song.start, end: song.end + proj.settings.tail };
  let start = range.start;
  if (part && part.start > song.start && prerollBars > 0) start = Math.max(song.start, part.start - prerollBars * BAR_SECONDS);
  transport.sel = range;
  transport.pos = start;
  transport.state = record ? 5 : 1;
  bridge.active = { kind, songId: song.id, partId: part?.id ?? null, stopAt: range.end };
  return { start, range };
}

const fns = {
  ping: () => ({ t: Date.now() / 1000 }),

  getProjectInfo: () => ({
    name: proj.name, saved: true, marker: proj.marker, mode: proj.mode, reaperVersion: '7.50/mock',
    recordPath: proj.recordPath, freeDiskMB: mock.diskMB, lanes: { songs: true, parts: true }, missingActions: [], stopMarker: mock.sws ? { ok: true } : { ok: false, problem: 'SWS extension not installed' },
  }),

  getSongMap: () => ({ songs }),

  getSnapshot: () => ({
    project: nested('getProjectInfo'), songs: nested('getSongMap').songs, tracks: nested('getTracks').tracks,
    setlist: nested('getSetlist').ids, settings: nested('getSettings'),
  }),

  getTracks: () => ({
    tracks: tracks.map((t, i) => ({
      guid: t.guid, index: i + 1, name: t.name,
      label: t.name.replace(/\s*\[[^\]]*\]/g, '').trim(), tags: tagsOf(t.name).filter((x) => ['live', 'show', 'practice'].includes(x)),
      folder: t.depth === 1,
    })),
  }),

  getSetlist: () => ({ ids: proj.setlist }),
  setSetlist: ({ ids }) => { proj.setlist = ids.filter(songById); bump('setlist'); return { ids: proj.setlist }; },

  getSettings: () => proj.settings,
  setSettings: (a) => {
    for (const k of Object.keys(proj.settings)) if (typeof a[k] === 'number') proj.settings[k] = a[k];
    bump('settings');
    return proj.settings;
  },

  markProject: () => { proj.marker = true; bump('project'); return { marker: true }; },

  queueSong: ({ id }) => {
    if (isRecording()) refuse('Song selection is locked while recording');
    if (!songById(id)) refuse('Song not found');
    proj.queued = id;
    return { queued: id };
  },

  loadSong: ({ id }) => {
    if (isRecording()) refuse('Song selection is locked while recording');
    const song = songById(id) ?? refuse('Song not found');
    proj.queued = id;
    transport.pos = song.start;
    return { queued: id, pos: song.start };
  },

  startLive: ({ id }) => {
    checkCommon();
    const song = songById(id) ?? refuse('Song not found in the Songs lane');
    const live = liveTracks();
    if (live.length !== proj.settings.liveCount) refuse(`Expected ${proj.settings.liveCount} [Live] tracks, found ${live.length}`);
    if (proj.mode !== 'live') applyMode('live');
    for (const t of live) { t.arm = true; t.mute = false; }
    transport.rate = 1;
    transport.repeat = false;
    proj.recordPath = 'Recordings/Live';
    startTake('live', song, null, 0, true);
    return { recording: true, armed: live.map((t) => tracks.indexOf(t) + 1) };
  },

  stop: () => {
    if (bridge.active) bridge.active.stoppedBy = 'stop button';
    transport.state = 0;
    return { stopped: true };
  },

  setMode: ({ mode }) => {
    if (isRecording()) refuse('Cannot change mode while recording');
    if (mode !== 'live' && mode !== 'practice') refuse('Unknown mode');
    applyMode(mode);
    return { mode };
  },

  setPracticeOptions: (a) => {
    if (isRecording()) refuse('Cannot change players while recording');
    if (Array.isArray(a.players)) proj.practice.players = a.players;
    if (Array.isArray(a.mutes)) proj.practice.mutes = a.mutes;
    if (typeof a.rate === 'number') proj.practice.rate = Math.min(1.2, Math.max(0.5, a.rate));
    if (proj.mode === 'practice') {
      applyPracticeTracks();
      transport.rate = proj.practice.rate;
      bump('tracks');
    }
    return proj.practice;
  },

  recordPractice: ({ songId, partId, prerollBars }) => {
    checkCommon();
    if (proj.mode !== 'practice') refuse('Not in Practice mode');
    const song = songById(songId) ?? refuse('Song not found');
    const part = partId ? song.parts.find((p) => p.id === partId) ?? refuse('Part not found') : null;
    if (proj.practice.players.length === 0) refuse('No players chosen to record');
    applyPracticeTracks();
    transport.rate = proj.practice.rate;
    const r = startTake('practice', song, part, prerollBars ?? 0, true);
    proj.lastTake = { songId, partId: partId ?? null, prerollBars: prerollBars ?? 0, rate: proj.practice.rate, players: [...proj.practice.players] };
    return { recording: true, ...r };
  },

  retry: () => {
    const last = proj.lastTake ?? refuse('No previous take');
    return fns.recordPractice(last);
  },

  playLast: () => {
    if (isRecording()) refuse('Already recording');
    const last = proj.lastTake ?? refuse('No previous take');
    const song = songById(last.songId) ?? refuse('Song not found');
    const part = last.partId ? song.parts.find((p) => p.id === last.partId) : null;
    for (const t of liveTracks()) if (last.players.includes(t.guid)) t.recmon = 0;
    const r = startTake('play', song, part, last.prerollBars, false);
    return { playing: true, ...r };
  },
};

// Runs a stand-in like B.call does; failFn makes it fail like a Lua bug.
function nested(name, args = {}) {
  if (mock.failFn === name) {
    throw new Error(`${name}.lua:12: attempt to index a nil value (local 'song')\nstack traceback:\n\t[C]: in ?\n\t${name}.lua:12: in function <${name}.lua:0>\n\t[C]: in function 'xpcall'`);
  }
  const fn = fns[name] ?? (() => { throw new Error(`mock has no stand-in for ${name}`); });
  return fn(args);
}

// Stand-in for tick.lua
function tick() {
  const a = bridge.active;
  if (a && transport.state !== 0) a.started = true;
  if (a && a.started && transport.state === 0) {
    bridge.active = null;
    const how = a.stoppedBy === 'bridge' ? 'the bridge stopped it after the end'
      : a.stoppedBy === 'watchdog' ? 'stopped by the watchdog'
      : a.stoppedBy === 'stop button' ? 'stopped with the Stop button'
      : transport.pos >= a.stopAt - 0.25 ? 'REAPER stopped at the end' : 'stopped in REAPER before the end';
    if (a.kind === 'live') {
      const song = songById(a.songId);
      transport.pos = song.end;
      const idx = proj.setlist.indexOf(song.id);
      proj.queued = idx >= 0 && idx + 1 < proj.setlist.length ? proj.setlist[idx + 1] : null;
      bridge.event = notice(`${song.name} saved · ${how}`);
    } else if (a.kind === 'practice') {
      bridge.event = notice(`Take saved · ${how}`);
    } else if (a.kind === 'play') {
      for (const t of liveTracks()) t.recmon = 1;
      bridge.event = notice(`Playback ended · ${how}`);
    }
  }
  if (a && transport.state !== 0) {
    if (transport.pos > a.stopAt + 2 && !a.watchdog) {
      a.watchdog = true;
      a.stoppedBy = 'watchdog';
      transport.state = 0;
      bridge.watchdog = notice('Recording ran past the end of the song. The bridge stopped it and saved the media.');
    } else if (transport.pos > a.stopAt + 0.5 && !a.stoppedBy) {
      a.stoppedBy = 'bridge';
      if (mock.bridgeStop) transport.state = 0;
    }
  }
}

// Stand-in for status.lua
function appStatus() {
  const a = bridge.active;
  return {
    marker: proj.marker,
    mode: proj.mode,
    queued: proj.queued,
    rate: transport.rate,
    active: a ? { kind: a.kind, songId: a.songId, partId: a.partId } : null,
    practice: { players: proj.practice.players, mutes: proj.practice.mutes },
    lastTake: proj.lastTake,
    watchdog: bridge.watchdog,
    event: bridge.event,
    counters: bridge.counters,
  };
}

function respond(id, body) {
  const json = JSON.stringify({ id, ...body });
  const chunks = [];
  for (let i = 0; i < json.length; i += RESP_CHUNK) chunks.push(json.slice(i, i + RESP_CHUNK));
  for (let i = 1; i < chunks.length; i++) setExt(SECTION, `resp${i}`, chunks[i]);
  setExt(SECTION, 'resp', `${id}|${chunks.length}|${chunks[0]}`);
}

function handleRequest() {
  const req = getExt(SECTION, 'req');
  if (!req) return;
  setExt(SECTION, 'req', '');
  const m = /^([\w-]+):(\d+):?(\d*)$/.exec(req);
  if (!m) return;
  const [, id, n, len] = m;
  let b64 = '';
  for (let i = 0; i < Number(n); i++) { b64 += getExt(SECTION, `c${i}`); delExt(SECTION, `c${i}`); }
  if (len && b64.length !== Number(len)) {
    respond(id, { ok: false, error: `The request was cut off on the way to REAPER: ${b64.length} of ${len} characters arrived.` });
    return;
  }
  const text = Buffer.from(b64, 'base64url').toString('utf8');
  const nl = text.indexOf('\n');
  const [kind, name] = text.slice(0, nl).split(' ');
  const payload = text.slice(nl + 1);
  try {
    let result;
    if (kind === 'def') { bridge.defs.add(name); result = { name, bytes: payload.length }; }
    else if (kind === 'seal') { bridge.lib = name; result = { lib: name, functions: bridge.defs.size }; }
    else if (kind === 'call') {
      if (!bridge.defs.has(name)) throw new Error(`unknown function: ${name}`);
      result = nested(name, payload ? JSON.parse(payload) : {});
    } else throw new Error(`unknown request kind: ${kind}`);
    respond(id, { ok: true, result });
  } catch (e) {
    respond(id, { ok: false, error: e.message });
  }
}

function bridgeLoop() {
  advance();
  if (!mock.bridge) return;
  handleRequest();
  tick();
  const status = JSON.stringify({
    v: 1, session: bridge.session, lib: bridge.lib, hb: Math.floor(Date.now() / 250) % 100000,
    err: mock.loopErr ? "tick: tick.lua:40: attempt to compare nil with number\nstack traceback:\n\ttick.lua:40: in main chunk" : null,
    app: bridge.lib ? appStatus() : null,
  });
  if (status !== bridge.lastStatus) { setExt(SECTION, 'status', status); bridge.lastStatus = status; }
}
setInterval(bridgeLoop, TICK_MS);

// ---------------------------------------------------------------------------
// REAPER web API
// ---------------------------------------------------------------------------

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
};

function trackFlags(t) {
  return (t.depth === 1 ? 1 : 0) | (t.mute ? 8 : 0) | (t.arm ? 64 : 0) | (t.arm && t.recmon === 1 ? 128 : 0);
}

function command(cmd) {
  const parts = cmd.split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [head] = parts;
  switch (head) {
    case 'TRANSPORT': {
      const beats = transport.pos / 0.5;
      const bar = Math.floor(beats / 4) + 1;
      const beat = (beats % 4) + 1;
      return [`TRANSPORT\t${transport.state}\t${transport.pos.toFixed(6)}\t${transport.repeat ? 1 : 0}\t${fmtTime(transport.pos)}\t${bar}.${beat.toFixed(2)}`];
    }
    case 'NTRACK':
      return [`NTRACK\t${tracks.length}`];
    case 'TRACK':
      return [
        'TRACK\t0\tMASTER\t0\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t0\t0\t0\t0\t0',
        ...tracks.map((t, i) => `TRACK\t${i + 1}\t${t.name}\t${trackFlags(t)}\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t0\t0\t0\t0\t0`),
      ];
    case 'REGION':
      return ['REGION_LIST', ...songs.map((s) => `REGION\t${s.name}\t${s.num}\t${s.start}\t${s.end}\t0`), 'REGION_LIST_END'];
    case 'GET':
      if (parts[1] === 'EXTSTATE') return [`EXTSTATE\t${parts[2]}\t${parts[3]}\t${escapeExt(getExt(parts[2], parts[3]))}`];
      if (parts[1] === 'REPEAT') return [`GET/REPEAT\t${transport.repeat ? 1 : 0}`];
      return [];
    case 'SET':
      // Like REAPER's web server: only ~1024 characters of a value are kept.
      if (parts[1] === 'EXTSTATE' || parts[1] === 'EXTSTATEPERSIST') setExt(parts[2], parts[3], parts.slice(4).join('/').slice(0, MAX_VALUE));
      else if (parts[1] === 'POS') transport.pos = Number(parts[2]) || 0;
      else if (parts[1] === 'REPEAT') transport.repeat = parts[2] === '-1' ? !transport.repeat : parts[2] === '1';
      return [];
    case '1007': transport.state = 1; return [];
    case '1016': case '40667': transport.state = 0; return [];
    case '1013': transport.state = 5; return [];
    default:
      return [];
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/_/')) {
    if (mock.hang) return; // never answer
    let delay = mock.delayMs;
    if (mock.slowOnce) { mock.slowOnce = false; delay = 3500; }
    setTimeout(() => {
      advance();
      const raw = req.url.slice(3).split('?')[0];
      const lines = raw.split(';').filter(Boolean).flatMap(command);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(lines.length ? lines.join('\n') + '\n' : '');
    }, delay);
    return;
  }
  if (url.pathname === '/mock/set') {
    for (const [k, v] of url.searchParams) {
      if (k === 'bridge') { mock.bridge = v === '1'; if (!mock.bridge) setExt(SECTION, 'status', ''); bridge.lastStatus = ''; }
      if (k === 'stopAtEnd') mock.stopAtEnd = v === '1';
      if (k === 'diskMB') mock.diskMB = Number(v);
      if (k === 'hang') mock.hang = v === '1';
      if (k === 'failFn') mock.failFn = v;
      if (k === 'loopErr') mock.loopErr = v === '1';
      if (k === 'slowOnce') mock.slowOnce = v === '1';
      if (k === 'bridgeStop') mock.bridgeStop = v === '1';
      if (k === 'sws') { mock.sws = v === '1'; bump('project'); }
      if (k === 'delayMs') mock.delayMs = Number(v) || 0;
      if (k === 'marker') { proj.marker = v === '1'; bump('project'); }
    }
  }
  if (url.pathname === '/mock/set' || url.pathname === '/mock/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mock, proj, transport, active: bridge.active, lib: bridge.lib, functions: [...bridge.defs] }, null, 2));
    return;
  }
  res.writeHead(404);
  res.end('Mock REAPER: only /_/ (web API) and /mock/state, /mock/set');
});

applyMode('live');
server.listen(PORT, () => console.log(`Mock REAPER on http://localhost:${PORT}  (state: /mock/state)`));

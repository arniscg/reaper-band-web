// The polling loop: one chained native request every ~200 ms for transport,
// tracks and the bridge status. Detects a dead bridge (heartbeat stops),
// uploads the Lua functions when the bridge doesn't have the current set,
// and refetches data when the bridge's change counters move.

import { request, parseTrack, parseTransport, extValue } from '../reaper/web';
import { SECTION, call, scriptsHash, uploadScripts } from '../reaper/bridge';
import type { BridgeStatus, ProjectInfo, Settings, Song, TaggedTrack } from '../reaper/types';
import { getState, setState } from './store';
import { isRecordingState } from './derive';

const POLL_MS = 200;
const OFFLINE_RETRY_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 2500;
/** After a failed upload, wait before trying again (a Lua error won't fix itself). */
const UPLOAD_RETRY_MS = 10000;
/** At most one data reload per interval; REAPER's change counter can move often. */
const REFRESH_MIN_INTERVAL_MS = 1500;

const POLL = ['TRANSPORT', 'TRACK', `GET/EXTSTATE/${SECTION}/status`];

let lastHb: number | null = null;
let lastHbChange = 0;
let uploading = false;
let uploadFailedAt = 0;
let loadedCounters = '';
let refreshing = false;
let lastRefresh = 0;

export function startPolling(): void {
  void loop();
}

async function loop(): Promise<void> {
  let delay = POLL_MS;
  try {
    const lines = await request(POLL);
    const transportLine = lines.find((t) => t[0] === 'TRANSPORT');
    const nativeTracks = lines.filter((t) => t[0] === 'TRACK').map(parseTrack);
    const raw = extValue(lines, 'status') ?? '';
    const bridgeStatus = parseStatus(raw);
    setState({
      connection: 'online',
      transport: transportLine ? parseTransport(transportLine) : null,
      nativeTracks,
      bridgeStatus,
    });
    updateBridge(bridgeStatus);
  } catch {
    setState({ connection: 'offline', bridge: 'unknown' });
    delay = OFFLINE_RETRY_MS;
  }
  setTimeout(loop, delay);
}

function parseStatus(raw: string): BridgeStatus | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BridgeStatus;
  } catch {
    return null;
  }
}

function updateBridge(status: BridgeStatus | null): void {
  const now = Date.now();
  if (!status) {
    setState({ bridge: 'down' });
    lastHb = null;
    return;
  }
  if (status.hb !== lastHb) {
    lastHb = status.hb;
    lastHbChange = now;
  }
  if (now - lastHbChange > HEARTBEAT_TIMEOUT_MS) {
    setState({ bridge: 'down' });
    return;
  }
  if (status.lib !== scriptsHash) {
    if (!uploading && now - uploadFailedAt > UPLOAD_RETRY_MS) void upload();
    return;
  }
  if (getState().bridge !== 'ready') setState({ bridge: 'ready' });

  const counters = JSON.stringify(status.app?.counters ?? {});
  const due = counters !== loadedCounters && !refreshing && now - lastRefresh > REFRESH_MIN_INTERVAL_MS;
  // Don't reload while recording unless nothing is loaded yet; it catches up after the stop.
  if (due && (!getState().project || !isRecordingState(getState().transport?.state))) void refresh(counters);
}

async function upload(): Promise<void> {
  uploading = true;
  setState({ bridge: 'uploading' });
  try {
    await uploadScripts();
    loadedCounters = ''; // new session or new functions: reload everything
    uploadFailedAt = 0;
  } catch (e) {
    uploadFailedAt = Date.now();
    setState({ error: `Could not load the bridge functions into REAPER.\n${(e as Error).message}` });
  } finally {
    uploading = false;
  }
}

/** Reload everything the page caches from the bridge, in one call. */
export async function refresh(counters = loadedCounters): Promise<void> {
  refreshing = true;
  lastRefresh = Date.now();
  try {
    const snap = await call<Snapshot>('getSnapshot');
    setState({ project: snap.project, songs: snap.songs, tracks: snap.tracks, setlist: snap.setlist, settings: snap.settings });
  } catch (e) {
    setState({ error: `Could not read the project.\n${(e as Error).message}` });
  } finally {
    loadedCounters = counters; // on failure, the next counter change retries
    refreshing = false;
  }
}

interface Snapshot {
  project: ProjectInfo;
  songs: Song[];
  tracks: TaggedTrack[];
  setlist: string[];
  settings: Settings;
}

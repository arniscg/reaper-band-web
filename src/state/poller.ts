// The polling loop: one chained native request every ~200 ms for transport,
// tracks and the bridge status. Detects a dead bridge (heartbeat stops),
// uploads the Lua functions when the bridge doesn't have the current set,
// and refetches data when the bridge's change counters move.

import { request, parseTrack, parseTransport, extValue } from '../reaper/web';
import { SECTION, call, scriptsHash, uploadScripts } from '../reaper/bridge';
import type { BridgeStatus, ProjectInfo, Settings, Song, TaggedTrack } from '../reaper/types';
import { getState, setState } from './store';

const POLL_MS = 200;
const OFFLINE_RETRY_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 2500;

const POLL = ['TRANSPORT', 'TRACK', `GET/EXTSTATE/${SECTION}/status`];

let lastHb: number | null = null;
let lastHbChange = 0;
let uploading = false;
let loadedCounters = '';
let refreshing = false;

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
    if (!uploading) void upload();
    return;
  }
  if (getState().bridge !== 'ready') setState({ bridge: 'ready' });

  const counters = JSON.stringify(status.app?.counters ?? {});
  if (counters !== loadedCounters && !refreshing) void refresh(counters);
}

async function upload(): Promise<void> {
  uploading = true;
  setState({ bridge: 'uploading' });
  try {
    await uploadScripts();
    loadedCounters = ''; // new session or new functions: reload everything
  } catch (e) {
    setState({ error: `Could not upload bridge functions: ${(e as Error).message}` });
  } finally {
    uploading = false;
  }
}

/** Reload everything the page caches from the bridge. */
export async function refresh(counters = loadedCounters): Promise<void> {
  refreshing = true;
  try {
    const project = await call<ProjectInfo>('getProjectInfo');
    const { songs } = await call<{ songs: Song[] }>('getSongMap');
    const { tracks } = await call<{ tracks: TaggedTrack[] }>('getTracks');
    const { ids } = await call<{ ids: string[] }>('getSetlist');
    const settings = await call<Settings>('getSettings');
    setState({ project, songs, tracks, setlist: ids, settings });
    loadedCounters = counters;
  } catch (e) {
    setState({ error: `Could not read the project: ${(e as Error).message}` });
    loadedCounters = counters; // don't retry in a tight loop; next counter change retries
  } finally {
    refreshing = false;
  }
}

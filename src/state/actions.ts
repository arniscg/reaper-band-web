// User actions. Each one is a bridge call; the screen then updates from the
// poll, never from the button press itself. Refusals land in state.error.

import { call } from '../reaper/bridge';
import type { Mode, Settings } from '../reaper/types';
import { getState, setState } from './store';
import { isArmed, isRecordingState } from './derive';
import { refresh } from './poller';

const CONFIRM_MS = 2000;

async function run<T>(label: string, job: () => Promise<T>, force = false): Promise<T | undefined> {
  if (getState().busy && !force) return undefined;
  setState({ busy: label, error: null });
  try {
    return await job();
  } catch (e) {
    setState({ error: (e as Error).message });
    return undefined;
  } finally {
    setState({ busy: null });
  }
}

/** Warn if REAPER hasn't reported recording with the expected tracks armed within 2 s. */
function confirmRecording(armed: number[] = []): void {
  const started = Date.now();
  const check = () => {
    const st = getState();
    if (isRecordingState(st.transport?.state) && armed.every((i) => isArmed(st, i))) return;
    if (Date.now() - started > CONFIRM_MS) {
      setState({ warning: 'REAPER has not confirmed recording. Check the laptop.' });
      return;
    }
    setTimeout(check, 100);
  };
  setTimeout(check, 100);
}

export const dismissError = () => setState({ error: null });
export const dismissWarning = () => setState({ warning: null });

export const queueSong = (id: string) => run('queue', () => call('queueSong', { id }));
export const loadSong = (id: string) => run('load', () => call('loadSong', { id }));

export async function startLive(id: string) {
  const r = await run('start', () => call<{ armed: number[] }>('startLive', { id }));
  if (r) confirmRecording(r.armed);
}

// Stop is never blocked by another action in flight.
export const stop = () => run('stop', () => call('stop'), true);

export const setMode = (mode: Mode) => run('mode', () => call('setMode', { mode }));
export const markProject = () => run('mark', () => call('markProject'));

export const setSetlist = (ids: string[]) => {
  setState({ setlist: ids }); // keep the editor responsive; the refresh confirms it
  return run('setlist', () => call('setSetlist', { ids }), true); // quick edits queue up in order
};

export const setSettings = (patch: Partial<Settings>) => run('settings', () => call('setSettings', patch));

export const setPracticeOptions = (opts: { players?: string[]; mutes?: string[]; rate?: number }) =>
  run('practice', () => call('setPracticeOptions', opts));

export async function recordPractice(songId: string, partId: string | null, prerollBars: number) {
  const r = await run('record', () => call('recordPractice', { songId, partId, prerollBars }));
  if (r) confirmRecording();
}

export async function retry() {
  const r = await run('retry', () => call('retry'));
  if (r) confirmRecording();
}

export const playLast = () => run('play', () => call('playLast'));

export async function ping(): Promise<number | undefined> {
  const t0 = performance.now();
  const r = await run('ping', () => call('ping'));
  return r === undefined ? undefined : Math.round(performance.now() - t0);
}

export const reload = () => run('reload', () => refresh());

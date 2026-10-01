// Global app state: a minimal observable store plus a hook for components.
// Everything shown comes from what REAPER reports; nothing is assumed from
// a button press.

import { useEffect, useState } from 'preact/hooks';
import type {
  BridgeStatus,
  NativeTrack,
  ProjectInfo,
  Settings,
  Song,
  TaggedTrack,
  Transport,
} from '../reaper/types';

export type Connection = 'connecting' | 'online' | 'offline';
export type BridgeState = 'unknown' | 'down' | 'uploading' | 'ready';
export type Screen = 'main' | 'setup';

export interface State {
  connection: Connection;
  bridge: BridgeState;
  bridgeStatus: BridgeStatus | null;
  transport: Transport | null;
  nativeTracks: NativeTrack[];

  // Fetched from bridge functions; refreshed when status counters change.
  project: ProjectInfo | null;
  songs: Song[];
  tracks: TaggedTrack[];
  setlist: string[];
  settings: Settings | null;

  screen: Screen;
  /** Action in flight (buttons disable while set). */
  busy: string | null;
  /** Refusals and failures, shown in big letters until dismissed. */
  error: string | null;
  /** Expected state that REAPER didn't confirm in time. */
  warning: string | null;
}

let state: State = {
  connection: 'connecting',
  bridge: 'unknown',
  bridgeStatus: null,
  transport: null,
  nativeTracks: [],
  project: null,
  songs: [],
  tracks: [],
  setlist: [],
  settings: null,
  screen: location.hash === '#setup' ? 'setup' : 'main',
  busy: null,
  error: null,
  warning: null,
};

const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export function showScreen(screen: Screen): void {
  history.replaceState(null, '', screen === 'setup' ? '#setup' : location.pathname);
  setState({ screen });
}

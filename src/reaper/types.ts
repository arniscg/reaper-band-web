// Shapes of the data the page gets from REAPER: native web API parses and
// bridge function results (see reaper/functions/*.lua for the contracts).

export type Mode = 'live' | 'practice';
export type Tag = 'live' | 'show' | 'practice';

/** Native TRANSPORT line. state: 0 stopped, 1 playing, 2 paused, 5 recording, 6 record paused. */
export interface Transport {
  state: number;
  pos: number;
  repeat: boolean;
}

/** Native TRACK line (index 0 is the master). */
export interface NativeTrack {
  index: number;
  name: string;
  flags: number;
}

export const TrackFlag = {
  folder: 1,
  muted: 8,
  armed: 64,
  monitoring: 128,
} as const;

export interface Part {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface Song {
  id: string;
  num: number;
  name: string;
  start: number;
  end: number;
  color: string | null;
  parts: Part[];
}

export interface TaggedTrack {
  guid: string;
  index: number;
  name: string;
  label: string;
  tags: Tag[];
  folder: boolean;
}

export interface Settings {
  tail: number;
  prerollDefault: number;
  liveCount: number;
  minDiskGB: number;
}

export interface ProjectInfo {
  name: string;
  saved: boolean;
  marker: boolean;
  mode: Mode;
  reaperVersion: string;
  recordPath: string;
  freeDiskMB: number;
  lanes: { songs: boolean; parts: boolean };
  /** REAPER actions the bridge could not find by name. */
  missingActions: string[];
  /** SWS stop marker: REAPER ends takes by itself, even without the bridge. */
  stopMarker?: { ok: boolean; problem?: string };
  /** Ruler lanes as REAPER reports them (diagnostics). */
  laneInfo?: { lane: number; name?: string; regions: number }[];
  laneCount?: number;
}

export interface Notice {
  seq: number;
  message: string;
}

export interface LastTake {
  songId: string;
  partId?: string | null;
  prerollBars: number;
  rate: number;
  players: string[];
}

/** Returned by status.lua, published every tick as status.app. */
export interface AppStatus {
  marker: boolean;
  mode: Mode;
  queued?: string | null;
  rate: number;
  active?: { kind: 'live' | 'practice' | 'play'; songId: string; partId?: string | null } | null;
  practice: { players: string[]; mutes: string[] };
  lastTake?: LastTake | null;
  watchdog?: Notice | null;
  event?: Notice | null;
  counters: Record<string, number | string>;
}

/** The bridge's own status key. Lua drops nil fields, so absent = null. */
export interface BridgeStatus {
  v: number;
  session: string;
  lib?: string | null;
  hb: number;
  err?: string | null;
  app?: AppStatus | null;
}

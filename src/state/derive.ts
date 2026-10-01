// Pure helpers that turn polled REAPER state into what the screens show.

import { TrackFlag, type Part, type Song, type TaggedTrack } from '../reaper/types';
import type { State } from './store';

const AT_START_EPSILON = 0.01;

export const isRecordingState = (s: number | undefined) => s === 5 || s === 6;
export const isRunningState = (s: number | undefined) => s === 1 || s === 2 || s === 5 || s === 6;

export function songAt(songs: Song[], pos: number): Song | null {
  return songs.find((s) => pos >= s.start && pos < s.end) ?? null;
}

export function partAt(song: Song | null, pos: number): Part | null {
  return song?.parts.find((p) => pos >= p.start && pos < p.end) ?? null;
}

export function songById(songs: Song[], id: string | null | undefined): Song | null {
  return (id && songs.find((s) => s.id === id)) || null;
}

export type LivePhase = 'idle' | 'loaded' | 'recording' | 'playing';

/** Loaded = stopped with the cursor at the queued song's start (decided: derived, not stored). */
export function livePhase(st: State): LivePhase {
  const t = st.transport;
  if (!t) return 'idle';
  if (isRecordingState(t.state)) return 'recording';
  if (isRunningState(t.state)) return 'playing';
  const queued = songById(st.songs, st.bridgeStatus?.app?.queued);
  if (queued && Math.abs(t.pos - queued.start) < AT_START_EPSILON) return 'loaded';
  return 'idle';
}

export function liveTracks(tracks: TaggedTrack[]): TaggedTrack[] {
  return tracks.filter((t) => t.tags.includes('live'));
}

export function isArmed(st: State, index: number): boolean {
  const t = st.nativeTracks.find((n) => n.index === index);
  return !!t && (t.flags & TrackFlag.armed) !== 0;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

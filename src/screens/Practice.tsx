import { useEffect, useState } from 'preact/hooks';
import { Header, Chip } from '../components/Header';
import { Stepper } from '../components/Stepper';
import { useStore } from '../state/store';
import { fmtPercent, fmtTime, isRecordingState, isRunningState, liveTracks, partAt, songAt, songById } from '../state/derive';
import { playLast, recordPractice, retry, setPracticeOptions, stop } from '../state/actions';
import type { Song } from '../reaper/types';
import styles from './Practice.module.css';

const RATE_MIN = 0.5;
const RATE_MAX = 1.2;
const RATE_STEP = 0.05;
const PREROLL_MAX = 4;
const SELECTION_KEY = 'bandremote.practice';

interface Selection {
  songId: string | null;
  partId: string | null;
  preroll: number | null;
}

export function Practice() {
  const st = useStore();
  const app = st.bridgeStatus?.app;
  const [sel, setSel] = useState<Selection>(() => readSelection());
  useEffect(() => writeSelection(sel), [sel]);

  const setlistSongs = st.setlist.map((id) => songById(st.songs, id)).filter((s): s is Song => !!s);
  const otherSongs = st.songs.filter((s) => !st.setlist.includes(s.id));
  const song = songById(st.songs, sel.songId) ?? setlistSongs[0] ?? st.songs[0] ?? null;
  const part = song?.parts.find((p) => p.id === sel.partId) ?? null;
  const preroll = sel.preroll ?? st.settings?.prerollDefault ?? 2;
  const prerollApplies = !!part && !!song && part.start > song.start;

  const players = liveTracks(st.tracks);
  const chosen = app?.practice.players ?? [];
  const mutes = app?.practice.mutes ?? [];
  const rate = app?.rate ?? 1;

  const state = st.transport?.state;
  const running = isRunningState(state);
  const ready = st.bridge === 'ready' && st.connection === 'online';
  const canEdit = ready && !running && !st.busy;

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const allMuted = players.length > 0 && players.every((p) => mutes.includes(p.guid));
  const changeRate = (r: number) => setPracticeOptions({ rate: Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, r)) * 100) / 100 });

  return (
    <>
      <Header kind="practice">
        <Chip>Rate {fmtPercent(rate)}</Chip>
      </Header>

      <div class={styles.pickers}>
        <div class={`card ${styles.picker}`}>
          <div class="label">Song</div>
          <div class={styles.list}>
            {setlistSongs.map((s, i) => (
              <SongRow key={s.id} song={s} num={String(i + 1)} on={s.id === song?.id} disabled={running} onPick={() => setSel({ ...sel, songId: s.id, partId: null })} />
            ))}
            {otherSongs.length > 0 && <div class={styles.divider}>Other songs</div>}
            {otherSongs.map((s) => (
              <SongRow key={s.id} song={s} num="" on={s.id === song?.id} disabled={running} onPick={() => setSel({ ...sel, songId: s.id, partId: null })} />
            ))}
          </div>
        </div>
        <div class={`card ${styles.picker}`}>
          <div class="label">Part of {song?.name ?? '—'}</div>
          <div class={styles.list}>
            <button class={`${styles.item} ${styles.whole} ${!part ? styles.on : ''}`} disabled={running} onClick={() => setSel({ ...sel, partId: null })}>
              Whole song
            </button>
            {song?.parts.map((p) => (
              <button key={p.id} class={`${styles.item} ${p.id === part?.id ? styles.on : ''}`} disabled={running} onClick={() => setSel({ ...sel, partId: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class={`card ${styles.controls}`}>
        <div class={styles.playersHead}>
          <div class="label">Record these players · others play their takes</div>
          <button class={`${styles.muteAll} ${allMuted ? styles.muteOn : ''}`} disabled={!canEdit} onClick={() => setPracticeOptions({ mutes: allMuted ? [] : players.map((p) => p.guid) })}>
            <SpeakerIcon muted={allMuted} /> Mute all players
          </button>
        </div>
        <div class={styles.players}>
          {players.map((p) => {
            const on = chosen.includes(p.guid);
            const muted = mutes.includes(p.guid);
            return (
              <div key={p.guid} class={styles.player}>
                <button class={`${styles.playerChip} ${on ? styles.chipOn : ''}`} aria-pressed={on} disabled={!canEdit} onClick={() => setPracticeOptions({ players: toggle(chosen, p.guid) })}>
                  {p.label}
                </button>
                <button class={`${styles.playerMute} ${muted ? styles.muteOn : ''}`} aria-pressed={muted} aria-label={`Mute ${p.label}`} disabled={!canEdit} onClick={() => setPracticeOptions({ mutes: toggle(mutes, p.guid) })}>
                  <SpeakerIcon muted={muted} /> {muted ? 'Muted' : 'Mute'}
                </button>
              </div>
            );
          })}
        </div>

        <div class={styles.steppers}>
          <div class={styles.stepperBox}>
            <div class="label">Pre-roll</div>
            <Stepper
              label="pre-roll"
              value={prerollApplies ? (preroll === 0 ? 'None' : preroll === 1 ? '1 bar' : `${preroll} bars`) : 'From start'}
              disabled={!prerollApplies || running}
              onDown={() => setSel({ ...sel, preroll: Math.max(0, preroll - 1) })}
              onUp={() => setSel({ ...sel, preroll: Math.min(PREROLL_MAX, preroll + 1) })}
            />
          </div>
          <div class={styles.stepperBox}>
            <div class={styles.tempoHead}>
              <div class="label">Tempo</div>
              <button class={styles.reset} disabled={!canEdit || rate === 1} onClick={() => changeRate(1)}>
                Reset to 100%
              </button>
            </div>
            <Stepper label="tempo" value={fmtPercent(rate)} disabled={!canEdit} onDown={() => changeRate(rate - RATE_STEP)} onUp={() => changeRate(rate + RATE_STEP)} />
          </div>
        </div>
      </div>

      <TransportLine />

      <div class={styles.buttons}>
        <button class={`${styles.big} ${styles.record}`} disabled={!canEdit || !song || chosen.length === 0} onClick={() => song && recordPractice(song.id, part?.id ?? null, prerollApplies ? preroll : 0)}>
          <svg viewBox="0 0 24 24" width="30" height="30" class={styles.fillIcon}><circle cx="12" cy="12" r="9" /></svg>
          Record
        </button>
        <button class={`${styles.big} ${styles.play}`} disabled={!canEdit || !app?.lastTake} onClick={playLast}>
          <svg viewBox="0 0 24 24" width="30" height="30" class={styles.fillIcon}><path d="M7 4.5v15l12-7.5z" /></svg>
          Play last
        </button>
        <button class={styles.big} disabled={!canEdit || !app?.lastTake} onClick={retry}>
          <svg viewBox="0 0 24 24" width="30" height="30" class={styles.strokeIcon}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          Retry
        </button>
        <button class={`${styles.big} ${running ? styles.stopActive : ''}`} disabled={!ready || !running} onClick={stop}>
          <svg viewBox="0 0 24 24" width="26" height="26" class={styles.fillIcon}><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          Stop
        </button>
      </div>
    </>
  );
}

function TransportLine() {
  const st = useStore();
  const app = st.bridgeStatus?.app;
  const pos = st.transport?.pos ?? 0;
  const state = st.transport?.state;
  const song = songAt(st.songs, pos);
  const part = partAt(song, pos);
  const rec = isRecordingState(state);
  const running = isRunningState(state);
  const last = app?.lastTake;
  const lastSong = songById(st.songs, last?.songId);
  const lastPart = lastSong?.parts.find((p) => p.id === last?.partId);
  const names = st.tracks.filter((t) => last?.players.includes(t.guid)).map((t) => t.label);

  return (
    <div class={styles.transport}>
      <div class={styles.transportRow}>
        <span class={`${styles.state} ${rec ? styles.stateRec : running ? styles.statePlay : ''}`}>
          <span class={styles.stateDot} />
          {rec ? 'REC' : running ? 'PLAYING' : 'STOPPED'}
        </span>
        <span class={styles.where}>
          {song ? `${song.name}${part ? ` · ${part.name}` : ''}` : 'Outside any song'}
        </span>
        <span class={`${styles.time} num`}>{song ? fmtTime(pos - song.start) : fmtTime(pos)}</span>
      </div>
      <div class={styles.lastTake}>
        Last take:{' '}
        {last && lastSong
          ? `${lastSong.name} · ${lastPart?.name ?? 'Whole song'} · ${fmtPercent(last.rate)} · ${names.join(', ') || 'nobody'}`
          : 'none yet'}
      </div>
    </div>
  );
}

function SongRow({ song, num, on, disabled, onPick }: { song: Song; num: string; on: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button class={`${styles.item} ${on ? styles.on : ''}`} disabled={disabled} onClick={onPick}>
      <span class={`${styles.itemNum} num`}>{num}</span>
      {song.name}
    </button>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" class={styles.strokeIcon}>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7" />}
    </svg>
  );
}

function readSelection(): Selection {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null');
    if (v && typeof v === 'object') return { songId: v.songId ?? null, partId: v.partId ?? null, preroll: v.preroll ?? null };
  } catch {
    /* ignore */
  }
  return { songId: null, partId: null, preroll: null };
}

function writeSelection(sel: Selection): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
  } catch {
    /* not remembered */
  }
}

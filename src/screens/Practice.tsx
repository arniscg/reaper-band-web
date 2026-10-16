import { useEffect, useState } from 'preact/hooks';
import { Header, Chip } from '../components/Header';
import { Stepper } from '../components/Stepper';
import { useStore } from '../state/store';
import { fmtPercent, fmtTime, isArmed, isMuted, isRecordingState, isRunningState, liveTracks, partAt, songAt, songById } from '../state/derive';
import { play, recordPractice, setPlayerState, setPracticeOptions, stop } from '../state/actions';
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
  /** End of a part range (tap a second part to extend); null = just partId. */
  toPartId: string | null;
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
  const parts = song?.parts ?? [];
  const fromIdx = parts.findIndex((p) => p.id === sel.partId);
  const toIdx = parts.findIndex((p) => p.id === sel.toPartId);
  const part = fromIdx >= 0 ? parts[fromIdx] : null;
  const toPart = part && toIdx > fromIdx ? parts[toIdx] : null;
  const lastIdx = toPart ? toIdx : fromIdx;
  const inSelection = (i: number) => fromIdx >= 0 && i >= fromIdx && i <= lastIdx;
  // First tap selects a part; tapping another part extends it into a range;
  // tapping again after a range starts a new single selection.
  const pickPart = (i: number) => {
    if (fromIdx < 0 || toPart || i === fromIdx) {
      setSel({ ...sel, partId: parts[i].id, toPartId: null });
    } else {
      const [a, b] = i < fromIdx ? [i, fromIdx] : [fromIdx, i];
      setSel({ ...sel, partId: parts[a].id, toPartId: parts[b].id });
    }
  };
  const scopeLabel = part ? (toPart ? `${part.name} → ${toPart.name}` : part.name) : 'Whole song';
  const preroll = sel.preroll ?? st.settings?.prerollDefault ?? 2;
  const prerollApplies = !!part && !!song && part.start > song.start;

  const players = liveTracks(st.tracks);
  const chosen = app?.practice.players ?? [];
  const rate = app?.rate ?? 1;

  const state = st.transport?.state;
  const running = isRunningState(state);
  const ready = st.bridge === 'ready' && st.connection === 'online';
  const canEdit = ready && !running && !st.busy;
  // Muting also works during playback (e.g. to isolate a take while listening); not while recording.
  const canMute = ready && !isRecordingState(state) && !st.busy;

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // Arm and mute are REAPER's own track flags, so changes made in REAPER show here too.
  const armed = (p: { index: number }) => isArmed(st, p.index);
  const muted = (p: { index: number }) => isMuted(st, p.index);
  const allGuids = players.map((p) => p.guid);
  const allDisarmed = players.length > 0 && players.every((p) => !armed(p));
  const allMuted = players.length > 0 && players.every(muted);
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
              <SongRow key={s.id} song={s} num={String(i + 1)} on={s.id === song?.id} disabled={running} onPick={() => setSel({ ...sel, songId: s.id, partId: null, toPartId: null })} />
            ))}
            {otherSongs.length > 0 && <div class={styles.divider}>Other songs</div>}
            {otherSongs.map((s) => (
              <SongRow key={s.id} song={s} num="" on={s.id === song?.id} disabled={running} onPick={() => setSel({ ...sel, songId: s.id, partId: null, toPartId: null })} />
            ))}
          </div>
        </div>
        <div class={`card ${styles.picker}`}>
          <div class={styles.partHead}>
            <div class="label">Part of {song?.name ?? '—'}</div>
            <div class={styles.scope}>
              {scopeLabel}
              {part && !toPart && <span class={styles.hint}> · tap another part to extend</span>}
            </div>
          </div>
          <div class={styles.list}>
            <button class={`${styles.item} ${styles.whole} ${!part ? styles.on : ''}`} disabled={running} onClick={() => setSel({ ...sel, partId: null, toPartId: null })}>
              Whole song
            </button>
            {parts.map((p, i) => (
              <button
                key={p.id}
                class={`${styles.item} ${inSelection(i) ? styles.on : ''} ${toPart && i > fromIdx && i <= lastIdx ? styles.joined : ''}`}
                aria-pressed={inSelection(i)}
                disabled={running}
                onClick={() => pickPart(i)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class={`card ${styles.controls}`}>
        <div class={styles.playersHead}>
          <div class="label">Record these players · others are disarmed</div>
          <div class={styles.allButtons}>
            <button class={`${styles.muteAll} ${allDisarmed ? styles.disarmedOn : ''}`} disabled={!canEdit} onClick={() => setPlayerState(allGuids, { armed: allDisarmed })}>
              <MicIcon off={allDisarmed} /> {allDisarmed ? 'Arm all' : 'Disarm all'}
            </button>
            <button class={`${styles.muteAll} ${allMuted ? styles.muteOn : ''}`} disabled={!canMute} onClick={() => setPlayerState(allGuids, { muted: !allMuted })}>
              <SpeakerIcon muted={allMuted} /> {allMuted ? 'Unmute all' : 'Mute all'}
            </button>
          </div>
        </div>
        <div class={styles.players}>
          {players.map((p) => {
            const on = chosen.includes(p.guid);
            const isOn = armed(p);
            const isMute = muted(p);
            return (
              <div key={p.guid} class={styles.player}>
                <button class={`${styles.playerChip} ${on ? styles.chipOn : ''}`} aria-pressed={on} disabled={!canEdit} onClick={() => setPracticeOptions({ players: toggle(chosen, p.guid) })}>
                  {p.label}
                </button>
                <div class={styles.playerToggles}>
                  <button class={`${styles.playerMute} ${isOn ? styles.armedOn : styles.disarmedOn}`} aria-pressed={!isOn} aria-label={`${isOn ? 'Disarm' : 'Arm'} ${p.label}`} disabled={!canEdit} onClick={() => setPlayerState([p.guid], { armed: !isOn })}>
                    <MicIcon off={!isOn} /> {isOn ? 'Armed' : 'Off'}
                  </button>
                  <button class={`${styles.playerMute} ${isMute ? styles.muteOn : ''}`} aria-pressed={isMute} aria-label={`${isMute ? 'Unmute' : 'Mute'} ${p.label}`} disabled={!canMute} onClick={() => setPlayerState([p.guid], { muted: !isMute })}>
                    <SpeakerIcon muted={isMute} /> {isMute ? 'Muted' : 'Mute'}
                  </button>
                </div>
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
        <button class={`${styles.big} ${styles.record}`} disabled={!canEdit || !song || chosen.length === 0} onClick={() => song && recordPractice(song.id, part?.id ?? null, toPart?.id ?? null, prerollApplies ? preroll : 0)}>
          <svg viewBox="0 0 24 24" width="30" height="30" class={styles.fillIcon}><circle cx="12" cy="12" r="9" /></svg>
          Record
        </button>
        <button class={`${styles.big} ${styles.play}`} disabled={!canEdit || !song} onClick={() => song && play(song.id, part?.id ?? null, toPart?.id ?? null, prerollApplies ? preroll : 0)}>
          <svg viewBox="0 0 24 24" width="30" height="30" class={styles.fillIcon}><path d="M7 4.5v15l12-7.5z" /></svg>
          Play
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
  const pos = st.transport?.pos ?? 0;
  const state = st.transport?.state;
  const song = songAt(st.songs, pos);
  const part = partAt(song, pos);
  const rec = isRecordingState(state);
  const running = isRunningState(state);

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

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" class={styles.strokeIcon}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
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
    if (v && typeof v === 'object') return { songId: v.songId ?? null, partId: v.partId ?? null, toPartId: v.toPartId ?? null, preroll: v.preroll ?? null };
  } catch {
    /* ignore */
  }
  return { songId: null, partId: null, toPartId: null, preroll: null };
}

function writeSelection(sel: Selection): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
  } catch {
    /* not remembered */
  }
}

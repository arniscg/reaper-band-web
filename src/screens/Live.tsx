import { Header, Chip } from '../components/Header';
import { HoldButton } from '../components/HoldButton';
import { useStore, type State } from '../state/store';
import { fmtTime, isRunningState, livePhase, partAt, songAt, songById, type LivePhase } from '../state/derive';
import { loadSong, queueSong, startLive, stop } from '../state/actions';
import type { Song } from '../reaper/types';
import styles from './Live.module.css';

export function Live() {
  const st = useStore();
  const phase = livePhase(st);
  const pos = st.transport?.pos ?? 0;
  const queued = songById(st.songs, st.bridgeStatus?.app?.queued);
  const current = songAt(st.songs, pos);
  const ready = st.bridge === 'ready' && st.connection === 'online';
  const running = phase === 'recording' || phase === 'playing';
  const setlistSongs = st.setlist.map((id) => songById(st.songs, id)).filter((s): s is Song => !!s);

  return (
    <>
      <Header kind="live">
        <Chip>Vocal: {isRunningState(st.transport?.state) ? 'Song voice' : 'Talk voice'}</Chip>
      </Header>

      <StatusCard st={st} phase={phase} pos={pos} queued={queued} current={current} />

      <section class={styles.setlist}>
        <div class="label">Setlist</div>
        <div class={styles.rows}>
          {setlistSongs.map((song, i) => {
            const badge = rowBadge(song, phase, queued, current);
            return (
              <button
                key={song.id}
                class={`${styles.row} ${badge ? styles[badge] : ''}`}
                disabled={!ready || running}
                onClick={() => song.id !== queued?.id && queueSong(song.id)}
              >
                <span class={`${styles.rowNum} num`}>{i + 1}</span>
                <span class={styles.rowName}>{song.name}</span>
                {badge && <span class={styles.badge}>{BADGE_TEXT[badge]}</span>}
              </button>
            );
          })}
          {setlistSongs.length === 0 && <div class={styles.empty}>The setlist is empty. Add songs in Setup.</div>}
        </div>
      </section>

      <MainButton phase={phase} queued={queued} disabled={!ready || !!st.busy} />
    </>
  );
}

type Badge = 'next' | 'loaded' | 'recording';
const BADGE_TEXT: Record<Badge, string> = { next: 'Next', loaded: 'Loaded', recording: 'Recording' };

function rowBadge(song: Song, phase: LivePhase, queued: Song | null, current: Song | null): Badge | null {
  if ((phase === 'recording' || phase === 'playing') && current?.id === song.id) return 'recording';
  if (phase === 'loaded' && queued?.id === song.id) return 'loaded';
  if (phase === 'idle' && queued?.id === song.id) return 'next';
  return null;
}

function StatusCard({ st, phase, pos, queued, current }: { st: State; phase: LivePhase; pos: number; queued: Song | null; current: Song | null }) {
  if (phase === 'recording' || phase === 'playing') {
    const song = current;
    const part = partAt(song, pos);
    const rec = phase === 'recording';
    return (
      <div class={`${styles.status} ${rec ? styles.statusRec : ''}`}>
        <div class={styles.statusTop}>
          <span class={`${styles.recBadge} ${rec ? '' : styles.playBadge}`}>
            <span class={styles.recDot} />
            {rec ? 'REC' : 'PLAYING'}
          </span>
          <span class={styles.partName}>{part?.name ?? ''}</span>
          {song && (
            <span class={`${styles.clock} num`}>
              {fmtTime(pos - song.start)} <span class={styles.dim}>/ −{fmtTime(song.end - pos)}</span>
            </span>
          )}
        </div>
        <div class={styles.bigName}>{song?.name ?? 'Outside any song'}</div>
        {song && (
          <div class={styles.parts}>
            {song.parts.map((p) => (
              <div
                key={p.id}
                class={`${styles.part} ${p.id === part?.id ? styles.partNow : pos >= p.end ? styles.partDone : ''}`}
                style={{ flexGrow: p.end - p.start }}
              >
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'loaded' && queued) {
    return (
      <div class={`${styles.status} ${styles.statusLoaded}`}>
        <div class={`label ${styles.accentLabel}`}>Loaded · sound check</div>
        <div class={styles.bigName}>{queued.name}</div>
        <div class={styles.hint}>Song-start sound is applied. Start when the band is ready.</div>
      </div>
    );
  }

  const ended = st.songs.find((s) => Math.abs(s.end - pos) < 0.05) ?? current;
  return (
    <div class={styles.status}>
      <div class="label">Between songs</div>
      <div>
        <div class={styles.hint}>Up next</div>
        <div class={styles.bigName}>{queued?.name ?? (st.setlist.length ? 'Setlist complete' : 'Nothing queued')}</div>
      </div>
      <div class={styles.hint}>
        {ended ? `Instruments keep the sound of ${ended.name} until you load the next song.` : 'Load a song to apply its sound-check state.'}
      </div>
    </div>
  );
}

function MainButton({ phase, queued, disabled }: { phase: LivePhase; queued: Song | null; disabled: boolean }) {
  if (phase === 'recording' || phase === 'playing') {
    return (
      <HoldButton class={`${styles.main} ${styles.mainStop}`} onHold={stop}>
        <span class={styles.mainBig}>Hold to stop</span>
        <span class={styles.mainSmall}>Keep pressed for one second · song end stops by itself</span>
      </HoldButton>
    );
  }
  if (phase === 'loaded' && queued) {
    return (
      <button class={`${styles.main} ${styles.mainStart}`} disabled={disabled} onClick={() => startLive(queued.id)}>
        <span class={styles.mainSmall}>Start recording</span>
        <span class={styles.mainBig}>{queued.name}</span>
      </button>
    );
  }
  return (
    <button class={`${styles.main} ${styles.mainLoad}`} disabled={disabled || !queued} onClick={() => queued && loadSong(queued.id)}>
      <span class={styles.mainSmall}>Load</span>
      <span class={styles.mainBig}>{queued?.name ?? 'Pick a song'}</span>
    </button>
  );
}

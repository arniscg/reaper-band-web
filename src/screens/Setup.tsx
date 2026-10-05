import { useRef, useState } from 'preact/hooks';
import { Header } from '../components/Header';
import { Stepper } from '../components/Stepper';
import { useStore, showScreen, type State } from '../state/store';
import { isRecordingState, liveTracks, songById } from '../state/derive';
import { loadSong, markProject, ping, reload, setMode, setSetlist, setSettings } from '../state/actions';
import { scripts, scriptsHash } from '../reaper/scripts';
import { requestStats } from '../reaper/web';
import type { Mode, Settings, Song, Tag } from '../reaper/types';
import styles from './Setup.module.css';

export function Setup() {
  const st = useStore();
  const recording = isRecordingState(st.transport?.state);
  const ready = st.bridge === 'ready' && st.connection === 'online';
  const locked = !ready || recording;

  return (
    <>
      <Header kind="setup" />
      {recording && <div class={styles.lockNote}>Recording in progress: changes are locked until it stops.</div>}
      <ModeCard st={st} locked={locked} />
      <SetlistEditor st={st} locked={locked} />
      <SettingsCard settings={st.settings} locked={locked} />
      <Diagnostics st={st} />
    </>
  );
}

const MODE_TABLE: [string, string, string][] = [
  ['[Show] tracks', 'Unmuted', 'Muted'],
  ['[Practice] tracks', 'Muted', 'Unmuted'],
  ['Playrate', '100%', 'Practice tempo'],
  ['Record mode', 'Normal', 'Time-selection auto-punch'],
  ['[Live] tracks', 'All armed', 'Chosen armed, others disarmed'],
  ['Record path', 'Recordings/Live', 'Recordings/Practice'],
];

function ModeCard({ st, locked }: { st: State; locked: boolean }) {
  const mode = st.bridgeStatus?.app?.mode;
  const button = (m: Mode, name: string) => {
    const active = mode === m;
    return (
      <button class={`${styles.modeButton} ${styles[m]} ${active ? styles.modeActive : ''}`} disabled={locked || active || !!st.busy} onClick={() => setMode(m).then((r) => r && showScreen('main'))}>
        {active ? `${name} · active` : `Enter ${name}`}
      </button>
    );
  };
  return (
    <section class="card">
      <div class="label">Mode</div>
      <div class={styles.modeButtons}>
        {button('live', 'Live')}
        {button('practice', 'Practice')}
      </div>
      <table class={styles.modeTable}>
        <tbody>
          {MODE_TABLE.map(([what, live, practice]) => (
            <tr key={what}>
              <td>{what}</td>
              <td class={mode === 'live' ? styles.current : ''}>{live}</td>
              <td class={mode === 'practice' ? styles.current : ''}>{practice}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SetlistEditor({ st, locked }: { st: State; locked: boolean }) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const setlist = st.setlist.map((id) => songById(st.songs, id)).filter((s): s is Song => !!s);

  // While dragging, show the order as it would be after dropping.
  const shown = drag ? moved(setlist, drag.from, drag.to) : setlist;

  const targetIndex = (y: number) => {
    const rects = rowRefs.current.slice(0, setlist.length).map((el) => el?.getBoundingClientRect());
    let idx = 0;
    rects.forEach((r, i) => {
      if (r && y > r.top + r.height / 2) idx = i;
    });
    return idx;
  };

  const onDown = (i: number) => (e: PointerEvent) => {
    if (locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: i, to: i });
  };
  const onMove = (e: PointerEvent) => {
    if (drag) setDrag({ ...drag, to: targetIndex(e.clientY) });
  };
  const onUp = () => {
    if (drag && drag.from !== drag.to) void setSetlist(moved(setlist, drag.from, drag.to).map((s) => s.id));
    setDrag(null);
  };

  const inSetlist = new Set(st.setlist);
  const canLoad = !locked && st.bridgeStatus?.app?.mode === 'live' && !st.busy;

  return (
    <section class={styles.setlistGrid}>
      <div class={`card ${styles.column}`}>
        <div class="label">All songs · Songs lane</div>
        <div class={styles.scroll}>
          {st.songs.map((s) => (
            <div key={s.id} class={`${styles.songRow} ${inSetlist.has(s.id) ? styles.dimRow : ''}`}>
              <span class={styles.songName}>{s.name}</span>
              {inSetlist.has(s.id) ? (
                <span class={styles.small}>In setlist</span>
              ) : (
                <>
                  <button class={styles.smallButton} disabled={!canLoad} onClick={() => loadSong(s.id).then((r) => r && showScreen('main'))}>
                    Load
                  </button>
                  <button class={styles.iconButton} aria-label={`Add ${s.name} to setlist`} disabled={locked} onClick={() => setSetlist([...st.setlist, s.id])}>
                    +
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <div class={`card ${styles.column}`}>
        <div class="label">Setlist · drag to reorder</div>
        <div class={styles.scroll} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
          {shown.map((s, i) => (
            <div key={s.id} ref={(el) => { rowRefs.current[i] = el; }} class={`${styles.setRow} ${drag && s.id === setlist[drag.from].id ? styles.dragging : ''}`}>
              <span class={styles.handle} onPointerDown={onDown(i)} aria-label="Drag to reorder">
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 8h14M5 12h14M5 16h14" /></svg>
              </span>
              <span class={`${styles.setNum} num`}>{i + 1}</span>
              <span class={styles.songName}>{s.name}</span>
              <button class={styles.iconButton} aria-label={`Remove ${s.name} from setlist`} disabled={locked} onClick={() => setSetlist(st.setlist.filter((id) => id !== s.id))}>
                ×
              </button>
            </div>
          ))}
          {setlist.length === 0 && <div class={styles.small}>Empty. Add songs from the left.</div>}
        </div>
      </div>
    </section>
  );
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function SettingsCard({ settings, locked }: { settings: Settings | null; locked: boolean }) {
  if (!settings) return null;
  const change = (key: keyof Settings, value: number, min: number, max: number) =>
    setSettings({ [key]: Math.round(Math.min(max, Math.max(min, value)) * 10) / 10 });
  const item = (label: string, key: keyof Settings, text: string, step: number, min: number, max: number) => (
    <div class={styles.setting}>
      <div class={styles.settingLabel}>{label}</div>
      <Stepper size="small" label={label} value={text} disabled={locked} onDown={() => change(key, settings[key] - step, min, max)} onUp={() => change(key, settings[key] + step, min, max)} />
    </div>
  );
  return (
    <section class="card">
      <div class="label">Settings</div>
      <div class={styles.settings}>
        {item('Song-end tail', 'tail', `${settings.tail} s`, 0.5, 0, 10)}
        {item('Default pre-roll', 'prerollDefault', `${settings.prerollDefault} bars`, 1, 0, 4)}
        {item('[Live] tracks', 'liveCount', String(settings.liveCount), 1, 0, 32)}
        {item('Min. free disk', 'minDiskGB', `${settings.minDiskGB} GB`, 1, 1, 500)}
      </div>
    </section>
  );
}

function Diagnostics({ st }: { st: State }) {
  const [latency, setLatency] = useState<number | null>(null);
  const b = st.bridgeStatus;
  const p = st.project;
  const byTag = (tag: Tag) => st.tracks.filter((t) => t.tags.includes(tag));
  const tagLine = (tag: Tag, name: string) => {
    const list = byTag(tag);
    return `${name} ${list.length}${list.length ? `: ${list.map((t) => t.label).join(', ')}` : ''}`;
  };
  const partCount = st.songs.reduce((n, s) => n + s.parts.length, 0);
  const bridgeText =
    st.connection !== 'online'
      ? 'No connection to REAPER'
      : st.bridge === 'ready'
        ? `Running · session ${b?.session}`
        : st.bridge === 'uploading'
          ? 'Uploading functions…'
          : 'Not running';

  return (
    <section class={`card ${styles.diag}`}>
      <div class={styles.diagHead}>
        <div class="label">Diagnostics</div>
        <div class={styles.diagButtons}>
          <button class={styles.smallButton} disabled={st.bridge !== 'ready'} onClick={async () => setLatency((await ping()) ?? null)}>
            Ping bridge
          </button>
          <button class={styles.smallButton} disabled={st.bridge !== 'ready'} onClick={reload}>
            Reload
          </button>
        </div>
      </div>
      <dl class={styles.grid}>
        <dt>Bridge</dt>
        <dd>
          <span class={styles.dot} style={{ background: st.bridge === 'ready' ? 'var(--ok)' : 'var(--rec)' }} />
          {bridgeText}
          {latency !== null && ` · round trip ${latency} ms`}
        </dd>
        <dt>Web requests</dt>
        <dd>
          {requestStats.count} answered · average {requestStats.count ? Math.round(requestStats.totalMs / requestStats.count) : 0} ms · slowest{' '}
          {Math.round(requestStats.maxMs)} ms ·{' '}
          <span class={requestStats.timeouts ? styles.bad : ''}>{requestStats.timeouts} timed out</span>
          {requestStats.failures > 0 && <span class={styles.bad}> · {requestStats.failures} failed</span>}
        </dd>
        <dt>Last event</dt>
        <dd>{b?.app?.event?.message ?? '—'}</dd>
        <dt>Functions</dt>
        <dd>
          {scripts.length} Lua files · {b?.lib === scriptsHash ? 'uploaded' : 'not uploaded'} ({scriptsHash})
        </dd>
        {b?.err && (
          <>
            <dt>Bridge error</dt>
            <dd class={styles.bad}>{b.err}</dd>
          </>
        )}
        <dt>REAPER</dt>
        <dd>{p?.reaperVersion ?? '—'}</dd>
        <dt>Project</dt>
        <dd>
          {p ? (
            <>
              {p.name} · {!p.saved && <span class={styles.bad}>never saved · </span>}
              {p.marker ? 'band project marker found' : <span class={styles.bad}>no band project marker</span>}
              {!p.marker && (
                <button class={`${styles.smallButton} ${styles.inline}`} disabled={st.bridge !== 'ready'} onClick={markProject}>
                  Mark as band project
                </button>
              )}
            </>
          ) : (
            '—'
          )}
        </dd>
        {p && p.missingActions.length > 0 && (
          <>
            <dt>REAPER actions</dt>
            <dd class={styles.bad}>
              Not found: {p.missingActions.join('; ')}
            </dd>
          </>
        )}
        {p?.stopMarker && (
          <>
            <dt>Stop at end</dt>
            <dd>
              {p.stopMarker.ok ? (
                'REAPER stops takes itself (SWS stop marker), even if the bridge stops'
              ) : (
                <span class={styles.warn}>
                  {p.stopMarker.problem}. Takes are stopped by the bridge instead, so if the bridge itself stops mid-song, nothing stops the take.
                </span>
              )}
            </dd>
          </>
        )}
        <dt>Track tags</dt>
        <dd>
          <div>{tagLine('live', '[Live]')}</div>
          <div>{tagLine('show', '[Show]')}</div>
          <div>{tagLine('practice', '[Practice]')}</div>
          {st.settings && liveTracks(st.tracks).length !== st.settings.liveCount && (
            <div class={styles.bad}>Expected {st.settings.liveCount} [Live] tracks</div>
          )}
        </dd>
        <dt>Region lanes</dt>
        <dd>
          {p ? (
            <>
              <span class={p.lanes.songs ? '' : styles.bad}>Songs {p.lanes.songs ? `(${st.songs.length})` : 'not found'}</span> ·{' '}
              <span class={p.lanes.parts ? '' : styles.bad}>Parts {p.lanes.parts ? `(${partCount})` : 'not found'}</span>
              {p.laneInfo && (
                <div class={styles.small}>
                  REAPER has {p.laneCount ?? '?'} lanes:{' '}
                  {p.laneInfo.map((l) => `#${l.lane} ${l.name === undefined ? '(no name)' : `"${l.name}"`} ${l.regions} regions`).join(' · ') || 'none'}
                </div>
              )}
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt>Record path</dt>
        <dd>{p?.recordPath ?? '—'}</dd>
        <dt>Free disk</dt>
        <dd class={p && st.settings && p.freeDiskMB < st.settings.minDiskGB * 1024 ? styles.bad : ''}>
          {!p ? '—' : p.freeDiskMB < 0 ? 'unknown (the record folder may not exist yet)' : `${(p.freeDiskMB / 1024).toFixed(1)} GB`}
        </dd>
      </dl>
    </section>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { useStore, showScreen } from '../state/store';
import { dismissError, dismissWarning } from '../state/actions';
import styles from './Notices.module.css';

const WATCHDOG_ACK_KEY = 'bandremote.watchdogAck';

/** Refusals and failures in big letters, until tapped away. */
export function ErrorOverlay() {
  const { error } = useStore();
  if (!error) return null;
  return (
    <div class={styles.overlay} onClick={dismissError}>
      <div class={styles.errorCard} role="alert">
        <div class="label">Not done</div>
        <div class={styles.errorText}>{error}</div>
        <button class={styles.okButton}>OK</button>
      </div>
    </div>
  );
}

/** Warnings that stay on screen: unconfirmed recording, watchdog stop, connection problems. */
export function Banners() {
  const st = useStore();
  const watchdog = st.bridgeStatus?.app?.watchdog ?? null;
  const [ackSeq, setAckSeq] = useState(() => Number(readStorage(WATCHDOG_ACK_KEY) ?? 0));
  useEffect(() => writeStorage(WATCHDOG_ACK_KEY, String(ackSeq)), [ackSeq]);

  const items: { text: string; tone: 'bad' | 'warn'; onDismiss?: () => void }[] = [];
  if (st.connection === 'offline') items.push({ text: 'Cannot reach REAPER. Check the network and that REAPER is running.', tone: 'bad' });
  else if (st.bridge === 'down') items.push({ text: 'The REAPER bridge script is not running. Controls are unavailable.', tone: 'bad' });
  if (st.warning) items.push({ text: st.warning, tone: 'bad', onDismiss: dismissWarning });
  if (watchdog && watchdog.seq > ackSeq) items.push({ text: `Watchdog: ${watchdog.message}`, tone: 'warn', onDismiss: () => setAckSeq(watchdog.seq) });

  if (!items.length) return null;
  return (
    <div class={styles.banners}>
      {items.map((b) => (
        <div class={`${styles.banner} ${styles[b.tone]}`} key={b.text}>
          <span>{b.text}</span>
          {b.onDismiss && (
            <button class={styles.dismiss} onClick={b.onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Replaces the Live/Practice screen when the active project isn't the band project. */
export function NotBandProject() {
  return (
    <div class={`card ${styles.blocker}`}>
      <div class={styles.blockerTitle}>This is not the band project</div>
      <p>The active REAPER project has no band marker, so the remote won't control it. Open the band project, or mark this one in Setup.</p>
      <button class={styles.okButton} onClick={() => showScreen('setup')}>
        Open setup
      </button>
    </div>
  );
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: not remembered */
  }
}

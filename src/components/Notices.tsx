import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, showScreen } from '../state/store';
import { dismissError, dismissWarning } from '../state/actions';
import styles from './Notices.module.css';

const WATCHDOG_ACK_KEY = 'bandremote.watchdogAck';

/** Refusals and failures: the first line in big letters, details (Lua
 *  tracebacks) small below, until dismissed. */
export function ErrorOverlay() {
  const { error } = useStore();
  if (!error) return null;
  const [headline, ...rest] = error.split('\n');
  const details = rest.join('\n').trim();
  return (
    <div class={styles.overlay}>
      <div class={styles.errorCard} role="alert">
        <div class="label">Not done</div>
        <div class={styles.errorText}>{headline}</div>
        {details && <pre class={styles.details}>{details}</pre>}
        <button class={styles.okButton} onClick={dismissError}>
          OK
        </button>
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
  const [dismissedErr, setDismissedErr] = useState<string | null>(null);
  const loopErr = st.bridgeStatus?.err ?? null;

  const items: { text: string; tone: 'bad' | 'warn'; onDismiss?: () => void }[] = [];
  if (st.connection === 'offline') items.push({ text: 'Cannot reach REAPER. Check the network and that REAPER is running.', tone: 'bad' });
  else if (st.bridge === 'down') items.push({ text: 'The REAPER bridge script is not running. Controls are unavailable.', tone: 'bad' });
  if (st.warning) items.push({ text: st.warning, tone: 'bad', onDismiss: dismissWarning });
  if (loopErr && loopErr !== dismissedErr && st.bridge === 'ready') items.push({ text: `Bridge error: ${loopErr}`, tone: 'bad', onDismiss: () => setDismissedErr(loopErr) });
  if (watchdog && watchdog.seq > ackSeq) items.push({ text: `Watchdog: ${watchdog.message}`, tone: 'warn', onDismiss: () => setAckSeq(watchdog.seq) });

  if (!items.length) return null;
  return (
    <div class={styles.banners}>
      {items.map((b) => (
        <div class={`${styles.banner} ${styles[b.tone]}`} key={b.text}>
          <span class={styles.bannerText}>{b.text}</span>
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

/** Short message after each take ("Northern Lights saved · REAPER stopped at
 *  the end"), shown for a few seconds. Events from before the page loaded
 *  are not shown. */
export function EventToast() {
  const st = useStore();
  const event = st.bridgeStatus?.app?.event ?? null;
  const seen = useRef<number | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  const app = st.bridgeStatus?.app;
  useEffect(() => {
    // Wait for the functions' status (absent while they upload), so the
    // starting point is the real last event, not "none yet".
    if (!app) return;
    const seq = event?.seq ?? 0;
    if (seen.current === null) {
      seen.current = seq; // first status after load: remember, don't show
      return;
    }
    if (event && seq > seen.current) {
      seen.current = seq;
      setShown(event.message);
      const t = setTimeout(() => setShown(null), 6000);
      return () => clearTimeout(t);
    }
  }, [event?.seq, !!app]);

  if (!shown) return null;
  return (
    <div class={styles.toast} role="status" onClick={() => setShown(null)}>
      {shown}
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

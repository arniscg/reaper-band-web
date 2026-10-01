import type { ComponentChildren } from 'preact';
import { useStore, showScreen } from '../state/store';
import styles from './Header.module.css';

type Kind = 'live' | 'practice' | 'setup';

const PILL: Record<Kind, string> = { live: 'Live', practice: 'Practice', setup: 'Setup' };

export function Header({ kind, children }: { kind: Kind; children?: ComponentChildren }) {
  const st = useStore();
  const conn = connectionChip(st.connection, st.bridge);

  return (
    <header class={styles.header}>
      <div class={`${styles.pill} ${styles[kind]}`}>{PILL[kind]}</div>
      <div class={styles.title}>{st.project?.name.replace(/\.rpp$/i, '') ?? 'REAPER'}</div>
      {children}
      <div class={styles.chip}>
        <span class={styles.dot} style={{ background: conn.color }} />
        {conn.label}
      </div>
      {kind === 'setup' ? (
        <button class={styles.iconButton} aria-label="Close setup" onClick={() => showScreen('main')}>
          <svg viewBox="0 0 24 24" width="26" height="26" class={styles.icon}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : (
        <button class={styles.iconButton} aria-label="Open setup" onClick={() => showScreen('setup')}>
          <svg viewBox="0 0 24 24" width="26" height="26" class={styles.icon}>
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        </button>
      )}
    </header>
  );
}

export function Chip({ children }: { children: ComponentChildren }) {
  return <div class={styles.chip}>{children}</div>;
}

function connectionChip(connection: string, bridge: string) {
  if (connection === 'offline') return { label: 'No REAPER', color: 'var(--rec)' };
  if (connection === 'connecting') return { label: 'Connecting', color: 'var(--faint)' };
  if (bridge === 'down') return { label: 'Bridge down', color: 'var(--warn)' };
  if (bridge === 'uploading') return { label: 'Loading', color: 'var(--warn)' };
  if (bridge === 'ready') return { label: 'REAPER', color: 'var(--ok)' };
  return { label: 'REAPER', color: 'var(--faint)' };
}

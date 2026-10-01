import { useStore } from './state/store';
import { Live } from './screens/Live';
import { Practice } from './screens/Practice';
import { Setup } from './screens/Setup';
import { Banners, ErrorOverlay, NotBandProject } from './components/Notices';
import { Header } from './components/Header';
import styles from './App.module.css';

export function App() {
  const st = useStore();
  const mode = st.bridgeStatus?.app?.mode ?? st.project?.mode ?? 'live';
  const kind = st.screen === 'setup' ? 'setup' : mode;

  return (
    <div class={`${styles.app} ${kind === 'setup' ? styles.scrolling : ''}`} data-mode={kind}>
      <Banners />
      {kind === 'setup' ? <Setup /> : <Main mode={mode} />}
      <ErrorOverlay />
    </div>
  );
}

function Main({ mode }: { mode: 'live' | 'practice' }) {
  const st = useStore();
  const marker = st.bridgeStatus?.app?.marker ?? st.project?.marker;

  if (!st.project) {
    return (
      <>
        <Header kind={mode} />
        <div class={`card ${styles.waiting}`}>
          {st.connection === 'offline'
            ? 'Waiting for REAPER…'
            : st.bridge === 'down'
              ? 'Waiting for the bridge script in REAPER…'
              : 'Loading the project…'}
        </div>
      </>
    );
  }
  if (marker === false) {
    return (
      <>
        <Header kind={mode} />
        <NotBandProject />
      </>
    );
  }
  return mode === 'practice' ? <Practice /> : <Live />;
}

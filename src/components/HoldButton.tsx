import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import styles from './HoldButton.module.css';

/** Fires onHold only after the button is kept pressed for `ms` (accidental-tap guard). */
export function HoldButton({
  ms = 1000,
  onHold,
  class: className = '',
  children,
}: {
  ms?: number;
  onHold: () => void;
  class?: string;
  children: ComponentChildren;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };

  const begin = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onHold();
    }, ms);
  };

  useEffect(() => cancel, []);

  return (
    <button
      class={`${styles.hold} ${className}`}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class={styles.fill} style={{ width: holding ? '100%' : '0%', transitionDuration: holding ? `${ms}ms` : '0ms' }} />
      <span class={styles.content}>{children}</span>
    </button>
  );
}

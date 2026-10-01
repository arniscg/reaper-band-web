import styles from './Stepper.module.css';

/** − value + control for pre-roll, tempo and numeric settings. */
export function Stepper({
  value,
  label,
  onDown,
  onUp,
  disabled,
  size = 'large',
}: {
  value: string;
  label: string;
  onDown: () => void;
  onUp: () => void;
  disabled?: boolean;
  size?: 'large' | 'small';
}) {
  return (
    <div class={`${styles.stepper} ${styles[size]}`}>
      <button class={styles.button} aria-label={`Less ${label}`} onClick={onDown} disabled={disabled}>
        −
      </button>
      <div class={`${styles.value} num`}>{value}</div>
      <button class={styles.button} aria-label={`More ${label}`} onClick={onUp} disabled={disabled}>
        +
      </button>
    </div>
  );
}

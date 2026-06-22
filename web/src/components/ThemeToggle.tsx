/**
 * Light / Dark / System theme switcher for the Branchwater (bw) web UI.
 *
 * A compact segmented control bound to {@link useTheme}. Selecting an option
 * updates (and persists) the preference; `System` follows the OS. The active
 * segment is reflected with `aria-pressed` for assistive tech.
 *
 * @module components/ThemeToggle
 */

import { useTheme, type ThemePreference } from '../theme';
import { cx } from './ui';

/** The three options, in display order. */
const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'system', label: 'System', icon: '🖥' },
];

/** Segmented light/dark/system control. */
export function ThemeToggle(): React.JSX.Element {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            title={`${opt.label} theme`}
            onClick={() => setPreference(opt.value)}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors',
              active
                ? 'bg-surface text-content shadow-card'
                : 'text-content-muted hover:text-content',
            )}
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;

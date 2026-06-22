/**
 * Theme system for the Branchwater (bw) web UI.
 *
 * Exposes a {@link ThemeProvider} + {@link useTheme} hook implementing a
 * three-way preference — `light` / `dark` / `system` — defaulting to `system`
 * (follow the OS via `prefers-color-scheme`). The chosen preference is persisted
 * to `localStorage` and applied by setting `data-theme="light|dark"` on the
 * <html> element, which drives the CSS-variable tokens in `index.css` (and thus
 * every Tailwind `surface`/`content`/`accent`/… utility).
 *
 * A matching pre-paint script in `index.html` applies the SAME resolution before
 * React mounts, so there is no light/dark flash on load; this provider keeps the
 * attribute in sync afterwards and re-resolves `system` when the OS theme flips.
 *
 * @module theme
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** The user-selectable theme preference. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** The concrete theme actually applied (after resolving `system`). */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key holding the persisted {@link ThemePreference}. */
export const THEME_STORAGE_KEY = 'bw-theme';

/** Value exposed by {@link useTheme}. */
export interface ThemeContextValue {
  /** The user's preference (`light` / `dark` / `system`). */
  preference: ThemePreference;
  /** The concrete theme in effect right now (`system` resolved against the OS). */
  resolved: ResolvedTheme;
  /** Update (and persist) the preference. */
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The media query used to resolve the `system` preference. */
function darkQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

/** Read the persisted preference, defaulting to `system` (and on any failure). */
function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore (private mode / disabled storage)
  }
  return 'system';
}

/** Resolve a preference to the concrete theme to apply. */
function resolvePreference(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return darkQuery()?.matches ? 'dark' : 'light';
  return pref;
}

/** Reflect the resolved theme onto the document element. */
function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}

/**
 * Provide the theme context to the app. Resolves and applies the persisted
 * preference on mount, persists changes, and re-resolves `system` when the OS
 * theme changes while the user is on `system`.
 */
export function ThemeProvider(props: { children: ReactNode }): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(),
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolvePreference(preference),
  );

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    const next = resolvePreference(preference);
    setResolved(next);
    applyResolved(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // ignore persistence failure
    }
  }, [preference]);

  // While on `system`, follow live OS theme changes.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = darkQuery();
    if (mq === null) return;
    const onChange = (): void => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyResolved(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

/**
 * Access the current theme preference + resolved theme and a setter.
 *
 * @throws {Error} when called outside a {@link ThemeProvider}.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}

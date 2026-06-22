/**
 * Theme preference helpers for the Branchwater site — light / dark / system,
 * applied by setting `data-theme` on <html> (which drives the CSS tokens in
 * globals.css). A pre-paint inline script in `layout.tsx` mirrors this logic so
 * there is no flash before React hydrates.
 */

export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "bw-site-theme";

/** Resolve a preference to the concrete theme to apply (`system` → OS). */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

/** Read the saved preference, defaulting to `system`. */
export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

/** Apply (and reflect) a preference; notifies effects to recolor via `bw-theme`. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("bw-theme"));
}

/** Inline script source applied before paint to avoid a light/dark flash. */
export const PREPAINT_THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

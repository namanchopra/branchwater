/** @type {import('tailwindcss').Config} */

/*
 * Branchwater web UI — Tailwind theme.
 *
 * Theming is done with SEMANTIC tokens backed by CSS custom properties (defined
 * in src/index.css for `:root` = light and `[data-theme="dark"]` = dark). Because
 * the colors below resolve to `var(--bw-*)`, a single set of utility classes
 * (`bg-surface`, `text-content`, `border-line`, `text-accent-text`, …) renders
 * correctly in BOTH themes with NO `dark:` variants in component code — flipping
 * `data-theme` on <html> re-themes everything. Keep all color usage on these
 * tokens (never raw `slate-*`/`rose-*`) so the two themes stay in lockstep.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bw-bg)',
        overlay: 'var(--bw-overlay)',
        surface: {
          DEFAULT: 'var(--bw-surface)',
          muted: 'var(--bw-surface-2)',
          strong: 'var(--bw-surface-3)',
        },
        line: {
          DEFAULT: 'var(--bw-border)',
          strong: 'var(--bw-border-strong)',
        },
        content: {
          DEFAULT: 'var(--bw-text)',
          muted: 'var(--bw-text-2)',
          faint: 'var(--bw-text-3)',
        },
        accent: {
          DEFAULT: 'var(--bw-accent)',
          weak: 'var(--bw-accent-weak)',
          text: 'var(--bw-accent-text)',
          ink: 'var(--bw-accent-ink)',
        },
        danger: {
          DEFAULT: 'var(--bw-danger)',
          weak: 'var(--bw-danger-weak)',
          text: 'var(--bw-danger-text)',
        },
        warn: {
          DEFAULT: 'var(--bw-warn)',
          weak: 'var(--bw-warn-weak)',
          text: 'var(--bw-warn-text)',
        },
        head: {
          DEFAULT: 'var(--bw-head)',
          weak: 'var(--bw-head-weak)',
          text: 'var(--bw-head-text)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        card: 'var(--bw-shadow)',
        pop: 'var(--bw-shadow-lg)',
      },
    },
  },
  plugins: [],
};

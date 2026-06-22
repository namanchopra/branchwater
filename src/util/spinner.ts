/**
 * Tiny, dependency-free terminal spinner for Branchwater (bw).
 *
 * Long-running engine operations (dump/restore) benefit from a live activity
 * indicator. Rather than pull in an external spinner library, this module
 * renders a single animated line on **stderr** using `setInterval`, leaving
 * stdout untouched for machine-readable output.
 *
 * The spinner is deliberately inert when it would do more harm than good:
 * - In `--json` mode it must not emit decorative frames.
 * - When stderr is not a TTY (piped, redirected, CI logs) animation would just
 *   spam newlines, so it becomes a no-op.
 *
 * @module util/spinner
 */

/**
 * Options controlling whether the spinner animates.
 */
export interface SpinnerOptions {
  /** When `true`, the spinner is a no-op (machine-readable output). */
  json?: boolean;
  /**
   * Override TTY detection. Defaults to `process.stderr.isTTY`. When the
   * effective value is falsy the spinner becomes a no-op.
   */
  isTTY?: boolean;
  /** Frame interval in milliseconds. Defaults to 80ms. */
  intervalMs?: number;
}

/**
 * A running or idle spinner handle.
 *
 * All methods are safe to call in any state and any mode; when the spinner is a
 * no-op they simply do nothing.
 */
export interface Spinner {
  /**
   * Begin animating with the given label (replacing any current label).
   * @param text - Message shown next to the animated frame.
   */
  start(text: string): void;
  /**
   * Stop animation and print a success line.
   * @param text - Optional final message; defaults to the current label.
   */
  succeed(text?: string): void;
  /**
   * Stop animation and print a failure line.
   * @param text - Optional final message; defaults to the current label.
   */
  fail(text?: string): void;
  /** Stop animation and clear the line without printing a result. */
  stop(): void;
}

/** Braille animation frames cycled while the spinner is active. */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/**
 * A {@link Spinner} whose methods do nothing.
 *
 * Used in JSON mode and on non-TTY streams so callers can drive a spinner
 * unconditionally without branching at every call site.
 */
const NOOP_SPINNER: Spinner = {
  start(): void {
    /* no-op */
  },
  succeed(): void {
    /* no-op */
  },
  fail(): void {
    /* no-op */
  },
  stop(): void {
    /* no-op */
  },
};

/** ANSI control: erase the current line and return the cursor to its start. */
const CLEAR_LINE = "\r\x1b[K";

/**
 * Create a spinner bound to the given output policy.
 *
 * Returns a no-op spinner when {@link SpinnerOptions.json} is set or when the
 * (effective) stderr stream is not a TTY. Otherwise returns an animated spinner
 * that writes frames to stderr via `setInterval`.
 *
 * @param opts - JSON-mode flag and optional TTY/interval overrides.
 * @returns A {@link Spinner} handle.
 */
export function createSpinner(opts: SpinnerOptions = {}): Spinner {
  const isTTY = opts.isTTY ?? process.stderr.isTTY === true;
  if (opts.json === true || !isTTY) {
    return NOOP_SPINNER;
  }

  const intervalMs = opts.intervalMs ?? 80;
  let timer: NodeJS.Timeout | null = null;
  let frame = 0;
  let label = "";

  /** Render the current frame + label, overwriting the active line. */
  const render = (): void => {
    const glyph = FRAMES[frame % FRAMES.length];
    frame += 1;
    process.stderr.write(`${CLEAR_LINE}${glyph} ${label}`);
  };

  /** Tear down the interval timer if one is running. */
  const clearTimer = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  /**
   * Stop the animation, clear the line, and optionally print a final line.
   * @param finalLine - Completed line to print, or `null` to leave the line blank.
   */
  const settle = (finalLine: string | null): void => {
    clearTimer();
    process.stderr.write(CLEAR_LINE);
    if (finalLine !== null) {
      process.stderr.write(`${finalLine}\n`);
    }
  };

  return {
    start(text: string): void {
      label = text;
      if (timer !== null) {
        // Already running: just adopt the new label.
        return;
      }
      frame = 0;
      render();
      timer = setInterval(render, intervalMs);
      // Don't let the spinner keep the process alive on its own.
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    },
    succeed(text?: string): void {
      settle(`✓ ${text ?? label}`);
    },
    fail(text?: string): void {
      settle(`x ${text ?? label}`);
    },
    stop(): void {
      settle(null);
    },
  };
}

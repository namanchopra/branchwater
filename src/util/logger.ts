/**
 * Core logging implementation for Branchwater (bw).
 *
 * The orchestrator and CLI own all output policy — verbosity and JSON mode —
 * and hand adapters a plain {@link AdapterLogger} so engine plugins never make
 * presentation decisions. This module is that policy: it produces an
 * `AdapterLogger` whose behavior is configured once at startup.
 *
 * Output stream choice: human-facing decorative lines (info/warn/error/success/
 * debug) are written to **stderr**, leaving **stdout** free for machine-readable
 * payloads (e.g. the `--json` result of a command). In JSON mode this logger
 * suppresses color and decorative symbols entirely, so nothing it emits ever
 * contaminates stdout with ANSI escape codes.
 *
 * @module util/logger
 */

import pc from "picocolors";

import type { AdapterLogger } from "../core/adapter/types";

/**
 * Options controlling how a logger renders messages.
 */
export interface LoggerOptions {
  /**
   * When `true`, {@link AdapterLogger.debug} messages are emitted. When falsy,
   * debug output is suppressed entirely.
   */
  verbose?: boolean;
  /**
   * When `true`, the logger runs in machine-readable mode: no ANSI color and no
   * decorative symbols. Diagnostic lines still go to stderr (never stdout), so a
   * command's JSON payload on stdout stays clean.
   */
  json?: boolean;
}

/**
 * Decorative prefix glyphs used in human (non-JSON) mode.
 *
 * Kept ASCII-friendly so they degrade gracefully on terminals without rich
 * Unicode support.
 */
const SYMBOLS = {
  info: "i",
  warn: "!",
  error: "x",
  success: "✓",
  debug: "·",
} as const;

/**
 * Create an {@link AdapterLogger} bound to the given output policy.
 *
 * The returned object is assignable to `AdapterLogger` and is what the
 * orchestrator threads into every {@link AdapterContext}.
 *
 * Behavior:
 * - `info` / `warn` / `error` / `success` always print to **stderr**.
 * - `debug` prints to **stderr** only when {@link LoggerOptions.verbose} is set.
 * - In {@link LoggerOptions.json} mode, no color and no decorative symbols are
 *   emitted, guaranteeing stdout is never touched by this logger.
 *
 * @param opts - Verbosity and JSON-mode flags.
 * @returns A logger implementing {@link AdapterLogger}.
 */
export function createLogger(opts: LoggerOptions = {}): AdapterLogger {
  const verbose = opts.verbose === true;
  const json = opts.json === true;

  /**
   * Render and write a single line to stderr, applying decoration unless we are
   * in JSON mode.
   *
   * @param symbol - The decorative glyph for this level.
   * @param paint - Color function applied to the symbol in human mode.
   * @param message - The caller-supplied message text.
   */
  const write = (
    symbol: string,
    paint: (s: string) => string,
    message: string,
  ): void => {
    if (json) {
      // Machine-readable mode: plain text, no symbols, no ANSI. Still stderr so
      // stdout is reserved for the command's JSON payload.
      process.stderr.write(`${message}\n`);
      return;
    }
    process.stderr.write(`${paint(symbol)} ${message}\n`);
  };

  return {
    info(m: string): void {
      write(SYMBOLS.info, pc.blue, m);
    },
    warn(m: string): void {
      write(SYMBOLS.warn, pc.yellow, m);
    },
    error(m: string): void {
      write(SYMBOLS.error, pc.red, m);
    },
    success(m: string): void {
      write(SYMBOLS.success, pc.green, m);
    },
    debug(m: string): void {
      if (!verbose) return;
      // Dim the whole debug line in human mode to visually de-emphasize it.
      if (json) {
        process.stderr.write(`${m}\n`);
        return;
      }
      process.stderr.write(`${pc.dim(`${SYMBOLS.debug} ${m}`)}\n`);
    },
  };
}

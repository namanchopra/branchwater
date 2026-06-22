import { spawn } from "node:child_process";

/**
 * Options accepted by {@link exec}.
 */
export interface ExecOptions {
  /** Environment variables for the child process. Defaults to the parent process env. */
  env?: NodeJS.ProcessEnv;
  /** Working directory for the child process. */
  cwd?: string;
  /** Abort signal; aborting kills the child process and rejects the promise. */
  signal?: AbortSignal;
  /** Optional data written to the child's stdin and then closed. */
  input?: string | Buffer;
}

/**
 * Successful result of an {@link exec} call.
 */
export interface ExecResult {
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
}

/**
 * Error thrown when a command exits with a non-zero status, is terminated by a
 * signal, fails to spawn, or is aborted.
 */
export class ExecError extends Error {
  /** Numeric exit code, or null if the process was killed by a signal. */
  public readonly code: number | null;
  /** Terminating signal, if any. */
  public readonly signal: NodeJS.Signals | null;
  /** Captured standard output up to termination. */
  public readonly stdout: string;
  /** Captured standard error up to termination. */
  public readonly stderr: string;

  constructor(
    message: string,
    info: {
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
    },
  ) {
    super(message);
    this.name = "ExecError";
    this.code = info.code;
    this.signal = info.signal;
    this.stdout = info.stdout;
    this.stderr = info.stderr;
  }
}

/**
 * Run a command safely WITHOUT a shell. Arguments are passed as an array, so
 * shell metacharacters in `args` are treated literally and never interpreted.
 *
 * Resolves with `{ stdout, stderr }` when the command exits with code 0.
 * Rejects with an {@link ExecError} (carrying `code` and `stderr`) on any
 * non-zero exit, signal termination, spawn failure, or abort.
 *
 * @param cmd  The executable to run (not a shell string).
 * @param args Arguments passed verbatim to the executable.
 * @param opts Optional env, cwd, abort signal, and stdin input.
 */
export function exec(
  cmd: string,
  args: string[] = [],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(
        new ExecError(`Command aborted before start: ${cmd}`, {
          code: null,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      );
      return;
    }

    const child = spawn(cmd, args, {
      // Never use a shell: args are passed as an array and treated literally.
      shell: false,
      ...(opts.env !== undefined ? { env: opts.env } : {}),
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const collectStdout = (): string =>
      Buffer.concat(stdoutChunks).toString("utf8");
    const collectStderr = (): string =>
      Buffer.concat(stderrChunks).toString("utf8");

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      const aborted = err.name === "AbortError";
      reject(
        new ExecError(
          aborted ? `Command aborted: ${cmd}` : `Failed to spawn ${cmd}: ${err.message}`,
          {
            code: typeof err.code === "number" ? err.code : null,
            signal: null,
            stdout: collectStdout(),
            stderr: collectStderr(),
          },
        ),
      );
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      const stdout = collectStdout();
      const stderr = collectStderr();
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const reason =
        signal !== null
          ? `terminated by signal ${signal}`
          : `exited with code ${code ?? "unknown"}`;
      reject(
        new ExecError(`Command "${cmd}" ${reason}: ${stderr.trim()}`, {
          code,
          signal,
          stdout,
          stderr,
        }),
      );
    });

    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input);
    } else {
      child.stdin?.end();
    }
  });
}

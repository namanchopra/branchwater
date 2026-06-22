/**
 * Branchwater configuration types.
 *
 * These types describe the user-supplied `bw.config.json`. The core engine is
 * deliberately engine-agnostic: the `connection` object of each engine entry is
 * OPAQUE to the core and is validated only by the concrete engine adapter.
 */

/**
 * Configuration for a single database engine instance that Branchwater manages.
 */
export interface EngineConfigEntry {
  /** Unique, human-friendly name for this engine within the project. */
  name: string;
  /** Adapter type discriminator, e.g. "postgres". Resolved via the registry. */
  type: string;
  /**
   * Opaque connection details for the engine. Shape is defined and validated
   * solely by the engine adapter (e.g. via its own zod schema). The core never
   * inspects individual keys.
   */
  connection: Record<string, unknown>;
}

/**
 * Top-level Branchwater configuration loaded from `bw.config.json`.
 */
export interface BwConfig {
  /** Schema version. Currently always `1`. */
  version: 1;
  /** One or more engines that Branchwater snapshots and restores. */
  engines: EngineConfigEntry[];
}

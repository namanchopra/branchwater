/**
 * Engine-agnostic adapter registry for Branchwater (bw).
 *
 * The registry is the indirection that lets the core operate on database
 * engines without ever naming a concrete one. It maps a string engine `type`
 * (e.g. `"postgres"`) to an {@link AdapterFactory}, and hands back a freshly
 * built {@link EngineAdapter} on demand. Only the composition root
 * (`src/cli/index.ts`) registers concrete factories; everything else resolves
 * through this surface and stays free of any `src/adapters/**` import.
 *
 * Factories (not instances) are stored so adapters are constructed lazily and
 * independently per resolution — no shared mutable engine state leaks between
 * operations.
 *
 * @module core/adapter/registry
 */

import type { AdapterFactory, EngineAdapter } from "./types";

/**
 * In-memory map from engine `type` to its {@link AdapterFactory}.
 *
 * Populated at startup by the composition root and consumed by the
 * orchestrator. Registering the same type twice replaces the prior factory,
 * letting later registrations (or tests) override earlier ones deterministically.
 */
export class AdapterRegistry {
  /** Backing store of engine type -> factory. */
  private readonly factories = new Map<string, AdapterFactory>();

  /**
   * Register a factory under an engine `type`.
   *
   * A later registration of the same `type` overrides the earlier one. The
   * factory is invoked only on {@link resolve}, so registration itself never
   * constructs an adapter or triggers engine side effects.
   *
   * @param type Stable, lowercase engine discriminator (e.g. `"postgres"`).
   * @param factory Zero-argument factory producing a fresh {@link EngineAdapter}.
   */
  register(type: string, factory: AdapterFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Report whether a factory is registered for the given engine `type`.
   *
   * @param type Engine discriminator to look up.
   * @returns `true` if a factory exists for `type`, otherwise `false`.
   */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * Resolve an engine `type` to a freshly built {@link EngineAdapter}.
   *
   * Each call invokes the registered factory, so callers receive an independent
   * adapter instance.
   *
   * @param type Engine discriminator to resolve.
   * @returns A new {@link EngineAdapter} produced by the registered factory.
   * @throws {Error} If no factory is registered for `type`; the message names
   *   the missing type and lists the currently known types.
   */
  resolve(type: string): EngineAdapter {
    const factory = this.factories.get(type);
    if (!factory) {
      const known = this.knownTypes();
      const knownList = known.length > 0 ? known.join(", ") : "(none)";
      throw new Error(
        `No adapter registered for engine type "${type}". Known types: ${knownList}.`,
      );
    }
    return factory();
  }

  /**
   * List the engine types that currently have a registered factory.
   *
   * @returns The known engine types, sorted for stable, deterministic output.
   */
  knownTypes(): string[] {
    return [...this.factories.keys()].sort();
  }
}

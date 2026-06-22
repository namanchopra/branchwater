/**
 * Unit tests for {@link AdapterRegistry}.
 *
 * Covers the indirection that keeps the core engine-agnostic: registering a
 * factory, resolving it to a fresh adapter, reporting known types, and the
 * failure mode where an unregistered type is resolved (the error must name the
 * missing type and list the currently known types).
 */

import { AdapterRegistry } from "../../src/core/adapter/registry";
import type { AdapterFactory, EngineAdapter } from "../../src/core/adapter/types";

/**
 * Build a minimal, no-op {@link EngineAdapter} for the given `type`. The method
 * bodies are never exercised here — tests only assert identity and `type`.
 */
function makeAdapter(type: string): EngineAdapter {
  return {
    type,
    validate: async () => {},
    snapshot: async () => ({ id: `${type}_snap` }),
    restore: async () => {},
    list: async () => [],
    delete: async () => {},
  };
}

describe("AdapterRegistry", () => {
  it("registers a factory and reports it via has() and knownTypes()", () => {
    const registry = new AdapterRegistry();
    expect(registry.has("postgres")).toBe(false);
    expect(registry.knownTypes()).toEqual([]);

    registry.register("postgres", () => makeAdapter("postgres"));

    expect(registry.has("postgres")).toBe(true);
    expect(registry.knownTypes()).toEqual(["postgres"]);
  });

  it("resolve() returns an adapter produced by the registered factory", () => {
    const registry = new AdapterRegistry();
    registry.register("postgres", () => makeAdapter("postgres"));

    const adapter = registry.resolve("postgres");

    expect(adapter.type).toBe("postgres");
  });

  it("resolve() invokes the factory on every call, yielding fresh instances", () => {
    const registry = new AdapterRegistry();
    let built = 0;
    const factory: AdapterFactory = () => {
      built += 1;
      return makeAdapter("postgres");
    };
    registry.register("postgres", factory);

    const first = registry.resolve("postgres");
    const second = registry.resolve("postgres");

    expect(built).toBe(2);
    expect(first).not.toBe(second);
  });

  it("knownTypes() returns the registered types sorted for stable output", () => {
    const registry = new AdapterRegistry();
    registry.register("postgres", () => makeAdapter("postgres"));
    registry.register("mysql", () => makeAdapter("mysql"));
    registry.register("sqlite", () => makeAdapter("sqlite"));

    expect(registry.knownTypes()).toEqual(["mysql", "postgres", "sqlite"]);
  });

  it("register() with the same type overrides the prior factory", () => {
    const registry = new AdapterRegistry();
    registry.register("postgres", () => makeAdapter("postgres-old"));
    registry.register("postgres", () => makeAdapter("postgres-new"));

    expect(registry.resolve("postgres").type).toBe("postgres-new");
    expect(registry.knownTypes()).toEqual(["postgres"]);
  });

  it("resolve() of an unregistered type throws naming the type and listing known types", () => {
    const registry = new AdapterRegistry();
    registry.register("postgres", () => makeAdapter("postgres"));
    registry.register("mysql", () => makeAdapter("mysql"));

    let caught: unknown;
    try {
      registry.resolve("mongo");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    // Names the missing type.
    expect(message).toContain("mongo");
    // Lists the currently known types.
    expect(message).toContain("mysql");
    expect(message).toContain("postgres");
  });

  it("resolve() of an unregistered type lists \"(none)\" when nothing is registered", () => {
    const registry = new AdapterRegistry();

    expect(() => registry.resolve("postgres")).toThrow(/\(none\)/);
  });
});

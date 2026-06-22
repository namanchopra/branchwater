/**
 * Zod schema for validating Branchwater configuration.
 *
 * The `connection` field is intentionally opaque (`z.record(z.unknown())`): no
 * engine-specific fields (e.g. Postgres) are hardcoded here. Each engine adapter
 * is responsible for validating its own connection shape.
 */

import { z } from "zod";
import type { BwConfig } from "./types";

/**
 * Schema for a single engine entry. `connection` accepts arbitrary keys.
 */
export const engineConfigEntrySchema = z.object({
  name: z.string().min(1, "engine name must not be empty"),
  type: z.string().min(1, "engine type must not be empty"),
  connection: z.record(z.unknown()),
});

/**
 * Schema for the full Branchwater configuration.
 *
 * Enforces:
 * - `version` literal `1`.
 * - at least one engine entry.
 * - unique engine names across all entries.
 */
export const bwConfigSchema = z
  .object({
    version: z.literal(1),
    engines: z
      .array(engineConfigEntrySchema)
      .min(1, "config must define at least one engine"),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const engine of cfg.engines) {
      if (seen.has(engine.name)) {
        duplicates.add(engine.name);
      }
      seen.add(engine.name);
    }
    if (duplicates.size > 0) {
      const names = [...duplicates].map((n) => `"${n}"`).join(", ");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["engines"],
        message: `duplicate engine name(s): ${names}; engine names must be unique`,
      });
    }
  });

/**
 * The validated/parsed configuration type, structurally compatible with
 * {@link BwConfig}.
 */
export type ParsedBwConfig = z.infer<typeof bwConfigSchema>;

// Compile-time assertion that the schema output matches the canonical contract.
const _typeCheck: BwConfig = undefined as unknown as ParsedBwConfig;
void _typeCheck;

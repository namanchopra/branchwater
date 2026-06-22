import { z } from "zod";
import type { Manifest } from "./types";

/**
 * Zod schema for an engine-specific snapshot id (a non-empty string).
 */
export const engineSnapshotIdSchema = z.string();

/**
 * Zod schema mirroring {@link import("./types").ColumnInfo}.
 */
export const columnInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
});

/**
 * Zod schema mirroring {@link import("./types").TableInspectionSummary}.
 *
 * Carries table name, optional schema, a nullable exact row count, and the
 * column schema — never any row data.
 */
export const tableInspectionSummarySchema = z.object({
  name: z.string(),
  schema: z.string().optional(),
  rowCount: z.number().nullable(),
  columns: z.array(columnInfoSchema),
});

/**
 * Zod schema mirroring {@link import("./types").EngineInspectionSummary}.
 */
export const engineInspectionSummarySchema = z.object({
  tables: z.array(tableInspectionSummarySchema),
});

/**
 * Zod schema mirroring {@link import("./types").BranchRef}.
 */
export const branchRefSchema = z.object({
  snapshotId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Zod schema mirroring {@link import("./types").SnapshotRecord}.
 */
export const snapshotRecordSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  createdAt: z.string(),
  message: z.string().optional(),
  engines: z.record(z.string(), engineSnapshotIdSchema),
  inspection: z.record(z.string(), engineInspectionSummarySchema).optional(),
});

/**
 * Zod schema mirroring {@link import("./types").Manifest}.
 *
 * - `version` must be the literal `1`; any other value (e.g. `2`) is rejected.
 * - A refinement guarantees referential integrity: every branch's `snapshotId`
 *   must exist as a key in `snapshots`.
 */
export const manifestSchema = z
  .object({
    version: z.literal(1),
    head: z.string(),
    branches: z.record(z.string(), branchRefSchema),
    snapshots: z.record(z.string(), snapshotRecordSchema),
  })
  .superRefine((manifest, ctx) => {
    for (const [branchName, ref] of Object.entries(manifest.branches)) {
      if (!Object.prototype.hasOwnProperty.call(manifest.snapshots, ref.snapshotId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["branches", branchName, "snapshotId"],
          message: `Branch "${branchName}" points at unknown snapshot "${ref.snapshotId}"`,
        });
      }
    }
  });

/**
 * The type inferred from {@link manifestSchema}. Validated to be structurally
 * equivalent to the canonical {@link Manifest} contract type below.
 */
export type ParsedManifest = z.infer<typeof manifestSchema>;

/**
 * Deeply strip an explicit `| undefined` from optional properties so that two
 * shapes that differ only in that respect (a known Zod `.optional()` inference
 * nuance under `exactOptionalPropertyTypes`) compare as equal.
 *
 * Arrays are recursed element-wise (preserving array-ness) before the plain
 * object case, so the nuance is also normalized inside array element types
 * (e.g. optional `nullable?`/`schema?` fields nested under `columns`/`tables`).
 */
type Exactify<T> = T extends readonly (infer E)[]
  ? Array<Exactify<Exclude<E, undefined>>>
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Exactify<Exclude<T[K], undefined>> }
    : T;

/**
 * Compile-time, bidirectional alignment guard between the parsed schema type
 * and the canonical {@link Manifest} contract type. If either drifts beyond the
 * benign optional-`undefined` nuance, this assignment fails to compile.
 */
type _SchemaToContract = Exactify<ParsedManifest> extends Exactify<Manifest>
  ? true
  : never;
type _ContractToSchema = Exactify<Manifest> extends Exactify<ParsedManifest>
  ? true
  : never;
const _manifestAligned: [_SchemaToContract, _ContractToSchema] = [true, true];
void _manifestAligned;

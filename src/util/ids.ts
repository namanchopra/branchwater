import { randomUUID } from "node:crypto";

/**
 * Generate a prefixed, collision-resistant identifier.
 *
 * Combines the given prefix with a v4 UUID from `node:crypto`, producing values
 * such as `snap_3f2504e0-4f89-41d3-9a0c-0305e82c3301`. The UUID source makes
 * the result unique across very large numbers of calls.
 *
 * @param prefix Short namespace prefix (e.g. "snap", "auto").
 * @returns The string `${prefix}_${uuid}`.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

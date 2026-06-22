/**
 * Snapshot lineage graph for the Branchwater (bw) local web UI.
 *
 * Renders the recorded snapshots from `GET /api/state` newest-first, drawing the
 * parent lineage as a single vertical spine so each snapshot visibly descends
 * from its parent. Snapshots whose `parent` is `null` are roots and are marked
 * as the start of a line.
 *
 * Branches that point at a snapshot are surfaced as small labels on that
 * snapshot's node so the user can read the graph and the refs together; the
 * branch a row belongs to can be selected, reporting up through {@link onSelectBranch}.
 *
 * An empty repo (no snapshots) renders a quiet empty state rather than crashing.
 *
 * @module components/SnapshotGraph
 */

import type { BranchDTO, SnapshotDTO } from '@bw/dto';

/** Props for {@link SnapshotGraph}. */
export interface SnapshotGraphProps {
  /** All snapshots to render (the server's flattened `state.snapshots`). */
  snapshots: SnapshotDTO[];
  /** All branches, used to label which branches point at each snapshot. */
  branches: BranchDTO[];
  /** Name of the current head branch, so its ref label can be distinguished. */
  head: string;
  /** Active/selected branch name, or `null`. Used to highlight matching refs. */
  activeBranch?: string | null;
  /** Called when a branch ref label on a node is selected. */
  onSelectBranch?: (name: string) => void;
}

/** A snapshot paired with the branch refs that point at it, for rendering. */
interface GraphNode {
  snapshot: SnapshotDTO;
  refs: BranchDTO[];
  isRoot: boolean;
}

/**
 * Renders the snapshot lineage. Snapshots are ordered newest-first by
 * `createdAt` (falling back to insertion order for equal timestamps), which is
 * also the server's stated policy — sorting here makes the ordering guaranteed
 * regardless of source order.
 */
export function SnapshotGraph(props: SnapshotGraphProps): React.JSX.Element {
  const { snapshots, branches, head, activeBranch = null, onSelectBranch } = props;

  if (snapshots.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-content-faint"
        data-testid="snapshot-empty"
      >
        No snapshots yet.
      </div>
    );
  }

  const refsBySnapshot = groupBranchesBySnapshot(branches);
  const nodes: GraphNode[] = sortNewestFirst(snapshots).map((snapshot) => ({
    snapshot,
    refs: refsBySnapshot.get(snapshot.id) ?? [],
    isRoot: snapshot.parent === null,
  }));

  return (
    <ol className="relative space-y-3" data-testid="snapshot-graph">
      {nodes.map((node, index) => (
        <SnapshotNode
          key={node.snapshot.id}
          node={node}
          isLast={index === nodes.length - 1}
          head={head}
          activeBranch={activeBranch}
          onSelectBranch={onSelectBranch}
        />
      ))}
    </ol>
  );
}

/** A single snapshot node on the lineage spine. */
function SnapshotNode(props: {
  node: GraphNode;
  isLast: boolean;
  head: string;
  activeBranch: string | null;
  onSelectBranch?: ((name: string) => void) | undefined;
}): React.JSX.Element {
  const { node, isLast, head, activeBranch, onSelectBranch } = props;
  const { snapshot, refs, isRoot } = node;

  return (
    <li className="relative flex gap-3" data-testid={`snapshot-node-${snapshot.id}`}>
      {/* Lineage spine: a dot for this node and a connector down to the next. */}
      <div className="relative flex w-4 flex-shrink-0 flex-col items-center">
        <span
          className={`z-10 mt-3 h-3 w-3 flex-shrink-0 rounded-full border-2 ${
            isRoot
              ? 'border-line-strong bg-surface'
              : 'border-head bg-head'
          }`}
          aria-hidden="true"
        />
        {!isLast && (
          <span
            className="absolute left-1/2 top-3 -ml-px h-full w-0.5 bg-line"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Snapshot card. */}
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-mono text-sm text-content-muted">{snapshot.id}</span>
          <span className="flex-shrink-0 text-xs text-content-faint">{snapshot.createdAt}</span>
        </div>

        {snapshot.message && (
          <p className="mt-1 text-sm text-content-muted">{snapshot.message}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-content-faint">
          {isRoot ? (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium text-content-muted">
              root
            </span>
          ) : (
            <span className="font-mono">
              parent <span className="text-content-muted">{snapshot.parent}</span>
            </span>
          )}
        </div>

        {refs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`snapshot-refs-${snapshot.id}`}>
            {refs.map((ref) => {
              const isHead = ref.name === head;
              const isActive = ref.name === activeBranch;
              return (
                <button
                  key={ref.name}
                  type="button"
                  onClick={() => onSelectBranch?.(ref.name)}
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    isHead
                      ? 'bg-head text-head-text hover:brightness-[1.05]'
                      : isActive
                        ? 'bg-head-weak text-head ring-1 ring-inset ring-line-strong'
                        : 'bg-surface-muted text-content-muted hover:bg-surface-strong'
                  }`}
                  data-testid={`snapshot-ref-${ref.name}`}
                >
                  {ref.name}
                  {isHead && <span className="ml-1 uppercase opacity-70">head</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Group branches by the snapshot id they point at. */
function groupBranchesBySnapshot(branches: BranchDTO[]): Map<string, BranchDTO[]> {
  const map = new Map<string, BranchDTO[]>();
  for (const branch of branches) {
    const list = map.get(branch.snapshotId);
    if (list) {
      list.push(branch);
    } else {
      map.set(branch.snapshotId, [branch]);
    }
  }
  return map;
}

/**
 * Sort snapshots newest-first by `createdAt`, preserving the original relative
 * order for equal timestamps (a stable sort over an index-decorated copy).
 */
function sortNewestFirst(snapshots: SnapshotDTO[]): SnapshotDTO[] {
  return snapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((a, b) => {
      const byTime = b.snapshot.createdAt.localeCompare(a.snapshot.createdAt);
      return byTime !== 0 ? byTime : a.index - b.index;
    })
    .map((entry) => entry.snapshot);
}

export default SnapshotGraph;

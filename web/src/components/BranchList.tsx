/**
 * Sidebar branch list for the Branchwater (bw) local web UI.
 *
 * Renders every named branch from `GET /api/state`, visually distinguishing the
 * current `head` branch and the caller-selected "active" branch (the branch the
 * surrounding app has focused, e.g. for diffing). Selection is fully controlled:
 * this component owns no state — it reports clicks through {@link onSelect} so the
 * parent can lift active-branch state into the app shell.
 *
 * An empty repo (no branches) renders a quiet empty state rather than crashing.
 *
 * @module components/BranchList
 */

import type { BranchDTO } from '@bw/dto';
import { cx } from './ui';

/** Props for {@link BranchList}. */
export interface BranchListProps {
  /** All branches to render (the server's flattened `state.branches`). */
  branches: BranchDTO[];
  /** Name of the current head branch, so it can be marked. */
  head: string;
  /**
   * Name of the active/selected branch, or `null` when nothing is selected.
   * Controlled by the parent so active-branch state lives in the app shell.
   */
  activeBranch?: string | null;
  /** Called with a branch name when the user selects (clicks) a branch row. */
  onSelect?: (name: string) => void;
}

/**
 * The branch list. Branches are sorted by name for a stable order; the head and
 * active branches are highlighted distinctly.
 */
export function BranchList(props: BranchListProps): React.JSX.Element {
  const { branches, head, activeBranch = null, onSelect } = props;

  if (branches.length === 0) {
    return (
      <p className="px-1 text-sm text-content-faint" data-testid="branch-empty">
        No branches yet
      </p>
    );
  }

  const sorted = [...branches].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul className="space-y-1" data-testid="branch-list">
      {sorted.map((branch) => (
        <BranchRow
          key={branch.name}
          branch={branch}
          isHead={branch.name === head}
          isActive={branch.name === activeBranch}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

/** A single selectable branch row. */
function BranchRow(props: {
  branch: BranchDTO;
  isHead: boolean;
  isActive: boolean;
  onSelect?: ((name: string) => void) | undefined;
}): React.JSX.Element {
  const { branch, isHead, isActive, onSelect } = props;

  const base =
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors';
  const highlighted = isHead || isActive;
  const tone = highlighted
    ? 'bg-surface font-medium text-content shadow-card'
    : 'text-content-muted hover:bg-surface-muted';
  const ring = isActive && !isHead ? ' ring-1 ring-inset ring-line-strong' : '';
  const dot = isActive || isHead ? 'bg-head' : 'border border-line-strong';

  return (
    <li>
      <button
        type="button"
        aria-current={isActive ? 'true' : undefined}
        title={`Snapshot ${branch.snapshotId}`}
        onClick={() => onSelect?.(branch.name)}
        className={`${base} ${tone}${ring}`}
        data-testid={`branch-row-${branch.name}`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`}
        />
        <span className="min-w-0 flex-1 truncate font-mono">{branch.name}</span>
        {isHead && (
          <span
            className="ml-2 flex-shrink-0 rounded bg-head-weak px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-head"
            data-testid="branch-head-badge"
          >
            head
          </span>
        )}
      </button>
    </li>
  );
}

export default BranchList;

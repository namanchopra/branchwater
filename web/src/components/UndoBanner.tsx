/**
 * One-click Undo banner for the Branchwater (bw) web UI.
 *
 * Renders only while the {@link useUndo} context holds an entry — i.e. just after
 * a confirm-gated table action recorded its auto-snapshot via
 * {@link UndoApi.recordUndo}. Clicking **Undo** restores that pre-mutation
 * snapshot (`POST /api/restore`, itself confirm-gated and destructive), and on
 * success clears the entry (hiding the banner) and fires the caller's
 * {@link UndoBannerProps.onRestored} so dependent views refetch. A failed restore
 * surfaces the {@link BwApiError.message} inline and keeps the banner up so the
 * action stays undoable for a retry. The banner is also dismissable, which just
 * forgets the entry without touching the database.
 *
 * @module components/UndoBanner
 */

import { useState } from 'react';
import { api, BwApiError } from '../api';
import { useUndo } from '../undo';
import { Button } from './ui';

/** Props for {@link UndoBanner}. */
export interface UndoBannerProps {
  /**
   * Called after a successful restore (the database has been rolled back to the
   * recorded snapshot). Use it to refetch any view affected by the original
   * mutation — table rows, snapshot list, state, etc.
   */
  onRestored?: () => void;
}

/**
 * The floating Undo banner. Reads the current undoable action from the
 * {@link useUndo} context and renders `null` when there is nothing to undo. Owns
 * only the in-flight restore state (pending / error); the undoable entry itself
 * lives in the {@link UndoProvider}.
 */
export function UndoBanner(props: UndoBannerProps): React.JSX.Element | null {
  const { entry, clear } = useUndo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entry === null) return null;

  const onUndo = (): void => {
    setPending(true);
    setError(null);
    void api.restore(entry.snapshotId).then(
      () => {
        // Success: forget the entry (hides the banner) and let the caller refresh.
        setPending(false);
        clear();
        props.onRestored?.();
      },
      (err: unknown) => {
        // Failure: surface the message and KEEP the banner so it can be retried.
        const message =
          err instanceof BwApiError ? err.message : 'Unexpected error during undo';
        setPending(false);
        setError(message);
      },
    );
  };

  const onDismiss = (): void => {
    // Dismiss never touches the database — it only forgets the undoable entry.
    if (pending) return;
    setError(null);
    clear();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-full max-w-xl rounded-xl border border-line-strong bg-surface-strong px-4 py-3 text-content shadow-pop"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-head-weak text-head"
        >
          ↩
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.label}</p>
          <p className="truncate text-xs text-content-muted">
            Snapshot <span className="font-mono text-content-faint">{entry.snapshotId}</span>
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onUndo}
            disabled={pending}
          >
            {pending ? 'Undoing…' : 'Undo'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={pending}
            aria-label="Dismiss"
          >
            Dismiss
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-danger-weak bg-danger-weak px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default UndoBanner;

/**
 * Auto-snapshot Undo context for the Branchwater (bw) web UI.
 *
 * Every confirm-gated table action (insert / update / delete / truncate / drop /
 * SQL console write) auto-snapshots BEFORE mutating and returns that
 * `undoSnapshotId` (see the table-action methods on the {@link api} client). This
 * context is the single place that remembers the *most recent* such snapshot so a
 * one-click Undo banner can offer to restore it.
 *
 * The provider deliberately holds nothing but the current {@link UndoEntry}:
 * recording a new action simply replaces it (only the latest mutation is
 * undoable), and {@link UndoApi.clear} drops it. The actual restore call
 * (`api.restore`) and its pending / error state live in the consuming
 * {@link UndoBanner}, mirroring the rest of the app's "the call site owns the
 * in-flight state" convention.
 *
 * @module undo
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A single undoable action: the auto-snapshot to restore, plus a human label. */
export interface UndoEntry {
  /** The `undoSnapshotId` the server returned for the action's pre-mutation snapshot. */
  snapshotId: string;
  /** Short description of what would be undone, e.g. `"Delete row"`. */
  label: string;
}

/** The value exposed by {@link useUndo}. */
export interface UndoApi {
  /**
   * The current undoable action, or `null` when there is nothing to undo. While
   * non-null the {@link UndoBanner} is shown.
   */
  entry: UndoEntry | null;
  /**
   * Record (and so make undoable) the action that produced `snapshotId`. Replaces
   * any prior entry — only the most recent mutation is offered for Undo.
   */
  recordUndo: (snapshotId: string, label: string) => void;
  /** Forget the current entry, hiding the banner. */
  clear: () => void;
}

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

const UndoContext = createContext<UndoApi | null>(null);

/**
 * Provides the {@link UndoApi} to its subtree. Wrap the part of the app that both
 * triggers table actions and renders the {@link UndoBanner} so they share one
 * entry.
 */
export function UndoProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const [entry, setEntry] = useState<UndoEntry | null>(null);

  const recordUndo = useCallback((snapshotId: string, label: string) => {
    setEntry({ snapshotId, label });
  }, []);

  const clear = useCallback(() => {
    setEntry(null);
  }, []);

  const value = useMemo<UndoApi>(
    () => ({ entry, recordUndo, clear }),
    [entry, recordUndo, clear],
  );

  return <UndoContext.Provider value={value}>{props.children}</UndoContext.Provider>;
}

/**
 * Access the {@link UndoApi}. Must be called from within an {@link UndoProvider};
 * throws otherwise so a missing provider is a loud, obvious bug.
 */
export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext);
  if (ctx === null) {
    throw new Error('useUndo must be used within an <UndoProvider>');
  }
  return ctx;
}

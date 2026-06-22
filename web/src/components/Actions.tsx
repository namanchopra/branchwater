/**
 * The Branchwater (bw) action bar: the controls that mutate manifest state.
 *
 * Exposes the four write operations the web client supports:
 * - **Snapshot** — `POST /api/snapshot` with an optional message.
 * - **Create branch** — `POST /api/branch` with a name.
 * - **Checkout** — `POST /api/checkout` (destructive; requires `confirm: true`).
 * - **Delete branch** — `POST /api/delete` (destructive; requires `confirm:true`).
 *
 * Non-destructive actions (snapshot, branch) fire immediately and, on success,
 * ask the parent to refetch state via {@link ActionsProps.onRefresh}. The two
 * destructive actions are routed through a {@link ConfirmDialog}: the API call
 * only happens once the user accepts, and the request always carries
 * `confirm: true` (the server rejects it otherwise).
 *
 * Every failure surfaces the typed {@link BwApiError.message} inline — a banner
 * for the inline forms, and within the dialog for confirmed actions — so the
 * user never gets a silent no-op. After a successful checkout the autosave
 * snapshot the orchestrator records before restoring is surfaced as a transient
 * notice so the user knows how to recover their prior state.
 *
 * This component performs no fetching of its own beyond the mutations: the
 * parent (`App`) owns the canonical {@link StateDTO} and supplies the current
 * head + branch list so the destructive controls can target a branch.
 *
 * @module components/Actions
 */

import { useCallback, useMemo, useState } from 'react';
import type { StateDTO } from '@bw/dto';
import { api, BwApiError } from '../api';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Divider, Field, Input, Select } from './ui';

/** Props for {@link Actions}. */
export interface ActionsProps {
  /** Currently checked-out branch name (head). */
  head: string;
  /** All branch names, used to populate the checkout / delete targets. */
  branches: readonly string[];
  /**
   * Asked to refetch `GET /api/state` after any successful mutation. The parent
   * owns the canonical state, so it re-reads rather than us threading the
   * refreshed DTO up.
   */
  onRefresh: () => void;
}

/** Which confirmed (destructive) action a dialog is currently gating, if any. */
type PendingConfirm =
  | { kind: 'checkout'; name: string }
  | { kind: 'delete'; name: string }
  | null;

/** Pull a human-readable message out of any thrown value. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof BwApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Find the snapshot id that appears in `next` but not in `prev` — i.e. the
 * autosave the orchestrator records before a checkout restores. Returns `null`
 * when nothing new appeared (e.g. checkout to the already-current branch).
 */
function newSnapshotId(prev: StateDTO, next: StateDTO): string | null {
  const before = new Set(prev.snapshots.map((s) => s.id));
  for (const snap of next.snapshots) {
    if (!before.has(snap.id)) return snap.id;
  }
  return null;
}

/**
 * The action bar. Renders the snapshot + create-branch forms and the
 * checkout/delete controls, mediating the destructive pair through a confirm
 * dialog and surfacing all API errors inline.
 */
export function Actions(props: ActionsProps): React.JSX.Element {
  const { head, branches, onRefresh } = props;

  // --- inline (non-destructive) form state ---------------------------------
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const [busy, setBusy] = useState<null | 'snapshot' | 'branch'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // --- destructive (confirmed) action state --------------------------------
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Branch chosen in the checkout/delete selector (defaults to first non-head).
  const otherBranches = useMemo(
    () => branches.filter((b) => b !== head),
    [branches, head],
  );
  const [selected, setSelected] = useState('');
  const target = selected || otherBranches[0] || '';

  const takeSnapshot = useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy('snapshot');
    try {
      const trimmed = snapshotMessage.trim();
      const res = await api.snapshot(trimmed ? { message: trimmed } : {});
      setSnapshotMessage('');
      setNotice(`Snapshot ${res.snapshotId} created.`);
      onRefresh();
    } catch (err) {
      setError(messageOf(err, 'Failed to create snapshot'));
    } finally {
      setBusy(null);
    }
  }, [snapshotMessage, onRefresh]);

  const createBranch = useCallback(async () => {
    const name = branchName.trim();
    if (!name) {
      setError('Branch name is required');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy('branch');
    try {
      await api.branch({ name });
      setBranchName('');
      setNotice(`Branch "${name}" created.`);
      onRefresh();
    } catch (err) {
      setError(messageOf(err, 'Failed to create branch'));
    } finally {
      setBusy(null);
    }
  }, [branchName, onRefresh]);

  // Open the confirm dialog for a destructive action. The actual API call is
  // deferred until the user accepts in the dialog.
  const requestCheckout = useCallback(() => {
    if (!target) return;
    setConfirmError(null);
    setConfirm({ kind: 'checkout', name: target });
  }, [target]);

  const requestDelete = useCallback(() => {
    if (!target) return;
    setConfirmError(null);
    setConfirm({ kind: 'delete', name: target });
  }, [target]);

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
    setConfirmError(null);
  }, [confirmBusy]);

  // Runs ONLY after the user accepts the confirm dialog. Always sends
  // `confirm: true` — the server rejects destructive calls without it.
  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError(null);
    setError(null);
    setNotice(null);
    try {
      if (confirm.kind === 'checkout') {
        // Snapshot the pre-checkout state so we can identify the autosave id the
        // orchestrator records before restoring.
        const before = await api.getState();
        const res = await api.checkout({ name: confirm.name, confirm: true });
        const autosave = newSnapshotId(before, res.state);
        setNotice(
          autosave
            ? `Checked out "${confirm.name}". Autosave before checkout: ${autosave}`
            : `Checked out "${confirm.name}".`,
        );
      } else {
        await api.deleteBranch({ name: confirm.name, confirm: true });
        setNotice(`Branch "${confirm.name}" deleted.`);
      }
      setConfirm(null);
      setSelected('');
      onRefresh();
    } catch (err) {
      // Keep the dialog open so the user can retry; show the error inside it.
      setConfirmError(messageOf(err, 'Action failed'));
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, onRefresh]);

  return (
    <div className="border-b border-line bg-surface px-6 py-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Snapshot ------------------------------------------------------- */}
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void takeSnapshot();
          }}
        >
          <Field label="Snapshot message">
            <Input
              type="text"
              value={snapshotMessage}
              onChange={(e) => setSnapshotMessage(e.target.value)}
              placeholder="optional message"
              className="w-56"
              disabled={busy === 'snapshot'}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy !== null}>
            {busy === 'snapshot' ? 'Snapshotting…' : 'Snapshot'}
          </Button>
        </form>

        <Divider />

        {/* Create branch ------------------------------------------------- */}
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createBranch();
          }}
        >
          <Field label="New branch">
            <Input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="branch name"
              className="w-44"
              disabled={busy === 'branch'}
            />
          </Field>
          <Button type="submit" disabled={busy !== null}>
            {busy === 'branch' ? 'Creating…' : 'Create branch'}
          </Button>
        </form>

        <Divider />

        {/* Checkout / delete (gated by confirm dialog) ------------------- */}
        <div className="flex items-end gap-3">
          <Field label="Target branch">
            <Select
              value={target}
              onChange={(e) => setSelected(e.target.value)}
              disabled={otherBranches.length === 0}
              className="w-44"
            >
              {otherBranches.length === 0 ? (
                <option value="">No other branches</option>
              ) : (
                otherBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              )}
            </Select>
          </Field>
          <Button type="button" onClick={requestCheckout} disabled={!target}>
            Checkout
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={requestDelete}
            disabled={!target}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Inline feedback for non-destructive actions --------------------- */}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger-weak bg-danger-weak px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="mt-3 rounded-md border border-accent-weak bg-accent-weak px-3 py-2 text-sm text-accent-text">
          {notice}
        </p>
      )}

      {/* Confirm gate for checkout / delete ------------------------------- */}
      <ConfirmDialog
        open={confirm !== null}
        pending={confirmBusy}
        error={confirmError}
        title={
          confirm?.kind === 'delete'
            ? `Delete branch "${confirm.name}"?`
            : confirm?.kind === 'checkout'
              ? `Check out "${confirm.name}"?`
              : ''
        }
        description={
          confirm?.kind === 'delete' ? (
            <>
              This permanently removes the branch{' '}
              <span className="font-mono">{confirm.name}</span> from the manifest.
              This cannot be undone.
            </>
          ) : confirm?.kind === 'checkout' ? (
            <>
              This restores every engine to branch{' '}
              <span className="font-mono">{confirm.name}</span>, overwriting their
              current contents. An autosave of the current state is taken first.
            </>
          ) : (
            ''
          )
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Checkout'}
        onConfirm={() => void runConfirmed()}
        onCancel={closeConfirm}
      />
    </div>
  );
}

export default Actions;

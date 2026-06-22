/**
 * A focused, accessible confirmation modal for the Branchwater (bw) web UI.
 *
 * Used to gate the two destructive operations the API requires explicit
 * confirmation for — `POST /api/checkout` and `POST /api/delete`, both of which
 * the server rejects unless the body carries `confirm: true`. The dialog renders
 * nothing when closed; while open it traps the obvious dismissals (Escape key,
 * backdrop click), surfaces the action's pending/error state inline, and only
 * invokes {@link ConfirmDialogProps.onConfirm} when the user clicks Confirm.
 *
 * It is intentionally state-light: the *caller* owns whether the dialog is open,
 * the pending flag, and the error string. That keeps the destructive call site
 * (which knows how to build the `{ confirm: true }` body and refetch state) in
 * one place, with this component handling only presentation and intent capture.
 *
 * @module components/ConfirmDialog
 */

import { useEffect, useRef } from 'react';
import { Button, cx } from './ui';

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** When false the dialog renders nothing. */
  open: boolean;
  /** Short dialog title, e.g. `"Check out main?"`. */
  title: string;
  /** Body copy explaining the consequence of confirming. */
  description: React.ReactNode;
  /** Label for the confirm button. Defaults to `"Confirm"`. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /**
   * Whether the confirm action is in flight. While true both buttons are
   * disabled and the confirm button shows a busy label, preventing double
   * submits.
   */
  pending?: boolean;
  /**
   * An error from the most recent confirm attempt, shown inline so the dialog
   * stays open for a retry. `null`/omitted hides the banner.
   */
  error?: string | null;
  /** Invoked when the user accepts. The caller performs the destructive call. */
  onConfirm: () => void;
  /** Invoked on cancel, Escape, or backdrop click. Ignored while pending. */
  onCancel: () => void;
}

/**
 * Modal dialog that blocks a destructive action behind an explicit Confirm.
 *
 * Renders `null` when {@link ConfirmDialogProps.open} is false. While open it
 * focuses the confirm button, closes on Escape / backdrop click (unless a
 * confirm is in flight), and shows any {@link ConfirmDialogProps.error} inline.
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element | null {
  const {
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    pending = false,
    error = null,
    onConfirm,
    onCancel,
  } = props;

  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirm button when the dialog opens.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Close on Escape (but never mid-flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onMouseDown={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-content">{title}</h2>
        <div className="mt-2 text-sm text-content-muted">{description}</div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger-weak bg-danger-weak px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="default"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          {/* Raw button (not the Button primitive) so we can hold a ref and
              keep the focus-on-open behavior exactly; styled to match the
              danger Button variant via the same semantic tokens. */}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cx(
              'inline-flex items-center justify-center gap-2 rounded-lg font-medium leading-none',
              'h-9 px-3.5 text-sm transition-colors select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              'bg-danger-weak text-danger border border-danger-weak hover:brightness-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;

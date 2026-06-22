/**
 * Shared, themed UI primitives for the Branchwater (bw) web UI.
 *
 * Every interactive control in the app is built from these so sizing, spacing,
 * radius, focus rings, and disabled states stay IDENTICAL everywhere — which is
 * what keeps toolbars and button rows visually aligned. All controls share a
 * consistent height (`md` = 2.25rem / `h-9`, `sm` = 2rem / `h-8`), so a flex row
 * of mixed buttons + inputs lines up on a single baseline.
 *
 * Colors come exclusively from the semantic theme tokens (see tailwind.config.js
 * / index.css), so these render correctly in light and dark with no `dark:`
 * variants. Prefer composing these over hand-rolled `<button>`/`<input>` markup.
 *
 * @module components/ui
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/** Join class fragments, dropping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

/** Visual emphasis of a {@link Button}. */
export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger';
/** Control size shared across {@link Button} / {@link IconButton} / inputs. */
export type ControlSize = 'sm' | 'md';

/** Height + horizontal padding per size, shared by buttons and inputs. */
const SIZE: Record<ControlSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink border border-accent hover:brightness-[1.05] shadow-card',
  default:
    'bg-surface text-content border border-line hover:border-line-strong hover:bg-surface-muted',
  ghost: 'bg-transparent text-content-muted border border-transparent hover:bg-surface-muted',
  danger: 'bg-danger-weak text-danger border border-danger-weak hover:brightness-[0.98]',
};

/** Base classes every button/icon-button shares (layout, focus, disabled). */
const CONTROL_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium leading-none ' +
  'transition-colors select-none focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** Props for {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
}

/** The single button used across the app. */
export function Button(props: ButtonProps): React.JSX.Element {
  const { variant = 'default', size = 'md', className, type, ...rest } = props;
  return (
    <button
      type={type ?? 'button'}
      className={cx(CONTROL_BASE, SIZE[size], VARIANT[variant], className)}
      {...rest}
    />
  );
}

/** Props for {@link IconButton}. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Required for accessibility — icon buttons have no visible text. */
  'aria-label': string;
}

/** A square, icon-only button matching {@link Button} heights. */
export function IconButton(props: IconButtonProps): React.JSX.Element {
  const { variant = 'default', size = 'md', className, type, ...rest } = props;
  const square = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <button
      type={type ?? 'button'}
      className={cx(CONTROL_BASE, square, 'text-base', VARIANT[variant], className)}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** Shared field chrome for text inputs and selects (height matches buttons). */
const INPUT_BASE =
  'h-9 rounded-lg border border-line bg-surface px-3 text-sm text-content ' +
  'placeholder:text-content-faint transition-colors focus:outline-none ' +
  'focus:border-accent focus:ring-2 focus:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** Themed text input. */
export function Input(
  props: InputHTMLAttributes<HTMLInputElement>,
): React.JSX.Element {
  const { className, ...rest } = props;
  return <input className={cx(INPUT_BASE, className)} {...rest} />;
}

/** Themed select. */
export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement>,
): React.JSX.Element {
  const { className, ...rest } = props;
  return <select className={cx(INPUT_BASE, 'pr-8', className)} {...rest} />;
}

/** Themed multiline textarea (taller; otherwise matches inputs). */
export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
): React.JSX.Element {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cx(
        'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content',
        'placeholder:text-content-faint font-mono transition-colors focus:outline-none',
        'focus:border-accent focus:ring-2 focus:ring-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Field + Card                                                               */
/* -------------------------------------------------------------------------- */

/** A labelled control wrapper with consistent label styling + spacing. */
export function Field(props: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={cx('flex flex-col gap-1', props.className)}>
      <label
        htmlFor={props.htmlFor}
        className="text-[11px] font-semibold text-content-faint"
      >
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

/** A surface card with consistent border, radius, and shadow. */
export function Card(props: {
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cx(
        'rounded-xl border border-line bg-surface shadow-card',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/** A thin vertical divider for separating toolbar groups (self-aligns to row height). */
export function Divider(): React.JSX.Element {
  return <span aria-hidden="true" className="h-6 w-px self-center bg-line" />;
}

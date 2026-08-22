import type {ReactNode} from 'react';
import type {Issue} from '@pile-on/core';

/* Minimal shared primitives. Deliberately plain — this is a working tool. */

export function Button({
  children,
  onClick,
  variant = 'default',
  type = 'button',
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly variant?: 'default' | 'primary' | 'danger' | 'quiet';
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    default: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    primary: 'border-sky-700 bg-sky-700 text-white hover:bg-sky-800',
    danger: 'border-red-300 bg-white text-red-700 hover:bg-red-50',
    quiet:
      'border-transparent bg-transparent text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  suffix,
  type = 'text',
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly suffix?: string;
  readonly type?: 'text' | 'number';
  readonly placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {suffix ? (
          <span className="font-normal text-slate-500"> ({suffix})</span>
        ) : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder ?? ''}
        onChange={event => onChange(event.target.value)}
        className="rounded border border-slate-300 px-2 py-1.5 text-slate-900 focus:border-sky-600 focus:outline-none"
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly {readonly value: T; readonly label: string}[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900 focus:border-sky-600 focus:outline-none"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Issues are shown as a list, never collapsed to a count. A 40-row import with
 * six bad rows is fixable in one pass only if you can see all six.
 */
export function IssueList({
  issues,
  title = 'Fix these before continuing',
}: {
  readonly issues: readonly Issue[];
  readonly title?: string;
}) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <div
      role="alert"
      className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
    >
      <p className="mb-1 font-medium">
        {title} ({issues.length})
      </p>
      <ul className="list-inside list-disc space-y-0.5">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <span className="font-mono text-xs">{issue.path}</span>{' '}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function EmptyState({children}: {readonly children: ReactNode}) {
  return (
    <p className="rounded border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

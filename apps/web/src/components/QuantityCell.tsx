import {useState} from 'react';

/**
 * A quantity input that keeps its own draft text.
 *
 * Binding a number input straight to state makes clearing the field impossible
 * — backspacing to empty parses as 0 and rewrites the box. Holding the draft
 * locally lets the field be empty or mid-edit while only committing values that
 * are actually whole pile counts, and says so when they are not.
 */
export function QuantityCell({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (value === 0 ? '' : String(value));
  const parsed = draft === null || draft.trim() === '' ? 0 : Number(draft);
  const invalid =
    draft !== null &&
    draft.trim() !== '' &&
    (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0);

  function change(next: string) {
    setDraft(next);
    const asNumber = next.trim() === '' ? 0 : Number(next);
    if (
      Number.isFinite(asNumber) &&
      Number.isInteger(asNumber) &&
      asNumber >= 0
    ) {
      onCommit(asNumber);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={shown}
        placeholder="0"
        onChange={event => change(event.target.value)}
        onBlur={() => setDraft(null)}
        aria-invalid={invalid}
        className={`w-24 rounded border px-2 py-1 text-right tabular-nums focus:outline-none ${
          invalid
            ? 'border-red-500 bg-red-50 text-red-900'
            : 'border-slate-300 focus:border-sky-600'
        }`}
      />
      {invalid ? (
        <span className="text-xs text-red-700">whole piles only</span>
      ) : null}
    </div>
  );
}

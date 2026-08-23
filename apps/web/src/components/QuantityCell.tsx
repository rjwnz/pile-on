import {useState} from 'react';

/**
 * A quantity input that keeps its own draft text, so the field can be empty or
 * mid-edit while only whole pile counts are committed.
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

  const wholePiles = (text: string) => {
    const parsed = text.trim() === '' ? 0 : Number(text);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const shown = draft ?? (value === 0 ? '' : String(value));
  const invalid = draft !== null && wholePiles(draft) === null;

  function change(next: string) {
    setDraft(next);
    const parsed = wholePiles(next);
    if (parsed !== null) {
      onCommit(parsed);
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
            : 'border-slate-300 focus:border-brand'
        }`}
      />
      {invalid ? (
        <span className="text-xs text-red-700">whole piles only</span>
      ) : null}
    </div>
  );
}

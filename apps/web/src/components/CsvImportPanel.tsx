import {useState} from 'react';
import type {CsvRow, Issue, Result} from '@pile-on/core';
import {parseCsvText} from '../lib/csv';
import {Button, IssueList} from './ui';

/**
 * Shared CSV import UI. Parsing text to rows is Papa's job; turning rows into
 * domain objects is core's job, passed in as `parseRows` — so this component
 * knows nothing about piles or vehicles.
 */
export function CsvImportPanel<T>({
  label,
  example,
  parseRows,
  onImport,
}: {
  readonly label: string;
  readonly example: string;
  readonly parseRows: (rows: readonly CsvRow[]) => Result<T[]>;
  readonly onImport: (items: readonly T[], replace: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<readonly Issue[]>([]);
  const [replace, setReplace] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  function handleParseAndImport(source: string) {
    setImported(null);
    const result = parseRows(parseCsvText(source));
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    onImport(result.value, replace);
    setImported(result.value.length);
    setText('');
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    handleParseAndImport(await file.text());
  }

  return (
    <details className="rounded border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
        Import {label} from CSV
      </summary>

      <div className="space-y-3 border-t border-slate-200 p-3">
        <fieldset className="flex flex-wrap items-center gap-4 text-sm">
          <legend className="sr-only">Import mode</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`csv-mode-${label}`}
              checked={!replace}
              onChange={() => setReplace(false)}
            />
            Merge: update rows with matching ids, keep the rest
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`csv-mode-${label}`}
              checked={replace}
              onChange={() => setReplace(true)}
            />
            Replace the whole list
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Choose a .csv file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label={`${label} CSV file`}
            onChange={event => void handleFile(event.target.files?.[0])}
            className="text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Or paste rows (a block copied from Excel works too)
          </span>
          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            rows={5}
            placeholder={example}
            aria-label={`${label} CSV text`}
            className="rounded border border-slate-300 p-2 font-mono text-xs"
          />
        </label>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={text.trim() === ''}
            onClick={() => handleParseAndImport(text)}
          >
            Import pasted rows
          </Button>
          <Button variant="quiet" onClick={() => setText(example)}>
            Fill with example
          </Button>
          {imported !== null ? (
            <span role="status" className="text-sm text-green-700">
              Imported {imported} {imported === 1 ? 'row' : 'rows'}.
            </span>
          ) : null}
        </div>

        <IssueList issues={issues} title="This CSV was not imported" />
      </div>
    </details>
  );
}

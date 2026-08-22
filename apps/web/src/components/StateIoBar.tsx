import {useState} from 'react';
import {
  IMPORT_MODES,
  IMPORT_MODE_LABELS,
  applyImport,
  findDanglingReferences,
  parseAppState,
  serialiseAppState,
  totalPileCount,
  type AppState,
  type ImportMode,
  type Issue,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {downloadText, stateFilename} from '../lib/download';
import {Button, IssueList} from './ui';

function summarise(state: AppState): string {
  const {pileTypes, vehicles} = state.catalogue;
  const pileCount = totalPileCount(state.job);
  const jobPart =
    pileCount > 0
      ? `a schedule of ${pileCount} piles${state.job.name ? ` (${state.job.name})` : ''}`
      : 'no schedule';
  const planPart =
    state.plan.consignments.length > 0
      ? `${state.plan.consignments.length} consignments`
      : 'no plan';
  return `${pileTypes.length} pile types, ${vehicles.length} vehicles, ${jobPart}, ${planPart}`;
}

/**
 * Export writes the whole session — catalogues and plan — as one file. Import
 * makes the user choose what to take from it, because bringing in a revised
 * catalogue without discarding the plan you are mid-way through is the common
 * case, and silently replacing the plan would be destructive.
 */
export function StateIoBar() {
  const {state, dispatch} = useAppState();
  const [pending, setPending] = useState<AppState | null>(null);
  const [mode, setMode] = useState<ImportMode>('catalogue-only');
  const [issues, setIssues] = useState<readonly Issue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly Issue[]>([]);

  function handleExport() {
    const stamped: AppState = {...state, savedAt: new Date().toISOString()};
    downloadText(stateFilename(new Date()), serialiseAppState(stamped));
    setNotice('Exported.');
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setNotice(null);
    setWarnings([]);
    const result = parseAppState(await file.text());
    if (!result.ok) {
      setIssues(result.issues);
      setPending(null);
      return;
    }
    setIssues([]);
    setPending(result.value);
  }

  function confirmImport() {
    if (!pending) {
      return;
    }
    const next = applyImport(state, pending, mode, new Date().toISOString());
    dispatch({type: 'replaceState', state: next});
    setWarnings(findDanglingReferences(next));
    setPending(null);
    setNotice(`Imported — ${IMPORT_MODE_LABELS[mode].split(' —')[0]!}.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleExport}>Export JSON</Button>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Import JSON</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Import state JSON file"
            onChange={event => void handleFile(event.target.files?.[0])}
            className="text-sm"
          />
        </label>

        {notice ? (
          <span role="status" className="text-sm text-green-700">
            {notice}
          </span>
        ) : null}
      </div>

      <IssueList issues={issues} title="This file was not imported" />

      {pending ? (
        <div className="space-y-3 rounded border border-sky-300 bg-sky-50 p-3">
          <p className="text-sm text-slate-800">
            File contains <strong>{summarise(pending)}</strong>
            {pending.savedAt ? `, saved ${pending.savedAt.slice(0, 10)}` : ''}.
          </p>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-slate-700">
              What should be imported?
            </legend>
            {IMPORT_MODES.map(option => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="import-mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => setMode(option)}
                />
                {IMPORT_MODE_LABELS[option]}
              </label>
            ))}
          </fieldset>

          <div className="flex gap-2">
            <Button variant="primary" onClick={confirmImport}>
              Import
            </Button>
            <Button onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <IssueList
          issues={warnings}
          title="Imported, but the existing plan now references things that are gone"
        />
      ) : null}
    </div>
  );
}

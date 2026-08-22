import {
  JOB_CSV_EXAMPLE,
  isSingleHelix,
  jobQuantity,
  parseJobRows,
  payloadCapacity,
  toMetres,
  toTonnes,
  totalPileCount,
  totalPileMass,
  type CsvRow,
  type Result,
  type JobLine,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {CsvImportPanel} from './CsvImportPanel';
import {QuantityCell} from './QuantityCell';
import {Button, EmptyState, Field, Panel} from './ui';

export function JobSection() {
  const {state, dispatch} = useAppState();
  const {pileTypes, vehicles} = state.catalogue;
  const {job} = state;

  const pileCount = totalPileCount(job);
  const mass = totalPileMass(job, state.catalogue);

  /*
   * The largest payload in the fleet, used only to say how heavy this job is in
   * truck terms. It is not a truck-count estimate — geometry decides that, and
   * for small-diameter piles a deck runs out of room long before it runs out of
   * tonnes. Showing the share is what tells a quoter which of the two they are
   * up against.
   */
  const largestPayload = vehicles.reduce(
    (most, vehicle) => Math.max(most, payloadCapacity(vehicle)),
    0,
  );
  const massShare = largestPayload > 0 ? mass / largestPayload : null;

  function importLines(lines: readonly JobLine[], replace: boolean) {
    dispatch({type: 'importJobLines', lines, replace});
  }

  /** The importer needs the catalogue to reject unknown pile types. */
  const parseRows = (rows: readonly CsvRow[]): Result<JobLine[]> =>
    parseJobRows(rows, new Set(pileTypes.map(type => type.id)));

  return (
    <Panel
      title="Piling schedule"
      actions={
        pileCount > 0 ? (
          <Button variant="danger" onClick={() => dispatch({type: 'clearJob'})}>
            Clear quantities
          </Button>
        ) : null
      }
    >
      <div className="max-w-md">
        <Field
          label="Job name or number"
          value={job.name}
          placeholder="e.g. 24-118 Te Rapa warehouse"
          onChange={name => dispatch({type: 'setJobName', name})}
        />
      </div>

      {pileTypes.length === 0 ? (
        <EmptyState>
          No pile types in the catalogue yet. Add them on the{' '}
          <strong>Pile types</strong> tab first — a schedule can only draw on
          types that exist.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-3 font-medium">Pile type</th>
                <th className="py-2 pr-3 text-right font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Helices</th>
                <th className="py-2 pr-3 text-right font-medium">Unit mass</th>
                <th className="py-2 pr-3 text-right font-medium">Quantity</th>
                <th className="py-2 text-right font-medium">Line mass</th>
              </tr>
            </thead>
            <tbody>
              {pileTypes.map(type => {
                const quantity = jobQuantity(job, type.id);
                return (
                  <tr
                    key={type.id}
                    className={`border-b border-slate-100 ${
                      quantity > 0 ? '' : 'text-slate-400'
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs">{type.id}</div>
                      <div className="text-xs text-slate-500">{type.name}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {toMetres(type.length).toFixed(2)} m
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {type.helices.length === 0
                        ? 'plain shaft'
                        : `${type.helices.length} · ${
                            isSingleHelix(type)
                              ? 'interleaves'
                              : 'no interleave'
                          }`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {type.mass} kg
                    </td>
                    <td className="py-2 pr-3">
                      <QuantityCell
                        label={`Quantity of ${type.id}`}
                        value={quantity}
                        onCommit={next =>
                          dispatch({
                            type: 'setJobQuantity',
                            pileTypeId: type.id,
                            quantity: next,
                          })
                        }
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {quantity > 0
                        ? `${(type.mass * quantity).toLocaleString('en-NZ')} kg`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-medium">
                <td className="py-2 pr-3" colSpan={4}>
                  Total
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {pileCount.toLocaleString('en-NZ')} piles
                </td>
                <td className="py-2 text-right tabular-nums">
                  {mass.toLocaleString('en-NZ')} kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pileCount > 0 ? (
        <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <strong>
            {pileCount.toLocaleString('en-NZ')} piles,{' '}
            {toTonnes(mass).toFixed(2)} t
          </strong>
          {massShare === null
            ? '. Add a vehicle to see how this compares with a deck.'
            : massShare < 0.5
              ? ` — ${Math.round(massShare * 100)}% of your largest payload, so this job is almost
                 certainly limited by deck space rather than mass.`
              : ` — ${Math.round(massShare * 100)}% of your largest payload.`}{' '}
          Pack it on the Loading plan tab for a truck count.
        </p>
      ) : null}

      <CsvImportPanel
        label="schedule"
        example={JOB_CSV_EXAMPLE}
        parseRows={parseRows}
        onImport={importLines}
      />
    </Panel>
  );
}

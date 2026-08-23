import {
  PILE_TYPE_CSV_EXAMPLE,
  isSingleHelix,
  parsePileTypeRows,
  pilePartOf,
  pileTypeCode,
  toMetres,
  type PileType,
} from '@pile-on/core';
import {useEditor} from '../lib/useEditor';
import {useAppState} from '../state/AppStateProvider';
import {CsvImportPanel} from './CsvImportPanel';
import {PileTypeForm, describeWidth} from './PileTypeForm';
import {Button, EmptyState, Panel} from './ui';

export function PileTypeSection() {
  const {state, dispatch} = useAppState();
  const pileTypes = state.catalogue.pileTypes;
  const editor = useEditor(pileTypes);

  function save(pileType: PileType) {
    dispatch({type: 'upsertPileType', pileType});
    editor.close();
  }

  return (
    <Panel
      title={`Pile types (${pileTypes.length})`}
      actions={
        !editor.adding && !editor.editing ? (
          <Button variant="primary" onClick={editor.startAdd}>
            Add pile type
          </Button>
        ) : null
      }
    >
      {pileTypes.length === 0 ? (
        <EmptyState>
          No pile types yet. Add one below, or import a CSV.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-3 font-medium">Pile type</th>
                <th className="py-2 pr-3 font-medium">Part</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 text-right font-medium">Length</th>
                <th className="py-2 pr-3 text-right font-medium">Shaft ⌀</th>
                <th className="py-2 pr-3 text-right font-medium">Widest ⌀</th>
                <th className="py-2 pr-3 text-right font-medium">Mass</th>
                <th className="py-2 pr-3 font-medium">Helices</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pileTypes.map(type => (
                <tr key={type.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {pileTypeCode(type)}
                  </td>
                  <td className="py-2 pr-3 capitalize">{pilePartOf(type)}</td>
                  <td className="py-2 pr-3">{type.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {toMetres(type.length).toFixed(2)} m
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {type.shaftRadius * 2} mm
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {describeWidth(type)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {type.mass} kg
                  </td>
                  <td className="py-2 pr-3">
                    {type.helices.length === 0 ? (
                      <span className="text-slate-500">plain shaft</span>
                    ) : (
                      <span
                        className={
                          isSingleHelix(type)
                            ? 'rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-900'
                            : 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900'
                        }
                        title={
                          isSingleHelix(type)
                            ? 'One helix. Its plate can interleave with another single-helix pile, saving deck length.'
                            : 'More than one helix. It needs full clearance from every neighbour, so it cannot interleave.'
                        }
                      >
                        {type.helices.length === 1
                          ? '1 helix'
                          : `${type.helices.length} helices`}{' '}
                        ·{' '}
                        {isSingleHelix(type) ? 'interleaves' : 'no interleave'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      variant="quiet"
                      onClick={() => editor.startEdit(type.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        dispatch({type: 'removePileType', id: type.id})
                      }
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor.adding || editor.editing ? (
        <PileTypeForm
          editing={editor.editing}
          onSave={save}
          onCancel={editor.close}
        />
      ) : null}

      <CsvImportPanel
        label="pile types"
        example={PILE_TYPE_CSV_EXAMPLE}
        parseRows={parsePileTypeRows}
        onImport={(pileTypes, replace) =>
          dispatch({type: 'importPileTypes', pileTypes, replace})
        }
      />
    </Panel>
  );
}

import {
  VEHICLE_CSV_EXAMPLE,
  VEHICLE_KIND_LABELS,
  isTrailer,
  parseVehicleRows,
  toMetres,
  trailersFor,
} from '@pile-on/core';
import {useEditor} from '../lib/useEditor';
import {useAppState} from '../state/AppStateProvider';
import {CsvImportPanel} from './CsvImportPanel';
import {VehicleForm} from './VehicleForm';
import {Button, EmptyState, Panel} from './ui';

export function VehicleSection() {
  const {state, dispatch} = useAppState();
  const vehicles = state.catalogue.vehicles;
  const editor = useEditor(vehicles);

  return (
    <Panel
      title={`Vehicles (${vehicles.length})`}
      actions={
        !editor.adding && !editor.editing ? (
          <Button variant="primary" onClick={editor.startAdd}>
            Add vehicle
          </Button>
        ) : null
      }
    >
      {vehicles.length === 0 ? (
        <EmptyState>
          No vehicles yet. Add one below, or import a CSV.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-3 font-medium">Id</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">Tows</th>
                <th className="py-2 pr-3 text-right font-medium">Deck</th>
                <th className="py-2 pr-3 text-right font-medium">Payload</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(vehicle => {
                return (
                  <tr key={vehicle.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs">{vehicle.id}</div>
                      <div className="text-xs text-slate-500">
                        {vehicle.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {VEHICLE_KIND_LABELS[vehicle.kind]}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {isTrailer(vehicle) ? (
                        <>
                          towed by{' '}
                          {vehicle.towableBy.map((truckId, index) => (
                            <span key={truckId}>
                              {index > 0 ? ', ' : ''}
                              <span
                                className={
                                  vehicles.some(v => v.id === truckId)
                                    ? 'font-mono'
                                    : 'font-mono text-red-700'
                                }
                                title={
                                  vehicles.some(v => v.id === truckId)
                                    ? undefined
                                    : 'No truck with this id in the catalogue'
                                }
                              >
                                {truckId}
                              </span>
                            </span>
                          ))}
                        </>
                      ) : (
                        (() => {
                          const tows = trailersFor(state.catalogue, vehicle.id);
                          return tows.length === 0 ? (
                            <span className="text-slate-500">solo</span>
                          ) : (
                            <>
                              tows{' '}
                              <span className="font-mono">
                                {tows.map(t => t.id).join(', ')}
                              </span>
                            </>
                          );
                        })()
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {toMetres(vehicle.deckLength).toFixed(2)} ×{' '}
                      {toMetres(vehicle.deckWidth).toFixed(2)} m
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {vehicle.payloadCapacity.toLocaleString('en-NZ')} kg
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        variant="quiet"
                        onClick={() => editor.startEdit(vehicle.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          dispatch({type: 'removeVehicle', id: vehicle.id})
                        }
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor.adding || editor.editing ? (
        <VehicleForm
          editing={editor.editing}
          onSave={vehicle => {
            dispatch({type: 'upsertVehicle', vehicle});
            editor.close();
          }}
          onCancel={editor.close}
        />
      ) : null}

      <CsvImportPanel
        label="vehicles"
        example={VEHICLE_CSV_EXAMPLE}
        parseRows={parseVehicleRows}
        onImport={(vehicles, replace) =>
          dispatch({type: 'importVehicles', vehicles, replace})
        }
      />
    </Panel>
  );
}

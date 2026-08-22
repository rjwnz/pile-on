import {useState} from 'react';
import {
  VEHICLE_CSV_EXAMPLE,
  VEHICLE_KIND_LABELS,
  axleSetIds,
  bridgeFormulaLimit,
  axleSpan,
  parseVehicleRows,
  payloadCapacity,
  toMetres,
  type Vehicle,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {CsvImportPanel} from './CsvImportPanel';
import {VehicleForm} from './VehicleForm';
import {Button, EmptyState, Panel} from './ui';

/**
 * The bridge-formula limit for the vehicle's own axle span, shown next to the
 * operator's stated max gross. Where the legal limit is the lower of the two,
 * the paperwork figure is not the one that binds — worth seeing at a glance.
 */
function legalGross(vehicle: Vehicle): {limit: number | null; binds: boolean} {
  const limit = bridgeFormulaLimit(axleSpan(vehicle), vehicle.axles.length);
  return {limit, binds: limit !== null && limit < vehicle.maxGross};
}

export function VehicleSection() {
  const {state, dispatch} = useAppState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const vehicles = state.catalogue.vehicles;
  const editing = vehicles.find(vehicle => vehicle.id === editingId);

  return (
    <Panel
      title={`Vehicles (${vehicles.length})`}
      actions={
        !adding && !editing ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add vehicle
          </Button>
        ) : null
      }
    >
      {vehicles.length === 0 ? (
        <EmptyState>
          No vehicles yet. Add one by hand, or import a CSV below.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-3 font-medium">Id</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 text-right font-medium">Deck</th>
                <th className="py-2 pr-3 text-right font-medium">Payload</th>
                <th className="py-2 pr-3 text-right font-medium">Axle span</th>
                <th className="py-2 pr-3 font-medium">Axle sets</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(vehicle => {
                const {limit, binds} = legalGross(vehicle);
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
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {toMetres(vehicle.deckLength).toFixed(2)} ×{' '}
                      {toMetres(vehicle.deckWidth).toFixed(2)} m
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {payloadCapacity(vehicle).toLocaleString('en-NZ')} kg
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {toMetres(axleSpan(vehicle)).toFixed(2)} m
                      {binds ? (
                        <div
                          className="text-xs text-amber-700"
                          title="The VDAM combined axle-set table caps this combination below its rated gross mass."
                        >
                          bridge limit {limit!.toLocaleString('en-NZ')} kg
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {axleSetIds(vehicle).join(', ')} ({vehicle.axles.length}{' '}
                      axles)
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        variant="quiet"
                        onClick={() => {
                          setEditingId(vehicle.id);
                          setAdding(false);
                        }}
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

      {adding || editing ? (
        <VehicleForm
          editing={editing}
          onSave={vehicle => {
            dispatch({type: 'upsertVehicle', vehicle});
            setAdding(false);
            setEditingId(null);
          }}
          onCancel={() => {
            setAdding(false);
            setEditingId(null);
          }}
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

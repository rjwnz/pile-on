import {useState} from 'react';
import {
  NZ_VDAM_2016,
  VEHICLE_CSV_EXAMPLE,
  VEHICLE_KIND_LABELS,
  isOverGrossMass,
  isOverHeight,
  parseVehicleRows,
  payloadCapacity,
  toMetres,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {CsvImportPanel} from './CsvImportPanel';
import {VehicleForm} from './VehicleForm';
import {Button, EmptyState, Panel} from './ui';

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
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-3 font-medium">Id</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 text-right font-medium">Deck</th>
                <th className="py-2 pr-3 text-right font-medium">
                  Deck height
                </th>
                <th className="py-2 pr-3 text-right font-medium">Tare</th>
                <th className="py-2 pr-3 text-right font-medium">Payload</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(vehicle => {
                /*
                 * Two things worth flagging on sight: a rated gross above
                 * general access needs an HPMV permit, and a deck so tall that
                 * even a bare deck breaks the 4.3 m height limit is a data
                 * error.
                 */
                const needsPermit = isOverGrossMass(vehicle.maxGross);
                const deckTooTall = isOverHeight(vehicle.deckHeight);
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
                      {toMetres(vehicle.deckHeight).toFixed(2)} m
                      {deckTooTall ? (
                        <div className="text-xs text-red-700">
                          over the {toMetres(NZ_VDAM_2016.maxHeight).toFixed(1)}{' '}
                          m limit before any load
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {vehicle.tare.toLocaleString('en-NZ')} kg
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {payloadCapacity(vehicle).toLocaleString('en-NZ')} kg
                      {needsPermit ? (
                        <div
                          className="text-xs text-amber-700"
                          title="Above the general-access gross mass. Divisible loads need an HPMV permit; the route must be approved for it."
                        >
                          HPMV permit — over{' '}
                          {NZ_VDAM_2016.maxGrossMass.toLocaleString('en-NZ')} kg
                          gross
                        </div>
                      ) : null}
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

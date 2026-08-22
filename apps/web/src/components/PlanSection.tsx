import {useMemo, useState} from 'react';
import {
  DEFAULT_LOADING_OPTIONS,
  arrangeNaively,
  totalPileCount,
  validatePlan,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {ConsignmentView} from './ConsignmentView';
import {Button, EmptyState, Panel, SelectField} from './ui';

export function PlanSection() {
  const {state, dispatch} = useAppState();
  const {catalogue, job, plan} = state;
  const options = DEFAULT_LOADING_OPTIONS;

  const [vehicleId, setVehicleId] = useState(
    () => catalogue.vehicles[0]?.id ?? '',
  );
  const [unplaced, setUnplaced] = useState<
    readonly {pileTypeId: string; quantity: number; reason: string}[]
  >([]);

  const violations = useMemo(
    () => validatePlan(plan, catalogue, options),
    [plan, catalogue, options],
  );

  const scheduled = totalPileCount(job);
  const vehicle = catalogue.vehicles.find(entry => entry.id === vehicleId);

  function arrange() {
    if (!vehicle) {
      return;
    }
    const result = arrangeNaively(job, catalogue, vehicle, options);
    dispatch({type: 'setPlan', plan: result.plan});
    setUnplaced(result.unplaced);
  }

  if (catalogue.vehicles.length === 0 || scheduled === 0) {
    return (
      <Panel title="Loading plan">
        <EmptyState>
          {catalogue.vehicles.length === 0
            ? 'Add a vehicle on the Vehicles tab first.'
            : 'Set some quantities on the Piling schedule tab first.'}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      title={
        plan.consignments.length > 0
          ? `Loading plan — ${plan.consignments.length} ${plan.consignments.length === 1 ? 'truck' : 'trucks'}`
          : 'Loading plan'
      }
      actions={
        plan.consignments.length > 0 ? (
          <Button
            variant="danger"
            onClick={() => dispatch({type: 'clearPlan'})}
          >
            Clear plan
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <SelectField
            label="Load onto"
            value={vehicleId}
            onChange={setVehicleId}
            options={catalogue.vehicles.map(entry => ({
              value: entry.id,
              label: `${entry.name} (${entry.id})`,
            }))}
          />
        </div>
        <Button variant="primary" onClick={arrange} disabled={!vehicle}>
          Arrange {scheduled} piles
        </Button>
      </div>

      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>This is the naive baseline, not the packer.</strong> Every pile
        is treated as a cylinder of its widest diameter for its whole length,
        each tier is given over to one pile type, and nothing is staggered or
        flipped. It exists to give this view something real to draw and to be
        the number the helix-aware packer has to beat.
      </p>

      {unplaced.length > 0 ? (
        <ul
          role="alert"
          className="space-y-1 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <li className="font-medium">
            Could not place {unplaced.length}{' '}
            {unplaced.length === 1 ? 'pile type' : 'pile types'} on this
            vehicle:
          </li>
          {unplaced.map(entry => (
            <li key={entry.pileTypeId}>
              <span className="font-mono text-xs">{entry.pileTypeId}</span> ×{' '}
              {entry.quantity} — {entry.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {plan.consignments.length === 0 ? (
        <EmptyState>
          No plan yet. Pick a vehicle and arrange the schedule onto it.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {plan.consignments.map((consignment, index) => (
            <ConsignmentView
              key={consignment.id}
              consignment={consignment}
              index={index}
              total={plan.consignments.length}
              catalogue={catalogue}
              options={options}
              placements={plan.placements.filter(
                placement => placement.consignmentId === consignment.id,
              )}
              violations={violations.filter(
                violation => violation.consignmentId === consignment.id,
              )}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

import {useMemo, useState} from 'react';
import {
  arrangeNaively,
  pack,
  totalPileCount,
  validatePlan,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {ConsignmentView} from './ConsignmentView';
import {PackingOptionsPanel} from './PackingOptionsPanel';
import {Button, EmptyState, Panel, SelectField} from './ui';

/** One shared empty, so a truck with nothing on it still gets a stable prop. */
const NONE: readonly never[] = [];

/**
 * Sort a plan-wide list into one bucket per truck.
 *
 * The saving is not the arithmetic, though this is a single pass where
 * filtering per truck was a pass each. It is that the arrays keep their
 * identity from one render to the next. The 3D view rebuilds its scene when its
 * placements change, and a fresh `.filter()` on every render told it they
 * always had — so every keystroke anywhere on the page rebuilt every truck.
 */
function byConsignment<T extends {readonly consignmentId: string}>(
  items: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const bucket = grouped.get(item.consignmentId);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(item.consignmentId, [item]);
    }
  }
  return grouped;
}

export function PlanSection() {
  const {state, dispatch} = useAppState();
  const {catalogue, job, plan, options} = state;

  const [vehicleId, setVehicleId] = useState(
    () => catalogue.vehicles[0]?.id ?? '',
  );
  const [unplaced, setUnplaced] = useState<
    readonly {pileTypeId: string; quantity: number; reason: string}[]
  >([]);
  /** What the control needed for the same job. The business case, live. */
  const [baselineTrucks, setBaselineTrucks] = useState<number | null>(null);

  const violations = useMemo(
    () => validatePlan(plan, catalogue, options),
    [plan, catalogue, options],
  );

  const placementsPerTruck = useMemo(
    () => byConsignment(plan.placements),
    [plan.placements],
  );
  const violationsPerTruck = useMemo(
    () => byConsignment(violations),
    [violations],
  );

  const scheduled = totalPileCount(job);
  const vehicle = catalogue.vehicles.find(entry => entry.id === vehicleId);

  function build(useBaseline: boolean) {
    if (!vehicle) {
      return;
    }
    const result = useBaseline
      ? arrangeNaively(job, catalogue, vehicle, options)
      : pack(job, catalogue, vehicle, options);
    dispatch({type: 'setPlan', plan: result.plan});
    setUnplaced(result.unplaced);
    setBaselineTrucks(
      useBaseline
        ? null
        : arrangeNaively(job, catalogue, vehicle, options).plan.consignments
            .length,
    );
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
        <Button
          variant="primary"
          onClick={() => build(false)}
          disabled={!vehicle}
        >
          Pack {scheduled} piles
        </Button>
        <Button onClick={() => build(true)} disabled={!vehicle}>
          Baseline instead
        </Button>
      </div>

      <PackingOptionsPanel
        options={options}
        vehicle={vehicle}
        onChange={next => dispatch({type: 'setOptions', options: next})}
      />

      {baselineTrucks === null ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>This is the naive baseline, not the packer.</strong> Every
          pile is treated as a cylinder of its widest diameter for its whole
          length, each tier is given over to one pile type, and nothing is
          staggered or flipped. It is the control — the number the helix-aware
          packer has to beat.
        </p>
      ) : (
        <p
          className={`rounded border p-3 text-sm ${
            baselineTrucks > plan.consignments.length
              ? 'border-green-300 bg-green-50 text-green-900'
              : 'border-slate-300 bg-slate-50 text-slate-700'
          }`}
        >
          {baselineTrucks > plan.consignments.length ? (
            <>
              <strong>
                {baselineTrucks - plan.consignments.length}{' '}
                {baselineTrucks - plan.consignments.length === 1
                  ? 'truck'
                  : 'trucks'}{' '}
                saved.
              </strong>{' '}
              Treating each pile as a cylinder of its widest diameter needs{' '}
              {baselineTrucks}. Staggering the plates so they miss each other
              lets neighbouring lanes close from plate-to-plate pitch to
              plate-to-shaft, and this job fits on {plan.consignments.length}.
            </>
          ) : (
            <>
              <strong>No saving on this job.</strong> The baseline also needs{' '}
              {baselineTrucks}. Staggering buys deck width, so it shows up when
              width is what runs out — a job bounded by mass, height or tier
              count has nothing for it to win back.
            </>
          )}
        </p>
      )}

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
          No plan yet. Pick a vehicle and pack the schedule onto it.
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
              placements={placementsPerTruck.get(consignment.id) ?? NONE}
              violations={violationsPerTruck.get(consignment.id) ?? NONE}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

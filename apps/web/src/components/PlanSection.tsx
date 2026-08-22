import {useMemo, useState} from 'react';
import {
  arrangeNaively,
  combinationsOf,
  groupBy,
  isTrailer,
  pack,
  totalPileCount,
  validatePlan,
  type Placement,
} from '@pile-on/core';
import {useAppState} from '../state/AppStateProvider';
import {ConsignmentView} from './ConsignmentView';
import {PackingOptionsPanel} from './PackingOptionsPanel';
import {Button, EmptyState, Panel} from './ui';

/** One shared empty, so a deck with nothing on it still gets a stable prop. */
const NONE: readonly never[] = [];

interface MovementDecks {
  readonly truck: readonly Placement[];
  readonly trailer: readonly Placement[];
}

export function PlanSection() {
  const {state, dispatch} = useAppState();
  const {catalogue, job, plan, options} = state;

  const [unplaced, setUnplaced] = useState<
    readonly {pileTypeId: string; quantity: number; reason: string}[]
  >([]);
  /** What the control needed for the same job. The business case, live. */
  const [baselineMovements, setBaselineMovements] = useState<number | null>(
    null,
  );

  const violations = useMemo(
    () => validatePlan(plan, catalogue, options),
    [plan, catalogue, options],
  );

  // Grouped once, per movement and per deck, so the arrays keep their identity
  // between renders — the 3D view rebuilds its scene when its array changes.
  const decksPerMovement = useMemo(() => {
    const map = new Map<string, {truck: Placement[]; trailer: Placement[]}>();
    for (const placement of plan.placements) {
      let entry = map.get(placement.consignmentId);
      if (!entry) {
        entry = {truck: [], trailer: []};
        map.set(placement.consignmentId, entry);
      }
      entry[placement.deck].push(placement);
    }
    return map as ReadonlyMap<string, MovementDecks>;
  }, [plan.placements]);
  const violationsPerMovement = useMemo(
    () => groupBy(violations, violation => violation.consignmentId),
    [violations],
  );

  const scheduled = totalPileCount(job);
  const combinations = useMemo(() => combinationsOf(catalogue), [catalogue]);
  const trucks = catalogue.vehicles.filter(v => !isTrailer(v)).length;
  const trailers = catalogue.vehicles.length - trucks;

  function build(useBaseline: boolean) {
    const result = useBaseline
      ? arrangeNaively(job, catalogue, options)
      : pack(job, catalogue, options);
    dispatch({type: 'setPlan', plan: result.plan});
    setUnplaced(result.unplaced);
    setBaselineMovements(
      useBaseline
        ? null
        : arrangeNaively(job, catalogue, options).plan.consignments.length,
    );
  }

  if (combinations.length === 0 || scheduled === 0) {
    return (
      <Panel title="Loading plan">
        <EmptyState>
          {combinations.length === 0
            ? catalogue.vehicles.length === 0
              ? 'Add a vehicle on the Vehicles tab first.'
              : 'No self-propelled truck in the catalogue — every vehicle is a trailer. Add a truck on the Vehicles tab.'
            : 'Set some quantities on the Piling schedule tab first.'}
        </EmptyState>
      </Panel>
    );
  }

  const movements = plan.consignments.length;

  return (
    <Panel
      title={
        movements > 0
          ? `Loading plan — ${movements} ${movements === 1 ? 'movement' : 'movements'}`
          : 'Loading plan'
      }
      actions={
        movements > 0 ? (
          <Button
            variant="danger"
            onClick={() => dispatch({type: 'clearPlan'})}
          >
            Clear plan
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => build(false)}>
          Pack {scheduled} piles
        </Button>
        <Button onClick={() => build(true)}>Baseline instead</Button>
        <p className="text-sm text-slate-600">
          Packing draws on the whole fleet: {trucks}{' '}
          {trucks === 1 ? 'truck' : 'trucks'}
          {trailers > 0
            ? `, ${trailers} ${trailers === 1 ? 'trailer' : 'trailers'}`
            : ''}{' '}
          — {combinations.length}{' '}
          {combinations.length === 1 ? 'combination' : 'combinations'}.
        </p>
      </div>

      <PackingOptionsPanel
        options={options}
        onChange={next => dispatch({type: 'setOptions', options: next})}
      />

      {baselineMovements === null ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>This is the naive baseline, not the packer.</strong> Every
          pile is treated as a cylinder of its widest diameter for its whole
          length, each tier is given over to one pile type, nothing is staggered
          or flipped, and every movement uses the biggest combination in the
          fleet. It is the control — the number the packer has to beat.
        </p>
      ) : (
        <p
          className={`rounded border p-3 text-sm ${
            baselineMovements > movements
              ? 'border-green-300 bg-green-50 text-green-900'
              : 'border-slate-300 bg-slate-50 text-slate-700'
          }`}
        >
          {baselineMovements > movements ? (
            <>
              <strong>
                {baselineMovements - movements}{' '}
                {baselineMovements - movements === 1 ? 'movement' : 'movements'}{' '}
                saved.
              </strong>{' '}
              The naive control needs {baselineMovements}. Staggering plates so
              they miss each other, mixing types, and choosing the right
              combination for each load fits this job on {movements}.
            </>
          ) : (
            <>
              <strong>No saving on this job.</strong> The baseline also needs{' '}
              {baselineMovements}. The packer wins back deck width and picks the
              fleet mix, so it shows up when those are what run out.
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
            {unplaced.length === 1 ? 'pile type' : 'pile types'} anywhere in the
            fleet:
          </li>
          {unplaced.map(entry => (
            <li key={entry.pileTypeId}>
              <span className="font-mono text-xs">{entry.pileTypeId}</span> ×{' '}
              {entry.quantity} — {entry.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {movements === 0 ? (
        <EmptyState>No plan yet. Pack the schedule onto the fleet.</EmptyState>
      ) : (
        <div className="space-y-6">
          {plan.consignments.map((consignment, index) => {
            const decks = decksPerMovement.get(consignment.id);
            return (
              <ConsignmentView
                key={consignment.id}
                consignment={consignment}
                index={index}
                total={movements}
                catalogue={catalogue}
                options={options}
                truckPlacements={decks?.truck ?? NONE}
                trailerPlacements={decks?.trailer ?? NONE}
                violations={violationsPerMovement.get(consignment.id) ?? NONE}
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
}

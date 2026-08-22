import {
  EMPTY_JOB,
  removeById,
  setJobQuantity,
  upsertById,
  EMPTY_PLAN,
  type AppState,
  type Catalogue,
  type JobLine,
  type PackingOptions,
  type LoadPlan,
  type PileType,
  type Vehicle,
} from '@pile-on/core';

/**
 * All state transitions, as a pure function.
 *
 * Kept out of React so it can be tested directly. `savedAt` is deliberately not
 * maintained here — it means "when this file was written" and is stamped at
 * export time, not on every keystroke.
 */
export type AppAction =
  | {readonly type: 'upsertPileType'; readonly pileType: PileType}
  | {readonly type: 'removePileType'; readonly id: string}
  | {
      readonly type: 'importPileTypes';
      readonly pileTypes: readonly PileType[];
      readonly replace: boolean;
    }
  | {readonly type: 'upsertVehicle'; readonly vehicle: Vehicle}
  | {readonly type: 'removeVehicle'; readonly id: string}
  | {
      readonly type: 'importVehicles';
      readonly vehicles: readonly Vehicle[];
      readonly replace: boolean;
    }
  | {readonly type: 'setJobName'; readonly name: string}
  | {
      readonly type: 'setJobQuantity';
      readonly pileTypeId: string;
      readonly quantity: number;
    }
  | {
      readonly type: 'importJobLines';
      readonly lines: readonly JobLine[];
      readonly replace: boolean;
    }
  | {readonly type: 'clearJob'}
  | {readonly type: 'setOptions'; readonly options: PackingOptions}
  | {readonly type: 'setPlan'; readonly plan: LoadPlan}
  | {readonly type: 'clearPlan'}
  | {readonly type: 'replaceState'; readonly state: AppState};

function mergeAll<T extends {readonly id: string}>(
  existing: readonly T[],
  incoming: readonly T[],
  replace: boolean,
): T[] {
  if (replace) {
    return [...incoming];
  }
  return incoming.reduce<T[]>(
    (accumulated, item) => upsertById(accumulated, item),
    [...existing],
  );
}

function withCatalogue(state: AppState, patch: Partial<Catalogue>): AppState {
  return {...state, catalogue: {...state.catalogue, ...patch}};
}

export function appReducer(state: AppState, action: AppAction): AppState {
  const {pileTypes, vehicles} = state.catalogue;
  switch (action.type) {
    case 'upsertPileType':
      return withCatalogue(state, {
        pileTypes: upsertById(pileTypes, action.pileType),
      });

    case 'removePileType':
      return withCatalogue(state, {
        pileTypes: removeById(pileTypes, action.id),
      });

    case 'importPileTypes':
      return withCatalogue(state, {
        pileTypes: mergeAll(pileTypes, action.pileTypes, action.replace),
      });

    case 'upsertVehicle':
      return withCatalogue(state, {
        vehicles: upsertById(vehicles, action.vehicle),
      });

    case 'removeVehicle':
      return withCatalogue(state, {
        vehicles: removeById(vehicles, action.id),
      });

    case 'importVehicles':
      return withCatalogue(state, {
        vehicles: mergeAll(vehicles, action.vehicles, action.replace),
      });

    case 'setJobName':
      return {...state, job: {...state.job, name: action.name}};

    case 'setJobQuantity':
      return {
        ...state,
        job: setJobQuantity(state.job, action.pileTypeId, action.quantity),
      };

    case 'importJobLines': {
      // Merge adds to what is already there rather than overwriting, because a
      // schedule commonly arrives in parts — one file per building.
      const base = action.replace ? EMPTY_JOB.lines : state.job.lines;
      const merged = action.lines.reduce(
        (job, line) =>
          setJobQuantity(
            job,
            line.pileTypeId,
            action.replace
              ? line.quantity
              : (job.lines.find(l => l.pileTypeId === line.pileTypeId)
                  ?.quantity ?? 0) + line.quantity,
          ),
        {...state.job, lines: base},
      );
      return {...state, job: merged};
    }

    case 'clearJob':
      return {...state, job: {...state.job, lines: []}};

    /*
     * Changing an option does not clear the plan, even though it can change
     * whether that plan is legal. Seeing the violations appear is the point:
     * tightening a clearance and watching a truck go red is how you find out
     * what the tolerance was buying you.
     */
    case 'setOptions':
      return {...state, options: action.options};

    case 'setPlan':
      return {...state, plan: action.plan};

    case 'clearPlan':
      return {...state, plan: EMPTY_PLAN};

    case 'replaceState':
      return action.state;

    default: {
      // Exhaustiveness: adding an action without handling it fails the build.
      const unreachable: never = action;
      return unreachable;
    }
  }
}

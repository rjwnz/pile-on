import {
  removeById,
  upsertById,
  type AppState,
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

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'upsertPileType':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          pileTypes: upsertById(state.catalogue.pileTypes, action.pileType),
        },
      };

    case 'removePileType':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          pileTypes: removeById(state.catalogue.pileTypes, action.id),
        },
      };

    case 'importPileTypes':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          pileTypes: mergeAll(
            state.catalogue.pileTypes,
            action.pileTypes,
            action.replace,
          ),
        },
      };

    case 'upsertVehicle':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          vehicles: upsertById(state.catalogue.vehicles, action.vehicle),
        },
      };

    case 'removeVehicle':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          vehicles: removeById(state.catalogue.vehicles, action.id),
        },
      };

    case 'importVehicles':
      return {
        ...state,
        catalogue: {
          ...state.catalogue,
          vehicles: mergeAll(
            state.catalogue.vehicles,
            action.vehicles,
            action.replace,
          ),
        },
      };

    case 'replaceState':
      return action.state;

    default: {
      // Exhaustiveness: adding an action without handling it fails the build.
      const unreachable: never = action;
      return unreachable;
    }
  }
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  emptyAppState,
  parseAppState,
  serialiseAppState,
  type AppState,
} from '@pile-on/core';
import {appReducer, type AppAction} from './appReducer';

const STORAGE_KEY = 'pile-on:state:v1';

interface AppStateContextValue {
  readonly state: AppState;
  readonly dispatch: Dispatch<AppAction>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

/**
 * Restore the last session. A corrupt or stale entry starts a fresh session
 * rather than crashing the app — nothing here is the system of record, the
 * exported JSON file is.
 */
function loadPersistedState(storage: Storage | undefined): AppState {
  const fallback = emptyAppState('');
  if (!storage) {
    return fallback;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return fallback;
  }
  const result = parseAppState(raw);
  return result.ok ? result.value : fallback;
}

export function AppStateProvider({
  children,
  initialState,
  storage = typeof localStorage === 'undefined' ? undefined : localStorage,
}: {
  readonly children: ReactNode;
  readonly initialState?: AppState;
  readonly storage?: Storage | undefined;
}) {
  const [state, dispatch] = useReducer(
    appReducer,
    initialState ?? loadPersistedState(storage),
  );

  useEffect(() => {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(STORAGE_KEY, serialiseAppState(state));
    } catch {
      // Private browsing or a full quota. Losing the autosave is survivable;
      // taking the app down over it is not.
    }
  }, [state, storage]);

  const value = useMemo(() => ({state, dispatch}), [state]);

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used inside an AppStateProvider');
  }
  return value;
}

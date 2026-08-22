import {useState} from 'react';
import {NZ_VDAM_2016} from '@pile-on/core';
import {AppStateProvider} from './state/AppStateProvider';
import {JobSection} from './components/JobSection';
import {PlanSection} from './components/PlanSection';
import {PileTypeSection} from './components/PileTypeSection';
import {VehicleSection} from './components/VehicleSection';
import {StateIoBar} from './components/StateIoBar';

const TABS = [
  {id: 'piles', label: 'Pile types'},
  {id: 'vehicles', label: 'Vehicles'},
  {id: 'job', label: 'Piling schedule'},
  {id: 'plan', label: 'Loading plan'},
] as const;

type TabId = (typeof TABS)[number]['id'];

function Workspace() {
  const [tab, setTab] = useState<TabId>('piles');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-slate-900">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Pile-On</h1>
          <p className="text-sm text-slate-600">
            Load planning for steel screw piles on NZ flat-deck transport.
            Catalogues are held in your browser and never leave it — export the
            JSON to keep or share a session.
          </p>
        </div>
        <StateIoBar />
      </header>

      <nav className="flex gap-1 border-b border-slate-300" role="tablist">
        {TABS.map(entry => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === entry.id
                ? 'border-sky-700 text-sky-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === 'piles' ? <PileTypeSection /> : null}
      {tab === 'vehicles' ? <VehicleSection /> : null}
      {tab === 'job' ? <JobSection /> : null}
      {tab === 'plan' ? <PlanSection /> : null}

      <footer className="text-xs text-slate-500">
        Limits from Land Transport Rule: Vehicle Dimensions and Mass 2016
        (ruleset <code>{NZ_VDAM_2016.version}</code>, effective{' '}
        {NZ_VDAM_2016.effectiveFrom}). Every exported file records the ruleset
        it was built under.
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <Workspace />
    </AppStateProvider>
  );
}

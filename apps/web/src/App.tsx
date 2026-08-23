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
        <div className="flex items-center gap-4 rounded-xl bg-brand px-5 py-3">
          <img
            src="./brand/pile-on-logo-dark.svg"
            alt=""
            className="h-11 w-auto"
          />
          <div>
            <h1 className="text-lg font-semibold text-white">Pile On</h1>
            <p className="text-xs text-slate-300">
              Plan how to load steel screw piles onto flat-deck trucks. Your
              data stays in this browser. Export a file to save your work or
              share it.
            </p>
          </div>
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
                ? 'border-brand-amber text-brand'
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
        These limits come from the Land Transport Rule: Vehicle Dimensions and
        Mass 2016 (<code>{NZ_VDAM_2016.version}</code>, effective{' '}
        {NZ_VDAM_2016.effectiveFrom}). Every file you export records which
        ruleset it used.
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

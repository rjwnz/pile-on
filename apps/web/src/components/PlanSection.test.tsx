import {beforeEach, describe, expect, it} from '@jest/globals';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyAppState,
  type AppState,
  type Job,
  type PileType,
  type Vehicle,
} from '@pile-on/core';
import {AppStateProvider} from '../state/AppStateProvider';
import {PlanSection} from './PlanSection';

const SP168: PileType = {
  id: 'SP168-D6',
  name: 'SP168 6.0 m twin helix',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [
    {offsetFromButt: 400, radius: 225, thickness: 110},
    {offsetFromButt: 1100, radius: 175, thickness: 110},
  ],
};

const LONG: PileType = {
  ...SP168,
  id: 'SP219-D14',
  name: 'SP219 14 m',
  length: 14000,
};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Tractor + semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
};

function renderPlan({
  pileTypes = [SP168],
  vehicles = [SEMI],
  job = {
    name: 'Te Rapa',
    lines: [{pileTypeId: 'SP168-D6', quantity: 25}],
  } as Job,
}: {pileTypes?: PileType[]; vehicles?: Vehicle[]; job?: Job} = {}) {
  const state: AppState = {
    ...emptyAppState('2026-08-22T00:00:00.000Z'),
    catalogue: {pileTypes, vehicles},
    job,
  };
  return render(
    <AppStateProvider initialState={state} storage={undefined}>
      <PlanSection />
    </AppStateProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe('prerequisites', () => {
  it('asks for a vehicle first', () => {
    renderPlan({vehicles: []});

    expect(
      screen.getByText(/Add a vehicle on the Vehicles tab/),
    ).toBeInTheDocument();
  });

  it('asks for a schedule first', () => {
    renderPlan({job: {name: '', lines: []}});

    expect(
      screen.getByText(/Set some quantities on the Piling schedule tab/),
    ).toBeInTheDocument();
  });
});

describe('arranging', () => {
  it('starts with no plan', () => {
    renderPlan();

    expect(screen.getByText(/No plan yet/)).toBeInTheDocument();
  });

  it('is honest that this is the baseline and not the packer', () => {
    renderPlan();

    expect(
      screen.getByText(/This is the naive baseline, not the packer/),
    ).toBeInTheDocument();
  });

  it('builds a plan and reports the truck count', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    expect(
      screen.getByRole('heading', {name: /Loading plan — 1 truck/}),
    ).toBeInTheDocument();
    expect(screen.getByText(/Truck 1 of 1/)).toBeInTheDocument();
  });

  it('opens more trucks than one when the job needs them', async () => {
    const user = userEvent.setup();
    renderPlan({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 95}]},
    });

    await user.click(screen.getByRole('button', {name: /Arrange 95 piles/}));

    expect(
      screen.getByRole('heading', {name: /Loading plan — 3 trucks/}),
    ).toBeInTheDocument();
  });

  it('draws one exploded tier plan per tier, plus the 3D view', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    // 25 piles at 10 per tier — three tiers.
    expect(screen.getByTestId('tier-plan-0')).toBeInTheDocument();
    expect(screen.getByTestId('tier-plan-1')).toBeInTheDocument();
    expect(screen.getByTestId('tier-plan-2')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-plan-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('isometric-plan')).toBeInTheDocument();
  });

  it('draws every pile in the 3D view', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    expect(screen.getAllByTestId('iso-pile')).toHaveLength(25);
  });

  it('draws the helix plates in the 3D view, not just the shafts', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    // Two plates on every SP168 — where they sit is the whole story of the
    // load, so the 3D view has to show them.
    expect(screen.getAllByTestId('iso-helix')).toHaveLength(50);
  });

  it('reports the load against the truck limits', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    const truck = screen.getByTestId('consignment-C1');
    // 25 × 178 kg = 4,450 kg of a 28,200 kg payload.
    expect(within(truck).getByText('4.45 t')).toBeInTheDocument();
    expect(within(truck).getByText('16%')).toBeInTheDocument();
  });

  it('marks a legal plan as legal', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));

    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the plan again', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Arrange 25 piles/}));
    await user.click(screen.getByRole('button', {name: 'Clear plan'}));

    expect(screen.getByText(/No plan yet/)).toBeInTheDocument();
  });
});

describe('what will not fit', () => {
  it('says why a pile type could not be placed at all', async () => {
    const user = userEvent.setup();
    renderPlan({
      pileTypes: [LONG],
      job: {name: '', lines: [{pileTypeId: 'SP219-D14', quantity: 4}]},
    });

    await user.click(screen.getByRole('button', {name: /Arrange 4 piles/}));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not place 1 pile type');
    expect(alert).toHaveTextContent('too long for the deck');
  });
});

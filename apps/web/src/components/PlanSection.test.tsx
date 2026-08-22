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
    {offsetFromButt: 400, radius: 225, length: 110},
    {offsetFromButt: 1100, radius: 175, length: 110},
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
  maxFrontOverhang: 0,
  maxRearOverhang: 0,
  balanceTarget: null,
  towableBy: [],
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

  it('says what the baseline is for, before anything is packed', () => {
    renderPlan();

    expect(
      screen.getByText(/This is the naive baseline, not the packer/),
    ).toBeInTheDocument();
  });

  it('builds a plan and reports the truck count', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

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

    await user.click(screen.getByRole('button', {name: /Pack 95 piles/}));

    expect(
      screen.getByRole('heading', {name: /Loading plan — 2 trucks/}),
    ).toBeInTheDocument();
  });

  it('draws one exploded tier plan per tier, plus the 3D view', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    // 25 piles at 10 per tier — three tiers.
    expect(screen.getByTestId('tier-plan-0')).toBeInTheDocument();
    expect(screen.getByTestId('tier-plan-1')).toBeInTheDocument();
    expect(screen.getByTestId('tier-plan-2')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-plan-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('isometric-plan')).toBeInTheDocument();
  });

  it('leaves the 3D view unbuilt until the truck is scrolled to', async () => {
    // jsdom has no IntersectionObserver, so the app treats everything as
    // visible. Supplying one that never reports puts a truck off screen, which
    // is where most of them are when a long plan first opens.
    const observers: {disconnect: () => void}[] = [];
    class Never {
      observe() {}
      unobserve() {}
      disconnect() {}
      constructor() {
        observers.push(this);
      }
    }
    const original = globalThis.IntersectionObserver;
    (
      globalThis as unknown as {IntersectionObserver: unknown}
    ).IntersectionObserver = Never;
    try {
      const user = userEvent.setup();
      renderPlan();
      await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

      // The truck and its tier plans are there; only the expensive part waits.
      expect(screen.getByTestId('tier-plan-0')).toBeInTheDocument();
      expect(screen.queryByTestId('isometric-plan')).not.toBeInTheDocument();
      expect(observers.length).toBeGreaterThan(0);
    } finally {
      (
        globalThis as unknown as {IntersectionObserver: unknown}
      ).IntersectionObserver = original;
    }
  });

  it('says so plainly when the browser cannot do 3D', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    // jsdom has no WebGL, which is exactly the degraded case: the tier plans
    // still carry the load, so this must inform rather than break.
    expect(
      await screen.findByText(/cannot show the 3D view/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tier-plan-0')).toBeInTheDocument();
  });

  it('reports the load against the truck limits', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    const truck = screen.getByTestId('consignment-C1');
    // 25 × 178 kg of pile, plus 60 kg of bearers under each of the three
    // tiers, against a 28,200 kg payload. The bearers are shown because the
    // payload limit charges for them.
    expect(within(truck).getByText('4.63 t')).toBeInTheDocument();
    expect(within(truck).getByText('16%')).toBeInTheDocument();
  });

  it('marks a legal plan as legal', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the plan again', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));
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

    await user.click(screen.getByRole('button', {name: /Pack 4 piles/}));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not place 1 pile type');
    expect(alert).toHaveTextContent('too long for the deck');
  });
});

describe('the loading rules drive what the plan is judged against', () => {
  it('turns a legal plan red when a clearance is tightened past it', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));
    expect(
      within(screen.getByTestId('consignment-C1')).getByText(/^Legal/),
    ).toBeInTheDocument();

    /*
     * Helix-to-shaft, not helix-to-helix, and that is the point. The packer
     * staggered these lanes so no two plates share a station, which means the
     * helix-to-helix figure no longer binds on them at all — tightening it does
     * nothing. What holds this layout together is a plate clearing a shaft, so
     * that is the number that turns it red.
     */
    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Helix to shaft/));
    await user.type(screen.getByLabelText(/Helix to shaft/), '200');

    expect(
      within(screen.getByTestId('consignment-C1')).getByText(/problem/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/but need/).length).toBeGreaterThan(0);
  });

  it('survives an absurd longitudinal tolerance, because the shift is exact', async () => {
    // Sliding a whole load moves its centroid one-for-one, so the arranger can
    // put it *on* the balance point rather than near it. A 1 mm tolerance is
    // the cheapest way to prove that is really happening.
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));
    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Along the deck/));
    await user.type(screen.getByLabelText(/Along the deck/), '1');

    expect(screen.queryByText(/ahead of the/)).not.toBeInTheDocument();
    expect(screen.queryByText(/aft of the/)).not.toBeInTheDocument();
  });

  it('flags the lateral drift a part-filled baseline tier leaves behind', async () => {
    // The control fills lanes from the middle out and then stops, so an odd
    // number of piles on the top tier leaves a real residue. The packer does
    // not have this problem — it turns alternate tiers round to cancel it —
    // which is why this is measured on the baseline.
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Baseline instead/}));
    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Across the deck/));
    await user.type(screen.getByLabelText(/Across the deck/), '5');

    expect(screen.getAllByText(/centre of mass is/).length).toBeGreaterThan(0);
    expect(screen.getByText(/19 mm to the/)).toBeInTheDocument();
  });

  it('leaves the packer balanced where the baseline is not', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));
    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Across the deck/));
    await user.type(screen.getByLabelText(/Across the deck/), '5');

    expect(screen.queryByText(/centre of mass is/)).not.toBeInTheDocument();
  });

  it('reports how far off the balance point each truck sits', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    const truck = screen.getByTestId('consignment-C1');
    expect(within(truck).getByText('Balance')).toBeInTheDocument();
    expect(within(truck).getByText(/mm off centre/)).toBeInTheDocument();
  });
});

describe('the packer against the control', () => {
  it('reports how many trucks the bounding box would have needed', async () => {
    const user = userEvent.setup();
    renderPlan({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 95}]},
    });

    await user.click(screen.getByRole('button', {name: /Pack 95 piles/}));

    expect(screen.getByText(/1 truck saved/)).toBeInTheDocument();
    expect(screen.getByText(/this job fits on 2/)).toBeInTheDocument();
  });

  it('says so plainly when staggering wins nothing', async () => {
    const user = userEvent.setup();
    renderPlan({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 4}]},
    });

    await user.click(screen.getByRole('button', {name: /Pack 4 piles/}));

    expect(screen.getByText(/No saving on this job/)).toBeInTheDocument();
  });

  it('still offers the control, and drops the comparison when it is used', async () => {
    const user = userEvent.setup();
    renderPlan({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 95}]},
    });

    await user.click(screen.getByRole('button', {name: /Baseline instead/}));

    expect(
      screen.getByRole('heading', {name: /Loading plan — 3 trucks/}),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This is the naive baseline, not the packer/),
    ).toBeInTheDocument();
  });

  it('fits more piles per tier than the baseline does', async () => {
    const user = userEvent.setup();
    renderPlan({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 12}]},
    });

    await user.click(screen.getByRole('button', {name: /Pack 12 piles/}));
    // Six staggered lanes hold all twelve on the deck; the baseline needs two
    // tiers for the same job because it only fits five lanes.
    expect(screen.getByTestId('tier-plan-0')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-plan-1')).not.toBeInTheDocument();
  });

  it('turns flipping off from the loading rules', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.click(screen.getByLabelText(/Allow head-to-toe flipping/));
    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    expect(screen.getByText(/Truck 1 of 1/)).toBeInTheDocument();
  });
});

describe('the overhang each vehicle allows', () => {
  const TOLERANT: Vehicle = {...SEMI, maxRearOverhang: 1200};

  it('stays out of the way when nothing hangs out and nothing may', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    expect(screen.queryByText('Overhang')).not.toBeInTheDocument();
  });

  it('shows what the load uses against what the vehicle allows', async () => {
    const user = userEvent.setup();
    renderPlan({vehicles: [TOLERANT]});

    await user.click(screen.getByRole('button', {name: /Pack 25 piles/}));

    const truck = screen.getByTestId('consignment-C1');
    expect(within(truck).getByText('Overhang')).toBeInTheDocument();
    expect(within(truck).getByText(/of 1200 mm allowed/)).toBeInTheDocument();
  });

  it('says in the loading rules that overhang lives on the vehicle', async () => {
    const user = userEvent.setup();
    renderPlan({vehicles: [TOLERANT]});

    await user.click(screen.getByRole('button', {name: /Loading rules/}));

    expect(
      screen.getByText(/Set per vehicle on the Vehicles tab/),
    ).toBeInTheDocument();
    expect(screen.getByText('Rear allowed')).toBeInTheDocument();
    expect(screen.getByText('1200 mm')).toBeInTheDocument();
  });

  it('shows the zero default rather than hiding it, once the panel is open', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));

    expect(screen.getByText('Front allowed')).toBeInTheDocument();
    expect(screen.getAllByText('0 mm')).toHaveLength(2);
  });
});

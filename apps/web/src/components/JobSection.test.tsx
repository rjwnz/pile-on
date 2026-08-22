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
import {JobSection} from './JobSection';

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

const SP139: PileType = {
  id: 'SP139-S4',
  name: 'SP139 4.5 m single helix',
  length: 4500,
  shaftRadius: 70,
  mass: 96,
  helices: [{offsetFromButt: 350, radius: 175, length: 90}],
};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
};

function renderJob({
  pileTypes = [SP168, SP139],
  vehicles = [] as Vehicle[],
  job,
}: {
  pileTypes?: PileType[];
  vehicles?: Vehicle[];
  job?: Job;
} = {}) {
  const state: AppState = {
    ...emptyAppState('2026-08-22T00:00:00.000Z'),
    catalogue: {pileTypes, vehicles},
    ...(job ? {job} : {}),
  };
  return render(
    <AppStateProvider initialState={state} storage={undefined}>
      <JobSection />
    </AppStateProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe('empty catalogue', () => {
  it('sends the user to the pile types tab instead of showing a useless table', () => {
    renderJob({pileTypes: []});

    expect(
      screen.getByText(/No pile types in the catalogue yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('quantities', () => {
  it('lists every catalogue type with a quantity box, starting empty', () => {
    renderJob();

    expect(screen.getByLabelText('Quantity of SP168-D6')).toHaveValue('');
    expect(screen.getByLabelText('Quantity of SP139-S4')).toHaveValue('');
  });

  it('records a quantity and shows the line mass', async () => {
    const user = userEvent.setup();
    renderJob();

    await user.type(screen.getByLabelText('Quantity of SP168-D6'), '120');

    const row = screen.getByRole('row', {name: /SP168-D6/});
    expect(within(row).getByText('21,360 kg')).toBeInTheDocument();
  });

  it('totals piles and mass across lines', async () => {
    const user = userEvent.setup();
    renderJob();

    await user.type(screen.getByLabelText('Quantity of SP168-D6'), '10');
    await user.type(screen.getByLabelText('Quantity of SP139-S4'), '5');

    // 10 × 178 + 5 × 96 = 2,260
    expect(screen.getByText('15 piles')).toBeInTheDocument();
    expect(screen.getByText('2,260 kg')).toBeInTheDocument();
  });

  it('lets the box be cleared back to empty', async () => {
    const user = userEvent.setup();
    renderJob({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 12}]},
    });

    const box = screen.getByLabelText('Quantity of SP168-D6');
    await user.clear(box);

    expect(box).toHaveValue('');
    expect(screen.getByText('0 piles')).toBeInTheDocument();
  });

  it('refuses a fractional quantity without committing it', async () => {
    const user = userEvent.setup();
    renderJob();

    const box = screen.getByLabelText('Quantity of SP168-D6');
    await user.type(box, '2.5');

    expect(screen.getByText('whole piles only')).toBeInTheDocument();
    expect(box).toBeInvalid();
    // "2" committed as it was typed; the fractional value did not.
    expect(screen.getByText('2 piles')).toBeInTheDocument();
  });

  it('clears every quantity but keeps the job name', async () => {
    const user = userEvent.setup();
    renderJob({
      job: {name: 'Te Rapa', lines: [{pileTypeId: 'SP168-D6', quantity: 12}]},
    });

    await user.click(screen.getByRole('button', {name: 'Clear quantities'}));

    expect(screen.getByText('0 piles')).toBeInTheDocument();
    expect(screen.getByLabelText(/Job name/)).toHaveValue('Te Rapa');
  });
});

describe('job name', () => {
  it('records what goes on the quote', async () => {
    const user = userEvent.setup();
    renderJob();

    await user.type(screen.getByLabelText(/Job name/), '24-118 Te Rapa');

    expect(screen.getByLabelText(/Job name/)).toHaveValue('24-118 Te Rapa');
  });
});

describe('mass summary', () => {
  const job: Job = {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 20}]};

  it('asks for a vehicle before comparing against a deck', () => {
    renderJob({job});

    expect(
      screen.getByText(/Add a vehicle to see how this compares with a deck/),
    ).toBeInTheDocument();
  });

  it('says the job is deck-limited when it is light against the payload', () => {
    // 20 × 178 = 3,560 kg against 28,200 kg payload — 13%.
    renderJob({job, vehicles: [SEMI]});

    expect(
      screen.getByText(/13% of your largest payload, so this job is almost/),
    ).toBeInTheDocument();
  });

  it('just states the share when the job is heavy', () => {
    renderJob({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 100}]},
      vehicles: [SEMI],
    });

    expect(
      screen.getByText(/63% of your largest payload\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/almost/)).not.toBeInTheDocument();
  });

  it('is not shown at all for an empty schedule', () => {
    renderJob({vehicles: [SEMI]});

    expect(screen.queryByText(/largest payload/)).not.toBeInTheDocument();
  });
});

describe('CSV import', () => {
  it('imports a schedule', async () => {
    const user = userEvent.setup();
    renderJob();

    await user.click(screen.getByText(/Import schedule from CSV/));
    await user.type(
      screen.getByLabelText('schedule CSV text'),
      'pile_type_id,quantity\nSP168-D6,120\nSP139-S4,64',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(screen.getByText('184 piles')).toBeInTheDocument();
  });

  it('rejects a pile type that is not in the catalogue', async () => {
    const user = userEvent.setup();
    renderJob();

    await user.click(screen.getByText(/Import schedule from CSV/));
    await user.type(
      screen.getByLabelText('schedule CSV text'),
      'pile_type_id,quantity\nSP999-X,10',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'is not in the pile type catalogue',
    );
    expect(screen.queryByText(/piles,/)).not.toBeInTheDocument();
  });

  it('adds to existing quantities on merge, for a schedule arriving in parts', async () => {
    const user = userEvent.setup();
    renderJob({
      job: {name: '', lines: [{pileTypeId: 'SP168-D6', quantity: 40}]},
    });

    await user.click(screen.getByText(/Import schedule from CSV/));
    await user.type(
      screen.getByLabelText('schedule CSV text'),
      'pile_type_id,quantity\nSP168-D6,80',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(screen.getByText('120 piles')).toBeInTheDocument();
  });

  it('overwrites existing quantities on replace', async () => {
    const user = userEvent.setup();
    renderJob({
      job: {name: '', lines: [{pileTypeId: 'SP139-S4', quantity: 40}]},
    });

    await user.click(screen.getByText(/Import schedule from CSV/));
    await user.click(
      screen.getByRole('radio', {name: /Replace the whole list/}),
    );
    await user.type(
      screen.getByLabelText('schedule CSV text'),
      'pile_type_id,quantity\nSP168-D6,80',
    );
    await user.click(screen.getByRole('button', {name: 'Import pasted rows'}));

    expect(screen.getByText('80 piles')).toBeInTheDocument();
  });
});

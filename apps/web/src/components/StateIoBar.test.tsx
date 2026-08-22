import {describe, expect, it, jest, beforeEach} from '@jest/globals';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyAppState,
  serialiseAppState,
  type AppState,
  type PileType,
  type Vehicle,
} from '@pile-on/core';
import {AppStateProvider} from '../state/AppStateProvider';
import {StateIoBar} from './StateIoBar';
import {PileTypeSection} from './PileTypeSection';

const TYPE_A: PileType = {
  id: 'A',
  name: 'A',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [],
};

const VEHICLE: Vehicle = {
  id: 'V',
  name: 'V',
  kind: 'rigid',
  deckLength: 7200,
  deckWidth: 2450,
  deckHeight: 1200,
  tare: 10600,
  maxGross: 30000,
};

/** Current session: catalogue A + V, and a plan that depends on both. */
const CURRENT: AppState = {
  ...emptyAppState('2026-08-01T00:00:00.000Z'),
  catalogue: {pileTypes: [TYPE_A], vehicles: [VEHICLE]},
  plan: {
    piles: [{id: 'P-1', typeId: 'A'}],
    consignments: [{id: 'C1', vehicleId: 'V', phase: null}],
    placements: [{pileId: 'P-1', tier: 0, x: 100, y: 0, flipped: false}],
  },
};

/** Incoming file: a different catalogue, and its own plan. */
const INCOMING: AppState = {
  ...emptyAppState('2026-08-20T00:00:00.000Z'),
  catalogue: {pileTypes: [{...TYPE_A, id: 'B', name: 'B'}], vehicles: []},
  plan: {piles: [{id: 'Q-1', typeId: 'B'}], consignments: [], placements: []},
};

function renderBar(initialState: AppState = CURRENT) {
  return render(
    <AppStateProvider initialState={initialState} storage={undefined}>
      <StateIoBar />
      <PileTypeSection />
    </AppStateProvider>,
  );
}

async function upload(
  user: ReturnType<typeof userEvent.setup>,
  state: AppState,
) {
  const file = new File([serialiseAppState(state)], 'saved.json', {
    type: 'application/json',
  });
  await user.upload(screen.getByLabelText('Import state JSON file'), file);
}

beforeEach(() => localStorage.clear());

describe('export', () => {
  it('writes the whole session to a dated file', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:x') as never;
    URL.revokeObjectURL = jest.fn() as never;
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        created.push(this.download);
      });

    renderBar();
    await user.click(screen.getByRole('button', {name: 'Export JSON'}));

    expect(created[0]).toMatch(/^pile-on-\d{4}-\d{2}-\d{2}\.json$/);
    expect(screen.getByRole('status')).toHaveTextContent('Exported.');

    click.mockRestore();
    URL.createObjectURL = originalCreate;
  });
});

describe('import', () => {
  it('summarises the file and waits for a mode before changing anything', async () => {
    const user = userEvent.setup();
    renderBar();

    await upload(user, INCOMING);

    expect(
      await screen.findByText(
        /1 pile types, 0 vehicles, 1 piles across 0 consignments/,
      ),
    ).toBeInTheDocument();
    // Nothing applied yet — the current catalogue is still on screen.
    expect(
      screen.getByRole('heading', {name: /Pile types \(1\)/}),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', {name: /^A/})).toBeInTheDocument();
  });

  it('takes only the catalogue by default and keeps the current plan', async () => {
    const user = userEvent.setup();
    renderBar();

    await upload(user, INCOMING);
    await user.click(await screen.findByRole('button', {name: 'Import'}));

    expect(screen.getByRole('row', {name: /^B/})).toBeInTheDocument();
    expect(screen.queryByRole('row', {name: /^A/})).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Catalogue only');
  });

  it('warns that a catalogue-only import has orphaned the existing plan', async () => {
    const user = userEvent.setup();
    renderBar();

    await upload(user, INCOMING);
    await user.click(await screen.findByRole('button', {name: 'Import'}));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'the existing plan now references things that are gone',
    );
    expect(
      within(alert).getByText(/uses missing pile type "A"/),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(/uses missing vehicle "V"/),
    ).toBeInTheDocument();
  });

  it('takes catalogue and plan together when asked, with no orphan warning', async () => {
    const user = userEvent.setup();
    renderBar();

    await upload(user, INCOMING);
    await user.click(
      await screen.findByRole('radio', {
        name: /Catalogue and plan — replace everything/,
      }),
    );
    await user.click(screen.getByRole('button', {name: 'Import'}));

    expect(screen.getByRole('row', {name: /^B/})).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can be cancelled without touching the session', async () => {
    const user = userEvent.setup();
    renderBar();

    await upload(user, INCOMING);
    await user.click(await screen.findByRole('button', {name: 'Cancel'}));

    expect(screen.getByRole('row', {name: /^A/})).toBeInTheDocument();
    expect(
      screen.queryByText(/What should be imported/),
    ).not.toBeInTheDocument();
  });

  it('rejects a file that is not a Pile-On export', async () => {
    const user = userEvent.setup();
    renderBar();

    const file = new File(['{"hello":"world"}'], 'other.json', {
      type: 'application/json',
    });
    await user.upload(screen.getByLabelText('Import state JSON file'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'this may not be a Pile-On file',
    );
    expect(screen.getByRole('row', {name: /^A/})).toBeInTheDocument();
  });

  it('rejects a file from a newer build rather than mangling it', async () => {
    const user = userEvent.setup();
    renderBar();

    const file = new File(
      [JSON.stringify({...INCOMING, formatVersion: 99})],
      'future.json',
      {type: 'application/json'},
    );
    await user.upload(screen.getByLabelText('Import state JSON file'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Update Pile-On.',
    );
  });

  it('round-trips an exported session back in', async () => {
    const user = userEvent.setup();
    renderBar(emptyAppState(''));

    await upload(user, CURRENT);
    await user.click(
      await screen.findByRole('radio', {
        name: /Catalogue and plan — replace everything/,
      }),
    );
    await user.click(screen.getByRole('button', {name: 'Import'}));

    expect(screen.getByRole('row', {name: /^A/})).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

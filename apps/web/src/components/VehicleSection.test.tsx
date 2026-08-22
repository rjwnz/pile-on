import {describe, expect, it, beforeEach} from '@jest/globals';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {emptyAppState, type AppState, type Vehicle} from '@pile-on/core';
import {AppStateProvider} from '../state/AppStateProvider';
import {VehicleSection} from './VehicleSection';

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Tractor + 4-axle semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
  maxFrontOverhang: 0,
  maxRearOverhang: 0,
  balanceTarget: null,
};

function renderWith(vehicles: Vehicle[] = []) {
  const state: AppState = {
    ...emptyAppState('2026-08-22T00:00:00.000Z'),
    catalogue: {pileTypes: [], vehicles},
  };
  return render(
    <AppStateProvider initialState={state} storage={undefined}>
      <VehicleSection />
    </AppStateProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe('VehicleSection', () => {
  it('lists a vehicle with its deck and derived payload', () => {
    renderWith([SEMI]);

    const row = screen.getByRole('row', {name: /SEMI-45/});
    expect(within(row).getByText('Semi-trailer')).toBeInTheDocument();
    expect(within(row).getByText('12.50 × 2.45 m')).toBeInTheDocument();
    expect(within(row).getByText('15,800 kg')).toBeInTheDocument();
    expect(within(row).getByText('28,200 kg')).toBeInTheDocument();
  });

  it('does not flag a permit at exactly the general-access gross mass', () => {
    renderWith([SEMI]);

    expect(screen.queryByText(/HPMV permit/)).not.toBeInTheDocument();
  });

  it('flags an HPMV permit above the general-access gross mass', () => {
    renderWith([{...SEMI, maxGross: 50000}]);

    expect(
      screen.getByText(/HPMV permit — over 44,000 kg gross/),
    ).toBeInTheDocument();
  });

  it('flags a deck that breaks the height limit before anything is loaded', () => {
    renderWith([{...SEMI, deckHeight: 4400}]);

    expect(
      screen.getByText(/over the 4.3 m limit before any load/),
    ).toBeInTheDocument();
  });

  it('adds a vehicle through the form', async () => {
    const user = userEvent.setup();
    renderWith();

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));
    await user.type(screen.getByLabelText('Id'), 'RIGID-8');
    await user.type(screen.getByLabelText(/^Deck length/), '7200');
    await user.type(screen.getByLabelText(/^Deck height/), '1200');
    await user.type(screen.getByLabelText(/^Tare/), '10600');
    await user.type(screen.getByLabelText(/^Max gross/), '30000');

    expect(screen.getByText(/Payload capacity/)).toHaveTextContent('19,400 kg');

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));

    expect(
      screen.getByRole('heading', {name: /Vehicles \(1\)/}),
    ).toBeInTheDocument();
  });

  it('refuses a gross mass that leaves no payload', async () => {
    const user = userEvent.setup();
    renderWith();

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));
    await user.type(screen.getByLabelText('Id'), 'BAD');
    await user.type(screen.getByLabelText(/^Deck length/), '7200');
    await user.type(screen.getByLabelText(/^Deck height/), '1200');
    await user.type(screen.getByLabelText(/^Tare/), '30000');
    await user.type(screen.getByLabelText(/^Max gross/), '20000');
    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'must exceed tare (30000), leaving no payload',
    );
  });

  it('edits an existing vehicle in place', async () => {
    const user = userEvent.setup();
    renderWith([SEMI]);

    await user.click(screen.getByRole('button', {name: 'Edit'}));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Renamed rig');
    await user.click(screen.getByRole('button', {name: 'Save changes'}));

    expect(screen.getByText('Renamed rig')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: /Vehicles \(1\)/}),
    ).toBeInTheDocument();
  });

  it('deletes a vehicle', async () => {
    const user = userEvent.setup();
    renderWith([SEMI]);

    await user.click(screen.getByRole('button', {name: 'Delete'}));

    expect(
      screen.getByRole('heading', {name: /Vehicles \(0\)/}),
    ).toBeInTheDocument();
  });
});

describe('the loading fields', () => {
  it('round-trips overhang allowances and a stated balance point', async () => {
    const user = userEvent.setup();
    renderWith([SEMI]);

    await user.click(screen.getByRole('button', {name: /Add vehicle/}));
    await user.type(screen.getByLabelText(/^Id/), 'RIGID-8');
    await user.type(screen.getByLabelText(/Deck length/), '7200');
    await user.type(screen.getByLabelText(/Deck width/), '2450');
    await user.type(screen.getByLabelText(/Deck height above road/), '1200');
    await user.type(screen.getByLabelText(/Tare/), '10600');
    await user.type(screen.getByLabelText(/Max gross/), '30000');
    await user.clear(screen.getByLabelText(/Rear overhang allowed/));
    await user.type(screen.getByLabelText(/Rear overhang allowed/), '900');
    await user.type(
      screen.getByLabelText(/Balance point from headboard/),
      '3000',
    );
    await user.click(screen.getByRole('button', {name: /^Add vehicle$/}));

    const row = await screen.findByRole('row', {name: /RIGID-8/});
    expect(row).toBeInTheDocument();

    await user.click(within(row).getByRole('button', {name: /Edit/}));
    expect(screen.getByLabelText(/Rear overhang allowed/)).toHaveValue(900);
    expect(screen.getByLabelText(/Balance point from headboard/)).toHaveValue(
      3000,
    );
  });

  it('shows an unstated balance point as blank, not as mid-deck', () => {
    render(
      <AppStateProvider
        initialState={{
          ...emptyAppState('2026-08-22T00:00:00.000Z'),
          catalogue: {pileTypes: [], vehicles: [SEMI]},
        }}
        storage={undefined}
      >
        <VehicleSection />
      </AppStateProvider>,
    );

    expect(
      screen.queryByLabelText(/Balance point from headboard/),
    ).not.toBeInTheDocument();
  });
});

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
  axles: [
    {xFromFront: 0, tyreClass: 'SL', setId: 'steer', steering: true},
    {xFromFront: 3550, tyreClass: 'T', setId: 'drive', steering: false},
    {xFromFront: 4870, tyreClass: 'T', setId: 'drive', steering: false},
    {xFromFront: 10100, tyreClass: 'T', setId: 'tri', steering: false},
  ],
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
  it('lists a vehicle with its derived payload and axle span', () => {
    renderWith([SEMI]);

    const row = screen.getByRole('row', {name: /SEMI-45/});
    expect(within(row).getByText('Semi-trailer')).toBeInTheDocument();
    expect(within(row).getByText('12.50 × 2.45 m')).toBeInTheDocument();
    expect(within(row).getByText('28,200 kg')).toBeInTheDocument();
    expect(within(row).getByText('10.10 m')).toBeInTheDocument();
    expect(
      within(row).getByText('steer, drive, tri (4 axles)'),
    ).toBeInTheDocument();
  });

  it('warns when the bridge formula caps the vehicle below its rated gross', () => {
    // 10.1 m span with 4 axles caps at 34,000 kg, below the stated 44,000.
    renderWith([SEMI]);

    expect(screen.getByText('bridge limit 34,000 kg')).toBeInTheDocument();
  });

  it('does not warn when the rated gross is the binding figure', () => {
    renderWith([{...SEMI, maxGross: 30000}]);

    expect(screen.queryByText(/bridge limit/)).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/Axle 2 position/), '4900');

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
    await user.type(screen.getByLabelText(/Axle 2 position/), '4900');
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

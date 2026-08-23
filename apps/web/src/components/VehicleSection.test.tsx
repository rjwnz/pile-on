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
  payloadCapacity: 28200,
  towableBy: [],
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
  it('lists a vehicle with its deck and load capacity', () => {
    renderWith([SEMI]);

    const row = screen.getByRole('row', {name: /SEMI-45/});
    expect(within(row).getByText('Semi-trailer')).toBeInTheDocument();
    expect(within(row).getByText('12.50 × 2.45 m')).toBeInTheDocument();
    expect(within(row).getByText('28,200 kg')).toBeInTheDocument();
  });

  it('adds a vehicle through the form', async () => {
    const user = userEvent.setup();
    renderWith();

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));
    await user.type(screen.getByLabelText('Id'), 'RIGID-8');
    await user.type(screen.getByLabelText(/^Deck length/), '7200');
    await user.type(screen.getByLabelText(/^Load capacity/), '19400');

    expect(screen.getByText(/covers everything on the deck/)).toHaveTextContent(
      '19,400 kg',
    );

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));

    expect(
      screen.getByRole('heading', {name: /Vehicles \(1\)/}),
    ).toBeInTheDocument();
  });

  it('refuses a load capacity that is not a positive number', async () => {
    const user = userEvent.setup();
    renderWith();

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));
    await user.type(screen.getByLabelText('Id'), 'BAD');
    await user.type(screen.getByLabelText(/^Deck length/), '7200');
    await user.type(screen.getByLabelText(/^Load capacity/), '0');
    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));

    expect(screen.getByRole('alert')).toHaveTextContent(/payload_capacity/);
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
  it('does not ask for a balance point — the load is always mid-deck', async () => {
    const user = userEvent.setup();
    renderWith();

    await user.click(screen.getByRole('button', {name: 'Add vehicle'}));

    expect(
      screen.queryByLabelText(/Balance point from headboard/),
    ).not.toBeInTheDocument();
  });
});

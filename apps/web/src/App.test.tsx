import {describe, expect, it, beforeEach} from '@jest/globals';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App';

beforeEach(() => {
  localStorage.clear();
});

describe('App', () => {
  it('starts on the pile types tab with an empty catalogue', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {name: 'Pile On', level: 1}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: /Pile types \(0\)/}),
    ).toBeInTheDocument();
    expect(screen.getByText(/No pile types yet/)).toBeInTheDocument();
  });

  it('switches to the vehicle catalogue', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', {name: 'Vehicles'}));

    expect(
      screen.getByRole('heading', {name: /Vehicles \(0\)/}),
    ).toBeInTheDocument();
    expect(screen.getByText(/No vehicles yet/)).toBeInTheDocument();
  });

  it('names the ruleset every quote will be stamped with', () => {
    render(<App />);

    expect(screen.getByText('nz-vdam-2016')).toBeInTheDocument();
  });

  it('adds a pile type by hand and lists it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', {name: 'Add pile type'}));
    await user.type(screen.getByLabelText('Id'), 'SP168-D6');
    await user.type(screen.getByLabelText('Name'), 'SP168 twin helix');
    await user.type(screen.getByLabelText(/^Length/), '6000');
    await user.type(screen.getByLabelText(/^Shaft diameter/), '168');
    await user.type(screen.getByLabelText(/^Mass/), '178');
    await user.type(screen.getByLabelText(/Plate 1 offset/), '400');
    await user.type(screen.getByLabelText(/Plate 1 diameter/), '450');
    await user.type(screen.getByLabelText(/Plate 1 length/), '110');
    await user.click(screen.getByRole('button', {name: 'Add pile type'}));

    const row = screen.getByRole('row', {name: /SP168-D6/});
    expect(within(row).getByText('SP168 twin helix')).toBeInTheDocument();
    expect(within(row).getByText('6.00 m')).toBeInTheDocument();
    expect(within(row).getByText('450 mm')).toBeInTheDocument();
    expect(within(row).getByText(/interleaves/)).toBeInTheDocument();
  });

  it('refuses an invalid pile type and says why', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', {name: 'Add pile type'}));
    await user.type(screen.getByLabelText(/^Length/), '6000');
    await user.click(screen.getByRole('button', {name: 'Add pile type'}));

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('id')).toBeInTheDocument();
    expect(within(alert).getByText('shaft_diameter')).toBeInTheDocument();
    expect(within(alert).getByText('mass')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: /Pile types \(0\)/}),
    ).toBeInTheDocument();
  });

  it('keeps the catalogue across a remount, via local storage', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    await user.click(screen.getByRole('button', {name: 'Add pile type'}));
    await user.type(screen.getByLabelText('Id'), 'KEEP-ME');
    await user.type(screen.getByLabelText(/^Length/), '6000');
    await user.type(screen.getByLabelText(/^Shaft diameter/), '168');
    await user.type(screen.getByLabelText(/^Mass/), '178');
    await user.click(screen.getByRole('button', {name: 'Add pile type'}));

    first.unmount();
    render(<App />);

    expect(screen.getByRole('row', {name: /KEEP-ME/})).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: /Pile types \(1\)/}),
    ).toBeInTheDocument();
  });
});

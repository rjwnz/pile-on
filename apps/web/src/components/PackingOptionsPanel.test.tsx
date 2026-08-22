import {useState} from 'react';
import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DEFAULT_PACKING_OPTIONS, type PackingOptions} from '@pile-on/core';
import {PackingOptionsPanel} from './PackingOptionsPanel';

/**
 * The panel is controlled, so a bare mock would leave every field showing its
 * original value while the test typed into it. Holding the state here is also
 * how the app uses it, so this exercises the round trip rather than one half.
 */
function renderPanel(initial: PackingOptions = DEFAULT_PACKING_OPTIONS) {
  const seen: PackingOptions[] = [];

  function Harness() {
    const [options, setOptions] = useState(initial);
    return (
      <PackingOptionsPanel
        options={options}
        onChange={next => {
          seen.push(next);
          setOptions(next);
        }}
      />
    );
  }

  render(<Harness />);
  return {
    latest: () => seen[seen.length - 1],
    all: () => seen,
  };
}

describe('PackingOptionsPanel', () => {
  it('summarises the two numbers that decide the most, while collapsed', () => {
    renderPanel();

    expect(
      screen.getByRole('button', {name: /25 mm helix-to-shaft/}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: /200 mm balance/}),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Shaft to shaft/)).not.toBeInTheDocument();
  });

  it('opens to show the individual clearances', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));

    expect(screen.getByLabelText(/Shaft to shaft/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Helix to shaft/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Helix to helix/)).toBeInTheDocument();
  });

  it('changes one clearance without disturbing the others', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Helix to shaft/));
    await user.type(screen.getByLabelText(/Helix to shaft/), '40');

    expect(panel.latest()).toEqual({
      ...DEFAULT_PACKING_OPTIONS,
      clearances: {...DEFAULT_PACKING_OPTIONS.clearances, helixToShaft: 40},
    });
  });

  it('changes a balance tolerance', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Across the deck/));
    await user.type(screen.getByLabelText(/Across the deck/), '90');

    expect(panel.latest()).toEqual({
      ...DEFAULT_PACKING_OPTIONS,
      balance: {...DEFAULT_PACKING_OPTIONS.balance, lateral: 90},
    });
  });

  it('changes the bearer mass and the spacing figures', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Bearers and lashings/));
    await user.type(screen.getByLabelText(/Bearers and lashings/), '85');
    expect(panel.latest()!.ancillaryMassPerTier).toBe(85);

    await user.clear(screen.getByLabelText(/Side margin/));
    await user.type(screen.getByLabelText(/Side margin/), '75');
    expect(panel.latest()!.sideMargin).toBe(75);

    await user.clear(screen.getByLabelText(/Max tiers/));
    await user.type(screen.getByLabelText(/Max tiers/), '3');
    expect(panel.latest()!.maxTiers).toBe(3);

    await user.clear(screen.getByLabelText(/Dunnage thickness/));
    await user.type(screen.getByLabelText(/Dunnage thickness/), '75');
    expect(panel.latest()!.dunnageThickness).toBe(75);

    await user.clear(screen.getByLabelText(/Headboard gap/));
    await user.type(screen.getByLabelText(/Headboard gap/), '150');
    expect(panel.latest()!.headboardGap).toBe(150);

    await user.clear(screen.getByLabelText(/End gap/));
    await user.type(screen.getByLabelText(/End gap/), '120');
    expect(panel.latest()!.endGap).toBe(120);
  });

  it('changes the remaining clearances too', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.clear(screen.getByLabelText(/Shaft to shaft/));
    await user.type(screen.getByLabelText(/Shaft to shaft/), '30');
    expect(panel.latest()!.clearances.shaftToShaft).toBe(30);

    await user.clear(screen.getByLabelText(/Helix to helix/));
    await user.type(screen.getByLabelText(/Helix to helix/), '60');
    expect(panel.latest()!.clearances.helixToHelix).toBe(60);

    await user.clear(screen.getByLabelText(/Along the deck/));
    await user.type(screen.getByLabelText(/Along the deck/), '150');
    expect(panel.latest()!.balance.longitudinal).toBe(150);
  });

  it('never lets a negative figure through', async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    await user.click(screen.getByRole('button', {name: /Loading rules/}));
    await user.type(screen.getByLabelText(/End gap/), '-5');

    for (const seen of panel.all()) {
      expect(seen.endGap).toBeGreaterThanOrEqual(0);
    }
  });

  it('offers a reset only once something has been edited', async () => {
    const user = userEvent.setup();
    const panel = renderPanel({
      ...DEFAULT_PACKING_OPTIONS,
      balance: {longitudinal: 900, lateral: 900},
    });

    expect(screen.getByRole('button', {name: /edited/})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Reset to defaults/}));

    expect(panel.latest()).toEqual(DEFAULT_PACKING_OPTIONS);
    expect(
      screen.queryByRole('button', {name: /Reset to defaults/}),
    ).not.toBeInTheDocument();
  });
});

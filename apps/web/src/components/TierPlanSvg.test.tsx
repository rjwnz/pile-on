import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react';
import type {PlacedPile} from '@pile-on/core';
import {TierPlanSvg} from './TierPlanSvg';

const PILE: PlacedPile = {
  type: {
    id: 't',
    name: 't',
    length: 6000,
    shaftRadius: 80,
    mass: 300,
    helices: [{offsetFromButt: 500, radius: 200, thickness: 100}],
  },
  placement: {pileId: 'p1', tier: 0, x: 0, y: 0, flipped: false},
};

function renderPlan(piles: readonly PlacedPile[] = [PILE]) {
  return render(
    <TierPlanSvg
      title="Tier 1"
      deckLength={12600}
      deckWidth={2550}
      piles={piles}
    />,
  );
}

describe('TierPlanSvg', () => {
  it('labels the drawing for screen readers and for the printed plan', () => {
    renderPlan();

    expect(screen.getByRole('img', {name: 'Tier 1'})).toBeInTheDocument();
  });

  it('uses the deck itself as the viewBox so the drawing stays to scale', () => {
    renderPlan();

    expect(screen.getByRole('img')).toHaveAttribute(
      'viewBox',
      '0 0 12600 2550',
    );
  });

  it('draws a shaft segment and a helix segment for a single-helix pile', () => {
    renderPlan();

    expect(screen.getAllByTestId('segment-shaft')).toHaveLength(1);
    expect(screen.getAllByTestId('segment-helix')).toHaveLength(1);
  });

  it('places a centreline pile in the middle of the deck', () => {
    renderPlan();

    const shaft = screen.getAllByTestId('segment-shaft')[0];
    // Deck half-width 1275, shaft radius 80.
    expect(shaft).toHaveAttribute('y', '1195');
    expect(shaft).toHaveAttribute('height', '160');
  });

  it('renders an empty deck without complaint', () => {
    renderPlan([]);

    expect(screen.queryByTestId('segment-shaft')).not.toBeInTheDocument();
  });
});

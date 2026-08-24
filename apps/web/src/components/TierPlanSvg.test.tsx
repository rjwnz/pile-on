import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react';
import {
  DEFAULT_LOADING_OPTIONS,
  packManifest,
  type Catalogue,
  type Placement,
  type Vehicle,
} from '@pile-on/core';
import {TierPlanSvg} from './TierPlanSvg';
import {colourForPileType} from '../render/palette';

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  payloadCapacity: 28200,
  towableBy: [],
};

const CATALOGUE: Catalogue = {
  pileTypes: [
    {
      id: 'SP168-D6',
      name: 'SP168',
      length: 6000,
      shaftRadius: 84,
      mass: 178,
      helices: [{offsetFromButt: 400, radius: 225, length: 110}],
    },
  ],
  vehicles: [SEMI],
};

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'PL-1',
    consignmentId: 'C1',
    deck: 'truck',
    pileTypeId: 'SP168-D6',
    tier: 0,
    pack: 0,
    x: 100,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

function renderTier(placements: Placement[] = [place()]) {
  return render(
    <TierPlanSvg
      vehicle={SEMI}
      catalogue={CATALOGUE}
      placements={placements}
      tier={0}
      title="Tier 1"
    />,
  );
}

describe('TierPlanSvg', () => {
  it('labels the drawing with its tier and pile count', () => {
    renderTier([place({id: 'a'}), place({id: 'b', y: 500})]);

    expect(
      screen.getByRole('img', {name: 'Tier 1, 2 piles'}),
    ).toBeInTheDocument();
  });

  it('uses deck millimetres as the viewBox so the drawing stays to scale', () => {
    renderTier();

    // Deck plus a label band on every side.
    expect(screen.getByRole('img')).toHaveAttribute(
      'viewBox',
      '-420 -420 13340 3290',
    );
  });

  it('draws a shaft segment and a helix segment per pile', () => {
    renderTier();

    expect(screen.getAllByTestId('segment-shaft')).toHaveLength(1);
    expect(screen.getAllByTestId('segment-helix')).toHaveLength(1);
  });

  it('places a centreline pile in the middle of the deck', () => {
    renderTier();

    // Half-width 1225 less the 84 mm shaft radius.
    const shaft = screen.getAllByTestId('segment-shaft')[0];
    expect(shaft).toHaveAttribute('y', '1141');
    expect(shaft).toHaveAttribute('height', '168');
  });

  it('puts the helix where the plate actually is, not at the pile end', () => {
    renderTier();

    // 100 mm start + 400 mm offset, less half the 110 mm plate.
    const helix = screen.getAllByTestId('segment-helix')[0];
    expect(helix).toHaveAttribute('x', '445');
    expect(helix).toHaveAttribute('width', '110');
  });

  it('colours a pile by its type, plate darker than shaft', () => {
    renderTier();
    const colour = colourForPileType('SP168-D6');

    expect(screen.getAllByTestId('segment-shaft')[0]).toHaveAttribute(
      'fill',
      colour.shaft,
    );
    expect(screen.getAllByTestId('segment-helix')[0]).toHaveAttribute(
      'fill',
      colour.helix,
    );
  });

  it('outlines each pack of the tier with its banded width', () => {
    renderTier([
      place({id: 'a', y: -712.5, pack: 0}),
      place({id: 'b', y: -237.5, pack: 0}),
      place({id: 'c', y: 400, pack: 1}),
    ]);

    expect(screen.getByTestId('pack-outline-0')).toBeInTheDocument();
    expect(screen.getByTestId('pack-outline-1')).toBeInTheDocument();
    // Two lanes at 475 mm pitch plus a 225 mm plate each side.
    expect(screen.getByText('0.93 m pack')).toBeInTheDocument();
    expect(screen.getByText('0.45 m pack')).toBeInTheDocument();
  });

  it('labels packs by their manifest id, with the details on hover', () => {
    const placements = [
      place({id: 'a', y: -712.5, pack: 0}),
      place({id: 'b', y: -237.5, pack: 0}),
      place({id: 'c', y: 400, pack: 1}),
    ];
    render(
      <TierPlanSvg
        vehicle={SEMI}
        catalogue={CATALOGUE}
        placements={placements}
        tier={0}
        title="Tier 1"
        packs={packManifest(placements, CATALOGUE, DEFAULT_LOADING_OPTIONS)}
      />,
    );

    expect(screen.getByText('P1 · 0.93 m')).toBeInTheDocument();
    expect(screen.getByText('P2 · 0.45 m')).toBeInTheDocument();
    expect(
      screen.getByText(/P1 — 2 × SP168-D6 starter \(6\.00 m\)/),
    ).toBeInTheDocument();
  });

  it('skips a placement whose pile type is missing rather than crashing', () => {
    renderTier([place({pileTypeId: 'GHOST'})]);

    expect(screen.queryByTestId('segment-shaft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pack-outline-0')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders an empty tier without complaint', () => {
    renderTier([]);

    expect(
      screen.getByRole('img', {name: 'Tier 1, 0 piles'}),
    ).toBeInTheDocument();
  });
});

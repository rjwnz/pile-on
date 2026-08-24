import {describe, expect, it} from '@jest/globals';
import {fireEvent, render, screen} from '@testing-library/react';
import {
  DEFAULT_LOADING_OPTIONS,
  packManifest,
  type Catalogue,
  type Placement,
} from '@pile-on/core';
import {TierPlanSvg} from './TierPlanSvg';
import {colourForPileType} from '../render/palette';
import {SEMI, SP168} from '@pile-on/core/testFixtures';

const CATALOGUE: Catalogue = {pileTypes: [SP168], vehicles: [SEMI]};

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

/** The drawing as the app builds it: with the deck's pack manifest. */
function renderManifested(placements: Placement[]) {
  return render(
    <TierPlanSvg
      vehicle={SEMI}
      catalogue={CATALOGUE}
      placements={placements}
      tier={0}
      title="Tier 1"
      packs={packManifest(placements, CATALOGUE, DEFAULT_LOADING_OPTIONS)}
    />,
  );
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

  it('draws one rect per segment of a pile — shaft, then every plate', () => {
    renderTier();

    // SP168 is twin helix, so one shaft band and two plate bands.
    expect(screen.getAllByTestId('segment-shaft')).toHaveLength(1);
    expect(screen.getAllByTestId('segment-helix')).toHaveLength(2);
  });

  it('places a centreline pile in the middle of the deck', () => {
    renderTier();

    // Half-width 1225 less the 84 mm shaft radius.
    const shaft = screen.getAllByTestId('segment-shaft')[0]!;
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

  it('labels packs by their manifest id', () => {
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
  });

  it('names the pack and lists its lengths when a pipe is pointed at', () => {
    const placements = [
      place({id: 'a', y: -712.5, pack: 0}),
      place({id: 'b', y: -237.5, pack: 0}),
      place({id: 'c', y: 400, pack: 1}),
    ];
    renderManifested(placements);

    expect(screen.queryByTestId('plan-hover-card')).not.toBeInTheDocument();

    fireEvent.mouseMove(screen.getAllByTestId('segment-shaft')[0]!);
    const card = screen.getByTestId('plan-hover-card');

    expect(card).toHaveTextContent('P1');
    expect(card).toHaveTextContent('2 × SP168-D6 starter (6.00 m)');
    expect(card).toHaveTextContent('on 2 × 200 mm');
  });

  it('follows the pointer from one pack to the next without a stale card', () => {
    const placements = [
      place({id: 'a', y: -712.5, pack: 0}),
      place({id: 'b', y: -237.5, pack: 0}),
      place({id: 'c', y: 400, pack: 1}),
    ];
    renderManifested(placements);
    const shafts = screen.getAllByTestId('segment-shaft');

    fireEvent.mouseMove(shafts[0]!);
    expect(screen.getByTestId('plan-hover-card')).toHaveTextContent(
      '2 × SP168-D6 starter (6.00 m)',
    );

    fireEvent.mouseMove(shafts[2]!);
    expect(screen.getByTestId('plan-hover-card')).toHaveTextContent(
      '1 × SP168-D6 starter (6.00 m)',
    );
  });

  it('drops the card over bare deck, and again when the pointer leaves', () => {
    renderManifested([place()]);
    const shaft = screen.getAllByTestId('segment-shaft')[0]!;

    fireEvent.mouseMove(shaft);
    expect(screen.getByTestId('plan-hover-card')).toBeInTheDocument();

    // Bare deck: the pointer is on the drawing but on nothing that is loaded.
    fireEvent.mouseMove(screen.getByRole('img'));
    expect(screen.queryByTestId('plan-hover-card')).not.toBeInTheDocument();

    fireEvent.mouseMove(shaft);
    fireEvent.mouseLeave(screen.getByRole('img'));
    expect(screen.queryByTestId('plan-hover-card')).not.toBeInTheDocument();
  });

  it('names the timber and what rides on it when a bearer is pointed at', () => {
    renderManifested([place()]);

    fireEvent.mouseMove(screen.getAllByTestId('bearer')[0]!);
    const card = screen.getByTestId('plan-hover-card');

    expect(card).toHaveTextContent('P1 bearer 1 of 2');
    expect(card).toHaveTextContent('200 mm timber');
    expect(card).toHaveTextContent('345 mm along the deck');
  });

  it('draws the timbers under every pack of the tier', () => {
    const placements = [
      place({id: 'a', x: 100, pack: 0}),
      place({id: 'b', x: 6300, pack: 1}),
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
    const timbers = screen.getAllByTestId('bearer');

    // Two under each pack, and each one 100 mm of timber along the deck.
    expect(timbers).toHaveLength(4);
    for (const timber of timbers) {
      expect(timber).toHaveAttribute('width', '100');
    }
    // P1's front timber wants 300 mm in from the leading end, at 400, but the
    // plate covers 445–555: it backs off to 345 so it ends where the plate
    // starts, which is the shorter walk.
    expect(timbers[0]).toHaveAttribute('x', '345');
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

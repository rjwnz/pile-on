import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react';
import {
  DEFAULT_LOADING_OPTIONS,
  packManifest,
  type Catalogue,
  type Placement,
} from '@pile-on/core';
import {PackManifestTable} from './PackManifestTable';

const STARTER = {
  id: 'SS200-starter',
  name: 'SS200 starter',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [{offsetFromButt: 400, radius: 225, length: 110}],
};

const CATALOGUE: Catalogue = {pileTypes: [STARTER], vehicles: []};

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'PL-1',
    consignmentId: 'C1',
    deck: 'truck',
    pileTypeId: 'SS200-starter',
    tier: 0,
    pack: 0,
    x: 100,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

function manifestOf(placements: Placement[]) {
  return packManifest(placements, CATALOGUE, DEFAULT_LOADING_OPTIONS);
}

describe('PackManifestTable', () => {
  it('lists each pack with its contents, dimensions, mass and bearers', () => {
    render(
      <PackManifestTable
        manifest={manifestOf([
          place({id: 'a', y: -200}),
          place({id: 'b', y: 200}),
          place({id: 'c', x: 6300, pack: 1}),
        ])}
      />,
    );

    expect(screen.getByTestId('pack-manifest')).toBeInTheDocument();
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('2 × SS200 starter (6.00 m)')).toBeInTheDocument();
    expect(screen.getByText('356 kg')).toBeInTheDocument();
    // Both packs ride tier 1 on the 200 mm bearers its plates demand.
    expect(screen.getAllByText('200 mm')).toHaveLength(2);
  });

  it('renders nothing at all for an empty deck', () => {
    render(<PackManifestTable manifest={manifestOf([])} />);

    expect(screen.queryByTestId('pack-manifest')).not.toBeInTheDocument();
  });
});

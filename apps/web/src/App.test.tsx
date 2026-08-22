import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react';
import {App} from './App';

describe('App', () => {
  it('renders the product name', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {name: 'Pile-On', level: 1}),
    ).toBeInTheDocument();
  });

  it('draws a tier plan for both the aligned and staggered cases', () => {
    render(<App />);

    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('shows that staggering closes the pair up', () => {
    render(<App />);

    const [alignedPlan, staggeredPlan] = screen.getAllByRole('img');
    const alignedMm = Number(
      /(\d+) mm apart/.exec(alignedPlan!.getAttribute('aria-label') ?? '')?.[1],
    );
    const staggeredMm = Number(
      /(\d+) mm apart/.exec(
        staggeredPlan!.getAttribute('aria-label') ?? '',
      )?.[1],
    );

    expect(staggeredMm).toBeLessThan(alignedMm);
  });
});

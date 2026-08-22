import {afterEach, describe, expect, it} from '@jest/globals';
import {act, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {useInView} from './useInView';

/**
 * A stand-in for the real observer, so a test can decide when the element
 * arrives. jsdom lays nothing out, so the genuine article would never fire.
 */
class FakeObserver {
  static live: FakeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.live.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  /** Report the observed elements as having come into view. */
  arrive() {
    this.callback(
      this.observed.map(
        target => ({target, isIntersecting: true}) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} data-testid="probe">
      {seen ? 'visible' : 'waiting'}
    </div>
  );
}

const original = globalThis.IntersectionObserver;

function useFakeObserver() {
  FakeObserver.live = [];
  (
    globalThis as unknown as {IntersectionObserver: unknown}
  ).IntersectionObserver = FakeObserver;
}

afterEach(() => {
  (
    globalThis as unknown as {IntersectionObserver: unknown}
  ).IntersectionObserver = original;
});

describe('holding work back until it can be seen', () => {
  it('waits, then reports the element as seen once it arrives', () => {
    useFakeObserver();
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('waiting');

    act(() => FakeObserver.live[0]!.arrive());

    expect(screen.getByTestId('probe')).toHaveTextContent('visible');
  });

  it('stays seen after the element leaves again', () => {
    useFakeObserver();
    render(<Probe />);
    act(() => FakeObserver.live[0]!.arrive());

    // Nothing can un-see it: rebuilding on scroll-back is the cost this avoids.
    expect(screen.getByTestId('probe')).toHaveTextContent('visible');
    expect(FakeObserver.live[0]!.disconnected).toBe(true);
  });

  it('watches a little beyond the viewport, so the work starts early', () => {
    useFakeObserver();
    render(<Probe />);

    expect(FakeObserver.live[0]!.options?.rootMargin).toBe('300px');
  });

  it('calls everything visible when the browser has no observer', () => {
    (
      globalThis as unknown as {IntersectionObserver: unknown}
    ).IntersectionObserver = undefined;

    render(<Probe />);

    // The gate is an optimisation, not a feature. A browser that cannot do it
    // gets the page as it behaved before the gate existed.
    expect(screen.getByTestId('probe')).toHaveTextContent('visible');
  });
});

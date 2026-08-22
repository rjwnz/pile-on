import {toMetres} from '@pile-on/core';
import {TierPlanSvg} from './components/TierPlanSvg';
import {
  ALIGNED_PAIR,
  DEMO_DECK_LENGTH,
  DEMO_DECK_WIDTH,
  STAGGERED_PAIR,
  separationOf,
} from './demo/staggerDemo';

export function App() {
  const aligned = separationOf(ALIGNED_PAIR);
  const staggered = separationOf(STAGGERED_PAIR);
  const saving = aligned - staggered;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 text-slate-900">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Pile-On</h1>
        <p className="text-sm text-slate-600">
          Load planning for steel screw piles on NZ flat-deck transport.
          Skeleton — the engine is wired up, the packer is not written yet.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Why staggering matters</h2>
        <p className="max-w-prose text-sm text-slate-600">
          Two identical double-helix piles on a{' '}
          {toMetres(DEMO_DECK_WIDTH).toFixed(2)} m deck. Sliding one pile down
          the deck so no two plates share a station lets the pair close up by{' '}
          <strong>{saving} mm</strong> — {aligned} mm apart becomes {staggered}{' '}
          mm apart.
        </p>

        <TierPlanSvg
          title={`Plates aligned — ${aligned} mm apart`}
          deckLength={DEMO_DECK_LENGTH}
          deckWidth={DEMO_DECK_WIDTH}
          piles={ALIGNED_PAIR}
        />

        <TierPlanSvg
          title={`Plates staggered — ${staggered} mm apart`}
          deckLength={DEMO_DECK_LENGTH}
          deckWidth={DEMO_DECK_WIDTH}
          piles={STAGGERED_PAIR}
        />
      </section>
    </main>
  );
}

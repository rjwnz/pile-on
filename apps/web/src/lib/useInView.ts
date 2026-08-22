import {useEffect, useState, type RefObject} from 'react';

/**
 * Whether an element has come near the viewport yet.
 *
 * Used to hold back work that is only worth doing once someone can see the
 * result. A loading plan is a tall page — a dozen trucks, one after another —
 * and on arrival exactly one of them is on screen.
 *
 * The answer latches: once seen, always seen. Tearing a view down on
 * scroll-away would mean rebuilding it on scroll-back, and rebuilding is the
 * expensive half. This trades memory, which the page has, for work, which it
 * has been short of.
 *
 * A browser with no `IntersectionObserver` calls everything visible, which is
 * how the page behaved before there was a gate at all.
 */
export function useInView(
  ref: RefObject<Element | null>,
  rootMargin = '300px',
): boolean {
  const [seen, setSeen] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const element = ref.current;
    if (seen || !element) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setSeen(true);
        }
      },
      // A margin, so the view is built just before it is scrolled to rather
      // than as it lands.
      {rootMargin},
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, seen]);

  return seen;
}

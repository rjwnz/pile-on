import {useEffect, useState, type RefObject} from 'react';

/**
 * Whether an element has come near the viewport yet. Latches — rebuilding on
 * scroll-back is the expensive half. A browser with no `IntersectionObserver`
 * calls everything visible.
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
      // Margin: build just before it is scrolled to, not as it lands.
      {rootMargin},
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, seen]);

  return seen;
}

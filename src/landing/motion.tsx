import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

// Tiny stand-ins for the few framer-motion features the marketing site uses: reveal on scroll, mount
// animations and a fade-out on unmount. Timings match the original site.

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

const reducedQuery = () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => Boolean(reducedQuery()?.matches));
  useEffect(() => {
    const q = reducedQuery();
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (shrunk by `margin` px on every side), then stays true. */
export function useInView(ref: RefObject<Element | null>, margin = 0): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: `${-margin}px` });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, seen]);
  return seen;
}

/** Fades and lifts its children in the first time they scroll into view (0.4 s, ease-out). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref, 60);
  const reduced = useReducedMotion();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown || reduced ? 'none' : 'translateY(16px)',
        transition: `opacity .4s ease-out ${delay}s, transform .4s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/** Mounts with a fade-up and fades out for 0.3 s before unmounting. */
export function Presence({ show, className, children }: { show: boolean; className: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) return setMounted(true);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [show]);
  if (!mounted) return null;
  return <div className={cn(className, show ? 'lp-rise lp-rise-6' : 'lp-leave')}>{children}</div>;
}

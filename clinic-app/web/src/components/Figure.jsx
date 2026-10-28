import { useEffect, useRef } from 'react';
import { POSES } from '../figure/poses.js';
import { blend, drawFigure, lookFor } from '../figure/rig.js';
import { ageFrom } from '../lib/format.js';

export const lookOf = (profile) => lookFor({
  gender: profile?.gender, hijab: profile?.avatar?.hijab, skin: profile?.avatar?.skin, age: ageFrom(profile?.birth_year),
});

const markup = (slug, look, t) => {
  const ex = POSES[slug];
  if (!ex) return '';
  return `<svg viewBox="${(ex.view || [0, 0, 720, 480]).join(' ')}" aria-hidden="true">${ex.props || ''}${drawFigure(blend(ex.A, ex.B, t), look)}</svg>`;
};

// Animated figure. With `phase` (a function now -> t), the caller drives the motion;
// otherwise it loops gently. Static (t = 1) when the viewer prefers reduced motion.
export default function Figure({ slug, look, phase, still = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || reduce) { el.innerHTML = markup(slug, look, still ? 0.85 : 1); return; }
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const t = phase ? phase(now) : (1 - Math.cos(((now - t0) / 1600) * Math.PI)) / 2;
      el.innerHTML = markup(slug, look, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slug, look, phase, still]);
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}

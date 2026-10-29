// Recorded read-aloud tracks (neural voices, made by supabase/seed/build_audio.py).
// English only for now; add a language here once its files are recorded.
import manifest from '../api/audio-manifest.json';

export const AUDIO_LANGS = ['en'];

// Track for an exercise in the UI language (or English), voice matching the patient's gender.
export function audioFor(slug, lang, gender) {
  const l = AUDIO_LANGS.includes(lang) ? lang : AUDIO_LANGS[0];
  const voices = manifest[slug]?.[l];
  if (!voices) return null;
  const v = voices[gender] || voices.f || voices.m;
  // A single-file build (the shareable demo page) carries the tracks inline.
  const inline = typeof window !== 'undefined' ? window.__AUDIO_INLINE__?.[v?.src] : null;
  return v && { lang: l, src: inline || v.src, starts: v.starts };
}

// Recorded parts are name, caution, steps..., tip. The read-aloud parts on screen have
// the therapist's own caution in slot 2, so later parts shift by one.
export function partAt(starts, time) {
  let i = 0;
  starts.forEach((s, k) => { if (time >= s) i = k; });
  return i < 2 ? i : i + 1;
}

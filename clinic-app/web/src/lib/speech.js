// Read-aloud on top of the browser's speech engine. Handles the usual problems:
// voices that load late, a missing voice for the language (never read Arabic with
// an English voice), Chrome stopping long utterances after ~15 s, and symbols
// that engines read out literally.
import { SPEECH } from '../i18n.js';

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
export const speechSupported = () => !!synth();

// Chrome fills the voice list asynchronously; wait for it briefly.
function loadVoices(timeout = 1500) {
  const s = synth();
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { s.removeEventListener?.('voiceschanged', done); resolve(s.getVoices()); };
    s.addEventListener?.('voiceschanged', done);
    setTimeout(done, timeout);
  });
}

const QUALITY = /natural|neural|premium|enhanced|google|siri|online/i;
const norm = (l) => (l || '').replace('_', '-').toLowerCase();

// Best voice for the language: exact locale first, then same language; higher quality first.
function pickVoice(voices, code) {
  const exact = norm(code), base = exact.slice(0, 2);
  const score = (v) => {
    const l = norm(v.lang);
    if (!l.startsWith(base)) return -1;
    return (l === exact ? 4 : 0) + (QUALITY.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  };
  return voices.map((v) => [score(v), v]).filter(([n]) => n >= 0).sort((a, b) => b[0] - a[0])[0]?.[1] ?? null;
}

const WORDS = {
  en: { x: ' by ', deg: ' degrees', cm: ' centimetres' },
  ar: { x: ' في ', deg: ' درجة', cm: ' سنتي' },
  de: { x: ' mal ', deg: ' Grad', cm: ' Zentimeter' },
};

// Turn display text into something an engine reads naturally.
export function speakable(text, lang) {
  const w = WORDS[lang] || WORDS.en;
  let s = String(text || '');
  if (lang !== 'en') s = s.replace(/\([^)]*[A-Za-z][^)]*\)/g, '');       // drop English terms in brackets
  return s
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/(\d)\s*×\s*(\d)/g, `$1${w.x}$2`).replace(/×/g, w.x)
    .replace(/(\d)\s*°/g, `$1${w.deg}`)
    .replace(/(\d)\s*cm\b/gi, `$1${w.cm}`)
    .replace(/[«»"“”„()[\]{}*_#]/g, '')
    .replace(/\s*[–—]\s*/g, lang === 'ar' ? '، ' : ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split into sentences so no single utterance is long enough for Chrome to cut it off.
const sentences = (s) => s.split(/(?<=[.!?؟؛;:\n])\s+/).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x));

// A therapist may write a note in another language than the app's (an Arabic note on a
// German screen). Read each sentence with a voice for its own script, never a mismatched one.
const ARABIC = /[؀-ۿ]/;
const langOf = (text, ui) => (ARABIC.test(text) ? 'ar' : ui === 'ar' ? 'en' : ui);

let run = 0;
export function stopSpeaking() { run += 1; synth()?.cancel(); }

/**
 * Speaks `parts` in order. onPart(i) fires as part i starts (i is the index in `parts`,
 * empty parts are skipped). Resolves to 'done', 'stopped', 'no-voice' or 'error'.
 */
export async function speak(parts, lang, onPart = () => {}) {
  const s = synth();
  stopSpeaking();
  const mine = run;
  const voices = await loadVoices();
  if (mine !== run) return 'stopped';
  const voiceFor = (l) => pickVoice(voices, SPEECH[l] || 'en-US');
  // A device that lists voices but none for this language would read with the wrong
  // accent (or skip the text). Some Android browsers list nothing at all: let the OS choose.
  if (voices.length && !voiceFor(lang)) return 'no-voice';

  const queue = [];
  parts.forEach((p, i) => {
    const pl = langOf(p || '', lang) === 'ar' ? 'ar' : lang;
    for (const line of sentences(speakable(p, pl))) {
      const l = langOf(line, lang);
      const voice = voiceFor(l);
      if (voice || !voices.length) queue.push({ i, line, l, voice });   // no voice for that script: skip it
    }
  });

  await new Promise((r) => setTimeout(r, 80));   // Chrome drops a speak() issued right after cancel()
  for (const { i, line, l, voice } of queue) {
    if (mine !== run) return 'stopped';
    onPart(i);
    const res = await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = voice?.lang || SPEECH[l];
      if (voice) u.voice = voice;
      u.rate = l === 'ar' ? 0.85 : 0.92;
      u.onend = () => resolve('ok');
      u.onerror = (e) => resolve(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'ok');
      try { s.resume(); s.speak(u); } catch { resolve('error'); }
    });
    if (mine !== run) return 'stopped';
    if (res !== 'ok') return res;
    await new Promise((r) => setTimeout(r, 250));   // short pause between sentences
  }
  return 'done';
}

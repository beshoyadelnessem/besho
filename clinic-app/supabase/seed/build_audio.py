#!/usr/bin/env python3
"""Records the read-aloud audio for the exercise library with neural voices.

For every exercise, language and voice (female/male) it writes one MP3 to
web/public/audio/ and the start time of each part to web/src/api/audio-manifest.json,
so the app can highlight the step being read. Parts: name, caution, steps..., tip.
Only files whose text changed are recorded again.

Needs network access, ffmpeg and `pip install edge-tts`. Runs in CI
(.github/workflows/exercise-audio.yml) whenever the library changes.
"""
import asyncio, hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / 'supabase/seed/exercises_acl.json'
OUT = ROOT / 'web/public/audio'
MANIFEST = ROOT / 'web/src/api/audio-manifest.json'

# Egyptian Arabic voices suit the Egyptian-dialect text.
ALL_VOICES = {
    'ar': {'f': 'ar-EG-SalmaNeural', 'm': 'ar-EG-ShakirNeural'},
    'en': {'f': 'en-US-JennyNeural', 'm': 'en-US-GuyNeural'},
    'de': {'f': 'de-DE-KatjaNeural', 'm': 'de-DE-ConradNeural'},
}
# English only for now; add 'ar' / 'de' here (and in web/src/lib/audio.js) to record them too.
VOICES = {k: ALL_VOICES[k] for k in ('en',)}
RATE = {'ar': '-8%', 'en': '-5%', 'de': '-5%'}
CAUTION = {'ar': 'تنبيه مهم', 'en': 'Caution', 'de': 'Achtung'}
WORDS = {'ar': (' في ', ' درجة'), 'en': (' by ', ' degrees'), 'de': (' mal ', ' Grad')}
GAP = 0.45  # seconds of silence between parts


def clean(text, lang):
    x, deg = WORDS[lang]
    if lang != 'en':
        text = re.sub(r'\([^)]*[A-Za-z][^)]*\)', '', text)
    text = re.sub(r'[\U0001F000-\U0001FFFF☀-➿️]', '', text)
    text = re.sub(r'\s*×\s*', x, text)
    text = re.sub(r'(\d)\s*°', r'\1' + deg, text)
    text = re.sub(r'[«»"“”„]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


async def record(parts, voice, rate, dest):
    """Records each part, joins them with short pauses, returns part start times."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wavs, starts, t = [], [], 0.0
        for i, text in enumerate(parts):
            mp3 = tmp / f'{i}.mp3'
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text, voice, rate=rate).save(str(mp3))
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    await asyncio.sleep(2 ** attempt)
            wav = tmp / f'{i}.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mp3), '-af', f'apad=pad_dur={GAP}',
                            '-ac', '1', '-ar', '24000', str(wav)], check=True)
            starts.append(round(t, 2))
            t += duration(wav)
            wavs.append(wav)
        lst = tmp / 'list.txt'
        lst.write_text(''.join(f"file '{w}'\n" for w in wavs))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst),
                        '-ac', '1', '-ar', '24000', '-b:a', '32k', str(dest)], check=True)
        return starts


async def main(only=None):
    library = json.loads(SEED.read_text())
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    done = 0
    for ex in library:
        if only and ex['slug'] not in only:
            continue
        for lang, voices in VOICES.items():
            c = ex['content'][lang]
            parts = [clean(p, lang) for p in [c['name'], f"{CAUTION[lang]}: {c['caution']}", *c['steps'], c.get('tip') or '']]
            parts = [p for p in parts if p]
            for g, voice in voices.items():
                name = f"{ex['slug']}.{lang}.{g}.mp3"
                key = hashlib.sha1(json.dumps([voice, RATE[lang], parts], ensure_ascii=False).encode()).hexdigest()[:12]
                old = manifest.get(ex['slug'], {}).get(lang, {}).get(g)
                if old and old.get('hash') == key and (OUT / name).exists():
                    continue
                starts = await record(parts, voice, RATE[lang], OUT / name)
                manifest.setdefault(ex['slug'], {}).setdefault(lang, {})[g] = {
                    'src': f'audio/{name}', 'starts': starts, 'hasTip': bool(c.get('tip')), 'hash': key}
                done += 1
                print(f'recorded {name} ({len(parts)} parts)', flush=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True) + '\n')
    print(f'{done} file(s) recorded')


if __name__ == '__main__':
    asyncio.run(main(set(sys.argv[1:]) or None))

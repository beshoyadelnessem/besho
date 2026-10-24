"""Sound design for the 5 s 'Helawet Masr' film: drone, riser, impact, Hijaz plucks, string pad.
Writes a 48 kHz stereo WAV. Usage: python3 score.py out.wav"""
import sys, wave
import numpy as np

SR, DUR = 48000, 5.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
t = np.arange(N) / SR


def env(a, d, length):
    n = int(length * SR)
    e = np.ones(n)
    na, nd = int(a * SR), int(d * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    if nd:
        e[-nd:] *= np.linspace(1, 0, nd) ** 1.5
    return e


def place(buf, sig, at):
    i = int(at * SR)
    j = min(N, i + len(sig))
    buf[..., i:j] += sig[..., : j - i]


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def pluck(freq, length, bright=0.5):
    """Karplus-Strong string with a qanun-like attack."""
    n = int(length * SR)
    p = int(SR / freq)
    buf = rng.uniform(-1, 1, p) * np.hanning(p) ** 0.3
    out = np.empty(n)
    idx = 0
    decay = 0.996
    for i in range(n):
        v = buf[idx]
        nxt = buf[(idx + 1) % p]
        buf[idx] = decay * ((0.5 + bright * 0.5) * v + (0.5 - bright * 0.5) * nxt)
        out[i] = v
        idx = (idx + 1) % p
    out *= np.exp(-np.arange(n) / SR * 1.6)
    return out


def saw(freq, length, detune=0.0):
    tt = np.arange(int(length * SR)) / SR
    f = freq * (1 + detune)
    return 2 * ((tt * f) % 1.0) - 1


L = np.zeros(N)
R = np.zeros(N)

# 1) sub drone on D with a fifth, swelling in
drone = (np.sin(2 * np.pi * 36.71 * t) * 0.55 + np.sin(2 * np.pi * 55.0 * t) * 0.25 + np.sin(2 * np.pi * 73.42 * t) * 0.2)
drone *= np.clip(t / 0.9, 0, 1) ** 1.5 * (0.75 + 0.25 * np.sin(2 * np.pi * 0.4 * t))
L += drone * 0.32
R += drone * 0.32

# 2) reversed-cymbal style riser into the sunburst
rl = 0.9
noise = rng.standard_normal(int(rl * SR))
noise = lowpass(noise - lowpass(noise, 1500), 7000)  # airy band, no harsh top end
riser = noise * np.linspace(0, 1, len(noise)) ** 3
place(L, riser * 0.5, 0.0)
place(R, np.roll(riser, 113) * 0.5, 0.0)

# 3) impact when the sun breaks past the pyramid (~0.9 s)
hit_t = 0.9
hl = 2.2
th = np.arange(int(hl * SR)) / SR
sweep = np.sin(2 * np.pi * np.cumsum(38 + 90 * np.exp(-th * 14)) / SR)
boom = sweep * np.exp(-th * 2.2)
crack = rng.standard_normal(len(th)) * np.exp(-th * 30) * 0.35
place(L, (boom * 0.9 + crack), hit_t)
place(R, (boom * 0.9 + np.roll(crack, 37)), hit_t)

# 4) Hijaz phrase on D (qanun-like), panned and gently humanised
hz = {"D3": 146.83, "D4": 293.66, "Eb4": 311.13, "F#4": 369.99, "G4": 392.0, "A4": 440.0, "Bb4": 466.16, "C5": 523.25, "D5": 587.33}
phrase = [("D3", 1.20, 2.5, 0.7, 0.0), ("A4", 1.22, 1.6, 0.55, -0.3), ("Bb4", 1.46, 1.2, 0.5, 0.25), ("A4", 1.62, 1.2, 0.45, -0.2),
          ("G4", 1.78, 1.2, 0.45, 0.3), ("F#4", 1.98, 1.4, 0.5, -0.25), ("G4", 2.22, 1.3, 0.45, 0.2), ("A4", 2.50, 2.3, 0.6, 0.0),
          ("D5", 3.15, 1.8, 0.35, 0.35), ("D3", 3.15, 1.8, 0.45, 0.0), ("A4", 3.18, 1.8, 0.3, -0.35)]
for name, at, length, amp, pan in phrase:
    s = pluck(hz[name], length, bright=0.7 if name != "D3" else 0.3) * amp
    place(L, s * np.sqrt(0.5 * (1 - pan)), at)
    place(R, s * np.sqrt(0.5 * (1 + pan)), at)

# 5) warm string pad (D, F#, A) blooming after the hit
pad_len = DUR - hit_t
pad = np.zeros(int(pad_len * SR))
for f in (146.83, 220.0, 293.66, 369.99):
    for d in (-0.004, 0.0, 0.005):
        pad += saw(f, pad_len, d)
pad = lowpass(pad / 12.0, 1300) * env(1.6, 1.2, pad_len)
place(L, pad * 0.5, hit_t)
place(R, np.roll(pad, 240) * 0.5, hit_t)

# 6) convolution reverb (decorrelated stereo tails)
def reverb(x, seed, seconds=2.6):
    g = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = g.standard_normal(n) * np.exp(-np.arange(n) / SR * 2.6)
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n
    size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y

L = L * 0.75 + reverb(L, 1) * 0.55
R = R * 0.75 + reverb(R, 2) * 0.55

# master: fade, soft clip, normalise
master = np.stack([L, R])
fade = np.ones(N)
fo = int(0.6 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 2
master *= fade
master = np.tanh(master * 1.4) / np.tanh(1.4)
master /= np.max(np.abs(master)) / 0.89

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((master.T * 32767).astype("<i2").tobytes())

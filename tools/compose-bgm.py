"""Render three original, deterministic, soft instrumental scores for offline playback."""
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.toolchain' / 'audio-tools'))
import imageio_ffmpeg

RATE = 32000
SCORES = [
    ('bgm_window', 62, 11,
     [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]],
     [[76, 74, 72, 67], [72, 76, 74, 69], [69, 72, 76, 74], [71, 74, 67, 69]]),
    ('bgm_moon', 54, 23,
     [[45, 52, 55, 60], [41, 48, 52, 57], [48, 55, 59, 64], [43, 50, 55, 59]],
     [[72, 71, 69, 64], [69, 67, 65, 64], [67, 72, 71, 67], [69, 67, 62, 67]]),
    ('bgm_sun', 66, 37,
     [[41, 48, 57, 60], [48, 55, 59, 64], [43, 50, 57, 59], [45, 52, 55, 60]],
     [[69, 72, 74, 72], [76, 74, 72, 67], [74, 71, 69, 67], [72, 69, 67, 64]])
]


def voice(note, seconds, kind):
    t = np.arange(round(seconds * RATE), dtype=np.float64) / RATE
    f = 440 * 2 ** ((note - 69) / 12)
    if kind == 'pad':
        sound = (np.sin(2 * np.pi * f * t) + .15 * np.sin(2 * np.pi * f * 2 * t))
        attack = np.minimum(t / .9, 1) ** 2
        release = np.minimum((seconds - t) / 1.8, 1) ** 2
        env = attack * release * (.95 + .05 * np.sin(2 * np.pi * .21 * t))
    else:
        sound = np.sin(2 * np.pi * f * t) * np.exp(-t / 2.4)
        sound += .28 * np.sin(2 * np.pi * f * 2.001 * t) * np.exp(-t / 1.05)
        sound += .065 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t / .6)
        sound += .014 * np.sin(2 * np.pi * f * 5 * t) * np.exp(-t / .3)
        env = np.minimum(t / .045, 1) ** 2 * np.minimum((seconds - t) / .35, 1) ** 2
    return (sound * env).astype(np.float32)


def compose(name, tempo, seed, chords, melodies):
    rng = np.random.default_rng(seed)
    beat = 60 / tempo
    bars = 20
    duration = bars * 4 * beat + 7
    mix = np.zeros((math.ceil(duration * RATE), 2), dtype=np.float32)

    def add(note, start, length, gain, pan, kind='piano'):
        clip = voice(note, length, kind)
        offset = max(0, round(start * RATE))
        count = min(len(clip), len(mix) - offset)
        if count <= 0:
            return
        angle = (pan + 1) * np.pi / 4
        mix[offset:offset + count, 0] += clip[:count] * gain * math.cos(angle)
        mix[offset:offset + count, 1] += clip[:count] * gain * math.sin(angle)

    for bar in range(bars):
        start = .5 + bar * 4 * beat
        chord = chords[bar % 4]
        phrase = melodies[bar % 4]
        for index, note in enumerate(chord):
            add(note, start + .07 * index, 4 * beat + 1.5, .035, (index - 1.5) / 3, 'pad')
        add(chord[0] - 12, start, 4.5, .075, 0)
        # Sparse broken chords leave room between melody phrases.
        for index in range(4):
            add(chord[index] + 12, start + index * beat + rng.uniform(-.018, .018),
                3.5, .045 * rng.uniform(.85, 1.1), -.28 if index % 2 else .28)
        pattern = [0, 1.5, 2.5] if bar % 2 == 0 else [.5, 2]
        for index, position in enumerate(pattern):
            note = phrase[(index + bar // 4) % len(phrase)]
            add(note, start + position * beat + rng.uniform(-.018, .018),
                4.8, .115 * rng.uniform(.85, 1.04), rng.uniform(-.16, .16))
    dry = mix.copy()
    for index, (delay, amount) in enumerate([(.137, .14), (.239, .11), (.383, .08), (.557, .06), (.743, .045), (1.07, .025)]):
        offset = round(delay * RATE)
        source = dry[:-offset, ::-1] if index % 2 else dry[:-offset]
        mix[offset:] += source * amount
    mix -= np.mean(mix, axis=0)
    fade_in = np.linspace(0, 1, 3 * RATE, dtype=np.float32) ** 2
    fade_out = np.linspace(1, 0, 5 * RATE, dtype=np.float32) ** 2
    mix[:len(fade_in)] *= fade_in[:, None]
    mix[-len(fade_out):] *= fade_out[:, None]
    rms = float(np.sqrt(np.mean(mix ** 2)))
    mix *= min(.13 / rms, .62 / float(np.max(np.abs(mix))))
    return mix


def main():
    temp = ROOT / '.toolchain' / 'bgm-audio'
    output = ROOT / 'app' / 'src' / 'main' / 'res' / 'raw'
    temp.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    report = []
    for score in SCORES:
        name = score[0]
        mix = compose(*score)
        wav = temp / f'{name}.wav'
        with wave.open(str(wav), 'wb') as writer:
            writer.setnchannels(2)
            writer.setsampwidth(2)
            writer.setframerate(RATE)
            writer.writeframes((mix * 32767).astype('<i2').tobytes())
        target = output / f'{name}.m4a'
        subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(wav), '-c:a', 'aac', '-b:a', '96k',
                        '-movflags', '+faststart', str(target)], check=True)
        decoded = subprocess.run([ffmpeg, '-v', 'error', '-i', str(target), '-f', 'f32le',
                                  '-acodec', 'pcm_f32le', '-'], check=True, capture_output=True).stdout
        samples = np.frombuffer(decoded, dtype='<f4').reshape(-1, 2)
        peak = float(np.max(np.abs(samples)))
        rms = float(np.sqrt(np.mean(samples ** 2)))
        head = float(np.sqrt(np.mean(samples[:RATE // 2] ** 2)))
        tail = float(np.sqrt(np.mean(samples[-RATE // 2:] ** 2)))
        assert len(samples) / RATE > 60 and .03 < rms < .2 and peak < .85
        assert head < .01 and tail < .01, 'Music must start and end softly'
        report.append(dict(file=target.name, seconds=round(len(samples) / RATE, 2),
                           peak=round(peak, 4), rms=round(rms, 4), head_rms=head, tail_rms=tail))
    (temp / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()

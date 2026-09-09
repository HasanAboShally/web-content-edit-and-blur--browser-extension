#!/usr/bin/env python3
"""Fit beat grids and summarize candidate launch-video music.

Usage:
  python analyze-music.py OUTPUT.json TRACK [TRACK ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import librosa
import numpy as np


def analyze(track: Path) -> dict[str, object]:
    signal, sample_rate = librosa.load(track, sr=None, mono=True)
    percussive = librosa.effects.percussive(signal)
    tempo, detected = librosa.beat.beat_track(
        y=percussive,
        sr=sample_rate,
        tightness=400,
        units="time",
    )
    beats = np.asarray(detected, dtype=float)
    if len(beats) < 8:
        raise RuntimeError(f"Not enough beats detected in {track}")

    indexes = np.arange(len(beats), dtype=float)
    design = np.vstack([indexes, np.ones_like(indexes)]).T
    (period, phase), *_ = np.linalg.lstsq(design, beats, rcond=None)
    fitted = phase + indexes * period
    residual = beats - fitted

    rms = librosa.feature.rms(y=signal)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    onset = librosa.onset.onset_strength(y=percussive, sr=sample_rate)
    onset_times = librosa.times_like(onset, sr=sample_rate)
    strongest = np.argsort(onset)[-12:][::-1]

    return {
        "file": track.name,
        "durationSeconds": round(float(librosa.get_duration(y=signal, sr=sample_rate)), 4),
        "sampleRate": sample_rate,
        "reportedTempo": round(float(np.asarray(tempo).reshape(-1)[0]), 3),
        "fittedBpm": round(float(60 / period), 4),
        "beat0Seconds": round(float(phase), 6),
        "beatIntervalSeconds": round(float(period), 6),
        "beatCount": int(len(beats)),
        "maxGridResidualMs": round(float(np.max(np.abs(residual)) * 1000), 3),
        "meanGridResidualMs": round(float(np.mean(np.abs(residual)) * 1000), 3),
        "medianRmsDb": round(float(np.median(rms_db)), 3),
        "rmsDynamicRangeDb": round(float(np.percentile(rms_db, 95) - np.percentile(rms_db, 10)), 3),
        "strongestOnsetsSeconds": [round(float(onset_times[i]), 4) for i in strongest],
    }


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: analyze-music.py OUTPUT.json TRACK [TRACK ...]")
    output = Path(sys.argv[1])
    results = [analyze(Path(value)) for value in sys.argv[2:]]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"candidates": results}, indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Measure rendered BGM offset and visual cut alignment against the source grid."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

import librosa
import numpy as np
from scipy.signal import correlate, correlation_lags

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "out/content-edit-blur-launch.mp4"
SOURCE = ROOT / "public/audio/bgm/house-vibez.mp3"
OUTPUT = ROOT / "analysis/beat-sync-report.json"
FPS = 30
SOURCE_BEAT0 = 7.935632
PERIOD = 0.491795
CUT_BEATS = [8, 20, 32, 36, 48, 60, 72, 96]
SAMPLE_RATE = 12000

with tempfile.TemporaryDirectory(prefix="ceb-beat-") as temp:
    wav = Path(temp) / "master.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(MASTER), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), str(wav)],
        check=True,
    )
    rendered, _ = librosa.load(wav, sr=SAMPLE_RATE, mono=True, duration=42)
    source, _ = librosa.load(SOURCE, sr=SAMPLE_RATE, mono=True, offset=SOURCE_BEAT0, duration=40)

# Ignore the fade-in and compare the stable middle of the selected source segment.
probe_start = 2 * SAMPLE_RATE
probe_end = 38 * SAMPLE_RATE
source_probe = source[probe_start:probe_end]
render_probe = rendered[: min(len(rendered), 41 * SAMPLE_RATE)]
source_probe = (source_probe - np.mean(source_probe)) / (np.std(source_probe) + 1e-9)
render_probe = (render_probe - np.mean(render_probe)) / (np.std(render_probe) + 1e-9)
values = correlate(render_probe, source_probe, mode="full", method="fft")
lags = correlation_lags(len(render_probe), len(source_probe), mode="full")
# The source probe begins two seconds into the local music segment.
raw_lag = lags[int(np.argmax(values))] / SAMPLE_RATE
output_offset = raw_lag - 2.0

cuts = []
for beat in CUT_BEATS:
    visual_frame = round(beat * PERIOD * FPS)
    visual_seconds = visual_frame / FPS
    rendered_beat_seconds = beat * PERIOD + output_offset
    error_frames = (visual_seconds - rendered_beat_seconds) * FPS
    cuts.append(
        {
            "beat": beat,
            "visualFrame": visual_frame,
            "renderedBeatSeconds": round(rendered_beat_seconds, 6),
            "errorFrames": round(error_frames, 3),
        }
    )

report = {
    "pipeline": "Remotion 4.0.523 / H.264 + AAC / 48kHz / MP4",
    "method": "Normalized FFT cross-correlation of the rendered mix against the licensed source BGM segment",
    "sourceBeat0Seconds": SOURCE_BEAT0,
    "beatIntervalSeconds": PERIOD,
    "measuredOutputOffsetSeconds": round(float(output_offset), 6),
    "measuredOutputOffsetFrames": round(float(output_offset * FPS), 3),
    "cutAlignment": cuts,
    "maximumAbsoluteErrorFrames": round(max(abs(item["errorFrames"]) for item in cuts), 3),
    "thresholdFrames": 3,
}
OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if report["maximumAbsoluteErrorFrames"] > report["thresholdFrames"]:
    raise SystemExit(1)

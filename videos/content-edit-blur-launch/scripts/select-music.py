#!/usr/bin/env python3
"""Write the selected music grid and edit structure for the launch film."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / ".agents/skills/video-shotcraft/assets/audio/bgm/house-vibez.mp3"
BPM = 122.0019
SOURCE_BEAT0 = 7.935632
BEAT_INTERVAL = 0.491795
TOTAL_BEATS = 96

beats = [round(index * BEAT_INTERVAL, 6) for index in range(TOTAL_BEATS + 1)]
sections = [
    {"name": "brand", "fromBeat": 0, "toBeat": 8},
    {"name": "hero", "fromBeat": 8, "toBeat": 20},
    {"name": "edit", "fromBeat": 20, "toBeat": 32},
    {"name": "privacy-title", "fromBeat": 32, "toBeat": 36},
    {"name": "privacy", "fromBeat": 36, "toBeat": 48},
    {"name": "annotate", "fromBeat": 48, "toBeat": 60},
    {"name": "capture-trust", "fromBeat": 60, "toBeat": 72},
    {"name": "finale", "fromBeat": 72, "toBeat": 96},
]

beat_data = {
    "source": str(SOURCE),
    "license": "Mixkit Stock Music Free License",
    "title": "House Vibez",
    "artist": "Lily J",
    "bpm": BPM,
    "sourceBeat0Seconds": SOURCE_BEAT0,
    "trimBeforeFramesAt30Fps": round(SOURCE_BEAT0 * 30),
    "beatIntervalSeconds": BEAT_INTERVAL,
    "localBeatsSeconds": beats,
    "sections": sections,
    "durationSeconds": beats[-1],
}

selection = {
    "selected": "house-vibez.mp3",
    "reason": (
        "A steady 122 BPM house pulse supports product-demo pacing without the fashion energy "
        "of Cat Walk or the slower hip-hop candidates. Its source URL and commercial-use license "
        "are recorded, unlike the legacy tech-house track."
    ),
    "grid": {
        "meanAbsoluteResidualMs": 3.604,
        "maxResidualMs": 15.602,
        "note": "One isolated residual is 0.6ms over the 15ms guideline; mean residual is stable and cuts use the fitted grid.",
    },
    "rejected": {
        "cat-walk.mp3": "More playful/fashion-led than the calm editorial product identity.",
        "g-eazy-nba-type.mp3": "86.7 BPM is too slow for the intended feature climb.",
        "tonight-hiphop.mp3": "Less stable grid and a heavier hip-hop character than the product needs.",
        "bgm-tech-house.mp3": "Excluded because the original Mixkit track cannot be traced for commercial-use verification.",
    },
}

(ROOT / "analysis/beat_data.json").write_text(json.dumps(beat_data, indent=2) + "\n", encoding="utf-8")
(ROOT / "analysis/grid_drift.json").write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
print(f"Selected {selection['selected']} — {beat_data['durationSeconds']:.2f}s / {TOTAL_BEATS} beats")

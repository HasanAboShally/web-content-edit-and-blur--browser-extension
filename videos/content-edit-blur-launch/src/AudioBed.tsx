import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import {BGM_TRIM_BEFORE, SHOTS, TOTAL_FRAMES} from './timeline';

const OUTPUT_AUDIO_OFFSET_FRAMES = 1.28;
const fromPeak = (target: number) => Math.max(0, Math.round(target - OUTPUT_AUDIO_OFFSET_FRAMES));

type Cue = {from: number; src: string; volume: number; duration: number};

export const SFX_CUES: Cue[] = [
  {from: fromPeak(SHOTS.hook.from + 22), src: 'air-zoom-vacuum.mp3', volume: .24, duration: 45},
  {from: fromPeak(SHOTS.hero.from + 34), src: 'whoosh-fast.mp3', volume: .26, duration: 56},
  {from: fromPeak(SHOTS.hero.from + 138), src: 'switch-click-quick.mp3', volume: .25, duration: 32},
  {from: fromPeak(SHOTS.edit.from + 42), src: 'typewriter-digital.mp3', volume: .22, duration: 58},
  {from: fromPeak(SHOTS.edit.from + 132), src: 'camera-shutter-hard.mp3', volume: .30, duration: 38},
  {from: fromPeak(SHOTS.privacyTitle.from + 2), src: 'sweep-fast.mp3', volume: .18, duration: 58},
  {from: fromPeak(SHOTS.privacy.from + 20), src: 'sweep-fast.mp3', volume: .22, duration: 58},
  {from: fromPeak(SHOTS.privacy.from + 120), src: 'lock-quick.mp3', volume: .24, duration: 36},
  {from: fromPeak(SHOTS.annotate.from + 24), src: 'marker-pen-line.mp3', volume: .24, duration: 40},
  ...[46, 68, 90, 112].map((offset, index) => ({
    from: fromPeak(SHOTS.annotate.from + offset),
    src: 'switch-click-quick.mp3',
    volume: .18 - index * .02,
    duration: 24,
  })),
  {from: fromPeak(SHOTS.capture.from + 49), src: 'camera-shutter-hard.mp3', volume: .48, duration: 42},
  {from: fromPeak(SHOTS.capture.from + 92), src: 'air-zoom-vacuum.mp3', volume: .18, duration: 45},
  {from: fromPeak(SHOTS.finale.from + 8), src: 'air-whoosh-powerful.mp3', volume: .22, duration: 58},
  {from: fromPeak(SHOTS.finale.from + 104), src: 'whoosh-fast.mp3', volume: .22, duration: 58},
  {from: fromPeak(SHOTS.finale.from + 146), src: 'impact-deep-whoosh.mp3', volume: .40, duration: 130},
  {from: fromPeak(SHOTS.finale.from + 190), src: 'shimmer-sparkle-sweep.mp3', volume: .22, duration: 100},
];

export const AudioBed: React.FC<{bgm: boolean}> = ({bgm}) => (
  <>
    {bgm ? (
      <Audio
        src={staticFile('audio/bgm/house-vibez.mp3')}
        trimBefore={BGM_TRIM_BEFORE}
        volume={(frame) => interpolate(frame, [0, 30, TOTAL_FRAMES - 65, TOTAL_FRAMES], [0, .28, .28, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
      />
    ) : null}
    {SFX_CUES.map((cue, index) => (
      <Sequence key={`${cue.src}-${cue.from}-${index}`} from={cue.from} durationInFrames={cue.duration} layout="none">
        <Audio src={staticFile(`audio/sfx/${cue.src}`)} volume={cue.volume} />
      </Sequence>
    ))}
  </>
);

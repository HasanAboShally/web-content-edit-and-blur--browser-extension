import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {AudioBed} from './AudioBed';
import {RedactionCut} from './components/RedactionCut';
import {AnnotateScene} from './scenes/AnnotateScene';
import {CaptureScene} from './scenes/CaptureScene';
import {EditScene} from './scenes/EditScene';
import {FinaleScene} from './scenes/FinaleScene';
import {HeroScene} from './scenes/HeroScene';
import {HookScene} from './scenes/HookScene';
import {PrivacyScene} from './scenes/PrivacyScene';
import {PrivacyTitleScene} from './scenes/PrivacyTitleScene';
import {SHOTS} from './timeline';

export type LaunchFilmProps = {bgm: boolean};

const scenes = [
  [SHOTS.hook, HookScene],
  [SHOTS.hero, HeroScene],
  [SHOTS.edit, EditScene],
  [SHOTS.privacyTitle, PrivacyTitleScene],
  [SHOTS.privacy, PrivacyScene],
  [SHOTS.annotate, AnnotateScene],
  [SHOTS.capture, CaptureScene],
  [SHOTS.finale, FinaleScene],
] as const;

const cuts = [SHOTS.hero.from, SHOTS.privacyTitle.from, SHOTS.annotate.from, SHOTS.finale.from];

export const LaunchFilm: React.FC<LaunchFilmProps> = ({bgm}) => (
  <AbsoluteFill style={{background: '#f7f5f0'}}>
    {scenes.map(([shot, Scene], index) => (
      <Sequence key={index} from={shot.from} durationInFrames={shot.duration} name={`Scene ${index + 1}`}>
        <Scene />
      </Sequence>
    ))}
    {cuts.map((cut, index) => (
      <Sequence key={cut} from={cut - 7} durationInFrames={16} name={`Redaction cut ${index + 1}`}>
        <RedactionCut direction={index % 2 ? 'right' : 'left'} />
      </Sequence>
    ))}
    <AudioBed bgm={bgm} />
  </AbsoluteFill>
);

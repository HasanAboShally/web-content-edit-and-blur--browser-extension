import React from 'react';
import {Composition, Folder} from 'remotion';
import './fonts';
import {LaunchFilm} from './LaunchFilm';
import {AnnotateScene} from './scenes/AnnotateScene';
import {CaptureScene} from './scenes/CaptureScene';
import {EditScene} from './scenes/EditScene';
import {FinaleScene} from './scenes/FinaleScene';
import {HeroScene} from './scenes/HeroScene';
import {HookScene} from './scenes/HookScene';
import {PrivacyScene} from './scenes/PrivacyScene';
import {PrivacyTitleScene} from './scenes/PrivacyTitleScene';
import {FPS, HEIGHT, SHOTS, TOTAL_FRAMES, WIDTH} from './timeline';

const sceneCompositions = [
  ['HookScene', HookScene, SHOTS.hook.duration],
  ['HeroScene', HeroScene, SHOTS.hero.duration],
  ['EditScene', EditScene, SHOTS.edit.duration],
  ['PrivacyTitleScene', PrivacyTitleScene, SHOTS.privacyTitle.duration],
  ['PrivacyScene', PrivacyScene, SHOTS.privacy.duration],
  ['AnnotateScene', AnnotateScene, SHOTS.annotate.duration],
  ['CaptureScene', CaptureScene, SHOTS.capture.duration],
  ['FinaleScene', FinaleScene, SHOTS.finale.duration],
] as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ContentEditBlurLaunch"
      component={LaunchFilm}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{bgm: true}}
    />
    <Folder name="Scenes">
      {sceneCompositions.map(([id, component, durationInFrames]) => (
        <Composition key={id} id={id} component={component} durationInFrames={durationInFrames} fps={FPS} width={WIDTH} height={HEIGHT} />
      ))}
    </Folder>
  </>
);

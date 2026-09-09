import {LaunchFilm, REDACTION_CUTS} from './LaunchFilm';
import {SFX_CUES} from './AudioBed';
import {RedactionCut} from './components/RedactionCut';
import {AnnotateScene} from './scenes/AnnotateScene';
import {CaptureScene} from './scenes/CaptureScene';
import {EditScene} from './scenes/EditScene';
import {FinaleScene} from './scenes/FinaleScene';
import {HeroScene} from './scenes/HeroScene';
import {HookScene} from './scenes/HookScene';
import {PrivacyScene} from './scenes/PrivacyScene';
import {PrivacyTitleScene} from './scenes/PrivacyTitleScene';
import {FPS, HEIGHT, SHOTS, TOTAL_FRAMES, WIDTH} from './timeline';

export const WORKBENCH = {
  name: 'Content Edit & Blur · Launch film',
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  total: TOTAL_FRAMES,
  background: '#f7f5f0',
  revision: 'launch-v2',
  shots: [
    {id: 'hook', label: '01 · Promise', ...SHOTS.hook, component: HookScene},
    {id: 'hero', label: '02 · Product reveal', ...SHOTS.hero, component: HeroScene},
    {id: 'edit', label: '03 · Edit in place', ...SHOTS.edit, component: EditScene},
    {id: 'privacy-title', label: '04 · Privacy distinction', ...SHOTS.privacyTitle, component: PrivacyTitleScene},
    {id: 'privacy', label: '05 · Blur versus Redact', ...SHOTS.privacy, component: PrivacyScene},
    {id: 'annotate', label: '06 · Annotate', ...SHOTS.annotate, component: AnnotateScene},
    {id: 'capture', label: '07 · Capture and trust', ...SHOTS.capture, component: CaptureScene},
    {id: 'finale', label: '08 · Launch finale', ...SHOTS.finale, component: FinaleScene},
  ].map(({to: _to, ...shot}) => shot),
  transitions: REDACTION_CUTS.map((cut, index) => ({
    id: cut.id,
    label: `Redaction cut ${index + 1}`,
    from: cut.from,
    duration: cut.duration,
    component: RedactionCut,
    props: {direction: cut.direction},
  })),
  captions: [],
  overlays: [],
  sfx: SFX_CUES.map((cue) => ({from: cue.from, duration: cue.duration, src: `audio/sfx/${cue.src}`, volume: cue.volume})),
  bgm: [{from: 0, duration: TOTAL_FRAMES, src: 'audio/bgm/house-vibez.mp3', volume: .28}],
  order: ['transitions', 'captions', 'overlays'],
  original: LaunchFilm,
};

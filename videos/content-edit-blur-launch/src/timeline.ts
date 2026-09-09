export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const BEAT_INTERVAL_SECONDS = 0.491795;
export const SOURCE_BEAT0_SECONDS = 7.935632;
export const BGM_TRIM_BEFORE = Math.round(SOURCE_BEAT0_SECONDS * FPS);

export const beatF = (beat: number) => Math.round(beat * BEAT_INTERVAL_SECONDS * FPS);

const range = (fromBeat: number, toBeat: number) => {
  const from = beatF(fromBeat);
  const to = beatF(toBeat);
  return {from, to, duration: to - from};
};

export const SHOTS = {
  hook: range(0, 8),
  hero: range(8, 20),
  edit: range(20, 32),
  privacyTitle: range(32, 36),
  privacy: range(36, 48),
  annotate: range(48, 60),
  capture: range(60, 72),
  finale: range(72, 96),
} as const;

export const TOTAL_FRAMES = beatF(96);

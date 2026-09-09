import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {BrowserFrame} from '../components/BrowserFrame';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const FRAME_LEFT = 160;
const FRAME_TOP = 126;
const SCALE = 1600 / 1920;
const CONTENT_TOP = FRAME_TOP + 54;
const targets = [
  {name: 'HIGHLIGHT', x: 250, y: 78, w: 620, h: 62, labelX: 900},
  {name: 'CIRCLE', x: 420, y: 215, w: 170, h: 70, labelX: 610},
  {name: 'STEPS', x: 720, y: 370, w: 230, h: 190, labelX: 985},
  {name: 'ARROW', x: 520, y: 585, w: 430, h: 170, labelX: 1010},
].map((target) => ({
  ...target,
  x: FRAME_LEFT + target.x * SCALE,
  y: CONTENT_TOP + target.y * SCALE,
  w: target.w * SCALE,
  h: target.h * SCALE,
}));

export const AnnotateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const lineY = interpolate(frame, [24, 126], [150, 910], {...clamp, easing: Easing.linear});
  const lineOpacity = interpolate(frame, [18, 25, 128, 138], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 140, top: 52, zIndex: 20, display: 'flex', alignItems: 'baseline', gap: 28}}>
        <div style={{font: `400 76px/.95 ${FONTS.serif}`, letterSpacing: '-.03em'}}>Point. Highlight. <em style={{color: COLORS.orangeInk}}>Explain.</em></div>
        <div style={{font: `600 19px/1 ${FONTS.sans}`, letterSpacing: '.16em', color: '#77736c'}}>ANNOTATE IN CONTEXT</div>
      </div>
      <BrowserFrame src="captures/annotate-after.png" width={1600} height={954} style={{position: 'absolute', left: FRAME_LEFT, top: FRAME_TOP, opacity: enter, translate: `0 ${(1 - enter) * 28}px`}} />

      {targets.map((target, index) => {
        const trigger = 35 + index * 22;
        const progress = interpolate(frame, [trigger, trigger + 12], [0, 1], {...clamp, easing: Easing.bezier(0.34, 1.35, 0.44, 1)});
        const label = interpolate(frame, [trigger + 7, trigger + 18], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
        const arm = 20;
        const border = `3px solid ${index === 3 ? COLORS.orange : '#fff'}`;
        return (
          <React.Fragment key={target.name}>
            <div style={{position: 'absolute', left: target.x, top: target.y, width: target.w, height: target.h, scale: 1.75 - progress * 0.75, opacity: progress, zIndex: 12}}>
              <span style={{position: 'absolute', left: 0, top: 0, width: arm, height: arm, borderTop: border, borderLeft: border}} />
              <span style={{position: 'absolute', right: 0, top: 0, width: arm, height: arm, borderTop: border, borderRight: border}} />
              <span style={{position: 'absolute', left: 0, bottom: 0, width: arm, height: arm, borderBottom: border, borderLeft: border}} />
              <span style={{position: 'absolute', right: 0, bottom: 0, width: arm, height: arm, borderBottom: border, borderRight: border}} />
              <span style={{position: 'absolute', inset: 2, background: '#fff', opacity: interpolate(progress, [0, .55, 1], [0, .08, 0], clamp)}} />
            </div>
            <div style={{position: 'absolute', left: FRAME_LEFT + target.labelX * SCALE, top: target.y + 4, zIndex: 14, opacity: label, translate: `0 ${(1 - label) * 12}px`, padding: '8px 12px', borderRadius: 7, background: 'rgba(10,10,11,.88)', color: '#fff', font: `500 19px/1 ${FONTS.mono}`, letterSpacing: '.12em'}}>{target.name}</div>
          </React.Fragment>
        );
      })}
      <div style={{position: 'absolute', left: 160, right: 160, top: lineY, height: 3, zIndex: 18, opacity: lineOpacity, background: `linear-gradient(90deg, transparent, ${COLORS.orange} 8%, #fff 50%, ${COLORS.orange} 92%, transparent)`, boxShadow: `0 0 18px rgba(255,92,22,.55)`}} />
      <div style={{position: 'absolute', right: 160, bottom: 30, font: `500 17px/1 ${FONTS.mono}`, color: '#77736c', letterSpacing: '.1em'}}>ARROWS · SHAPES · HIGHLIGHTS · NOTES · STEPS</div>
    </AbsoluteFill>
  );
};

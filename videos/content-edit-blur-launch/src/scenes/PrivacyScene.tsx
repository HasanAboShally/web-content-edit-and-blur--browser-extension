import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {BrowserFrame} from '../components/BrowserFrame';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const dividerPosition = (frame: number) => {
  if (frame < 20) return 8;
  if (frame < 34) return interpolate(frame, [20, 34], [8, 78], {...clamp, easing: Easing.out(Easing.cubic)});
  if (frame < 48) return interpolate(frame, [34, 48], [78, 70], {...clamp, easing: Easing.inOut(Easing.cubic)});
  if (frame < 72) return 70;
  return interpolate(frame, [72, 136], [70, 46], {...clamp, easing: Easing.inOut(Easing.quad)});
};

export const PrivacyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const position = dividerPosition(frame);
  const velocity = Math.abs(dividerPosition(frame) - dividerPosition(frame - 1));
  const handleScale = 1 + Math.min(velocity / 8, 1) * 0.18;
  const enter = interpolate(frame, [0, 18], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const width = 1620;
  const height = 965;
  const contentHeight = height - 54;
  const dividerX = (position / 100) * width;

  return (
    <AbsoluteFill style={{background: COLORS.dark, color: COLORS.darkText, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 142, right: 142, top: 60, display: 'flex', justifyContent: 'space-between', zIndex: 20}}>
        <div><div style={{font: `600 20px/1 ${FONTS.sans}`, letterSpacing: '.16em', color: '#aaa7a0'}}>BLUR</div><div style={{marginTop: 11, font: `400 51px/1 ${FONTS.serif}`}}>De-emphasize distractions.</div></div>
        <div style={{textAlign: 'right'}}><div style={{font: `600 20px/1 ${FONTS.sans}`, letterSpacing: '.16em', color: COLORS.orange}}>REDACT</div><div style={{marginTop: 11, font: `400 51px/1 ${FONTS.serif}`}}>Replace sensitive pixels.</div></div>
      </div>

      <BrowserFrame src="captures/blur-after.png" width={width} height={height} accent style={{position: 'absolute', left: 150, top: 135, opacity: enter, translate: `0 ${(1 - enter) * 34}px`}}>
        <Img
          src={staticFile('captures/redact-after.png')}
          style={{position: 'absolute', inset: 0, width: '100%', height: contentHeight, objectFit: 'cover', objectPosition: 'top left', clipPath: `inset(0 ${100 - position}% 0 0)`}}
        />
        <div style={{position: 'absolute', left: dividerX - 3, top: 0, width: 6, height: contentHeight, background: '#fff', boxShadow: '0 0 18px rgba(0,0,0,.4)'}} />
        <div style={{position: 'absolute', left: dividerX - 43, top: 390, width: 86, height: 86, borderRadius: '50%', background: '#fff', border: `3px solid ${COLORS.orange}`, boxShadow: '0 12px 32px rgba(0,0,0,.32)', scale: `${handleScale} 1`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}>
          <span style={{width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderRight: `14px solid ${COLORS.ink}`}} />
          <span style={{width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: `14px solid ${COLORS.orange}`}} />
        </div>
      </BrowserFrame>
      <div style={{position: 'absolute', left: 156, bottom: 30, color: '#85827d', font: `500 17px/1 ${FONTS.mono}`, letterSpacing: '.1em'}}>SAME PAGE · TWO DIFFERENT JOBS</div>
    </AbsoluteFill>
  );
};

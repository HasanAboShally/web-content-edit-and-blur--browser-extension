import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {BrowserFrame} from '../components/BrowserFrame';
import {Cursor} from '../components/Cursor';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const EditScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 20], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const type = interpolate(frame, [46, 120], [0, 1], {...clamp, easing: Easing.linear});
  const focus = interpolate(frame, [118, 150], [0, 1], {...clamp, easing: Easing.bezier(0.35, 0, 0.2, 1)});
  const browserWidth = 1620;
  const contentHeight = 911;
  const revealRight = (1 - type) * 100;

  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 142, top: 74, zIndex: 20}}>
        <div style={{font: `600 21px/1 ${FONTS.sans}`, letterSpacing: '.16em', textTransform: 'uppercase', color: COLORS.orangeInk}}>Edit in place</div>
        <div style={{marginTop: 18, font: `400 78px/.98 ${FONTS.serif}`, letterSpacing: '-.03em'}}>Rewrite the copy. <em style={{color: COLORS.orangeInk}}>Keep the layout.</em></div>
      </div>
      <BrowserFrame
        src="captures/edit-before.png"
        width={browserWidth}
        height={965}
        style={{position: 'absolute', left: 150, top: 155, opacity: enter, translate: `0 ${(1 - enter) * 38}px`, scale: 1 + focus * 0.035, transformOrigin: '34% 18%'}}
      >
        <Img
          src={staticFile('captures/edit-after.png')}
          style={{position: 'absolute', inset: 0, width: '100%', height: contentHeight, objectFit: 'cover', objectPosition: 'top left', clipPath: `inset(0 ${revealRight}% 0 0)`}}
        />
        <div style={{position: 'absolute', left: 210, top: 69, height: 43, width: 592 * type, background: 'rgba(255,92,22,.12)', borderBottom: `4px solid ${COLORS.orange}`, opacity: frame < 132 ? 1 : 0}} />
        <div style={{position: 'absolute', left: 210 + 592 * type, top: 72, width: 3, height: 42, background: COLORS.orange, opacity: frame >= 42 && frame < 132 ? 1 : 0}} />
        <Cursor from={[1120, 620]} to={[780, 105]} start={16} end={42} clickAt={44} />
      </BrowserFrame>
      <div style={{position: 'absolute', right: 126, bottom: 45, font: `500 18px/1 ${FONTS.mono}`, color: '#7a756b', letterSpacing: '.12em'}}>ALT+R REPLACES EVERY MATCH</div>
    </AbsoluteFill>
  );
};

import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {BrowserFrame} from '../components/BrowserFrame';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const CAMERA = {x: 1538, y: 745};

export const CaptureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const ring1 = interpolate(frame, [16, 29], [0, 1], clamp);
  const ring2 = interpolate(frame, [25, 39], [0, 1], clamp);
  const iris = interpolate(frame, [48, 86], [0, 2100], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const settle = interpolate(frame, [88, 122], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const browserScale = 1 - settle * 0.28;
  const browserX = -settle * 250;
  const copyIn = interpolate(frame, [102, 126], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});

  return (
    <AbsoluteFill style={{background: COLORS.dark, color: COLORS.darkText, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 120, top: 48, zIndex: 20, font: `400 76px/.95 ${FONTS.serif}`, letterSpacing: '-.03em'}}>Capture a <em style={{color: COLORS.orange}}>clean PNG.</em></div>
      <BrowserFrame
        src="captures/annotate-after.png"
        width={1500}
        height={898}
        style={{position: 'absolute', left: 210, top: 130, scale: browserScale, translate: `${browserX}px 0`, transformOrigin: 'left center'}}
      >
        <Img src={staticFile('captures/final-clean.png')} style={{position: 'absolute', inset: 0, width: '100%', height: 844, objectFit: 'cover', objectPosition: 'top left', clipPath: `circle(${iris}px at ${CAMERA.x - 210}px ${CAMERA.y - 184}px)`}} />
      </BrowserFrame>

      {[ring1, ring2].map((progress, index) => (
        <div key={index} style={{position: 'absolute', left: CAMERA.x - 34, top: CAMERA.y - 34, width: 68, height: 68, borderRadius: '50%', border: `4px solid ${index ? '#fff' : COLORS.orange}`, opacity: 1 - progress, scale: 1 + progress * (index ? 2.4 : 1.65), zIndex: 30}} />
      ))}
      <div style={{position: 'absolute', left: CAMERA.x - 20, top: CAMERA.y - 18, width: 40, height: 36, border: '4px solid #fff', borderRadius: 8, opacity: frame < 74 ? 1 : 0, zIndex: 30}}>
        <span style={{position: 'absolute', left: 10, top: 8, width: 12, height: 12, border: `3px solid ${COLORS.orange}`, borderRadius: '50%'}} />
      </div>

      <div style={{position: 'absolute', right: 112, top: 305, width: 570, opacity: copyIn, translate: `${(1 - copyIn) * 50}px 0`}}>
        <div style={{font: `400 78px/.98 ${FONTS.serif}`, letterSpacing: '-.03em'}}>Private by <em style={{color: COLORS.orange, fontStyle: 'italic'}}>design.</em></div>
        {['No account.', 'No tracking.', 'No backend.'].map((line, index) => (
          <div key={line} style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 28, opacity: interpolate(frame, [116 + index * 9, 128 + index * 9], [0, 1], clamp), font: `600 37px/1.1 ${FONTS.sans}`}}>
            <span style={{width: 12, height: 12, borderRadius: '50%', background: index === 2 ? COLORS.orange : '#fff'}} />{line}
          </div>
        ))}
        <div style={{marginTop: 42, color: '#aaa7a0', font: `400 32px/1.4 ${FONTS.sans}`}}>The extension does not transmit page content.</div>
      </div>
    </AbsoluteFill>
  );
};

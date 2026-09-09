import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../theme';
import {EnterText, Eyebrow} from '../components/SceneText';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const TOOLBAR_W = 288;
const TOOLBAR_H = 863;

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const pageIn = interpolate(frame, [0, 22], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const push = interpolate(frame, [20, 48], [0, 1], {...clamp, easing: Easing.bezier(0.35, 0, 0.2, 1)});
  const rise = interpolate(frame, [38, 58], [0, 1], {...clamp, easing: Easing.bezier(0.2, 1.22, 0.3, 1)});
  const reseat = interpolate(frame, [132, 154], [0, 1], {...clamp, easing: Easing.bezier(0.4, 0, 0.3, 1)});
  const lift = rise * (1 - reseat);
  const toolbarScale = 0.91 + push * 0.14;
  const beam1 = interpolate(frame, [68, 88], [0, 1], clamp);
  const beam2 = interpolate(frame, [98, 126], [0, 1], clamp);
  const beamOpacity = frame <= 90 ? interpolate(frame, [65, 70, 90], [0, 1, 0], clamp) : interpolate(frame, [95, 100, 128], [0, 0.65, 0], clamp);
  const spotX = interpolate(frame, [0, 18, 34], [22, 72, 76], {...clamp, easing: Easing.bezier(0.4, 0, 0.3, 1)});

  return (
    <AbsoluteFill style={{background: COLORS.dark, color: COLORS.darkText, overflow: 'hidden'}}>
      <AbsoluteFill style={{opacity: 0.22 * pageIn, scale: 1 + push * 0.04, filter: 'grayscale(.35) contrast(.92)'}}>
        <Img src={staticFile('captures/base.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(760px 720px at ${spotX}% 47%, rgba(255,112,55,.18), rgba(255,92,22,.04) 45%, rgba(10,10,11,.86) 76%)`}} />

      <div style={{position: 'absolute', left: 132, top: 170, width: 650, zIndex: 5}}>
        <EnterText from={18} duration={22}><Eyebrow dark>Meet the toolbar</Eyebrow></EnterText>
        <EnterText from={28} duration={24} style={{marginTop: 30, font: `400 116px/.92 ${FONTS.serif}`, letterSpacing: '-.035em'}}>
          The page becomes <em style={{color: COLORS.orange, fontStyle: 'italic'}}>your canvas.</em>
        </EnterText>
        <EnterText from={58} duration={18} style={{marginTop: 38, width: 560, color: '#aaa7a0', font: `400 38px/1.34 ${FONTS.sans}`}}>
          One focused workspace for editing, privacy, annotation, and capture.
        </EnterText>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 230,
          top: 88,
          width: TOOLBAR_W,
          height: TOOLBAR_H,
          borderRadius: 18,
          transformOrigin: 'center center',
          transform: `perspective(1400px) rotateY(${-10 + push * 7}deg) rotateX(${2 - push * 1.5}deg) translateY(${-lift * 52}px) translateZ(${lift * 90}px) scale(${toolbarScale})`,
          boxShadow: `0 ${20 + lift * 42}px ${42 + lift * 72}px rgba(0,0,0,${0.36 + lift * 0.22})`,
          opacity: pageIn,
          zIndex: 8,
        }}
      >
        <Img src={staticFile('captures/toolbar.png')} style={{width: '100%', height: '100%', borderRadius: 18, display: 'block'}} />
        <svg width={TOOLBAR_W + 20} height={TOOLBAR_H + 20} viewBox={`0 0 ${TOOLBAR_W + 20} ${TOOLBAR_H + 20}`} style={{position: 'absolute', left: -10, top: -10, overflow: 'visible', opacity: beamOpacity, filter: 'drop-shadow(0 0 8px rgba(255,92,22,.9))'}}>
          <rect x="8" y="8" width={TOOLBAR_W + 4} height={TOOLBAR_H + 4} rx="22" fill="none" stroke={COLORS.orange} strokeWidth="5" pathLength="1" strokeDasharray=".18 1" strokeLinecap="round" strokeDashoffset={-(frame < 95 ? beam1 : beam2)} />
          <rect x="8" y="8" width={TOOLBAR_W + 4} height={TOOLBAR_H + 4} rx="22" fill="none" stroke="#fff4ea" strokeWidth="2" pathLength="1" strokeDasharray=".18 1" strokeLinecap="round" strokeDashoffset={-(frame < 95 ? beam1 : beam2)} />
        </svg>
      </div>
      <div style={{position: 'absolute', right: 124, bottom: 64, color: '#77746f', font: `500 18px/1 ${FONTS.mono}`, letterSpacing: '.14em'}}>REAL PRODUCT UI</div>
    </AbsoluteFill>
  );
};

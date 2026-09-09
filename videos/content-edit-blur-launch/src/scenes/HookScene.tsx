import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const WORDS = ['Take', 'the', 'screenshot.'];

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const vertical = interpolate(frame, [0, 12], [100, 0], {...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1)});
  const horizontal = interpolate(frame, [9, 22], [100, 0], {...clamp, easing: Easing.linear});
  const crossOpacity = interpolate(frame, [28, 40], [1, 0], clamp);
  const secondLine = interpolate(frame, [40, 55], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const cover = interpolate(frame, [56, 72], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const edge = interpolate(frame, [70, 80], [0, 1], clamp);

  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, padding: '0 150px', justifyContent: 'center'}}>
      <svg width="58" height="58" viewBox="0 0 58 58" style={{position: 'absolute', left: 154, top: 112, opacity: crossOpacity}}>
        <line x1="29" y1="2" x2="29" y2="56" pathLength="100" stroke={COLORS.orange} strokeWidth="5" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={vertical} />
        <line x1="2" y1="29" x2="56" y2="29" pathLength="100" stroke={COLORS.orange} strokeWidth="5" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={horizontal} />
      </svg>
      <div style={{marginTop: 12}}>
        <div style={{display: 'flex', gap: 30, font: `400 148px/.93 ${FONTS.serif}`, letterSpacing: '-.035em'}}>
          {WORDS.map((word, index) => {
            const start = 12 + index * 8;
            const progress = interpolate(frame, [start, start + 16], [0, 1], {...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1)});
            return <span key={word} style={{opacity: progress, scale: 1.25 - progress * 0.25, filter: `blur(${(1 - progress) * 8}px)`}}>{word}</span>;
          })}
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 26, marginTop: 20, font: `400 148px/.93 ${FONTS.serif}`, letterSpacing: '-.035em', opacity: secondLine, translate: `0 ${(1 - secondLine) * 34}px`}}>
          <span>Leave the</span>
          <span style={{position: 'relative', display: 'inline-block', minWidth: 530, color: COLORS.orangeInk, fontStyle: 'italic'}}>
            secrets.
            <span style={{position: 'absolute', left: -12, top: 12, width: `${cover * 108}%`, height: 124, borderRadius: 5, background: COLORS.ink, boxShadow: edge ? `inset 0 -${Math.round(edge * 7)}px ${COLORS.orange}` : 'none'}} />
          </span>
        </div>
      </div>
      <div style={{position: 'absolute', left: 158, bottom: 92, font: `600 23px/1 ${FONTS.sans}`, letterSpacing: '.18em', color: '#6e6b65', textTransform: 'uppercase'}}>
        Edit · Blur · Redact · Annotate · Capture
      </div>
    </AbsoluteFill>
  );
};

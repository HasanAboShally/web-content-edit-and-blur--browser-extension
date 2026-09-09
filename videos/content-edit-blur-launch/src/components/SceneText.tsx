import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const Eyebrow: React.FC<{children: React.ReactNode; dark?: boolean}> = ({children, dark = false}) => (
  <div style={{font: `600 22px/1 ${FONTS.sans}`, letterSpacing: '.16em', textTransform: 'uppercase', color: dark ? '#aaa7a0' : COLORS.muted}}>
    {children}
  </div>
);

export const EnterText: React.FC<{
  children: React.ReactNode;
  from?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({children, from = 0, duration = 18, style}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + duration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <div style={{opacity: progress, translate: `0 ${(1 - progress) * 34}px`, filter: `blur(${(1 - progress) * 8}px)`, ...style}}>
      {children}
    </div>
  );
};

export const CaptionBand: React.FC<{children: React.ReactNode; dark?: boolean}> = ({children, dark = false}) => (
  <div
    style={{
      position: 'absolute',
      left: 120,
      right: 120,
      bottom: 72,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        maxWidth: 1500,
        padding: '18px 28px 20px',
        borderRadius: 14,
        background: dark ? 'rgba(10,10,11,.88)' : 'rgba(247,245,240,.92)',
        boxShadow: '0 18px 45px rgba(0,0,0,.16)',
        color: dark ? COLORS.darkText : COLORS.ink,
        font: `600 62px/1.1 ${FONTS.sans}`,
        letterSpacing: '-.025em',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  </div>
);

import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {COLORS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const Cursor: React.FC<{from: [number, number]; to: [number, number]; start: number; end: number; clickAt?: number}> = ({from, to, start, end, clickAt}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [start, end], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const x = from[0] + (to[0] - from[0]) * progress;
  const y = from[1] + (to[1] - from[1]) * progress;
  const click = clickAt === undefined ? 0 : interpolate(frame, [clickAt - 2, clickAt, clickAt + 8], [0, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: x, top: y, zIndex: 30, pointerEvents: 'none'}}>
      {click > 0 ? <div style={{position: 'absolute', left: -25, top: -25, width: 50, height: 50, borderRadius: '50%', border: `4px solid ${COLORS.orange}`, scale: 1 + click * 1.8, opacity: 1 - click}} /> : null}
      <svg width="38" height="52" viewBox="0 0 38 52" style={{filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.28))'}}>
        <path d="M4 3v38l10-9 7 16 7-3-7-16h13z" fill="#fff" stroke="#17171a" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {COLORS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const RedactionCut: React.FC<{direction?: 'left' | 'right'}> = ({direction = 'left'}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 6], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const exit = interpolate(frame, [9, 15], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  const width = enter * (1 - exit) * 112;
  const x = direction === 'left' ? -4 : 104 - width;
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: 0,
          width: `${width}%`,
          height: '100%',
          background: COLORS.ink,
          boxShadow: direction === 'left' ? `inset -8px 0 ${COLORS.orange}` : `inset 8px 0 ${COLORS.orange}`,
        }}
      />
    </div>
  );
};

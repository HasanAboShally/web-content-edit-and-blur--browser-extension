import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const words = [
  {text: 'De-emphasize'}, {text: 'noise.'}, {text: 'Redact'}, {text: 'what’s'}, {text: 'private.', accent: true},
];

export const PrivacyTitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const underline = interpolate(frame, [22, 45], [0, 1], {...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1)});
  const fade = interpolate(frame, [51, 59], [1, 0], clamp);
  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, justifyContent: 'center', alignItems: 'center', opacity: fade}}>
      <div style={{maxWidth: 1640, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 28, rowGap: 5, font: `400 106px/1.05 ${FONTS.serif}`, letterSpacing: '-.025em'}}>
        {words.map((word, index) => {
          const start = 2 + index * 5;
          const progress = interpolate(frame, [start, start + 11], [0, 1], {...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1)});
          return <span key={`${word.text}-${index}`} style={{opacity: progress, scale: 1.28 - progress * 0.28, filter: `blur(${(1 - progress) * 7}px)`, color: word.accent ? COLORS.orangeInk : undefined, fontStyle: word.accent ? 'italic' : 'normal'}}>{word.text}</span>;
        })}
      </div>
      <div style={{width: 260, height: 7, marginTop: 42, borderRadius: 4, background: COLORS.orange, scale: `${underline} 1`}} />
    </AbsoluteFill>
  );
};

import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {COLORS, FONTS} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const WORDMARK = 'Content Edit & Blur'.split('');
const cards = [
  {src: 'captures/edit-after.png', x: 85, y: 70, dx: -620, dy: -260, rotate: -5, cue: 4},
  {src: 'captures/blur-after.png', x: 1305, y: 72, dx: 620, dy: -260, rotate: 4, cue: 12},
  {src: 'captures/annotate-after.png', x: 95, y: 730, dx: -620, dy: 280, rotate: 4, cue: 20},
  {src: 'captures/final-clean.png', x: 1295, y: 730, dx: 620, dy: 280, rotate: -4, cue: 28},
] as const;
const dust = Array.from({length: 18}, (_, index) => ({
  x: (index * 431 + 120) % 1920,
  y: (index * 607 + 180) % 1080,
  size: 2 + (index % 3),
  speed: .32 + (index % 4) * .1,
  sway: 8 + (index % 5) * 3,
  phase: index * .71,
}));

export const FinaleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const motionFrame = Math.min(frame, 258);
  const recede = interpolate(frame, [88, 112], [0, 1], {...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1)});
  const icon = interpolate(frame, [94, 122], [0, 1], {...clamp, easing: Easing.bezier(0.34, 1.25, 0.44, 1)});
  const underline = interpolate(frame, [170, 202], [0, 1], {...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1)});
  const stores = interpolate(frame, [198, 228], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  const stage = interpolate(frame, [96, 132, 174], [0, .72, .34], clamp);

  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `radial-gradient(850px 560px at 50% 46%, rgba(255,92,22,${stage * .23}), transparent 70%)`}} />
      {cards.map((card) => {
        const progress = interpolate(frame, [card.cue, card.cue + 22], [0, 1], {...clamp, easing: Easing.bezier(0.34, 1.38, 0.44, 1)});
        return (
          <div key={card.src} style={{position: 'absolute', left: card.x, top: card.y, width: 530, height: 298, borderRadius: 18, overflow: 'hidden', border: `1px solid ${COLORS.line}`, opacity: progress * (1 - recede * .32), translate: `${card.dx * (1 - progress)}px ${card.dy * (1 - progress)}px`, rotate: `${card.rotate * (2 - progress)}deg`, scale: .88 + progress * .12, boxShadow: '0 24px 65px rgba(42,31,18,.18)'}}>
            <Img src={staticFile(card.src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left'}} />
          </div>
        );
      })}

      {dust.map((particle, index) => {
        const y = ((particle.y - motionFrame * particle.speed) % 1080 + 1080) % 1080;
        const x = particle.x + Math.sin(motionFrame * .025 + particle.phase) * particle.sway;
        return <span key={index} style={{position: 'absolute', left: x, top: y, width: particle.size, height: particle.size, borderRadius: '50%', background: COLORS.orange, opacity: .16 + (index % 4) * .05}} />;
      })}

      <div style={{position: 'absolute', left: '50%', top: 162, translate: '-50% 0', opacity: icon, scale: .75 + icon * .25, textAlign: 'center'}}>
        <Img src={staticFile('images/app-icon-128.png')} style={{width: 154, height: 154, borderRadius: 34, boxShadow: '0 28px 62px rgba(255,92,22,.22)'}} />
      </div>
      <div style={{position: 'absolute', left: '50%', top: 350, translate: '-50% 0', width: 1180, textAlign: 'center'}}>
        <div style={{display: 'flex', justifyContent: 'center', font: `400 116px/.95 ${FONTS.serif}`, letterSpacing: '-.035em', whiteSpace: 'pre'}}>
          {WORDMARK.map((character, index) => {
            const start = 116 + index * 2;
            const progress = interpolate(frame, [start, start + 14], [0, 1], {...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1)});
            return <span key={index} style={{opacity: progress, translate: `0 ${(1 - progress) * 32}px`, scale: 1.28 - progress * .28, filter: `blur(${(1 - progress) * 8}px)`}}>{character}</span>;
          })}
        </div>
        <div style={{width: 300, height: 7, margin: '34px auto 0', borderRadius: 4, background: COLORS.orange, scale: `${underline} 1`}} />
        <div style={{marginTop: 31, opacity: stores, font: `600 32px/1 ${FONTS.sans}`, letterSpacing: '.07em', textTransform: 'uppercase', color: '#625f58'}}>Free · Open source · No account</div>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22, marginTop: 36, opacity: stores, translate: `0 ${(1 - stores) * 20}px`}}>
          {[['chrome.png', 'Chrome'], ['firefox.png', 'Firefox'], ['edge.png', 'Edge']].map(([src, label]) => (
            <div key={src} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: `1px solid ${COLORS.line}`, borderRadius: 10, background: 'rgba(255,254,251,.92)', font: `600 19px/1 ${FONTS.sans}`}}>
              <Img src={staticFile(`images/${src}`)} style={{width: 30, height: 30, objectFit: 'contain'}} />{label}
            </div>
          ))}
          <div style={{marginLeft: 12, padding: '15px 26px', borderRadius: 10, background: COLORS.ink, color: COLORS.paper, font: `600 20px/1 ${FONTS.sans}`}}>Install free</div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: COLORS.orange}} />
    </AbsoluteFill>
  );
};

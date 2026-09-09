import React from 'react';
import {Img, staticFile} from 'remotion';
import {COLORS, FONTS} from '../theme';

export type BrowserFrameProps = {
  src: string;
  width?: number;
  height?: number;
  url?: string;
  accent?: boolean;
  style?: React.CSSProperties;
  imageStyle?: React.CSSProperties;
  children?: React.ReactNode;
};

export const BrowserFrame: React.FC<BrowserFrameProps> = ({
  src,
  width = 1440,
  height = 850,
  url = 'app.northstar.example/overview',
  accent = false,
  style,
  imageStyle,
  children,
}) => (
  <div
    style={{
      width,
      height,
      overflow: 'hidden',
      borderRadius: 24,
      border: `1px solid ${accent ? 'rgba(255,92,22,.7)' : COLORS.line}`,
      background: COLORS.surface,
      boxShadow: '0 44px 100px -48px rgba(29,22,15,.55), 0 12px 32px rgba(29,22,15,.12)',
      ...style,
    }}
  >
    <div
      style={{
        height: 54,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
        borderBottom: `1px solid ${COLORS.line}`,
        background: '#efece5',
      }}
    >
      {[0, 1, 2].map((value) => (
        <span key={value} style={{width: 10, height: 10, borderRadius: '50%', background: value === 0 ? COLORS.orange : '#c8c1b3'}} />
      ))}
      <div
        style={{
          height: 28,
          flex: 1,
          marginLeft: 8,
          padding: '0 13px',
          border: '1px solid #d9d3c8',
          borderRadius: 8,
          background: '#fff',
          color: '#7a756b',
          font: `500 13px/26px ${FONTS.mono}`,
        }}
      >
        {url}
      </div>
    </div>
    <div style={{position: 'relative', height: height - 54, overflow: 'hidden'}}>
      <Img
        src={staticFile(src)}
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left', display: 'block', ...imageStyle}}
      />
      {children}
    </div>
  </div>
);

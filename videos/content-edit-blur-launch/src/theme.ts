export const COLORS = {
  paper: '#f7f5f0',
  surface: '#fffefb',
  ink: '#17171a',
  muted: '#5f5e58',
  orange: '#ff5c16',
  orangeInk: '#c2410c',
  dark: '#0a0a0b',
  darkText: '#ece9e2',
  blue: '#2563eb',
  line: '#d8d1c4',
} as const;

export const FONTS = {
  serif: 'CEB Instrument Serif, Georgia, serif',
  sans: 'CEB Instrument Sans, -apple-system, BlinkMacSystemFont, sans-serif',
  mono: 'CEB JetBrains Mono, ui-monospace, monospace',
} as const;

export const EASE = {
  enter: [0.16, 1, 0.3, 1] as const,
  settle: [0.34, 1.2, 0.44, 1] as const,
  cinematic: [0.4, 0, 0.2, 1] as const,
} as const;

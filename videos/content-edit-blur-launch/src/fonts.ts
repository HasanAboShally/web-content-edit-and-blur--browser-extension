import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

void Promise.all([
  loadFont({family: 'CEB Instrument Serif', url: staticFile('fonts/instrument-serif-400.woff2'), weight: '400'}),
  loadFont({family: 'CEB Instrument Serif', url: staticFile('fonts/instrument-serif-400i.woff2'), weight: '400', style: 'italic'}),
  loadFont({family: 'CEB Instrument Sans', url: staticFile('fonts/instrument-sans-400.woff2'), weight: '400'}),
  loadFont({family: 'CEB Instrument Sans', url: staticFile('fonts/instrument-sans-500.woff2'), weight: '500'}),
  loadFont({family: 'CEB Instrument Sans', url: staticFile('fonts/instrument-sans-600.woff2'), weight: '600'}),
  loadFont({family: 'CEB JetBrains Mono', url: staticFile('fonts/jetbrains-mono-400.woff2'), weight: '400'}),
  loadFont({family: 'CEB JetBrains Mono', url: staticFile('fonts/jetbrains-mono-500.woff2'), weight: '500'}),
]);

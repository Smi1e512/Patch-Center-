import type { CSSProperties } from 'react';

const paths = {
  logo: 'M8 6 2 12l6 6m8-12 6 6-6 6M14 3l-4 18',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  file: 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z M13 3v7h7 M9 13l-2 2 2 2m6-4 2 2-2 2',
  shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z M9 12l2 2 4-4',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  logout: 'M10 17l5-5-5-5m5 5H3m12-8h5v16h-5',
  chevron: 'm9 18 6-6-6-6',
  close: 'm6 6 12 12M18 6 6 18',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 11v6m0-10h.01',
} as const;

export default function Icon({ name, size = 18, style }: {
  name: keyof typeof paths; size?: number; style?: CSSProperties;
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    style={style} aria-hidden="true"><path d={paths[name]} /></svg>;
}

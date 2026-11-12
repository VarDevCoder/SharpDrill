const paths = {
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3Z',
  book: 'M12 5v16M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z',
  repeat: 'M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4-4m-4 4 4 4',
  timer: 'M10 2h4m-2 0v3m6 2 2-2M12 9v5l3 2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 11v2m-1-1h2',
  exam: 'M9 4H5v18h14V4h-4M9 2h6v4H9ZM8 11h8m-8 4h8m-8 4h4',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  chart: 'M3 3v18h18M7 16v-5m5 5V7m5 9V4',
  cards: 'M8 3h13v13M3 8h13v13H3Z',
  settings: 'M4 7h3m6 0h7M4 17h7m6 0h3M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm4 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  check: 'm5 12 4 4L19 6',
  briefcase: 'M3 7h18v13H3ZM9 7V4h6v3M3 13h18',
  close: 'm6 6 12 12M6 18 18 6',
  warning: 'm12 3 10 18H2ZM12 9v5m0 3v.1',
  question: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1',
  activity: 'M2 12h5l3-8 4 16 3-8h5',
  arrowLeft: 'M20 12H4m6-6-6 6 6 6',
  arrowRight: 'M4 12h16m-6-6 6 6-6 6',
  database: 'M21 5c0 2-4 3-9 3S3 7 3 5s4-3 9-3 9 1 9 3ZM3 5v14c0 2 4 3 9 3s9-1 9-3V5M3 12c0 2 4 3 9 3s9-1 9-3',
  layers: 'm12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5',
  network: 'M9 2h6v6H9ZM2 16h6v6H2Zm14 0h6v6h-6ZM12 8v4M5 16v-4h14v4',
  language: 'M2 5h12M8 2v3m3 0c0 6-4 10-9 12M5 8c1 4 4 7 8 9m0 5 5-13 5 13m-8-4h6',
} as const;

export type IconName = keyof typeof paths;

export const TRACK_ICON: Record<string, IconName> = {
  'csharp-basics': 'book',
  csharp: 'code', db: 'database', react: 'layers', api: 'network', english: 'language',
};

/** Decorative icons inherit text color; the surrounding control supplies its label. */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

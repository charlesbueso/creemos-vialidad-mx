const base = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icono = {
  play: () => (
    <svg {...base} aria-hidden="true">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  pausa: () => (
    <svg {...base} aria-hidden="true">
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
  lapiz: () => (
    <svg {...base} aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  ),
  avion: () => (
    <svg {...base} aria-hidden="true">
      <path d="M2.5 13.5 21 4l-5 17-4-7-9.5-.5z" />
    </svg>
  ),
  ojo: () => (
    <svg {...base} aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  bajar: () => (
    <svg {...base} aria-hidden="true">
      <path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" />
    </svg>
  ),
  subir: () => (
    <svg {...base} aria-hidden="true">
      <path d="M12 20V8m0 0-5 5m5-5 5 5M5 4h14" />
    </svg>
  ),
  copiar: () => (
    <svg {...base} aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  basura: () => (
    <svg {...base} aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  mas: () => (
    <svg {...base} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  error: () => (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--status-error)" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#15181d" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  aviso: () => (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 23 21.5H1z" fill="var(--status-warn)" />
      <path d="M12 9v6M12 18.2v.1" stroke="#15181d" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  info: () => (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--status-info)" strokeWidth="2" />
      <path d="M12 11v6M12 7.5v.1" stroke="var(--status-info)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
};

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1c2027" />
      <path d="M8 42 Q32 12 56 42" stroke="#3987e5" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M18 34v16M32 27v23M46 34v16" stroke="#c3c2b7" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M8 50h48" stroke="#8e9099" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

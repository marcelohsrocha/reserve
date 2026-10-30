/** Ícones de traço fino (estilo do layout de referência), sem dependências. */
type P = { className?: string };
const base = (className = 'h-4 w-4') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconeCalendario = ({ className }: P) => (
  <svg {...base(className)}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IconeRelogio = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconePessoa = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></svg>
);
export const IconeLocal = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
);
export const IconeCheck = ({ className }: P) => (
  <svg {...base(className)}><path d="m6 12.5 4 4 8-9" /></svg>
);
export const IconeVoltar = ({ className }: P) => (
  <svg {...base(className)}><path d="M15 5 8 12l7 7" /></svg>
);
export const IconeAvancar = ({ className }: P) => (
  <svg {...base(className)}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconeMais = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconeAjustes = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 4v6M5 14v6M12 4v10M12 18v2M19 4v4M19 12v8" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="16" r="2" /><circle cx="19" cy="10" r="2" /></svg>
);
export const IconeAlerta = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg>
);

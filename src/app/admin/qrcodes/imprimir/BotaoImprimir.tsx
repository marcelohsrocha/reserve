'use client';

export function BotaoImprimir() {
  return (
    <button className="btn-primario" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}

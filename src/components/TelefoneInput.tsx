'use client';
import { useState } from 'react';

/** Máscara (99) 99999-9999 (aceita também fixo com 8 dígitos). */
export function mascarar(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function TelefoneInput({ name = 'telefone', defaultValue = '' }: { name?: string; defaultValue?: string }) {
  const [valor, setValor] = useState(mascarar(defaultValue));
  return (
    <input
      name={name}
      type="tel"
      inputMode="numeric"
      autoComplete="off"
      required
      placeholder="(67) 99999-9999"
      pattern="\(\d{2}\) \d{4,5}-\d{4}"
      title="Formato (99) 99999-9999"
      className="campo"
      value={valor}
      onChange={(e) => setValor(mascarar(e.target.value))}
    />
  );
}

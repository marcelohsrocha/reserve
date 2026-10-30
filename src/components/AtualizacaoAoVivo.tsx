'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Recarrega os dados da página (server components) sempre que chega um evento SSE. */
export function AtualizacaoAoVivo() {
  const router = useRouter();
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource('/api/stream');
    es.addEventListener('atualizacao', () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => router.refresh(), 400);
    });
    return () => {
      es.close();
      if (espera) clearTimeout(espera);
    };
  }, [router]);
  return null;
}

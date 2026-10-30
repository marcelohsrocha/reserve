'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Busca `url` e refaz a busca a cada atualização recebida por SSE (/api/stream),
 * com reconexão automática e uma busca de segurança a cada 60 s.
 */
export function useAoVivo<T>(url: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [conectado, setConectado] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) setDados(await r.json());
    } catch {
      // rede instável: a próxima atualização tenta de novo
    }
  }, [url]);

  useEffect(() => {
    carregar();
    const es = new EventSource('/api/stream');
    es.onopen = () => {
      setConectado(true);
      carregar();
    };
    es.onerror = () => setConectado(false);
    es.addEventListener('atualizacao', () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(carregar, 250);
    });
    const seguranca = setInterval(carregar, 60_000);
    return () => {
      es.close();
      clearInterval(seguranca);
    };
  }, [carregar]);

  return { dados, conectado, recarregar: carregar };
}

/** Relógio que atualiza a cada `ms`. */
export function useAgora(ms = 1000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setAgora(new Date()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return agora;
}

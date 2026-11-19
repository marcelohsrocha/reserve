import type { Conflito } from '@/domain/conflito';
import { dataBR, horaLocal } from '@/lib/tempo';

/** Erro de regra de negócio, com mensagem pronta para o usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string, public detalhes?: unknown) {
    super(mensagem);
  }
}

export class ErroConflito extends ErroNegocio {
  constructor(public conflitos: Conflito[]) {
    super(`A sala já está ocupada em ${conflitos.length} horário(s).`, conflitos.map((c) => descreverConflito(c)));
  }
}

/**
 * Texto do conflito. `comTitulo: false` (membros) omite o título da reserva de outra pessoa;
 * o motivo de um bloqueio continua aparecendo, porque não é dado pessoal.
 */
export function descreverConflito(c: Conflito, comTitulo = true): string {
  const quando = `${dataBR(c.pedido.inicio)} ${horaLocal(c.pedido.inicio)}–${horaLocal(c.pedido.fim)}`;
  const faixa = `${horaLocal(c.com.inicio)}–${horaLocal(c.com.fim)}`;
  if (c.com.origem === 'bloqueio') return `${quando}: conflita com bloqueio "${c.com.titulo}" (${faixa})`;
  return comTitulo ? `${quando}: conflita com reserva "${c.com.titulo}" (${faixa})` : `${quando}: sala já reservada das ${faixa.replace('–', ' às ')}`;
}

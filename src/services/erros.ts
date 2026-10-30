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
    super(`A sala já está ocupada em ${conflitos.length} horário(s).`, conflitos.map(descreverConflito));
  }
}

export function descreverConflito(c: Conflito): string {
  const origem = c.com.origem === 'bloqueio' ? 'bloqueio' : c.com.origem === 'google' ? 'evento do Google' : 'reserva';
  return `${dataBR(c.pedido.inicio)} ${horaLocal(c.pedido.inicio)}–${horaLocal(c.pedido.fim)}: conflita com ${origem} "${c.com.titulo}" (${horaLocal(c.com.inicio)}–${horaLocal(c.com.fim)})`;
}

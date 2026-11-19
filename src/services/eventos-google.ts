import type { Bloqueio, Ocorrencia, Pessoa, Reserva, Sala } from '@prisma/client';
import type { DadosEvento } from '@/integrations/google';
import { tituloPadronizado } from '@/domain/prefixo';
import { locationSala } from '@/domain/sala';
import { mascararTelefone } from '@/lib/telefone';

/** Monta o evento do Google para uma ocorrência de reserva. */
export function eventoDaOcorrencia(
  sala: Sala,
  reserva: Reserva & { pessoa: Pessoa },
  o: Pick<Ocorrencia, 'id' | 'inicioUtc' | 'fimUtc'>,
  colorId: string,
): DadosEvento {
  return {
    titulo: tituloPadronizado(sala.numero, reserva.titulo),
    inicio: o.inicioUtc,
    fim: o.fimUtc,
    location: locationSala(sala),
    colorId,
    descricao: `Responsável: ${reserva.pessoa.nome}${reserva.pessoa.telefoneE164 ? ` – ${mascararTelefone(reserva.pessoa.telefoneE164)}` : ''}\nReserva feita pelo Sistema de Reservas – IPI Dourados.`,
    privado: { salaNumero: String(sala.numero), reservaId: reserva.id, ocorrenciaId: o.id, tipo: 'reserva' },
  };
}

export function eventoDoBloqueio(sala: Sala, b: Bloqueio, colorId: string): DadosEvento {
  return {
    titulo: tituloPadronizado(sala.numero, `BLOQUEADA – ${b.motivo}`),
    inicio: b.inicioUtc,
    fim: b.fimUtc,
    location: locationSala(sala),
    colorId,
    descricao: `Sala bloqueada: ${b.motivo}\nBloqueio feito pelo Sistema de Reservas – IPI Dourados.`,
    privado: { salaNumero: String(sala.numero), bloqueioId: b.id, tipo: 'bloqueio' },
  };
}


/** Evento para o próprio usuário adicionar à agenda dele (link do Google ou .ics). */
export function eventoParaAgendaPessoal(sala: Sala, reserva: Reserva, o: Pick<Ocorrencia, 'id' | 'inicioUtc' | 'fimUtc'>) {
  return {
    uid: o.id,
    titulo: tituloPadronizado(sala.numero, reserva.titulo),
    inicio: o.inicioUtc,
    fim: o.fimUtc,
    local: `${locationSala(sala)} – IPI Dourados`,
    detalhes:
      'Sua reserva de sala na IPI Dourados.\n' +
      'Ao chegar, leia o QR Code da porta e confirme a presença ' +
      '(sem confirmação logo após o início, a sala volta a ficar livre).\n' +
      'Alterações e cancelamentos são feitos no Sistema de Reservas; este evento é só um lembrete.',
  };
}

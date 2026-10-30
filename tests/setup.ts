import { beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { limparTentativas } from '@/lib/limite-taxa';

beforeEach(async () => {
  await db.$transaction([
    db.auditoria.deleteMany(),
    db.eventoGoogle.deleteMany(),
    db.ocorrencia.deleteMany(),
    db.reserva.deleteMany(),
    db.bloqueio.deleteMany(),
    db.pessoa.deleteMany(),
    db.sala.deleteMany(),
    db.numeroSalaUsado.deleteMany(),
    db.corAndar.deleteMany(),
    db.configuracao.deleteMany(),
  ]);
  agendaFalsa().reiniciar();
  limparTentativas();
});

import type { EstadoSala } from '@/domain/painel';
import { ROTULO_STATUS, type StatusOcorrencia } from '@/domain/status';

const SALA: Record<EstadoSala, { rotulo: string; cls: string; ponto: string }> = {
  LIVRE: { rotulo: 'Livre', cls: 'bg-igreja-claro text-igreja', ponto: 'bg-igreja-vivo' },
  RESERVADA: { rotulo: 'Aguardando check-in', cls: 'bg-amber-50 text-amber-700', ponto: 'bg-amber-400' },
  OCUPADA: { rotulo: 'Ocupada', cls: 'bg-red-50 text-red-700', ponto: 'bg-red-500' },
  BLOQUEADA: { rotulo: 'Bloqueada', cls: 'bg-slate-100 text-slate-600', ponto: 'bg-slate-400' },
};

export function StatusSala({ estado }: { estado: EstadoSala }) {
  const s = SALA[estado];
  return (
    <span className={`etiqueta ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.ponto}`} />
      {s.rotulo}
    </span>
  );
}

const OCORRENCIA: Record<string, string> = {
  AGENDADA: 'bg-sky-50 text-sky-700',
  EM_ANDAMENTO: 'bg-amber-50 text-amber-700',
  CONFIRMADA: 'bg-igreja-claro text-igreja',
  FINALIZADA: 'bg-slate-100 text-slate-500',
  CANCELADA: 'bg-slate-100 text-slate-400',
  NAO_COMPARECEU: 'bg-orange-50 text-orange-700',
};

export function StatusOcorrenciaPill({ status }: { status: string }) {
  return <span className={`etiqueta ${OCORRENCIA[status] ?? 'bg-slate-100'}`}>{ROTULO_STATUS[status as StatusOcorrencia] ?? status}</span>;
}

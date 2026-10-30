import { db } from '@/lib/db';
import { dataHoraBR, horaLocal } from '@/lib/tempo';
import { codigoSala, rotuloSala } from '@/domain/sala';
import { FormAcao } from '@/components/FormAcao';
import { acaoIgnorarEvento, acaoVincularEvento } from '../acoes';

export default async function NaoIdentificados() {
  const agora = new Date();
  const [eventos, salas] = await Promise.all([
    db.eventoGoogle.findMany({ where: { estado: 'NAO_IDENTIFICADO', fimUtc: { gt: agora } }, orderBy: { inicioUtc: 'asc' } }),
    db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="titulo-pagina">Eventos não identificados</h1>
      <p className="text-sm text-slate-600">
        Eventos criados direto no Google Agenda sem o prefixo [Snn] ou com o número de uma sala desativada. Eles <strong>não bloqueiam nenhuma sala</strong> até serem vinculados.
      </p>
      {eventos.length === 0 ? (
        <p className="cartao text-slate-600">Nenhum evento pendente. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {eventos.map((e) => (
            <li key={e.googleEventId} className="cartao space-y-2">
              <div>
                <div className="font-semibold">{e.titulo || '(sem título)'}</div>
                <div className="text-sm text-slate-600">
                  {dataHoraBR(e.inicioUtc)}–{horaLocal(e.fimUtc)}
                  {e.salaNumero && <> · prefixo de {codigoSala(e.salaNumero)} (sala desativada ou inexistente)</>}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <FormAcao acao={acaoVincularEvento} botao="Vincular" className="flex flex-wrap items-start gap-2 space-y-0">
                  <input type="hidden" name="id" value={e.googleEventId} />
                  <select name="salaId" required defaultValue="" className="campo w-auto">
                    <option value="" disabled>Escolha a sala…</option>
                    {salas.map((s) => <option key={s.id} value={s.id}>{rotuloSala(s)}</option>)}
                  </select>
                </FormAcao>
                <FormAcao acao={acaoIgnorarEvento} botao="Ignorar" classeBotao="btn-secundario">
                  <input type="hidden" name="id" value={e.googleEventId} />
                </FormAcao>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

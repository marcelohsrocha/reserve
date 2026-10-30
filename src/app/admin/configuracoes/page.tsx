import { db } from '@/lib/db';
import { CORES_GOOGLE } from '@/lib/cores';
import { obterConfiguracao, andaresUsados } from '@/services/configuracao';
import { FormAcao } from '@/components/FormAcao';
import { acaoSalvarConfiguracao } from '../acoes';

function SeletorCor({ name, valor, vazio }: { name: string; valor: string; vazio?: string }) {
  return (
    <select name={name} defaultValue={valor} className="campo">
      {vazio && <option value="">{vazio}</option>}
      {Object.entries(CORES_GOOGLE).map(([id, c]) => (
        <option key={id} value={id}>● {c.nome}</option>
      ))}
    </select>
  );
}

export default async function Configuracoes() {
  const [cfg, andares, cores] = await Promise.all([obterConfiguracao(), andaresUsados(), db.corAndar.findMany()]);
  const cor = new Map(cores.map((c) => [c.andar, c.colorId]));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="titulo-pagina">Configurações</h1>
      <FormAcao acao={acaoSalvarConfiguracao} botao="Salvar configurações" className="cartao">
        <div>
          <label className="rotulo">Tolerância do check-in (minutos)</label>
          <input type="number" name="toleranciaCheckinMin" min={1} max={240} defaultValue={cfg.toleranciaCheckinMin} className="campo max-w-[10rem]" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="liberacaoAutomatica" defaultChecked={cfg.liberacaoAutomatica} />
          Liberar a sala automaticamente se não houver check-in dentro da tolerância (status “Não compareceu”)
        </label>

        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">Cores por andar (Google Agenda)</legend>
          <div className="grid grid-cols-[1fr_12rem] items-center gap-2">
            <span className="text-sm">Cor padrão (andares não configurados)</span>
            <SeletorCor name="corPadrao" valor={cfg.corPadrao} />
            {andares.map((a) => (
              <div key={a} className="contents">
                <span className="flex items-center gap-2 text-sm">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: CORES_GOOGLE[cor.get(a) ?? cfg.corPadrao]?.hex }} />
                  {a}
                </span>
                <SeletorCor name={`cor:${a}`} valor={cor.get(a) ?? ''} vazio="(cor padrão)" />
              </div>
            ))}
          </div>
          {andares.length === 0 && <p className="text-sm text-slate-500">Os andares aparecem aqui conforme as salas são cadastradas.</p>}
        </fieldset>
      </FormAcao>
    </div>
  );
}

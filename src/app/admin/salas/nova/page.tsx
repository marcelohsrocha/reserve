import { proximoNumero } from '@/services/salas';
import { andaresUsados } from '@/services/configuracao';
import { FormAcao } from '@/components/FormAcao';
import { acaoCriarSala } from '../../acoes';
import { codigoSala } from '@/domain/sala';

export default async function NovaSala() {
  const [numero, andares] = await Promise.all([proximoNumero(), andaresUsados()]);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="titulo-pagina">Nova sala</h1>
      <FormAcao acao={acaoCriarSala} botao="Salvar sala" className="cartao">
        <div>
          <label className="rotulo" htmlFor="numero">Número</label>
          <input id="numero" name="numero" type="number" min={1} max={9999} defaultValue={numero} required className="campo" />
          <p className="mt-1 text-xs text-slate-500">
            Sugerido: {codigoSala(numero)} (próximo da sequência). Números nunca são reaproveitados e identificam a sala no Google Agenda.
          </p>
        </div>
        <div>
          <label className="rotulo" htmlFor="nome">Nome</label>
          <input id="nome" name="nome" required maxLength={80} className="campo" placeholder="Ex.: Sala dos Jovens" />
        </div>
        <div>
          <label className="rotulo" htmlFor="andar">Andar</label>
          <input id="andar" name="andar" list="andares" required maxLength={40} className="campo" placeholder="Escolha ou digite um novo" />
          <datalist id="andares">
            {andares.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </FormAcao>
    </div>
  );
}

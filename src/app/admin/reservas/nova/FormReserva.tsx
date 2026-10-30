'use client';
import { startTransition, useActionState, useMemo, useRef, useState } from 'react';
import { acaoCriarReserva, acaoVerificarReserva } from '../../acoes';
import { Mensagem } from '@/components/FormAcao';

interface Opcao {
  id: string;
  rotulo: string;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** `pessoas` só vem para admins (reserva em nome de outra pessoa); membros reservam para si. */
export function FormReserva({
  salas,
  pessoas,
  eu,
  inicial,
}: {
  salas: Opcao[];
  pessoas: (Opcao & { busca: string })[] | null;
  eu: Opcao;
  inicial: { salaId?: string; data?: string; inicio?: string; fim?: string };
}) {
  const [estadoSalvar, salvar, salvando] = useActionState(acaoCriarReserva, null);
  const [estadoVerif, verificar, verificando] = useActionState(acaoVerificarReserva, null);
  const [busca, setBusca] = useState('');
  const [pessoaId, setPessoaId] = useState(eu.id);
  const [dataInicio, setDataInicio] = useState(inicial.data ?? '');
  const [dataFim, setDataFim] = useState(inicial.data ?? '');

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    const lista = pessoas ?? [];
    return q ? lista.filter((p) => p.busca.toLowerCase().includes(q) || (qd && p.busca.replace(/\D/g, '').includes(qd))) : lista;
  }, [busca, pessoas]);

  const formRef = useRef<HTMLFormElement>(null);
  const variosDias = dataInicio && dataFim && dataFim !== dataInicio;

  return (
    <form
      ref={formRef}
      className="cartao space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => salvar(fd));
      }}
    >
      <div>
        <label className="rotulo">Sala</label>
        <select name="salaId" required defaultValue={inicial.salaId ?? ''} className="campo">
          <option value="" disabled>Escolha a sala…</option>
          {salas.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
        </select>
      </div>

      {pessoas === null ? (
        <div>
          <label className="rotulo">Responsável</label>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{eu.rotulo} (você)</p>
        </div>
      ) : (
      <div>
        <label className="rotulo">Pessoa responsável</label>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone…" className="campo mb-2" />
        <select name="pessoaId" required value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} className="campo" size={Math.min(6, Math.max(2, filtradas.length + 1))}>
          <option value="" disabled>{filtradas.length ? 'Selecione…' : 'Ninguém encontrado'}</option>
          {filtradas.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
        <a href="/admin/pessoas" target="_blank" className="mt-1 inline-block text-xs text-igreja underline">Cadastrar nova pessoa</a>
      </div>
      )}

      <div>
        <label className="rotulo">Título / finalidade</label>
        <input name="titulo" required maxLength={100} className="campo" placeholder="Ex.: Ensaio do louvor" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="rotulo">Data de início</label>
          <input type="date" name="dataInicio" required className="campo" value={dataInicio} onChange={(e) => {
            setDataInicio(e.target.value);
            if (!dataFim || dataFim < e.target.value) setDataFim(e.target.value);
          }} />
        </div>
        <div>
          <label className="rotulo">Data final</label>
          <input type="date" name="dataFim" required className="campo" min={dataInicio} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <div>
          <label className="rotulo">Horário de início</label>
          <input type="time" name="horaInicio" required defaultValue={inicial.inicio} className="campo" />
        </div>
        <div>
          <label className="rotulo">Horário final</label>
          <input type="time" name="horaFim" required defaultValue={inicial.fim} className="campo" />
        </div>
      </div>

      {variosDias && (
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium">Dias da semana (opcional)</legend>
          <p className="mb-2 text-xs text-slate-500">Uma ocorrência por dia no intervalo, no mesmo horário. Marque dias para limitar (ex.: só terças e quintas).</p>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm">
                <input type="checkbox" name="diasSemana" value={i} /> {d}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secundario"
          disabled={verificando}
          onClick={() => {
            const form = formRef.current!;
            if (!form.reportValidity()) return;
            const fd = new FormData(form);
            startTransition(() => verificar(fd));
          }}
        >
          {verificando ? 'Verificando…' : 'Verificar disponibilidade'}
        </button>
        <button type="submit" className="btn-primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar reserva'}
        </button>
      </div>
      <Mensagem estado={estadoVerif} />
      <Mensagem estado={estadoSalvar} />
    </form>
  );
}

import { codigoSala } from '@/domain/sala';

/** Campos para escolher o destino das reservas afetadas (desativação/bloqueio). */
export function ResolucaoCampos({
  destinos,
  obrigatorio,
}: {
  destinos: { id: string; numero: number; nome: string; andar: string }[];
  obrigatorio: boolean;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">Reservas afetadas</legend>
      {!obrigatorio && (
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="resolucao" value="" defaultChecked /> Não há reservas afetadas (o sistema confere)
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="resolucao" value="transferir" defaultChecked={obrigatorio} className="mt-1" />
        <span className="flex-1 space-y-2">
          Transferir todas para:
          <select name="destinoId" className="campo">
            <option value="">Escolha a sala…</option>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {codigoSala(d.numero)} – {d.nome} – {d.andar}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="cancelarRestantes" /> Cancelar as que não couberem na sala de destino
          </label>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="resolucao" value="cancelar" /> Cancelar todas (remove os eventos do Google)
      </label>
    </fieldset>
  );
}

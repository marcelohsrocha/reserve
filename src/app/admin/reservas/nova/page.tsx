import { db } from '@/lib/db';
import { rotuloSala } from '@/domain/sala';
import { mascararTelefone, formatarTelefone } from '@/lib/telefone';
import { FormReserva } from './FormReserva';

export default async function NovaReserva({
  searchParams,
}: {
  searchParams: Promise<{ salaId?: string; data?: string; inicio?: string; fim?: string }>;
}) {
  const inicial = await searchParams;
  const [salas, pessoas] = await Promise.all([
    db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } }),
    db.pessoa.findMany({ orderBy: { nome: 'asc' } }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="titulo-pagina">Nova reserva</h1>
      {salas.length === 0 ? (
        <p className="cartao">Nenhuma sala ativa. <a className="text-igreja underline" href="/admin/salas/nova">Cadastre uma sala</a>.</p>
      ) : (
        <FormReserva
          // `key` força remontagem se a sala mudar ao vir de "Reservar esta sala".
          key={inicial.salaId ?? ''}
          inicial={inicial}
          salas={salas.map((s) => ({ id: s.id, rotulo: rotuloSala(s) }))}
          pessoas={pessoas.map((p) => ({
            id: p.id,
            rotulo: `${p.nome} – ${mascararTelefone(p.telefoneE164)}`,
            busca: `${p.nome} ${formatarTelefone(p.telefoneE164)} ${p.telefoneE164}`,
          }))}
        />
      )}
    </div>
  );
}

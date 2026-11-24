import { PainelAoVivo } from './PainelAoVivo';
import { exigirAdmin } from '@/lib/usuario';

export const metadata = { title: 'Painel – Salas agora' };

/** Painel de TV: só administradores (a TV da igreja entra com a conta da secretaria). */
export default async function Painel() {
  await exigirAdmin();
  return <PainelAoVivo />;
}

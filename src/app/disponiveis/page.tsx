import { Disponiveis } from './Disponiveis';
import { exigirUsuario } from '@/lib/usuario';

export const metadata = { title: 'Salas disponíveis' };

export default async function Pagina() {
  const u = await exigirUsuario();
  return <Disponiveis admin={u.admin} />;
}

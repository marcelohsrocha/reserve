import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decifrar } from '@/lib/cripto';
import { assinarSessao, lerSessao } from '@/lib/sessao';
import { destinoSeguro } from '@/lib/login';
import { AcessoNegado, criarPessoa, definirTelefone, editarPessoa, entrarComGoogle } from '@/services/pessoas';
import { ADMIN } from './helpers';

const conta = (email: string, extra: Partial<Parameters<typeof entrarComGoogle>[0]> = {}) => ({
  email,
  nome: 'Fulano',
  refreshToken: 'refresh-secreto',
  agendaAutorizada: true,
  ...extra,
});

describe('login com a conta Google', () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it('só entra quem foi cadastrado pelo e-mail', async () => {
    await expect(entrarComGoogle(conta('estranho@gmail.com'))).rejects.toBeInstanceOf(AcessoNegado);
    await criarPessoa({ nome: 'Ana', email: 'Ana@Gmail.com' }, ADMIN);
    const { pessoa } = await entrarComGoogle(conta('ana@gmail.com'));
    expect(pessoa).toMatchObject({ nome: 'Ana', email: 'ana@gmail.com', papel: 'MEMBRO', telefoneE164: null });
  });

  it('e-mails de ADMIN_EMAILS entram como administradores mesmo sem cadastro', async () => {
    process.env.ADMIN_EMAILS = 'pastor@ipi.org, secretaria@ipi.org';
    const { pessoa } = await entrarComGoogle(conta('secretaria@ipi.org', { nome: 'Secretaria' }));
    expect(pessoa).toMatchObject({ papel: 'ADMIN', nome: 'Secretaria' });
    // E não podem ser rebaixados pela tela.
    const p = await editarPessoa(pessoa.id, { nome: 'Secretaria', email: 'secretaria@ipi.org', papel: 'MEMBRO' }, ADMIN);
    expect(p.papel).toBe('ADMIN');
  });

  it('acesso desativado bloqueia o login', async () => {
    const p = await criarPessoa({ nome: 'Ana', email: 'ana@gmail.com' }, ADMIN);
    await editarPessoa(p.id, { nome: 'Ana', email: 'ana@gmail.com', ativo: false }, ADMIN);
    await expect(entrarComGoogle(conta('ana@gmail.com'))).rejects.toBeInstanceOf(AcessoNegado);
  });

  it('guarda o refresh token cifrado e o remove se o usuário negar a agenda', async () => {
    await criarPessoa({ nome: 'Ana', email: 'ana@gmail.com' }, ADMIN);
    const { pessoa, conectouAgora } = await entrarComGoogle(conta('ana@gmail.com'));
    expect(conectouAgora).toBe(true);
    expect(pessoa.googleRefreshToken).not.toContain('refresh-secreto');
    expect(decifrar(pessoa.googleRefreshToken!)).toBe('refresh-secreto');
    // Login seguinte sem novo refresh token mantém o que já existe.
    expect((await entrarComGoogle(conta('ana@gmail.com', { refreshToken: null }))).pessoa.googleRefreshToken).toBe(pessoa.googleRefreshToken);
    // Desmarcou a permissão da agenda na tela do Google.
    expect((await entrarComGoogle(conta('ana@gmail.com', { refreshToken: null, agendaAutorizada: false }))).pessoa.googleRefreshToken).toBeNull();
  });

  it('telefone do primeiro acesso é validado e único', async () => {
    const ana = await criarPessoa({ nome: 'Ana', email: 'ana@gmail.com' }, ADMIN);
    const joao = await criarPessoa({ nome: 'João', email: 'joao@gmail.com', telefone: '(67) 98888-5678' }, ADMIN);
    await expect(definirTelefone(ana.id, '123', 'ana@gmail.com')).rejects.toThrow(/inválido/);
    await expect(definirTelefone(ana.id, '(67) 98888-5678', 'ana@gmail.com')).rejects.toThrow(/outra pessoa/);
    await definirTelefone(ana.id, '(67) 99999-1234', 'ana@gmail.com');
    expect((await db.pessoa.findUniqueOrThrow({ where: { id: ana.id } })).telefoneE164).toBe('+5567999991234');
    expect(joao.telefoneE164).toBe('+5567988885678');
  });

  it('cookie de sessão assinado: adulterado ou de outro segredo é rejeitado', async () => {
    const token = await assinarSessao('pessoa-1', 'ana@gmail.com');
    expect(await lerSessao(token)).toEqual({ pessoaId: 'pessoa-1', email: 'ana@gmail.com' });
    const [h, , s] = token.split('.');
    const corpo = Buffer.from(JSON.stringify({ sub: 'admin', email: 'x' })).toString('base64url');
    expect(await lerSessao(`${h}.${corpo}.${s}`)).toBeNull();
    expect(await lerSessao('lixo')).toBeNull();
  });

  it('destino depois do login só aceita caminhos internos', () => {
    expect(destinoSeguro('/admin/salas')).toBe('/admin/salas');
    expect(destinoSeguro('//evil.com')).toBe('/admin');
    expect(destinoSeguro('https://evil.com')).toBe('/admin');
    expect(destinoSeguro('/api/auth/sair')).toBe('/admin');
  });
});

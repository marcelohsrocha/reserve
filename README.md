# Sistema de Reservas de Salas – IPI Dourados

Sistema web de reservas de salas da Igreja Presbiteriana Independente de Dourados. Roda num servidor interno da igreja e é acessado de fora pelo celular através de um **Cloudflare Tunnel**. Cada pessoa **entra com a própria conta Google**. A agenda única do **Google Agenda** é a fonte da verdade, e cada reserva também vai para a **agenda pessoal** de quem reservou.

- **Painel "Agora"** (`/painel`): modo TV, cards por sala e cores de status em tempo real
- **Salas disponíveis** (`/disponiveis`): livres agora e busca de horários futuros
- **Reservas** (`/admin`): membros reservam para si e veem as próprias reservas; administradores gerenciam salas, pessoas, todas as reservas, QR Codes, configurações e auditoria
- **Check-in por QR** (`/checkin/…`): página pública e leve (~2 KB), feita para 4G fraco

Stack: Next.js 15 (App Router) + TypeScript · SQLite + Prisma · Tailwind · SSE · googleapis (Service Account + OAuth) · qrcode · Docker Compose (app + cloudflared). Fuso fixo: `America/Campo_Grande`. As datas são gravadas em UTC.

---

## 1. Google Cloud: projeto, Calendar API, Service Account e login (OAuth)

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `ipi-reservas`).
2. Em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**:
   - Nome: `reservas-salas`. Não é preciso dar nenhum papel no projeto.
4. Abra a conta criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Um arquivo `.json` será baixado.
5. Copie esse arquivo para o servidor em `secrets/service-account.json`, dentro da pasta do projeto. **Nunca o coloque no Git.**
6. Anote o **e-mail da conta de serviço** (algo como `reservas-salas@ipi-reservas.iam.gserviceaccount.com`).

### 1.1 Tela de consentimento e cliente OAuth (login com Google)
A conta de serviço grava na agenda do sistema. O login das pessoas e a cópia na agenda pessoal usam OAuth:

1. **APIs e serviços → Tela de consentimento OAuth** (ou *Google Auth Platform → Branding*):
   - Tipo de usuário: **Externo** (os membros usam contas @gmail.com).
   - Nome do app: `Reservas de Salas – IPI Dourados`, e-mail de suporte e logo.
   - Domínios autorizados: o domínio do `PUBLIC_BASE_URL` (ex.: `suaigreja.org.br`).
   - Escopos (*Data access*): `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` e **`.../auth/calendar.events`**.
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - URI de redirecionamento autorizado: **`https://reservas.suaigreja.org.br/api/auth/google/callback`** (o `PUBLIC_BASE_URL` + `/api/auth/google/callback`).
   - Copie o **ID do cliente** para `GOOGLE_OAUTH_CLIENT_ID` e a **chave secreta** para `GOOGLE_OAUTH_CLIENT_SECRET`.
3. Gere o segredo da sessão com `openssl rand -hex 32` e coloque em `SESSION_SECRET`. Ele assina o cookie de login e cifra (AES-256-GCM) os tokens das agendas pessoais guardados no banco. **Se ele mudar, todos precisam entrar de novo e reconectar a agenda.**
4. Em `ADMIN_EMAILS`, liste os e-mails que sempre entram como administradores (ex.: o do pastor e o da secretaria). Eles não precisam ser cadastrados antes.

> **Publicação do app no Google — leia antes de liberar para a igreja.**
> - Enquanto o app estiver em **"Em teste"**, só entram as contas cadastradas como *usuários de teste* (até 100) e o Google **expira o acesso à agenda pessoal a cada 7 dias**. O login continua funcionando; a pessoa só precisa clicar em "Conectar a Agenda Google" de novo.
> - Para uso normal, clique em **Publicar app**. Como `calendar.events` é um escopo **sensível**, o Google pede uma **verificação** (política de privacidade publicada, vídeo curto mostrando o uso). Até ela sair, quem entra vê o aviso "O Google não verificou este app" (dá para prosseguir em *Avançado*) e há um limite de 100 usuários.
> - O sistema só **cria, altera e apaga os eventos que ele mesmo criou** na agenda pessoal; não lê os outros compromissos da pessoa.

## 2. Agenda única "Reservas de Salas – IPI Dourados"

1. No Google Agenda (com a conta Google da igreja), clique em **+ Outras agendas → Criar nova agenda**.
2. Nome: **Reservas de Salas – IPI Dourados**. Fuso: **(GMT-04:00) Campo Grande**.
3. Abra **Configurações da agenda → Compartilhar com pessoas específicas → Adicionar pessoas** e informe o e-mail da Service Account com a permissão **"Fazer alterações nos eventos"**. **Ela deve ser a única com permissão de edição.**
4. Na mesma tela, em **Integrar agenda**, copie o **ID da agenda** (`…@group.calendar.google.com`) para `GOOGLE_CALENDAR_ID` no `.env`.
5. Se a equipe quiser acompanhar a agenda do sistema no Google, compartilhe com ela **somente com "Ver todos os detalhes do evento"** (leitura).

> **Todo evento precisa ter identificação (sala e responsável), então as reservas são feitas só pelo sistema.** Se alguém com acesso de edição criar um evento direto na agenda do sistema, a sincronização **apaga esse evento automaticamente** (só os que ainda não terminaram) e registra na auditoria o título, o horário e o motivo. Eventos do próprio sistema que forem movidos ou apagados no Google continuam sendo refletidos no sistema.

## 3. Cloudflare Tunnel

Pré-requisito: o domínio da igreja precisa estar no Cloudflare.

1. No painel Cloudflare, abra **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
2. Nome: `ipi-reservas`. Na etapa de instalação, copie apenas o **token** (o texto longo depois de `--token`) para `TUNNEL_TOKEN` no `.env`. Não é preciso instalar nada no servidor, porque o `docker compose` já sobe o `cloudflared`.
3. Em **Public Hostname**, adicione:
   - Subdomain: `reservas` · Domain: `suaigreja.org.br`
   - Service: **HTTP** · URL: **`app:3000`**
4. Coloque o endereço final em `PUBLIC_BASE_URL` (ex.: `https://reservas.suaigreja.org.br`). **É esse endereço que vai impresso nos QR Codes e cadastrado como redirecionamento do OAuth.**

O túnel faz conexões de saída, então **nenhuma porta precisa ser aberta no roteador da igreja**.

**Não use o Cloudflare Access** na frente do app: o login agora é feito pelo próprio sistema com a conta Google. Se uma aplicação do Access foi criada antes, remova-a em **Zero Trust → Access → Applications**. O app exige sessão em todas as rotas, exceto `/checkin/*` (QR das portas), `/api/google/webhook` (notificações do Google), `/entrar`, `/api/auth/*` (fluxo de login) e `/api/health`. Em produção, sem `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e `SESSION_SECRET`, o app responde 503 e não abre sem proteção.

> TV do painel: entre uma vez com uma conta cadastrada (ex.: a da secretaria) e abra `/painel`. A sessão dura 30 dias.

## 4. Subir o sistema

No servidor (Linux com Docker e Docker Compose instalados):

```bash
git clone <este repositório> ipi-reservas && cd ipi-reservas
cp .env.example .env          # edite e preencha todas as variáveis
mkdir -p secrets && cp /caminho/service-account.json secrets/
openssl rand -hex 32          # use o resultado em GOOGLE_WEBHOOK_TOKEN
openssl rand -hex 32          # e outro em SESSION_SECRET
docker compose up -d --build
docker compose logs -f app    # deve mostrar "[jobs] … iniciados" e o canal do Google renovado
```

- O banco SQLite fica no volume Docker `dados`. Backup: `docker compose cp app:/app/data/reservas.db ./backup-$(date +%F).db`.
- As migrações do banco rodam sozinhas a cada inicialização.
- Atualizar o sistema: `git pull && docker compose up -d --build`.
- **Produção sobe sem nenhuma sala.** O seed de exemplo é só para desenvolvimento.

## 5. Primeiros passos: salas e QR Codes

1. Acesse `https://reservas.suaigreja.org.br` e clique em **Entrar com Google** com um dos e-mails de `ADMIN_EMAILS`. No primeiro acesso, informe seu celular.
2. Clique em **Cadastre sua primeira sala**. O número é sugerido automaticamente (S01, S02…) e o andar pode ser escolhido entre os já usados ou digitado.
3. Em **Configurações**, defina a cor de cada andar no Google Agenda, a tolerância do check-in (padrão 15 min) e se a liberação automática por não comparecimento fica ligada.
4. Em **QR Codes**, use **Imprimir todos** (uma folha A5 por sala, com logo, código, nome, andar e QR) e cole cada folha na porta da sala correspondente.
5. Teste: escaneie um QR com o celular **no 4G** (fora do Wi-Fi da igreja). Deve abrir "Sala livre agora".
6. Em **Pessoas**, cadastre quem pode usar o sistema: nome, **e-mail da conta Google** e papel (*Membro* ou *Administrador*). O telefone é opcional aqui: a própria pessoa informa no primeiro acesso.

### Quem pode fazer o quê
| | Membro | Administrador |
|---|---|---|
| Ver calendário, salas e horários livres, painel | ✓ | ✓ |
| Reservar (o responsável é sempre quem está logado) | ✓ | ✓, e também em nome de outra pessoa |
| Cancelar, remarcar, transferir, liberar antes do fim | só as próprias reservas | todas |
| Salas, bloqueios, QR Codes, pessoas, configurações, auditoria | — | ✓ |

Para tirar o acesso de alguém, desmarque **Pode entrar no sistema** no cadastro (o histórico de reservas continua).

O logo provisório fica em `public/logo.svg`. Substitua pelo logo oficial com o mesmo nome e reconstrua a imagem.

## 6. Desativar, reativar e bloquear salas

**Desativar** (a sala deixou de existir ou de estar disponível): em **Salas → Gerenciar → Desativar sala**.
- Se houver reservas futuras, o sistema as lista e exige uma escolha:
  - **Transferir todas** para outra sala. Cada ocorrência é checada contra conflitos. As que não couberem são listadas, e o admin escolhe outra sala ou marca "cancelar as que não couberem".
  - **Cancelar todas**, o que também remove os eventos do Google.
- A sala some dos painéis e do formulário de reserva, e o QR passa a mostrar "Sala indisponível". O histórico e a auditoria continuam com ela marcada como *Desativada*.
- O **número nunca é reaproveitado**: se a S04 for desativada, a próxima sala nova será a S05.
- A exclusão definitiva só é possível para salas sem nenhuma reserva ou bloqueio no histórico.

**Reativar**: em **Salas → filtro "Desativadas" → Gerenciar → Reativar sala**. A sala mantém o número e recebe um **QR novo**, então é preciso imprimir e trocar o da porta (o antigo continua inválido).

**Bloquear por período** (ex.: reforma de 10/11 a 20/11): em **Gerenciar → Bloquear por período**, informe início, fim e motivo. Isso cria o evento `[S03] BLOQUEADA – Reforma` no Google, impede reservas no intervalo e mostra a sala em cinza no painel. Se já houver reservas no período, vale o mesmo fluxo de transferir ou cancelar. O bloqueio começa e termina sozinho e pode ser removido antes do fim.

**Regenerar QR**: em **QR Codes → Regenerar**. Invalida o QR anterior imediatamente (útil se ele for fotografado e usado de forma indevida).

## 7. Como funciona

### Reservas e ocorrências
Uma reserva tem data inicial e final e um horário. Quando as datas são diferentes, o sistema gera **uma ocorrência por dia** no mesmo horário, com filtro opcional de dias da semana (ex.: só terças e quintas). Cada ocorrência tem status e check-in próprios e **um evento próprio no Google**. Foi escolhido não usar RRULE para que cada dia possa ser cancelado, transferido ou encurtado separadamente.

Status: `AGENDADA → EM_ANDAMENTO → CONFIRMADA (check-in) → FINALIZADA`, além de `CANCELADA` e `NAO_COMPARECEU`.

### Login
- **Entrar com Google** (OAuth 2.0, escopos `openid email profile calendar.events`). O `state` anti-CSRF fica num cookie curto; o `id_token` é verificado e só e-mails **verificados** entram.
- Só entra quem está cadastrado em **Pessoas** (pelo e-mail) e com acesso ativo, ou quem está em `ADMIN_EMAILS`.
- A sessão é um cookie `HttpOnly` assinado (HS256, 30 dias) que guarda só o id da pessoa; papel e acesso são lidos do banco a cada página e ação, então tirar o acesso vale na hora.
- No primeiro acesso a pessoa informa o celular, usado no check-in.

### Google Agenda
- **Duas agendas por reserva.** Cada ocorrência vira um evento na agenda única do sistema (conta de serviço) e uma **cópia na agenda principal do responsável** (com o token OAuth dele, guardado cifrado). A cópia tem o mesmo título e local, sem telefone, e explica que alterações são feitas pelo sistema.
- A cópia acompanha tudo: cancelar, remarcar, transferir de sala, trocar o responsável (sai de uma agenda e entra na outra), liberar antes do fim (encurta) e não comparecimento (some). Quem conectar a agenda depois recebe as reservas futuras que já tinha.
- Falha na agenda pessoal **não desfaz a reserva**: ela fica registrada no log. Se a pessoa revogar o acesso (ou o token expirar), a agenda é desconectada e aparece o aviso "Conecte a sua Agenda Google". Se a pessoa apagar a cópia da própria agenda, o sistema não recria.
- Cada evento da agenda do sistema leva o título `[S03] Título`, `location` "S03 – Nome (Andar)", a cor do andar e as propriedades privadas `salaNumero`, `reservaId`, `ocorrenciaId` (ou `bloqueioId`) e `tipo`. A descrição traz o responsável com o telefone mascarado.
- **Conflito por sala**: antes de gravar, o sistema confere reservas e bloqueios locais e consulta a agenda única ao vivo (`events.list`, `singleEvents=true`) na faixa das ocorrências, considerando os eventos do sistema pela propriedade `salaNumero`. O `freebusy` não é usado porque não diferencia salas. Uma única consulta cobre a faixa inteira de uma reserva de vários dias.
- **Sincronização reversa**: um canal `events.watch` chama `/api/google/webhook` (validado pelo `X-Goog-Channel-Token`). O sistema faz sync incremental com `syncToken`, renova o canal 24 h antes de expirar e, como reserva, faz *polling* a cada 2 minutos.
- Um evento do sistema apagado ou movido direto no Google cancela ou remarca a ocorrência correspondente.
- **Evento sem identificação** (criado fora do sistema): é apagado da agenda do sistema na sincronização, com registro na auditoria (`remover_evento_sem_identificacao`). Eventos que já terminaram ficam como histórico. Na atualização para esta versão, a primeira sincronização é completa e limpa os eventos futuros que já existiam.

### Regras automáticas (job a cada minuto, alinhado à virada do minuto)
- No horário de início: `AGENDADA → EM_ANDAMENTO` (amarelo até o check-in, vermelho depois).
- No horário final: `FINALIZADA`, e a sala aparece **livre** nos dois painéis.
- Sem check-in em X minutos (configurável, padrão 15): `NAO_COMPARECEU`. A sala é liberada e o evento no Google é encurtado até o horário atual.
- Toda mudança é enviada por **SSE** (`/api/stream`), e painéis e listas se atualizam sem recarregar.

### Check-in
O QR aponta para `/checkin/{token}`. A página mostra a ocorrência vigente (que começa em até 15 minutos ou já está em andamento). A presença é confirmada com os **4 últimos dígitos do telefone** do responsável. Há limite de 5 tentativas por IP a cada 10 minutos. A página é HTML puro, sem JavaScript.

### Segurança e LGPD
- O telefone nunca aparece completo nos painéis, no check-in ou no Google (sempre `(67) 9****-1234`). O número completo só aparece no cadastro de pessoas, dentro do `/admin`.
- O log de auditoria (`/admin/auditoria`) registra quem entrou, criou, editou, transferiu, cancelou, bloqueou, desativou ou reativou o quê, e quando, além dos eventos removidos da agenda. O "quem" é o e-mail da conta Google logada.
- Os refresh tokens das agendas pessoais ficam cifrados no banco (AES-256-GCM, chave derivada de `SESSION_SECRET`). Ao desconectar a agenda, o token é revogado no Google.
- Credenciais e IDs ficam só no `.env` e em `secrets/`, nunca no código.

## 8. Desenvolvimento

```bash
npm install
cp .env.example .env      # para dev, basta: DATABASE_URL=file:./dev.db, GOOGLE_FAKE=1 e ADMIN_EMAILS=voce@exemplo.com
npx prisma migrate deploy
npm run seed:dev          # 3 salas e 2 pessoas fictícias (recusa rodar em produção)
npm run dev               # http://localhost:3000
```

Sem credenciais do Google (ou com `GOOGLE_FAKE=1`), o app usa uma **agenda falsa em memória**, que permite testar tudo sem tocar no Google real. Sem `GOOGLE_OAUTH_CLIENT_ID`, em desenvolvimento a tela `/entrar` tem um **login simulado** pelo e-mail (com agenda pessoal falsa); ele não existe em produção. O seed cria `admin@dev.local` (admin) e `maria@dev.local` (membro).

### Testes

```bash
npm test
```

Os testes rodam contra um SQLite descartável (`prisma/test.db`) e a agenda falsa, e cobrem:

| Arquivo | Cobre |
|---|---|
| `tests/conflito.test.ts` | conflito por sala na agenda única (reserva × reserva, × evento do sistema no Google, × bloqueio; salas diferentes liberadas; eventos criados fora do sistema ou de sala desativada não bloqueiam) |
| `tests/ocorrencias.test.ts` | geração de ocorrências por intervalo, dias da semana, virada de mês e ano, fuso |
| `tests/prefixo.test.ts` | leitura do prefixo `[Snn]` e variações |
| `tests/status.test.ts` | início, liberação automática no horário final, não comparecimento com encurtamento do evento |
| `tests/checkin.test.ts` | telefone errado ou correto, rate limit, QR de sala desativada ou regenerado, sala bloqueada |
| `tests/desativacao.test.ts` | desativação com transferência (inclusive parcial) e com cancelamento |
| `tests/bloqueio.test.ts` | bloqueio por período, transferência das reservas afetadas, remoção |
| `tests/numero.test.ts` | não reaproveitamento de número (desativação, exclusão, edição) |
| `tests/sincronizacao.test.ts` | sync reverso, remoção automática de eventos sem identificação (com auditoria e sem loop), histórico preservado, exclusão no Google |
| `tests/agenda-pessoal.test.ts` | cópia na agenda do usuário ao reservar, cancelar, remarcar, transferir, liberar, trocar responsável e não comparecer; token revogado |
| `tests/login.test.ts` | só e-mails cadastrados entram, `ADMIN_EMAILS`, acesso desativado, token cifrado, telefone do 1º acesso, cookie adulterado, redirecionamento seguro |

### Estrutura

```
prisma/              schema, migrações e seed de desenvolvimento
src/domain/          regras puras: ocorrências, conflito, prefixo, status, situação do painel
src/services/        casos de uso: salas, reservas, bloqueios, sync com o Google, jobs, check-in…
src/integrations/    Google: agenda do sistema, agenda pessoal (OAuth) e login (real e falso em memória)
src/lib/             utilitários: fuso, telefone, sessão, cifra, SSE, auditoria, trava, rate limit
src/app/             páginas e rotas (painel, disponíveis, admin, check-in, APIs)
tests/               testes automatizados (Vitest)
```

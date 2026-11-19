# Sistema de Reservas de Salas 

Sistema web de reservas de salas. Roda num servidor interno e é acessado de fora pelo celular através de um **Cloudflare Tunnel**. Cada pessoa **entra com a própria conta Google**. A agenda única do **Google Agenda** é a fonte da verdade. Quem reservou pode **adicionar a reserva à própria agenda** com 1 toque (link do Google Agenda ou arquivo .ics).

- **Painel "Agora"** (`/painel`): modo TV, cards por sala e cores de status em tempo real
- **Salas disponíveis** (`/disponiveis`): livres agora e busca de horários futuros
- **Reservas** (`/admin`): membros reservam para si e veem as próprias reservas; administradores gerenciam salas, pessoas, todas as reservas, QR Codes, configurações e auditoria
- **Check-in por QR** (`/checkin/…`): página pública e leve (~2 KB), feita para 4G fraco

Stack: Next.js 15 (App Router) + TypeScript · SQLite + Prisma · Tailwind · SSE · googleapis (Service Account + OAuth) · qrcode · Docker Compose (app + cloudflared). Fuso fixo: `America/Campo_Grande`. As datas são gravadas em UTC.

## Documentação

| Para quem | Documento |
|---|---|
| **TI – instalação, backup, atualização, problemas comuns** | [docs/INSTALACAO.md](docs/INSTALACAO.md) |
| **Secretaria e administradores – como usar e regras do sistema** | [docs/FUNCIONAMENTO.md](docs/FUNCIONAMENTO.md) |
| **Conhecer o sistema no próprio computador, sem Google** | `npm run teste:local` ([detalhes](docs/INSTALACAO.md#apêndice-b--teste-local-sem-google)) |

Resumo da instalação (detalhado no manual): servidor Linux com Docker → projeto e credenciais no Google Cloud → agenda única compartilhada com a conta de serviço → túnel na Cloudflare → `.env` → `docker compose up -d --build`.

---

## Como funciona (visão técnica)

### Reservas e ocorrências
Uma reserva tem data inicial e final e um horário. Quando as datas são diferentes, o sistema gera **uma ocorrência por dia** no mesmo horário, com filtro opcional de dias da semana (ex.: só terças e quintas). Cada ocorrência tem status e check-in próprios e **um evento próprio no Google**. Foi escolhido não usar RRULE para que cada dia possa ser cancelado, transferido ou encurtado separadamente.

Status: `AGENDADA → EM_ANDAMENTO → CONFIRMADA (check-in) → FINALIZADA`, além de `CANCELADA` e `NAO_COMPARECEU`.

### Login
- **Entrar com Google** (OAuth 2.0, escopos `openid email profile`). O `state` anti-CSRF fica num cookie curto; o `id_token` é verificado e só e-mails **verificados** entram.
- Só entra quem está cadastrado em **Pessoas** (pelo e-mail) e com acesso ativo, ou quem está em `ADMIN_EMAILS`.
- A sessão é um cookie `HttpOnly` assinado (HS256, 30 dias) que guarda só o id da pessoa; papel e acesso são lidos do banco a cada página e ação, então tirar o acesso vale na hora.
- No primeiro acesso a pessoa informa o celular, usado no check-in.

### Google Agenda
- **Adicionar à minha agenda:** na página da reserva, link do Google Agenda (por data) e arquivo `.ics` com todas as datas futuras (`/api/reservas/{id}/ics`). É um lembrete criado pelo próprio usuário; alterações feitas depois no sistema não atualizam esse evento.
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
O QR aponta para `/checkin/{token}`. A página mostra a ocorrência vigente (que começa em até 15 minutos ou já está em andamento). A presença é confirmada com **1 toque** se o visitante estiver logado como responsável pela reserva ou administrador; caso contrário, com os **4 últimos dígitos do telefone** do responsável (limite de 5 tentativas por IP a cada 10 minutos). Depois do início, a mesma página permite **encerrar a reserva antes do fim** e liberar a sala. A página é HTML puro, quase sem JavaScript.

### Segurança e LGPD
- O telefone nunca aparece completo nos painéis, no check-in ou no Google (sempre `(67) 9****-1234`). O número completo só aparece no cadastro de pessoas, dentro do `/admin`.
- O log de auditoria (`/admin/auditoria`) registra quem entrou, criou, editou, transferiu, cancelou, bloqueou, desativou ou reativou o quê, e quando, além dos eventos removidos da agenda. O "quem" é o e-mail da conta Google logada.
- O sistema não guarda tokens de acesso às contas Google das pessoas (só o e-mail e o nome do login).
- Credenciais e IDs ficam só no `.env` e em `secrets/`, nunca no código.

## Desenvolvimento

O jeito mais rápido de ver o sistema funcionando é `npm run teste:local` (banco de demonstração, sem Google). Para desenvolver:

```bash
npm install
cp .env.example .env      # para dev, basta: DATABASE_URL=file:./dev.db, GOOGLE_FAKE=1 e ADMIN_EMAILS=voce@exemplo.com
npx prisma migrate deploy
npm run seed:dev          # 3 salas e 2 pessoas fictícias (recusa rodar em produção)
npm run dev               # http://localhost:3000
```

Sem credenciais do Google (ou com `GOOGLE_FAKE=1`), o app usa uma **agenda falsa em memória**, que permite testar tudo sem tocar no Google real. Sem `GOOGLE_OAUTH_CLIENT_ID`, em desenvolvimento a tela `/entrar` tem um **login simulado** pelo e-mail; ele não existe em produção. O seed cria `admin@dev.local` (admin) e `maria@dev.local` (membro).

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
| `tests/checkin.test.ts` | telefone errado ou correto, rate limit, check-in de 1 toque (responsável/admin logado), encerrar antes do fim, QR de sala desativada ou regenerado, sala bloqueada |
| `tests/desativacao.test.ts` | desativação com transferência (inclusive parcial) e com cancelamento |
| `tests/bloqueio.test.ts` | bloqueio por período, transferência das reservas afetadas, remoção |
| `tests/numero.test.ts` | não reaproveitamento de número (desativação, exclusão, edição) |
| `tests/sincronizacao.test.ts` | sync reverso, remoção automática de eventos sem identificação (com auditoria e sem loop), histórico preservado, exclusão no Google |
| `tests/quando-onde.test.ts` | mapa de disponibilidade de todas as salas e "reservar só as datas livres" |
| `tests/link-agenda.test.ts` | link do Google Agenda e arquivo .ics (horário em UTC, escapes, linhas de 75 bytes) |
| `tests/login.test.ts` | só e-mails cadastrados entram, `ADMIN_EMAILS`, acesso desativado, telefone do 1º acesso, cookie adulterado, redirecionamento seguro |

### Estrutura

```
docs/                manuais de instalação (TI) e de funcionamento
prisma/              schema, migrações e seed de desenvolvimento
scripts/             teste local (demonstração) e backup do banco
src/domain/          regras puras: ocorrências, conflito, prefixo, status, situação do painel
src/services/        casos de uso: salas, reservas, bloqueios, sync com o Google, jobs, check-in…
src/integrations/    Google: agenda do sistema e login (real e falso em memória)
src/lib/             utilitários: fuso, telefone, sessão, cifra, SSE, auditoria, trava, rate limit
src/app/             páginas e rotas (painel, disponíveis, admin, check-in, APIs)
tests/               testes automatizados (Vitest)
```

## Novidades (18/11/2026)

- **Nova reserva "quando → onde":** a pessoa informa data e horário e o sistema mostra, ao vivo, as salas livres (em todas as datas, se a reserva se repete). Botões de duração (1h, 1h30, 2h, 3h). Em reserva repetida com algumas datas ocupadas, dá para **reservar só as datas livres**.
- **Check-in com 1 toque:** quem está logado como responsável pela reserva (ou administrador) confirma a presença sem digitar nada. Os 4 dígitos continuam valendo para quem não está logado.
- **Encerrar agora:** na página do QR, depois do início, a sala pode ser liberada antes do fim (1 toque logado ou 4 dígitos). O evento no Google é encurtado e o painel fica verde na hora.
- **Adicionar à minha agenda:** substitui a cópia automática na agenda pessoal (veja a seção 1.1).
- **Prisma sem motor Rust** (driver `better-sqlite3`): o build não depende mais de baixar binários do Prisma para as consultas.


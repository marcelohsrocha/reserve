# Sistema de Reservas de Salas – IPI Dourados

Sistema web de reservas de salas da Igreja Presbiteriana Independente de Dourados. Roda num servidor interno da igreja e é acessado de fora pelo celular através de um **Cloudflare Tunnel**. A agenda única do **Google Agenda** é a fonte da verdade.

- **Painel "Agora"** (`/painel`): modo TV, cards por sala e cores de status em tempo real
- **Salas disponíveis** (`/disponiveis`): livres agora e busca de horários futuros
- **Administração** (`/admin`): salas, pessoas, reservas, agenda, QR Codes, eventos não identificados, configurações e auditoria
- **Check-in por QR** (`/checkin/…`): página pública e leve (~2 KB), feita para 4G fraco

Stack: Next.js 15 (App Router) + TypeScript · SQLite + Prisma · Tailwind · SSE · googleapis (Service Account) · qrcode · Docker Compose (app + cloudflared). Fuso fixo: `America/Campo_Grande`. As datas são gravadas em UTC.

---

## 1. Google Cloud: projeto, Calendar API e Service Account

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `ipi-reservas`).
2. Em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**:
   - Nome: `reservas-salas`. Não é preciso dar nenhum papel no projeto.
4. Abra a conta criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Um arquivo `.json` será baixado.
5. Copie esse arquivo para o servidor em `secrets/service-account.json`, dentro da pasta do projeto. **Nunca o coloque no Git.**
6. Anote o **e-mail da conta de serviço** (algo como `reservas-salas@ipi-reservas.iam.gserviceaccount.com`).

## 2. Agenda única "Reservas de Salas – IPI Dourados"

1. No Google Agenda (com a conta Google da igreja), clique em **+ Outras agendas → Criar nova agenda**.
2. Nome: **Reservas de Salas – IPI Dourados**. Fuso: **(GMT-04:00) Campo Grande**.
3. Abra **Configurações da agenda → Compartilhar com pessoas específicas → Adicionar pessoas** e informe o e-mail da Service Account com a permissão **"Fazer alterações nos eventos"**.
4. Na mesma tela, em **Integrar agenda**, copie o **ID da agenda** (`…@group.calendar.google.com`) para `GOOGLE_CALENDAR_ID` no `.env`.
5. Compartilhe a agenda também com a equipe que vai consultá-la ou criar eventos direto no Google.

> **Instrução para a equipe:** ao criar um evento direto no Google Agenda, **sempre comece o título com [S + número da sala]**, ex.: **`[S03] Reunião de diáconos`**. Variações como `[S3]` e `[s03]` também são aceitas e o sistema padroniza o título sozinho. Eventos sem prefixo (ou com o número de uma sala desativada) vão para a fila **"Eventos não identificados"** e **não bloqueiam nenhuma sala** até o admin vinculá-los.

## 3. Cloudflare Tunnel e Cloudflare Access

Pré-requisito: o domínio da igreja precisa estar no Cloudflare.

### 3.1 Túnel
1. No painel Cloudflare, abra **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
2. Nome: `ipi-reservas`. Na etapa de instalação, copie apenas o **token** (o texto longo depois de `--token`) para `TUNNEL_TOKEN` no `.env`. Não é preciso instalar nada no servidor, porque o `docker compose` já sobe o `cloudflared`.
3. Em **Public Hostname**, adicione:
   - Subdomain: `reservas` · Domain: `suaigreja.org.br`
   - Service: **HTTP** · URL: **`app:3000`**
4. Coloque o endereço final em `PUBLIC_BASE_URL` (ex.: `https://reservas.suaigreja.org.br`). **É esse endereço que vai impresso nos QR Codes.**

O túnel faz conexões de saída, então **nenhuma porta precisa ser aberta no roteador da igreja**.

### 3.2 Access (login por e-mail para a equipe)
1. Abra **Zero Trust → Settings → Authentication → Login methods** e confirme que **One-time PIN** está ativo.
2. Em **Zero Trust → Access → Applications → Add an application → Self-hosted**:
   - Name: `Reservas – Admin`
   - Domain: `reservas.suaigreja.org.br` (deixe o *path* vazio para proteger o site inteiro)
   - Session duration: 24 h (ou o que preferir)
3. **Política "Equipe"** (Action: **Allow**): Include → **Emails** → a lista de e-mails autorizados.
4. Crie **mais duas aplicações** para os caminhos públicos, cada uma com uma política de Action **Bypass** e Include **Everyone**:
   - `reservas.suaigreja.org.br/checkin` (o QR das portas)
   - `reservas.suaigreja.org.br/api/google/webhook` (as notificações do Google)

   O Access dá prioridade ao caminho mais específico, então essas duas ficam públicas e todo o resto (`/admin`, `/painel`, `/disponiveis`) exige login.
5. Abra a aplicação principal → **Overview** e copie o **Application Audience (AUD) Tag** para `CF_ACCESS_AUD`. Em **Settings → Custom pages**, veja o *team domain* (ex.: `ipidourados.cloudflareaccess.com`) e coloque em `CF_ACCESS_TEAM_DOMAIN`.

O app **também valida o token do Access** em todas as rotas protegidas. Assim, nem alguém conectado à rede local da igreja consegue entrar sem login. Em produção, se essas duas variáveis estiverem vazias, o app responde 503 e não abre sem proteção.

> TV do painel: para não pedir o PIN todo dia, crie no Access um **Service Token** e uma política *Service Auth* para ele, ou aumente a duração da sessão.

## 4. Subir o sistema

No servidor (Linux com Docker e Docker Compose instalados):

```bash
git clone <este repositório> ipi-reservas && cd ipi-reservas
cp .env.example .env          # edite e preencha todas as variáveis
mkdir -p secrets && cp /caminho/service-account.json secrets/
openssl rand -hex 32          # use o resultado em GOOGLE_WEBHOOK_TOKEN
docker compose up -d --build
docker compose logs -f app    # deve mostrar "[jobs] … iniciados" e o canal do Google renovado
```

- O banco SQLite fica no volume Docker `dados`. Backup: `docker compose cp app:/app/data/reservas.db ./backup-$(date +%F).db`.
- As migrações do banco rodam sozinhas a cada inicialização.
- Atualizar o sistema: `git pull && docker compose up -d --build`.
- **Produção sobe sem nenhuma sala.** O seed de exemplo é só para desenvolvimento.

## 5. Primeiros passos: salas e QR Codes

1. Acesse `https://reservas.suaigreja.org.br/admin` e entre com seu e-mail (PIN).
2. Clique em **Cadastre sua primeira sala**. O número é sugerido automaticamente (S01, S02…) e o andar pode ser escolhido entre os já usados ou digitado.
3. Em **Configurações**, defina a cor de cada andar no Google Agenda, a tolerância do check-in (padrão 15 min) e se a liberação automática por não comparecimento fica ligada.
4. Em **QR Codes**, use **Imprimir todos** (uma folha A5 por sala, com logo, código, nome, andar e QR) e cole cada folha na porta da sala correspondente.
5. Teste: escaneie um QR com o celular **no 4G** (fora do Wi-Fi da igreja). Deve abrir "Sala livre agora".

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

### Google Agenda
- Cada evento leva o título `[S03] Título`, `location` "S03 – Nome (Andar)", a cor do andar e as propriedades privadas `salaNumero`, `reservaId`, `ocorrenciaId` e `tipo`. A descrição traz o responsável com o telefone mascarado.
- **Conflito por sala**: antes de gravar, o sistema consulta a agenda única ao vivo (`events.list`, `singleEvents=true`) na faixa das ocorrências e atribui cada evento a uma sala pela propriedade `salaNumero` ou, se ela não existir, pelo prefixo `[Snn]` do título. Também confere reservas e bloqueios locais. O `freebusy` não é usado porque não diferencia salas. Uma única consulta cobre a faixa inteira de uma reserva de vários dias, em vez de uma por ocorrência, para ficar rápida.
- **Sincronização reversa**: um canal `events.watch` chama `/api/google/webhook` (validado pelo `X-Goog-Channel-Token`). O sistema faz sync incremental com `syncToken`, renova o canal 24 h antes de expirar e, como reserva, faz *polling* a cada 2 minutos.
- Um evento do sistema apagado ou movido direto no Google cancela ou remarca a ocorrência correspondente.
- Eventos externos vinculados a uma sala (ex.: `[S02] Reunião`) aparecem no painel como **Ocupada** e bloqueiam a sala. Como não têm responsável cadastrado, não passam por check-in nem por liberação automática.

### Regras automáticas (job a cada minuto, alinhado à virada do minuto)
- No horário de início: `AGENDADA → EM_ANDAMENTO` (amarelo até o check-in, vermelho depois).
- No horário final: `FINALIZADA`, e a sala aparece **livre** nos dois painéis.
- Sem check-in em X minutos (configurável, padrão 15): `NAO_COMPARECEU`. A sala é liberada e o evento no Google é encurtado até o horário atual.
- Toda mudança é enviada por **SSE** (`/api/stream`), e painéis e listas se atualizam sem recarregar.

### Check-in
O QR aponta para `/checkin/{token}`. A página mostra a ocorrência vigente (que começa em até 15 minutos ou já está em andamento). A presença é confirmada com os **4 últimos dígitos do telefone** do responsável. Há limite de 5 tentativas por IP a cada 10 minutos. A página é HTML puro, sem JavaScript.

### Segurança e LGPD
- O telefone nunca aparece completo nos painéis, no check-in ou no Google (sempre `(67) 9****-1234`). O número completo só aparece no cadastro de pessoas, dentro do `/admin`.
- O log de auditoria (`/admin/auditoria`) registra quem criou, editou, transferiu, cancelou, bloqueou, desativou ou reativou o quê, e quando. O "quem" é o e-mail autenticado no Cloudflare Access.
- Credenciais e IDs ficam só no `.env` e em `secrets/`, nunca no código.

## 8. Desenvolvimento

```bash
npm install
cp .env.example .env      # para dev, basta: DATABASE_URL=file:./dev.db e GOOGLE_FAKE=1
npx prisma migrate deploy
npm run seed:dev          # 3 salas e 2 pessoas fictícias (recusa rodar em produção)
npm run dev               # http://localhost:3000
```

Sem credenciais do Google (ou com `GOOGLE_FAKE=1`), o app usa uma **agenda falsa em memória**, que permite testar tudo sem tocar no Google real. Sem as variáveis do Access, em desenvolvimento o usuário é `DEV_USER_EMAIL`.

### Testes

```bash
npm test
```

Os testes rodam contra um SQLite descartável (`prisma/test.db`) e a agenda falsa, e cobrem:

| Arquivo | Cobre |
|---|---|
| `tests/conflito.test.ts` | conflito por sala na agenda única (reserva × reserva, × evento manual `[S02]`, × `salaNumero`, × bloqueio; salas diferentes liberadas; eventos sem prefixo ou de sala desativada não bloqueiam) |
| `tests/ocorrencias.test.ts` | geração de ocorrências por intervalo, dias da semana, virada de mês e ano, fuso |
| `tests/prefixo.test.ts` | leitura do prefixo `[Snn]` e variações |
| `tests/status.test.ts` | início, liberação automática no horário final, não comparecimento com encurtamento do evento |
| `tests/checkin.test.ts` | telefone errado ou correto, rate limit, QR de sala desativada ou regenerado, sala bloqueada |
| `tests/desativacao.test.ts` | desativação com transferência (inclusive parcial) e com cancelamento; eventos indo para a fila |
| `tests/bloqueio.test.ts` | bloqueio por período, transferência das reservas afetadas, remoção |
| `tests/numero.test.ts` | não reaproveitamento de número (desativação, exclusão, edição) |
| `tests/sincronizacao.test.ts` | sync reverso, padronização sem loop, vínculo em 1 clique, exclusão no Google |

### Estrutura

```
prisma/              schema, migrações e seed de desenvolvimento
src/domain/          regras puras: ocorrências, conflito, prefixo, status, situação do painel
src/services/        casos de uso: salas, reservas, bloqueios, sync com o Google, jobs, check-in…
src/integrations/    gateway do Google Agenda (real e falso em memória)
src/lib/             utilitários: fuso, telefone, SSE, auditoria, trava, rate limit
src/app/             páginas e rotas (painel, disponíveis, admin, check-in, APIs)
tests/               testes automatizados (Vitest)
```

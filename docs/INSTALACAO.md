# Manual de instalação – Sistema de Reservas de Salas | IPI Dourados

Este manual é para a pessoa de TI que vai instalar e manter o sistema no servidor da igreja.
Siga as etapas na ordem. Cada uma termina com uma verificação ("✅ Confira") antes de seguir.

**Tempo estimado:** 2 a 3 horas na primeira vez (a maior parte é configuração no Google e na Cloudflare).

---

## Sumário

0. [Visão geral](#0-visão-geral)
1. [O que você vai precisar](#1-o-que-você-vai-precisar)
2. [Preparar o servidor](#2-preparar-o-servidor)
3. [Google Cloud: API, conta de serviço e login](#3-google-cloud-api-conta-de-serviço-e-login)
4. [Google Agenda: a agenda única do sistema](#4-google-agenda-a-agenda-única-do-sistema)
5. [Cloudflare: domínio e túnel](#5-cloudflare-domínio-e-túnel)
6. [Baixar o projeto e configurar o `.env`](#6-baixar-o-projeto-e-configurar-o-env)
7. [Subir o sistema](#7-subir-o-sistema)
8. [Teste de aceite](#8-teste-de-aceite)
9. [Configuração inicial (com a secretaria)](#9-configuração-inicial-com-a-secretaria)
10. [Operação: backup, atualização e logs](#10-operação-backup-atualização-e-logs)
11. [Problemas comuns](#11-problemas-comuns)
12. [Segurança](#12-segurança)
- [Apêndice A – Variáveis do `.env`](#apêndice-a--variáveis-do-env)
- [Apêndice B – Teste local sem Google](#apêndice-b--teste-local-sem-google)

---

## 0. Visão geral

```
 Celular (4G) / PC / TV
          │ HTTPS  (https://reservas.SEU-DOMINIO)
          ▼
 ┌─────────────────────┐
 │ Cloudflare          │  certificado HTTPS, proteção, nenhuma porta aberta na igreja
 └─────────┬───────────┘
           │ túnel (conexão de SAÍDA do servidor)
 ┌─────────▼──────────────── Servidor da igreja (Docker Compose) ───────────┐
 │  cloudflared  ──►  app (Next.js + SQLite)                                │
 │                     • telas, check-in por QR, painel ao vivo             │
 │                     • tarefas automáticas a cada minuto                  │
 │                     • banco em volume Docker ("dados")                   │
 └──────────────────────────────┬───────────────────────────────────────────┘
                                │ API do Google Calendar
                                ▼
                 Agenda Google "Reservas de Salas – IPI Dourados"
```

- **Dois containers:** `app` (o sistema) e `cloudflared` (o túnel). Nada mais.
- **Banco de dados:** um arquivo SQLite dentro do volume Docker `dados`. Faça backup dele (seção 10).
- **Google Agenda é a fonte da verdade** das reservas. O sistema grava, altera e apaga eventos numa agenda única.
- **Login:** cada pessoa entra com a própria conta Google. Só entra quem foi cadastrado pela secretaria (ou está na lista de administradores fixos).
- **Público sem login:** só a página do QR Code (`/checkin/...`) e o endereço que recebe avisos do Google (`/api/google/webhook`).

---

## 1. O que você vai precisar

| Item | Detalhe |
|---|---|
| **Computador servidor** | Fica ligado 24 h. 2 núcleos, **2 GB de RAM** (4 GB recomendado), 20 GB de disco livre. x86-64 ou ARM64. Pode ser um mini PC simples. |
| **Sistema operacional** | **Ubuntu Server 24.04 LTS** (recomendado). Outro Linux com Docker também serve. |
| **Internet** | A mesma da igreja. **Não precisa de IP fixo nem abrir portas no roteador.** |
| **Domínio da igreja** | Gerenciado pela **Cloudflare** (plano gratuito atende). Ex.: `ipidourados.com.br`. |
| **Conta Google da igreja** | Ex.: a conta da secretaria. Será a dona da agenda e do projeto no Google Cloud. |
| **Conta Cloudflare** | Com acesso ao domínio acima. |
| **Acesso ao repositório** | No GitHub (o Marcelo envia o convite). |
| **Lista de administradores** | E-mails Google do pastor/secretaria que serão administradores. |
| **Logo da igreja** | Arquivo SVG (ou PNG) para os QR Codes impressos. Opcional no início. |

**Decida o endereço do sistema** antes de começar. Neste manual usamos:
`https://reservas.ipidourados.com.br` → troque pelo de vocês em todos os passos.

---

## 2. Preparar o servidor

### 2.1 Sistema e energia
1. Instale o Ubuntu Server 24.04 LTS com usuário administrador (ex.: `ti`) e SSH ativo.
2. Na BIOS/UEFI, ative **"Power On After Power Loss" / "Restore on AC Power Loss" = On**: depois de uma queda de energia o servidor liga sozinho, e o Docker sobe o sistema automaticamente.
3. Fuso horário (não é obrigatório para o sistema, mas facilita ler logs):
   ```bash
   sudo timedatectl set-timezone America/Campo_Grande
   ```
4. Atualizações de segurança automáticas:
   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo apt -y install unattended-upgrades git
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

### 2.2 Docker
Instalação oficial (script da Docker):
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # usar docker sem sudo
# saia e entre de novo no SSH para valer
```

✅ **Confira:**
```bash
docker --version            # 24 ou mais novo
docker compose version      # v2.x
docker run --rm hello-world # mostra "Hello from Docker!"
```

---

## 3. Google Cloud: API, conta de serviço e login

Faça logado com a **conta Google da igreja**, em <https://console.cloud.google.com/>.

### 3.1 Projeto e Calendar API
1. No topo, **Selecionar projeto → Novo projeto**. Nome: `ipi-reservas`. Criar.
2. Menu **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.

### 3.2 Conta de serviço (o "robô" que grava na agenda)
1. **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**.
2. Nome: `reservas-salas`. Não é preciso dar nenhum papel (pule as etapas opcionais). Concluir.
3. Abra a conta criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Um arquivo `.json` será baixado.
4. **Anote o e-mail da conta de serviço**, algo como `reservas-salas@ipi-reservas.iam.gserviceaccount.com`. Ele será usado na seção 4.
5. Guarde o arquivo JSON com cuidado: **ele dá acesso de escrita à agenda**. Nunca envie por WhatsApp/e-mail aberto nem coloque no GitHub.

> Se a organização Google bloquear a criação de chaves ("iam.disableServiceAccountKeyCreation"), um administrador do Google Workspace precisa liberar essa política para o projeto.

### 3.3 Tela de consentimento (login com Google)
1. **APIs e serviços → Tela de consentimento OAuth** (em contas novas aparece como **Google Auth Platform**).
2. **Tipo de usuário: Externo** (os membros usam contas @gmail.com).
3. Preencha:
   - Nome do app: `Reservas de Salas – IPI Dourados`
   - E-mail de suporte: o da secretaria
   - Logo (opcional)
   - **Domínios autorizados:** `ipidourados.com.br`
   - E-mail de contato do desenvolvedor: o seu
4. **Escopos / Acesso a dados:** adicione **somente** `openid`, `.../auth/userinfo.email` e `.../auth/userinfo.profile`.
   **Não adicione `calendar.events`** nem nenhum escopo de agenda: o sistema não acessa a agenda pessoal dos membros.
5. **Público-alvo → Publicar app** (sair de "Em teste").
   Com apenas os escopos básicos acima, o Google normalmente **não exige verificação** do app. Enquanto estiver "Em teste", só entram as contas listadas em "Usuários de teste".

### 3.4 Cliente OAuth (credencial do login)
1. **Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo: **Aplicativo da Web**. Nome: `Reservas – produção`.
3. **URIs de redirecionamento autorizados:** adicione exatamente
   `https://reservas.ipidourados.com.br/api/auth/google/callback`
4. Criar. Copie o **ID do cliente** e a **Chave secreta do cliente** (vão para o `.env` na seção 6).

✅ **Confira:** você tem em mãos (1) o arquivo JSON da conta de serviço, (2) o e-mail dela, (3) o ID do cliente OAuth e (4) a chave secreta do cliente.

---

## 4. Google Agenda: a agenda única do sistema

Ainda com a conta Google da igreja, em <https://calendar.google.com/>:

1. Ao lado de **Outras agendas**, clique em **+ → Criar nova agenda**.
   - Nome: **Reservas de Salas – IPI Dourados**
   - Fuso horário: **(GMT-04:00) Horário de Campo Grande**
2. Abra **Configurações** dessa agenda → **Compartilhar com pessoas específicas → Adicionar pessoas e grupos**:
   - E-mail da **conta de serviço** (seção 3.2), permissão **"Fazer alterações nos eventos"**.
3. Na mesma página, em **Integrar agenda**, copie o **ID da agenda** (`…@group.calendar.google.com`).
4. Se a equipe quiser acompanhar a agenda pelo Google, compartilhe com ela **apenas como "Ver todos os detalhes do evento"**.

> ⚠️ **Regra importante para a equipe:** todas as reservas são feitas **pelo sistema**. Se alguém criar um evento direto nesta agenda pelo Google, o sistema **apaga esse evento automaticamente** (registrando título, horário e motivo na auditoria), porque ele não tem responsável nem sala identificados. Eventos criados pelo sistema que forem movidos ou apagados no Google continuam sendo refletidos no sistema. Por isso, **a conta de serviço deve ser a única com permissão de edição**.

✅ **Confira:** a agenda aparece em "Minhas agendas" e o e-mail da conta de serviço está na lista de compartilhamento com "Fazer alterações nos eventos".

---

## 5. Cloudflare: domínio e túnel

Pré-requisito: o domínio `ipidourados.com.br` já está na sua conta Cloudflare (status **Ativo**).
Se não estiver: **Adicionar um site** → plano Free → troque os servidores DNS no registro.br pelos que a Cloudflare indicar e aguarde ficar ativo.

1. No painel Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
2. Nome: `ipi-reservas` → Save.
3. Na tela de instalação **não instale nada no servidor**: copie apenas o **token** (o texto longo depois de `--token`). Ele vai para `TUNNEL_TOKEN` no `.env`.
4. Avance para **Public Hostname** (ou **Published application routes**) e adicione:
   - Subdomain: `reservas` · Domain: `ipidourados.com.br`
   - Service: **HTTP** · URL: **`app:3000`**
5. Salve.

**Não crie** uma aplicação no **Cloudflare Access** para este endereço: o login é feito pelo próprio sistema com a conta Google. Se uma foi criada antes, remova em **Zero Trust → Access → Applications**.

✅ **Confira:** o túnel aparece na lista (ficará **Healthy** quando o sistema subir na seção 7) e existe um registro DNS `reservas` do tipo **Tunnel**.

---

## 6. Baixar o projeto e configurar o `.env`

No servidor:

```bash
cd ~
git clone https://github.com/marcelohsrocha/reserve.git ipi-reservas
cd ipi-reservas
cp .env.example .env
mkdir -p secrets
```

### 6.1 Credencial da conta de serviço
Copie o arquivo JSON da seção 3.2 para o servidor com o nome **exato** `secrets/service-account.json`. Do seu computador:
```bash
scp ~/Downloads/ipi-reservas-xxxx.json ti@IP-DO-SERVIDOR:~/ipi-reservas/secrets/service-account.json
```
No servidor, restrinja o acesso:
```bash
chmod 600 secrets/service-account.json
chmod 600 .env
```

### 6.2 Gere dois segredos aleatórios
```bash
openssl rand -hex 32   # copie para GOOGLE_WEBHOOK_TOKEN
openssl rand -hex 32   # copie para SESSION_SECRET (outro valor!)
```

### 6.3 Edite o `.env`
```bash
nano .env
```
Preencha (detalhes no [Apêndice A](#apêndice-a--variáveis-do-env)):

```ini
PUBLIC_BASE_URL=https://reservas.ipidourados.com.br
DATABASE_URL=file:/app/data/reservas.db
GOOGLE_CALENDAR_ID=xxxxxxxx@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_FILE=/app/secrets/service-account.json
GOOGLE_WEBHOOK_TOKEN=<primeiro segredo>
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<chave secreta do cliente>
SESSION_SECRET=<segundo segredo>
ADMIN_EMAILS=pastor@gmail.com,secretaria@gmail.com
TUNNEL_TOKEN=<token do túnel>
```

- `PUBLIC_BASE_URL` precisa ser **https** e **sem barra no final**. É o endereço impresso nos QR Codes: trocar depois exige reimprimir.
- `ADMIN_EMAILS`: contas Google que **sempre** entram como administradoras, mesmo sem cadastro. Use e-mails reais, separados por vírgula.

### 6.4 Logo (opcional agora)
Substitua `public/logo.svg` pelo logo oficial **com o mesmo nome**. Se for PNG, converta para SVG ou peça ao Marcelo para ajustar o código.

✅ **Confira:**
```bash
grep -E "^(PUBLIC_BASE_URL|GOOGLE_CALENDAR_ID|GOOGLE_OAUTH_CLIENT_ID|ADMIN_EMAILS)=" .env
ls -l secrets/service-account.json     # deve existir, permissão -rw-------
```

---

## 7. Subir o sistema

```bash
docker compose up -d --build
```

A primeira vez leva de 5 a 10 minutos (baixa imagens e compila). Depois:

```bash
docker compose ps              # app deve ficar "healthy"; cloudflared "running"
docker compose logs -f app     # Ctrl+C para sair dos logs
```

Nos logs do `app`, você deve ver:
- as migrações do banco aplicadas (`prisma migrate deploy` … `All migrations have been successfully applied` ou `No pending migrations`);
- `[jobs] status (1 min), sync Google (2 min) e renovação do watch (1 h) iniciados.`
- **nenhuma** linha `[google] Usando agenda FALSA` (se aparecer, as credenciais do Google não foram encontradas: reveja a seção 6).

> **Primeira instalação = primeira validação do build Docker.** O sistema foi testado (69 testes automáticos, build de produção e teste local), mas a imagem Docker completa ainda não foi montada num servidor real. Se o `docker compose up --build` falhar, copie as últimas 50 linhas do erro (`docker compose build app 2>&1 | tail -50`) e envie ao Marcelo.

✅ **Confira:**
```bash
docker compose exec app wget -qO- http://127.0.0.1:3000/api/health   # deve responder {"ok":true}
```
E pelo celular, **fora do Wi-Fi da igreja (4G)**: abra `https://reservas.ipidourados.com.br/api/health`.

---

## 8. Teste de aceite

Faça este roteiro com um administrador (e-mail de `ADMIN_EMAILS`) e marque cada item:

| # | Teste | Resultado esperado |
|---|---|---|
| 1 | Abrir `https://reservas.ipidourados.com.br` | Tela "Entrar com Google" |
| 2 | Entrar com um e-mail de `ADMIN_EMAILS` | Pede o celular (primeiro acesso) e abre a administração |
| 3 | Entrar com um Gmail **não cadastrado** | "Esta conta Google não tem acesso…" |
| 4 | Cadastrar uma sala (Salas → Nova sala) | Recebe o código S01; aparece em `/painel` sem recarregar |
| 5 | Criar uma reserva para hoje, daqui a 1 h | Em até 5 s aparece na agenda Google com título `[S01] …`, local e cor do andar |
| 6 | Tentar outra reserva na **mesma sala e horário** | O sistema mostra a sala como ocupada e não deixa reservar |
| 7 | Mesma hora, **outra sala** | Permitido |
| 8 | Imprimir o QR da S01 e escanear com o celular **no 4G** | Abre a página do QR com a situação da sala |
| 9 | Na hora da reserva, confirmar presença (4 dígitos do celular do responsável, ou 1 toque se estiver logado) | Painel fica vermelho ("Ocupada") |
| 10 | Clicar **Encerrar agora** na página do QR | Sala fica verde no painel; evento no Google é encurtado |
| 11 | Criar um evento **direto no Google** nessa agenda | Em até 2 min ele é apagado e aparece na Auditoria |
| 12 | Desligar e ligar o servidor | Sistema volta sozinho em alguns minutos |
| 13 | Cloudflare → Tunnels | Túnel **Healthy** |

---

## 9. Configuração inicial (com a secretaria)

1. **Salas** (Administração → Salas → Nova sala): número (sugerido automaticamente), nome e andar.
   O número é o identificador da sala no Google (S01, S02…) e **nunca é reaproveitado**, mesmo se a sala for desativada.
2. **Configurações:** cor de cada andar no Google Agenda, tolerância do check-in (padrão 15 min) e liberação automática por não comparecimento (liga/desliga).
3. **QR Codes → Imprimir todos:** uma folha A5 por sala. Cole na porta correspondente.
4. **Pessoas:** cadastre quem pode reservar com **nome + e-mail da conta Google** e o papel (*Membro* ou *Administrador*). O celular pode ficar em branco: a própria pessoa informa no primeiro acesso.
5. **TV do painel:** no navegador da TV, entre uma vez com uma conta cadastrada (ex.: a da secretaria), abra `/painel` e clique em **Tela cheia**. A sessão dura 30 dias; depois é só entrar de novo.
6. **Link no app/site da igreja:** use `https://reservas.ipidourados.com.br/admin/reservas/nova`.
   O link precisa abrir **no navegador** (Safari/Chrome ou a janela de navegador que o app abre por cima). Se o app abrir o link numa tela embutida (WebView), **o Google bloqueia o login** por regra de segurança dele.

O uso diário está descrito em [FUNCIONAMENTO.md](FUNCIONAMENTO.md).

---

## 10. Operação: backup, atualização e logs

### 10.1 Backup do banco (faça isso!)
O banco tem as salas, pessoas, reservas, check-ins e auditoria. O Google tem só os eventos. **Sem backup, uma pane no disco apaga o cadastro.**

Backup manual:
```bash
cd ~/ipi-reservas
./scripts/backup.sh          # cria backups/reservas-AAAA-MM-DD_HHMM.db
```
O script faz uma cópia consistente (mesmo com o sistema em uso) e mantém os últimos 30 arquivos.

Backup automático todo dia às 3 h:
```bash
crontab -e
# adicione a linha:
0 3 * * * cd /home/ti/ipi-reservas && ./scripts/backup.sh >> backups/backup.log 2>&1
```

**Leve uma cópia para fora do servidor** (Google Drive da igreja, HD externo etc.) pelo menos uma vez por semana.

Restaurar um backup:
```bash
cd ~/ipi-reservas
docker compose stop app
docker compose cp backups/reservas-AAAA-MM-DD_HHMM.db app:/app/data/reservas.db
docker compose start app
```

### 10.2 Atualizar o sistema
Quando o Marcelo avisar de uma versão nova:
```bash
cd ~/ipi-reservas
./scripts/backup.sh
git pull
docker compose up -d --build
docker compose logs --tail=50 app
```
As migrações do banco rodam sozinhas na inicialização.

### 10.3 Comandos do dia a dia
| Para… | Comando |
|---|---|
| Ver se está tudo rodando | `docker compose ps` |
| Ver logs ao vivo | `docker compose logs -f app` |
| Ver logs do túnel | `docker compose logs -f cloudflared` |
| Reiniciar o sistema | `docker compose restart app` |
| Parar tudo | `docker compose down` (os dados ficam no volume) |
| Subir de novo | `docker compose up -d` |
| Espaço em disco do Docker | `docker system df` |
| Limpar imagens antigas | `docker image prune -f` |

> ⚠️ **Nunca** use `docker compose down -v` nem `docker volume rm`: o `-v` **apaga o banco de dados**.

---

## 11. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Página com "Login Google não configurado" (erro 503) | Faltam `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` ou `SESSION_SECRET` | Preencha o `.env` e rode `docker compose up -d` |
| Google mostra **"redirect_uri_mismatch"** | URI de redirecionamento diferente do `PUBLIC_BASE_URL` | Seção 3.4: tem que ser exatamente `PUBLIC_BASE_URL` + `/api/auth/google/callback` |
| Google mostra **"disallowed_useragent"** / "Este navegador pode não ser seguro" | Link aberto dentro de um app (WebView) | Abrir no Safari/Chrome (seção 9, item 6) |
| "Esta conta Google não tem acesso" ao entrar | E-mail não cadastrado em Pessoas nem em `ADMIN_EMAILS`, ou cadastro desativado | Cadastrar o e-mail Google exato da pessoa |
| Reserva não aparece no Google | Agenda não compartilhada com a conta de serviço, ou ID da agenda errado | Seção 4; ver `docker compose logs app \| grep -i google` |
| Logs mostram `[google] Usando agenda FALSA` | Sistema não achou a credencial | `secrets/service-account.json` existe? `GOOGLE_CALENDAR_ID` preenchido? |
| Erro 403 "insufficient permissions" nos logs | Permissão da conta de serviço na agenda é só leitura | Trocar para "Fazer alterações nos eventos" |
| Site fora do ar (erro 1033 da Cloudflare) | Container `cloudflared` parado ou token errado | `docker compose logs cloudflared`; conferir `TUNNEL_TOKEN` |
| Erro 502 da Cloudflare | `app` parado ou ainda subindo | `docker compose ps`; aguardar o "healthy" |
| QR Code abre endereço errado | `PUBLIC_BASE_URL` mudou depois da impressão | Corrigir o `.env` e **reimprimir** os QR Codes |
| Painel da TV não atualiza sozinho | Rede da TV corta conexões longas | Recarregar a página; o painel também se atualiza a cada 60 s |
| Horários com 1 h de diferença | Agenda Google criada em outro fuso | Configurações da agenda → fuso **Campo Grande (GMT-04:00)** |

---

## 12. Segurança

- **Nunca** coloque no GitHub ou envie por mensagem: `.env`, `secrets/service-account.json`, backups do banco. O `.gitignore` do projeto já ignora esses arquivos.
- O sistema **não expõe portas**: só a Cloudflare chega até ele, pelo túnel.
- Telefones aparecem **sempre mascarados** em painéis, QR e Google Agenda (LGPD). O número completo só aparece para administradores, na administração.
- Check-in pelo QR: no máximo 5 tentativas de dígitos por aparelho a cada 10 minutos.
- Tudo o que muda (salas, pessoas, reservas, check-ins, bloqueios) fica na **Auditoria**, com quem fez e quando.
- **Se o arquivo da conta de serviço vazar:** no Google Cloud, apague a chave (Conta de serviço → Chaves → excluir), crie outra, troque o arquivo em `secrets/` e rode `docker compose up -d`.
- **Trocar o `SESSION_SECRET`** desconecta todo mundo (cada um entra de novo com o Google). Use se suspeitar de acesso indevido.
- Mantenha o servidor atualizado (`unattended-upgrades`, seção 2.1) e só com acesso SSH por chave, se possível.

---

## Apêndice A – Variáveis do `.env`

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `PUBLIC_BASE_URL` | Sim | Endereço público (https, sem barra final). Vai nos QR Codes, no login e no webhook do Google. |
| `DATABASE_URL` | Sim | Deixe `file:/app/data/reservas.db` (fica no volume Docker `dados`). |
| `GOOGLE_CALENDAR_ID` | Sim | ID da agenda única (seção 4). |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Sim* | Caminho do JSON dentro do container: `/app/secrets/service-account.json`. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sim* | Alternativa: o JSON inteiro numa linha (use uma das duas). |
| `GOOGLE_WEBHOOK_TOKEN` | Sim | Segredo que o Google devolve nos avisos de mudança da agenda. |
| `GOOGLE_OAUTH_CLIENT_ID` | Sim | ID do cliente OAuth (login). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Sim | Chave secreta do cliente OAuth. |
| `SESSION_SECRET` | Sim | Assina o cookie de login. Trocar = todos entram de novo. |
| `ADMIN_EMAILS` | Sim | Contas Google que sempre são administradoras (separadas por vírgula). |
| `TUNNEL_TOKEN` | Sim | Token do túnel Cloudflare. |
| `JOBS_DISABLED` | Não | `1` desliga as tarefas automáticas (só para diagnóstico). |
| `GOOGLE_FAKE` | Não | `1` usa uma agenda falsa em memória. **Nunca em produção.** |

---

## Apêndice B – Teste local sem Google

Para conhecer o sistema num Mac/PC antes de instalar (sem Google, sem Docker, sem Cloudflare):

```bash
git clone https://github.com/marcelohsrocha/reserve.git && cd reserve
npm run teste:local
```

Requer **Node.js 20 ou mais novo** e ferramentas de compilação (no Mac: `xcode-select --install`; no Ubuntu: `sudo apt install build-essential python3`).
O comando cria um banco de demonstração com 5 salas e reservas em volta do horário atual e abre o navegador.
Entre com `admin@dev.local` (login simulado, sem senha). Para recomeçar do zero: `npm run teste:local -- --zerar`.

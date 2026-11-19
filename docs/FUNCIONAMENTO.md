# Como o sistema funciona – Reservas de Salas | IPI Dourados

Guia para a secretaria, os administradores e o TI. Explica o que cada tela faz, as regras automáticas e o que fazer no dia a dia.
A instalação está em [INSTALACAO.md](INSTALACAO.md).

---

## 1. Em uma frase

Cada sala da igreja tem um código (S01, S02…). As pessoas reservam pelo celular, a reserva aparece na agenda Google da igreja, um painel mostra em tempo real o que acontece em cada sala, e um QR Code colado na porta confirma que o grupo chegou. Se ninguém aparecer, a sala é liberada sozinha.

---

## 2. Quem usa e o que pode fazer

| | Membro | Administrador |
|---|---|---|
| Ver painel, salas livres e agenda | ✓ (das reservas dos outros, só o horário) | ✓ completo |
| Reservar (para si mesmo) | ✓ | ✓, e também em nome de outra pessoa |
| Cancelar, remarcar, transferir, encerrar antes | só as próprias reservas | todas |
| Cadastrar salas, bloqueios, QR Codes, pessoas, configurações | — | ✓ |
| Ver auditoria e ranking de uso por pessoa | — | ✓ |

- **Para entrar**, a pessoa precisa estar cadastrada em *Pessoas* com o **e-mail da conta Google** dela (feito por um administrador). Os e-mails da lista fixa de administradores (configurada pelo TI) entram sempre.
- **No primeiro acesso**, o sistema pede o celular da pessoa. Ele é usado para confirmar presença no QR Code.
- **Tirar o acesso:** em *Pessoas*, desmarque "Pode entrar no sistema". O histórico de reservas continua guardado.
- O login dura **30 dias** no mesmo aparelho.
- **Privacidade entre membros:** quem reserva precisa saber *onde e quando* há sala livre, não *quem* está usando. Por isso o membro vê título e responsável **só das próprias reservas**; as dos outros aparecem apenas como **"Reservado"** com o horário (no painel, na agenda, na tela inicial e nas mensagens de conflito). Bloqueios continuam mostrando o motivo (ex.: "Reforma"), porque não são dado pessoal.
- **TV do painel:** entre com uma conta de **administrador** para a TV mostrar o nome das atividades. Com conta de membro, a TV mostra só "Reservado".

---

## 3. As telas

| Tela | Endereço | Para quê |
|---|---|---|
| **Painel "Agora"** | `/painel` | Modo TV: um cartão por sala, agrupado por andar, com cores e relógio. Atualiza sozinho. |
| **Salas disponíveis** | `/disponiveis` | Salas livres agora ("livre até 19:00") e busca de horário futuro. |
| **Administração** | `/admin` | Início, reservas, agenda semanal, salas, pessoas, QR Codes, configurações e auditoria (conforme o perfil). |
| **Nova reserva** | `/admin/reservas/nova` | Formulário de reserva. É o link para colocar no app/site da igreja. |
| **Página do QR** | `/checkin/...` | Aberta ao escanear o QR da porta. Não exige login. |

### Cores do painel
| Cor | Situação | Significa |
|---|---|---|
| 🟢 Verde | **Livre** | Ninguém usando. Mostra até que horas fica livre e o próximo agendamento. |
| 🟡 Amarelo | **Reservada – aguardando check-in** | A reserva começou, mas o grupo ainda não confirmou presença no QR. |
| 🔴 Vermelho | **Ocupada** | Presença confirmada. Mostra a atividade, o responsável e uma barra do tempo. |
| ⚪ Cinza | **Bloqueada** | Sala indisponível por um período (ex.: reforma), com o motivo. |

---

## 4. Fazer uma reserva ("quando → onde")

1. **Quando?** Escolha a data e o horário de início. Toque numa duração (1h, 1h30, 2h, 3h) ou ajuste o fim.
   Para algo que se repete (ex.: ensaio toda terça e quinta), marque **Repetir em vários dias**, escolha até que data e, se quiser, os dias da semana.
2. **Onde?** O sistema mostra na hora quais salas estão livres:
   - **"Livre"** ou **"Livre nas 8 datas"**: pode escolher.
   - **"Ocupada em 2 de 8"**: algumas datas estão ocupadas. Ao escolher, aparece quais são e a opção **"Reservar só as datas livres"**.
   - Salas totalmente ocupadas ficam escondidas (dá para ver o motivo em "Ver salas ocupadas").
3. **Para quê?** Informe o título (ex.: "Ensaio do louvor"). O administrador também pode escolher outro responsável.
4. Toque em **Reservar**. A reserva é gravada no sistema e aparece na agenda Google da igreja em segundos.

Na página da reserva aparece **"Adicionar à minha agenda"**: um link do Google Agenda (por data) e um arquivo `.ics` com todas as datas, que funciona no iPhone, no Google e no Outlook. É só um lembrete pessoal: se a reserva mudar depois, o lembrete não muda sozinho.

**Regras:**
- Não é possível reservar uma sala já ocupada, nem num período de bloqueio.
- Salas diferentes no mesmo horário são permitidas normalmente.
- Reservas "encostadas" (19h–21h e 21h–22h) são permitidas.
- Limite de 400 datas por reserva.

---

## 5. Na porta da sala: o QR Code

Cada sala tem um QR Code impresso (folha A5) colado na porta. Ao escanear:

| Situação | O que aparece |
|---|---|
| Há reserva começando em até 15 min ou em andamento | Título, horário, responsável (telefone mascarado) e o botão para **confirmar presença** |
| Sala livre | "Sala livre agora" e o próximo agendamento |
| Sala bloqueada | "Sala bloqueada – motivo" e até quando |
| Sala desativada ou QR substituído | "Sala indisponível" |

**Confirmar presença (check-in):**
- **Logado como responsável pela reserva (ou administrador):** 1 toque em *Confirmar presença*.
- **Sem login:** digitar os **4 últimos dígitos do celular do responsável**. Máximo de 5 tentativas a cada 10 minutos por aparelho.

**Terminou mais cedo?** Depois do início, a página oferece **Encerrar agora e liberar a sala** (1 toque logado, ou os 4 dígitos). A sala fica verde no painel na hora e o evento no Google é encurtado. Isso mantém o painel confiável para quem procura sala.

---

## 6. O que o sistema faz sozinho (a cada minuto)

| Momento | O que acontece |
|---|---|
| Horário de início | A reserva passa para **Em andamento** (amarelo no painel). |
| Check-in feito | **Confirmada** (vermelho). |
| Sem check-in depois da tolerância (padrão **15 min**) | **Não compareceu**: a sala é liberada e o evento no Google é encurtado até aquele minuto. Pode ser desligado em *Configurações*. |
| Horário final | **Finalizada**: a sala fica livre nas duas telas, sem ninguém precisar fazer nada. |
| Início e fim de um bloqueio | A sala fica cinza e volta ao normal no horário certo. |

Todas as telas abertas se atualizam sozinhas quando algo muda (e, por segurança, também a cada 60 segundos).

---

## 7. Integração com o Google Agenda

- Existe **uma única agenda** ("Reservas de Salas – IPI Dourados") para todas as salas.
- Cada data reservada vira **um evento** com:
  - título `[S03] Ensaio do louvor` (o código da sala sempre na frente);
  - local `S03 – Sala de Música (1º andar)`;
  - **cor do andar** (configurável em *Configurações*);
  - descrição com o responsável e o telefone **mascarado**.
- Bloqueios aparecem como `[S03] BLOQUEADA – Reforma`.
- Cancelar, remarcar, trocar de sala ou encerrar no sistema **atualiza o Google na hora**.
- Se alguém **mover ou apagar** no Google um evento criado pelo sistema, o sistema acompanha (remarca ou cancela).
- ⚠️ **Eventos criados direto no Google nessa agenda são apagados automaticamente** (com registro na auditoria), porque não têm responsável nem sala identificados. **Toda reserva deve ser feita pelo sistema.**

---

## 8. Administração das salas

| Ação | Onde | Efeito |
|---|---|---|
| **Nova sala** | Salas → Nova sala | Recebe o próximo número (S01, S02…). Aparece em todas as telas na hora. |
| **Editar** | Salas → Gerenciar | Nome e andar podem mudar. O **número** só muda se não houver reservas futuras. |
| **Bloquear por período** | Salas → Gerenciar → Bloquear | Ex.: reforma de 10/11 a 20/11. Impede reservas e fica cinza no painel. Se já houver reservas no período, o sistema obriga a **transferir** ou **cancelar** antes. |
| **Desativar** | Salas → Gerenciar → Desativar | A sala deixou de existir/estar disponível. Também obriga a transferir ou cancelar as reservas futuras. Some dos painéis, o QR passa a mostrar "Sala indisponível", mas continua no histórico. |
| **Reativar** | Salas → filtro "Desativadas" | Volta com o mesmo número e um **QR novo** (imprimir e trocar o da porta). |
| **Regenerar QR** | QR Codes → Regenerar | Invalida o QR anterior na hora (ex.: foto do QR circulando). |
| **Excluir** | Salas → Gerenciar | Só para salas que nunca tiveram reserva. |

**O número de uma sala nunca é reaproveitado.** Se a S04 for desativada, a próxima sala nova será a S05. Isso evita confusão com o histórico e com eventos antigos no Google.

---

## 9. Privacidade (LGPD) e auditoria

- O telefone **nunca aparece completo** no painel, na página do QR ou no Google: sempre `(67) 9****-1234`. O número completo só aparece para administradores, na administração.
- O sistema não acessa a agenda pessoal, os e-mails ou os contatos de ninguém. Do login com Google ele só recebe **nome e e-mail**.
- Membros não veem o nome de quem reservou as outras salas nem o título dessas reservas (seção 2).
- A **Auditoria** registra quem criou, editou, transferiu, cancelou, bloqueou, desativou, reativou ou confirmou presença, e quando.

---

## 10. Rotina sugerida

| Quando | Quem | O quê |
|---|---|---|
| Ao chegar alguém novo | Secretaria | Cadastrar em *Pessoas* com o e-mail Google |
| Semanalmente | Secretaria | Conferir a *Agenda* da semana e os "não compareceu" |
| Ao mudar uma sala | Administrador | Bloquear/desativar pelo sistema (nunca só no Google) |
| Ao trocar um QR | Administrador | Regenerar, imprimir e colar o novo |
| Diariamente (automático) | Servidor | Backup do banco (configurado pelo TI) |
| Semanalmente | TI | Copiar um backup para fora do servidor |
| Quando houver versão nova | TI | Atualizar (INSTALACAO.md, seção 10.2) |

---

## 11. Perguntas frequentes

**Esqueci de fazer check-in e a sala foi liberada. E agora?**
A reserva vira "Não compareceu". Se a sala ainda estiver livre, faça uma nova reserva a partir de agora. Para evitar, use o check-in de 1 toque (entre no sistema pelo celular antes).

**Quem chegou primeiro não sabe os 4 dígitos.**
O responsável pode confirmar com 1 toque pelo celular dele (logado), ou passar os 4 últimos dígitos para o grupo. Um administrador logado também pode confirmar.

**Posso reservar pelo Google Agenda?**
Não. Eventos criados direto na agenda do sistema são apagados. Use o sistema (ou o link no app da igreja).

**O link no app da igreja dá erro do Google ao entrar.**
O app está abrindo o link "por dentro" (WebView), e o Google bloqueia login nesse tipo de tela. Configure o link para abrir no navegador.

**A TV do painel pediu login de novo.**
A sessão dura 30 dias. Entre de novo com a conta da secretaria e volte para `/painel`.

**Trocamos o nome de uma sala. Precisa reimprimir o QR?**
O QR continua funcionando (ele não muda). Reimprima só se quiser o nome novo na folha.

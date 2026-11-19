-- A cópia automática na agenda pessoal foi substituída pelo botão "Adicionar à minha agenda".
-- Os tokens de acesso guardados deixam de ser usados e são apagados (as colunas ficam, sem uso).
UPDATE "Pessoa" SET "googleRefreshToken" = NULL, "agendaConectadaEm" = NULL;
UPDATE "Ocorrencia" SET "googleEventIdPessoal" = NULL, "pessoaAgendaId" = NULL;

-- AlterTable
ALTER TABLE "Ocorrencia" ADD COLUMN "googleEventIdPessoal" TEXT;
ALTER TABLE "Ocorrencia" ADD COLUMN "pessoaAgendaId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pessoa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefoneE164" TEXT,
    "papel" TEXT NOT NULL DEFAULT 'MEMBRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "googleRefreshToken" TEXT,
    "agendaConectadaEm" DATETIME,
    "ultimoAcessoEm" DATETIME,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Pessoa" ("criadaEm", "id", "nome", "telefoneE164") SELECT "criadaEm", "id", "nome", "telefoneE164" FROM "Pessoa";
DROP TABLE "Pessoa";
ALTER TABLE "new_Pessoa" RENAME TO "Pessoa";
CREATE UNIQUE INDEX "Pessoa_email_key" ON "Pessoa"("email");
CREATE UNIQUE INDEX "Pessoa_telefoneE164_key" ON "Pessoa"("telefoneE164");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Todo evento precisa vir do sistema: o espelho de eventos externos deixa de existir e a próxima
-- sincronização é completa, para apagar da agenda única os eventos futuros sem identificação.
DELETE FROM "EventoGoogle" WHERE "tipo" = 'externo';
UPDATE "Configuracao" SET "googleSyncToken" = NULL;

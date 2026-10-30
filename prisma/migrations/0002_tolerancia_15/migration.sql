-- Tolerância padrão do check-in passa a ser 15 minutos.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Configuracao" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "toleranciaCheckinMin" INTEGER NOT NULL DEFAULT 15,
    "liberacaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "corPadrao" TEXT NOT NULL DEFAULT '8',
    "googleSyncToken" TEXT,
    "watchChannelId" TEXT,
    "watchResourceId" TEXT,
    "watchExpiraEm" DATETIME,
    "ultimoSyncEm" DATETIME
);
INSERT INTO "new_Configuracao" SELECT * FROM "Configuracao";
DROP TABLE "Configuracao";
ALTER TABLE "new_Configuracao" RENAME TO "Configuracao";
-- Instalações que ainda estavam no padrão antigo (20) passam para 15.
UPDATE "Configuracao" SET "toleranciaCheckinMin" = 15 WHERE "toleranciaCheckinMin" = 20;
PRAGMA foreign_keys=ON;

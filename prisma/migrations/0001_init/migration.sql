-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "andar" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desativadaEm" DATETIME
);

-- CreateTable
CREATE TABLE "NumeroSalaUsado" (
    "numero" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "telefoneE164" TEXT NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salaId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "dataInicio" TEXT NOT NULL,
    "dataFim" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "diasSemana" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" DATETIME NOT NULL,
    CONSTRAINT "Reserva_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reserva_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ocorrencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservaId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "inicioUtc" DATETIME NOT NULL,
    "fimUtc" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "checkinEm" DATETIME,
    "googleEventId" TEXT,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" DATETIME NOT NULL,
    CONSTRAINT "Ocorrencia_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ocorrencia_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salaId" TEXT NOT NULL,
    "inicioUtc" DATETIME NOT NULL,
    "fimUtc" DATETIME NOT NULL,
    "motivo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "googleEventId" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bloqueio_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventoGoogle" (
    "googleEventId" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "inicioUtc" DATETIME NOT NULL,
    "fimUtc" DATETIME NOT NULL,
    "salaNumero" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'externo',
    "ocorrenciaId" TEXT,
    "bloqueioId" TEXT,
    "estado" TEXT NOT NULL,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CorAndar" (
    "andar" TEXT NOT NULL PRIMARY KEY,
    "colorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "toleranciaCheckinMin" INTEGER NOT NULL DEFAULT 20,
    "liberacaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "corPadrao" TEXT NOT NULL DEFAULT '8',
    "googleSyncToken" TEXT,
    "watchChannelId" TEXT,
    "watchResourceId" TEXT,
    "watchExpiraEm" DATETIME,
    "ultimoSyncEm" DATETIME
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quem" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "detalhes" TEXT,
    "em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Sala_numero_key" ON "Sala"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Sala_qrToken_key" ON "Sala"("qrToken");

-- CreateIndex
CREATE INDEX "Sala_ativa_idx" ON "Sala"("ativa");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_telefoneE164_key" ON "Pessoa"("telefoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Ocorrencia_googleEventId_key" ON "Ocorrencia"("googleEventId");

-- CreateIndex
CREATE INDEX "Ocorrencia_salaId_inicioUtc_idx" ON "Ocorrencia"("salaId", "inicioUtc");

-- CreateIndex
CREATE INDEX "Ocorrencia_status_idx" ON "Ocorrencia"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Bloqueio_googleEventId_key" ON "Bloqueio"("googleEventId");

-- CreateIndex
CREATE INDEX "Bloqueio_salaId_inicioUtc_idx" ON "Bloqueio"("salaId", "inicioUtc");

-- CreateIndex
CREATE INDEX "EventoGoogle_estado_inicioUtc_idx" ON "EventoGoogle"("estado", "inicioUtc");

-- CreateIndex
CREATE INDEX "EventoGoogle_salaNumero_inicioUtc_idx" ON "EventoGoogle"("salaNumero", "inicioUtc");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Auditoria_em_idx" ON "Auditoria"("em");


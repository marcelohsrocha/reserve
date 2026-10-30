/** Abstração da agenda única do Google, para trocar a implementação real por uma falsa nos testes. */

export interface EventoAgenda {
  id: string;
  titulo: string;
  inicio: Date;
  fim: Date;
  location?: string | null;
  descricao?: string | null;
  colorId?: string | null;
  privado: Record<string, string>;
  cancelado: boolean;
}

export interface DadosEvento {
  titulo: string;
  inicio: Date;
  fim: Date;
  location?: string;
  descricao?: string;
  colorId?: string;
  privado?: Record<string, string>;
}

export interface ResultadoSync {
  eventos: EventoAgenda[];
  proximoSyncToken: string;
}

export class SyncTokenInvalido extends Error {}

export interface CalendarGateway {
  /** events.list com singleEvents=true na janela; filtro opcional por propriedade privada salaNumero. */
  listarJanela(inicio: Date, fim: Date, filtro?: { salaNumero?: number }): Promise<EventoAgenda[]>;
  criar(dados: DadosEvento): Promise<string>;
  /** Patch parcial; `privado` é mesclado com as propriedades existentes. */
  atualizar(id: string, dados: Partial<DadosEvento>): Promise<void>;
  remover(id: string): Promise<void>;
  /** Sync incremental. Sem token = sincronização completa. Lança SyncTokenInvalido em 410. */
  sincronizar(syncToken: string | null): Promise<ResultadoSync>;
  observar(canalId: string, url: string, token: string): Promise<{ resourceId: string; expiracao: Date }>;
  pararObservacao(canalId: string, resourceId: string): Promise<void>;
}

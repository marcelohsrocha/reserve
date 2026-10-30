import { randomUUID } from 'node:crypto';
import type { CalendarGateway, DadosEvento, EventoAgenda, ResultadoSync } from './gateway';
import { SyncTokenInvalido } from './gateway';

/**
 * Agenda em memória com a mesma semântica usada do Google (sync incremental por versão).
 * Usada nos testes e no desenvolvimento sem credenciais.
 */
export class AgendaFalsa implements CalendarGateway {
  eventos = new Map<string, EventoAgenda & { versao: number }>();
  versao = 0;
  chamadas: string[] = [];

  reiniciar() {
    this.eventos.clear();
    this.versao = 0;
    this.chamadas = [];
  }

  /** Simula um evento criado manualmente por alguém direto no Google Agenda. */
  criarManual(titulo: string, inicio: Date, fim: Date, privado: Record<string, string> = {}): string {
    const id = `manual-${randomUUID()}`;
    this.eventos.set(id, { id, titulo, inicio, fim, privado, cancelado: false, versao: ++this.versao });
    return id;
  }

  async listarJanela(inicio: Date, fim: Date, filtro?: { salaNumero?: number }) {
    this.chamadas.push('list');
    return [...this.eventos.values()]
      .filter((e) => !e.cancelado && e.inicio < fim && e.fim > inicio)
      .filter((e) => filtro?.salaNumero === undefined || e.privado.salaNumero === String(filtro.salaNumero))
      .map(({ versao: _v, ...e }) => ({ ...e, privado: { ...e.privado } }));
  }

  async criar(d: DadosEvento) {
    this.chamadas.push('insert');
    const id = `evt-${randomUUID()}`;
    this.eventos.set(id, {
      id,
      titulo: d.titulo,
      inicio: d.inicio,
      fim: d.fim,
      location: d.location,
      descricao: d.descricao,
      colorId: d.colorId,
      privado: { ...(d.privado ?? {}) },
      cancelado: false,
      versao: ++this.versao,
    });
    return id;
  }

  async atualizar(id: string, d: Partial<DadosEvento>) {
    this.chamadas.push('patch');
    const e = this.eventos.get(id);
    if (!e || e.cancelado) throw Object.assign(new Error(`Evento ${id} não encontrado`), { code: 404 });
    Object.assign(e, {
      ...(d.titulo !== undefined && { titulo: d.titulo }),
      ...(d.inicio && { inicio: d.inicio }),
      ...(d.fim && { fim: d.fim }),
      ...(d.location !== undefined && { location: d.location }),
      ...(d.descricao !== undefined && { descricao: d.descricao }),
      ...(d.colorId !== undefined && { colorId: d.colorId }),
    });
    if (d.privado) e.privado = { ...e.privado, ...d.privado };
    e.versao = ++this.versao;
  }

  async remover(id: string) {
    this.chamadas.push('delete');
    const e = this.eventos.get(id);
    if (e) {
      e.cancelado = true;
      e.versao = ++this.versao;
    }
  }

  async sincronizar(token: string | null): Promise<ResultadoSync> {
    this.chamadas.push('sync');
    const desde = token === null ? 0 : Number(token.replace('v', ''));
    if (Number.isNaN(desde) || desde > this.versao) throw new SyncTokenInvalido();
    const eventos = [...this.eventos.values()]
      .filter((e) => e.versao > desde && (token !== null || !e.cancelado))
      .map(({ versao: _v, ...e }) => ({ ...e, privado: { ...e.privado } }));
    return { eventos, proximoSyncToken: `v${this.versao}` };
  }

  async observar() {
    return { resourceId: 'falso', expiracao: new Date(Date.now() + 7 * 86_400_000) };
  }

  async pararObservacao() {}
}

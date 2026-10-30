import { google, type calendar_v3 } from 'googleapis';
import { readFileSync } from 'node:fs';
import type { CalendarGateway, DadosEvento, EventoAgenda, ResultadoSync } from './gateway';
import { SyncTokenInvalido } from './gateway';
import { localParaUtc } from '@/lib/tempo';

function credenciais() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    : readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE!, 'utf8');
  return JSON.parse(json) as { client_email: string; private_key: string };
}

function converter(e: calendar_v3.Schema$Event): EventoAgenda {
  // Eventos de dia inteiro usam start.date (AAAA-MM-DD) no fuso local.
  const inicio = e.start?.dateTime ? new Date(e.start.dateTime) : e.start?.date ? localParaUtc(e.start.date, '00:00') : new Date(0);
  const fim = e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? localParaUtc(e.end.date, '00:00') : inicio;
  return {
    id: e.id!,
    titulo: e.summary ?? '',
    inicio,
    fim,
    location: e.location,
    descricao: e.description,
    colorId: e.colorId,
    privado: (e.extendedProperties?.private as Record<string, string>) ?? {},
    cancelado: e.status === 'cancelled',
  };
}

function corpo(d: Partial<DadosEvento>): calendar_v3.Schema$Event {
  const ev: calendar_v3.Schema$Event = {};
  if (d.titulo !== undefined) ev.summary = d.titulo;
  if (d.inicio) ev.start = { dateTime: d.inicio.toISOString(), timeZone: 'America/Campo_Grande' };
  if (d.fim) ev.end = { dateTime: d.fim.toISOString(), timeZone: 'America/Campo_Grande' };
  if (d.location !== undefined) ev.location = d.location;
  if (d.descricao !== undefined) ev.description = d.descricao;
  if (d.colorId !== undefined) ev.colorId = d.colorId;
  if (d.privado) ev.extendedProperties = { private: d.privado };
  return ev;
}

export class AgendaGoogle implements CalendarGateway {
  private api: calendar_v3.Calendar;

  constructor(private calendarId: string) {
    const c = credenciais();
    const auth = new google.auth.JWT({
      email: c.client_email,
      key: c.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this.api = google.calendar({ version: 'v3', auth });
  }

  async listarJanela(inicio: Date, fim: Date, filtro?: { salaNumero?: number }) {
    const res: EventoAgenda[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.api.events.list({
        calendarId: this.calendarId,
        timeMin: inicio.toISOString(),
        timeMax: fim.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 2500,
        pageToken,
        privateExtendedProperty: filtro?.salaNumero !== undefined ? [`salaNumero=${filtro.salaNumero}`] : undefined,
      });
      for (const e of data.items ?? []) if (e.status !== 'cancelled' && e.transparency !== 'transparent') res.push(converter(e));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return res;
  }

  async criar(d: DadosEvento) {
    const { data } = await this.api.events.insert({ calendarId: this.calendarId, requestBody: corpo(d) });
    return data.id!;
  }

  async atualizar(id: string, d: Partial<DadosEvento>) {
    let body = corpo(d);
    if (d.privado) {
      // Mescla as propriedades privadas (o patch do Google substitui o mapa inteiro).
      const { data } = await this.api.events.get({ calendarId: this.calendarId, eventId: id });
      body = { ...body, extendedProperties: { private: { ...(data.extendedProperties?.private ?? {}), ...d.privado } } };
    }
    await this.api.events.patch({ calendarId: this.calendarId, eventId: id, requestBody: body });
  }

  async remover(id: string) {
    try {
      await this.api.events.delete({ calendarId: this.calendarId, eventId: id });
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      if (code !== 404 && code !== 410) throw e; // já removido
    }
  }

  async sincronizar(syncToken: string | null): Promise<ResultadoSync> {
    const eventos: EventoAgenda[] = [];
    let pageToken: string | undefined;
    let proximo: string | undefined;
    try {
      do {
        const { data } = await this.api.events.list({
          calendarId: this.calendarId,
          singleEvents: true,
          showDeleted: syncToken !== null,
          maxResults: 2500,
          syncToken: syncToken ?? undefined,
          pageToken,
        });
        for (const e of data.items ?? []) eventos.push(converter(e));
        pageToken = data.nextPageToken ?? undefined;
        proximo = data.nextSyncToken ?? proximo;
      } while (pageToken);
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 410) throw new SyncTokenInvalido();
      throw e;
    }
    return { eventos, proximoSyncToken: proximo! };
  }

  async observar(canalId: string, url: string, token: string) {
    const { data } = await this.api.events.watch({
      calendarId: this.calendarId,
      requestBody: { id: canalId, type: 'web_hook', address: url, token },
    });
    return { resourceId: data.resourceId!, expiracao: new Date(Number(data.expiration)) };
  }

  async pararObservacao(canalId: string, resourceId: string) {
    try {
      await this.api.channels.stop({ requestBody: { id: canalId, resourceId } });
    } catch {
      // canal já expirado
    }
  }
}

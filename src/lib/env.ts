/** Leitura centralizada das variáveis de ambiente (nenhum segredo no código). */
export const env = {
  get publicBaseUrl() {
    return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get calendarId() {
    return process.env.GOOGLE_CALENDAR_ID ?? '';
  },
  get webhookToken() {
    return process.env.GOOGLE_WEBHOOK_TOKEN ?? '';
  },
  get googleFake() {
    if (process.env.GOOGLE_FAKE === '1') return true;
    const semCredencial = !process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    return process.env.NODE_ENV !== 'production' && (semCredencial || !this.calendarId);
  },
  get jobsDesligados() {
    return process.env.JOBS_DISABLED === '1';
  },
};

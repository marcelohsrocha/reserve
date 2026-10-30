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
  /** Cliente OAuth do Google (login dos usuários + gravação na agenda pessoal). */
  get oauthClientId() {
    return process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  },
  get oauthClientSecret() {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
  },
  get oauthRedirectUri() {
    return `${this.publicBaseUrl}/api/auth/google/callback`;
  },
  /** Assina o cookie de sessão e deriva a chave que cifra os refresh tokens. */
  get sessionSecret() {
    const s = process.env.SESSION_SECRET ?? '';
    if (s) return s;
    if (process.env.NODE_ENV === 'production') return '';
    return 'segredo-de-desenvolvimento-nao-usar-em-producao';
  },
  /** E-mails (separados por vírgula) que entram sempre como administradores. */
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  /** Login de desenvolvimento (sem Google) — nunca em produção. */
  get loginDev() {
    return process.env.NODE_ENV !== 'production' && !this.oauthClientId;
  },
};

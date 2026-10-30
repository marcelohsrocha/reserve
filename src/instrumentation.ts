export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { iniciarJobs } = await import('./services/jobs');
    iniciarJobs();
  }
}

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './content.js';
import { createRepo } from './repo/index.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
process.env.DB_FILE ??= join(__dirname, '..', '..', 'data', 'sharpdrill.db');

const content = loadContent();
const repo = await createRepo(process.env);
await repo.purgeExpiredSessions();

const app = createApp({ repo, content, secureCookies: process.env.SECURE_COOKIES === '1' });
const server = app.listen(PORT, () => {
  console.log(`SharpDrill en http://localhost:${PORT} · BD: ${repo.kind} · ${content.chapters.length} capítulos, ${content.items.size} elementos`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(async () => { await repo.close(); process.exit(0); }));
}

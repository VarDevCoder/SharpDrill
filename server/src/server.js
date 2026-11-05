import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { loadContent } from './content.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DB_FILE = process.env.DB_FILE ?? join(__dirname, '..', '..', 'data', 'sharpdrill.db');

const content = loadContent();
const db = openDb(DB_FILE);
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());

const app = createApp({ db, content, secureCookies: process.env.SECURE_COOKIES === '1' });
app.listen(PORT, () => {
  const items = content.items.size;
  console.log(`SharpDrill escuchando en http://localhost:${PORT} — ${content.chapters.length} capítulos, ${items} elementos de repaso`);
});

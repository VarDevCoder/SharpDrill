// Función serverless de Vercel: envuelve la API Express. vercel.json reescribe /api/* hacia aquí
// (req.url conserva la ruta original, así que las rutas de Express funcionan igual que en local).
import { loadContent } from '../server/src/content.js';
import { createRepo } from '../server/src/repo/index.js';
import { createApp } from '../server/src/app.js';

let appPromise = null;

/** Se reutiliza entre invocaciones mientras la instancia siga "caliente". */
function getApp() {
  appPromise ??= (async () => {
    const content = loadContent();
    if ((process.env.DB_CLIENT ?? '').toLowerCase() !== 'oracle') return notConfigured(content);
    const repo = await createRepo(process.env);
    return createApp({ repo, content, secureCookies: true, staticDir: '/nonexistent' });
  })().catch((e) => {
    appPromise = null; // reintentar en la siguiente petición (p. ej. la BD estaba arrancando)
    throw e;
  });
  return appPromise;
}

/**
 * Sin base de datos persistente no se puede funcionar en serverless: el disco es efímero y cada
 * instancia tendría su propia SQLite (sesiones y progreso se perderían). Respondemos 503 con instrucciones.
 */
function notConfigured(content) {
  return (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url.startsWith('/api/health')) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: false, db: null, configured: false, chapters: content.chapters.length }));
    }
    res.statusCode = 503;
    res.end(JSON.stringify({
      error: 'Base de datos no configurada en este despliegue. Define DB_CLIENT=oracle, ORACLE_USER, ORACLE_PASSWORD y ORACLE_CONNECT_STRING en Vercel (ver README → Despliegue en Vercel).',
    }));
  };
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'No se pudo conectar con la base de datos. Revisa los logs de la función en Vercel.' }));
  }
}

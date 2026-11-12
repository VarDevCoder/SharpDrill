// Genera la colección Postman de SharpDrill (v2.1) a partir de este script legible.
// Uso: node postman/build-collection.mjs  → postman/SharpDrill.postman_collection.json
import { writeFileSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const drill = yaml.load(readFileSync(new URL('../server/content/chapters/14-plsql-esencial.yaml', import.meta.url), 'utf8'))
  .drills.find((d) => d.id === 'd1');

const js = (...lines) => lines.flat().join('\n').split('\n');
const test = (...exec) => [{ listen: 'test', script: { type: 'text/javascript', exec: js(...exec) } }];
const pre = (exec) => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: js(exec) } });
const url = (path) => ({ raw: `{{baseUrl}}${path}`, host: ['{{baseUrl}}'], path: path.split('?')[0].split('/').filter(Boolean),
  ...(path.includes('?') ? { query: path.split('?')[1].split('&').map((kv) => { const [key, value] = kv.split('='); return { key, value }; }) } : {}) });
const json = (obj) => ({ mode: 'raw', raw: JSON.stringify(obj, null, 2), options: { raw: { language: 'json' } } });
const req = (name, method, path, { body, auth, tests, prerequest, description, noCookies } = {}) => ({
  name,
  // disableCookies: no enviar la cookie de sesión guardada por peticiones anteriores (Postman/Newman tienen cookie jar)
  ...(noCookies ? { protocolProfileBehavior: { disableCookies: true } } : {}),
  event: [...(prerequest ? [pre(prerequest)] : []), ...(tests ? test(tests) : [])],
  request: {
    method, url: url(path), description,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(body ? { body: json(body) } : {}),
    ...(auth ? { auth } : {}),
  },
});
const NOAUTH = { type: 'noauth' };
const bearer = (v) => ({ type: 'bearer', bearer: [{ key: 'token', value: v, type: 'string' }] });

const collection = {
  info: {
    name: 'SharpDrill API',
    description: 'Colección de práctica: autenticación Bearer, encadenado de peticiones, tests de contrato y drills. Ejecutar con `npm run test:api` (Newman).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearer('{{token}}'),
  variable: [
    { key: 'token', value: '' }, { key: 'apiToken', value: '' }, { key: 'apiTokenId', value: '' },
    { key: 'email', value: '' }, { key: 'drillTicket', value: '' },
  ],
  event: [
    test(
      '// Tests de contrato comunes a todas las peticiones',
      "pm.test('Sin errores 5xx', () => pm.expect(pm.response.code).to.be.below(500));",
      "pm.test('Responde JSON', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'));",
      "pm.test('Responde en menos de 2 s', () => pm.expect(pm.response.responseTime).to.be.below(2000));",
    )[0],
  ],
  item: [
    {
      name: '1. Autenticación',
      item: [
        req('Registro (usuario único)', 'POST', '/api/auth/register', {
          auth: NOAUTH,
          prerequest: "pm.collectionVariables.set('email', `qa+${Date.now()}@sharpdrill.dev`);",
          body: { name: 'QA Newman', email: '{{email}}', password: '{{password}}' },
          tests: js(
            "pm.test('201 Created', () => pm.response.to.have.status(201));",
            "pm.test('Devuelve token Bearer', () => {",
            '  const json = pm.response.json();',
            "  pm.expect(json.tokenType).to.eql('Bearer');",
            "  pm.expect(json.token).to.be.a('string').and.match(/^sd_/);",
            '});',
          ),
        }),
        req('Login', 'POST', '/api/auth/login', {
          auth: NOAUTH,
          body: { email: '{{email}}', password: '{{password}}' },
          tests: js(
            "pm.test('200 OK', () => pm.response.to.have.status(200));",
            'const json = pm.response.json();',
            "pm.test('Esquema de login', () => pm.response.to.have.jsonSchema({",
            "  type: 'object', required: ['user', 'token', 'tokenType', 'expiresAt'],",
            "  properties: { token: { type: 'string' }, user: { type: 'object', required: ['id', 'email', 'name'] } },",
            '}));',
            "pm.collectionVariables.set('token', json.token); // encadenar: lo usan las siguientes peticiones",
          ),
        }),
        req('Login con contraseña incorrecta → 401', 'POST', '/api/auth/login', {
          auth: NOAUTH,
          body: { email: '{{email}}', password: 'incorrecta' },
          tests: "pm.test('401', () => pm.response.to.have.status(401));",
        }),
        req('Quién soy (Bearer)', 'GET', '/api/auth/me', {
          tests: js(
            "pm.test('Autenticado por Bearer', () => {",
            '  const json = pm.response.json();',
            "  pm.expect(json.user.email).to.eql(pm.collectionVariables.get('email'));",
            "  pm.expect(json.authVia).to.eql('bearer');",
            '});',
          ),
        }),
        req('Sin token → 401 con WWW-Authenticate', 'GET', '/api/stats', {
          auth: NOAUTH,
          noCookies: true,
          tests: js(
            "pm.test('401', () => pm.response.to.have.status(401));",
            "pm.test('Cabecera WWW-Authenticate: Bearer', () => pm.expect(pm.response.headers.get('WWW-Authenticate')).to.match(/^Bearer/));",
          ),
        }),
        req('Token inválido → 401 invalid_token', 'GET', '/api/stats', {
          auth: bearer('sd_token_falso'),
          tests: "pm.test('invalid_token', () => pm.expect(pm.response.headers.get('WWW-Authenticate')).to.include('invalid_token'));",
        }),
      ],
    },
    {
      name: '2. Contenido',
      item: [
        req('Capítulos y rutas', 'GET', '/api/chapters', {
          tests: js(
            'const json = pm.response.json();',
            "pm.test('5 rutas de aprendizaje', () => pm.expect(json.tracks.map(t => t.id)).to.have.members(['csharp', 'db', 'react', 'api', 'english']));",
            "pm.test('Hay capítulos de PL/SQL', () => pm.expect(json.chapters.some(c => c.track === 'db')).to.be.true);",
          ),
        }),
        req('Capítulo PL/SQL sin respuestas expuestas', 'GET', '/api/chapters/ch14', {
          tests: js(
            'const ch = pm.response.json().chapter;',
            "pm.test('Las preguntas no incluyen la respuesta', () => ch.questions.forEach(q => pm.expect(q).to.not.have.property('answer')));",
            "pm.test('Los drills no incluyen la solución', () => ch.drills.forEach(d => pm.expect(d).to.not.have.property('solution')));",
          ),
        }),
        req('Buscar "BULK COLLECT"', 'GET', '/api/chapters/search?q=BULK%20COLLECT', {
          tests: "pm.test('Encuentra resultados', () => pm.expect(pm.response.json().results.length).to.be.above(0));",
        }),
        req('Snippets de bash', 'GET', '/api/snippets?lang=bash', {
          tests: "pm.test('Solo bash', () => pm.response.json().snippets.forEach(s => pm.expect(s.lang).to.eql('bash')));",
        }),
      ],
    },
    {
      name: '3. Repaso activo',
      item: [
        req('Cola de repaso (ruta db)', 'GET', '/api/review/queue?track=db&limit=5&newLimit=5', {
          tests: "pm.test('5 elementos nuevos', () => pm.expect(pm.response.json().items).to.have.lengthOf(5));",
        }),
        req('Responder pregunta (ch14.q1)', 'POST', '/api/review/answer', {
          body: { itemId: 'ch14.q1', answer: 2, mode: 'practice' },
          tests: js(
            'const r = pm.response.json();',
            "pm.test('Correcta: TOO_MANY_ROWS', () => pm.expect(r.correct).to.be.true);",
            "pm.test('Reprogramada a 1 día', () => pm.expect(r.next.interval).to.eql(1));",
          ),
        }),
        req('Calificar flashcard como Fácil', 'POST', '/api/review/card', {
          body: { itemId: 'ch14.c1', grade: 3 },
          tests: "pm.test('Intervalo 3 días', () => pm.expect(pm.response.json().next.interval).to.eql(3));",
        }),
      ],
    },
    {
      name: '4. Drill de código cronometrado',
      item: [
        req('Empezar drill PL/SQL', 'POST', '/api/drills/ch14.d1/start', {
          body: {},
          tests: js(
            'const r = pm.response.json();',
            "pm.test('Devuelve ticket firmado', () => pm.expect(r.ticket).to.include('.'));",
            "pm.collectionVariables.set('drillTicket', r.ticket);",
          ),
        }),
        req('Entregar solución', 'POST', '/api/drills/ch14.d1/submit', {
          body: { ticket: '{{drillTicket}}', code: drill.solution },
          tests: js(
            'const r = pm.response.json();',
            "pm.test('Todas las verificaciones superadas', () => pm.expect(r.passed).to.eql(r.total));",
            "pm.test('Dentro de tiempo', () => pm.expect(r.inTime).to.be.true);",
          ),
        }),
        req('Ticket falsificado → 400', 'POST', '/api/drills/ch14.d1/submit', {
          body: { ticket: 'eyJ1IjoxfQ.firma-falsa', code: 'x' },
          tests: "pm.test('400', () => pm.response.to.have.status(400));",
        }),
      ],
    },
    {
      name: '5. Tokens de API personales',
      item: [
        req('Crear token de API', 'POST', '/api/auth/tokens', {
          body: { label: 'Newman', days: 1 },
          tests: js(
            'const r = pm.response.json();',
            "pm.test('201 y prefijo sdapi_', () => { pm.response.to.have.status(201); pm.expect(r.token).to.match(/^sdapi_/); });",
            "pm.collectionVariables.set('apiToken', r.token);",
            "pm.collectionVariables.set('apiTokenId', r.id);",
          ),
        }),
        req('Usar el token de API', 'GET', '/api/auth/me', {
          auth: bearer('{{apiToken}}'),
          tests: "pm.test('Autenticado con el token de API', () => pm.expect(pm.response.json().user).to.not.be.null);",
        }),
        req('Revocar token', 'DELETE', '/api/auth/tokens/{{apiTokenId}}', {
          tests: "pm.test('200', () => pm.response.to.have.status(200));",
        }),
        req('Token revocado ya no sirve', 'GET', '/api/stats', {
          auth: bearer('{{apiToken}}'),
          tests: "pm.test('401 tras revocar', () => pm.response.to.have.status(401));",
        }),
      ],
    },
    {
      name: '6. Estadísticas y cierre',
      item: [
        req('Estadísticas', 'GET', '/api/stats', {
          tests: js(
            'const s = pm.response.json();',
            "pm.test('Registra los intentos', () => pm.expect(s.totals.attempts).to.be.at.least(3));",
            "pm.test('Racha de 1 día', () => pm.expect(s.streak).to.eql(1));",
          ),
        }),
        req('Cerrar sesión', 'POST', '/api/auth/logout', {
          body: {},
          tests: "pm.test('200', () => pm.response.to.have.status(200));",
        }),
      ],
    },
  ],
};

const environment = {
  name: 'SharpDrill local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
    { key: 'password', value: 'password-de-pruebas', enabled: true, type: 'secret' },
  ],
  _postman_variable_scope: 'environment',
};

writeFileSync(new URL('./SharpDrill.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
writeFileSync(new URL('./local.postman_environment.json', import.meta.url), JSON.stringify(environment, null, 2) + '\n');
console.log('Colección y entorno generados en postman/');

# SharpDrill

Entrenamiento **senior** con **repaso activo** y **drills de código cronometrados** sobre un stack empresarial realista:

| Ruta | Capítulos |
|---|---|
| **C# y .NET** (12) | CLR y tipos · GC y recursos · Genéricos · Delegados y closures · LINQ · Async/await · Concurrencia · C# 10→14 · Rendimiento (Span) · Reflexión y source generators · Arquitectura y DI · ASP.NET Core + EF Core |
| **Bases de datos y PL/SQL** (3) | SQL avanzado en Oracle (índices, planes, MVCC, analíticas, MERGE) · PL/SQL esencial · PL/SQL avanzado (BULK COLLECT/FORALL, SQL dinámico, triggers, autónomas) |
| **React y Next.js** (2) | React con TypeScript (TSX) · Next.js App Router |
| **APIs** (3) | HTTP, curl y Bearer/JWT/OAuth · Postman y Newman · Azure API Management |

**Contenido:** 20 capítulos, 80 secciones de teoría, 168 flashcards, 160 preguntas, **36 drills de código cronometrados** (C#, PL/SQL, SQL, React TSX, TypeScript, curl, scripts de Postman y políticas XML de APIM), **61 snippets** y **74 atajos de teclado** (Visual Studio, Rider, VS Code, SQL Developer, SQLcl, Postman, Chrome DevTools y bash).

## Cómo se estudia

1. **Teoría**: cada sección se puede marcar como leída.
2. **Flashcards**: ves la pregunta, intentas recordarla sin mirar, la descubres y te calificas (*Otra vez / Difícil / Bien / Fácil*).
3. **Práctica y examen**: preguntas de opción múltiple, verdadero/falso, "¿qué imprime?" y completar. Las corrige el **servidor**, que además explica la respuesta.
4. **Drills ⏱**: escribes código real en un editor (CodeMirror) contra el reloj. El servidor mide el tiempo y verifica los puntos clave; después comparas con la solución de referencia. Si se acaba el tiempo, se entrega solo.
5. **Repaso diario**: el algoritmo **SM-2** decide qué toca hoy. Lo que fallas vuelve en 10 minutos; lo que dominas se espacia (1 día → 3 días → semanas).
6. **Snippets y atajos**: una chuleta buscable con botón de copiar.

## Arquitectura

En pocas palabras: **React** dibuja la interfaz, una **API REST** en Node aplica las reglas (corrige, mide tiempos, planifica repasos) y la base de datos guarda tu progreso. En producción esa base de datos es **Oracle**, con la lógica en **paquetes PL/SQL**.

```
web/                 Frontend React 19 + TypeScript (Vite, React Router, CodeMirror 6, Prism)
server/src/
  app.js             Express 5: rutas /api y servido del frontend compilado
  auth.js            Tokens opacos (SHA-256 en BD), cookie HttpOnly y Authorization: Bearer
  srs.js             SM-2 (función pura)
  content.js         Carga/valida el YAML, corrige preguntas y drills
  routes/            auth · chapters · review · drills · exams · stats · custom-cards · snippets
  repo/sqlite.js     Repositorio SQLite (desarrollo y tests)
  repo/oracle.js     Repositorio Oracle: node-oracledb (modo thin) → paquetes PL/SQL
server/content/      Un .yaml por capítulo (teoría, tarjetas, preguntas, drills, snippets, atajos)
db/oracle/           DDL + paquetes SD_SRS (SM-2) y SD_API + autotest PL/SQL
postman/             Colección y entorno Postman de la propia API (+ generador)
```

| Capa | Tecnología | Detalle |
|---|---|---|
| Frontend | React 19, TSX, Vite 8 | SPA con rutas reales; el editor de drills se carga bajo demanda (*code splitting*) |
| API | Node 22 + Express 5 | REST JSON; las respuestas de las preguntas nunca llegan al cliente antes de contestar |
| BD (dev) | SQLite (`node:sqlite`) | Sin dependencias nativas; base en memoria para los tests |
| BD (prod) | **Oracle 23ai Free + PL/SQL** | `SD_API.record_review` calcula SM-2 en PL/SQL (`SD_SRS.schedule`), hace `MERGE` y registra el intento; lecturas con *bind variables* y `SYS_REFCURSOR` |
| Auth | Bearer + cookie | Login devuelve un token (`tokenType: Bearer`) y fija una cookie `HttpOnly`. 401 con `WWW-Authenticate`. Tokens de API personales revocables |
| Drills | Ticket HMAC | `/start` firma la hora de inicio; `/submit` calcula el tiempo en el servidor: el cronómetro no se puede falsear desde el navegador |

## Puesta en marcha

Requisitos: **Node.js 22.5+**.

```bash
npm install
npm run build          # compila el frontend React (web/dist)
npm start              # API + frontend en http://localhost:3000 (SQLite en data/)
```

Desarrollo con recarga:

```bash
npm run dev            # API en :3000 (node --watch)
npm run dev:web        # Vite en :5173 con proxy de /api → :3000
```

Calidad:

```bash
npm run check          # validate + test + typecheck + build
npm run test:api       # colección Postman con Newman (con la API levantada en :3000)
```

### Con Oracle y PL/SQL (stack completo)

```bash
docker compose up --build      # Oracle Free + API (DB_CLIENT=oracle) en http://localhost:3000
```

En el primer arranque, `db/oracle/initdb/01_install.sh` ejecuta `install.sql`: crea las tablas, compila los paquetes, comprueba que no queden objetos inválidos y lanza el autotest PL/SQL (`90_selftest.sql`).

Para usar un Oracle existente:

```bash
sqlplus sharpdrill/<pwd>@//host:1521/SERVICIO @db/oracle/install.sql
DB_CLIENT=oracle ORACLE_USER=sharpdrill ORACLE_PASSWORD=... ORACLE_CONNECT_STRING=host:1521/SERVICIO npm start
```

Variables de entorno: `PORT`, `DB_CLIENT` (`sqlite` | `oracle`), `DB_FILE`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, `ORACLE_POOL_MAX`, `DRILL_SECRET` (clave HMAC de los tickets de drill, obligatoria con varias réplicas) y `SECURE_COOKIES=1` (detrás de HTTPS).

## Practicar curl y Postman con la propia API

En **Ajustes → Tokens de API** puedes crear un token Bearer personal. También puedes hacerlo por terminal:

```bash
TOKEN=$(curl -s --json '{"email":"tu@email.com","password":"..."}' http://localhost:3000/api/auth/login | jq -r .token)
curl -fsS http://localhost:3000/api/stats -H "Authorization: Bearer $TOKEN" | jq .
```

La colección `postman/SharpDrill.postman_collection.json` (22 peticiones y 96 aserciones) muestra en la práctica:

- Registro y login con encadenado del token.
- Bearer heredado de la colección.
- 401 con `WWW-Authenticate`.
- Validación de esquema JSON.
- Drill con ticket.
- Creación y revocación de tokens.
- Tests de contrato a nivel de colección.

Impórtala en Postman junto al entorno `local.postman_environment.json`, o ejecútala con `npm run test:api`. Si la modificas, regenérala con `node postman/build-collection.mjs`.

## API

Todas las rutas requieren sesión (cookie o `Authorization: Bearer`), salvo `register`, `login` y `me`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` · `/login` · `/logout` | Cuenta; login devuelve `{ token, tokenType: "Bearer" }` |
| GET/PATCH | `/api/auth/me` | Usuario actual (`null` sin sesión) / perfil y meta diaria |
| GET/POST/DELETE | `/api/auth/tokens` | Tokens de API personales |
| GET | `/api/chapters` · `/api/chapters/:id` · `/api/chapters/search?q=` | Temario con rutas, capítulo (sin respuestas) y búsqueda |
| GET | `/api/review/queue?mode=&track=&chapter=` | Cola SM-2 (`mixed`, `cards`, `questions`, `drills`, `mistakes`) |
| POST | `/api/review/card` · `/api/review/answer` | Calificar una flashcard / corregir una pregunta |
| GET | `/api/review/practice` | Preguntas priorizadas por debilidad |
| GET | `/api/drills` · `/api/drills/session` · `/api/drills/history` | Catálogo, sesión e historial de drills |
| POST | `/api/drills/:id/start` · `/api/drills/:id/submit` | Ticket firmado / entrega y verificación |
| POST | `/api/exams` · `/api/exams/:id/submit` | Examen cronometrado |
| GET | `/api/stats` · `/api/snippets` | Estadísticas por ruta y capítulo / chuleta de snippets y atajos |
| CRUD | `/api/custom-cards` | Tarjetas propias |

## Añadir contenido

Cada capítulo es un YAML en `server/content/chapters/` con `track` (`csharp` | `db` | `react` | `api`), `sections`, `cards`, `questions` y, opcionalmente, `drills`, `snippets` y `shortcuts`:

```yaml
drills:
  - id: d1
    lang: plsql                 # csharp | plsql | sql | tsx | ts | js | bash | xml
    title: "Procesar en lotes"
    timeLimit: 300              # segundos
    prompt: |
      Enunciado en Markdown.
    starter: |                  # código inicial (opcional)
      DECLARE ...
    solution: |
      ...solución de referencia...
    checks:                     # regex sobre el código (sin comentarios), sin distinguir mayúsculas
      - pattern: 'BULK\s+COLLECT'
        hint: "Usa BULK COLLECT"
      - pattern: '\bCOMMIT\b'
        hint: "No hagas COMMIT"
        forbid: true            # el patrón NO debe aparecer
snippets:
  - id: n1
    title: "..."
    lang: sql
    code: |
      SELECT ...
shortcuts:
  - tool: "SQL Developer"
    keys: "Ctrl+Enter"
    action: "Ejecutar la sentencia"
```

`npm run validate` comprueba el esquema, los ids duplicados y que **cada solución de referencia supere sus propias verificaciones**.

## Estado de verificación

- **Verificado en este repositorio**: tests de API e integración con SQLite (`npm test`), typecheck y build del frontend, colección Postman con Newman (96/96) y recorrido E2E en Chromium (escritorio, modo oscuro y móvil).
- **Oracle/PL/SQL**: el adaptador está cubierto por tests de contrato con un pool simulado (mismos métodos que SQLite, binds y traducción de errores ORA-20xxx). Los scripts SQL/PL/SQL **todavía no se han ejecutado contra un Oracle real**. Al levantar `docker compose up`, el autotest `90_selftest.sql` los valida en el primer arranque.

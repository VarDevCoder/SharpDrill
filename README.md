# SharpDrill

Curso de **C# para nivel senior** con **repaso activo**: teoría por capítulos, flashcards con repetición espaciada, práctica con corrección y explicación, y exámenes cronometrados. Tiene backend (API + base de datos), así que el progreso de cada usuario se guarda en el servidor.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Temario** | 12 capítulos (CLR y tipos, GC, genéricos, delegados/closures, LINQ, async/await, concurrencia, C# 10–14, rendimiento con Span, reflexión/source generators, arquitectura/DI, ASP.NET Core + EF Core). Cada uno trae teoría con código resaltado, objetivos y casillas de "leída". |
| **Flashcards** | Ves la pregunta, intentas recordar la respuesta (recuerdo activo), la descubres y te calificas: *Otra vez / Difícil / Bien / Fácil*. |
| **Repaso** | Cola diaria generada con **SM-2**: primero lo que vence hoy, después elementos nuevos. Modos: mixto, solo tarjetas, solo preguntas y *mis fallos*. |
| **Práctica** | Preguntas de opción múltiple, verdadero/falso, "¿qué imprime?" y completar. Las corrige el **servidor**, que además da la explicación. Se priorizan tus puntos débiles. |
| **Examen** | Simulacro con tiempo límite y preguntas aleatorias de los capítulos que elijas. Ves el resultado detallado al entregar y queda un historial. |
| **Progreso** | Dominio por capítulo, precisión, racha, mapa de actividad de 12 semanas, previsión de repasos a 7 días y puntos débiles. |
| **Mis tarjetas** | Creas tus propias tarjetas (con Markdown y bloques de código) y entran en la repetición espaciada. |
| **Extras** | Búsqueda en el temario (`/`), atajos de teclado, tema claro/oscuro y diseño adaptado a móvil. |

**Total:** 12 capítulos, 48 secciones de teoría, 97 flashcards y 96 preguntas.

## Cómo funciona

**En pocas palabras:** el navegador muestra la interfaz, el servidor guarda tu progreso y decide qué repasar, y la base de datos lo conserva todo.

**Detalle técnico:**

```
public/   Frontend: SPA en JavaScript puro (módulos ES, sin paso de build), router por hash
server/   Backend: Node.js + Express 5, API REST JSON
  src/srs.js        Algoritmo SM-2 (función pura, con tests)
  src/content.js    Carga y valida el contenido YAML; corrige respuestas
  src/routes/       auth, chapters, review, exams, stats, custom-cards
  content/chapters/ Un .yaml por capítulo (teoría, tarjetas, preguntas)
  test/             Tests unitarios + integración HTTP (node:test)
data/     Base de datos SQLite (se crea sola; está en .gitignore)
```

- **Base de datos:** SQLite integrado en Node (`node:sqlite`), sin dependencias nativas. Tablas: `users`, `sessions`, `reviews` (estado SM-2), `attempts`, `sections_read`, `custom_cards`, `exams`.
- **Autenticación:** contraseñas con `scrypt` y sal aleatoria; sesión con token aleatorio en una cookie `HttpOnly; SameSite=Lax` que dura 30 días.
- **Antitrampas:** el cliente nunca recibe la respuesta ni la explicación antes de contestar; el servidor corrige. Los exámenes rechazan las entregas fuera de tiempo (con 30 s de margen) y las entregas duplicadas.
- **Repetición espaciada (SM-2):** un fallo vuelve a salir en 10 minutos y baja la facilidad. Los aciertos amplían el intervalo (1 día → 3 días → intervalo × facilidad). Las preguntas acertadas cuentan como "Bien" y las falladas como "Otra vez".

## Puesta en marcha

Requisitos: **Node.js 22.5 o superior**.

```bash
npm install
npm start            # http://localhost:3000
npm test             # tests unitarios + integración
npm run validate     # valida el contenido YAML del curso
```

Variables de entorno: `PORT` (3000), `DB_FILE` (`data/sharpdrill.db`) y `SECURE_COOKIES=1` (actívala detrás de HTTPS).

Con Docker:

```bash
docker build -t sharpdrill .
docker run -p 3000:3000 -v sharpdrill-data:/data sharpdrill
```

## API

Todas las rutas, salvo `register`, `login` y `me`, requieren sesión.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` · `/login` · `/logout` | Gestión de cuenta |
| GET/PATCH | `/api/auth/me` | Usuario actual (`null` sin sesión) / cambiar nombre y meta diaria |
| GET | `/api/chapters` · `/api/chapters/:id` | Temario con progreso / capítulo completo (sin respuestas) |
| GET | `/api/chapters/search?q=` | Búsqueda en teoría y tarjetas |
| POST | `/api/chapters/:id/sections/:sid/read` | Marcar o desmarcar una sección como leída |
| GET | `/api/review/queue?mode=&chapter=&limit=&newLimit=` | Cola SM-2 (`mixed`, `cards`, `questions`, `mistakes`) |
| GET | `/api/review/practice?chapter=&count=` | Preguntas priorizadas por debilidad |
| POST | `/api/review/card` `{itemId, grade}` | Calificar una flashcard (0–3) |
| POST | `/api/review/answer` `{itemId, answer}` | Corregir: `{correct, expected, explanation, next}` |
| POST | `/api/exams` · `/api/exams/:id/submit` | Crear y entregar un examen |
| GET | `/api/exams` · `/api/stats` | Historial / estadísticas |
| DELETE | `/api/stats/progress?chapter=` | Reiniciar el progreso |
| CRUD | `/api/custom-cards` | Tarjetas propias |

## Añadir contenido

Crea `server/content/chapters/13-mi-tema.yaml` siguiendo el formato de los existentes:

```yaml
id: ch13
number: 13
title: "Mi tema"
level: "Senior"
summary: "..."
sections:
  - id: s1
    title: "..."
    body: |
      Markdown con bloques ```csharp, tablas y listas.
cards:
  - id: c1
    front: "Pregunta"
    back: "Respuesta"
questions:
  - id: q1
    type: mcq            # mcq | tf | fill
    prompt: "..."
    code: |              # opcional
      Console.WriteLine(1);
    options: ["a", "b"]
    answer: 0            # índice (mcq) · true/false (tf) · string o lista (fill)
    explanation: "Por qué"
```

Después ejecuta `npm run validate`, que comprueba ids duplicados, tipos y rangos de respuesta.

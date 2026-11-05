/** Error con código HTTP para respuestas 4xx. */
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

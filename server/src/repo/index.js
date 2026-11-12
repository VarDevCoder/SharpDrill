/**
 * Fábrica de repositorios. DB_CLIENT=sqlite (por defecto) | turso | oracle. Si existe TURSO_DATABASE_URL, turso es el valor por defecto.
 * El repositorio Oracle delega la lógica de escritura en paquetes PL/SQL (db/oracle/).
 */
export function dbClient(env = process.env) {
  return (env.DB_CLIENT ?? (env.TURSO_DATABASE_URL ? 'turso' : 'sqlite')).toLowerCase();
}

export async function createRepo(env = process.env) {
  const client = dbClient(env);
  if (client === 'turso') {
    const { createTursoRepo } = await import('./turso.js');
    return createTursoRepo({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  }
  if (client === 'oracle') {
    const { createOracleRepo } = await import('./oracle.js');
    return createOracleRepo({
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING ?? 'localhost:1521/FREEPDB1',
      poolMin: Number(env.ORACLE_POOL_MIN ?? 0),
      poolMax: Number(env.ORACLE_POOL_MAX ?? (env.VERCEL ? 4 : 10)),
      autoMigrate: env.ORACLE_AUTO_MIGRATE !== '0',
    });
  }
  const { createSqliteRepo } = await import('./sqlite.js');
  return createSqliteRepo(env.DB_FILE ?? ':memory:');
}

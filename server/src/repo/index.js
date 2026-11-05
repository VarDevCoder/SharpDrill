/**
 * Fábrica de repositorios. DB_CLIENT=sqlite (por defecto) | oracle
 * El repositorio Oracle delega la lógica de escritura en paquetes PL/SQL (db/oracle/).
 */
export async function createRepo(env = process.env) {
  const client = (env.DB_CLIENT ?? 'sqlite').toLowerCase();
  if (client === 'oracle') {
    const { createOracleRepo } = await import('./oracle.js');
    return createOracleRepo({
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING ?? 'localhost:1521/FREEPDB1',
      poolMax: Number(env.ORACLE_POOL_MAX ?? 10),
    });
  }
  const { createSqliteRepo } = await import('./sqlite.js');
  return createSqliteRepo(env.DB_FILE ?? ':memory:');
}

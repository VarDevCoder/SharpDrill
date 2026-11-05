-- Instalación completa del esquema SharpDrill en Oracle.
-- Ejecutar conectado como el usuario de la aplicación:
--   sqlplus sharpdrill/<pwd>@//localhost:1521/FREEPDB1 @install.sql
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET DEFINE OFF
PROMPT == Tablas e índices
@@01_schema.sql
PROMPT == Paquete SD_SRS (SM-2)
@@02_sd_srs.sql
PROMPT == Paquete SD_API
@@03_sd_api.sql
PROMPT == Objetos inválidos (debe salir vacío)
SELECT object_name, object_type FROM user_objects WHERE status = 'INVALID';
PROMPT == Autotest
@@90_selftest.sql
EXIT

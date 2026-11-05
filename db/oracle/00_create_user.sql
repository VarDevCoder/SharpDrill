-- =====================================================================
-- Crear el usuario de la aplicación (ejecutar UNA vez como ADMIN / SYSTEM).
-- Oracle Autonomous Database: Database Actions → SQL → pegar y ejecutar (F5).
-- Cambia la contraseña: 12-30 caracteres, mayúscula, minúscula y número.
-- Después, la app crea las tablas y paquetes PL/SQL sola en su primer arranque.
-- =====================================================================
CREATE USER sharpdrill IDENTIFIED BY "Cambia_Esta_Clave_2026";
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER, CREATE TYPE, CREATE VIEW TO sharpdrill;
-- En Autonomous Database el tablespace es DATA; en Oracle Free/on-premise suele ser USERS
ALTER USER sharpdrill QUOTA UNLIMITED ON DATA;

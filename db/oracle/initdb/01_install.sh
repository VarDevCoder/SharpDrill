#!/bin/bash
# Script de inicialización para la imagen gvenzl/oracle-free (se ejecuta solo en el primer arranque).
# Instala el esquema conectado como APP_USER en la PDB por defecto.
set -euo pipefail
cd /opt/sharpdrill
sqlplus -s "${APP_USER}/${APP_USER_PASSWORD}@//localhost:1521/FREEPDB1" @install.sql

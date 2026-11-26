# Administra

Panel privado para gestionar alquileres y gastos. La autenticación continúa con Google OAuth y los datos se guardan en Neon.

## Variables de entorno en Vercel

- `DATABASE_URL`: URL de conexión de Neon. La integración de Neon suele añadir esta variable automáticamente.
- `BETTER_AUTH_SECRET`: secreto de Better Auth.
- `BETTER_AUTH_URL`: URL pública de la aplicación.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: inicio de sesión con Google.
- `AUTHORIZED_EMAIL` (opcional): restringe el acceso a una cuenta.

`AUTH_SECRET` sirve como alternativa si no está configurado `BETTER_AUTH_SECRET`. Ya no se necesitan `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` ni `GOOGLE_PRIVATE_KEY`.

Las tablas Neon usadas por la aplicación son `alquiler`, `alquiler_gastos` y `alquiler_companeros`. Al añadir un alquiler puedes elegir el divisor de gastos y escribir compañeros y aportaciones con el formato `Nombre:importe, Nombre:importe`. Los gastos marcados para dividir se reparten entre el divisor elegido; las compras se representan aparte como importe compartido.

Ejecuta una vez la migración `database/migrations/20261126_add_gasto_fecha_fin.sql` en Neon para guardar también la fecha final de los periodos de luz y agua.

La exportación genera un archivo XLSX con una pestaña por año. Desde el panel se puede descargar el año seleccionado o todo el histórico.

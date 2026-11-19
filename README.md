# administra

Panel privado de alquileres conectado a Google Sheets. La autenticación usa Google OAuth y sesiones seguras en cookies; no necesita una base de datos.

## Variables de entorno

Configura estas variables en Vercel:

- `BETTER_AUTH_SECRET` (o `AUTH_SECRET`): clave secreta aleatoria para firmar las sesiones.
- `BETTER_AUTH_URL`: URL pública de la aplicación, por ejemplo `https://administra-tau.vercel.app`.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: credenciales OAuth de Google.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_SHEET_ID`: acceso de servidor a la hoja de cálculo.
- `AUTHORIZED_EMAIL` (opcional): limita el acceso a una cuenta Google concreta.

En Google Cloud, configura como URI de redirección autorizada:

`https://administra-tau.vercel.app/api/auth/callback/google`

Después de añadir o cambiar variables en Vercel, vuelve a desplegar la aplicación.

# administra

Panel privado de alquileres conectado a Google Sheets. La autenticación usa Google OAuth y sesiones seguras en cookies; no necesita una base de datos.

## Variables de entorno

Configura estas variables en Vercel:

- `BETTER_AUTH_SECRET` (preferida) o `AUTH_SECRET`: clave secreta no vacía para firmar las sesiones.
- `BETTER_AUTH_URL`: URL pública de la aplicación, por ejemplo `https://administra-tau.vercel.app`.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: credenciales OAuth de Google.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_SHEET_ID`: acceso de servidor a la hoja. `GOOGLE_SHEET_ID` puede ser el ID o el enlace de Google Sheets.
- `AUTHORIZED_EMAIL` (opcional): limita el acceso a una cuenta Google concreta.

En Google Cloud, configura como URI de redirección autorizada:

`https://administra-tau.vercel.app/api/auth/callback/google`

Después de añadir o cambiar variables en Vercel, vuelve a desplegar la aplicación.

## Formato de las hojas

Se leen pestañas cuyo nombre sea un año (por ejemplo, `2017`) o `Alquiler_2017`. La fila de cabeceras se detecta automáticamente buscando `MESES`, `ALQUILER` y `TOTAL`; puede empezar en una columna distinta de A. Las columnas adicionales de 2026, como `CON ÁNGEL` y `A MEDIAS`, se muestran según aparezcan en la hoja.

Desde el histórico se puede crear el año siguiente. La aplicación duplica la última pestaña para conservar su formato, mantiene los meses y vuelve a generar las fórmulas, dejando vacíos los datos del año anterior. Los campos `TOTAL ALQUILER`, `TOTAL ALQUILER CON ÁNGEL` y `TOTAL` se calculan al guardar; para los años con `CON ÁNGEL`, el total con Ángel solo se muestra cuando está marcado.

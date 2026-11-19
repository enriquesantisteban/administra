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

Desde el histórico se puede crear el año siguiente y elegir qué año usar como plantilla. La pestaña nueva se llama `YYYY`, se coloca al final y su tabla se llama `Alquiler_YYYY`. Conserva el formato, pero empieza sin filas de datos; los registros y meses se añaden con «Nuevo». Los campos vacíos se guardan como `-` y los importes calculados los interpretan como cero. Cada registro tiene un estado de pago; al cambiarlo, se añade o actualiza la columna `PAGADO` en esa hoja. También se puede eliminar el año seleccionado, pero siempre debe quedar al menos una hoja anual. `TOTAL ALQUILER CON ÁNGEL` suma los gastos base; `TOTAL ALQUILER` aplica el reparto de Ángel cuando está marcado y, si no, suma esos gastos sin reparto.

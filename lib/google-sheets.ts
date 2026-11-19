import 'server-only'

import { google } from 'googleapis'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export function getGoogleSheetsErrorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const errorObject = typeof error === 'object' && error !== null ? error : null
  const response = errorObject && 'response' in errorObject ? errorObject.response : null
  const status = response && typeof response === 'object' && 'status' in response && typeof response.status === 'number'
    ? response.status
    : undefined
  const rawCode = errorObject && 'code' in errorObject ? errorObject.code : undefined
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? rawCode : undefined

  if (message === 'GOOGLE_SERVICE_ACCOUNT_NOT_CONFIGURED') {
    return { status, code, message: 'Falta configurar GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en el servidor.' }
  }
  if (message === 'GOOGLE_SHEET_ID_NOT_CONFIGURED') {
    return { status, code, message: 'Falta configurar GOOGLE_SHEET_ID en el servidor.' }
  }
  if (status === 403) {
    return { status, code, message: 'Google ha denegado el acceso. Comparte la hoja con GOOGLE_SERVICE_ACCOUNT_EMAIL y dale permiso de editor.' }
  }
  if (status === 404) {
    return { status, code, message: 'No se encontró la hoja de Google. Comprueba que GOOGLE_SHEET_ID sea correcto.' }
  }
  if (status === 401 || /invalid_grant|invalid jwt|private key|pem|decoder/i.test(message)) {
    return { status, code, message: 'Las credenciales de Google no son válidas. Revisa GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY en el servidor.' }
  }
  return { status, code, message: 'No se pudo conectar con Google Sheets. Revisa la configuración del servidor e inténtalo de nuevo.' }
}

export async function getSignedInUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('UNAUTHORIZED')
  const authorizedEmail = process.env.AUTHORIZED_EMAIL?.trim().toLowerCase()
  if (authorizedEmail && session.user.email.toLowerCase() !== authorizedEmail) throw new Error('UNAUTHORIZED')
  return session.user
}

export async function getGoogleClients() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_NOT_CONFIGURED')
  const googleAuth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return { sheets: google.sheets({ version: 'v4', auth: googleAuth }) }
}

export async function getRentalSpreadsheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID_NOT_CONFIGURED')
  const { sheets } = await getGoogleClients()
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'spreadsheetId,properties(title),sheets(properties(sheetId,title,index))',
  })
  const file = { id: spreadsheetId, name: spreadsheet.data.properties?.title ?? 'Google Sheets', webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` }
  const tabs = spreadsheet.data.sheets ?? []
  const years = await Promise.all(
    tabs.flatMap((tab) => {
      const title = tab.properties?.title ?? ''
      const year = title.match(/^Alquiler_(\d{4})$/)?.[1]
      if (!year) return []
      const range = `'${title.replaceAll("'", "''")}'!A:Z`
      return [sheets.spreadsheets.values.get({
        spreadsheetId: file.id!,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      }).then((result) => ({
        year,
        title,
        sheetId: tab.properties?.sheetId ?? 0,
        headers: (result.data.values?.[0] ?? []).map((value) => String(value ?? '')),
        rows: (result.data.values ?? []).slice(1).map((values, index) => ({
          rowNumber: index + 2,
          values: (result.data.values?.[0] ?? []).map((_, column) => values[column] ?? ''),
        })),
      }))]
    }),
  )
  return { file: { id: file.id, name: file.name ?? 'Alquiler Google Sheets', url: file.webViewLink ?? null }, years }
}

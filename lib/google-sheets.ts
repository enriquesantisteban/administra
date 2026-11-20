import 'server-only'

import { google } from 'googleapis'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { normalizeSheetHeader } from '@/lib/rental-sheet'

export function getGoogleSheetsErrorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const errorObject = typeof error === 'object' && error !== null ? error : null
  const response = errorObject && 'response' in errorObject ? errorObject.response : null
  const status = response && typeof response === 'object' && 'status' in response && typeof response.status === 'number'
    ? response.status
    : undefined
  const responseData = response && typeof response === 'object' && 'data' in response ? response.data : null
  const providerError = responseData && typeof responseData === 'object' && 'error' in responseData ? responseData.error : null
  const providerMessage = providerError && typeof providerError === 'object' && 'message' in providerError && typeof providerError.message === 'string'
    ? providerError.message.slice(0, 500)
    : undefined
  const rawCode = errorObject && 'code' in errorObject ? errorObject.code : undefined
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? rawCode : undefined

  if (message === 'SHEET_HEADERS_NOT_FOUND') {
    return { status, code, providerMessage, message: 'No se encontró una tabla con las columnas MESES, ALQUILER y TOTAL en una hoja anual.' }
  }
  if (message === 'GOOGLE_SERVICE_ACCOUNT_NOT_CONFIGURED') {
    return { status, code, providerMessage, message: 'Falta configurar GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en el servidor.' }
  }
  if (message === 'GOOGLE_SHEET_ID_NOT_CONFIGURED') {
    return { status, code, providerMessage, message: 'Falta configurar GOOGLE_SHEET_ID en el servidor.' }
  }
  if (message === 'GOOGLE_SHEET_ID_INVALID') {
    return { status, code, providerMessage, message: 'GOOGLE_SHEET_ID no parece un ID ni un enlace válido de Google Sheets.' }
  }
  if (status === 403) {
    return { status, code, providerMessage, message: 'Google ha denegado el acceso. Comparte la hoja con GOOGLE_SERVICE_ACCOUNT_EMAIL y dale permiso de editor.' }
  }
  if (status === 404) {
    return { status, code, providerMessage, message: 'No se encontró la hoja de Google. Comprueba que GOOGLE_SHEET_ID sea correcto.' }
  }
  if (status === 401 || /invalid_grant|invalid jwt|private key|pem|decoder/i.test(`${message} ${providerMessage ?? ''}`)) {
    return { status, code, providerMessage, message: 'Las credenciales de Google no son válidas. Revisa GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY en el servidor.' }
  }
  if (status === 400) {
    return { status, code, providerMessage, message: 'Google rechazó la solicitud. Comprueba que GOOGLE_SHEET_ID sea solo el ID de la hoja o un enlace válido.' }
  }
  return { status, code, providerMessage, message: 'No se pudo conectar con Google Sheets. Revisa la configuración del servidor e inténtalo de nuevo.' }
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

export type GoogleSheetTable = {
  tableId?: string | null
  range?: { sheetId?: number | null; startRowIndex?: number | null; endRowIndex?: number | null; startColumnIndex?: number | null; endColumnIndex?: number | null } | null
  columnProperties?: Array<{ columnIndex?: number | null; columnName?: string | null }> | null
}

export function getGoogleSheetTables(data: unknown): GoogleSheetTable[] {
  if (typeof data !== 'object' || data === null || !('tables' in data) || !Array.isArray(data.tables)) return []
  return data.tables.filter((table): table is GoogleSheetTable => typeof table === 'object' && table !== null)
}

export async function getRentalSpreadsheet(selectedYear?: string) {
  const configuredSheetId = process.env.GOOGLE_SHEET_ID?.trim()
  if (!configuredSheetId) throw new Error('GOOGLE_SHEET_ID_NOT_CONFIGURED')
  const spreadsheetId = configuredSheetId.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? configuredSheetId
  if (/^https?:\/\//i.test(configuredSheetId) && spreadsheetId === configuredSheetId) {
    throw new Error('GOOGLE_SHEET_ID_INVALID')
  }
  const { sheets } = await getGoogleClients()
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'spreadsheetId,properties(title,locale),sheets(properties(sheetId,title,index,gridProperties(columnCount)))',
  })
  const file = { id: spreadsheetId, name: spreadsheet.data.properties?.title ?? 'Google Sheets', webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` }
  const tabs = spreadsheet.data.sheets ?? []
  const annualTabs = tabs.flatMap(tab => {
    const title = tab.properties?.title ?? ''
    const year = title.match(/^(?:Alquiler_)?(\d{4})$/)?.[1]
    return year ? [{ tab, title, year, sheetId: tab.properties?.sheetId ?? 0, columnCount: tab.properties?.gridProperties?.columnCount ?? 26 }] : []
  })
  const activeYear = selectedYear ?? (annualTabs.some(tab => tab.year === String(new Date().getFullYear()))
    ? String(new Date().getFullYear())
    : [...annualTabs].sort((a, b) => b.year.localeCompare(a.year))[0]?.year)
  const years = await Promise.all(annualTabs.map(async ({ title, year, sheetId, columnCount: initialColumnCount }) => {
      let columnCount = initialColumnCount
      if (activeYear && activeYear !== year) return { year, title, sheetId, columnCount, expenseValues: undefined as unknown[][] | undefined, headerRowNumber: 0, startColumnIndex: 0, headers: [] as string[], rows: [] as Array<{ rowNumber: number; values: unknown[] }> }
      if (columnCount < 33) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: 33 } }, fields: 'gridProperties.columnCount' } }] } })
        columnCount = 33
      }
      const range = `'${title.replaceAll("'", "''")}'!A:Z`
      const result = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: file.id!,
        ranges: activeYear === year ? [range, `'${title.replaceAll("'", "''")}'!AA:AG`] : [range],
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      })
      const valueRanges = result.data.valueRanges ?? []
      const values = valueRanges[0]?.values ?? []
      const expenseValues = activeYear === year ? valueRanges[1]?.values ?? [] : undefined
      const headerIndex = values.findIndex((row) => {
          const headers = row.map(normalizeSheetHeader)
          return headers.includes('MESES') && headers.includes('ALQUILER') && headers.includes('TOTAL')
        })
        if (headerIndex < 0) throw new Error('SHEET_HEADERS_NOT_FOUND')

        const headerRow = values[headerIndex]
        const startColumnIndex = headerRow.findIndex((value) => String(value ?? '').trim() !== '')
        if (startColumnIndex < 0) throw new Error('SHEET_HEADERS_NOT_FOUND')
        const headers = headerRow.slice(startColumnIndex).map((value) => String(value ?? ''))

        return {
          year, title, sheetId, columnCount,
          expenseValues,
          headerRowNumber: headerIndex + 1,
          startColumnIndex,
          headers,
          rows: values.slice(headerIndex + 1).map((row, index) => ({
            rowNumber: headerIndex + index + 2,
            values: headers.map((_, column) => row[startColumnIndex + column] ?? ''),
          })).filter((row) => row.values.some((value) => value !== '')),
        }

    }))
  return {
    file: { id: file.id, name: file.name ?? 'Alquiler Google Sheets', url: file.webViewLink ?? null },
    locale: spreadsheet.data.properties?.locale ?? 'es',
    sheetCount: tabs.length,
    years,
  }
}

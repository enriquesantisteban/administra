import { NextResponse } from 'next/server'
import { getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'

function columnName(index: number) {
  let number = index + 1
  let name = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    number = Math.floor((number - 1) / 26)
  }
  return name
}

const respondToError = (error: unknown) => {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const details = getGoogleSheetsErrorDetails(error)
  console.error('Google Sheets update failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
  return NextResponse.json({ error: details.message }, { status: 502 })
}

export async function POST(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await getSignedInUser()
    const { year } = await params
    if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const spreadsheet = await getRentalSpreadsheet()
    const tab = spreadsheet?.years.find((item) => item.year === year)
    if (!spreadsheet?.file.id || !tab) return NextResponse.json({ error: 'No se encuentra la hoja de ese año' }, { status: 404 })
    const sheetRange = `'${tab.title.replaceAll("'", "''")}'!`
    const firstColumn = columnName(tab.startColumnIndex)
    const lastColumn = columnName(tab.startColumnIndex + tab.headers.length - 1)

    const body = await request.json() as { action?: string; rowNumber?: number; values?: unknown[] }
    const { sheets } = await import('@/lib/google-sheets').then(({ getGoogleClients }) => getGoogleClients())
    if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: body.rowNumber! - 1, endIndex: body.rowNumber! } } }] },
      })
    } else if (body.action === 'add' || body.action === 'update') {
      if (!Array.isArray(body.values) || body.values.length !== tab.headers.length) return NextResponse.json({ error: 'La fila no coincide con las columnas de la hoja' }, { status: 400 })
      if (body.values.some((value) => !['string', 'number', 'boolean'].includes(typeof value))) return NextResponse.json({ error: 'La fila contiene datos no válidos' }, { status: 400 })
      if (body.action === 'add') {
        await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheet.file.id,
          range: `${sheetRange}${firstColumn}:${lastColumn}`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [body.values as (string | number | boolean)[]] },
        })
      } else {
        if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheet.file.id,
          range: `${sheetRange}${firstColumn}${body.rowNumber}:${lastColumn}${body.rowNumber}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [body.values as (string | number | boolean)[]] },
        })
      }
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respondToError(error)
  }
}

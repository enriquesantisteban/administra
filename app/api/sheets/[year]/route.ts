import { NextResponse } from 'next/server'
import { getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { getRentalFormulaCells, isCalculatedRentalHeader, toA1Column } from '@/lib/rental-sheet'

function isCellValueArray(value: unknown): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
}

function rowCells(values: Array<string | number | boolean>, headers: string[], startColumnIndex: number, rowNumber: number) {
  const formulas = getRentalFormulaCells(headers, startColumnIndex, rowNumber)
  return values.map((value, index) => {
    const formula = formulas.get(startColumnIndex + index)
    if (formula) return { userEnteredValue: { formulaValue: formula } }
    if (typeof value === 'string') return { userEnteredValue: { stringValue: value } }
    if (typeof value === 'number') return { userEnteredValue: { numberValue: value } }
    return { userEnteredValue: { boolValue: value } }
  })
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
    const firstColumn = toA1Column(tab.startColumnIndex)
    const lastColumn = toA1Column(tab.startColumnIndex + tab.headers.length - 1)

    const body = await request.json() as { action?: string; rowNumber?: number; values?: unknown[] }
    const { sheets } = await import('@/lib/google-sheets').then(({ getGoogleClients }) => getGoogleClients())
    if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) <= tab.headerRowNumber) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: body.rowNumber! - 1, endIndex: body.rowNumber! } } }] },
      })
    } else if (body.action === 'add' || body.action === 'update') {
      const values = body.values
      if (!isCellValueArray(values) || values.length !== tab.headers.length) return NextResponse.json({ error: 'La fila no coincide con las columnas de la hoja o contiene datos no válidos' }, { status: 400 })
      if (body.action === 'add') {
        const appendValues = values.map((value, index) => isCalculatedRentalHeader(tab.headers[index]) ? '' : value)
        const appended = await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheet.file.id,
          range: `${sheetRange}${firstColumn}:${lastColumn}`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [appendValues] },
        })
        const updatedRange = appended.data.updates?.updatedRange
        const startCell = updatedRange?.slice((updatedRange.lastIndexOf('!') + 1)).split(':')[0]
        const rowNumber = Number(startCell?.match(/\d+$/)?.[0])
        if (!Number.isInteger(rowNumber) || rowNumber <= tab.headerRowNumber) throw new Error('APPENDED_ROW_NOT_RETURNED')
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheet.file.id,
          requestBody: {
            requests: [{
              updateCells: {
                range: {
                  sheetId: tab.sheetId,
                  startRowIndex: rowNumber - 1,
                  endRowIndex: rowNumber,
                  startColumnIndex: tab.startColumnIndex,
                  endColumnIndex: tab.startColumnIndex + tab.headers.length,
                },
                rows: [{ values: rowCells(values, tab.headers, tab.startColumnIndex, rowNumber) }],
                fields: 'userEnteredValue',
              },
            }],
          },
        })
      } else {
        if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) <= tab.headerRowNumber) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheet.file.id,
          requestBody: {
            requests: [{
              updateCells: {
                range: {
                  sheetId: tab.sheetId,
                  startRowIndex: body.rowNumber! - 1,
                  endRowIndex: body.rowNumber!,
                  startColumnIndex: tab.startColumnIndex,
                  endColumnIndex: tab.startColumnIndex + tab.headers.length,
                },
                rows: [{ values: rowCells(values, tab.headers, tab.startColumnIndex, body.rowNumber!) }],
                fields: 'userEnteredValue',
              },
            }],
          },
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

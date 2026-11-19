import { NextResponse } from 'next/server'
import { getGoogleSheetTables, getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { getRentalCurrencyFormatRequests, getRentalFormulaCells, isCalculatedRentalHeader, isPaymentStatusHeader, toA1Column } from '@/lib/rental-sheet'

function isCellValueArray(value: unknown): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
}

function rowCells(values: Array<string | number | boolean>, headers: string[], startColumnIndex: number, rowNumber: number, locale: string, blackText = false) {
  const formulas = getRentalFormulaCells(headers, startColumnIndex, rowNumber, locale)
  return values.map((value, index) => {
    const formula = formulas.get(startColumnIndex + index)
    const cell = formula
      ? { userEnteredValue: { formulaValue: formula } }
      : typeof value === 'string'
        ? { userEnteredValue: { stringValue: value } }
        : typeof value === 'number'
          ? { userEnteredValue: { numberValue: value } }
          : { userEnteredValue: { boolValue: value } }
    return blackText
      ? { ...cell, userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } } } }
      : cell
  })
}

function formulaCellRequests(sheetId: number, headers: string[], startColumnIndex: number, rowNumbers: number[], locale: string) {
  return rowNumbers.flatMap((rowNumber) => {
    const formulas = getRentalFormulaCells(headers, startColumnIndex, rowNumber, locale)
    return [...formulas.entries()].map(([columnIndex, formula]) => ({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: rowNumber - 1,
          endRowIndex: rowNumber,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1,
        },
        rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
        fields: 'userEnteredValue',
      },
    }))
  })
}

const respondToError = (error: unknown) => {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const details = getGoogleSheetsErrorDetails(error)
  console.error('Google Sheets update failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
  const message = details.providerMessage ? `Google Sheets: ${details.providerMessage}` : details.message
  return NextResponse.json({ error: message }, { status: 502 })
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

    const body = await request.json() as { action?: string; rowNumber?: number; values?: unknown[]; status?: string }
    const { sheets } = await import('@/lib/google-sheets').then(({ getGoogleClients }) => getGoogleClients())
    let writtenRowNumber: number | undefined
    let headersForWrite = tab.headers
    if (body.action === 'payment-status') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) <= tab.headerRowNumber) {
        return NextResponse.json({ error: 'Fila no valida' }, { status: 400 })
      }
      if (!tab.rows.some((row) => row.rowNumber === body.rowNumber)) {
        return NextResponse.json({ error: 'No se encontro el registro seleccionado' }, { status: 404 })
      }
      if (body.status !== 'PAGADO' && body.status !== 'PENDIENTE') {
        return NextResponse.json({ error: 'El estado de pago no es valido' }, { status: 400 })
      }
      const currentStatusIndex = tab.headers.findIndex(isPaymentStatusHeader)
      const statusColumn = tab.startColumnIndex + (currentStatusIndex >= 0 ? currentStatusIndex : tab.headers.length)
      const requests = []
      if (currentStatusIndex < 0) {
        requests.push({
          updateCells: {
            range: {
              sheetId: tab.sheetId,
              startRowIndex: tab.headerRowNumber - 1,
              endRowIndex: tab.headerRowNumber,
              startColumnIndex: statusColumn,
              endColumnIndex: statusColumn + 1,
            },
            rows: [{ values: [{ userEnteredValue: { stringValue: 'PAGADO' } }] }],
            fields: 'userEnteredValue',
          },
        })
      }
      requests.push({
        updateCells: {
          range: {
            sheetId: tab.sheetId,
            startRowIndex: body.rowNumber! - 1,
            endRowIndex: body.rowNumber!,
            startColumnIndex: statusColumn,
            endColumnIndex: statusColumn + 1,
          },
          rows: [{ values: [{ userEnteredValue: { stringValue: body.status } }] }],
          fields: 'userEnteredValue',
        },
      })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests },
      })
    } else if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) <= tab.headerRowNumber) return NextResponse.json({ error: 'Fila no valida' }, { status: 400 })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: body.rowNumber! - 1, endIndex: body.rowNumber! } } }] },
      })
    } else if (body.action === 'add' || body.action === 'update') {
      const values = body.values
      if (!isCellValueArray(values) || values.length !== tab.headers.length) return NextResponse.json({ error: 'La fila no coincide con las columnas de la hoja o contiene datos no válidos' }, { status: 400 })
      if (body.action === 'add') {
        let rowValues = [...values]
        const paymentStatusIndex = tab.headers.findIndex(isPaymentStatusHeader)
        if (paymentStatusIndex < 0) {
          headersForWrite = [...tab.headers, 'PAGADO']
          rowValues.push('PENDIENTE')
          const statusColumn = tab.startColumnIndex + tab.headers.length
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheet.file.id,
            requestBody: {
              requests: [{
                updateCells: {
                  range: {
                    sheetId: tab.sheetId,
                    startRowIndex: tab.headerRowNumber - 1,
                    endRowIndex: tab.headerRowNumber,
                    startColumnIndex: statusColumn,
                    endColumnIndex: statusColumn + 1,
                  },
                  rows: [{ values: [{ userEnteredValue: { stringValue: 'PAGADO' } }] }],
                  fields: 'userEnteredValue',
                },
              }],
            },
          })
        } else if (!String(rowValues[paymentStatusIndex] ?? '').trim()) {
          rowValues[paymentStatusIndex] = 'PENDIENTE'
        }
        const appendValues = rowValues.map((value, index) => isCalculatedRentalHeader(headersForWrite[index]) ? '' : value)
        const appendLastColumn = toA1Column(tab.startColumnIndex + headersForWrite.length - 1)
        const appended = await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheet.file.id,
          range: `${sheetRange}${firstColumn}${tab.headerRowNumber + 1}:${appendLastColumn}`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [appendValues] },
        })
        const updatedRange = appended.data.updates?.updatedRange
        const startCell = updatedRange?.slice((updatedRange.lastIndexOf('!') + 1)).split(':')[0]
        const rowNumber = Number(startCell?.match(/\d+$/)?.[0])
        if (!Number.isInteger(rowNumber) || rowNumber <= tab.headerRowNumber) throw new Error('APPENDED_ROW_NOT_RETURNED')
        writtenRowNumber = rowNumber
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
                  endColumnIndex: tab.startColumnIndex + headersForWrite.length,
                },
                rows: [{ values: rowCells(rowValues, headersForWrite, tab.startColumnIndex, rowNumber, spreadsheet.locale, true) }],
                fields: 'userEnteredValue,userEnteredFormat.textFormat.foregroundColor',
              },
            }],
          },
        })
      } else {
        if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) <= tab.headerRowNumber) return NextResponse.json({ error: 'Fila no valida' }, { status: 400 })
        writtenRowNumber = body.rowNumber
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
                rows: [{ values: rowCells(values, tab.headers, tab.startColumnIndex, body.rowNumber!, spreadsheet.locale) }],
                fields: 'userEnteredValue',
              },
            }],
          },
        })
      }
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }
    if (writtenRowNumber !== undefined) {
      const rowNumbers = new Set(tab.rows.map((row) => row.rowNumber))
      rowNumbers.add(writtenRowNumber)
      const formulaRequests = formulaCellRequests(tab.sheetId, headersForWrite, tab.startColumnIndex, [...rowNumbers], spreadsheet.locale)
      const currencyFormatRequests = getRentalCurrencyFormatRequests(tab.sheetId, headersForWrite, tab.startColumnIndex, writtenRowNumber - 1, writtenRowNumber)
      if (formulaRequests.length || currencyFormatRequests.length) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheet.file.id,
          requestBody: { requests: [...formulaRequests, ...currencyFormatRequests] },
        })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respondToError(error)
  }
}

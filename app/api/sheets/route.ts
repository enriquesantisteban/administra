import { NextResponse } from 'next/server'
import { getGoogleClients, getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { getRentalFormulaCells, normalizeSheetHeader } from '@/lib/rental-sheet'

export async function GET() {
  try {
    await getSignedInUser()
    const data = await getRentalSpreadsheet()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const details = getGoogleSheetsErrorDetails(error)
    console.error('Google Sheets read failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
    return NextResponse.json({ error: details.message }, { status: 502 })
  }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const body = await request.json() as { action?: string }
    if (body.action !== 'create-year') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

    const spreadsheet = await getRentalSpreadsheet()
    if (!spreadsheet.file.id || !spreadsheet.years.length) {
      return NextResponse.json({ error: 'No hay una hoja anual que se pueda copiar' }, { status: 409 })
    }

    const template = [...spreadsheet.years].sort((a, b) => b.year.localeCompare(a.year))[0]
    const year = String(Number(template.year) + 1)
    const { sheets } = await getGoogleClients()
    const duplicate = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheet.file.id,
      requestBody: {
        requests: [{ duplicateSheet: { sourceSheetId: template.sheetId, newSheetName: year } }],
      },
    })
    const sheetId = duplicate.data.replies?.[0]?.duplicateSheet?.properties?.sheetId
    if (typeof sheetId !== 'number') throw new Error('DUPLICATED_SHEET_ID_NOT_RETURNED')

    const monthIndex = template.headers.findIndex((header) => normalizeSheetHeader(header) === 'MESES')
    const requests = template.rows.map((row) => {
      const formulas = getRentalFormulaCells(template.headers, template.startColumnIndex, row.rowNumber)
      const cells = template.headers.map((_, index) => {
        const formula = formulas.get(template.startColumnIndex + index)
        if (formula) return { userEnteredValue: { formulaValue: formula } }
        if (index === monthIndex) return { userEnteredValue: { stringValue: String(row.values[index] ?? '') } }
        return { userEnteredValue: { stringValue: '' } }
      })
      return {
        updateCells: {
          range: {
            sheetId,
            startRowIndex: row.rowNumber - 1,
            endRowIndex: row.rowNumber,
            startColumnIndex: template.startColumnIndex,
            endColumnIndex: template.startColumnIndex + template.headers.length,
          },
          rows: [{ values: cells }],
          fields: 'userEnteredValue',
        },
      }
    })

    if (requests.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests },
      })
    }

    return NextResponse.json({ year })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const details = getGoogleSheetsErrorDetails(error)
    console.error('Google Sheets year creation failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
    return NextResponse.json({ error: details.message }, { status: 502 })
  }
}

import { NextResponse } from 'next/server'
import { getGoogleClients, getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'

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
    const body = await request.json() as { action?: string; templateYear?: string; year?: string }
    if (body.action !== 'create-year' && body.action !== 'delete-year') {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    const spreadsheet = await getRentalSpreadsheet()
    if (!spreadsheet.file.id) return NextResponse.json({ error: 'No se encontró el archivo de Google Sheets' }, { status: 409 })
    if (!spreadsheet.years.length) return NextResponse.json({ error: 'No hay hojas anuales disponibles' }, { status: 409 })

    if (body.action === 'delete-year') {
      if (!body.year || !/^\d{4}$/.test(body.year)) {
        return NextResponse.json({ error: 'Selecciona un año válido para eliminar' }, { status: 400 })
      }
      if (spreadsheet.years.length <= 1) {
        return NextResponse.json({ error: 'No se puede eliminar el único año disponible' }, { status: 409 })
      }
      const target = spreadsheet.years.find((item) => item.year === body.year)
      if (!target) return NextResponse.json({ error: 'No se encontró la hoja anual seleccionada' }, { status: 404 })

      const { sheets } = await getGoogleClients()
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests: [{ deleteSheet: { sheetId: target.sheetId } }] },
      })
      const updatedSpreadsheet = await getRentalSpreadsheet()
      if (updatedSpreadsheet.years.some((item) => item.year === body.year)) {
        throw new Error('DELETED_YEAR_STILL_EXISTS')
      }
      return NextResponse.json({ year: body.year })
    }

    if (!body.templateYear || !/^\d{4}$/.test(body.templateYear)) {
      return NextResponse.json({ error: 'Selecciona un año válido como plantilla' }, { status: 400 })
    }
    const template = spreadsheet.years.find((item) => item.year === body.templateYear)
    if (!template) return NextResponse.json({ error: 'No se encontró el año elegido como plantilla' }, { status: 404 })

    const latestYear = Math.max(...spreadsheet.years.map((item) => Number(item.year)))
    const year = String(latestYear + 1)
    const { sheets } = await getGoogleClients()
    const duplicate = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheet.file.id,
      requestBody: {
        requests: [{
          duplicateSheet: {
            sourceSheetId: template.sheetId,
            insertSheetIndex: spreadsheet.sheetCount,
            newSheetName: `Alquiler_${year}`,
          },
        }],
      },
    })
    const sheetId = duplicate.data.replies?.[0]?.duplicateSheet?.properties?.sheetId
    if (typeof sheetId !== 'number') throw new Error('DUPLICATED_SHEET_ID_NOT_RETURNED')

    const requests = template.rows.map((row) => {
      return {
        updateCells: {
          range: {
            sheetId,
            startRowIndex: row.rowNumber - 1,
            endRowIndex: row.rowNumber,
            startColumnIndex: template.startColumnIndex,
            endColumnIndex: template.startColumnIndex + template.headers.length,
          },
          rows: [{ values: template.headers.map(() => ({ userEnteredValue: { stringValue: '' } })) }],
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

    const createdSpreadsheet = await getRentalSpreadsheet()
    if (!createdSpreadsheet.years.some((item) => item.year === year)) {
      throw new Error('CREATED_YEAR_NOT_FOUND')
    }
    return NextResponse.json({ year })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const details = getGoogleSheetsErrorDetails(error)
    console.error('Google Sheets year management failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
    const message = error instanceof Error && error.message === 'CREATED_YEAR_NOT_FOUND'
      ? 'Google no confirmó la creación de la nueva hoja. Actualiza los datos y vuelve a intentarlo.'
      : error instanceof Error && error.message === 'DELETED_YEAR_STILL_EXISTS'
        ? 'Google no confirmó la eliminación de la hoja. Actualiza los datos y vuelve a intentarlo.'
      : details.providerMessage
        ? `Google Sheets: ${details.providerMessage}`
        : details.message
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

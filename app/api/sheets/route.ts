import { NextResponse } from 'next/server'
import { getGoogleClients, getGoogleSheetTables, getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { getRentalCurrencyFormatRequests } from '@/lib/rental-sheet'

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
            newSheetName: year,
          },
        }],
      },
    })
    const sheetId = duplicate.data.replies?.[0]?.duplicateSheet?.properties?.sheetId
    if (typeof sheetId !== 'number') throw new Error('DUPLICATED_SHEET_ID_NOT_RETURNED')
    const yearLabelValues = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet.file.id,
      range: `'${template.title.replaceAll("'", "''")}'!A3:Z4`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    const yearLabelRequests = (yearLabelValues.data.values ?? []).flatMap((row, rowIndex) =>
      row.flatMap((value, columnIndex) => {
        if (String(value ?? '').trim() !== template.year) return []
        const userEnteredValue = typeof value === 'number'
          ? { numberValue: Number(year) }
          : { stringValue: year }
        return [{
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowIndex + 2,
              endRowIndex: rowIndex + 3,
              startColumnIndex: columnIndex,
              endColumnIndex: columnIndex + 1,
            },
            rows: [{ values: [{ userEnteredValue }] }],
            fields: 'userEnteredValue',
          },
        }]
      }),
    )
    if (yearLabelRequests.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: { requests: yearLabelRequests },
      })
    }

    const tableName = `Alquiler_${year}`
    const tableMetadata = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheet.file.id,
      fields: 'tables(tableId,name,range,columnProperties)',
    })
    const copiedTable = getGoogleSheetTables(tableMetadata.data).find((table) => table.range?.sheetId === sheetId)
    const tableEndRowIndex = copiedTable?.range?.endRowIndex ?? template.headerRowNumber + 1
    if (copiedTable?.tableId) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: {
          requests: [{
            updateTable: {
              table: { tableId: copiedTable.tableId, name: tableName },
              fields: 'name',
            },
          }],
        },
      })
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: {
          requests: [{
            addTable: {
              table: {
                name: tableName,
                range: {
                  sheetId,
                  startRowIndex: template.headerRowNumber - 1,
                  endRowIndex: template.headerRowNumber + 1,
                  startColumnIndex: template.startColumnIndex,
                  endColumnIndex: template.startColumnIndex + template.headers.length,
                },
                columnProperties: template.headers.map((columnName, columnIndex) => ({ columnName, columnIndex })),
              },
            },
          }],
        },
      })
    }

    const lastDataRow = template.rows.reduce((last, row) => Math.max(last, row.rowNumber), template.headerRowNumber)
    const tableBodyEndRowIndex = Math.max(tableEndRowIndex, lastDataRow)
    if (tableBodyEndRowIndex > template.headerRowNumber) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: spreadsheet.file.id,
        range: `'${year}'!A${template.headerRowNumber + 1}:Z${tableBodyEndRowIndex}`,
      })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: template.headerRowNumber,
                endIndex: tableBodyEndRowIndex,
              },
            },
          }],
        },
      })
    }

    const tableAfterClearMetadata = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheet.file.id,
      fields: 'tables(tableId,name,range,columnProperties)',
    })
    const emptyTable = getGoogleSheetTables(tableAfterClearMetadata.data).find((table) => table.range?.sheetId === sheetId)
    if (emptyTable?.tableId) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheet.file.id,
        requestBody: {
          requests: [{
            updateTable: {
              table: {
                tableId: emptyTable.tableId,
                range: {
                  sheetId,
                  startRowIndex: template.headerRowNumber - 1,
                  endRowIndex: template.headerRowNumber,
                  startColumnIndex: template.startColumnIndex,
                  endColumnIndex: template.startColumnIndex + template.headers.length,
                },
              },
              fields: 'range',
            },
          }],
        },
      })
    }
    const currencyFormatRequests = spreadsheet.years.flatMap((item) =>
      getRentalCurrencyFormatRequests(item.sheetId, item.headers, item.startColumnIndex, item.headerRowNumber),
    )
    currencyFormatRequests.push(...getRentalCurrencyFormatRequests(sheetId, template.headers, template.startColumnIndex, template.headerRowNumber))
    if (currencyFormatRequests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: spreadsheet.file.id, requestBody: { requests: currencyFormatRequests } })
    }
    const newYearRows = (await getRentalSpreadsheet()).years.find((item) => item.year === year)?.rows ?? []
    if (newYearRows.length) throw new Error('CREATED_YEAR_CONTAINS_TEMPLATE_ROWS')
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

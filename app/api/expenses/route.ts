import { NextResponse } from 'next/server'
import { getGoogleClients, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'

const HEADERS = ['Fecha', 'Categoría', 'Importe', 'Compartido', 'Periodo inicio', 'Periodo fin', 'Estado']
const EXPENSE_COLUMNS = 'AA:AG'
const cats = ['Alquiler', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras']
async function ensureExpenseColumns(sheets: Awaited<ReturnType<typeof getGoogleClients>>['sheets'], spreadsheetId: string, sheetId: number) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,gridProperties(columnCount)))' })
  const properties = meta.data.sheets?.find(sheet => sheet.properties?.sheetId === sheetId)?.properties
  const count = properties?.gridProperties?.columnCount ?? 26
  if (count < 33) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: 33 } }, fields: 'gridProperties.columnCount' } }] } })
}
function validValues(values: unknown, year: string): values is unknown[] {
  if (!Array.isArray(values) || values.length !== 7 || typeof values[0] !== 'string' || !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(values[0])) return false
  if (typeof values[1] !== 'string' || !cats.includes(values[1]) || typeof values[2] !== 'string' || !/^\d+\.\d{2}$/.test(values[2])) return false
  if (values[1] === 'Internet' ? values[2] !== '0.00' : Number(values[2]) <= 0) return false
  if (typeof values[3] !== 'boolean' || !['Pagado', 'Pendiente'].includes(String(values[6]))) return false
  return true
}
const respond = (error: unknown) => error instanceof Error && error.message === 'UNAUTHORIZED'
  ? NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  : error instanceof Error && error.message.startsWith('EXPENSE_COLUMNS_OCCUPIED:')
    ? NextResponse.json({ error: `No se pueden usar las columnas de gastos porque ya contienen datos en la hoja ${error.message.split(':')[1]}.` }, { status: 409 })
    : NextResponse.json({ error: error instanceof Error ? error.message : 'Error de Google Sheets' }, { status: 502 })

export async function GET() {
  try {
    await getSignedInUser()
    const base = await getRentalSpreadsheet()
    const { sheets } = await getGoogleClients()
    const years = await Promise.all(base.years.map(async tab => {
      await ensureExpenseColumns(sheets, base.file.id, tab.sheetId)
      const range = `'${tab.title.replaceAll("'", "''")}'!${EXPENSE_COLUMNS}`
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: base.file.id, range, valueRenderOption: 'UNFORMATTED_VALUE' })
      const values = res.data.values ?? []
      if (values[0]?.some(value => String(value ?? '').trim() !== '') && values[0]?.some((value, index) => String(value ?? '') !== HEADERS[index])) {
        throw new Error(`EXPENSE_COLUMNS_OCCUPIED:${tab.year}`)
      }
      if (!values[0]?.some(value => String(value ?? '').trim() !== '')) {
        await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `'${tab.title.replaceAll("'", "''")}'!AA1:AG1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
      }
      return { year: tab.year, sheetId: tab.sheetId, title: tab.title, rows: values.slice(1).map((row, index) => ({ rowNumber: index + 2, values: HEADERS.map((_, i) => row[i] ?? '') })).filter(row => row.values.some(v => v !== '')) }
    }))
    return NextResponse.json({ years: years.map(({ title: _title, ...year }) => year), file: base.file })
  } catch (e) { return respond(e) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const base = await getRentalSpreadsheet()
    const body = await request.json() as { action?: string; year?: string; rowNumber?: number; values?: unknown[]; status?: string }
    if (!/^\d{4}$/.test(body.year ?? '')) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const { sheets } = await getGoogleClients()
    const tab = base.years.find(item => item.year === body.year)
    if (!tab) return NextResponse.json({ error: 'No existe una hoja anual para ese año en el Google Sheet' }, { status: 404 })
    await ensureExpenseColumns(sheets, base.file.id, tab.sheetId)
    const escapedTitle = tab.title.replaceAll("'", "''")
    const range = `'${escapedTitle}'!`
    if (body.action === 'add') {
      if (!validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: base.file.id, range: `${range}${EXPENSE_COLUMNS}`, valueRenderOption: 'UNFORMATTED_VALUE' })
      const rows = existing.data.values ?? []
      let rowNumber = Math.max(2, rows.length + 1)
      for (let i = 1; i < rows.length; i++) if (!rows[i]?.some(value => value !== '' && value != null)) { rowNumber = i + 1; break }
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AA${rowNumber}:AG${rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [body.values] } })
    } else if (body.action === 'update') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AA${body.rowNumber}:AG${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [body.values] } })
    } else if (body.action === 'status') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !['Pagado', 'Pendiente'].includes(body.status ?? '')) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AG${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.status]] } })
    } else if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
      await sheets.spreadsheets.values.clear({ spreadsheetId: base.file.id, range: `${range}AA${body.rowNumber}:AG${body.rowNumber}` })
    } else return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) { return respond(e) }
}

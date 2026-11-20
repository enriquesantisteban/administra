import { NextResponse } from 'next/server'
import { getGoogleClients, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { getRentalCurrencyFormatRequests, getRentalFormulaCells, isCalculatedRentalHeader, isPaymentStatusHeader, normalizeSheetHeader, toA1Column } from '@/lib/rental-sheet'

const HEADERS = ['Fecha', 'Categoría', 'Importe', 'Compartido', 'Periodo inicio', 'Periodo fin', 'Estado']
const cats = ['Alquiler', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras']
const MONTH_LABELS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const monthOf = (value: unknown) => { const match = /^(\d{4})-(\d{2})/.exec(String(value ?? '')); return match ? `${match[1]}-${match[2]}` : '' }
function amountCents(value: unknown) {
  if (typeof value === 'number') return Math.round(value * 100)
  const text = String(value ?? '').trim().replace(/[€\s]/g, '')
  const amount = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}
async function ensureExpenseColumns(sheets: Awaited<ReturnType<typeof getGoogleClients>>['sheets'], spreadsheetId: string, sheetId: number, count: number) {
  if (count < 33) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: 33 } }, fields: 'gridProperties.columnCount' } }] } })
}
const LEGACY_CATEGORIES = [
  { category: 'Alquiler', header: 'ALQUILER', shareHeader: 'CON ANGEL' },
  { category: 'Luz', header: 'LUZ', shareHeader: 'CON ANGEL' },
  { category: 'Agua', header: 'AGUA', shareHeader: 'CON ANGEL' },
  { category: 'Basura', header: 'BASURA', shareHeader: 'CON ANGEL' },
  { category: 'Compras', header: 'COMPRAS', shareHeader: 'A MEDIAS' },
]
function legacyRows(tab: Awaited<ReturnType<typeof getRentalSpreadsheet>>['years'][number], expenseValues: unknown[][] = []) {
  const find = (name: string) => tab.headers.findIndex(header => normalizeSheetHeader(header) === name)
  const monthColumn = find('MESES') >= 0 ? find('MESES') : find('MES')
  const statusColumn = tab.headers.findIndex(header => ['ESTADO', 'PAGADO'].includes(normalizeSheetHeader(header)))
  const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const amountOf = (value: unknown) => {
    if (typeof value === 'number') return value
    const valueText = String(value ?? '').trim().replace(/[€\s]/g, '')
    const normalized = valueText.includes(',') ? valueText.replace(/\./g, '').replace(',', '.') : valueText
    const amount = Number(normalized)
    return Number.isFinite(amount) ? amount : 0
  }
  return tab.rows.flatMap(row => {
    const monthName = normalizeSheetHeader(row.values[monthColumn]).toLocaleLowerCase('es')
    const month = monthNames.findIndex(item => item.slice(0, 3) === monthName.slice(0, 3))
    if (month < 0) return []
    const date = `${tab.year}-${String(month + 1).padStart(2, '0')}-01`
    const status = String(row.values[statusColumn] ?? '').trim().toLocaleLowerCase('es') === 'pagado' ? 'Pagado' : 'Pendiente'
    return LEGACY_CATEGORIES.flatMap((item, index) => {
      const amountIndex = find(item.header)
      const ledgerCents = expenseValues.slice(1).filter(stored => monthOf(stored[0]) === monthOf(date) && normalizeSheetHeader(stored[1]) === normalizeSheetHeader(item.category)).reduce((sum, stored) => sum + amountCents(stored[2]), 0)
      const amount = amountOf(row.values[amountIndex]) - ledgerCents / 100
      if (amountIndex < 0 || amount <= 0) return []
      const shareIndex = item.shareHeader ? find(item.shareHeader) : -1
      const shared = shareIndex >= 0 && ['SI', 'SÍ', 'TRUE', '1'].includes(normalizeSheetHeader(row.values[shareIndex]))
      return [{ rowNumber: -(row.rowNumber * 10 + index + 1), legacy: true, values: [date, item.category, Math.max(0, amount), shared, '', '', status] }]
    })
  })
}
function sourceMonthRow(tab: Awaited<ReturnType<typeof getRentalSpreadsheet>>['years'][number], date: string) {
  const monthIndex = tab.headers.findIndex(header => ['MES', 'MESES'].includes(normalizeSheetHeader(header)))
  const month = MONTH_LABELS[Number(date.slice(5, 7)) - 1]
  return tab.rows.find(row => normalizeSheetHeader(row.values[monthIndex]).startsWith(month))
}
async function syncSourceCategory(
  sheets: Awaited<ReturnType<typeof getGoogleClients>>['sheets'], spreadsheetId: string,
  tab: Awaited<ReturnType<typeof getRentalSpreadsheet>>['years'][number], date: string,
  category: string, deltaCents: number, shared?: boolean, status?: string, locale = 'es',
) {
  const categoryIndex = tab.headers.findIndex(header => normalizeSheetHeader(header) === normalizeSheetHeader(category))
  if (categoryIndex < 0) return
  const sheetRange = `'${tab.title.replaceAll("'", "''")}'!`
  const row = sourceMonthRow(tab, date)
  if (!row) {
    if (deltaCents <= 0) return
    const monthColumn = tab.headers.findIndex(header => ['MES', 'MESES'].includes(normalizeSheetHeader(header)))
    const values = tab.headers.map((column, index) => {
      const key = normalizeSheetHeader(column)
      const shareHeader = category === 'Compras' ? 'A MEDIAS' : ['Alquiler', 'Luz', 'Agua', 'Basura'].includes(category) ? 'CON ANGEL' : ''
      if (index === monthColumn) return MONTH_LABELS[Number(date.slice(5, 7)) - 1]
      if (index === categoryIndex) return deltaCents / 100
      if (shared !== undefined && shareHeader && key === shareHeader) return shared ? 'SÍ' : 'NO'
      if (isPaymentStatusHeader(column)) return status ?? 'Pendiente'
      return isCalculatedRentalHeader(column) ? '' : '-'
    })
    const lastColumn = toA1Column(tab.startColumnIndex + tab.headers.length - 1)
    const appended = await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetRange}${toA1Column(tab.startColumnIndex)}${tab.headerRowNumber + 1}:${lastColumn}`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [values] } })
    const updatedRange = appended.data.updates?.updatedRange
    const startCell = updatedRange?.slice(updatedRange.lastIndexOf('!') + 1).split(':')[0]
    const rowNumber = Number(startCell?.match(/\d+$/)?.[0])
    if (!Number.isInteger(rowNumber) || rowNumber <= tab.headerRowNumber) throw new Error('APPENDED_EXPENSE_ROW_NOT_RETURNED')
    const formulas = getRentalFormulaCells(tab.headers, tab.startColumnIndex, rowNumber, locale)
    const formulaRequests = [...formulas.entries()].map(([columnIndex, formula]) => ({ updateCells: { range: { sheetId: tab.sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 }, rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: 'userEnteredValue' } }))
    const formats = getRentalCurrencyFormatRequests(tab.sheetId, tab.headers, tab.startColumnIndex, rowNumber - 1, rowNumber)
    if (formulaRequests.length || formats.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [...formulaRequests, ...formats] } })
    return
  }
  const currentCents = amountCents(row.values[categoryIndex])
  const data: Array<{ range: string; values: unknown[][] }> = [{ range: `${sheetRange}${toA1Column(tab.startColumnIndex + categoryIndex)}${row.rowNumber}`, values: [[Math.max(0, currentCents + deltaCents) / 100]] }]
  const header = category === 'Compras' ? 'A MEDIAS' : ['Alquiler', 'Luz', 'Agua', 'Basura'].includes(category) ? 'CON ANGEL' : ''
  if (shared !== undefined && header) {
    const index = tab.headers.findIndex(item => normalizeSheetHeader(item) === header)
    if (index >= 0) data.push({ range: `${sheetRange}${toA1Column(tab.startColumnIndex + index)}${row.rowNumber}`, values: [[shared ? 'SÍ' : 'NO']] })
  }
  if (status) {
    const index = tab.headers.findIndex(isPaymentStatusHeader)
    if (index >= 0) data.push({ range: `${sheetRange}${toA1Column(tab.startColumnIndex + index)}${row.rowNumber}`, values: [[status]] })
  }
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } })
}
function validValues(values: unknown, year: string): values is unknown[] {
  if (!Array.isArray(values) || values.length !== 7 || typeof values[0] !== 'string' || !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(values[0])) return false
  if (typeof values[1] !== 'string' || !cats.includes(values[1]) || typeof values[2] !== 'string' || !/^\d+\.\d{2}$/.test(values[2])) return false
  if (Number(values[2]) <= 0) return false
  if (typeof values[3] !== 'boolean' || !['Pagado', 'Pendiente'].includes(String(values[6]))) return false
  return true
}
const respond = (error: unknown) => error instanceof Error && error.message === 'UNAUTHORIZED'
  ? NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  : error instanceof Error && error.message.startsWith('EXPENSE_COLUMNS_OCCUPIED:')
    ? NextResponse.json({ error: `No se pueden usar las columnas de gastos porque ya contienen datos en la hoja ${error.message.split(':')[1]}.` }, { status: 409 })
    : NextResponse.json({ error: error instanceof Error ? error.message : 'Error de Google Sheets' }, { status: 502 })

export async function GET(request: Request) {
  try {
    await getSignedInUser()
    const requestedYear = new URL(request.url).searchParams.get('year') ?? undefined
    const base = await getRentalSpreadsheet(requestedYear)
    const selectedYear = requestedYear ?? base.years.find(tab => tab.headers.length)?.year
    const { sheets } = await getGoogleClients()
    const years = await Promise.all(base.years.map(async tab => {
      if (tab.year !== selectedYear) return { year: tab.year, sheetId: tab.sheetId, rows: [] as Array<{ rowNumber: number; values: unknown[]; legacy?: boolean }> }
      await ensureExpenseColumns(sheets, base.file.id, tab.sheetId, tab.columnCount)
      const values = tab.expenseValues ?? []
      const hasHeader = values[0]?.some(value => String(value ?? '').trim() !== '') ?? false
      const hasContent = values.some(row => row.some(value => String(value ?? '').trim() !== ''))
      if ((hasHeader && values[0]?.some((value, index) => String(value ?? '') !== HEADERS[index])) || (hasContent && !hasHeader)) {
        throw new Error(`EXPENSE_COLUMNS_OCCUPIED:${tab.year}`)
      }
      if (!hasContent) {
        await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `'${tab.title.replaceAll("'", "''")}'!AA1:AG1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
      }
      const storedRows = values.slice(1).map((row, index) => ({ rowNumber: index + 2, values: HEADERS.map((_, i) => row[i] ?? '') })).filter(row => row.values.some(v => v !== ''))
      return { year: tab.year, sheetId: tab.sheetId, rows: [...legacyRows(tab, values), ...storedRows] }
    }))
    return NextResponse.json({ years, file: base.file })
  } catch (e) { return respond(e) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const body = await request.json() as { action?: string; year?: string; rowNumber?: number; values?: unknown[]; status?: string; legacy?: boolean }
    if (!/^\d{4}$/.test(body.year ?? '')) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const base = await getRentalSpreadsheet(body.year)
    const { sheets } = await getGoogleClients()
    const tab = base.years.find(item => item.year === body.year)
    if (!tab) return NextResponse.json({ error: 'No existe una hoja anual para ese año en el Google Sheet' }, { status: 404 })
    await ensureExpenseColumns(sheets, base.file.id, tab.sheetId, tab.columnCount)
    const escapedTitle = tab.title.replaceAll("'", "''")
    const range = `'${escapedTitle}'!`
    const legacy = body.legacy === true || (body.rowNumber ?? 0) < 0
    if (legacy) {
      const encoded = Math.abs(body.rowNumber ?? 0)
      const categoryIndex = encoded % 10 - 1
      const legacyRowNumber = Math.floor(encoded / 10)
      const legacyCategory = LEGACY_CATEGORIES[categoryIndex]
      const sourceRow = tab.rows.find(row => row.rowNumber === legacyRowNumber)
      if (!legacyCategory || !sourceRow) return NextResponse.json({ error: 'No se encontró el gasto histórico seleccionado' }, { status: 404 })
      const statusColumn = tab.headers.findIndex(header => ['ESTADO', 'PAGADO'].includes(normalizeSheetHeader(header)))
      if (body.action === 'status') {
        if (statusColumn < 0) return NextResponse.json({ error: 'La hoja histórica no tiene columna de estado' }, { status: 409 })
        if (!['Pagado', 'Pendiente'].includes(body.status ?? '')) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
        await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + statusColumn)}${legacyRowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.status]] } })
      } else if (body.action === 'delete') {
        const index = tab.headers.findIndex(header => normalizeSheetHeader(header) === legacyCategory.header)
        if (index < 0) return NextResponse.json({ error: 'No se encontró la categoría en la hoja anual' }, { status: 404 })
        await sheets.spreadsheets.values.clear({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + index)}${legacyRowNumber}` })
      } else if (body.action === 'update') {
        if (!validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
        const selected = LEGACY_CATEGORIES.find(item => item.category === body.values![1]) ?? legacyCategory
        if (body.values[1] === 'Internet') return NextResponse.json({ error: 'Internet no se puede guardar como un gasto histórico variable' }, { status: 400 })
        const selectedIndex = tab.headers.findIndex(header => normalizeSheetHeader(header) === selected.header)
        if (selectedIndex < 0) return NextResponse.json({ error: 'No se encontró la categoría en la hoja anual' }, { status: 404 })
        if (selected.header !== legacyCategory.header) {
          const oldIndex = tab.headers.findIndex(header => normalizeSheetHeader(header) === legacyCategory.header)
          if (oldIndex >= 0) await sheets.spreadsheets.values.clear({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + oldIndex)}${legacyRowNumber}` })
        }
        await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + selectedIndex)}${legacyRowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[Number(body.values[2])]] } })
        const shareHeader = selected.shareHeader
        if (shareHeader) {
          const shareIndex = tab.headers.findIndex(header => normalizeSheetHeader(header) === shareHeader)
          if (shareIndex >= 0) await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + shareIndex)}${legacyRowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.values[3] ? 'SÍ' : 'NO']] } })
        }
        if (statusColumn >= 0) await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}${toA1Column(tab.startColumnIndex + statusColumn)}${legacyRowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.values[6]]] } })
      } else return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'add') {
      if (!validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      const rows = tab.expenseValues ?? []
      if (body.values[1] === 'Internet' && rows.slice(1).some(row => String(row[0] ?? '').slice(0, 7) === String(body.values![0]).slice(0, 7) && normalizeSheetHeader(row[1]) === 'INTERNET')) return NextResponse.json({ error: 'Ya hay un registro de Internet para ese mes.' }, { status: 409 })
      let rowNumber = Math.max(2, rows.length + 1)
      for (let i = 1; i < rows.length; i++) if (!rows[i]?.some(value => value !== '' && value != null)) { rowNumber = i + 1; break }
      await syncSourceCategory(sheets, base.file.id, tab, String(body.values[0]), String(body.values[1]), amountCents(body.values[2]), Boolean(body.values[3]), String(body.values[6]), base.locale)
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AA${rowNumber}:AG${rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [body.values] } })
    } else if (body.action === 'update') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      const old = tab.expenseValues?.[(body.rowNumber ?? 2) - 1] ?? []
      const oldDate = String(old[0] ?? '')
      const oldCategory = String(old[1] ?? '')
      const oldAmount = amountCents(old[2])
      const nextDate = String(body.values[0])
      const nextCategory = String(body.values[1])
      const nextAmount = amountCents(body.values[2])
      if (oldDate && (monthOf(oldDate) !== monthOf(nextDate) || normalizeSheetHeader(oldCategory) !== normalizeSheetHeader(nextCategory))) {
        await syncSourceCategory(sheets, base.file.id, tab, oldDate, oldCategory, -oldAmount, undefined, undefined, base.locale)
        await syncSourceCategory(sheets, base.file.id, tab, nextDate, nextCategory, nextAmount, Boolean(body.values[3]), String(body.values[6]), base.locale)
      } else if (oldDate) {
        await syncSourceCategory(sheets, base.file.id, tab, nextDate, nextCategory, nextAmount - oldAmount, Boolean(body.values[3]), String(body.values[6]), base.locale)
      }
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AA${body.rowNumber}:AG${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [body.values] } })
    } else if (body.action === 'status') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !['Pagado', 'Pendiente'].includes(body.status ?? '')) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
      const stored = tab.expenseValues?.[(body.rowNumber ?? 2) - 1] ?? []
      if (stored[0] && stored[1]) await syncSourceCategory(sheets, base.file.id, tab, String(stored[0]), String(stored[1]), 0, undefined, body.status, base.locale)
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}AG${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.status]] } })
    } else if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
      const stored = tab.expenseValues?.[(body.rowNumber ?? 2) - 1] ?? []
      if (stored[0] && stored[1]) await syncSourceCategory(sheets, base.file.id, tab, String(stored[0]), String(stored[1]), -amountCents(stored[2]), undefined, undefined, base.locale)
      await sheets.spreadsheets.values.clear({ spreadsheetId: base.file.id, range: `${range}AA${body.rowNumber}:AG${body.rowNumber}` })
    } else return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) { return respond(e) }
}

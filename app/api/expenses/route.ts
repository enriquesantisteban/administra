import { NextResponse } from 'next/server'
import { getGoogleClients, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'
import { normalizeSheetHeader } from '@/lib/rental-sheet'

const HEADERS = ['Fecha', 'Categoría', 'Importe', 'Compartido', 'Periodo inicio', 'Periodo fin', 'Estado']
const cats = ['Alquiler', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras']
function validValues(values: unknown, year: string): values is unknown[] {
  if (!Array.isArray(values) || values.length !== 7 || typeof values[0] !== 'string' || !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(values[0])) return false
  if (typeof values[1] !== 'string' || !cats.includes(values[1]) || typeof values[2] !== 'string' || !/^\d+\.\d{2}$/.test(values[2])) return false
  if (values[1] === 'Internet' ? values[2] !== '0.00' : Number(values[2]) <= 0) return false
  if (typeof values[3] !== 'boolean' || !['Pagado', 'Pendiente'].includes(String(values[6]))) return false
  return true
}
const respond = (error: unknown) => error instanceof Error && error.message === 'UNAUTHORIZED'
  ? NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  : NextResponse.json({ error: error instanceof Error ? error.message : 'Error de Google Sheets' }, { status: 502 })

function legacyExpenseRows(year: string, source?: { headers: string[]; rows: Array<{ values: unknown[] }> }) {
  if (!source) return [] as unknown[][]
  const find = (name: string) => source.headers.findIndex(h => normalizeSheetHeader(h) === normalizeSheetHeader(name))
  const monthIndex = source.headers.findIndex(h => normalizeSheetHeader(h) === 'MES' || normalizeSheetHeader(h) === 'MESES')
  const sharedIndex = source.headers.findIndex(h => normalizeSheetHeader(h) === 'CON ANGEL')
  const halfIndex = source.headers.findIndex(h => normalizeSheetHeader(h) === 'A MEDIAS')
  const statusIndex = source.headers.findIndex(h => ['ESTADO', 'PAGADO'].includes(normalizeSheetHeader(h)))
  const toAmount = (value: unknown) => {
    if (typeof value === 'number') return Math.round(value * 100) / 100
    const raw = String(value ?? '').trim()
    const number = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw)
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
  }
  const enabled = (value: unknown) => ['SI', 'SÍ', 'TRUE', '1'].includes(normalizeSheetHeader(value))
  const monthNo = (value: unknown) => {
    const m = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 3)
    return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].indexOf(m)
  }
  const out: unknown[][] = []
  for (const row of source.rows) {
    const month = monthNo(row.values[monthIndex])
    if (month < 0) continue
    const date = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const status = normalizeSheetHeader(row.values[statusIndex]) === 'PAGADO' ? 'Pagado' : 'Pendiente'
    for (const category of ['Alquiler', 'Luz', 'Agua', 'Basura', 'Compras']) {
      const index = find(category)
      if (index < 0) continue
      const amount = toAmount(row.values[index])
      if (amount <= 0) continue
      const shared = category === 'Luz' || category === 'Agua' ? enabled(row.values[sharedIndex]) : category === 'Compras' ? enabled(row.values[halfIndex]) : false
      out.push([date, category, amount, shared, '', '', status])
    }
  }
  return out
}

export async function GET() {
  try {
    await getSignedInUser()
    const base = await getRentalSpreadsheet()
    const { sheets } = await getGoogleClients()
    const meta = await sheets.spreadsheets.get({ spreadsheetId: base.file.id, fields: 'sheets(properties(sheetId,title))' })
    const yearTabs = (meta.data.sheets ?? []).flatMap(s => {
      const title = s.properties?.title ?? ''
      const match = title.match(/^Gastos_(\d{4})$/)
      return match && s.properties?.sheetId != null ? [{ year: match[1], title, sheetId: s.properties.sheetId }] : []
    })
    const existing = new Set(yearTabs.map(t => t.year))
    for (const { year } of base.years) {
      if (existing.has(year)) continue
      const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: base.file.id, requestBody: { requests: [{ addSheet: { properties: { title: `Gastos_${year}` } } }] } })
      const id = add.data.replies?.[0]?.addSheet?.properties?.sheetId
      if (id == null) continue
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `'Gastos_${year}'!A1:G1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
      const migrated = legacyExpenseRows(year, base.years.find(item => item.year === year))
      if (migrated.length) await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `'Gastos_${year}'!A2:G${migrated.length + 1}`, valueInputOption: 'RAW', requestBody: { values: migrated } })
      yearTabs.push({ year, title: `Gastos_${year}`, sheetId: id })
    }
    for (const year of ['2025', '2026', '2027']) {
      if (existing.has(year) || yearTabs.some(tab => tab.year === year)) continue
      const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: base.file.id, requestBody: { requests: [{ addSheet: { properties: { title: `Gastos_${year}` } } }] } })
      const id = add.data.replies?.[0]?.addSheet?.properties?.sheetId
      if (id == null) continue
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `'Gastos_${year}'!A1:G1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } })
      yearTabs.push({ year, title: `Gastos_${year}`, sheetId: id })
    }
    const years = await Promise.all(yearTabs.map(async tab => {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: base.file.id, range: `'${tab.title}'!A:G`, valueRenderOption: 'UNFORMATTED_VALUE' })
      return { year: tab.year, sheetId: tab.sheetId, rows: (res.data.values ?? []).slice(1).map((values, i) => ({ rowNumber: i + 2, values })).filter(row => row.values.some(v => v !== '')) }
    }))
    return NextResponse.json({ years, file: base.file })
  } catch (e) { return respond(e) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const base = await getRentalSpreadsheet()
    const body = await request.json() as { action?: string; year?: string; rowNumber?: number; values?: unknown[]; status?: string }
    if (!/^\d{4}$/.test(body.year ?? '')) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const { sheets } = await getGoogleClients()
    const meta = await sheets.spreadsheets.get({ spreadsheetId: base.file.id, fields: 'sheets(properties(sheetId,title))' })
    const tab = (meta.data.sheets ?? []).find(s => s.properties?.title === `Gastos_${body.year}`)?.properties
    if (!tab?.sheetId) return NextResponse.json({ error: 'No existe la hoja de gastos del año' }, { status: 404 })
    const range = `'Gastos_${body.year}'!`
    if (body.action === 'add') {
      if (!validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      await sheets.spreadsheets.values.append({ spreadsheetId: base.file.id, range: `${range}A:G`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [body.values] } })
    } else if (body.action === 'update') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !validValues(body.values, body.year!)) return NextResponse.json({ error: 'Registro no válido. Revisa el año, la categoría y el importe.' }, { status: 400 })
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}A${body.rowNumber}:G${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [body.values] } })
    } else if (body.action === 'status') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2 || !['Pagado', 'Pendiente'].includes(body.status ?? '')) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
      await sheets.spreadsheets.values.update({ spreadsheetId: base.file.id, range: `${range}G${body.rowNumber}`, valueInputOption: 'RAW', requestBody: { values: [[body.status]] } })
    } else if (body.action === 'delete') {
      if (!Number.isInteger(body.rowNumber) || (body.rowNumber ?? 0) < 2) return NextResponse.json({ error: 'Fila no válida' }, { status: 400 })
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: base.file.id, requestBody: { requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: body.rowNumber! - 1, endIndex: body.rowNumber! } } }] } })
    } else return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) { return respond(e) }
}

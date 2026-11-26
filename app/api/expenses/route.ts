import { NextResponse } from 'next/server'
import { sql } from '@/lib/neon'
import { getSignedInUser } from '@/lib/session'

const categories = ['Alquiler', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras', 'Comunidad']
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)
const responseError = (error: unknown) => error instanceof Error && error.message === 'UNAUTHORIZED'
  ? NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  : NextResponse.json({ error: error instanceof Error ? error.message : 'Error de base de datos' }, { status: 500 })

export async function GET(request: Request) {
  try {
    await getSignedInUser()
    const requestedYear = new URL(request.url).searchParams.get('year')
    const yearsRaw = await sql`SELECT DISTINCT anio FROM alquiler ORDER BY anio`
    const years = yearsRaw.map(row => String(row.anio))
    const year = requestedYear && /^\d{4}$/.test(requestedYear) ? Number(requestedYear) : undefined
    const rentRows = year ? await sql`SELECT * FROM alquiler WHERE anio=${year} ORDER BY mes` : []
    const expenseRows = year ? await sql`SELECT g.*, a.anio, a.mes FROM alquiler_gastos g JOIN alquiler a ON a.id=g.alquiler_id WHERE a.anio=${year} ORDER BY a.mes, g.id` : []
    const companions = year ? await sql`SELECT c.*, a.anio, a.mes FROM alquiler_companeros c JOIN alquiler a ON a.id=c.alquiler_id WHERE a.anio=${year} ORDER BY a.mes, c.id` : []
    const expenseCompanions = year ? await sql`SELECT gc.gasto_id, c.id, c.nombre FROM alquiler_gasto_companeros gc JOIN companeros c ON c.id=gc.companero_id JOIN alquiler_gastos g ON g.id=gc.gasto_id JOIN alquiler a ON a.id=g.alquiler_id WHERE a.anio=${year} ORDER BY c.nombre` : []
    const entries: Array<{ date: string; category: string; amount: string; shared: boolean; start: string; end: string; status: string; id: number; divider?: number; expenseDivider?: number; companions?: { id: number | null; name: string; contribution: string }[]; expenseCompanions?: { id: number; name: string }[] }> = []
    for (const rent of rentRows) {
      const roommates = companions.filter(person => Number(person.alquiler_id) === Number(rent.id)).map(person => ({ id: person.companero_id == null ? null : Number(person.companero_id), name: String(person.nombre), contribution: String(person.aportacion_alquiler) }))
      entries.push({ id: -Number(rent.id), date: `${rent.anio}-${String(rent.mes).padStart(2, '0')}-01`, category: 'Alquiler', amount: String(rent.importe_alquiler), shared: false, start: '', end: '', status: rent.estado === 'pagado' ? 'Pagado' : 'Pendiente', divider: Number(rent.dividir_gastos_entre), companions: roommates })
    }
    for (const expense of expenseRows) {
      const date = `${expense.anio}-${String(expense.mes).padStart(2, '0')}-01`
      const parent = rentRows.find(rent => Number(rent.id) === Number(expense.alquiler_id))
      const roommates = companions.filter(person => Number(person.alquiler_id) === Number(expense.alquiler_id)).map(person => ({ id: person.companero_id == null ? null : Number(person.companero_id), name: String(person.nombre), contribution: String(person.aportacion_alquiler) }))
      const selectedCompanions = expenseCompanions.filter(person => Number(person.gasto_id) === Number(expense.id)).map(person => ({ id: Number(person.id), name: String(person.nombre) }))
      entries.push({ id: Number(expense.id), date, category: String(expense.concepto), amount: String(expense.importe), shared: Boolean(expense.se_divide), start: expense.fecha ? String(expense.fecha).slice(0, 10) : '', end: expense.fecha_fin ? String(expense.fecha_fin).slice(0, 10) : '', status: parent?.estado === 'pagado' ? 'Pagado' : 'Pendiente', divider: Number(parent?.dividir_gastos_entre ?? 1), expenseDivider: Number(expense.dividir_entre ?? 1), companions: roommates, expenseCompanions: selectedCompanions })
    }
    const grouped: Record<string, Array<{ rowNumber: number; values: unknown[] }>> = {}
    for (const entry of entries) (grouped[entry.date.slice(0, 4)] ??= []).push({ rowNumber: entry.id, values: [entry.date, entry.category, entry.amount, entry.shared, entry.start, entry.end, entry.status, entry.divider ?? 1, JSON.stringify(entry.companions ?? []), entry.expenseDivider ?? 1, JSON.stringify(entry.expenseCompanions ?? [])] })
    for (const companion of companions) {
      const month = `${companion.anio}-${String(companion.mes).padStart(2, '0')}`
      grouped[month.slice(0, 4)] ??= []
    }
    return NextResponse.json({ years: years.map(y => ({ year: y, rows: grouped[y] ?? [] })) })
  } catch (error) { return responseError(error) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const body = await request.json() as { action?: string; year?: string; rowNumber?: number; values?: unknown[]; status?: string; divider?: number; expenseDivider?: number; companions?: { id: number; name: string; contribution: number }[]; expenseCompanionIds?: number[] }
    const v = body.values ?? []
    if (!/^\d{4}$/.test(body.year ?? '') || !['add', 'update', 'delete', 'status'].includes(body.action ?? '')) return NextResponse.json({ error: 'Solicitud no válida' }, { status: 400 })
    if (body.action === 'delete') {
      const rowNumber = Number(body.rowNumber)
      if (!Number.isInteger(rowNumber) || rowNumber === 0) return NextResponse.json({ error: 'Registro no válido' }, { status: 400 })
      if (rowNumber < 0) await sql`DELETE FROM alquiler WHERE id=${-rowNumber} RETURNING id`
      else await sql`DELETE FROM alquiler_gastos WHERE id=${rowNumber} RETURNING id`
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'status') {
      if (!['Pagado', 'Pendiente'].includes(body.status ?? '')) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
      const expense = body.rowNumber && body.rowNumber > 0 ? await sql`SELECT alquiler_id FROM alquiler_gastos WHERE id=${body.rowNumber}` : []
      const rentalId = expense.length ? expense[0].alquiler_id : Math.abs(body.rowNumber ?? 0)
      await sql`UPDATE alquiler SET estado=${body.status === 'Pagado' ? 'pagado' : 'pendiente'} WHERE id=${rentalId}`
      return NextResponse.json({ ok: true })
    }
    const [date, category, rawAmount, shared, start, end, status] = v
    const amount = Number(String(rawAmount).replace(',', '.'))
    if (!validDate(date) || !categories.includes(String(category)) || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Fecha, categoría o importe no válido' }, { status: 400 })
    const [y, m] = String(date).split('-').map(Number)
    let rentalId: number
    if (category === 'Alquiler') {
      const result = body.action === 'update'
        ? await sql`UPDATE alquiler SET importe_alquiler=${amount}, estado=${status === 'Pagado' ? 'pagado' : 'pendiente'}, dividir_gastos_entre=${Math.max(1, Math.floor(Number(body.divider) || 1))} WHERE id=${Math.abs(body.rowNumber ?? 0)} AND anio=${y} RETURNING id`
        : await sql`INSERT INTO alquiler (anio, mes, importe_alquiler, estado) VALUES (${y}, ${m}, ${amount}, ${status === 'Pagado' ? 'pagado' : 'pendiente'}) ON CONFLICT (anio, mes) DO UPDATE SET importe_alquiler=EXCLUDED.importe_alquiler, estado=EXCLUDED.estado RETURNING id`
      if (!result.length) return NextResponse.json({ error: 'No se encontró el alquiler' }, { status: 404 })
      rentalId = Number(result[0].id)
      if (body.action === 'add') await sql`UPDATE alquiler SET dividir_gastos_entre=${Math.max(1, Math.floor(Number(body.divider) || 1))} WHERE id=${rentalId}`
      await sql`DELETE FROM alquiler_companeros WHERE alquiler_id=${rentalId}`
      for (const roommate of body.companions ?? []) {
        const companionId = Number(roommate.id)
        const contribution = Number(roommate.contribution)
        if (Number.isInteger(companionId) && companionId > 0 && Number.isFinite(contribution) && contribution >= 0) await sql`INSERT INTO alquiler_companeros (alquiler_id, companero_id, nombre, aportacion_alquiler) SELECT ${rentalId}, id, nombre, ${contribution} FROM companeros WHERE id=${companionId} AND activo=TRUE`
      }
    } else {
      const base = await sql`INSERT INTO alquiler (anio, mes) VALUES (${y}, ${m}) ON CONFLICT (anio, mes) DO UPDATE SET mes=EXCLUDED.mes RETURNING id`
      rentalId = Number(base[0].id)
      const expenseDivider = Math.max(1, Math.floor(Number(body.expenseDivider) || 1))
      let expenseId: number
      if (body.action === 'update') {
        const updated = await sql`UPDATE alquiler_gastos SET concepto=${String(category)}, importe=${amount}, fecha=${start ? String(start) : null}, fecha_fin=${end ? String(end) : null}, se_divide=${Boolean(shared)}, dividir_entre=${expenseDivider} WHERE id=${body.rowNumber} AND alquiler_id=${rentalId} RETURNING id`
        if (!updated.length) return NextResponse.json({ error: 'No se encontró el gasto' }, { status: 404 })
        expenseId = Number(updated[0].id)
      } else {
        const created = await sql`INSERT INTO alquiler_gastos (alquiler_id, concepto, importe, fecha, fecha_fin, se_divide, dividir_entre) VALUES (${rentalId}, ${String(category)}, ${amount}, ${start ? String(start) : null}, ${end ? String(end) : null}, ${Boolean(shared)}, ${expenseDivider}) RETURNING id`
        expenseId = Number(created[0].id)
      }
      await sql`DELETE FROM alquiler_gasto_companeros WHERE gasto_id=${expenseId}`
      for (const companionId of [...new Set(body.expenseCompanionIds ?? [])]) {
        if (Number.isInteger(companionId) && companionId > 0) await sql`INSERT INTO alquiler_gasto_companeros (gasto_id, companero_id) SELECT ${expenseId}, id FROM companeros WHERE id=${companionId} AND activo=TRUE ON CONFLICT DO NOTHING`
      }
    }
    return NextResponse.json({ ok: true, rentalId })
  } catch (error) { return responseError(error) }
}


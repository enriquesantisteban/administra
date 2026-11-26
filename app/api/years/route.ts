import { NextResponse } from 'next/server'
import { sql } from '@/lib/neon'
import { getSignedInUser } from '@/lib/session'

export async function GET() {
  try {
    await getSignedInUser()
    const rows = await sql`SELECT DISTINCT anio FROM alquiler ORDER BY anio`
    const current = new Date().getFullYear()
    const years = [...new Set([...rows.map(row => Number(row.anio)), current])].sort((a,b) => a-b)
    return NextResponse.json({ years: years.map(year => String(year)) })
  } catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'No autorizado' : 'No se pudieron cargar los años de Neon' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 }) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const body = await request.json() as { action?: string; year?: string; templateYear?: string }
    if (body.action === 'create-year') return NextResponse.json({ year: String(new Date().getFullYear() + 1) })
    if (body.action !== 'delete-year' || !/^\d{4}$/.test(body.year ?? '')) return NextResponse.json({ error: 'Acción o año no válido' }, { status: 400 })
    await sql`DELETE FROM alquiler WHERE anio=${Number(body.year)}`
    return NextResponse.json({ year: body.year })
  } catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'No autorizado' : 'No se pudo actualizar el año' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 }) }
}

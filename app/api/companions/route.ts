import { NextResponse } from 'next/server'
import { sql } from '@/lib/neon'
import { getSignedInUser } from '@/lib/session'

function errorResponse(error: unknown) {
  const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
  return NextResponse.json({ error: unauthorized ? 'No autorizado' : 'No se pudo guardar la lista de compañeros' }, { status: unauthorized ? 401 : 500 })
}

export async function GET() {
  try {
    await getSignedInUser()
    const rows = await sql`SELECT id, nombre FROM companeros WHERE activo=TRUE ORDER BY nombre`
    return NextResponse.json({ companions: rows.map(row => ({ id: Number(row.id), name: String(row.nombre) })) })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    await getSignedInUser()
    const body = await request.json() as { action?: 'add' | 'update' | 'delete'; id?: number; name?: string }
    if (body.action === 'delete') {
      if (!Number.isInteger(body.id) || Number(body.id) < 1) return NextResponse.json({ error: 'Compañero no válido' }, { status: 400 })
      await sql`UPDATE companeros SET activo=FALSE WHERE id=${body.id}`
      return NextResponse.json({ ok: true })
    }
    const name = String(body.name ?? '').trim()
    if (!name || name.length > 80) return NextResponse.json({ error: 'Introduce un nombre de hasta 80 caracteres' }, { status: 400 })
    if (body.action === 'update') {
      if (!Number.isInteger(body.id) || Number(body.id) < 1) return NextResponse.json({ error: 'Compañero no válido' }, { status: 400 })
      const updated = await sql`UPDATE companeros SET nombre=${name} WHERE id=${body.id} AND activo=TRUE RETURNING id, nombre`
      if (!updated.length) return NextResponse.json({ error: 'No se encontró el compañero' }, { status: 404 })
      await sql`UPDATE alquiler_companeros SET nombre=${name} WHERE companero_id=${body.id}`
      return NextResponse.json({ companion: { id: Number(updated[0].id), name: String(updated[0].nombre) } })
    }
    if (body.action !== 'add') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    const created = await sql`INSERT INTO companeros (nombre) VALUES (${name}) RETURNING id, nombre`
    return NextResponse.json({ companion: { id: Number(created[0].id), name: String(created[0].nombre) } })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return NextResponse.json({ error: 'Ya existe un compañero con ese nombre' }, { status: 409 })
    return errorResponse(error)
  }
}

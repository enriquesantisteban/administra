import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx-js-style'
import { sql } from '@/lib/neon'
import { getSignedInUser } from '@/lib/session'

const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const amount = (value: unknown) => Number(value ?? 0)

export async function GET(request: Request) {
  try {
    await getSignedInUser()
    const params = new URL(request.url).searchParams
    const selected = params.get('year')
    const rentRows = await sql`SELECT * FROM alquiler ORDER BY anio, mes`
    const expenseRows = await sql`SELECT g.*, a.anio, a.mes FROM alquiler_gastos g JOIN alquiler a ON a.id=g.alquiler_id ORDER BY a.anio, a.mes, g.id`
    const companionRows = await sql`SELECT c.*, a.anio, a.mes FROM alquiler_companeros c JOIN alquiler a ON a.id=c.alquiler_id ORDER BY a.anio, a.mes, c.id`
    const expenseCompanionRows = await sql`SELECT gc.gasto_id, c.id AS companero_id FROM alquiler_gasto_companeros gc JOIN companeros c ON c.id=gc.companero_id`
    const yearsInData = [...new Set(rentRows.map(row => Number(row.anio)))].sort((a,b)=>a-b)
    const years = selected === 'all' ? [...new Set([...Array.from({length: Math.max(0, (yearsInData.at(-1) ?? new Date().getFullYear()) - 2016)}, (_,i)=>2017+i), ...yearsInData])] : [Number(selected)]
    if (years.some(y => !Number.isInteger(y) || y < 2017 || y > 9999)) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const book = XLSX.utils.book_new()
    for (const year of years) {
      const thisRent = rentRows.filter(row => Number(row.anio) === year)
      const thisExpenses = expenseRows.filter(row => Number(row.anio) === year)
      const thisCompanions = companionRows.filter(row => Number(row.anio) === year)
      const names = [...new Set(thisCompanions.map(row => String(row.nombre)))]
      const dynamic = year >= 2026 ? names.flatMap(name => [`CON ${name.toLocaleUpperCase('es')}`, `TOTAL ALQUILER CON ${name.toLocaleUpperCase('es')}`]) : []
      const headers = year < 2020
        ? ['MESES','ALQUILER','COMUNIDAD','LUZ','FECHA LUZ','AGUA','FECHA AGUA','BASURA','TOTAL ALQUILER','COMPRAS','TOTAL','ESTADO']
        : year < 2026
          ? ['MESES','ALQUILER','LUZ','FECHA LUZ','AGUA','FECHA AGUA','BASURA','TOTAL ALQUILER','COMPRAS','TOTAL','ESTADO']
          : ['MESES','ALQUILER','LUZ','FECHA LUZ','AGUA','FECHA AGUA','BASURA',...dynamic,'TOTAL ALQUILER','COMPRAS','A MEDIAS','TOTAL','ESTADO']
      const rows: unknown[][] = [headers]
      for (let month = 1; month <= 12; month++) {
        const rent = thisRent.find(row => Number(row.mes) === month)
        const monthExpenses = thisExpenses.filter(row => Number(row.mes) === month)
        const people = thisCompanions.filter(row => Number(row.mes) === month)
        const byCategory = (category: string) => monthExpenses.filter(row => String(row.concepto).toLocaleLowerCase('es') === category.toLocaleLowerCase('es')).reduce((sum,row)=>sum+amount(row.importe),0)
        const dateForCategory = (category: string) => {
          const date = monthExpenses.find(row => String(row.concepto).toLocaleLowerCase('es') === category.toLocaleLowerCase('es'))?.fecha
          if (!date) return ''
          const end = monthExpenses.find(row => String(row.concepto).toLocaleLowerCase('es') === category.toLocaleLowerCase('es'))?.fecha_fin
          const format = (value: unknown) => {
            if (!value) return ''
            const parts = String(value).slice(0, 10).split('-')
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ''
          }
          const from = format(date)
          const to = format(end)
          return from && to ? `${from} - ${to}` : from || to
        }
        const sharedTotal = monthExpenses.filter(row => row.se_divide && String(row.concepto).toLocaleLowerCase('es') !== 'compras').reduce((sum,row)=>sum+amount(row.importe)/Math.max(1, Number(row.dividir_entre ?? rent?.dividir_gastos_entre ?? 1)),0)
        const rentAmount = amount(rent?.importe_alquiler)
        const contribution = people.reduce((sum,row)=>sum+amount(row.aportacion_alquiler),0)
        const totalRent = rentAmount - contribution - sharedTotal
        const purchase = byCategory('Compras')
        const isHalf = monthExpenses.some(row => String(row.concepto).toLowerCase()==='compras' && row.se_divide)
        const total = totalRent + (isHalf ? purchase / 2 : purchase)
        const record: Record<string, unknown> = {
          MESES: months[month - 1], ALQUILER: rentAmount, COMUNIDAD: byCategory('Comunidad'), LUZ: byCategory('Luz'), 'FECHA LUZ': dateForCategory('Luz'), AGUA: byCategory('Agua'), 'FECHA AGUA': dateForCategory('Agua'), BASURA: byCategory('Basura'),
          'TOTAL ALQUILER': totalRent, COMPRAS: purchase, 'A MEDIAS': isHalf ? 'Sí' : 'No', TOTAL: total, ESTADO: rent?.estado === 'pagado' ? 'Pagado' : 'Pendiente',
        }
        for (const name of names) {
          const roommate = people.find(person => String(person.nombre) === name)
          record[`CON ${name.toLocaleUpperCase('es')}`] = roommate ? 'Sí' : 'No'
          const assignedGross = monthExpenses.filter(expense => expense.se_divide && expenseCompanionRows.some(item => Number(item.gasto_id) === Number(expense.id) && Number(item.companero_id) === Number(roommate?.companero_id))).reduce((sum, expense) => sum + amount(expense.importe), 0)
          record[`TOTAL ALQUILER CON ${name.toLocaleUpperCase('es')}`] = roommate ? rentAmount + assignedGross : 0
        }
        rows.push(headers.map(header => record[header] ?? ''))
      }
      const sheet = XLSX.utils.aoa_to_sheet([[year], headers, ...rows.slice(1)])
      sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
      sheet['!cols'] = headers.map(h => ({ wch: Math.max(13, Math.min(28, h.length + 2)) }))
      sheet['!autofilter'] = { ref: `A2:${XLSX.utils.encode_col(headers.length - 1)}14` }
      for (let c = 0; c < headers.length; c++) {
        const head = sheet[XLSX.utils.encode_cell({r:1,c})]
        if (head) head.s = { fill: { fgColor: { rgb: '355F9C' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin', color: { rgb: '1C3154' } } } }
        for (let r = 2; r <= 13; r++) {
          const cell = sheet[XLSX.utils.encode_cell({r,c})]
          if (!cell) continue
          cell.s = { fill: { fgColor: { rgb: r % 2 ? 'D9DEE8' : 'FFFFFF' } }, alignment: { horizontal: 'center' } }
          if (typeof cell.v === 'number' && /ALQUILER|LUZ|AGUA|BASURA|COMUNIDAD|COMPRAS|TOTAL/.test(headers[c])) cell.z = '€ #,##0.00'
        }
      }
      const title = sheet['A1']
      if (title) title.s = { font: { bold: true, sz: 16, color: { rgb: '254468' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: 'E7E7E7' } }, border: { top: { style: 'medium', color: { rgb: 'C85C20' } }, bottom: { style: 'medium', color: { rgb: 'C85C20' } } } }
      XLSX.utils.book_append_sheet(book, sheet, String(year))
    }
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
    return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="alquiler-${selected === 'all' ? 'historico' : selected}.xlsx"` } })
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
    return NextResponse.json({ error: unauthorized ? 'No autorizado' : 'No se pudo generar el Excel' }, { status: unauthorized ? 401 : 500 })
  }
}

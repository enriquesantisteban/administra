'use client'

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RentalYear } from '@/components/dashboard'

const COLORS = ['#284d3b', '#97b59d', '#d8a46d', '#8d9da2', '#d9cdb8', '#c4d6ca']
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const euro = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function amount(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const normalized = value.trim().replace(/[€\\s]/g, '')
  return Number(normalized.includes(',') ? normalized.replace(/\\./g, '').replace(',', '.') : normalized.replace(/,/g, '')) || 0
}

function isEnabled(value: unknown) {
  if (typeof value === 'boolean') return value
  return ['si', 'sí', 'true', 'yes', '1'].includes(String(value ?? '').trim().toLocaleLowerCase('es'))
}

function columnIndex(headers: string[], matcher: RegExp) {
  return headers.findIndex((header) => matcher.test(header.trim().toUpperCase()))
}

function monthIndex(value: unknown, fallback: number) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\.$/, '')
  const found = MONTHS.findIndex((month) => normalized.startsWith(month.toLowerCase()))
  return found >= 0 ? found : fallback % 12
}

export function RentalCharts({ years }: { years: RentalYear[] }) {
  const monthly = MONTHS.map((month, index) => {
    const point: Record<string, string | number> = { month }
    years.forEach((year) => {
      const totalIndex = columnIndex(year.headers, /^TOTAL$/)
      const monthCol = columnIndex(year.headers, /^MESES?$/)
      let sum = 0
      year.rows.forEach((row, rowIndex) => {
        if (monthIndex(row.values[monthCol] ?? '', rowIndex) === index) sum += amount(row.values[totalIndex])
      })
      point[year.year] = sum
    })
    return point
  })

  const annual = years.map((year) => {
    const totalIndex = columnIndex(year.headers, /^TOTAL$/)
    return { year: year.year, total: year.rows.reduce((sum, row) => sum + amount(row.values[totalIndex]), 0) }
  })

  const categories = ['Alquiler', 'Luz', 'Agua', 'Basura', 'Compras']
  const categoryData = years.map((year) => {
    const rentIndex = columnIndex(year.headers, /^ALQUILER$/)
    const lightIndex = columnIndex(year.headers, /^LUZ$/)
    const waterIndex = columnIndex(year.headers, /^AGUA$/)
    const wasteIndex = columnIndex(year.headers, /^BASURA$/)
    const purchasesIndex = columnIndex(year.headers, /^COMPRAS$/)
    const sharedIndex = columnIndex(year.headers, /^A MEDIAS$/)
    return {
      year: year.year,
      Alquiler: year.rows.reduce((sum, row) => sum + amount(row.values[rentIndex]), 0),
      Luz: year.rows.reduce((sum, row) => sum + amount(row.values[lightIndex]), 0),
      Agua: year.rows.reduce((sum, row) => sum + amount(row.values[waterIndex]), 0),
      Basura: year.rows.reduce((sum, row) => sum + amount(row.values[wasteIndex]), 0),
      Compras: year.rows.reduce((sum, row) => {
        const purchases = amount(row.values[purchasesIndex])
        return sum + (isEnabled(row.values[sharedIndex]) ? purchases / 2 : purchases)
      }, 0),
    }
  })

  return (
    <section className="charts-grid" aria-label="Gráficas de gastos">
      <article className="panel chart-panel chart-monthly">
        <div className="panel-heading"><div><span className="eyebrow">TENDENCIA MENSUAL</span><h3>Gasto total por mes</h3></div><span className="chart-caption">Comparativa por año</span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}><CartesianGrid stroke="#e8ebe5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 11 }} tickFormatter={(value) => `${value}€`} width={46} /><Tooltip formatter={(value) => euro(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1', boxShadow: '0 12px 28px #15231912' }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />{years.map((year, index) => <Line key={year.year} type="monotone" dataKey={year.year} stroke={COLORS[index % COLORS.length]} strokeWidth={2.5} dot={{ r: 3, fill: COLORS[index % COLORS.length], strokeWidth: 0 }} activeDot={{ r: 5 }} />)}</LineChart></ResponsiveContainer></div>
      </article>
      <article className="panel chart-panel chart-breakdown">
        <div className="panel-heading"><div><span className="eyebrow">COMPARATIVA ANUAL</span><h3>Gasto por concepto</h3></div><span className="chart-caption">Euros · apilado</span></div>
        <div className="chart-area chart-area-short"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}><CartesianGrid stroke="#e8ebe5" vertical={false} /><XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#777d75', fontSize: 10 }} dy={7} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 9 }} tickFormatter={(value) => `${value}€`} width={42} /><Tooltip formatter={(value) => euro(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1' }} /><Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9, paddingTop: 9 }} />{categories.map((category, index) => <Bar key={category} dataKey={category} stackId="expenses" fill={COLORS[index]} radius={index === categories.length - 1 ? [4, 4, 0, 0] : undefined} />)}</BarChart></ResponsiveContainer></div>
      </article>
      <article className="panel chart-panel chart-annual">
        <div className="panel-heading"><div><span className="eyebrow">VISTA DE CONJUNTO</span><h3>Gasto total anual</h3></div><span className="chart-caption">Todos los años</span></div>
        <div className="chart-area chart-area-short"><ResponsiveContainer width="100%" height="100%"><BarChart data={annual} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="#e8ebe5" vertical={false} /><XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#777d75', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 11 }} tickFormatter={(value) => `${value}€`} width={52} /><Tooltip formatter={(value) => euro(Number(value))} cursor={{ fill: '#f4f6f1' }} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1' }} /><Bar dataKey="total" name="Gasto total" fill="#355a46" radius={[6, 6, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div>
      </article>
    </section>
  )
}

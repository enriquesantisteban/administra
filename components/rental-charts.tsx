'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RentalYear } from '@/components/dashboard'

const COLORS = ['#284d3b', '#97b59d', '#d8a46d', '#8d9da2', '#d9cdb8', '#c4d6ca']
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CATEGORIES = [
  { name: 'Alquiler', header: /^ALQUILER$/ },
  { name: 'Comunidad', header: /^COMUNIDAD$/ },
  { name: 'Luz', header: /^LUZ$/ },
  { name: 'Agua', header: /^AGUA$/ },
  { name: 'Basura', header: /^BASURA$/ },
  { name: 'Compras', header: /^COMPRAS$/ },
]
const euro = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function amount(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const normalized = value.trim().replace(/[€\s]/g, '')
  return Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '')) || 0
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

export function RentalCharts({ years, selectedYear }: { years: RentalYear[]; selectedYear: RentalYear }) {
  const totalIndex = columnIndex(selectedYear.headers, /^TOTAL$/)
  const monthColumnIndex = columnIndex(selectedYear.headers, /^MESES?$/)
  const monthly = MONTHS.map((month, index) => ({
    month,
    total: selectedYear.rows.reduce((sum, row, rowIndex) => (
      monthIndex(row.values[monthColumnIndex] ?? '', rowIndex) === index
        ? sum + amount(row.values[totalIndex])
        : sum
    ), 0),
  }))

  const annual = [...years]
    .filter((year) => year.rows.length > 0)
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((year) => {
      const yearTotalIndex = columnIndex(year.headers, /^TOTAL$/)
      return { year: year.year, total: year.rows.reduce((sum, row) => sum + amount(row.values[yearTotalIndex]), 0) }
    })

  const sharedIndex = columnIndex(selectedYear.headers, /^A MEDIAS$/)
  const categoryData = CATEGORIES.map(({ name, header }) => {
    const index = columnIndex(selectedYear.headers, header)
    const total = selectedYear.rows.reduce((sum, row) => {
      const value = amount(row.values[index])
      return sum + (name === 'Compras' && isEnabled(row.values[sharedIndex]) ? value / 2 : value)
    }, 0)
    return { concept: name, amount: total }
  })

  const hasSelectedRows = selectedYear.rows.length > 0

  return (
    <section className="charts-grid" aria-label="Gráficas de gastos">
      <article className="panel chart-panel chart-monthly">
        <div className="panel-heading">
          <div><span className="eyebrow">TENDENCIA MENSUAL</span><h3>Gasto total por mes</h3></div>
          <span className="chart-caption">{selectedYear.year}</span>
        </div>
        <div className="chart-area">
          {hasSelectedRows ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e8ebe5" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 10 }} dy={7} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 10 }} tickFormatter={(value) => `${value}€`} width={48} />
                <Tooltip formatter={(value) => euro(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1', boxShadow: '0 12px 28px #15231912' }} />
                <Bar dataKey="total" name="Gasto total" fill="#355a46" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="chart-empty chart-area-empty">Añade registros para ver el gasto mensual.</div>}
        </div>
      </article>
      <article className="panel chart-panel chart-breakdown">
        <div className="panel-heading">
          <div><span className="eyebrow">DESGLOSE DEL AÑO</span><h3>Gasto por concepto</h3></div>
          <span className="chart-caption">{selectedYear.year}</span>
        </div>
        <div className="chart-area chart-area-short">
          {hasSelectedRows ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e8ebe5" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 9 }} tickFormatter={(value) => `${value}€`} />
                <YAxis type="category" dataKey="concept" axisLine={false} tickLine={false} tick={{ fill: '#737a72', fontSize: 10 }} width={74} />
                <Tooltip formatter={(value) => euro(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1' }} />
                <Bar dataKey="amount" name="Gasto" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {categoryData.map((item, index) => <Cell key={item.concept} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="chart-empty chart-area-empty">Añade registros para ver el desglose.</div>}
        </div>
      </article>
      <article className="panel chart-panel chart-annual">
        <div className="panel-heading"><div><span className="eyebrow">VISTA DE CONJUNTO</span><h3>Gasto total anual</h3></div><span className="chart-caption">Todos los años</span></div>
        <div className="chart-area chart-area-short">
          {annual.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annual} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e8ebe5" vertical={false} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#777d75', fontSize: 10 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#82877f', fontSize: 10 }} tickFormatter={(value) => `${value}€`} width={52} />
                <Tooltip formatter={(value) => euro(Number(value))} cursor={{ fill: '#f4f6f1' }} contentStyle={{ borderRadius: 12, border: '1px solid #e5e8e1' }} />
                <Bar dataKey="total" name="Gasto total" fill="#355a46" radius={[5, 5, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="chart-empty chart-area-empty">Todavía no hay gastos registrados.</div>}
        </div>
      </article>
    </section>
  )
}

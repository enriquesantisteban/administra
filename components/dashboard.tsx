'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { authClient } from '@/lib/auth-client'
import { ArrowDownRight, ArrowRight, Check, ChevronDown, CircleHelp, Cloud, FileSpreadsheet, House, LayoutDashboard, LoaderCircle, LogOut, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, TrendingUp, Wallet, X } from 'lucide-react'
import { RentalCharts } from '@/components/rental-charts'

export type RentalRow = { rowNumber: number; values: unknown[] }
export type RentalYear = { year: string; title: string; sheetId: number; headers: string[]; rows: RentalRow[] }
type Data = { file: { id: string; name: string; url: string | null } | null; years: RentalYear[]; error?: string }
type Props = { user: { name: string; email: string } }
const fetcher = async (url: string): Promise<Data> => {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'No se han podido cargar los datos')
  return data
}
const euro = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value)

function numberValue(value: unknown) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '').trim().replace(/[€\\s]/g, '')
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\\./g, '').replace(',', '.')
    : normalized.replace(/,/g, '')
  return Number(decimalValue) || 0
}
function indexOf(headers: string[], expression: RegExp) { return headers.findIndex((header) => expression.test(header.trim().toUpperCase())) }
function dateText(value: unknown) {
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
function asInput(value: unknown, header: string) {
  if (/^(CON ÁNGEL|A MEDIAS)$/i.test(header.trim()) || typeof value === 'boolean') return Boolean(value)
  if (/FECHA/i.test(header) && typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return date.toISOString().slice(0, 10)
  }
  if (/FECHA/i.test(header) && value) {
    const date = new Date(String(value))
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10)
  }
  return value == null ? '' : String(value)
}
function amountText(value: unknown) { return value === '' || value == null ? '—' : euro(numberValue(value)) }

function RentalEditor({ year, headers, initialRow, onClose, onSave }: { year: string; headers: string[]; initialRow: RentalRow | null; onClose: () => void; onSave: (values: unknown[]) => Promise<void> }) {
  const [values, setValues] = useState<(string | boolean)[]>(() => headers.map((header, index) => asInput(initialRow?.values[index] ?? '', header)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  function update(index: number, value: string | boolean) { setValues((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)) }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const normalized = values.map((value, index) => {
      const header = headers[index]
      if (typeof value === 'boolean' || /^(CON ÁNGEL|A MEDIAS)$/i.test(header.trim())) return Boolean(value)
      if (/FECHA/i.test(header)) return value || ''
      if (/^(MESES?)$/i.test(header)) return value
      if (value === '') return ''
      return numberValue(value)
    })
    try { await onSave(normalized) } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se han podido guardar los cambios'); setSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="modal-heading"><div><span className="eyebrow">ALQUILER · {year}</span><h2 id="editor-title">{initialRow ? 'Editar registro' : 'Añadir registro'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div><form onSubmit={submit}><div className="form-grid">{headers.map((header, index) => {
    const isBoolean = /^(CON ÁNGEL|A MEDIAS)$/i.test(header.trim()) || typeof initialRow?.values[index] === 'boolean'
    const isDate = /FECHA/i.test(header)
    return <label className={`field-label ${isBoolean ? 'field-check' : ''}`} key={header}>{isBoolean ? <><input type="checkbox" checked={Boolean(values[index])} onChange={(event) => update(index, event.target.checked)} /><span>{header}</span></> : <>{header}{isDate ? <input type="date" value={String(values[index])} onChange={(event) => update(index, event.target.value)} /> : <input inputMode={/MESES?/i.test(header) ? 'text' : 'decimal'} value={String(values[index])} onChange={(event) => update(index, event.target.value)} placeholder={/MESES?/i.test(header) ? 'Enero' : '0,00'} />}</>}</label>
  })}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button-quiet" onClick={onClose}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}<Check size={16} /></button></div></form></section></div>
}

export function Dashboard({ user }: Props) {
  const { data, error, isLoading, mutate } = useSWR<Data>('/api/sheets', fetcher, { revalidateOnFocus: false, shouldRetryOnError: false })
  const [activeYear, setActiveYear] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<RentalRow | null | undefined>(undefined)
  const [toast, setToast] = useState('')
  const years = useMemo(() => [...(data?.years ?? [])].sort((a, b) => b.year.localeCompare(a.year)), [data?.years])
  const selectedYear = years.find((item) => item.year === activeYear) ?? years[0]
  const visibleRows = useMemo(() => (selectedYear?.rows ?? []).filter((row) => !search || row.values.some((value) => String(value).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))), [search, selectedYear])
  const annualTotal = years.reduce((grand, year) => grand + year.rows.reduce((sum, row) => sum + numberValue(row.values[indexOf(year.headers, /^TOTAL$/)]), 0), 0)
  const monthCount = selectedYear?.rows.length ?? 0
  const selectedTotal = selectedYear ? selectedYear.rows.reduce((sum, row) => sum + numberValue(row.values[indexOf(selectedYear.headers, /^TOTAL$/)]), 0) : 0
  const average = monthCount ? selectedTotal / monthCount : 0
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F'

  async function save(values: unknown[]) {
    if (!selectedYear) throw new Error('Selecciona un año antes de guardar')
    const action = editor === null ? 'add' : 'update'
    const response = await fetch(`/api/sheets/${selectedYear.year}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, rowNumber: editor?.rowNumber, values }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el registro')
    await mutate()
    setEditor(undefined)
    setToast(action === 'add' ? 'Registro añadido a Google Sheets' : 'Cambios guardados en Google Sheets')
    window.setTimeout(() => setToast(''), 3200)
  }

  async function deleteRow(row: RentalRow) {
    if (!selectedYear || !window.confirm('¿Eliminar este registro de Google Sheets? Esta acción no se puede deshacer.')) return
    const response = await fetch(`/api/sheets/${selectedYear.year}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', rowNumber: row.rowNumber }) })
    const result = await response.json()
    if (!response.ok) { setToast(result.error ?? 'No se pudo eliminar el registro'); return }
    await mutate()
    setToast('Registro eliminado')
    window.setTimeout(() => setToast(''), 3200)
  }

  const monthIndex = selectedYear ? indexOf(selectedYear.headers, /^MESES?$/) : -1

  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><span className="brand-mark">A</span><span>Administra<span className="brand-dot">.</span></span></div><div className="workspace-label">ESPACIO PERSONAL</div><nav className="side-nav" aria-label="Navegación principal"><a className="side-link active" href="#resumen"><LayoutDashboard size={17} />Resumen</a><a className="side-link" href="#registros"><FileSpreadsheet size={17} />Registros<span className="nav-count">{selectedYear?.rows.length ?? '—'}</span></a><a className="side-link" href="#graficas"><TrendingUp size={17} />Analítica</a></nav><div className="sidebar-year"><div className="year-label">AÑO VISIBLE</div><label className="year-select-wrap"><span className="sr-only">Selecciona el año</span><select value={selectedYear?.year ?? ''} onChange={(event) => setActiveYear(event.target.value)} disabled={!years.length}><option value="" disabled>Elegir año</option>{years.map((year) => <option key={year.year} value={year.year}>{year.year}</option>)}</select><ChevronDown size={15} /></label></div><div className="sidebar-bottom"><a href="https://drive.google.com" target="_blank" rel="noreferrer" className="storage-card"><span className="storage-icon"><Cloud size={17} /></span><span><strong>Google Sheets</strong><small>Tu fuente de datos</small></span><ArrowRight size={14} /></a><div className="sidebar-user"><div className="avatar">{initials}</div><div className="user-label"><strong>{user.name}</strong><small>Cuenta personal</small></div><button className="signout-button" aria-label="Cerrar sesión" onClick={() => authClient.signOut().then(() => { window.location.href = '/sign-in' })}><LogOut size={16} /></button></div><div className="sidebar-footnote">MENOS RUIDO. MÁS CLARIDAD.</div></div></aside>
    <div className="main-column"><header className="topbar"><div className="breadcrumb"><span>Tu espacio</span><span className="crumb-slash">/</span><strong>Resumen</strong></div><div className="topbar-actions"><span className={`sync-status ${data?.file ? 'is-connected' : ''}`}><span className="status-dot" />{isLoading ? 'Conectando…' : data?.file ? 'Google conectado' : 'Google sin conectar'}</span><button className="top-icon" aria-label="Configuración" title="Configuración"><Settings2 size={18} /></button><div className="avatar avatar-small">{initials}</div></div></header>
      <div className="dashboard-content"><section className="welcome-row" id="resumen"><div><span className="eyebrow">MIÉRCOLES, {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</span><h1>Buenas, {user.name.split(' ')[0]}<span className="title-period">.</span></h1><p>Todo lo que pasa con tu alquiler, en un solo lugar.</p></div><div className="welcome-actions">{data?.file?.url && <a className="button-quiet sheet-link" href={data.file.url} target="_blank" rel="noreferrer"><FileSpreadsheet size={16} />Abrir hoja</a>}<button className="button-primary" onClick={() => setEditor(null)} disabled={!selectedYear}><Plus size={17} />Añadir registro</button></div></section>
      {error ? <section className="connect-banner error-banner"><div className="connect-art"><CircleHelp size={24} /></div><div className="connect-copy"><span className="eyebrow">CONEXIÓN INTERRUMPIDA</span><h2>No se han podido cargar los datos</h2><p>{error.message}</p></div><button className="button-quiet" onClick={() => mutate()}><RefreshCw size={16} />Reintentar</button></section> : !isLoading && data && !data.file ? <section className="connect-banner"><div className="connect-art"><Search size={24} /></div><div className="connect-copy"><span className="eyebrow">NO ENCONTRAMOS LA HOJA</span><h2>Revisa la configuración de Google Sheets</h2><p>Comprueba que GOOGLE_SHEET_ID es correcto y que compartiste la hoja con GOOGLE_SERVICE_ACCOUNT_EMAIL con permiso de editor.</p></div><button className="button-quiet" onClick={() => mutate()}><RefreshCw size={16} />Volver a buscar</button></section> : null}
      <section className="stats-grid" aria-label="Resumen de gastos"><article className="stat-card stat-featured"><div className="stat-top"><span>GASTO ACUMULADO</span><span className="stat-icon"><Wallet size={17} /></span></div><strong className="stat-value">{isLoading ? '—' : euro(annualTotal)}</strong><div className="stat-foot"><span className="stat-year-chip">{years.length} {years.length === 1 ? 'año' : 'años'} de histórico</span><span className="stat-foot-label">en total</span></div><div className="stat-watermark">€</div></article><article className="stat-card"><div className="stat-top"><span>GASTO EN {selectedYear?.year ?? '—'}</span><span className="stat-icon stat-icon-muted"><House size={17} /></span></div><strong className="stat-value">{isLoading ? '—' : euro(selectedTotal)}</strong><div className="stat-foot"><span className="stat-indicator"><ArrowDownRight size={13} />{monthCount} registros</span><span className="stat-foot-label">este año</span></div></article><article className="stat-card"><div className="stat-top"><span>PROMEDIO MENSUAL</span><span className="stat-icon stat-icon-muted"><TrendingUp size={17} /></span></div><strong className="stat-value">{isLoading ? '—' : euro(average)}</strong><div className="stat-foot"><span className="stat-foot-label">basado en los registros de</span><span className="stat-year-chip">{selectedYear?.year ?? '—'}</span></div></article></section>
      <div id="graficas">{years.length > 0 && <RentalCharts years={years} />}</div>
      <section className="panel records-panel" id="registros"><div className="records-heading"><div><span className="eyebrow">TU HISTÓRICO</span><h2>Registros de alquiler</h2></div><div className="records-tools"><label className="search-box"><Search size={16} /><span className="sr-only">Buscar registros</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" /></label><button className="year-pill" onClick={() => setActiveYear(selectedYear?.year ?? '')}>{selectedYear?.year ?? 'Año'}<ChevronDown size={14} /></button><button className="button-primary button-add-small" onClick={() => setEditor(null)} disabled={!selectedYear}><Plus size={16} /><span>Nuevo</span></button></div></div><div className="table-container">{isLoading ? <div className="table-state"><LoaderCircle className="spin" size={20} />Cargando tus registros…</div> : !selectedYear ? <div className="table-state">Conecta Google Sheets para ver el histórico de alquileres.</div> : visibleRows.length === 0 ? <div className="table-state">{search ? 'No encontramos registros con esa búsqueda.' : 'Todavía no hay registros en esta hoja.'}</div> : <table><thead><tr>{selectedYear.headers.map((header) => <th key={header}>{header}</th>)}<th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{visibleRows.map((row) => <tr key={`${selectedYear.year}-${row.rowNumber}`}>{selectedYear.headers.map((header, index) => { const value = row.values[index]; const isMonth = /^MESES?$/i.test(header.trim()); const isDate = /^FECHA/i.test(header.trim()); const isMoney = /^(ALQUILER|LUZ|AGUA|BASURA|TOTAL|COMPRAS)/i.test(header.trim()); return <td key={`${header}-${index}`}>{isMonth ? <><span className="month-cell">{String(value || 'Sin mes')}</span><span className="row-year">{selectedYear.year}</span></> : typeof value === 'boolean' ? <span className={`boolean-chip ${value ? 'boolean-yes' : ''}`}>{value ? 'Sí' : 'No'}</span> : isDate ? dateText(value) : isMoney ? <span className={/^TOTAL$/i.test(header.trim()) ? 'total-cell' : undefined}>{amountText(value)}</span> : String(value ?? '—')}</td> })}<td><div className="row-actions"><button aria-label={`Editar ${row.values[monthIndex] ?? 'registro'}`} onClick={() => setEditor(row)}><Settings2 size={15} /></button><button aria-label={`Eliminar ${row.values[monthIndex] ?? 'registro'}`} onClick={() => deleteRow(row)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>}</div><div className="table-footer"><span>{visibleRows.length} {visibleRows.length === 1 ? 'registro' : 'registros'}{search ? ' encontrados' : ` · ${selectedYear?.year ?? ''}`}</span><span className="footer-sheet"><span className="status-dot" />Sincronizado con Google Sheets <button onClick={() => mutate()} aria-label="Actualizar datos"><RefreshCw size={13} /></button></span></div></section>
      <footer className="dashboard-footer"><span>ADMINISTRA <i>·</i> TU CASA EN ORDEN</span><span><ShieldCheck size={14} /> Tus datos permanecen en tu cuenta de Google</span></footer></div></div>
    {editor !== undefined && selectedYear && <RentalEditor year={selectedYear.year} headers={selectedYear.headers} initialRow={editor} onClose={() => setEditor(undefined)} onSave={save} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}<button onClick={() => setToast('')} aria-label="Cerrar notificación"><X size={15} /></button></div>}
  </main>
}

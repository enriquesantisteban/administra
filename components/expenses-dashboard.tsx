'use client'

import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { authClient } from '@/lib/auth-client'
import { Check, Home, Lightbulb, Plus, Trash2, Pencil, LogOut, LayoutDashboard, ShoppingBag, Droplets, Wifi, ChevronDown, Download, Menu, UsersRound, X } from 'lucide-react'

type Expense = { rowNumber: number; values: unknown[]; legacy?: boolean }
type YearData = { year: string; sheetId: number; rows: Expense[] }
type Payload = { years: YearData[]; error?: string }
type RoommateForm = { id: string; name: string; contribution: string }
type Companion = { id: number; name: string }
type ExpenseCompanion = Companion & { contribution?: string }
type FormData = { date: string; category: string; amount: string; shared: boolean; start: string; end: string; status: string; divider: string; expenseDivider: string; expenseCompanionIds: string[]; expenseCompanionContributions: Record<string, string> }
const categories = ['Alquiler', 'Comunidad', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras']
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const colors = ['#294d3b','#b9a98c','#789b7d','#d4a36b','#617a93','#87a4a0','#72809a']
const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const parseAmount = (s: string) => Number(s.trim().includes(',') ? s.trim().replace(/\./g, '').replace(',', '.') : s.trim())
const fetcher = async <T,>(url: string): Promise<T> => { const r = await fetch(url, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as T }
const cents = (x: unknown) => { if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 100) : 0; const s = String(x ?? '0').trim().replace(/[€\s]/g, ''); const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; const n = Number(normalized); return Number.isFinite(n) ? Math.round(n * 100) : 0 }
const monthsIdx = (date: unknown) => { const d = String(date ?? ''); const m = /^\d{4}-(\d\d)/.exec(d); return m ? Number(m[1]) - 1 : -1 }
const defaultForm = (): FormData => ({ date: '', category: 'Alquiler', amount: '', shared: false, start: '', end: '', status: 'Pendiente', divider: '1', expenseDivider: '1', expenseCompanionIds: [], expenseCompanionContributions: {} })
function getInitialPeriod() {
  const now = new Date()
  const startsNextMonth = now.getDate() >= 21
  const period = new Date(now.getFullYear(), now.getMonth() + (startsNextMonth ? 1 : 0), 1)
  return { year: String(period.getFullYear()), month: String(period.getMonth()) }
}
function split(row: Expense) { const v = row.values; let roommates: RoommateForm[] = []; let expenseCompanions: ExpenseCompanion[] = []; try { roommates = (JSON.parse(String(v[8] ?? '[]')) as Array<{id:number|null;name:string;contribution:string}>).map(item=>({id:String(item.id ?? ''),name:item.name,contribution:item.contribution})) } catch {} try { expenseCompanions = JSON.parse(String(v[10] ?? '[]')) } catch {} return { date: String(v[0] ?? ''), category: String(v[1] ?? ''), cents: cents(v[2]), shared: isShared(v[3]), start: String(v[4] ?? ''), end: String(v[5] ?? ''), status: String(v[6] ?? 'Pendiente'), divider: Math.max(1, Number(v[9] ?? v[7]) || 1), contributionCents: roommates.reduce((sum, item) => sum + cents(item.contribution), 0), roommates, expenseCompanions } }
function isShared(value: unknown) { if (typeof value === 'boolean') return value; if (typeof value === 'number') return value === 1; const normalized = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); return ['SI','TRUE','YES','1','VERDADERO'].includes(normalized) }
const displayCents = (row: Expense) => split(row).cents
function companionParts(row: Expense) {
  const entry = split(row)
  if (entry.category === 'Alquiler') return entry.roommates.map(person => ({ id: person.id, name: person.name, cents: cents(person.contribution) }))
  if (entry.category === 'Internet') return entry.expenseCompanions.map(person => ({ id: String(person.id), name: person.name, cents: cents(person.contribution) }))
  if (!['Luz','Agua'].includes(entry.category) || !entry.shared || !entry.expenseCompanions.length) return []
  const sharePerCompanion = Math.floor(entry.cents / entry.divider)
  return entry.expenseCompanions.map(person => ({ id: String(person.id), name: person.name, cents: sharePerCompanion }))
}
function angelAndMine(row: Expense) { const e = split(row); if (e.category === 'Alquiler') return { angel: e.contributionCents, mine: e.cents - e.contributionCents }; if (e.category === 'Internet') { const assigned = e.expenseCompanions.reduce((sum, person) => sum + cents(person.contribution), 0); return { angel: assigned, mine: Math.max(0, e.cents - assigned) } } if (['Luz','Agua'].includes(e.category) && e.shared) { const mine = Math.max(0, e.cents - Math.floor(e.cents / e.divider) * e.expenseCompanions.length); return { angel: e.cents - mine, mine } } if (['Comunidad','Basura'].includes(e.category) && e.shared) { const mine = Math.round(e.cents / e.divider); return { angel: e.cents - mine, mine } } if (e.category === 'Compras' && e.shared) { const mine = Math.round(e.cents / 2); return { angel: e.cents - mine, mine } } return { angel: 0, mine: e.cents } }
function rowBreakdown(row: Expense) {
  const entry = split(row)
  const mine = entry.category === 'Alquiler' ? entry.cents - entry.contributionCents : angelAndMine(row).mine
  const parts = [`Tu parte ${money(mine / 100)}`, ...companionParts(row).map(person => `${person.name} ${money(person.cents / 100)}`)]
  return parts.join(' · ')
}
function expenseForm(row: Expense | null, year: string, month: string): FormData { if (!row) return { ...defaultForm(), date: month === 'all' ? '' : `${year}-${String(Number(month) + 1).padStart(2, '0')}-01` }; const e = split(row); const selected = e.category === 'Alquiler' ? e.roommates.filter(item=>item.id).map(item=>item.id) : e.expenseCompanions.map(item=>String(item.id)); const contributions = e.category === 'Alquiler' ? e.roommates.map(item=>[item.id,(cents(item.contribution)/100).toFixed(2)] as const) : e.expenseCompanions.map(item=>[String(item.id),(cents(item.contribution ?? 0)/100).toFixed(2)] as const); return { date: e.date, category: e.category, amount: (e.cents / 100).toFixed(2).replace('.', ','), shared: e.shared, start: e.start, end: e.end, status: e.status, divider: String(row.values[7] ?? 1), expenseDivider: String(row.values[9] ?? row.values[7] ?? 1), expenseCompanionIds: selected, expenseCompanionContributions: Object.fromEntries(contributions) } }

export function ExpensesDashboard({ user }: { user: { name: string; email: string } }) {
  const [initialPeriod] = useState(getInitialPeriod)
  const [year, setYear] = useState(initialPeriod.year)
  const { data, error, isLoading, mutate } = useSWR<Payload>(`/api/expenses?year=${year}`, fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60_000, refreshInterval: 0, shouldRetryOnError: true, errorRetryCount: 3, errorRetryInterval: 15_000 })
  const { data: companionData, mutate: mutateCompanions } = useSWR<{ companions: Companion[] }>('/api/companions', fetcher)
  const [month, setMonth] = useState(initialPeriod.month)
  const [tab, setTab] = useState<'home'|'expenses'>('home')
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)
  const [form, setForm] = useState<FormData>(defaultForm())
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showYearCreator, setShowYearCreator] = useState(false)
  const [creatingYear, setCreatingYear] = useState(false)
  const [showCompanions, setShowCompanions] = useState(false)
  const [companionDraft, setCompanionDraft] = useState('')
  const [editingCompanionId, setEditingCompanionId] = useState<number | null>(null)
  const [savingCompanion, setSavingCompanion] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const companions = companionData?.companions ?? []
  const yearOptions = [...new Set([...Array.from({ length: Math.max(1, new Date().getFullYear() + 2 - 2017) }, (_, i) => String(2017 + i)), ...(data?.years.map(y=>y.year) ?? [])])].sort()
  const allRows = data?.years.find(y => y.year === year)?.rows ?? []
  const rows = useMemo(() => allRows.filter(r => { const e = split(r); return e.date.startsWith(year) && (month === 'all' || monthsIdx(e.date) === Number(month)) }), [allRows, year, month])
  const totals = rows.reduce((acc, row) => { const part = angelAndMine(row); acc.angel += part.angel; acc.mine += part.mine; return acc }, { angel: 0, mine: 0 })
  const internetCents = rows.filter(row => split(row).category === 'Internet').reduce((sum, row) => sum + angelAndMine(row).mine, 0)
  const purchasesCents = rows.filter(row => split(row).category === 'Compras').reduce((sum, row) => sum + split(row).cents, 0)
  const due = rows.filter(row => !['Compras', 'Internet'].includes(split(row).category)).reduce((sum, row) => sum + split(row).cents, 0)
  const categoryData = categories.map(category => ({ name: category, amount: (category === 'Internet' ? internetCents : rows.filter(r => split(r).category === category).reduce((s,r) => s + angelAndMine(r).mine, 0)) / 100 })).filter(x => x.amount !== 0)
  const monthly = months.map((m,i) => { const monthRows = allRows.filter(r => monthsIdx(split(r).date) === i); return { month: m.slice(0,3), amount: monthRows.reduce((s,r) => s + angelAndMine(r).mine, 0) / 100 } })
  const groups = categories.map(category => ({ category, rows: rows.filter(r => split(r).category === category) })).filter(g => g.rows.length)
  const companionTotals = new Map<string, number>()
  for (const row of rows) for (const part of companionParts(row)) companionTotals.set(part.id, (companionTotals.get(part.id) ?? 0) + part.cents)
  const companionsWithExpenses = companions.filter(companion => (companionTotals.get(String(companion.id)) ?? 0) > 0)
  const rentalPreview = (() => {
    if (!form.date || !form.amount || !['Alquiler', 'Luz', 'Agua'].includes(form.category)) return null
    if (form.category === 'Alquiler') {
      const rent = Math.max(0, parseAmount(form.amount) || 0)
      const contribution = form.expenseCompanionIds.reduce((sum, id) => sum + Math.max(0, parseAmount(form.expenseCompanionContributions[id] ?? '0') || 0), 0)
      return { hasRoommates: form.expenseCompanionIds.length > 0, totalWithRoommates: rent, totalForMe: rent - contribution }
    }
    const monthKey = form.date.slice(0, 7)
    const monthRows = allRows.filter(row => split(row).date.slice(0, 7) === monthKey && row.rowNumber !== editing?.rowNumber)
    const rentRow = monthRows.find(row => split(row).category === 'Alquiler')
    const rent = form.category === 'Alquiler' ? Math.max(0, parseAmount(form.amount) || 0) : (rentRow ? split(rentRow).cents / 100 : 0)
    const roommates = rentRow ? split(rentRow).roommates : []
    const contribution = roommates.reduce((sum, person) => sum + Math.max(0, parseAmount(person.contribution || '0') || 0), 0)
    const sharedExpenses = monthRows.filter(row => ['Luz','Agua','Comunidad','Basura'].includes(split(row).category) && split(row).shared)
    let sharedGross = sharedExpenses.reduce((sum, row) => sum + split(row).cents / 100, 0)
    let mySharedPart = sharedExpenses.reduce((sum, row) => {
      const expense = split(row)
      if (['Luz','Agua'].includes(expense.category)) return sum + (expense.cents - Math.floor(expense.cents / expense.divider) * expense.expenseCompanions.length) / 100
      return sum + expense.cents / 100 / expense.divider
    }, 0)
    if (['Luz','Agua'].includes(form.category)) {
      const amountCents = Math.max(0, cents(parseAmount(form.amount) || 0))
      const divider = Math.max(1, Number(form.expenseDivider) || 1)
      sharedGross += amountCents / 100
      mySharedPart += (amountCents - Math.floor(amountCents / divider) * form.expenseCompanionIds.length) / 100
    }
    return { hasRoommates: roommates.length > 0 || form.expenseCompanionIds.length > 0, totalWithRoommates: rent + sharedGross, totalForMe: rent - contribution - mySharedPart }
  })()
  const internetPreview = (() => {
    if (form.category !== 'Internet' || !form.amount) return null
    const total = Math.max(0, cents(parseAmount(form.amount) || 0))
    const assigned = form.expenseCompanionIds.reduce((sum, id) => sum + Math.max(0, cents(parseAmount(form.expenseCompanionContributions[id] ?? '0') || 0)), 0)
    return { total, assigned, mine: Math.max(0, total - assigned), exceeds: assigned > total }
  })()
  async function persist(action: string, row?: Expense, status?: string) {
    if (busy) return
    setBusy(true)
    try { const rentalCompanions = form.category==='Alquiler' ? form.expenseCompanionIds.map(id=>({id:Number(id),name:companionData?.companions.find(person=>String(person.id)===id)?.name??'',contribution:parseAmount(form.expenseCompanionContributions[id]??'0')})).filter(item=>item.id>0&&item.name&&Number.isFinite(item.contribution)&&item.contribution>=0) : []; const expenseCompanionIds = form.expenseCompanionIds.map(Number).filter(Number.isInteger); const expenseCompanions = form.category==='Alquiler' ? [] : expenseCompanionIds.map(id=>({id,contribution:form.category==='Internet'?parseAmount(form.expenseCompanionContributions[String(id)]??'0'):0})); const sharesByNumber = (form.category==='Internet'&&expenseCompanionIds.length>0) || ['Luz','Agua'].includes(form.category) || (['Comunidad','Basura'].includes(form.category) && Number(form.expenseDivider) > 1) || (form.category === 'Compras' && form.shared); const response = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, year, rowNumber: row?.rowNumber, legacy: row?.legacy, status, divider: Number(form.divider), expenseDivider: Number(form.expenseDivider), companions:rentalCompanions, expenseCompanions, values: action === 'add' || action === 'update' ? [form.date, form.category, parseAmount(form.amount).toFixed(2), sharesByNumber, form.start, form.end, form.status] : undefined }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await mutate(); setEditing(undefined) }
    catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }
  async function saveCompanion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!companionDraft.trim() || savingCompanion) return
    setSavingCompanion(true)
    try {
      const response = await fetch('/api/companions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: editingCompanionId ? 'update' : 'add', id: editingCompanionId, name: companionDraft }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el compañero')
      await mutateCompanions()
      if (editingCompanionId) await mutate()
      setCompanionDraft('')
      setEditingCompanionId(null)
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo guardar el compañero') }
    finally { setSavingCompanion(false) }
  }
  async function removeCompanion(companion: Companion) {
    if (!window.confirm(`¿Quitar a ${companion.name} de la lista? Se conserva en los gastos históricos.`)) return
    const response = await fetch('/api/companions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: companion.id }) })
    const result = await response.json()
    if (!response.ok) { window.alert(result.error ?? 'No se pudo quitar el compañero'); return }
    await mutateCompanions()
  }
  async function createYear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creatingYear) return
    setCreatingYear(true)
    try {
      const response = await fetch('/api/years', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-year' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudo preparar el año')
      await mutate()
      setYear(String(result.year))
      setMonth(initialPeriod.month)
      setShowYearCreator(false)
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo preparar el año') }
    finally { setCreatingYear(false) }
  }
  async function exportExcel(which: string) {
    if (exporting) return
    setExporting(true)
    try {
      const response = await fetch(`/api/export?year=${which}`, { cache: 'no-store' })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? 'No se pudo exportar') }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `alquiler-${which === 'all' ? 'historico' : which}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo exportar') }
    finally { setExporting(false); setShowDownloadMenu(false) }
  }
  function open(row: Expense | null) { setForm(expenseForm(row, year, month)); setEditing(row) }
  const sym = (category: string) => category === 'Alquiler' ? <Home size={16}/> : category === 'Luz' ? <Lightbulb size={16}/> : category === 'Agua' ? <Droplets size={16}/> : category === 'Internet' ? <Wifi size={16}/> : category === 'Compras' ? <ShoppingBag size={16}/> : <Home size={16}/>
  if (error && !data) return <main className="expense-error"><h1>No se han podido actualizar los gastos</h1><p>Inténtalo de nuevo en unos segundos. Tus datos guardados no se han modificado.</p><button onClick={() => mutate()}>Reintentar</button></main>
  return <main className={`expense-app${mobileNavOpen?' nav-open':''}`} onTouchStart={event=>{touchStartX.current=event.touches[0]?.clientX??null}} onTouchEnd={event=>{const start=touchStartX.current;const end=event.changedTouches[0]?.clientX;touchStartX.current=null;if(start==null||end==null)return;if(start<30&&end-start>65)setMobileNavOpen(true);if(mobileNavOpen&&start-end>65)setMobileNavOpen(false)}}>
    {mobileNavOpen&&<button className="expense-nav-backdrop" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}
    <aside className={`expense-sidebar${mobileNavOpen?' sidebar-open':''}`} aria-label="Navegacion principal">
      <a className="expense-brand" href="/dashboard"><img src="/apple-icon.png" alt="Administra" className="expense-brand-logo" /></a>
      <div className="expense-sidebar-label">TU ESPACIO</div>
      <nav className="expense-side-nav">
        <button className={`expense-side-link${tab==='home'?' selected':''}`} onClick={()=>{setTab('home');setMobileNavOpen(false)}}><LayoutDashboard size={18}/><span>Inicio</span></button>
        <button className={`expense-side-link${tab==='expenses'?' selected':''}`} onClick={()=>{setTab('expenses');setMobileNavOpen(false)}}><ShoppingBag size={18}/><span>Gastos</span><small>{rows.length}</small></button>
      </nav>
      <button className="expense-side-manage" onClick={()=>{setCompanionDraft('');setEditingCompanionId(null);setShowCompanions(true);setMobileNavOpen(false)}}><Plus size={16}/><span>Gestionar compa&#241;eros</span></button>
      <div className="expense-sidebar-footer"><span>A&#209;O</span><strong>{year}</strong><small>Datos privados en Neon</small></div>
    </aside>
    <div className="expense-main-column">
    <header className="expense-header"><button className="expense-mobile-menu" aria-label="Abrir menu" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}><Menu size={20}/></button><div className="expense-header-title">Resumen del hogar</div><div className="expense-filters"><label>Año<select value={year} onChange={e => setYear(e.target.value)}>{yearOptions.map(y=><option key={y} value={y} >{y}{data && !data.years.some(item=>item.year===y)?' (sin datos)':''}</option>)}</select></label><label>Mes<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">Todo el año</option>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label><div className="expense-download-menu"><button className="button-quiet" disabled={exporting} aria-haspopup="menu" aria-expanded={showDownloadMenu} onClick={()=>setShowDownloadMenu(open=>!open)}><Download size={15}/>{exporting?'Preparando...':'Descargar'}</button>{showDownloadMenu&&<div className="expense-download-popover" role="menu"><button type="button" role="menuitem" disabled={exporting} onClick={()=>exportExcel(year)}>Excel {year}</button><button type="button" role="menuitem" disabled={exporting} onClick={()=>exportExcel('all')}>Excel hist&#243;rico</button></div>}</div></div><div className="expense-user">{user.name}<button aria-label="Cerrar sesión" onClick={() => authClient.signOut().then(()=>location.assign('/sign-in'))}><LogOut size={17}/></button></div></header>
    <div className="expense-wrap"><div className="expense-title"><div><span className="eyebrow">TU HOGAR · {year}</span><h1>{tab === 'home' ? 'Gastos del hogar' : 'Tus gastos'}</h1><p>Control sencillo de los gastos que compartís.</p></div><div className="expense-title-actions">{tab==='home'&&<button className="button-quiet" onClick={()=>setShowYearCreator(true)}><Plus size={15}/> Nuevo a&#241;o</button>}<button className="button-primary" onClick={()=>open(null)}><Plus size={17}/> Añadir gasto</button></div></div>
      {tab==='home'&&<section className="expense-stats"><article><span>Total de tus gastos</span><strong>{money(totals.mine/100)}</strong><small>Tu parte antes de descontar Internet</small></article>{companionsWithExpenses.map(companion=><article key={companion.id}><span>Parte de {companion.name}</span><strong>{money((companionTotals.get(String(companion.id))??0)/100)}</strong></article>)}<article><span>Total compras</span><strong>{money(purchasesCents/100)}</strong><small>Importe total de las compras</small></article><article className="due-card"><span>Total que tienes que pagar</span><strong>{money(due/100)}</strong><small>Sin Compras ni Internet</small></article></section>}
      {tab === 'home' ? <section className="expense-charts"><article className="expense-panel"><div className="expense-panel-title"><div><span className="eyebrow">{month==='all'?'VISTA ANUAL':'VISTA MENSUAL'}</span><h2>Distribución de gastos</h2></div><span>{month==='all'?year:months[Number(month)]}</span></div>{categoryData.length ? <div className="donut-layout"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="amount" nameKey="name" innerRadius="58%" outerRadius="83%" paddingAngle={3}>{categoryData.map((item,i)=><Cell key={item.name} fill={colors[categories.indexOf(item.name)]}/>)}</Pie><Tooltip formatter={v=>money(Number(v))}/></PieChart></ResponsiveContainer></div><div className="expense-legend">{categoryData.map(x=><div key={x.name}><span><i style={{background:colors[categories.indexOf(x.name)]}}/>{x.name}</span><b>{money(x.amount)}</b></div>)}</div></div> : <div className="expense-empty">No hay gastos en este periodo.</div>}</article><article className="expense-panel"><div className="expense-panel-title"><div><span className="eyebrow">GASTO PERSONAL NETO</span><h2>Evolución mensual</h2></div><span>{year}</span></div><div className="monthly-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid vertical={false} stroke="#e8ebe5"/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickFormatter={v=>`${v}€`} width={48} tickLine={false} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Bar dataKey="amount" name="Mi parte" fill="#547b5e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></article></section> : <section className="expense-list"><div className="expense-list-head"><div><span className="eyebrow">REGISTROS</span><h2>Gastos por categoría</h2></div><span>{rows.length} registros</span></div>{isLoading ? <div className="expense-empty">Cargando gastos…</div> : groups.length ? groups.map(group=><div className="expense-group" key={group.category}><h3>{sym(group.category)}{group.category}<span>{money(group.rows.reduce((s,r)=>s+displayCents(r),0)/100)}</span></h3>{group.rows.map(row=>{const e=split(row);const monthText=months[monthsIdx(e.date)]??e.date;return <article className="expense-row" key={row.rowNumber}><div className="expense-main"><strong>{money(displayCents(row)/100)}</strong><span>{monthText}{e.start?` · ${e.start} – ${e.end}`:''}{['Alquiler','Luz','Agua','Internet'].includes(e.category)?` · ${rowBreakdown(row)}`:e.category==='Internet'?` · ${money(e.cents/100)}`:''}{e.shared&&e.category==='Compras'?' · A medias':''}{e.shared&&e.category==='Basura'?' · Dividido':''}</span></div><button className={`status-pill ${e.status==='Pagado'?'paid':''}`} onClick={()=>persist('status',row,e.status==='Pagado'?'Pendiente':'Pagado')}>{e.status==='Pagado'?'Pagado':'Pendiente'}</button><div className="expense-actions"><button aria-label="Editar gasto" onClick={()=>open(row)}><Pencil size={16}/></button><button aria-label="Eliminar gasto" onClick={()=>window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')&&persist('delete',row)}><Trash2 size={16}/></button></div></article>})}</div>) : <div className="expense-empty">No hay gastos registrados para este periodo.</div>}</section>}
      <footer className="expense-foot">Tus datos se guardan de forma privada en Neon.</footer>
    </div>
    {showCompanions&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!savingCompanion&&setShowCompanions(false)}><section className="edit-modal companion-manager-modal" role="dialog" aria-modal="true" aria-labelledby="companion-manager-title"><div className="companion-manager-heading"><div className="companion-manager-icon"><UsersRound size={19}/></div><div><span className="eyebrow">TU HOGAR</span><h2 id="companion-manager-title">Gestionar compa&#241;eros</h2></div><button className="icon-button" aria-label="Cerrar" onClick={()=>setShowCompanions(false)}><X size={17}/></button></div><p className="companion-manager-description">A&#241;ade los nombres que podr&#225;s elegir al repartir cada gasto.</p><form className="companion-manager-form" onSubmit={saveCompanion}><label className="field-label">Nombre del compa&#241;ero<input required maxLength={80} placeholder="Por ejemplo, Alex" value={companionDraft} onChange={e=>setCompanionDraft(e.target.value)}/></label>{editingCompanionId&&<button type="button" className="button-quiet" onClick={()=>{setCompanionDraft('');setEditingCompanionId(null)}}>Cancelar</button>}<button className="button-primary" disabled={savingCompanion}>{savingCompanion?'Guardando...':editingCompanionId?'Guardar cambios':<>A&#241;adir compa&#241;ero</>}<Check size={16}/></button></form><div className="companion-list-heading"><span>COMPA&#209;EROS REGISTRADOS</span><b>{companions.length}</b></div><div className="companion-list">{companions.length?companions.map(companion=><article className="companion-manager-item" key={companion.id}><span className="companion-avatar">{companion.name.trim().slice(0,1).toLocaleUpperCase('es')}</span><div className="companion-manager-name"><strong>{companion.name}</strong><small>Compa&#241;ero registrado</small></div><div className="companion-manager-actions"><button type="button" title="Editar" aria-label="Editar compa&#241;ero" onClick={()=>{setEditingCompanionId(companion.id);setCompanionDraft(companion.name)}}><Pencil size={16}/></button><button type="button" title="Quitar" aria-label="Quitar compa&#241;ero" onClick={()=>removeCompanion(companion)}><Trash2 size={16}/></button></div></article>):<div className="companion-empty-state"><UsersRound size={23}/><strong>A&#250;n no hay compa&#241;eros</strong><span>A&#241;ade el primero con el formulario de arriba.</span></div>}</div><p className="companion-manager-note">Al quitar un nombre, se conserva en los gastos hist&#243;ricos.</p></section></div>}{editing !== undefined && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setEditing(undefined)}><section className="edit-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{editing?'EDITAR GASTO':'NUEVO GASTO'} · {year}</span><h2>{editing?'Editar gasto':'Añadir gasto'}</h2></div><button className="icon-button" onClick={()=>setEditing(undefined)}>×</button></div><form onSubmit={e=>{e.preventDefault();if(!form.date.startsWith(year)){window.alert('Selecciona un mes del año elegido.');return}if(form.category==='Internet'&&allRows.some(r=>split(r).category==='Internet'&&split(r).date.slice(0,7)===form.date.slice(0,7)&&r.rowNumber!==editing?.rowNumber)){window.alert('Ya has anotado Internet para ese mes.');return}if(!Number.isFinite(parseAmount(form.amount))||parseAmount(form.amount)<=0){window.alert('Introduce un importe válido.');return}if(['Luz','Agua'].includes(form.category)&&Number(form.expenseDivider)>1&&!form.expenseCompanionIds.length){window.alert('Selecciona qué compañeros comparten el gasto.');return}if(form.category==='Alquiler'&&rentalPreview&&rentalPreview.totalForMe<0){window.alert('La suma de las aportaciones supera el alquiler.');return}if(form.category==='Internet'&&internetPreview?.exceeds){window.alert('La suma de las aportaciones no puede superar el importe total.');return}if(['Luz','Agua'].includes(form.category)&&form.expenseCompanionIds.length>Number(form.expenseDivider)){window.alert('El numero de companeros no puede superar el divisor.');return}persist(editing?'update':'add',editing??undefined)}}><div className="form-grid"><label className="field-label">Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,amount:e.target.value==='Internet'?'':form.amount,shared:false,expenseCompanionIds:[],expenseCompanionContributions:{},expenseDivider:'1'})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label">Importe (€)<input required inputMode="decimal" placeholder="0,00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label className="field-label">Mes<select required value={form.date.slice(5,7)} disabled={Boolean(editing?.legacy)} onChange={e=>setForm({...form,date:`${year}-${e.target.value}-01`})}><option value="">Selecciona un mes</option>{months.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}</select></label>{['Luz','Agua'].includes(form.category)&&<><label className="field-label">Periodo inicio<input type="date" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label className="field-label">Periodo fin<input type="date" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label></>}{['Luz','Agua','Comunidad','Basura'].includes(form.category)&&<label className="field-label">Dividir importe entre<input type="number" min="1" step="1" required value={form.expenseDivider} onChange={e=>setForm({...form,expenseDivider:e.target.value})}/></label>}{['Alquiler','Luz','Agua','Internet'].includes(form.category)&&<fieldset className="expense-companion-picker"><legend>{form.category==='Internet'?'Aportaciones de Internet':form.category==='Alquiler'?'Aportacion fija del alquiler':'Qu\u00e9 compa&#241;eros comparten este gasto'}</legend>{companions.length?companions.map(companion=>{const id=String(companion.id);const selected=form.expenseCompanionIds.includes(id);return <div className="expense-companion-option" key={id}><label className="field-check"><input type="checkbox" checked={selected} onChange={e=>setForm({...form,expenseCompanionIds:e.target.checked?[...form.expenseCompanionIds,id]:form.expenseCompanionIds.filter(item=>item!==id)})}/>{companion.name}</label>{(form.category==='Internet'||form.category==='Alquiler')&&selected&&<label className="field-label expense-contribution-field">{form.category==='Alquiler'?'Aportaci\u00f3n fija (\u20ac)':'Aportaci\u00f3n (\u20ac)'}<input required type="number" min="0" step="0.01" value={form.expenseCompanionContributions[id]??''} onChange={e=>setForm({...form,expenseCompanionContributions:{...form.expenseCompanionContributions,[id]:e.target.value}})}/></label>}</div>}):<span>A&#241;ade compa&#241;eros desde Inicio para poder seleccionarlos.</span>}</fieldset>}{form.category==='Compras'&&<label className="field-check"><input type="checkbox" checked={form.shared} onChange={e=>setForm({...form,shared:e.target.checked})}/>A medias</label>}{form.category==='Internet'&&<div className="expense-internet-note">Registra el importe total del gasto de Internet.</div>}<label className="field-label">Estado<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Pagado</option><option>Pendiente</option></select></label></div>{internetPreview&&<div className={`expense-total-preview${internetPreview.exceeds?' preview-error':''}`}><div><span>Importe total de Internet</span><strong>{money(internetPreview.total/100)}</strong></div>{form.expenseCompanionIds.map(id=><div key={id}><span>{companions.find(person=>String(person.id)===id)?.name??'Compa&#241;ero'}</span><strong>{money(cents(parseAmount(form.expenseCompanionContributions[id]??'0')||0)/100)}</strong></div>)}<div className="expense-preview-mine"><span>Tu parte de Internet</span><strong>{money(internetPreview.mine/100)}</strong></div>{internetPreview.exceeds&&<small>Las aportaciones superan el importe total.</small>}</div>}{rentalPreview&&<div className="expense-total-preview">{rentalPreview.hasRoommates&&<div><span>Total alquiler con compa&#241;eros</span><strong>{money(rentalPreview.totalWithRoommates)}</strong></div>}<div className="expense-preview-mine"><span>Total alquiler que te corresponde</span><strong>{money(rentalPreview.totalForMe)}</strong></div></div>}<div className="modal-actions"><button type="button" className="button-quiet" onClick={()=>setEditing(undefined)}>Cancelar</button><button className="button-primary" disabled={busy}>{busy?'Guardando…':'Guardar gasto'}<Check size={16}/></button></div></form></section></div>}
    {showYearCreator&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!creatingYear&&setShowYearCreator(false)}><section className="edit-modal new-year-modal" role="dialog" aria-modal="true" aria-labelledby="new-year-title"><div className="modal-heading"><div><span className="eyebrow">A&#209;O NUEVO</span><h2 id="new-year-title">Preparar {new Date().getFullYear()+1}</h2></div><button className="icon-button" disabled={creatingYear} aria-label="Cerrar" onClick={()=>setShowYearCreator(false)}><X size={17}/></button></div><p className="year-modal-note">El a&#241;o empezar&#225; sin datos. Al confirmar, podr&#225;s seleccionarlo y a&#241;adir gastos.</p><form onSubmit={createYear}><div className="modal-actions"><button type="button" className="button-quiet" disabled={creatingYear} onClick={()=>setShowYearCreator(false)}>Cancelar</button><button className="button-primary" disabled={creatingYear}>{creatingYear?'Preparando...':<>Crear a&#241;o</>}<Check size={16}/></button></div></form></section></div>}
    </div>
  </main>
}



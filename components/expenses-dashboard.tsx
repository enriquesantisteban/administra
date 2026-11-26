'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { authClient } from '@/lib/auth-client'
import { Check, Home, Lightbulb, Plus, Trash2, Pencil, LogOut, LayoutDashboard, ShoppingBag, Droplets, Wifi, ChevronDown, Download } from 'lucide-react'

type Expense = { rowNumber: number; values: unknown[]; legacy?: boolean }
type YearData = { year: string; sheetId: number; rows: Expense[] }
type Payload = { years: YearData[]; error?: string }
type RoommateForm = { name: string; contribution: string }
type FormData = { date: string; category: string; amount: string; shared: boolean; start: string; end: string; status: string; divider: string; expenseDivider: string; roommateCount: string; roommates: RoommateForm[] }
const categories = ['Alquiler', 'Comunidad', 'Luz', 'Agua', 'Internet', 'Basura', 'Compras']
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const colors = ['#294d3b','#b9a98c','#789b7d','#d4a36b','#617a93','#87a4a0','#72809a']
const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const parseAmount = (s: string) => Number(s.trim().includes(',') ? s.trim().replace(/\./g, '').replace(',', '.') : s.trim())
const fetcher = async (url: string): Promise<Payload> => { const r = await fetch(url, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d }
const cents = (x: unknown) => { if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 100) : 0; const s = String(x ?? '0').trim().replace(/[€\s]/g, ''); const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; const n = Number(normalized); return Number.isFinite(n) ? Math.round(n * 100) : 0 }
const monthsIdx = (date: unknown) => { const d = String(date ?? ''); const m = /^\d{4}-(\d\d)/.exec(d); return m ? Number(m[1]) - 1 : -1 }
const defaultForm = (): FormData => ({ date: '', category: 'Alquiler', amount: '', shared: false, start: '', end: '', status: 'Pendiente', divider: '1', expenseDivider: '1', roommateCount: '0', roommates: [] })
function split(row: Expense) { const v = row.values; let roommates: RoommateForm[] = []; try { roommates = JSON.parse(String(v[8] ?? '[]')) } catch {} return { date: String(v[0] ?? ''), category: String(v[1] ?? ''), cents: cents(v[2]), shared: isShared(v[3]), start: String(v[4] ?? ''), end: String(v[5] ?? ''), status: String(v[6] ?? 'Pendiente'), divider: Math.max(1, Number(v[9] ?? v[7]) || 1), contributionCents: roommates.reduce((sum, item) => sum + cents(item.contribution), 0), roommates } }
function isShared(value: unknown) { if (typeof value === 'boolean') return value; if (typeof value === 'number') return value === 1; const normalized = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); return ['SI','TRUE','YES','1','VERDADERO'].includes(normalized) }
const displayCents = (row: Expense) => split(row).cents
function angelAndMine(row: Expense) { const e = split(row); if (e.category === 'Alquiler') return { angel: e.contributionCents, mine: e.cents - e.contributionCents }; if (e.category === 'Internet') return { angel: 0, mine: e.cents }; if (['Comunidad','Luz','Agua','Basura'].includes(e.category) && e.shared) { const mine = Math.round(e.cents / e.divider); return { angel: e.cents - mine, mine } } if (e.category === 'Compras' && e.shared) { const mine = Math.round(e.cents / 2); return { angel: e.cents - mine, mine } } return { angel: 0, mine: e.cents } }
function expenseForm(row: Expense | null, year: string, month: string): FormData { if (!row) return { ...defaultForm(), date: month === 'all' ? '' : `${year}-${String(Number(month) + 1).padStart(2, '0')}-01` }; const e = split(row); return { date: e.date, category: e.category, amount: (e.cents / 100).toFixed(2).replace('.', ','), shared: e.shared, start: e.start, end: e.end, status: e.status, divider: String(row.values[7] ?? 1), expenseDivider: String(row.values[9] ?? row.values[7] ?? 1), roommateCount: String(e.roommates.length), roommates: e.roommates } }

export function ExpensesDashboard({ user }: { user: { name: string; email: string } }) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const { data, error, isLoading, mutate } = useSWR<Payload>(`/api/expenses?year=${year}`, fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60_000, refreshInterval: 0, shouldRetryOnError: true, errorRetryCount: 3, errorRetryInterval: 15_000 })
  const [month, setMonth] = useState('all')
  const [tab, setTab] = useState<'home'|'expenses'>('home')
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)
  const [form, setForm] = useState<FormData>(defaultForm())
  const [busy, setBusy] = useState(false)
  const [showYearCreator, setShowYearCreator] = useState(false)
  const [templateYear, setTemplateYear] = useState('')
  const [exporting, setExporting] = useState(false)
  const [creatingYear, setCreatingYear] = useState(false)
  const yearOptions = [...new Set([...Array.from({ length: Math.max(1, new Date().getFullYear() + 2 - 2017) }, (_, i) => String(2017 + i)), ...(data?.years.map(y=>y.year) ?? [])])].sort()
  const allRows = data?.years.find(y => y.year === year)?.rows ?? []
  const rows = useMemo(() => allRows.filter(r => { const e = split(r); return e.date.startsWith(year) && (month === 'all' || monthsIdx(e.date) === Number(month)) }), [allRows, year, month])
  const totals = rows.reduce((acc, row) => { const part = angelAndMine(row); acc.angel += part.angel; acc.mine += part.mine; return acc }, { angel: 0, mine: 0 })
  const internetCents = rows.filter(row => split(row).category === 'Internet').reduce((sum, row) => sum + split(row).cents, 0)
  const purchasesCents = rows.filter(row => split(row).category === 'Compras').reduce((sum, row) => sum + split(row).cents, 0)
  const due = rows.filter(row => !['Compras', 'Internet'].includes(split(row).category)).reduce((sum, row) => sum + split(row).cents, 0)
  const categoryData = categories.map(category => ({ name: category, amount: (category === 'Internet' ? internetCents : rows.filter(r => split(r).category === category).reduce((s,r) => s + angelAndMine(r).mine, 0)) / 100 })).filter(x => x.amount !== 0)
  const monthly = months.map((m,i) => { const monthRows = allRows.filter(r => monthsIdx(split(r).date) === i); const internet = monthRows.filter(r => split(r).category === 'Internet').reduce((sum,r)=>sum+split(r).cents,0); return { month: m.slice(0,3), amount: (monthRows.reduce((s,r) => s + angelAndMine(r).mine, 0) - internet) / 100 } })
  const groups = categories.map(category => ({ category, rows: rows.filter(r => split(r).category === category) })).filter(g => g.rows.length)
  const rentalPreview = (() => {
    if (!form.date || !['Alquiler', 'Luz', 'Agua'].includes(form.category)) return null
    const monthKey = form.date.slice(0, 7)
    const monthRows = allRows.filter(row => split(row).date.slice(0, 7) === monthKey && row.rowNumber !== editing?.rowNumber)
    const rentRow = monthRows.find(row => split(row).category === 'Alquiler')
    const rent = form.category === 'Alquiler' ? Math.max(0, parseAmount(form.amount) || 0) : (rentRow ? split(rentRow).cents / 100 : 0)
    const roommates = form.category === 'Alquiler' ? form.roommates.slice(0, Number(form.roommateCount)) : (rentRow ? split(rentRow).roommates : [])
    const contribution = roommates.reduce((sum, person) => sum + Math.max(0, parseAmount(person.contribution || '0') || 0), 0)
    const sharedExpenses = monthRows.filter(row => ['Luz','Agua','Comunidad','Basura'].includes(split(row).category) && split(row).shared)
    let sharedGross = sharedExpenses.reduce((sum, row) => sum + split(row).cents / 100, 0)
    let mySharedPart = sharedExpenses.reduce((sum, row) => sum + split(row).cents / 100 / split(row).divider, 0)
    if (['Luz','Agua'].includes(form.category)) {
      const amount = Math.max(0, parseAmount(form.amount) || 0)
      sharedGross += amount
      mySharedPart += amount / Math.max(1, Number(form.expenseDivider) || 1)
    }
    return { hasRoommates: roommates.length > 0, totalWithRoommates: rent + sharedGross, totalForMe: rent - contribution - mySharedPart }
  })()
  async function persist(action: string, row?: Expense, status?: string) {
    if (busy) return
    setBusy(true)
    try { const companions = form.roommates.slice(0, Number(form.roommateCount)).map(item=>({ name: item.name.trim(), contribution: parseAmount(item.contribution || '0') })).filter(item=>item.name); const sharesByNumber = ['Luz','Agua'].includes(form.category) || (['Comunidad','Basura'].includes(form.category) && Number(form.expenseDivider) > 1) || (form.category === 'Compras' && form.shared); const response = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, year, rowNumber: row?.rowNumber, legacy: row?.legacy, status, divider: Number(form.divider), expenseDivider: Number(form.expenseDivider), companions, values: action === 'add' || action === 'update' ? [form.date, form.category, parseAmount(form.amount).toFixed(2), sharesByNumber, form.start, form.end, form.status] : undefined }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await mutate(); setEditing(undefined) }
    catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }
  async function createYear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!templateYear || creatingYear) return
    setCreatingYear(true)
    try {
      const response = await fetch('/api/years', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-year', templateYear }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear el año')
      await mutate()
      setYear(result.year)
      setMonth('all')
      setShowYearCreator(false)
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo crear el año') }
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
    finally { setExporting(false) }
  }
  function open(row: Expense | null) { setForm(expenseForm(row, year, month)); setEditing(row) }
  const sym = (category: string) => category === 'Alquiler' ? <Home size={16}/> : category === 'Luz' ? <Lightbulb size={16}/> : category === 'Agua' ? <Droplets size={16}/> : category === 'Internet' ? <Wifi size={16}/> : category === 'Compras' ? <ShoppingBag size={16}/> : <Home size={16}/>
  if (error && !data) return <main className="expense-error"><h1>No se han podido actualizar los gastos</h1><p>Inténtalo de nuevo en unos segundos. Tus datos guardados no se han modificado.</p><button onClick={() => mutate()}>Reintentar</button></main>
  return <main className="expense-app">
    <header className="expense-header"><a className="expense-brand" href="/dashboard"><span className="brand-mark">A</span>Administra<span>.</span></a><div className="expense-filters"><label>Año<select value={year} onChange={e => setYear(e.target.value)}>{yearOptions.map(y=><option key={y} value={y} disabled={Boolean(data && !data.years.some(item=>item.year===y))}>{y}{data && !data.years.some(item=>item.year===y)?' (sin datos)':''}</option>)}</select></label><label>Mes<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">Todo el año</option>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label><button className="button-quiet" disabled={exporting} onClick={()=>exportExcel(year)}><Download size={15}/>{exporting?'Preparando…':`Excel ${year}`}</button><button className="button-quiet" disabled={exporting} onClick={()=>exportExcel('all')}><Download size={15}/>{exporting?'Preparando…':'Excel histórico'}</button></div><div className="expense-user">{user.name}<button aria-label="Cerrar sesión" onClick={() => authClient.signOut().then(()=>location.assign('/sign-in'))}><LogOut size={17}/></button></div></header>
    <div className="expense-wrap"><div className="expense-title"><div><span className="eyebrow">TU HOGAR · {year}</span><h1>{tab === 'home' ? 'Gastos del hogar' : 'Tus gastos'}</h1><p>Control sencillo de los gastos que compartís.</p></div><div className="expense-title-actions"><button className="button-quiet" disabled={!data?.years.length} onClick={()=>{setTemplateYear(data?.years[0]?.year ?? year);setShowYearCreator(true)}}><Plus size={15}/> Nuevo año</button><button className="button-primary" onClick={()=>open(null)}><Plus size={17}/> Añadir gasto</button></div></div>
      <nav className="expense-tabs"><button className={tab==='home'?'selected':''} onClick={()=>setTab('home')}><LayoutDashboard size={16}/>Inicio</button><button className={tab==='expenses'?'selected':''} onClick={()=>setTab('expenses')}><ShoppingBag size={16}/>Gastos <span>{rows.length}</span></button><a href="/dashboard">Alquileres</a></nav>
      <section className="expense-stats"><article><span>Total de tus gastos</span><strong>{money(totals.mine/100)}</strong><small>Tu parte antes de descontar Internet</small></article><article><span>Parte de Ángel</span><strong>{money(totals.angel/100)}</strong><small>Internet que has anotado: {money(internetCents/100)}</small></article><article><span>Total compras</span><strong>{money(purchasesCents/100)}</strong><small>Importe total de las compras</small></article><article className="due-card"><span>Total que tienes que pagar</span><strong>{money(due/100)}</strong><small>Sin Compras ni Internet</small></article></section>
      {tab === 'home' ? <section className="expense-charts"><article className="expense-panel"><div className="expense-panel-title"><div><span className="eyebrow">{month==='all'?'VISTA ANUAL':'VISTA MENSUAL'}</span><h2>Distribución de gastos</h2></div><span>{month==='all'?year:months[Number(month)]}</span></div>{categoryData.length ? <div className="donut-layout"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="amount" nameKey="name" innerRadius="58%" outerRadius="83%" paddingAngle={3}>{categoryData.map((item,i)=><Cell key={item.name} fill={colors[categories.indexOf(item.name)]}/>)}</Pie><Tooltip formatter={v=>money(Number(v))}/></PieChart></ResponsiveContainer></div><div className="expense-legend">{categoryData.map(x=><div key={x.name}><span><i style={{background:colors[categories.indexOf(x.name)]}}/>{x.name}</span><b>{money(x.amount)}</b></div>)}</div></div> : <div className="expense-empty">No hay gastos en este periodo.</div>}</article><article className="expense-panel"><div className="expense-panel-title"><div><span className="eyebrow">GASTO PERSONAL NETO</span><h2>Evolución mensual</h2></div><span>{year}</span></div><div className="monthly-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid vertical={false} stroke="#e8ebe5"/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickFormatter={v=>`${v}€`} width={48} tickLine={false} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Bar dataKey="amount" name="Mi parte" fill="#547b5e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></article></section> : <section className="expense-list"><div className="expense-list-head"><div><span className="eyebrow">REGISTROS</span><h2>Gastos por categoría</h2></div><span>{rows.length} registros</span></div>{isLoading ? <div className="expense-empty">Cargando gastos…</div> : groups.length ? groups.map(group=><div className="expense-group" key={group.category}><h3>{sym(group.category)}{group.category}<span>{money(group.rows.reduce((s,r)=>s+displayCents(r),0)/100)}</span></h3>{group.rows.map(row=>{const e=split(row),p=angelAndMine(row);const monthText=months[monthsIdx(e.date)]??e.date;return <article className="expense-row" key={row.rowNumber}><div className="expense-main"><strong>{money(displayCents(row)/100)}</strong><span>{monthText}{e.start?` · ${e.start} – ${e.end}`:''}{p.angel?` · Tu parte ${money(p.mine/100)} · Ángel ${money(p.angel/100)}`:e.category==='Internet'?` · Ángel ${money(e.cents/100)}`:''}{e.shared&&e.category==='Compras'?' · A medias':''}{e.shared&&['Alquiler','Basura'].includes(e.category)?' · Con Ángel':''}</span></div><button className={`status-pill ${e.status==='Pagado'?'paid':''}`} onClick={()=>persist('status',row,e.status==='Pagado'?'Pendiente':'Pagado')}>{e.status==='Pagado'?'Pagado':'Pendiente'}</button><div className="expense-actions"><button aria-label="Editar gasto" onClick={()=>open(row)}><Pencil size={16}/></button><button aria-label="Eliminar gasto" onClick={()=>window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')&&persist('delete',row)}><Trash2 size={16}/></button></div></article>})}</div>) : <div className="expense-empty">No hay gastos registrados para este periodo.</div>}</section>}
      <footer className="expense-foot">Tus datos se guardan de forma privada en Neon.</footer>
    </div>
    {editing !== undefined && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setEditing(undefined)}><section className="edit-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{editing?'EDITAR GASTO':'NUEVO GASTO'} · {year}</span><h2>{editing?'Editar gasto':'Añadir gasto'}</h2></div><button className="icon-button" onClick={()=>setEditing(undefined)}>×</button></div><form onSubmit={e=>{e.preventDefault();if(!form.date.startsWith(year)){window.alert('Selecciona un mes del año elegido.');return}if(form.category==='Internet'&&allRows.some(r=>split(r).category==='Internet'&&split(r).date.slice(0,7)===form.date.slice(0,7)&&r.rowNumber!==editing?.rowNumber)){window.alert('Ya has anotado Internet para ese mes.');return}if(!Number.isFinite(parseAmount(form.amount))||parseAmount(form.amount)<=0){window.alert('Introduce un importe válido.');return}persist(editing?'update':'add',editing??undefined)}}><div className="form-grid"><label className="field-label">Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,amount:e.target.value==='Internet'?'':form.amount,shared:false})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label">Importe (€)<input required inputMode="decimal" placeholder="0,00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label className="field-label">Mes<select required value={form.date.slice(5,7)} disabled={Boolean(editing?.legacy)} onChange={e=>setForm({...form,date:`${year}-${e.target.value}-01`})}><option value="">Selecciona un mes</option>{months.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}</select></label>{['Luz','Agua'].includes(form.category)&&<><label className="field-label">Periodo inicio<input type="date" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label className="field-label">Periodo fin<input type="date" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label></>}{['Luz','Agua','Comunidad','Basura'].includes(form.category)&&<label className="field-label">Dividir importe entre<input type="number" min="1" step="1" required value={form.expenseDivider} onChange={e=>setForm({...form,expenseDivider:e.target.value})}/></label>}{form.category==='Compras'&&<label className="field-check"><input type="checkbox" checked={form.shared} onChange={e=>setForm({...form,shared:e.target.checked})}/>A medias</label>}{form.category==='Internet'&&<div className="expense-internet-note">Introduce manualmente la cantidad que Ángel aporta por Internet en este mes.</div>}<label className="field-label">Estado<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Pagado</option><option>Pendiente</option></select></label>{form.category==='Alquiler'&&<><label className="field-label">¿Cuántos compañeros?<input type="number" min="0" step="1" value={form.roommateCount} onChange={e=>{const count=Math.max(0,Math.floor(Number(e.target.value)||0));setForm({...form,roommateCount:String(count),roommates:Array.from({length:count},(_,i)=>form.roommates[i]??{name:'',contribution:''})})}}/></label>{form.roommates.slice(0,Number(form.roommateCount)).map((roommate,index)=><div className="roommate-fields" key={index}><label className="field-label">Nombre del compañero {index+1}<input required value={roommate.name} onChange={e=>setForm({...form,roommates:form.roommates.map((item,i)=>i===index?{...item,name:e.target.value}:item)})}/></label><label className="field-label">Aportación fija del alquiler (€)<input required type="number" min="0" step="0.01" value={roommate.contribution} onChange={e=>setForm({...form,roommates:form.roommates.map((item,i)=>i===index?{...item,contribution:e.target.value}:item)})}/></label></div>)}</>}</div>{rentalPreview&&<div className="expense-internet-note">{rentalPreview.hasRoommates&&<><strong>Total alquiler con compañeros: {money(rentalPreview.totalWithRoommates)}</strong><br/></>}<strong>Total alquiler que te corresponde: {money(rentalPreview.totalForMe)}</strong></div>}<div className="modal-actions"><button type="button" className="button-quiet" onClick={()=>setEditing(undefined)}>Cancelar</button><button className="button-primary" disabled={busy}>{busy?'Guardando…':'Guardar gasto'}<Check size={16}/></button></div></form></section></div>}
    {showYearCreator && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!creatingYear&&setShowYearCreator(false)}><section className="edit-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">NUEVA HOJA ANUAL</span><h2>Crear año sin datos</h2></div><button className="icon-button" disabled={creatingYear} onClick={()=>setShowYearCreator(false)}>×</button></div><form onSubmit={createYear}><label className="field-label">Copiar formato del año<select value={templateYear} onChange={e=>setTemplateYear(e.target.value)}>{(data?.years ?? []).map(item=><option key={item.year} value={item.year}>{item.year}</option>)}</select></label><p className="year-modal-note">Se copiarán el formato y las columnas del año elegido, pero la hoja nueva empezará vacía.</p><div className="modal-actions"><button type="button" className="button-quiet" disabled={creatingYear} onClick={()=>setShowYearCreator(false)}>Cancelar</button><button className="button-primary" disabled={creatingYear||!templateYear}>{creatingYear?'Creando…':'Crear año'}<Check size={16}/></button></div></form></section></div>}
  </main>
}



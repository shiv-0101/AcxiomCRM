import { useEffect, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { BarChart3, Bell, Building2, CalendarClock, ChevronRight, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Target, TrendingUp, Users, X } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { authApi, customersApi, dashboardApi, followUpsApi, leadsApi, opportunitiesApi } from './api/client'
import { useAuth } from './contexts/AuthContext'
import type { Customer, DashboardData, FollowUp, Lead, Opportunity } from './types'
import './App.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

type Section = 'dashboard' | 'customers' | 'leads' | 'opportunities' | 'followups'
type RecordItem = Customer | Lead | Opportunity | FollowUp
type FormState = { name: string; email: string; phone: string; amount: string; probability: string; date: string; subject: string }

const sectionMeta: Record<Section, { label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { label: 'Overview', icon: LayoutDashboard },
  customers: { label: 'Customers', icon: Building2 },
  leads: { label: 'Leads', icon: Target },
  opportunities: { label: 'Opportunities', icon: CircleDollarSign },
  followups: { label: 'Follow-ups', icon: CalendarClock },
}

const emptyForm: FormState = { name: '', email: '', phone: '', amount: '', probability: '20', date: '', subject: '' }
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
const today = () => new Date().toISOString().slice(0, 10)

function App() {
  const { isAuthenticated, user, login, logout } = useAuth()
  const [section, setSection] = useState<Section>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [editing, setEditing] = useState<RecordItem | undefined>()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    setLoading(true)
    dashboardApi.getDashboard().then(({ data }) => setDashboard(data.data)).catch(() => toast.error('Could not load the dashboard.')).finally(() => setLoading(false))
  }, [isAuthenticated, reloadTick])

  useEffect(() => {
    if (!isAuthenticated || section === 'dashboard') return
    setLoading(true)
    const api = section === 'customers' ? customersApi : section === 'leads' ? leadsApi : section === 'opportunities' ? opportunitiesApi : followUpsApi
    api.list({ ...(query ? { search: query } : {}), limit: 50 }).then(({ data }) => setRecords(data.data || [])).catch(() => toast.error(`Could not load ${sectionMeta[section].label.toLowerCase()}.`)).finally(() => setLoading(false))
  }, [isAuthenticated, section, query, reloadTick])

  if (!isAuthenticated) return <LoginScreen onLogin={login} />

  const refresh = () => setReloadTick((value) => value + 1)
  const selectSection = (next: Section) => { setSection(next); setQuery(''); setSidebarOpen(false); setEditing(undefined); setShowCreate(false) }
  const openCreate = () => { setEditing(undefined); setShowCreate(true) }

  return <div className="app-shell">
    <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>acxiom</strong><span>CRM workspace</span></div></div>
      <nav><p className="nav-caption">Workspace</p>{(Object.keys(sectionMeta) as Section[]).map((key) => { const item = sectionMeta[key]; const Icon = item.icon; return <button key={key} className={`nav-item ${section === key ? 'active' : ''}`} onClick={() => selectSection(key)}><Icon size={18} /><span>{item.label}</span>{section === key && <ChevronRight size={15} className="nav-arrow" />}</button> })}<p className="nav-caption">Manage</p><button className="nav-item" onClick={() => toast('Settings are ready for workspace configuration.')}><Settings size={18} /><span>Settings</span></button></nav>
      <div className="sidebar-bottom"><div className="avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div><div className="user-copy"><strong>{user?.firstName} {user?.lastName}</strong><span>{user?.role}</span></div><button className="icon-button" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={17} /></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumbs"><span>AxiomCRM</span><ChevronRight size={14} /><strong>{sectionMeta[section].label}</strong></div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications" title="Notifications"><Bell size={18} /><i /></button><div className="topbar-user">{user?.firstName} {user?.lastName}</div></div></header><div className="content">{section === 'dashboard' ? <DashboardView data={dashboard} loading={loading} onNavigate={selectSection} /> : <RecordsView section={section} records={records} loading={loading} query={query} onQuery={setQuery} onCreate={openCreate} onEdit={(record) => { setEditing(record); setShowCreate(true) }} onDelete={async (record) => { await deactivateRecord(section, record); refresh() }} />}</div></main>
    {showCreate && section !== 'dashboard' && <RecordModal section={section} record={editing} onClose={() => { setShowCreate(false); setEditing(undefined) }} onSaved={() => { setShowCreate(false); setEditing(undefined); refresh() }} />}
  </div>
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<boolean> }) {
  const [registering, setRegistering] = useState(false)
  const [username, setUsername] = useState('admin'); const [password, setPassword] = useState('Admin@123'); const [email, setEmail] = useState(''); const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { if (registering) { await authApi.register({ username, email, password, firstName, lastName, roleId: 'role-sales' }); toast.success('Registration complete. Sign in to continue.'); setRegistering(false) } else await onLogin(username, password) } catch (error: any) { toast.error(error.response?.data?.message || 'Request failed. Please try again.') } finally { setBusy(false) } }
  return <div className="login-page"><div className="login-art"><div className="art-grid" /><div className="login-brand"><div className="brand-mark">A</div><span>acxiom</span></div><div className="art-copy"><p className="eyebrow">Revenue operations, clarified</p><h1>Make every customer conversation count.</h1><p>One focused workspace for relationships, pipeline, and the next best action.</p></div><div className="art-stat"><TrendingUp size={17} /><span>Pipeline visibility<br /><strong>across every stage</strong></span></div></div><form className="login-card" onSubmit={submit}><div><p className="eyebrow">{registering ? 'Create account' : 'Welcome back'}</p><h2>{registering ? 'Join your workspace' : 'Sign in to your workspace'}</h2><p className="muted">{registering ? 'New accounts are created with SalesExecutive access.' : 'Use a seeded demo account or your configured account.'}</p></div>{registering && <><label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label><label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label></>}<label>Username or email<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} minLength={8} required /></label><button className="primary-button login-button" disabled={busy}>{busy ? 'Please wait...' : registering ? 'Create account' : 'Enter workspace'}<ChevronRight size={17} /></button>{!registering && <p className="demo-note">Demo: <strong>admin</strong> / <strong>Admin@123</strong></p>}<button type="button" className="text-button auth-toggle" onClick={() => setRegistering(!registering)}>{registering ? 'Already have an account? Sign in' : 'Need an account? Register'}</button></form></div>
}

function DashboardView({ data, loading, onNavigate }: { data: DashboardData | null; loading: boolean; onNavigate: (section: Section) => void }) {
  const kpis = data?.kpis; const items = data?.charts.opportunitiesByStage || []
  return <div className="page-enter"><div className="page-heading"><div><p className="eyebrow">Workspace overview</p><h1>Good to see you again.</h1><p className="muted">Here is the pulse of your customer relationships.</p></div><button className="primary-button" onClick={() => onNavigate('opportunities')}><Plus size={17} /> New opportunity</button></div>{loading && !data ? <div className="loading-state">Loading your workspace...</div> : <><section className="kpi-grid"><Kpi label="Total customers" value={kpis?.totalCustomers ?? 0} icon={<Users />} tone="blue" /><Kpi label="Open leads" value={kpis?.openLeads ?? 0} icon={<Target />} tone="orange" /><Kpi label="Pipeline value" value={money(kpis?.pipelineValue ?? 0)} icon={<CircleDollarSign />} tone="green" /><Kpi label="Follow-ups due" value={kpis?.pendingFollowUps ?? 0} icon={<CalendarClock />} tone="violet" /></section><section className="dashboard-grid"><div className="panel chart-panel"><div className="panel-heading"><div><h2>Opportunity pipeline</h2><p className="muted">Value by stage</p></div><button className="text-button" onClick={() => onNavigate('opportunities')}>View pipeline <ChevronRight size={15} /></button></div><div className="pipeline-chart"><Bar data={{ labels: items.map((item) => item.stage), datasets: [{ label: 'Pipeline value', data: items.map((item) => item.total_amount), backgroundColor: '#2f8581', borderRadius: 4, barThickness: 22 }] }} options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => money(Number(context.raw)) } } }, scales: { y: { beginAtZero: true, ticks: { callback: (value) => money(Number(value)) } }, x: { grid: { display: false } } } }} /></div><div className="chart-total"><span>Weighted forecast</span><strong>{money(kpis?.weightedPipelineValue ?? 0)}</strong></div></div><div className="panel followup-panel"><div className="panel-heading"><div><h2>Next up</h2><p className="muted">Your upcoming follow-ups</p></div><button className="icon-button" onClick={() => onNavigate('followups')} aria-label="View follow-ups"><ChevronRight size={17} /></button></div>{data?.recentFollowUps?.length ? data.recentFollowUps.map((item) => <div className="followup-item" key={item.follow_up_id}><div className="date-tile"><strong>{new Date(item.follow_up_date).getDate()}</strong><span>{new Date(item.follow_up_date).toLocaleDateString('en-IN', { month: 'short' })}</span></div><div><strong>{item.subject}</strong><span>{item.customer_name || item.lead_name || 'Unassigned record'} - {item.follow_up_type}</span></div></div>) : <div className="empty-state">No upcoming follow-ups.</div>}</div></section><section className="quick-actions"><QuickAction icon={<Building2 size={19} />} title="Explore customers" detail="Review relationship history" onClick={() => onNavigate('customers')} /><QuickAction icon={<ClipboardList size={19} />} title="Work your leads" detail="Move prospects forward" onClick={() => onNavigate('leads')} /><QuickAction icon={<BarChart3 size={19} />} title="Plan your week" detail="Stay ahead of commitments" onClick={() => onNavigate('followups')} /></section></>}</div>
}

function Kpi({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small><TrendingUp size={12} /> Healthy activity</small></div></div> }
function QuickAction({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <button onClick={onClick}>{icon}<span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={16} /></button> }

function RecordsView({ section, records, loading, query, onQuery, onCreate, onEdit, onDelete }: { section: Exclude<Section, 'dashboard'>; records: RecordItem[]; loading: boolean; query: string; onQuery: (value: string) => void; onCreate: () => void; onEdit: (record: RecordItem) => void; onDelete: (record: RecordItem) => void }) {
  return <div className="page-enter"><div className="page-heading"><div><p className="eyebrow">Workspace / {sectionMeta[section].label}</p><h1>{sectionMeta[section].label}</h1><p className="muted">Keep your {sectionMeta[section].label.toLowerCase()} moving with a clear next step.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} /> Add {section === 'followups' ? 'follow-up' : section.slice(0, -1)}</button></div><div className="toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Search ${sectionMeta[section].label.toLowerCase()}...`} /></div><span className="result-count">{records.length} records</span></div><div className="panel table-panel">{loading ? <div className="loading-state">Refreshing records...</div> : records.length === 0 ? <div className="empty-state"><Search size={24} /><strong>No records found</strong><span>Try a different search or create a new record.</span></div> : <RecordTable section={section} records={records} onEdit={onEdit} onDelete={onDelete} />}</div></div>
}

function RecordTable({ section, records, onEdit, onDelete }: { section: Exclude<Section, 'dashboard'>; records: RecordItem[]; onEdit: (record: RecordItem) => void; onDelete: (record: RecordItem) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Name / subject</th><th>{section === 'opportunities' ? 'Stage' : section === 'followups' ? 'Type' : 'Status'}</th><th>{section === 'opportunities' ? 'Value' : section === 'followups' ? 'Due date' : 'Owner'}</th><th>Created</th><th>Actions</th></tr></thead><tbody>{records.map((record) => { const item = record as any; const name = item.customer_name || item.lead_name || item.opportunity_name || item.subject; const state = item.status || item.stage || item.follow_up_type; const detail = section === 'opportunities' ? money(item.amount) : section === 'followups' ? dateLabel(item.follow_up_date) : item.owner_name || item.assigned_name || 'Unassigned'; const id = item.customer_id || item.lead_id || item.opportunity_id || item.follow_up_id; return <tr key={id}><td><strong>{name}</strong><span>{item.company_name || item.email || item.customer_name || item.lead_name || '-'}</span></td><td><span className={`status status-${String(state).toLowerCase().replaceAll(' ', '-')}`}>{state}</span></td><td>{detail}</td><td className="date-cell">{dateLabel(item.created_date)}</td><td><button className="table-action" onClick={() => onEdit(record)}>Edit</button><button className="table-action danger" onClick={() => onDelete(record)}>Deactivate</button></td></tr> })}</tbody></table></div>
}

async function deactivateRecord(section: Exclude<Section, 'dashboard'>, record: RecordItem) {
  const item = record as any; const id = item.customer_id || item.lead_id || item.opportunity_id || item.follow_up_id
  if (!window.confirm('Deactivate this record?')) return
  if (section === 'customers') await customersApi.delete(id)
  if (section === 'leads') await leadsApi.delete(id)
  if (section === 'opportunities') await opportunitiesApi.delete(id)
  if (section === 'followups') await followUpsApi.delete(id)
  toast.success('Record deactivated.')
}

function RecordModal({ section, record, onClose, onSaved }: { section: Exclude<Section, 'dashboard'>; record?: RecordItem; onClose: () => void; onSaved: () => void }) {
  const existing = record as any
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm, name: existing?.customer_name || existing?.lead_name || existing?.opportunity_name || '', email: existing?.email || '', phone: existing?.phone || '', amount: existing?.amount ? String(existing.amount) : '', probability: existing?.probability ? String(existing.probability) : '20', date: existing?.expected_close_date || existing?.follow_up_date || '', subject: existing?.subject || '' }))
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const update = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const validate = () => { if (section === 'customers' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || !/^\d{10}$/.test(form.phone))) return 'Enter a valid email and 10-digit phone number.'; if (section === 'leads' && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email address.'; if (section === 'opportunities' && (Number(form.amount) <= 0 || Number(form.probability) < 0 || Number(form.probability) > 100)) return 'Amount must be greater than 0 and probability must be between 0 and 100.'; if ((section === 'opportunities' || section === 'followups') && form.date < today()) return 'The date cannot be before today.'; return '' }
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const validationError = validate(); if (validationError) { setError(validationError); return } setBusy(true); setError(''); try { const id = existing?.customer_id || existing?.lead_id || existing?.opportunity_id || existing?.follow_up_id; if (section === 'customers') { const payload = { customerName: form.name, email: form.email, phone: form.phone, status: 'Active' }; record ? await customersApi.update(id, payload) : await customersApi.create(payload) } if (section === 'leads') { const payload = { leadName: form.name, email: form.email || undefined, phone: form.phone || undefined, status: existing?.status || 'New', priority: existing?.priority || 'Medium' }; record ? await leadsApi.update(id, payload) : await leadsApi.create(payload) } if (section === 'opportunities') { const payload = { opportunityName: form.name, amount: Number(form.amount), probability: Number(form.probability), expectedCloseDate: form.date, stage: existing?.stage || 'Qualification', status: existing?.status || 'Open' }; record ? await opportunitiesApi.update(id, payload) : await opportunitiesApi.create(payload) } if (section === 'followups') { const payload = { subject: form.subject, followUpDate: form.date, followUpType: existing?.follow_up_type || 'Call', status: existing?.status || 'Planned' }; record ? await followUpsApi.update(id, payload) : await followUpsApi.create(payload) } toast.success(record ? 'Record updated.' : 'Record created.'); onSaved() } catch (requestError: any) { setError(requestError.response?.data?.message || 'Could not save this record.') } finally { setBusy(false) } }
  const followup = section === 'followups'; const opportunity = section === 'opportunities'; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-heading"><div><p className="eyebrow">{record ? 'Update record' : 'New record'}</p><h2>{record ? 'Edit' : 'Add'} {followup ? 'follow-up' : section.slice(0, -1)}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{error && <div className="form-error" role="alert">{error}</div>}<label>{followup ? 'Subject' : 'Name'}<input autoFocus value={followup ? form.subject : form.name} onChange={followup ? update('subject') : update('name')} required /></label>{!followup && <><label>Email<input type="email" value={form.email} onChange={update('email')} required={!opportunity} /></label><label>Phone<input inputMode="numeric" pattern="[0-9]{10}" value={form.phone} onChange={update('phone')} required={section === 'customers'} placeholder="10 digit number" /></label></>}{opportunity && <><label>Amount<input type="number" min="1" value={form.amount} onChange={update('amount')} required /></label><label>Probability (%)<input type="number" min="0" max="100" value={form.probability} onChange={update('probability')} required /></label></>}{(followup || opportunity) && <label>{opportunity ? 'Expected close date' : 'Follow-up date'}<input type="date" min={today()} value={form.date} onChange={update('date')} required /></label>}{!followup && !opportunity && <label>Notes<input value={form.date} onChange={update('date')} placeholder="Optional context" /></label>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : record ? 'Save changes' : 'Create record'}</button></div></form></div>
}

export default App

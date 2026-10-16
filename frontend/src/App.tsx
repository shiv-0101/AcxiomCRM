import { useEffect, useState } from 'react'
import { BarChart3, Bell, Building2, CalendarClock, ChevronRight, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Target, TrendingUp, Users, X } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { customersApi, dashboardApi, followUpsApi, leadsApi, opportunitiesApi } from './api/client'
import { useAuth } from './contexts/AuthContext'
import type { Customer, DashboardData, FollowUp, Lead, Opportunity } from './types'
import './App.css'

type Section = 'dashboard' | 'customers' | 'leads' | 'opportunities' | 'followups'

const sectionMeta: Record<Section, { label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { label: 'Overview', icon: LayoutDashboard },
  customers: { label: 'Customers', icon: Building2 },
  leads: { label: 'Leads', icon: Target },
  opportunities: { label: 'Opportunities', icon: CircleDollarSign },
  followups: { label: 'Follow-ups', icon: CalendarClock },
}

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function App() {
  const { isAuthenticated, user, login, logout } = useAuth()
  const [section, setSection] = useState<Section>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [records, setRecords] = useState<Array<Customer | Lead | Opportunity | FollowUp>>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    setLoading(true)
    dashboardApi.getDashboard()
      .then(({ data }) => setDashboard(data.data))
      .catch(() => toast.error('Could not load your dashboard.'))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || section === 'dashboard') return
    setLoading(true)
    const api = section === 'customers' ? customersApi : section === 'leads' ? leadsApi : section === 'opportunities' ? opportunitiesApi : followUpsApi
    api.list({ ...(query ? { search: query } : {}), limit: 50 })
      .then(({ data }) => setRecords(data.data || []))
      .catch(() => toast.error(`Could not load ${sectionMeta[section].label.toLowerCase()}.`))
      .finally(() => setLoading(false))
  }, [isAuthenticated, section, query, reloadTick])

  if (!isAuthenticated) return <LoginScreen onLogin={login} />

  const selectSection = (next: Section) => { setSection(next); setQuery(''); setSidebarOpen(false); setShowCreate(false) }

  return (
    <div className="app-shell">
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">A</div><div><strong>acxiom</strong><span>CRM workspace</span></div></div>
        <nav>
          <p className="nav-caption">Workspace</p>
          {(Object.keys(sectionMeta) as Section[]).map((key) => { const item = sectionMeta[key]; const Icon = item.icon; return <button key={key} className={`nav-item ${section === key ? 'active' : ''}`} onClick={() => selectSection(key)}><Icon size={18} /><span>{item.label}</span>{section === key && <ChevronRight size={15} className="nav-arrow" />}</button> })}
          <p className="nav-caption">Manage</p>
          <button className="nav-item" onClick={() => toast('Settings are ready for your next workspace configuration.')}><Settings size={18} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div><div className="user-copy"><strong>{user?.firstName} {user?.lastName}</strong><span>{user?.role}</span></div><button className="icon-button" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={17} /></button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumbs"><span>AcxiomCRM</span><ChevronRight size={14} /><strong>{sectionMeta[section].label}</strong></div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications" title="Notifications"><Bell size={18} /><i /></button><div className="topbar-user">{user?.firstName} {user?.lastName}</div></div></header>
        <div className="content">
          {section === 'dashboard' ? <DashboardView data={dashboard} loading={loading} onNavigate={selectSection} /> : <RecordsView section={section} records={records} loading={loading} query={query} onQuery={setQuery} onCreate={() => setShowCreate(true)} />}
        </div>
      </main>
      {showCreate && section !== 'dashboard' && <CreateModal section={section} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); setReloadTick((tick) => tick + 1); toast.success(`${sectionMeta[section].label.slice(0, -1)} created`) }} />}
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<boolean> }) {
  const [username, setUsername] = useState('admin'); const [password, setPassword] = useState('Admin@123'); const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); await onLogin(username, password); setBusy(false) }
  return <div className="login-page"><div className="login-art"><div className="art-grid" /><div className="login-brand"><div className="brand-mark">A</div><span>acxiom</span></div><div className="art-copy"><p className="eyebrow">Revenue operations, clarified</p><h1>Make every customer conversation count.</h1><p>One focused workspace for relationships, pipeline, and the next best action.</p></div><div className="art-stat"><TrendingUp size={17} /><span>Pipeline visibility<br /><strong>across every stage</strong></span></div></div><form className="login-card" onSubmit={submit}><div><p className="eyebrow">Welcome back</p><h2>Sign in to your workspace</h2><p className="muted">Use a seeded demo account or your configured account.</p></div><label>Username or email<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label><button className="primary-button login-button" disabled={busy}>{busy ? 'Signing in…' : 'Enter workspace'}<ChevronRight size={17} /></button><p className="demo-note">Demo: <strong>admin</strong> / <strong>Admin@123</strong></p></form></div>
}

function DashboardView({ data, loading, onNavigate }: { data: DashboardData | null; loading: boolean; onNavigate: (section: Section) => void }) {
  const kpis = data?.kpis
  return <div className="page-enter"><div className="page-heading"><div><p className="eyebrow">Friday, {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p><h1>Good to see you again.</h1><p className="muted">Here’s the pulse of your customer relationships.</p></div><button className="primary-button" onClick={() => onNavigate('opportunities')}><Plus size={17} /> New opportunity</button></div>{loading && !data ? <div className="loading-state">Loading your workspace…</div> : <><section className="kpi-grid"><Kpi label="Total customers" value={kpis?.totalCustomers ?? 0} icon={<Users />} tone="blue" /><Kpi label="Open leads" value={kpis?.openLeads ?? 0} icon={<Target />} tone="orange" /><Kpi label="Pipeline value" value={money(kpis?.pipelineValue ?? 0)} icon={<CircleDollarSign />} tone="green" /><Kpi label="Follow-ups due" value={kpis?.pendingFollowUps ?? 0} icon={<CalendarClock />} tone="violet" /></section><section className="dashboard-grid"><div className="panel chart-panel"><div className="panel-heading"><div><h2>Opportunity pipeline</h2><p className="muted">Value by stage</p></div><button className="text-button" onClick={() => onNavigate('opportunities')}>View pipeline <ChevronRight size={15} /></button></div><div className="bar-chart">{(data?.charts.opportunitiesByStage || []).map((item) => { const max = Math.max(...(data?.charts.opportunitiesByStage || []).map((entry) => entry.total_amount), 1); return <div className="bar-row" key={item.stage}><span>{item.stage}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, item.total_amount / max * 100)}%` }} /></div><strong>{money(item.total_amount)}</strong></div> })}</div><div className="chart-total"><span>Weighted forecast</span><strong>{money(kpis?.weightedPipelineValue ?? 0)}</strong></div></div><div className="panel followup-panel"><div className="panel-heading"><div><h2>Next up</h2><p className="muted">Your upcoming follow-ups</p></div><button className="icon-button" onClick={() => onNavigate('followups')} aria-label="View follow-ups"><ChevronRight size={17} /></button></div>{data?.recentFollowUps?.length ? data.recentFollowUps.map((item) => <div className="followup-item" key={item.follow_up_id}><div className="date-tile"><strong>{new Date(item.follow_up_date).getDate()}</strong><span>{new Date(item.follow_up_date).toLocaleDateString('en-IN', { month: 'short' })}</span></div><div><strong>{item.subject}</strong><span>{item.customer_name || item.lead_name || 'Unassigned record'} · {item.follow_up_type}</span></div></div>) : <div className="empty-state">No upcoming follow-ups.</div>}</div></section><section className="quick-actions"><button onClick={() => onNavigate('customers')}><Building2 size={19} /><span><strong>Explore customers</strong><small>Review relationship history</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate('leads')}><ClipboardList size={19} /><span><strong>Work your leads</strong><small>Move prospects forward</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate('followups')}><BarChart3 size={19} /><span><strong>Plan your week</strong><small>Stay ahead of commitments</small></span><ChevronRight size={16} /></button></section></>}</div>
}

function Kpi({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small><TrendingUp size={12} /> Healthy activity</small></div></div> }

function RecordsView({ section, records, loading, query, onQuery, onCreate }: { section: Exclude<Section, 'dashboard'>; records: Array<Customer | Lead | Opportunity | FollowUp>; loading: boolean; query: string; onQuery: (value: string) => void; onCreate: () => void }) {
  return <div className="page-enter"><div className="page-heading"><div><p className="eyebrow">Workspace / {sectionMeta[section].label}</p><h1>{sectionMeta[section].label}</h1><p className="muted">Keep your {sectionMeta[section].label.toLowerCase()} moving with a clear next step.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} /> Add {section === 'followups' ? 'follow-up' : section.slice(0, -1)}</button></div><div className="toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={`Search ${sectionMeta[section].label.toLowerCase()}…`} /></div><span className="result-count">{records.length} records</span></div><div className="panel table-panel">{loading ? <div className="loading-state">Refreshing records…</div> : records.length === 0 ? <div className="empty-state"><Search size={24} /><strong>No records found</strong><span>Try a different search or create a new record.</span></div> : <RecordTable section={section} records={records} />}</div></div>
}

function RecordTable({ section, records }: { section: Exclude<Section, 'dashboard'>; records: Array<Customer | Lead | Opportunity | FollowUp> }) {
  return <div className="table-wrap"><table><thead><tr><th>Name / subject</th><th>{section === 'opportunities' ? 'Stage' : section === 'followups' ? 'Type' : 'Status'}</th><th>{section === 'opportunities' ? 'Value' : section === 'followups' ? 'Due date' : 'Owner'}</th><th>Created</th></tr></thead><tbody>{records.map((record) => { const item = record as any; const name = item.customer_name || item.lead_name || item.opportunity_name || item.subject; const state = item.status || item.stage || item.follow_up_type; const detail = section === 'opportunities' ? money(item.amount) : section === 'followups' ? dateLabel(item.follow_up_date) : item.owner_name || item.assigned_name || 'Unassigned'; return <tr key={item.customer_id || item.lead_id || item.opportunity_id || item.follow_up_id}><td><strong>{name}</strong><span>{item.company_name || item.email || item.customer_name || item.lead_name || '—'}</span></td><td><span className={`status status-${String(state).toLowerCase().replaceAll(' ', '-')}`}>{state}</span></td><td>{detail}</td><td className="date-cell">{dateLabel(item.created_date)}</td></tr> })}</tbody></table></div>
}

function CreateModal({ section, onClose, onCreated }: { section: Exclude<Section, 'dashboard'>; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ name: '', email: '', phone: '', amount: '', date: '', subject: '' }); const [busy, setBusy] = useState(false)
  const field = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { if (section === 'customers') await customersApi.create({ customerName: form.name, email: form.email, phone: form.phone, status: 'Active' }); if (section === 'leads') await leadsApi.create({ leadName: form.name, email: form.email, phone: form.phone, status: 'New', priority: 'Medium' }); if (section === 'opportunities') await opportunitiesApi.create({ opportunityName: form.name, amount: Number(form.amount), stage: 'Qualification', probability: 20, expectedCloseDate: form.date, status: 'Open' }); if (section === 'followups') await followUpsApi.create({ subject: form.subject, followUpDate: form.date, followUpType: 'Call', status: 'Planned' }); onCreated() } catch (error: any) { toast.error(error.response?.data?.message || 'Could not create this record.') } finally { setBusy(false) } }
  const isFollowup = section === 'followups'; const isOpp = section === 'opportunities'; return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-heading"><div><p className="eyebrow">New record</p><h2>Add {isFollowup ? 'follow-up' : section.slice(0, -1)}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><label>{isFollowup ? 'Subject' : 'Name'}<input autoFocus value={isFollowup ? form.subject : form.name} onChange={isFollowup ? field('subject') : field('name')} required /></label>{!isFollowup && <><label>Email<input type="email" value={form.email} onChange={field('email')} required={!isOpp} /></label><label>Phone<input inputMode="numeric" value={form.phone} onChange={field('phone')} required={section === 'customers'} placeholder="10 digit number" /></label></>}{isOpp && <label>Amount<input type="number" min="1" value={form.amount} onChange={field('amount')} required /></label>}<label>{isFollowup || isOpp ? isOpp ? 'Expected close date' : 'Follow-up date' : 'Notes'}{isFollowup || isOpp ? <input type="date" value={form.date} onChange={field('date')} required /> : <input value={form.date} onChange={field('date')} placeholder="Optional context" />}</label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create record'}</button></div></form></div>
}

export default App

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3, Command, CreditCard, Download, FileText, GraduationCap, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Upload, UserPlus, Users, Wallet, X } from 'lucide-react';
import { supabase, supabaseEnabled } from './supabase.js';
import './style.css';
import './responsive.css';

const navGroups = [
  { title: 'OVERVIEW', items: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Students', icon: GraduationCap, badge: '1,284' }, { label: 'Admissions', icon: UserPlus }, { label: 'Staff', icon: Users }, { label: 'Classes & subjects', icon: BookOpen }] },
  { title: 'ACADEMICS', items: [{ label: 'Attendance', icon: ClipboardCheck }, { label: 'Examinations', icon: FileText }, { label: 'Timetable', icon: CalendarDays }] },
  { title: 'SCHOOL LIFE', items: [{ label: 'Fees & payments', icon: Wallet }, { label: 'Announcements', icon: Bell }] },
];

const payments = [
  { name: 'Amara Okafor', detail: 'JSS 2A · Tuition fee', amount: '₦ 185,000', date: 'Today, 10:42 AM', status: 'Paid', initials: 'AO', color: 'teal' },
  { name: 'Daniel Mensah', detail: 'SSS 1B · Exam fee', amount: '₦ 42,500', date: 'Today, 9:18 AM', status: 'Pending', initials: 'DM', color: 'blue' },
  { name: 'Zainab Bello', detail: 'JSS 3A · Tuition fee', amount: '₦ 75,000', date: 'Yesterday', status: 'Partial', initials: 'ZB', color: 'amber' },
  { name: 'Tomi Adeyemi', detail: 'SSS 2A · Development levy', amount: '₦ 30,000', date: 'Yesterday', status: 'Paid', initials: 'TA', color: 'rose' },
];
const DEMO_PASSWORD = 'SchoolDemo2026!';
const roleTitles = { school_admin: 'School administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent / guardian', bursar: 'Accountant / bursar', librarian: 'Librarian' };

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`The API returned an empty response (HTTP ${response.status}). The server may be restarting; wait a few seconds and try again. If this keeps happening, check that the API is running on port 3001.`);
  }
  if (!contentType.includes('application/json')) {
    const detail = response.status === 404
      ? 'The API endpoint was not found.'
      : 'The request reached the web page instead of the API.';
    throw new Error(`${detail} Start the app with “npm run dev” and open the Vite address it prints (usually http://localhost:5173). The API should be running on port 3001.`);
  }
  let payload;
  try { payload = JSON.parse(body); }
  catch { throw new Error(`The API returned an invalid response (HTTP ${response.status}). Please retry; if it repeats, check the API server terminal for its error.`); }
  if (!response.ok) throw new Error(payload.message || fallbackMessage);
  return payload;
}

function App() {
  const [data, setData] = useState({ school: { name: 'Northstar Academy', session: '2026/2027', term: 'First term' }, students: [], classes: [], subjects: [] });
  const [auth, setAuth] = useState(() => { if (supabaseEnabled) return null; try { return JSON.parse(localStorage.getItem('ssms-session') || 'null'); } catch { return null; } });
  const [route, setRoute] = useState(window.location.pathname);
  const [active, setActive] = useState('Dashboard');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [parentLinkStudent, setParentLinkStudent] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', className: 'JSS 1A', guardian: '' });
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 10, 1));

  useEffect(() => {
    if (!auth || auth.user?.role !== 'school_admin') return;
    const loadDashboard = () => fetch('/api/dashboard', { headers: { Authorization: `Bearer ${auth.token}` } }).then(async r => { if (r.status === 401) throw new Error('Your session expired. Please sign in again.'); return r.json(); }).then(setData).catch(() => setNotice('Could not load school data. Please check that the API is running and sign in again.'));
    loadDashboard();
    if (!supabaseEnabled) return undefined;
    const channel = supabase.channel('school-admin-student-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, loadDashboard).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth]);
  useEffect(() => { const onPop = () => setRoute(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => {
    if (!supabaseEnabled) return undefined;
    let mounted = true;
    const applySession = async session => {
      if (!session) { if (mounted) setAuth(null); return; }
      try {
        const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!response.ok) { await supabase.auth.signOut(); if (mounted) setAuth(null); return; }
        const user = await response.json();
        if (mounted) setAuth({ token: session.access_token, user });
      } catch { if (mounted) setAuth(null); }
    };
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => applySession(session), 0));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  const filtered = useMemo(() => data.students.filter(s => `${s.name} ${s.id} ${s.className}`.toLowerCase().includes(search.toLowerCase())), [data.students, search]);
  const monthLabel = calendarDate.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const monthDays = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const monthOffset = (new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() + 6) % 7;
  const calendarCells = Array.from({ length: 42 }, (_, i) => i - monthOffset + 1);

  function navigate(path) {
    window.history.pushState({}, '', path);
    setRoute(path);
    setActive('Dashboard');
    window.scrollTo(0, 0);
  }
  async function signIn(email, password) {
    let token; let user;
    if (supabaseEnabled) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      token = data.session.access_token;
      const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      const profile = await response.json();
      if (!response.ok) { await supabase.auth.signOut(); throw new Error(profile.message || 'Your Supabase account needs a school profile.'); }
      user = profile;
    } else {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Sign-in failed.');
      token = result.token; user = result.user;
    }
    const session = { token, user };
    if (!supabaseEnabled) localStorage.setItem('ssms-session', JSON.stringify(session));
    setAuth(session);
    navigate(user.role === 'school_admin' ? '/dashboard' : '/portal');
  }
  async function signUpTeacher({fullName,email,password}) {
    if (!supabaseEnabled) throw new Error('Teacher sign-up requires the connected Supabase project.');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, requested_role: 'teacher' } } });
    if (error) throw error;
    if (data.session) {
      const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const profile = await response.json();
      if (!response.ok) throw new Error(profile.message || 'Teacher account created, but its school profile is not ready. Apply the latest signup migration.');
      setAuth({ token: data.session.access_token, user: profile });
      navigate('/portal');
    }
    return { confirmationRequired: !data.session };
  }
  async function signUpParent({fullName,email,password}) {
    if (!supabaseEnabled) throw new Error('Parent sign-up requires the connected Supabase project.');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, requested_role: 'parent' } } });
    if (error) throw error;
    if (data.session) {
      const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const profile = await response.json();
      if (!response.ok) throw new Error(profile.message || 'Parent account created, but its school profile is not ready. Apply the parent signup migration.');
      setAuth({ token: data.session.access_token, user: profile });
      navigate('/portal');
    }
    return { confirmationRequired: !data.session };
  }
  async function submitStudentApplication(application) {
    const response = await fetch('/api/student-applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(application) });
    return readApiResponse(response, 'Could not submit the student application.');
  }
  function signOut() {
    localStorage.removeItem('ssms-session');
    setAuth(null);
    navigate('/');
    if (supabaseEnabled) void supabase.auth.signOut({ scope: 'local' }).then(({ error }) => { if (error) console.warn('Could not revoke the current Supabase refresh token:', error.message); });
  }
  function exportStudents() {
    const rows = [['Name', 'Admission number', 'Class', 'Parent or guardian', 'Status'], ...filtered.map(s => [s.name, s.admissionNumber || s.id, s.className, s.guardian, s.status])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'northstar-students.csv'; link.click(); URL.revokeObjectURL(link.href);
    setNotice('Student list exported.'); window.setTimeout(() => setNotice(''), 2600);
  }

  async function addStudent(e) {
    e.preventDefault();
    const res = await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify(form) });
    const payload = await res.json();
    if (!res.ok) { setNotice(payload.message || 'Could not add student.'); return; }
    setData(d => ({ ...d, students: [payload, ...d.students] }));
    setForm({ name: '', className: 'JSS 1A', guardian: '' }); setModal(false); setNotice('Student added successfully.');
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function updateStudentStatus(id, status) {
    const res = await fetch(`/api/students/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ status }) });
    const payload = await res.json();
    if (!res.ok) { setNotice(payload.message || 'Could not update student.'); return false; }
    setData(d => ({ ...d, students: status === 'Archived' ? d.students.filter(s => s.id !== id) : d.students.some(s => s.id === id) ? d.students.map(s => s.id === id ? payload : s) : [payload, ...d.students] }));
    setNotice(status === 'Archived' ? 'Student archived. Their history is retained.' : 'Student status updated.');
    window.setTimeout(() => setNotice(''), 2600);
    return true;
  }

  async function linkParentToStudent(email) {
    const response = await fetch(`/api/students/${encodeURIComponent(parentLinkStudent.id)}/parent-link`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ email }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Could not link this parent account.');
    setParentLinkStudent(null);
    setNotice(payload.message || 'Parent account linked successfully.');
    window.setTimeout(() => setNotice(''), 3500);
  }

  if (route === '/') return <LandingPage onEnter={() => navigate('/login')} onTeacherSignup={() => navigate('/teacher-signup')} onParentSignup={() => navigate('/parent-signup')} onStudentRegistration={() => navigate('/student-registration')} />;
  if (route === '/teacher-signup') return <TeacherSignupPage onSubmit={signUpTeacher} onSignIn={() => navigate('/login')} onHome={() => navigate('/')} supabaseEnabled={supabaseEnabled} />;
  if (route === '/parent-signup') return <ParentSignupPage onSubmit={signUpParent} onSignIn={() => navigate('/login')} onHome={() => navigate('/')} supabaseEnabled={supabaseEnabled} />;
  if (route === '/student-registration') return <StudentRegistrationPage onSubmit={submitStudentApplication} onSignIn={() => navigate('/login')} onHome={() => navigate('/')} supabaseEnabled={supabaseEnabled} />;
  if (route === '/login' || !auth) return <LoginPage onLogin={signIn} onHome={() => navigate('/')} onTeacherSignup={() => navigate('/teacher-signup')} onParentSignup={() => navigate('/parent-signup')} onStudentRegistration={() => navigate('/student-registration')} password={DEMO_PASSWORD} supabaseEnabled={supabaseEnabled} />;
  if (auth.user?.role !== 'school_admin' || route === '/portal') return <RolePortal auth={auth} onSignOut={signOut} />;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <button className="brand brand-button" onClick={() => navigate('/')}><div className="brand-mark"><Sparkles size={19} strokeWidth={2.4} /></div><span>northstar</span><span className="mobile-close icon-button" onClick={e => { e.stopPropagation(); setMenuOpen(false); }}><X size={18} /></span></button>
      <button className="school-switch" onClick={() => { setActive('Settings'); setMenuOpen(false); }}><div className="school-avatar">N</div><div className="school-copy"><strong>{data.school.name}</strong><span>School workspace</span></div><ChevronDown size={15} /></button>
      <div className="nav-scroll">{navGroups.map(group => <div className="nav-group" key={group.title}><div className="nav-title">{group.title}</div>{group.items.map(item => <button key={item.label} onClick={() => { if (item.label === 'Dashboard') navigate('/dashboard'); else setActive(item.label); setMenuOpen(false); }} className={`nav-item ${active === item.label ? 'nav-active' : ''}`}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.badge && <small>{data.students.length ? data.students.length.toLocaleString() : '0'}</small>}</button>)}</div>)}
        <div className="nav-group"><div className="nav-title">PREFERENCES</div><button className={`nav-item ${active === 'Settings' ? 'nav-active' : ''}`} onClick={() => setActive('Settings')}><Settings size={18} /><span>Settings</span></button><button className="nav-item" onClick={() => setNotice('Help centre: use the navigation to open a school module, or return to the dashboard for an overview.')}><CircleHelp size={18} /><span>Help centre</span></button></div>
      </div>
      <div className="sidebar-bottom"><button className="term-card" onClick={() => setActive('Settings')}><div className="term-icon"><CalendarDays size={16} /></div><div><strong>{data.school.term || 'First term'}</strong><span>{data.school.session || '2026/2027'} session</span></div><MoreHorizontal size={17} /></button><button className="profile" title="Sign out" onClick={signOut}><div className="profile-avatar">{auth.user.name.split(' ').map(word=>word[0]).slice(0,2).join('')}</div><div className="profile-copy"><strong>{auth.user.name}</strong><span>{roleTitles[auth.user.role]}</span></div><MoreHorizontal size={17} /></button></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><button className="icon-button" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><button className="plain-brand" onClick={() => navigate('/')}>northstar</button></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={15} /><strong>{active}</strong></div><div className="top-actions"><label className="search-box"><Search size={16} /><input aria-label="Search students" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><button className="top-icon" title="Notifications" aria-label="Notifications" onClick={() => setNotice('You’re all caught up. There are no new notifications.')}><Bell size={18} /><i /></button><div className="top-divider" /><button className="help-link" onClick={() => setNotice('Support: contact your school system administrator for account help.')}><CircleHelp size={17} /><span>Support</span></button></div></header>
      <div className="content">
        {active === 'Students' ? <><StudentDirectory students={filtered} search={search} onAdd={() => setModal(true)} onStatus={updateStudentStatus} onExport={exportStudents} onLinkParent={setParentLinkStudent} auth={auth} onNotice={setNotice} />{notice && <div className="notice directory-notice"><Check size={15}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}</> : active === 'Admissions' ? <AdmissionsReview auth={auth} onStudentCreated={student=>setData(current=>({...current,students:[student,...current.students.filter(row=>row.id!==student.id)]}))} /> : active === 'Staff' ? <TeacherAssignments auth={auth} /> : active === 'Examinations' ? <ResultsReview auth={auth} onBack={() => navigate('/dashboard')} /> : active === 'Fees & payments' ? <FeesWorkflow auth={auth} role={auth.user.role} mode='invoices' session={data.school.session||'2026/2027'} term={data.school.term||'First term'} /> : active !== 'Dashboard' ? <ModuleView active={active} data={data} notice={notice} onClearNotice={() => setNotice('')} onBack={() => navigate('/dashboard')} onExport={exportStudents} auth={auth} onClassCreated={item=>setData(current=>({...current,classes:[...current.classes,item.name]}))} onSubjectCreated={item=>setData(current=>({...current,subjects:[...current.subjects,item.name]}))} /> : <>
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot" /> SCHOOL OVERVIEW <span className="eyebrow-sep">/</span> {data.school.term?.toUpperCase()} {data.school.session}</div><h1>Good morning, Admin <span className="wave">✦</span></h1><p>Here’s what’s happening at your school today.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={exportStudents}><Download size={16} /> Export report</button><button className="button button-primary" onClick={() => setModal(true)}><Plus size={17} /> Add student</button></div></div>
        {notice && <div className="notice"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}
        <section className="metric-grid">
          <Metric label="Total students" value={data.students.length ? (1284 + data.students.length - 5).toLocaleString() : '—'} delta="8.2%" direction="up" note="vs. last term" icon={GraduationCap} tone="teal" spark={[28, 38, 32, 51, 42, 59, 55, 72, 64, 82, 77, 92]} />
          <Metric label="Teaching staff" value="86" delta="4.6%" direction="up" note="vs. last term" icon={Users} tone="blue" spark={[42, 48, 38, 57, 46, 61, 56, 72, 62, 76, 68, 86]} />
          <Metric label="Attendance today" value="94.8%" delta="1.4%" direction="up" note="vs. yesterday" icon={Activity} tone="amber" spark={[78, 68, 83, 74, 88, 70, 84, 75, 92, 81, 95, 90]} />
          <Metric label="Fees collected" value="₦ 18.4m" delta="2.1%" direction="down" note="vs. last month" icon={Wallet} tone="rose" spark={[86, 78, 90, 72, 76, 64, 80, 66, 74, 57, 68, 61]} />
        </section>
        <section className="middle-grid">
          <div className="panel attendance-panel"><div className="panel-heading"><div><h2>Attendance overview</h2><p>Daily attendance across all classes · sample data</p></div><span className="select-pill static-pill">This week <ChevronDown size={14} /></span></div><div className="chart-meta"><div><strong>94.8%</strong><span className="trend-positive"><ArrowUpRight size={14} /> 1.4%</span><small>average attendance</small></div><div className="chart-legend"><span><i className="legend-present" /> Present</span><span><i className="legend-absent" /> Absent</span></div></div><div className="chart"><div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-body"><div className="grid-lines"><i /><i /><i /><i /><i /></div><div className="bars">{[['Mon',92,8],['Tue',96,4],['Wed',89,11],['Thu',94,6],['Fri',87,13],['Sat',0,0],['Sun',0,0]].map(([day,present,absent]) => <div className="bar-col" key={day}><div className="bar-wrap">{present > 0 && <><div className="bar-present" style={{ height: `${present}%` }} /><div className="bar-absent" style={{ height: `${absent * 1.05}%` }} /></>}</div><span>{day}</span></div>)}</div></div></div></div>
          <div className="panel calendar-panel"><div className="panel-heading"><div><h2>School calendar</h2><p>Key dates & upcoming events · sample data</p></div><button className="more-button" aria-label="Open calendar" onClick={() => setActive('School calendar')}><MoreHorizontal size={19} /></button></div><div className="calendar-month"><strong>{monthLabel}</strong><div><button aria-label="Previous month" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><button aria-label="Next month" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}><ChevronRight size={16} /></button></div></div><div className="calendar-grid">{['M','T','W','T','F','S','S'].map((d,i)=><span className="cal-day-name" key={`${d}${i}`}>{d}</span>)}{calendarCells.map((day,i)=>{const valid=day>0&&day<=monthDays; const dateValue=valid?day:day<1?new Date(calendarDate.getFullYear(),calendarDate.getMonth(),day).getDate():day-monthDays; return <span key={i} className={`cal-date ${!valid?'faded':''} ${valid&&day===6&&calendarDate.getMonth()===10&&calendarDate.getFullYear()===2026?'today':''} ${valid&&[12,18,24].includes(day)?'event':''}`}>{dateValue}</span>})}</div><div className="event-list"><div className="event-row"><div className="event-date purple-date"><strong>12</strong><span>{calendarDate.toLocaleDateString('en',{month:'short'}).toUpperCase()}</span></div><div className="event-copy"><strong>Mid-term examinations</strong><span>All classes · 8:00 AM · sample event</span></div><span className="event-dot purple-dot" /></div><div className="event-row"><div className="event-date green-date"><strong>18</strong><span>{calendarDate.toLocaleDateString('en',{month:'short'}).toUpperCase()}</span></div><div className="event-copy"><strong>PTA meeting</strong><span>School hall · 10:30 AM · sample event</span></div><span className="event-dot green-dot" /></div></div><button className="text-link" onClick={() => setActive('School calendar')}>View full calendar <ArrowRight size={14} /></button></div>
        </section>
        <section className="bottom-grid"><div className="panel students-panel"><div className="panel-heading"><div><h2>Recently added students</h2><p>Latest student registrations</p></div><button className="text-link" onClick={() => setActive('Students')}>View all <ArrowRight size={14} /></button></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>CLASS</th><th>GUARDIAN</th><th>STATUS</th><th></th></tr></thead><tbody>{(filtered.length ? filtered.slice(0,5) : []).map((s,i)=><tr key={s.id}><td><div className="student-cell"><div className={`student-avatar av-${i%5}`}>{s.name.split(' ').map(p=>p[0]).slice(0,2).join('')}</div><strong>{s.name}</strong></div></td><td className="id-cell">{s.id}</td><td>{s.className}</td><td>{s.guardian}</td><td><span className={`status ${s.status==='Active'?'status-active':'status-pending'}`}><i />{s.status}</span></td><td><button className="row-more" aria-label={`View ${s.name} in student directory`} onClick={() => setActive('Students')}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-state">{search?'No students match your search.':'Loading student records…'}</div>}</div></div>
          <div className="panel payments-panel"><div className="panel-heading"><div><h2>Recent payments</h2><p>Latest fee transactions · sample data</p></div><button className="more-button" aria-label="Open fees and payments" onClick={() => setActive('Fees & payments')}><MoreHorizontal size={19} /></button></div><div className="payment-list">{payments.map(p=><div className="payment-row" key={p.name}><div className={`payment-avatar ${p.color}`}>{p.initials}</div><div className="payment-copy"><strong>{p.name}</strong><span>{p.detail}</span></div><div className="payment-right"><strong>{p.amount}</strong><span className={`payment-status ${p.status.toLowerCase()}`}>{p.status}</span></div></div>)}</div><button className="payments-link" onClick={() => setActive('Fees & payments')}>View all transactions <ArrowRight size={14} /></button></div></section>
        <footer><span>© 2026 Northstar Academy</span><span><ShieldCheck size={14} /> Your school data is secure</span><span>Built for better learning <span className="footer-heart">♥</span></span></footer>
        </>}
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><form className="modal" onSubmit={addStudent}><div className="modal-title"><div><h2>Add a student</h2><p>Create a new student record for your school.</p></div><button type="button" className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div><label>Student full name<input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Ada Okonkwo" required /></label><label>Class<select value={form.className} onChange={e=>setForm({...form,className:e.target.value})}>{(data.classes.length?data.classes:['JSS 1A','JSS 1B','JSS 2A','JSS 2B','JSS 3A','SSS 1A','SSS 1B','SSS 2A','SSS 3A']).map(c=><option key={c}>{c}</option>)}</select></label><label>Parent / guardian<input value={form.guardian} onChange={e=>setForm({...form,guardian:e.target.value})} placeholder="Guardian name" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setModal(false)}>Cancel</button><button className="button button-primary" type="submit"><Plus size={16}/> Create student</button></div></form></div>}
    {parentLinkStudent && <LinkParentModal student={parentLinkStudent} onClose={() => setParentLinkStudent(null)} onSubmit={linkParentToStudent} />}
  </div>;
}

function LinkParentModal({student,onClose,onSubmit}) {
  const [email,setEmail]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  async function submit(event){event.preventDefault();setSaving(true);setError('');try{await onSubmit(email)}catch(err){setError(err.message)}finally{setSaving(false)}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><form className="modal" onSubmit={submit}><div className="modal-title"><div><h2>Link a parent account</h2><p>Connect an existing parent login to {student.name}.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div><label>Parent account email<input autoFocus type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="parent@example.com" required/></label><p className="link-parent-help">The account must already exist in Supabase Authentication and have the Parent role.</p>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}><UserPlus size={16}/>{saving?'Linking…':'Link parent'}</button></div></form></div>;
}

function Metric({label,value,delta,direction,note,icon:Icon,tone,spark}){return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-bottom"><div className="metric-change"><span className={direction==='up'?'change-up':'change-down'}>{direction==='up'?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {delta}</span><span>{note}</span></div><div className={`sparkline ${tone}`}>{spark.map((v,i)=><i key={i} style={{height:`${v}%`}}/>)}</div></div></div>}

const demoAccounts = [
  ['school_admin','Admin Officer','admin@northstar.demo'],['teacher','Samuel Adeola','teacher@northstar.demo'],['student','Amara Okafor','student@northstar.demo'],['parent','Chika Okafor','parent@northstar.demo'],['bursar','Rose Eze','bursar@northstar.demo'],['librarian','Peter Akin','librarian@northstar.demo'],
];

function LoginPage({onLogin,onHome,onTeacherSignup,onParentSignup,onStudentRegistration,password,supabaseEnabled=false}) {
  const [email,setEmail]=useState(supabaseEnabled?'':'admin@northstar.demo');
  const [secret,setSecret]=useState(supabaseEnabled?'':password);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function submit(event){event.preventDefault();setLoading(true);setError('');try{await onLogin(email,secret)}catch(err){setError(err.message)}finally{setLoading(false)}}
  return <main className="auth-page"><div className="auth-brand-row"><button className="landing-brand" onClick={onHome}><span className="brand-mark"><Sparkles size={18}/></span><span>northstar</span></button><span className="demo-label">{supabaseEnabled?'SCHOOL ACCOUNT':'DEMO WORKSPACE'}</span></div><div className="auth-layout"><section className="auth-intro"><span className="hero-badge"><span/> SECURE SCHOOL WORKSPACE</span><h1>A better day starts with a clearer view.</h1><p>Sign in to the portal built for your role in the school community.</p><div className="auth-intro-note"><ShieldCheck size={17}/><span>Each account opens its own role-based workspace.</span></div></section><section className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><Command size={18}/></span><h2>Welcome back</h2><p>{supabaseEnabled?'Sign in with your school account.':'Choose your demo role to continue.'}</p></div><form onSubmit={submit}>{supabaseEnabled?<><label className="auth-label" htmlFor="account-email">Email address</label><input className="auth-input" id="account-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/><label className="auth-label password-label" htmlFor="demo-password">Password</label><input className="auth-input" id="demo-password" type="password" autoComplete="current-password" value={secret} onChange={e=>setSecret(e.target.value)} required/></>:<><label className="auth-label">Choose a portal</label><div className="role-picker">{demoAccounts.map(([role,name,accountEmail])=><button type="button" key={role} className={`role-option ${email===accountEmail?'selected':''}`} onClick={()=>setEmail(accountEmail)}><span className="role-option-icon">{role==='student'?<GraduationCap size={15}/>:role==='parent'?<Users size={15}/>:role==='teacher'?<BookOpen size={15}/>:role==='school_admin'?<ShieldCheck size={15}/>:role==='bursar'?<Wallet size={15}/>:<FileText size={15}/>}</span><span><strong>{roleTitles[role]}</strong><small>{name}</small></span>{email===accountEmail&&<Check size={15}/>}</button>)}</div><label className="auth-label password-label" htmlFor="demo-password">Demo password</label><input className="auth-input" id="demo-password" type="password" autoComplete="current-password" value={secret} onChange={e=>setSecret(e.target.value)} required/><div className="demo-hint"><span>Demo password:</span><code>{password}</code></div></>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading?'Signing in…':'Sign in to portal'} <ArrowRight size={15}/></button></form><div className="auth-security"><ShieldCheck size={14}/>{supabaseEnabled?'Authentication secured by Supabase.':'Demo accounts use sample school records.'}</div>{supabaseEnabled&&<div className="auth-registration-links"><button onClick={onTeacherSignup}>Teacher? Create an account</button><button onClick={onParentSignup}>Parent/guardian? Create an account</button><button onClick={onStudentRegistration}>New student? Start registration</button></div>}</section></div><footer className="auth-footer"><span>© 2026 Northstar Academy</span><button onClick={onHome}>Back to home</button></footer></main>;
}

function TeacherSignupPage({onSubmit,onSignIn,onHome,supabaseEnabled}) {
  const [fullName,setFullName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirmPassword,setConfirmPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function submit(event){event.preventDefault();setError('');setMessage('');if(password.length<8){setError('Use a password with at least 8 characters.');return}if(password!==confirmPassword){setError('The passwords do not match.');return}setBusy(true);try{const result=await onSubmit({fullName,email,password});if(result?.confirmationRequired)setMessage('Your teacher account is created. Check your email to confirm it. Once confirmed, an administrator can assign your classes and subjects.')}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <main className="auth-page"><div className="auth-brand-row"><button className="landing-brand" onClick={onHome}><span className="brand-mark"><Sparkles size={18}/></span><span>northstar</span></button><button className="landing-signin" onClick={onSignIn}>Sign in</button></div><div className="public-form-layout"><section className="public-form-intro"><span className="hero-badge"><span/> TEACHER ACCOUNT</span><h1>Join your school’s teaching workspace.</h1><p>Register your account, then the school administrator will assign your classes and subjects.</p></section><form className="auth-card public-form-card" onSubmit={submit}><div className="auth-card-heading"><span className="auth-icon"><BookOpen size={18}/></span><h2>Teacher sign up</h2><p>Use your school email address.</p></div>{!supabaseEnabled&&<div className="auth-error">Connect Supabase to enable teacher account registration.</div>}<label className="auth-label">Full name<input className="auth-input" autoComplete="name" value={fullName} onChange={event=>setFullName(event.target.value)} required maxLength={120}/></label><label className="auth-label">Email address<input className="auth-input" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required maxLength={254}/></label><label className="auth-label">Password<input className="auth-input" type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8}/></label><label className="auth-label">Confirm password<input className="auth-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} required minLength={8}/></label>{message&&<div className="notice">{message}</div>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={busy||!supabaseEnabled}>{busy?'Creating account…':'Create teacher account'} <ArrowRight size={15}/></button><p className="public-form-footnote">A teacher account starts without class access. Admin assignment is required before student records or results are available.</p></form></div><footer className="auth-footer"><span>© 2026 Northstar Academy</span><button onClick={onHome}>Back to home</button></footer></main>;
}

function ParentSignupPage({onSubmit,onSignIn,onHome,supabaseEnabled}) {
  const [fullName,setFullName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirmPassword,setConfirmPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function submit(event){event.preventDefault();setError('');setMessage('');if(password.length<8){setError('Use a password with at least 8 characters.');return}if(password!==confirmPassword){setError('The passwords do not match.');return}setBusy(true);try{const result=await onSubmit({fullName,email,password});if(result?.confirmationRequired)setMessage('Parent account created. Confirm your email, then ask the school administrator to link your account to your child.')}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <main className="auth-page"><div className="auth-brand-row"><button className="landing-brand" onClick={onHome}><span className="brand-mark"><Sparkles size={18}/></span><span>northstar</span></button><button className="landing-signin" onClick={onSignIn}>Sign in</button></div><div className="public-form-layout"><section className="public-form-intro parent-signup-intro"><span className="hero-badge"><span/> FAMILY PORTAL</span><h1>Stay connected to your child’s school life.</h1><p>Create a parent account so the school can securely connect your portal to your child’s student record.</p><div className="auth-intro-note"><ShieldCheck size={17}/><span>Your child’s information appears after the school links your account.</span></div></section><form className="auth-card public-form-card" onSubmit={submit}><div className="auth-card-heading"><span className="auth-icon"><Users size={18}/></span><h2>Parent sign up</h2><p>Register with the email address you gave the school.</p></div>{!supabaseEnabled&&<div className="auth-error">Connect Supabase to enable parent account registration.</div>}<label className="auth-label">Parent / guardian full name<input className="auth-input" autoComplete="name" value={fullName} onChange={event=>setFullName(event.target.value)} required maxLength={120}/></label><label className="auth-label">Email address used for your child’s registration<input className="auth-input" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required maxLength={254}/></label><label className="auth-label">Password<input className="auth-input" type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8}/></label><label className="auth-label">Confirm password<input className="auth-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} required minLength={8}/></label><div className="registration-flow-hint"><strong>How parent linking works</strong><ol><li>Use the exact email you entered on the student application.</li><li>Confirm your email and sign in to this parent portal.</li><li>The school administrator approves the student application and links your account to the student record.</li></ol><span>If you have not submitted your child’s registration yet, do that first. Signing up alone does not link a child.</span></div>{message&&<div className="notice">{message}</div>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={busy||!supabaseEnabled}>{busy?'Creating account…':'Create parent account'} <ArrowRight size={15}/></button><p className="public-form-footnote">For more than one child, one parent account can be linked to each child by the school.</p></form></div><footer className="auth-footer"><span>© 2026 Northstar Academy</span><button onClick={onHome}>Back to home</button></footer></main>;
}

function StudentRegistrationPage({onSubmit,onSignIn,onHome,supabaseEnabled}) {
  const [classes,setClasses]=useState([]);const [classesLoading,setClassesLoading]=useState(true);const [form,setForm]=useState({studentName:'',dateOfBirth:'',gender:'',requestedClass:'',guardianName:'',guardianEmail:'',guardianPhone:'',address:'',previousSchool:''});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [classError,setClassError]=useState('');const [result,setResult]=useState(null);
  useEffect(()=>{if(!supabaseEnabled){setClassesLoading(false);return}let active=true;setClassesLoading(true);setClassError('');fetch('/api/public/classes').then(response=>readApiResponse(response,'Could not load available classes.')).then(payload=>{if(!Array.isArray(payload))throw new Error('The class list response was not valid. Check that the API server is running.');if(active){setClasses(payload);if(payload.length)setForm(current=>({...current,requestedClass:current.requestedClass||payload[0]}));else setClassError('No active classes are configured. Ask the school administrator to add classes, then refresh this page.')}}).catch(err=>{if(active)setClassError(err.message)}).finally(()=>{if(active)setClassesLoading(false)});return()=>{active=false}},[supabaseEnabled]);
  async function submit(event){event.preventDefault();setBusy(true);setError('');try{setResult(await onSubmit(form))}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <main className="auth-page"><div className="auth-brand-row"><button className="landing-brand" onClick={onHome}><span className="brand-mark"><Sparkles size={18}/></span><span>northstar</span></button><button className="landing-signin" onClick={onSignIn}>Sign in</button></div><div className="public-form-layout student-application-layout"><section className="public-form-intro student-registration-intro"><span className="hero-badge"><span/> ADMISSIONS</span><h1>Start a student registration.</h1><p>Submit an application for the school office to review. The student is added to the school register only after admin approval.</p><div className="auth-intro-note"><ShieldCheck size={17}/><span>Keep the application reference after submitting.</span></div></section><form className="auth-card public-form-card student-application-card" onSubmit={submit}><div className="auth-card-heading"><span className="auth-icon"><GraduationCap size={18}/></span><h2>Student application</h2><p>Parent or guardian contact details are required.</p></div>{result?<div className="application-success"><span className="success-mark"><Check size={19}/></span><h3>Application received</h3><p>{result.message}</p><div className="application-reference"><span>APPLICATION REFERENCE</span><strong>{result.reference}</strong></div><small>The school administrator will review the application. This submission does not create a student login.</small></div>:<>{!supabaseEnabled&&<div className="auth-error">Connect Supabase to enable online registration.</div>}<div className="student-application-fields"><label className="auth-label">Student full name<input className="auth-input" autoComplete="name" value={form.studentName} onChange={event=>setForm({...form,studentName:event.target.value})} required maxLength={160}/></label><label className="auth-label">Date of birth<input className="auth-input" type="date" max={new Date().toISOString().slice(0,10)} value={form.dateOfBirth} onChange={event=>setForm({...form,dateOfBirth:event.target.value})}/></label><label className="auth-label">Gender (optional)<select className="auth-input" value={form.gender} onChange={event=>setForm({...form,gender:event.target.value})}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label><label className="auth-label">Applying for class<select className="auth-input" value={form.requestedClass} onChange={event=>setForm({...form,requestedClass:event.target.value})} required disabled={classesLoading||!classes.length}><option value="">{classesLoading?'Loading classes…':classes.length?'Select class':'No classes available'}</option>{classes.map(name=><option key={name}>{name}</option>)}</select></label>{classError&&<div className="auth-error registration-class-error" role="alert">{classError}</div>}<label className="auth-label">Parent / guardian name<input className="auth-input" autoComplete="name" value={form.guardianName} onChange={event=>setForm({...form,guardianName:event.target.value})} required maxLength={160}/></label><label className="auth-label">Guardian email<input className="auth-input" type="email" autoComplete="email" value={form.guardianEmail} onChange={event=>setForm({...form,guardianEmail:event.target.value})} required maxLength={254}/></label><label className="auth-label">Guardian phone<input className="auth-input" type="tel" autoComplete="tel" value={form.guardianPhone} onChange={event=>setForm({...form,guardianPhone:event.target.value})} required maxLength={40}/></label><label className="auth-label">Home address<textarea className="auth-input public-form-textarea" autoComplete="street-address" value={form.address} onChange={event=>setForm({...form,address:event.target.value})} required maxLength={500}/></label><label className="auth-label">Previous school (optional)<input className="auth-input" value={form.previousSchool} onChange={event=>setForm({...form,previousSchool:event.target.value})} maxLength={160}/></label></div><label className="registration-consent"><input type="checkbox" required/><span>I confirm that I am the parent/guardian or authorized representative and consent to the school reviewing this information for admission.</span></label>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={busy||classesLoading||!supabaseEnabled||!classes.length}>{busy?'Submitting application…':'Submit application'} <ArrowRight size={15}/></button></>}</form></div><footer className="auth-footer"><span>© 2026 Northstar Academy</span><button onClick={onHome}>Back to home</button></footer></main>;
}

function RolePortal({auth,onSignOut}) {
  const [summary,setSummary]=useState(null);
  const [tab,setTab]=useState('Overview');
  const [loadError,setLoadError]=useState('');
  const [feeInvoices,setFeeInvoices]=useState([]);
  const role=auth.user.role;
  const tabs={student:['Overview','My results','Attendance','Fees','Assignments','Timetable'],parent:['Overview','Child progress','Attendance','Fees'],teacher:['Overview','My classes','Attendance','Assignments','Results'],bursar:['Overview','Invoices','Payments','Reports'],librarian:['Overview','Book catalogue','Loans','Returns'],school_admin:['Overview','Students','Staff','Settings']};
  const pageTitle=roleTitles[role]||'School portal';
  useEffect(()=>{
    let mounted=true;
    const loadPortal=()=>fetch('/api/portal/summary',{headers:{Authorization:`Bearer ${auth.token}`}}).then(async r=>{if(!r.ok)throw new Error('Session expired. Please sign in again.');return r.json()}).then(value=>{if(mounted)setSummary(value)}).catch(err=>{if(mounted)setLoadError(err.message)});
    loadPortal();
    if(!supabaseEnabled)return()=>{mounted=false};
    return()=>{mounted=false};
  },[auth]);
  useEffect(()=>{
    if(role!=='student'&&role!=='parent')return;
    let mounted=true;
    fetch('/api/fees/invoices',{headers:{Authorization:`Bearer ${auth.token}`}}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load fee balances.');return payload}).then(payload=>{if(mounted)setFeeInvoices(payload)}).catch(error=>{if(mounted)setLoadError(error.message)});
    return()=>{mounted=false};
  },[auth.token,role]);
  const student=summary?.students?.[0];
  const feeBalance=feeInvoices.reduce((total,invoice)=>total+Number(invoice.balance||0),0);
  const money=value=>`₦ ${Number(value||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const cards=role==='student'?[['My class',student?.className||'—',BookOpen,'teal'],['Attendance','—',ClipboardCheck,'blue'],['Current average','—',Activity,'amber'],['Fee balance',money(feeBalance),Wallet,'rose']]:role==='parent'?[['Linked children',summary?.students?.length||0,Users,'teal'],['Attendance','—',ClipboardCheck,'blue'],['Latest average','—',Activity,'amber'],['Fee balance',money(feeBalance),Wallet,'rose']]:role==='teacher'?[['Assigned classes',summary?.classes?.length||0,BookOpen,'teal'],['Assigned subjects',summary?.subjects?.length||0,FileText,'blue'],['Students',summary?.studentCount??summary?.students?.length??0,GraduationCap,'amber'],['Attendance today','—',ClipboardCheck,'rose']]:role==='bursar'?[['Fees collected','—',Wallet,'teal'],['Outstanding invoices','—',FileText,'blue'],['Pending verification','0',Clock3,'amber'],['Receipts this term','—',CreditCard,'rose']]:role==='librarian'?[['Books in catalogue','—',BookOpen,'teal'],['Books on loan','—',FileText,'blue'],['Overdue returns','—',Clock3,'amber'],['Active borrowers','—',Users,'rose']]:[['Students','—',GraduationCap,'teal'],['Teaching staff','—',Users,'blue'],['Attendance today','—',Activity,'amber'],['Items to review','—',ClipboardCheck,'rose']];
  const detailTitles={student:{'My results':'Term results','Attendance':'Attendance record','Assignments':'My assignments','Timetable':'My weekly timetable'},parent:{'Child progress':'Child progress','Attendance':'Attendance overview','Fees':'Fees & payments'},teacher:{'My classes':'My assigned classes','Attendance':'Class attendance','Assignments':'Assignments','Results':'Results entry'},bursar:{Invoices:'Invoices','Payments':'Payments','Reports':'Financial reports'},librarian:{'Book catalogue':'Book catalogue',Loans:'Book loans',Returns:'Returns and overdue books'},school_admin:{Students:'Student management',Staff:'Staff management',Settings:'School settings'}};
  const resultsTab=(role==='teacher'&&tab==='Results')||(role==='student'&&tab==='My results')||(role==='parent'&&tab==='Child progress');
  const teacherClassesTab=role==='teacher'&&tab==='My classes';
  const feesTab=(role==='student'||role==='parent')&&tab==='Fees'||role==='bursar'&&(tab==='Invoices'||tab==='Payments');
  const display=tab==='Overview'||tab==='Attendance'||resultsTab||feesTab||teacherClassesTab?null:(detailTitles[role]?.[tab]||tab);
  return <div className="portal-shell"><header className="portal-header"><button className="landing-brand" onClick={onSignOut}><span className="brand-mark"><Sparkles size={18}/></span><span>northstar</span></button><div className="portal-school"><span className="school-avatar">N</span><div><strong>{summary?.school?.name||'Northstar Academy'}</strong><small>{summary?.school?.term||'First term'} · {summary?.school?.session||'2026/2027'}</small></div></div><button className="portal-signout" onClick={onSignOut}>Sign out <ArrowRight size={14}/></button></header><main className="portal-content"><div className="portal-welcome"><div><div className="eyebrow"><span className="live-dot"/> {pageTitle.toUpperCase()} PORTAL <span className="eyebrow-sep">/</span> {summary?.school?.session||'2026/2027'}</div><h1>{role==='student'?'Welcome back, ':role==='parent'?'Good morning, ': 'Welcome, '}{auth.user.name}</h1><p>{role==='student'?`Your ${student?.className||'JSS 2A'} school dashboard is ready.`:role==='parent'?`Here is the latest update for ${summary?.students?.[0]?.name||'your child'}.`:role==='teacher'?'Here are your classes and teaching responsibilities.':`Your ${pageTitle.toLowerCase()} workspace is ready.`}</p></div><div className="portal-avatar">{auth.user.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div></div><nav className="portal-tabs">{(tabs[role]||['Overview']).map(name=><button key={name} onClick={()=>setTab(name)} className={tab===name?'portal-tab-active':''}>{name}</button>)}</nav>{loadError&&<div className="auth-error">{loadError}</div>}{tab==='Attendance'?<AttendanceWorkflow auth={auth} role={role} classes={summary?.classes||[]} assignments={summary?.teachingAssignments||[]} />:feesTab?<FeesWorkflow auth={auth} role={role} mode={tab==='Payments'?'payments':'invoices'} session={summary?.school?.session||'2026/2027'} term={summary?.school?.term||'First term'} />:teacherClassesTab?<TeacherClassOverview auth={auth} assignments={summary?.teachingAssignments||[]} />:resultsTab?<ResultsWorkflow auth={auth} role={role} classes={summary?.classes||[]} assignments={summary?.teachingAssignments||[]} session={summary?.school?.session||'2026/2027'} term={summary?.school?.term||'First term'} />:display?<section className="portal-detail panel"><span className="coming-soon">{tab.toUpperCase()}</span><h2>{display}</h2><p>This role-specific workspace is ready for the {display.toLowerCase()} workflow. Records shown here will be connected as each school module is implemented.</p>{student&&role==='student'&&tab==='My results'&&<div className="result-preview"><strong>Mathematics</strong><span>78 / 100 · B · Very good</span><strong>English Language</strong><span>84 / 100 · A · Excellent</span><strong>Basic Science</strong><span>76 / 100 · B · Very good</span></div>}<button className="button button-secondary" onClick={()=>setTab('Overview')}>Return to overview</button></section>:<><section className="portal-metrics">{cards.map(([label,value,Icon,tone])=><div className="portal-metric" key={label}><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={17}/></div><strong>{value}</strong><small>{(role==='student'||role==='parent')&&label==='Fee balance'?`${feeInvoices.length} invoices · current account balance`:'For the current term'}</small></div>)}</section><section className="portal-lower"><div className="panel portal-main-card"><div className="panel-heading"><div><h2>{role==='student'?'Your learning at a glance':role==='parent'?'Your child at a glance':role==='teacher'?'Your teaching day':role==='bursar'?'Finance overview':role==='librarian'?'Library overview':'School overview'}</h2><p>{role==='student'?'Personal academic information and next steps.':role==='parent'?'A quick view of your linked learner.':'Your assigned work and school activity.'}</p></div><span className="portal-chip">{summary?.school?.term||'First term'}</span></div>{(role==='student'||role==='parent')?<><div className="child-card"><div className="student-avatar av-0">{student?.name?.split(' ').map(word=>word[0]).slice(0,2).join('')||'—'}</div><div><strong>{student?.name||'No linked student yet'}</strong><span>{student?`${student.className} · Admission ${student.admissionNumber}`:'Ask the school administrator to link your account.'}</span></div>{student&&<span className="status status-active"><i/>{student.status}</span>}</div><div className="portal-fee-summary"><div><strong>{money(feeBalance)}</strong><span>Total outstanding balance</span></div><span>{feeInvoices.length} invoices</span><button className="text-link" onClick={()=>setTab('Fees')}>View fees and payments <ArrowRight size={14}/></button></div></>:role==='teacher'?<div className="class-list">{(summary?.teachingAssignments||[]).map(item=><div className="class-row" key={item.id}><span className="class-icon"><BookOpen size={16}/></span><div><strong>{item.className} · {item.subjectName}</strong><small>{item.subjectCode||'Assigned subject'} · Open My classes for roster</small></div><ArrowRight size={15}/></div>)}</div>:<div className="portal-summary-text"><p><Check size={15}/> Your role-specific school information is ready.</p><p><Check size={15}/> Use the tabs above to move between your portal sections.</p><p><Check size={15}/> The school’s sample data is isolated from other demo accounts.</p></div>}</div><div className="panel portal-side-card"><div className="panel-heading"><div><h2>{role==='student'?'Upcoming':role==='parent'?'School updates':'Quick links'}</h2><p>For {summary?.school?.term||'this term'}</p></div><CalendarDays size={17}/></div><div className="portal-event"><span className="event-date purple-date"><strong>12</strong><span>NOV</span></span><div><strong>Mid-term examinations</strong><small>All classes · sample event</small></div></div><div className="portal-event"><span className="event-date green-date"><strong>18</strong><span>NOV</span></span><div><strong>PTA meeting</strong><small>School hall · sample event</small></div></div><button className="text-link" onClick={()=>setTab(tabs[role]?.[1]||'Overview')}>Explore your portal <ArrowRight size={14}/></button></div></section></>}<footer className="portal-footer"><span>© 2026 Northstar Academy</span><span><ShieldCheck size={14}/> You are signed in as {roleTitles[role]}</span></footer></main></div>;
}

function TeacherClassOverview({auth,assignments}) {
  const [classId,setClassId]=useState(''); const [roster,setRoster]=useState([]); const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  const groups=useMemo(()=>assignments.reduce((all,item)=>{let group=all.find(row=>row.classId===item.classId);if(!group){group={classId:item.classId,className:item.className,subjects:[]};all.push(group)}if(!group.subjects.includes(item.subjectName))group.subjects.push(item.subjectName);return all},[]),[assignments]);
  useEffect(()=>{if(groups.length&&!groups.some(group=>group.classId===classId))setClassId(groups[0].classId)},[groups,classId]);
  useEffect(()=>{if(!classId)return;let active=true;setLoading(true);setError('');fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/roster`,{headers:{Authorization:`Bearer ${auth.token}`}}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load this class roster.');if(active)setRoster(payload.students)}).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[auth.token,classId]);
  const selected=groups.find(group=>group.classId===classId);
  return <section className="panel attendance-workflow teacher-classes-workflow"><div className="panel-heading"><div><h2>My assigned classes</h2><p>Class rosters and subjects are taken from your school assignments.</p></div><BookOpen size={20}/></div>{!groups.length?<div className="empty-state">No teaching assignments are linked to your account yet. Ask an administrator to assign your classes and subjects.</div>:<><div className="attendance-toolbar"><label>Class<select value={classId} onChange={event=>setClassId(event.target.value)}>{groups.map(group=><option key={group.classId} value={group.classId}>{group.className}</option>)}</select></label><div className="teacher-subject-list"><span>Subjects assigned</span><div>{selected?.subjects.map(subject=><span className="setup-chip subject-chip" key={subject}>{subject}</span>)}</div></div><span className="directory-count">{loading?'Loading roster…':`${roster.length} active students`}</span></div>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="table-wrap attendance-table"><table><thead><tr><th>STUDENT</th><th>ADMISSION NUMBER</th><th>GUARDIAN</th><th>STATUS</th></tr></thead><tbody>{roster.map(student=><tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.admissionNumber||'—'}</td><td>{student.guardianName||'—'}</td><td>{student.status||'Active'}</td></tr>)}</tbody></table>{!loading&&!roster.length&&!error&&<div className="empty-state">No active students are currently enrolled in this class.</div>}</div></>}</section>;
}

function ResultsWorkflow({auth,role,classes,assignments,session,term}) {
  const [classId,setClassId]=useState(''); const [assessmentName,setAssessmentName]=useState('Assessment 1'); const [roster,setRoster]=useState([]); const [scores,setScores]=useState({}); const [maxScores,setMaxScores]=useState({}); const [reviewRows,setReviewRows]=useState([]); const [history,setHistory]=useState([]); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const groups=useMemo(()=>assignments.reduce((all,item)=>{let group=all.find(row=>row.classId===item.classId);if(!group){group={classId:item.classId,className:item.className,subjects:[]};all.push(group)}if(!group.subjects.some(subject=>subject.id===item.subjectId))group.subjects.push({id:item.subjectId,name:item.subjectName});return all},[]),[assignments]);
  useEffect(()=>{if(groups.length&&!groups.some(group=>group.classId===classId))setClassId(groups[0].classId)},[groups,classId]); const selected=groups.find(group=>group.classId===classId);
  useEffect(()=>{let active=true;setError('');setMessage('');const load=async()=>{try{if(role==='teacher'){if(!classId||!assessmentName.trim())return;setLoading(true);const headers={Authorization:`Bearer ${auth.token}`};const rosterResponse=await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/roster`,{headers});const rosterData=await rosterResponse.json();if(!rosterResponse.ok)throw new Error(rosterData.message||'Could not load class roster.');const students=rosterData.students;const resultsBySubject=await Promise.all((selected?.subjects||[]).map(async subject=>{const params=new URLSearchParams({className:selected?.className||'',subjectId:subject.id,schoolSession:session,term,assessmentName});const response=await fetch(`/api/results?${params}`,{headers});const payload=await response.json();if(!response.ok)throw new Error(payload.message||`Could not load ${subject.name} results.`);return payload}));const current=resultsBySubject.flat().filter(row=>row.session===session&&row.term===term&&row.assessmentName===assessmentName&&students.some(student=>student.id===row.studentId));const byPair=Object.fromEntries(current.map(row=>[`${row.studentId}:${row.subjectId}`,row]));const nextScores={},nextMax={};for(const student of students)for(const subject of selected?.subjects||[]){const saved=byPair[`${student.id}:${subject.id}`];nextScores[`${student.id}:${subject.id}`]=saved?String(saved.score):'';nextMax[subject.id]=String(saved?.maxScore||nextMax[subject.id]||100)}if(active){setRoster(students);setReviewRows(current);setScores(nextScores);setMaxScores(nextMax)}}else{const response=await fetch('/api/results',{headers:{Authorization:`Bearer ${auth.token}`}});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load results.');if(active)setHistory(payload)}}catch(err){if(active)setError(err.message)}finally{if(active)setLoading(false)}};load();return()=>{active=false}},[auth.token,role,classId,assessmentName,session,term,selected]);  async function importCsv(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const lines=(await file.text()).trim().split(/\r?\n/);const header=lines.shift().toLowerCase().split(',').map(value=>value.trim());if(['admission_number','subject','score','max_score'].some((value,index)=>header[index]!==value))throw new Error('CSV columns must be admission_number,subject,score,max_score.');const studentMap=new Map(roster.map(student=>[student.admissionNumber,student]));const subjectMap=new Map((selected?.subjects||[]).map(subject=>[subject.name.toLowerCase(),subject]));const parsed={},nextMax={...maxScores};for(const line of lines){const [admission,name,score,max]=line.split(',').map(value=>value.trim());const student=studentMap.get(admission),subject=subjectMap.get(name?.toLowerCase());if(!student||!subject)throw new Error(`Unknown student or unassigned subject: ${line}`);if(score===''||!Number.isFinite(Number(score))||!Number.isFinite(Number(max))||Number(score)<0||Number(max)<=0||Number(score)>Number(max))throw new Error(`Invalid score in CSV row: ${line}`);if(nextMax[subject.id]&&Number(nextMax[subject.id])!==Number(max))throw new Error(`Use one maximum score for ${subject.name} throughout the class.`);nextMax[subject.id]=max;parsed[`${student.id}:${subject.id}`]=score}setScores(current=>({...current,...parsed}));setMaxScores(nextMax);setMessage(`Imported ${Object.keys(parsed).length} score cells. Review the sheet before submitting.`)}catch(err){setError(err.message)}}
  function downloadTemplate(){if(!selected?.subjects?.length){setError('This class has no subject assignments yet. Ask an administrator to assign its subjects.');return}const escapeCsv=value=>`"${String(value??'').replaceAll('"','""')}"`;const rows=[['admission_number','subject','score','max_score'],...(roster.length?roster.flatMap(student=>(selected.subjects||[]).map(subject=>[student.admissionNumber||'',subject.name,'',maxScores[subject.id]||100])):selected.subjects.map(subject=>['',subject.name,'',maxScores[subject.id]||100]))];const csv='\uFEFF'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${(selected.className||'class').replace(/[^a-z0-9_-]+/gi,'-')}-results-template.csv`;link.style.position='fixed';link.style.left='-10000px';document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000)}
  async function save(){setBusy(true);setError('');setMessage('');try{const records=roster.flatMap(student=>(selected?.subjects||[]).map(subject=>({studentId:student.id,subjectId:subject.id,score:scores[`${student.id}:${subject.id}`],maxScore:maxScores[subject.id]||100})));if(!records.length)throw new Error('No students or subjects are available for this class.');if(records.some(row=>row.score===''||!Number.isFinite(Number(row.score))||Number(row.score)<0||!Number.isFinite(Number(row.maxScore))||Number(row.maxScore)<=0||Number(row.score)>Number(row.maxScore)))throw new Error('Complete every score and use a valid maximum for each subject.');const response=await fetch('/api/results/batch',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({classId,schoolSession:session,term,assessmentName,records})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not submit the complete class sheet.');setMessage(payload.message||`Submitted ${payload.submitted} scores for administrator review.`);setReviewRows(current=>current.map(row=>row.publicationStatus==='published'?row:{...row,publicationStatus:'draft'}))}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <section className="panel attendance-workflow results-workflow"><div className="panel-heading"><div><h2>{role==='teacher'?'Complete class result sheet':'Academic results'}</h2><p>{role==='teacher'?`Fill every assigned subject for each student and submit for administrator review (${term}, ${session}).`:'Results published by your school for your linked learner(s).'}</p></div><FileText size={20}/></div>{role==='teacher'?<>{!groups.length?<div className="empty-state">No class and subject assignments are linked to your account. Ask an administrator to assign them first.</div>:<><div className="attendance-toolbar results-toolbar"><label>Class<select value={classId} onChange={event=>setClassId(event.target.value)}>{groups.map(group=><option key={group.classId} value={group.classId}>{group.className}</option>)}</select></label><label>Assessment<input value={assessmentName} maxLength={80} onChange={event=>setAssessmentName(event.target.value)}/></label><span className="portal-chip">{term} · {session}</span><div className="teacher-result-tools"><button type="button" className="button button-secondary" onClick={downloadTemplate} disabled={!selected?.subjects?.length}><Download size={14}/> Download CSV template</button><label className="button button-secondary csv-upload-button"><Upload size={14}/> Upload completed CSV<input type="file" accept=".csv,text/csv" onChange={importCsv}/></label></div></div><div className="teacher-subject-list"><span>Subjects in this class</span><div>{selected?.subjects.map(subject=><span className="setup-chip subject-chip" key={subject.id}>{subject.name}</span>)}</div></div>{!loading&&!roster.length&&!error&&<div className="notice result-feedback">No active students are loaded for this class. You can download the subject template, but ask an administrator to check student class placement before uploading a complete sheet.</div>}{reviewRows.some(row=>row.publicationStatus==='needs_revision')&&<div className="auth-error result-feedback">Admin feedback: {reviewRows.filter(row=>row.publicationStatus==='needs_revision'&&row.reviewNote).map(row=>row.reviewNote).filter((note,index,all)=>all.indexOf(note)===index).join(' · ')||'Review the note in the admin results queue.'}</div>}{reviewRows.some(row=>row.publicationStatus==='published')&&<div className="notice result-feedback">Published results are locked and must remain unchanged.</div>}<div className="table-wrap attendance-table teacher-result-table"><table><thead><tr><th>STUDENT</th><th>ADMISSION NUMBER</th>{selected?.subjects.map(subject=><th key={subject.id}>{subject.name}<small className="result-session">Maximum <input className="result-max-input" type="number" min="1" max="10000" value={maxScores[subject.id]||100} onChange={event=>setMaxScores(current=>({...current,[subject.id]:event.target.value}))}/></small></th>)}<th>REVIEW</th></tr></thead><tbody>{roster.map(student=><tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.admissionNumber||'—'}</td>{selected?.subjects.map(subject=>{const key=`${student.id}:${subject.id}`;const row=reviewRows.find(item=>item.studentId===student.id&&item.subjectId===subject.id);return <td key={subject.id}><input className="result-score-input" type="number" min="0" max={maxScores[subject.id]||100} step="0.01" value={scores[key]??''} disabled={row?.publicationStatus==='published'} aria-label={`${subject.name} score for ${student.name}`} onChange={event=>setScores(current=>({...current,[key]:event.target.value}))}/></td>})}<td><span className="result-review-status">{selected?.subjects.every(subject=>reviewRows.some(row=>row.studentId===student.id&&row.subjectId===subject.id))?'Submitted':'Pending'}</span></td></tr>)}</tbody></table>{loading&&<div className="empty-state">Loading assigned students and existing scores…</div>}{!loading&&!roster.length&&!error&&<div className="empty-state">No active students are enrolled in {selected?.className}.</div>}</div><button className="button button-primary attendance-save" disabled={busy||loading||!roster.length} onClick={save}>{busy?'Submitting…':'Submit complete sheet for admin review'} <Check size={15}/></button></>}{message&&<div className="notice attendance-message">{message}</div>}{error&&<div className="auth-error" role="alert">{error}</div>}</>:<div className="table-wrap attendance-table"><table><thead><tr><th>STUDENT</th><th>SUBJECT</th><th>ASSESSMENT</th><th>TERM</th><th>SCORE</th></tr></thead><tbody>{history.map(item=><tr key={item.id}><td>{item.student?.full_name||'Student'}</td><td>{item.subject?.name||'—'}</td><td>{item.assessmentName}</td><td>{item.term} · {item.session}</td><td><strong>{item.score} / {item.maxScore}</strong></td></tr>)}</tbody></table>{!history.length&&!error&&<div className="empty-state">No published results have been linked to your account.</div>}</div>}</section>;
}
function AttendanceWorkflow({auth,role,classes,assignments=[]}) {
  const [date,setDate]=useState(()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`});
  const [className,setClassName]=useState('');
  const [roster,setRoster]=useState([]);
  const [marks,setMarks]=useState({});
  const [history,setHistory]=useState([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{if(role==='teacher'&&classes.length&&!classes.includes(className))setClassName(classes[0])},[role,classes,className]);
  useEffect(()=>{
    let active=true;
    setError('');setMessage('');
    const headers={Authorization:`Bearer ${auth.token}`};
    const load=async()=>{
      try{
        if(role==='teacher'){
          if(!className)return;
          const assignedClassId=assignments.find(item=>item.className===className)?.classId;
          if(!assignedClassId)throw new Error('This class has no teacher assignment. Ask an administrator to assign it first.');
          const [studentsResponse,attendanceResponse]=await Promise.all([fetch(`/api/teacher/classes/${encodeURIComponent(assignedClassId)}/roster`,{headers}),fetch(`/api/attendance?date=${encodeURIComponent(date)}&className=${encodeURIComponent(className)}`,{headers})]);
          const studentsPayload=await studentsResponse.json();const attendancePayload=await attendanceResponse.json();
          if(!studentsResponse.ok)throw new Error(studentsPayload.message||'Could not load the assigned class roster.');
          if(!attendanceResponse.ok)throw new Error(attendancePayload.message||'Could not load attendance.');
          const rows=studentsPayload.students;
          const byStudent=Object.fromEntries(attendancePayload.map(item=>[item.studentId,item]));
          if(active){setRoster(rows);setMarks(Object.fromEntries(rows.map(row=>[row.id,byStudent[row.id]?.status||''])))}
        }else{
          const response=await fetch('/api/attendance',{headers});const payload=await response.json();
          if(!response.ok)throw new Error(payload.message||'Could not load attendance.');
          if(active)setHistory(payload);
        }
      }catch(err){if(active)setError(err.message)}
    };
    load();return()=>{active=false};
  },[auth.token,role,className,date,classes]);
  async function save(){
    setBusy(true);setError('');setMessage('');
    try{
      const records=roster.map(student=>({studentId:student.id,status:marks[student.id]}));
      if(!records.length)throw new Error('There are no active students in this assigned class.');
      if(records.some(record=>!record.status))throw new Error('Choose an attendance status for every student before saving.');
      const response=await fetch('/api/attendance',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({date,records})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not save attendance.');
      setMessage(`Attendance saved for ${payload.saved} student${payload.saved===1?'':'s'}.`);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  return <section className="panel attendance-workflow"><div className="panel-heading"><div><h2>{role==='teacher'?'Take class attendance':'Attendance record'}</h2><p>{role==='teacher'?'Record each learner’s status for a class and date.':'Attendance recorded by your school for your linked learner(s).'}</p></div><ClipboardCheck size={20}/></div>
    {role==='teacher'?<><div className="attendance-toolbar"><label>Class<select value={className} onChange={event=>setClassName(event.target.value)}>{classes.map(name=><option key={name}>{name}</option>)}</select></label><label>Date<input type="date" value={date} max={date} onChange={event=>setDate(event.target.value)}/></label></div>{!classes.length?<div className="empty-state">No classes are assigned to this teacher yet. Ask an administrator to add a teaching assignment.</div>:<><div className="table-wrap attendance-table"><table><thead><tr><th>STUDENT</th><th>ADMISSION NUMBER</th><th>STATUS</th></tr></thead><tbody>{roster.map(student=><tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.admissionNumber||student.id}</td><td><select className="attendance-status-select" aria-label={`Attendance for ${student.name}`} value={marks[student.id]||''} onChange={event=>setMarks(current=>({...current,[student.id]:event.target.value}))}><option value="">Choose status</option><option value="Present">Present</option><option value="Absent">Absent</option><option value="Late">Late</option><option value="Excused">Excused</option></select></td></tr>)}</tbody></table>{!roster.length&&!error&&<div className="empty-state">No active students are listed in {className}.</div>}</div><button className="button button-primary attendance-save" disabled={busy||!roster.length} onClick={save}>{busy?'Saving…':'Save attendance'} <Check size={15}/></button></>}{message&&<div className="notice attendance-message">{message}</div>}{error&&<div className="auth-error" role="alert">{error}</div>}</>:<div className="table-wrap attendance-table"><table><thead><tr><th>DATE</th><th>STUDENT</th><th>CLASS</th><th>STATUS</th></tr></thead><tbody>{history.map(item=><tr key={item.id}><td>{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</td><td>{item.student?.full_name||'Student'}</td><td>{item.student?.class_name||'—'}</td><td><span className={`attendance-badge attendance-${item.status.toLowerCase()}`}>{item.status}</span></td></tr>)}</tbody></table>{!history.length&&!error&&<div className="empty-state">No attendance records have been published yet.</div>}</div>}
  </section>;
}

function StudentDirectory({students,search,onAdd,onStatus,onExport,onLinkParent,auth,onNotice}) {
  const [showArchived,setShowArchived]=useState(false);
  const [archivedStudents,setArchivedStudents]=useState([]);
  const [archiveError,setArchiveError]=useState('');
  const [pendingDelete,setPendingDelete]=useState(null);
  const [loadingArchived,setLoadingArchived]=useState(false);
  const [showDeletionAudit,setShowDeletionAudit]=useState(false);
  const [auditRows,setAuditRows]=useState([]);
  const [auditError,setAuditError]=useState('');
  const [loadingAudit,setLoadingAudit]=useState(false);
  useEffect(()=>{
    if(!showArchived){setArchivedStudents([]);setArchiveError('');return undefined}
    let active=true;setLoadingArchived(true);setArchiveError('');
    fetch('/api/students?status=Archived&limit=100',{headers:{Authorization:`Bearer ${auth.token}`}}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load archived students.');if(active)setArchivedStudents(payload.data)}).catch(error=>{if(active)setArchiveError(error.message)}).finally(()=>{if(active)setLoadingArchived(false)});
    return()=>{active=false};
  },[showArchived,auth.token]);
  useEffect(()=>{
    if(!showDeletionAudit)return undefined;
    let active=true;setLoadingAudit(true);setAuditError('');
    fetch('/api/students/deletion-audit',{headers:{Authorization:`Bearer ${auth.token}`}}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load the deletion audit.');if(active)setAuditRows(payload)}).catch(error=>{if(active)setAuditError(error.message)}).finally(()=>{if(active)setLoadingAudit(false)});
    return()=>{active=false};
  },[showDeletionAudit,auth.token]);
  const rows=(showArchived?archivedStudents:students).filter(student=>!search||`${student.name} ${student.id} ${student.className} ${student.admissionNumber||''}`.toLowerCase().includes(search.toLowerCase()));
  async function restore(student){if(await onStatus(student.id,'Active')){setArchivedStudents(current=>current.filter(item=>item.id!==student.id));onNotice(`${student.name} restored to the active student list.`)}}
  async function permanentlyDelete(admissionNumber,reason){
    const response=await fetch(`/api/students/${encodeURIComponent(pendingDelete.id)}`,{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({admissionNumber,reason})});
    const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not delete this student record.');
    setArchivedStudents(current=>current.filter(item=>item.id!==pendingDelete.id));setPendingDelete(null);onNotice(payload.message);window.setTimeout(()=>onNotice(''),4000);
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> PEOPLE <span className="eyebrow-sep">/</span> STUDENT RECORDS</div><h1>{showArchived?'Archived students':'Students'}</h1><p>{showArchived?'Restore records or permanently remove eligible duplicate records.':'Manage student profiles, class placement and registration status.'}</p></div><div className="heading-actions">{showArchived&&<button className="button button-secondary" onClick={()=>setShowDeletionAudit(value=>!value)}>{showDeletionAudit?'Hide deletion log':'Deletion log'}</button>}<button className="button button-secondary" onClick={()=>setShowArchived(value=>!value)}>{showArchived?'Current students':'Archived students'}</button><button className="button button-secondary" onClick={onExport}><Download size={16}/> Export list</button>{!showArchived&&<button className="button button-primary" onClick={onAdd}><Plus size={17}/> Add student</button>}</div></div>
    <div className="directory-summary"><div><strong>{rows.length.toLocaleString()}</strong><span>{search?'matching records':showArchived?'archived records':'student records'}</span></div><span className="directory-hint"><ShieldCheck size={15}/>{showArchived?'Permanent deletion is limited to archived records with no linked accounts or academic history.':'Archived students keep their academic history and can be restored.'}</span></div>
    {showArchived&&showDeletionAudit&&<div className="panel deletion-audit-panel"><div className="panel-heading"><div><h2>Permanent deletion audit</h2><p>Latest 100 deletion events.</p></div><span className="directory-count">{loadingAudit?'Loading…':`${auditRows.length} events`}</span></div>{auditError&&<div className="auth-error">{auditError}</div>}<div className="table-wrap"><table><thead><tr><th>DELETED AT</th><th>STUDENT ID</th><th>ADMISSION NUMBER</th><th>ADMIN USER ID</th><th>REASON</th></tr></thead><tbody>{auditRows.map(item=><tr key={item.id}><td>{new Date(item.deleted_at).toLocaleString()}</td><td>{item.student_id}</td><td>{item.admission_number}</td><td className="id-cell">{item.deleted_by}</td><td>{item.reason}</td></tr>)}</tbody></table>{!auditRows.length&&!loadingAudit&&!auditError&&<div className="empty-state">No permanent deletions have been recorded.</div>}</div></div>}
    <div className="panel directory-panel"><div className="panel-heading"><div><h2>{showArchived?'Archived student records':'Student directory'}</h2><p>{showArchived?'Archived history remains available until an eligible record is permanently deleted.':'Search by student name, ID, or class using the search field above.'}</p></div><span className="directory-count">{loadingArchived?'Loading…':`${rows.length} shown`}</span></div>{archiveError&&<div className="auth-error">{archiveError}</div>}<div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ADMISSION NUMBER</th><th>CLASS</th><th>PARENT / GUARDIAN</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((student,index)=><tr key={student.id}><td><div className="student-cell"><div className={`student-avatar av-${index%5}`}>{student.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</div><strong>{student.name}</strong></div></td><td className="id-cell">{student.admissionNumber||student.id}</td><td>{student.className}</td><td>{student.guardian}</td><td>{showArchived?<span className="status status-inactive"><i/>Archived</span>:<select className="status-select" value={student.status} onChange={event=>onStatus(student.id,event.target.value)} aria-label={`Change ${student.name} status`}><option>Active</option><option>Pending</option><option>Withdrawn</option><option>Archived</option></select>}</td><td>{showArchived?<div className="archive-actions"><button className="text-link" onClick={()=>restore(student)}>Restore</button><button className="text-link delete-student-button" onClick={()=>setPendingDelete(student)}>Delete permanently</button></div>:<button className="text-link link-parent-button" onClick={()=>onLinkParent(student)}><UserPlus size={14}/>Link parent</button>}</td></tr>)}</tbody></table>{!rows.length&&!loadingArchived&&<div className="empty-state">{showArchived?'There are no archived student records.':search?'No students match your search.':'No student records are available yet.'}</div>}</div></div>
    {pendingDelete&&<DeleteArchivedStudentModal student={pendingDelete} onClose={()=>setPendingDelete(null)} onSubmit={permanentlyDelete}/>}
  </>;
}

function DeleteArchivedStudentModal({student,onClose,onSubmit}) {
  const [admissionNumber,setAdmissionNumber]=useState('');
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);setError('');try{await onSubmit(admissionNumber,reason)}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><form className="modal delete-student-modal" onSubmit={submit}><div className="modal-title"><div><h2>Permanently delete student?</h2><p>This cannot be undone. Academic history and linked accounts block deletion.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="delete-student-warning"><strong>{student.name}</strong><span>Admission number: {student.admissionNumber||student.id}</span></div><label>Type the admission number to confirm<input autoFocus value={admissionNumber} onChange={event=>setAdmissionNumber(event.target.value)} required/></label><label>Reason for permanent deletion<textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={500} required placeholder="For example: duplicate record created by mistake"/></label><p className="link-parent-help">Avoid putting sensitive personal details in the reason. An audit entry records who deleted the record, when, and why.</p>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-danger" type="submit" disabled={busy||admissionNumber!==student.admissionNumber}>{busy?'Deleting…':'Delete permanently'}</button></div></form></div>;
}
function FeesWorkflow({auth,role,mode='invoices',session,term}) {
  const canManage=['school_admin','bursar'].includes(role);
  const [invoices,setInvoices]=useState([]);
  const [students,setStudents]=useState([]);
  const [classes,setClasses]=useState([]);
  const [studentId,setStudentId]=useState('');
  const [className,setClassName]=useState('');
  const [title,setTitle]=useState('Tuition fee');
  const [amount,setAmount]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [paymentInvoice,setPaymentInvoice]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const headers={Authorization:`Bearer ${auth.token}`};
  async function load(){
    setLoading(true);setError('');
    try{
      const requests=[fetch('/api/fees/invoices',{headers})];
      if(canManage){requests.push(fetch('/api/students?limit=100',{headers}));requests.push(fetch('/api/classes',{headers}));}
      const responses=await Promise.all(requests);
      const invoicePayload=await responses[0].json();if(!responses[0].ok)throw new Error(invoicePayload.message||'Could not load fee invoices.');
      let studentPayload={data:[]};let classPayload=[];if(canManage){studentPayload=await responses[1].json();if(!responses[1].ok)throw new Error(studentPayload.message||'Could not load students for invoicing.');classPayload=await responses[2].json();if(!responses[2].ok)throw new Error(classPayload.message||'Could not load classes for invoicing.')}
      setInvoices(invoicePayload);setStudents(studentPayload.data||[]);setClasses(classPayload);if((studentPayload.data||[]).length)setStudentId(current=>current||studentPayload.data[0].id);if(classPayload.length)setClassName(current=>current||classPayload[0].name);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[auth.token,role]);
  async function createInvoice(event){
    event.preventDefault();setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/fees/invoices',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({studentId,title,session,term,amount,dueDate:dueDate||null})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not create the invoice.');
      setTitle('Tuition fee');setAmount('');setDueDate('');setMessage(`Invoice ${payload.invoiceNumber} created.`);await load();
    }catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function createClassInvoices(event){
    event.preventDefault();setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/fees/invoices/bulk',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({className,title,session,term,amount,dueDate:dueDate||null})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not create class invoices.');
      setTitle('Tuition fee');setAmount('');setDueDate('');setMessage(`${payload.created} individual invoices created for ${payload.className}.`);await load();
    }catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function recordPayment(invoice,payment){
    setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch(`/api/fees/invoices/${encodeURIComponent(invoice.id)}/payments`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payment)});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not record payment.');
      setPaymentInvoice(null);setMessage(payload.message);await load();
    }catch(err){throw err}finally{setSaving(false)}
  }
  const allPayments=invoices.flatMap(invoice=>(invoice.payments||[]).map(payment=>({...payment,invoiceNumber:invoice.invoiceNumber,title:invoice.title,student:invoice.student})));
  const money=value=>`₦ ${Number(value||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> FINANCE <span className="eyebrow-sep">/</span> FEES & PAYMENTS</div><h1>{mode==='payments'?'Payment ledger':'Fees & payments'}</h1><p>{canManage?'Create student invoices and record cash, transfer, or POS payments.':'View invoices and payment history for your linked student account.'}</p></div></div>
    {message&&<div className="notice">{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}{error&&<div className="auth-error" role="alert">{error}</div>}
    {canManage&&mode==='invoices'&&<><form className="panel fee-create-form" onSubmit={createInvoice}><div className="panel-heading"><div><h2>Create an invoice</h2><p>Issue a fee against one student’s school account.</p></div><Plus size={18}/></div><div className="fee-form-grid"><label>Student<select value={studentId} onChange={event=>setStudentId(event.target.value)} required>{students.map(student=><option key={student.id} value={student.id}>{student.name} · {student.admissionNumber||student.id}</option>)}</select></label><label>Fee description<input value={title} maxLength={120} onChange={event=>setTitle(event.target.value)} required placeholder="Tuition fee"/></label><label>Amount (₦)<input type="number" min="0.01" max="1000000000" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required/></label><label>Due date<input type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label><span className="portal-chip">{term} · {session}</span><button className="button button-primary fee-create-button" type="submit" disabled={saving||!students.length}>{saving?'Saving…':'Create invoice'}</button></div>{!students.length&&!loading&&<div className="empty-state">Add a student before creating an invoice.</div>}</form><form className="panel fee-create-form" onSubmit={createClassInvoices}><div className="panel-heading"><div><h2>Charge a class</h2><p>Create a separate itemized invoice for every active student in the selected class.</p></div><Users size={18}/></div><div className="fee-form-grid"><label>Class<select value={className} onChange={event=>setClassName(event.target.value)} required>{classes.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Fee description<input value={title} maxLength={120} onChange={event=>setTitle(event.target.value)} required placeholder="Tuition fee"/></label><label>Amount per student (₦)<input type="number" min="0.01" max="1000000000" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required/></label><label>Due date<input type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label><span className="portal-chip">{term} · {session}</span><button className="button button-primary fee-create-button" type="submit" disabled={saving||!className}>{saving?'Creating…':'Charge class'}</button></div></form></>}
    <div className="panel fee-panel"><div className="panel-heading"><div><h2>{mode==='payments'?'Recorded payments':'Student invoices'}</h2><p>{mode==='payments'?'Payments recorded by your school finance team.':'Outstanding balances and payment progress.'}</p></div><span className="directory-count">{loading?'Loading…':`${mode==='payments'?allPayments.length:invoices.length} records`}</span></div><div className="table-wrap"><table>{mode==='payments'?<><thead><tr><th>DATE</th><th>STUDENT</th><th>INVOICE</th><th>METHOD</th><th>REFERENCE</th><th>AMOUNT</th></tr></thead><tbody>{allPayments.map(payment=><tr key={payment.id}><td>{new Date(payment.paid_at).toLocaleString()}</td><td>{payment.student?.full_name||'—'}</td><td>{payment.invoiceNumber} · {payment.title}</td><td>{payment.method.replace('_',' ')}</td><td>{payment.reference||'—'}</td><td><strong>{money(payment.amount)}</strong></td></tr>)}</tbody></>:<><thead><tr><th>STUDENT</th><th>INVOICE</th><th>TERM</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th><th>DUE</th><th>STATUS</th>{canManage&&<th>ACTION</th>}</tr></thead><tbody>{invoices.map(invoice=><tr key={invoice.id}><td><strong>{invoice.student?.full_name||'—'}</strong><small className="result-session">{invoice.student?.class_name||''}</small></td><td>{invoice.title}<small className="result-session">{invoice.invoiceNumber}</small></td><td>{invoice.term} · {invoice.session}</td><td>{money(invoice.amount)}</td><td>{money(invoice.paid)}</td><td><strong>{money(invoice.balance)}</strong></td><td>{invoice.dueDate||'—'}</td><td><span className={`result-review-status ${invoice.status==='Paid'?'result-status-published':invoice.status==='Overdue'?'result-status-needs_revision':invoice.status==='Partial'?'result-status-draft':''}`}>{invoice.status}</span></td>{canManage&&<td>{invoice.balance>0&&<button className="button button-primary review-action" onClick={()=>setPaymentInvoice(invoice)}>Record payment</button>}</td>}</tr>)}</tbody></>}</table>{!loading&&(mode==='payments'?!allPayments.length:!invoices.length)&&<div className="empty-state">{mode==='payments'?'No payments have been recorded yet.':'No invoices are available for this account.'}</div>}</div></div>
    {paymentInvoice&&<RecordPaymentModal invoice={paymentInvoice} money={money} saving={saving} onClose={()=>setPaymentInvoice(null)} onSubmit={payment=>recordPayment(paymentInvoice,payment)}/>}
  </>;
}

function RecordPaymentModal({invoice,money,saving,onClose,onSubmit}) {
  const [amount,setAmount]=useState(String(invoice.balance));
  const [method,setMethod]=useState('bank_transfer');
  const [reference,setReference]=useState('');
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  async function submit(event){event.preventDefault();setError('');try{await onSubmit({amount,method,reference,note})}catch(err){setError(err.message)}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><form className="modal fee-payment-modal" onSubmit={submit}><div className="modal-title"><div><h2>Record a payment</h2><p>{invoice.student?.full_name} · {invoice.invoiceNumber}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="delete-student-warning"><strong>{invoice.title}</strong><span>Remaining balance: {money(invoice.balance)}</span></div><label>Amount received (₦)<input type="number" min="0.01" max={invoice.balance} step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required/></label><label>Payment method<select value={method} onChange={event=>setMethod(event.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="other">Other</option></select></label><label>Payment reference (optional)<input maxLength={100} value={reference} onChange={event=>setReference(event.target.value)} placeholder="Receipt or bank reference"/></label><label>Note (optional)<textarea maxLength={300} value={note} onChange={event=>setNote(event.target.value)} placeholder="Payment details"/></label>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving?'Recording…':'Record payment'}</button></div></form></div>;
}

function TeacherAssignments({auth}) {
  const [teachers,setTeachers]=useState([]);
  const [classes,setClasses]=useState([]);
  const [subjects,setSubjects]=useState([]);
  const [assignments,setAssignments]=useState([]);
  const [teacherId,setTeacherId]=useState('');
  const [classId,setClassId]=useState('');
  const [subjectId,setSubjectId]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const headers={Authorization:`Bearer ${auth.token}`};
  async function load(){
    setLoading(true);setError('');
    try{
      const endpoints=['/api/teachers','/api/classes','/api/subjects','/api/teaching-assignments'];
      const responses=await Promise.all(endpoints.map(url=>fetch(url,{headers})));
      const payloads=await Promise.all(responses.map(response=>readApiResponse(response,'Could not load teacher assignments.')));
      setTeachers(payloads[0]);setClasses(payloads[1]);setSubjects(payloads[2]);setAssignments(payloads[3]);
      if(payloads[0].length)setTeacherId(current=>current||payloads[0][0].id);
      if(payloads[1].length)setClassId(current=>current||payloads[1][0].id);
      if(payloads[2].length)setSubjectId(current=>current||payloads[2][0].id);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[auth.token]);
  async function addAssignment(event){
    event.preventDefault();setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/teaching-assignments',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({teacherId,classId,subjectId})});
      const payload=await readApiResponse(response,'Could not create the assignment.');
      setAssignments(current=>[payload,...current]);setMessage(`${payload.teacherName} is assigned to ${payload.subjectName} · ${payload.className}.`);
    }catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function removeAssignment(item){
    setError('');setMessage('');
    try{
      const response=await fetch(`/api/teaching-assignments/${encodeURIComponent(item.id)}`,{method:'DELETE',headers});
      await readApiResponse(response,'Could not remove the assignment.');
      setAssignments(current=>current.filter(row=>row.id!==item.id));setMessage(`${item.teacherName}'s ${item.subjectName} · ${item.className} assignment was removed.`);
    }catch(err){setError(err.message)}
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> PEOPLE <span className="eyebrow-sep">/</span> TEACHING ASSIGNMENTS</div><h1>Teachers & classes</h1><p>Assign each teacher to the classes and subjects they teach. Their portal roster and result sheet follows these assignments.</p></div></div>
    {message&&<div className="notice">{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}{error&&<div className="auth-error" role="alert">{error}</div>}
    <form className="panel teacher-assignment-form" onSubmit={addAssignment}><div className="panel-heading"><div><h2>Add a teaching assignment</h2><p>Each assignment grants the teacher class roster and subject result access.</p></div><UserPlus size={19}/></div><div className="teacher-assignment-controls"><label>Teacher<select value={teacherId} onChange={event=>setTeacherId(event.target.value)} required>{teachers.map(item=><option key={item.id} value={item.id}>{item.full_name||'Unnamed teacher'}{item.email?` · ${item.email}`:` · Account ${item.id.slice(0,8)}`}</option>)}</select></label><label>Class<select value={classId} onChange={event=>setClassId(event.target.value)} required>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subject<select value={subjectId} onChange={event=>setSubjectId(event.target.value)} required>{subjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="submit" className="button button-primary" disabled={saving||!teachers.length||!classes.length||!subjects.length}>{saving?'Saving…':'Assign class and subject'} <Plus size={15}/></button></div><p className="teacher-assignment-help">Showing {teachers.length} accounts with the Teacher role. Create accounts in Supabase Authentication and set <code>profiles.role</code> to <code>teacher</code>; their name and email will appear here.</p>{!loading&&!teachers.length&&<div className="empty-state">No teacher profiles are available yet. Create the teacher accounts in Supabase Authentication and assign each the Teacher role.</div>}</form>
    <div className="panel teacher-assignment-panel"><div className="panel-heading"><div><h2>Current teaching assignments</h2><p>Teachers see these class rosters and subjects in the My classes and Results tabs.</p></div><span className="directory-count">{loading?'Loading…':`${assignments.length} assignments`}</span></div><div className="table-wrap"><table><thead><tr><th>TEACHER</th><th>CLASS</th><th>SUBJECT</th><th></th></tr></thead><tbody>{assignments.map(item=><tr key={item.id}><td>{item.teacherName}</td><td>{item.className}</td><td>{item.subjectName}</td><td><button className="text-link delete-student-button" onClick={()=>removeAssignment(item)}>Remove assignment</button></td></tr>)}</tbody></table>{!loading&&!assignments.length&&<div className="empty-state">No teaching assignments yet. Add one above to activate a teacher's assigned class tools.</div>}</div></div>
  </>;
}

function AdmissionsReview({auth,onStudentCreated}) {
  const [status,setStatus]=useState('pending');const [applications,setApplications]=useState([]);const [notes,setNotes]=useState({});const [busyId,setBusyId]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){setLoading(true);setError('');try{const response=await fetch(`/api/student-applications?status=${encodeURIComponent(status)}`,{headers:{Authorization:`Bearer ${auth.token}`}});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load admissions applications.');setApplications(payload);setNotes(Object.fromEntries(payload.map(item=>[item.id,item.reviewNote||''])))}catch(err){setError(err.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[auth.token,status]);
  async function review(item,action){setBusyId(item.id);setError('');setMessage('');try{const response=await fetch(`/api/student-applications/${encodeURIComponent(item.id)}/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify(action==='reject'?{note:notes[item.id]||''}:{})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not review this application.');if(action==='approve'&&payload.student?.id)onStudentCreated(payload.student);setApplications(current=>current.filter(row=>row.id!==item.id));setMessage(action==='approve'?`${item.student_full_name} has been added to the student register. Create and link a student login separately if required.`:'Application rejected and recorded.')}catch(err){setError(err.message)}finally{setBusyId('')}}
  const filters=[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All applications']];
  return <><div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> STUDENTS <span className="eyebrow-sep">/</span> ADMISSIONS</div><h1>Student applications</h1><p>Review family submissions before creating an enrolled student record.</p></div></div><div className="results-review-filters">{filters.map(([value,label])=><button key={value} className={`button ${status===value?'button-primary':'button-secondary'}`} onClick={()=>setStatus(value)}>{label}</button>)}<span className="directory-count">{loading?'Loading…':`${applications.length} applications`}</span></div>{message&&<div className="notice">{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}{error&&<div className="auth-error" role="alert">{error}</div>}<div className="panel results-review-panel admissions-review-panel"><div className="panel-heading"><div><h2>{filters.find(([value])=>value===status)?.[1]}</h2><p>Approving creates an active student record. The student’s portal login is a separate setup step.</p></div><GraduationCap size={19}/></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>REQUESTED CLASS</th><th>DATE OF BIRTH</th><th>PARENT / GUARDIAN</th><th>CONTACT</th><th>APPLICATION</th><th>REVIEW</th></tr></thead><tbody>{applications.map(item=><tr key={item.id}><td><strong>{item.student_full_name}</strong><small className="result-session">{item.gender||'Gender not provided'}{item.previous_school?` · From ${item.previous_school}`:''}</small><small className="result-session">{item.address}</small></td><td>{item.requested_class}</td><td>{item.date_of_birth||'—'}</td><td>{item.guardian_name}</td><td>{item.guardian_email}<small className="result-session">{item.guardian_phone}</small></td><td><strong>{item.reference}</strong><small className="result-session">{new Date(item.created_at).toLocaleDateString()}</small></td><td>{item.status==='pending'?<div className="admission-review-actions"><textarea className="review-note-input" value={notes[item.id]||''} onChange={event=>setNotes(current=>({...current,[item.id]:event.target.value}))} maxLength={500} placeholder="Reason if declining" aria-label={`Review note for ${item.student_full_name}`}/><button className="button button-primary review-action" disabled={busyId===item.id} onClick={()=>review(item,'approve')}>{busyId===item.id?'Saving…':'Approve & enroll'}</button><button className="text-link delete-student-button" disabled={busyId===item.id||String(notes[item.id]||'').trim().length<5} onClick={()=>review(item,'reject')}>Reject application</button></div>:<div><span className={`result-review-status ${item.status==='approved'?'result-status-published':item.status==='rejected'?'result-status-needs_revision':''}`}>{item.status}</span>{item.review_note&&<small className="result-session">{item.review_note}</small>}{item.student_id&&<small className="result-session">Record {item.student_id}</small>}</div>}</td></tr>)}</tbody></table>{!loading&&!applications.length&&!error&&<div className="empty-state">No applications in this queue.</div>}</div></div></>;
}

function ResultsReview({auth,onBack}) {
  const [status,setStatus]=useState('draft');
  const [results,setResults]=useState([]);
  const [notes,setNotes]=useState({});
  const [busyId,setBusyId]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    fetch(`/api/results?status=${encodeURIComponent(status)}`,{headers:{Authorization:`Bearer ${auth.token}`}}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not load assessment results.');if(active){setResults(payload);setNotes(Object.fromEntries(payload.map(item=>[item.id,item.reviewNote||''])))}}).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[auth.token,status]);
  async function review(result,action){
    setBusyId(result.id);setError('');setMessage('');
    try{
      const note=notes[result.id]||'';
      if(action==='request_changes'&&note.trim().length<10)throw new Error('Add a review note of at least 10 characters before requesting changes.');
      const response=await fetch(`/api/results/${encodeURIComponent(result.id)}/review`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({action,note})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Could not update the result review.');
      setMessage(payload.message);setResults(current=>current.map(item=>item.id===result.id?{...item,publicationStatus:payload.publicationStatus,reviewNote:payload.reviewNote,reviewedAt:payload.reviewedAt}:item));
    }catch(err){setError(err.message)}finally{setBusyId('')}
  }
  const filters=[['draft','Draft queue'],['needs_revision','Needs revision'],['published','Published']];
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> ACADEMICS <span className="eyebrow-sep">/</span> RESULT REVIEW</div><h1>Assessment results</h1><p>Review teacher submissions and decide when results are visible to students and parents.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onBack}><LayoutDashboard size={15}/> Back to dashboard</button></div></div>
    <div className="results-review-filters">{filters.map(([value,label])=><button key={value} className={`button ${status===value?'button-primary':'button-secondary'}`} onClick={()=>setStatus(value)}>{label}</button>)}<span className="directory-count">{loading?'Loading…':`${results.length} records`}</span></div>
    {message&&<div className="notice">{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}{error&&<div className="auth-error" role="alert">{error}</div>}
    <div className="panel results-review-panel"><div className="panel-heading"><div><h2>{filters.find(([value])=>value===status)?.[1]}</h2><p>Student and parent portals show published results only.</p></div><ShieldCheck size={18}/></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>CLASS</th><th>SUBJECT</th><th>ASSESSMENT</th><th>SCORE</th><th>REVIEW NOTE</th><th>ACTION</th></tr></thead><tbody>{results.map(result=><tr key={result.id}><td>{result.student?.full_name||'—'}</td><td>{result.student?.class_name||'—'}</td><td>{result.subject?.name||'—'}</td><td>{result.assessmentName}<small className="result-session">{result.term} · {result.session}</small></td><td><strong>{result.score} / {result.maxScore}</strong></td><td>{result.publicationStatus==='published'?<span>{result.reviewNote||'—'}</span>:<textarea className="review-note-input" value={notes[result.id]??''} onChange={event=>setNotes(current=>({...current,[result.id]:event.target.value}))} maxLength={500} placeholder="Explain any requested changes" aria-label={`Review note for ${result.student?.full_name||'student'}`} />}</td><td><div className="result-review-actions">{result.publicationStatus!=='published'?<><button className="button button-primary review-action" disabled={busyId===result.id} onClick={()=>review(result,'publish')}>{busyId===result.id?'Saving…':'Publish'}</button><button className="text-link delete-student-button" disabled={busyId===result.id} onClick={()=>review(result,'request_changes')}>Request changes</button></>:<span className="result-review-status result-status-published">Published</span>}<span className={`result-review-status result-status-${result.publicationStatus}`}>{result.publicationStatus?.replace('_',' ')}</span></div></td></tr>)}</tbody></table>{!loading&&!results.length&&!error&&<div className="empty-state">No results in this review queue.</div>}</div></div>
  </>;
}

function ModuleView({active, data, notice, onClearNotice, onBack, onExport, auth, onClassCreated, onSubjectCreated}) {
  const [className, setClassName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [saving, setSaving] = useState('');
  const [formError, setFormError] = useState('');
  const copy = {
    Staff: ['Staff directory', 'Keep teaching and administrative staff information together.'],
    'Classes & subjects': ['Classes & subjects', 'Review the school structure used for student placement.'],
    Attendance: ['Attendance', 'Daily class attendance and follow-up for students.'],
    Examinations: ['Examinations & results', 'Assessment entry, review, approval, and report cards.'],
    Timetable: ['Class timetable', 'Weekly lesson schedules for classes and teaching staff.'],
    'Fees & payments': ['Fees & payments', 'Fee collection, invoices, receipts, and balances.'],
    Announcements: ['Announcements', 'Important school updates for families and staff.'],
    Settings: ['School settings', 'School identity and academic year configuration.'],
    'School calendar': ['School calendar', 'Term dates, examinations, meetings, and school events.'],
  }[active] || [active, 'School administration workspace.'];
  const available = active === 'Classes & subjects';
  async function createCatalogItem(kind) {
    const isClass = kind === 'class';
    const name = (isClass ? className : subjectName).trim();
    if (!name) { setFormError(`Enter a ${isClass ? 'class' : 'subject'} name.`); return; }
    setSaving(kind); setFormError('');
    try {
      const response = await fetch(`/api/${isClass ? 'classes' : 'subjects'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify(isClass ? { name } : { name, code: subjectCode }) });
      const item = await readApiResponse(response, `Could not add ${isClass ? 'class' : 'subject'}.`);
      if (isClass) { onClassCreated(item); setClassName(''); }
      else { onSubjectCreated(item); setSubjectName(''); setSubjectCode(''); }
    } catch (error) { setFormError(error.message); }
    finally { setSaving(''); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> NORTHSTAR ACADEMY <span className="eyebrow-sep">/</span> {active.toUpperCase()}</div><h1>{copy[0]}</h1><p>{copy[1]}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onBack}><LayoutDashboard size={15}/> Back to dashboard</button></div></div>
    {notice && <div className="notice"><Check size={15}/>{notice}<button onClick={onClearNotice}><X size={14}/></button></div>}
    {available ? <><div className="setup-grid"><div className="panel setup-panel"><div className="panel-heading"><div><h2>Classes</h2><p>{data.classes.length} class groups configured</p></div></div><form className="catalog-add-form" onSubmit={event=>{event.preventDefault();createCatalogItem('class')}}><input aria-label="New class name" value={className} onChange={event=>setClassName(event.target.value)} placeholder="e.g. JSS 1C" maxLength={80}/><button className="button button-primary" disabled={saving==='class'}><Plus size={15}/>{saving==='class'?'Saving…':'Add class'}</button></form><div className="chip-list">{data.classes.map(item=><span className="setup-chip" key={item}>{item}</span>)}</div></div><div className="panel setup-panel"><div className="panel-heading"><div><h2>Subjects</h2><p>{data.subjects.length} subjects in the school catalog</p></div></div><form className="catalog-add-form subject-add-form" onSubmit={event=>{event.preventDefault();createCatalogItem('subject')}}><input aria-label="New subject name" value={subjectName} onChange={event=>setSubjectName(event.target.value)} placeholder="e.g. Agricultural Science" maxLength={100}/><input aria-label="Subject code (optional)" value={subjectCode} onChange={event=>setSubjectCode(event.target.value)} placeholder="Code (optional)" maxLength={20}/><button className="button button-primary" disabled={saving==='subject'}><Plus size={15}/>{saving==='subject'?'Saving…':'Add subject'}</button></form><div className="chip-list">{data.subjects.map(item=><span className="setup-chip subject-chip" key={item}><BookOpen size={14}/>{item}</span>)}</div></div><div className="panel setup-panel setup-wide"><div className="panel-heading"><div><h2>Student distribution</h2><p>Current enrollment by class</p></div><button className="text-link" onClick={onExport}><Download size={14}/> Export students</button></div><div className="class-summary">{data.classes.map(name=>{const count=data.students.filter(student=>student.className===name).length;return <div className="class-summary-row" key={name}><span>{name}</span><div><i style={{width:`${Math.max(3,Math.min(100,count*12))}%`}}/></div><strong>{count}</strong></div>})}</div></div></div>{formError&&<div className="auth-error catalog-error" role="alert">{formError}</div>}</> : <div className="module-placeholder panel"><div className="placeholder-icon"><Sparkles size={21}/></div><span className="coming-soon">MODULE IN PROGRESS</span><h2>{copy[0]} is on the roadmap</h2><p>This section will become interactive as the matching school workflows are implemented. Your current dashboard and student directory are available now.</p><div className="placeholder-actions"><button className="button button-primary" onClick={onBack}><LayoutDashboard size={15}/> Return to dashboard</button><button className="button button-secondary" onClick={onExport}><Download size={15}/> Export student list</button></div></div>}
  </>;
}

function LandingPage({onEnter,onTeacherSignup,onParentSignup,onStudentRegistration}) {
  return <div className="landing-page">
    <header className="landing-nav"><a className="landing-brand" href="#top"><span className="brand-mark"><Sparkles size={19}/></span><span>northstar</span></a><nav><a href="#platform">Platform</a><a href="#modules">Modules</a><a href="#about">About</a><button className="landing-nav-action" onClick={onStudentRegistration}>Student registration</button><button className="landing-nav-action" onClick={onParentSignup}>Parent sign up</button><button className="landing-nav-action" onClick={onTeacherSignup}>Teacher sign up</button></nav><div><button className="landing-signin" onClick={onEnter}>Sign in</button><button className="button button-primary landing-cta" onClick={onEnter}>Open portal <ArrowRight size={15}/></button></div></header>
    <main id="top"><section className="landing-hero"><div className="hero-copy"><span className="hero-badge"><span/> SCHOOL MANAGEMENT, MADE CLEAR</span><h1>More time for <span>what matters.</span></h1><p>One connected workspace for school operations, academic progress, and the people who make learning happen.</p><div className="hero-actions"><button className="button button-primary" onClick={onEnter}>Explore the dashboard <ArrowRight size={16}/></button><a className="hero-secondary" href="#modules">See what’s included <ChevronDown size={15}/></a></div><div className="hero-proof"><div className="proof-avatars"><span>A</span><span>T</span><span>S</span></div><p>Made for the whole school community<br/><strong>Students · Families · Educators</strong></p></div></div><div className="hero-visual"><img className="landing-classroom-image" src="/images/nigerian-classroom-lesson.png" alt="A Nigerian secondary school teacher leading an English lesson with students."/><div className="visual-glow"/><div className="preview-window"><div className="preview-top"><div className="preview-dots"><i/><i/><i/></div><span>northstar / overview</span><button onClick={onEnter}>Open <ArrowUpRight size={12}/></button></div><div className="preview-body"><div className="preview-sidebar"><b><span/> northstar</b><i className="selected"/><i/><i/><i/><i/></div><div className="preview-content"><div className="preview-heading"><span>MONDAY, NOVEMBER 9</span><strong>Good morning, Admin</strong></div><div className="preview-stats"><div><span>STUDENTS</span><strong>1,284</strong><i/></div><div><span>STAFF</span><strong>86</strong><i/></div><div><span>ATTENDANCE</span><strong>94.8%</strong><i/></div></div><div className="preview-panels"><div className="preview-chart"><span>Attendance overview</span><div>{[42,58,49,75,62,86,70,92,76,100,88,95].map((v,i)=><i key={i} style={{height:`${v}%`}}/>)}</div></div><div className="preview-note"><span>UP NEXT</span><b>School assembly</b><small>Today · 8:30 AM</small><em>View calendar <ArrowRight size={10}/></em></div></div><div className="preview-table"><span>RECENT STUDENTS</span><i/><i/><i/></div></div></div></div><div className="floating-note"><span><Check size={14}/></span><div><strong>Everything in sync</strong><small>One clear view of your school</small></div></div><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/></div></section>
      <section className="landing-trust"><span>DESIGNED FOR THE DAILY RHYTHM OF A SCHOOL</span><div><b><GraduationCap size={17}/> STUDENT LIFE</b><b><BookOpen size={17}/> ACADEMICS</b><b><Users size={17}/> PEOPLE</b><b><Wallet size={17}/> OPERATIONS</b></div></section>
      <section className="landing-features" id="platform"><div className="section-intro"><span className="eyebrow"><span className="live-dot"/> A CALMER WAY TO RUN SCHOOL</span><h2>Everything connected.<br/><span>Nothing gets lost.</span></h2><p>Northstar brings everyday school work into one approachable place, so your team can spend less time chasing information and more time supporting students.</p></div><div className="feature-grid" id="modules"><article><div className="feature-icon mint"><GraduationCap size={20}/></div><span>01 / STUDENT RECORDS</span><h3>Every student, clearly known.</h3><p>Keep profiles, class placement, and registration details close at hand.</p></article><article><div className="feature-icon lilac"><ClipboardCheck size={20}/></div><span>02 / ACADEMIC LIFE</span><h3>Progress you can follow.</h3><p>Bring attendance, assessments, results, and timetables together.</p></article><article><div className="feature-icon peach"><Wallet size={20}/></div><span>03 / SCHOOL OPERATIONS</span><h3>Less admin in the way.</h3><p>Keep fees, notices, and key school dates visible to the right people.</p></article></div></section>
      <section className="landing-bottom" id="about"><div><span className="eyebrow"><span className="live-dot"/> A THOUGHTFUL FOUNDATION</span><h2>Built around the people<br/>behind every school day.</h2></div><div><p>Northstar is a starting point for a more connected school experience: practical tools for administrators, teachers, students, and families, shaped around how schools actually work.</p><button className="button button-dark" onClick={onEnter}>Take a look inside <ArrowRight size={15}/></button></div></section>
    </main><footer className="landing-footer"><a className="landing-brand" href="#top"><span className="brand-mark"><Sparkles size={17}/></span><span>northstar</span></a><span>Clearer school days start here.</span><span>© 2026 Northstar Academy</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);

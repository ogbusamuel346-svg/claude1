import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3001);
const root = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(root, '../data/school.json');
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
if (process.env.NODE_ENV === 'production' && !supabaseConfigured) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured in production.');
const supabaseAuth = supabaseConfigured ? createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }) : null;
const DEMO_PASSWORD = 'SchoolDemo2026!';
const ADMIN_ROLES = ['school_admin'];
const MANAGEMENT_ROLES = [...ADMIN_ROLES];
const accounts = [
  { email: 'admin@northstar.demo', role: 'school_admin', name: 'Admin Officer', title: 'School administrator' },
  { email: 'teacher@northstar.demo', role: 'teacher', name: 'Samuel Adeola', title: 'Mathematics teacher', classes: ['JSS 2A', 'JSS 2B'], subjects: ['Mathematics', 'Basic Science'] },
  { email: 'student@northstar.demo', role: 'student', name: 'Amara Okafor', title: 'Student · JSS 2A', studentId: 'STU-2401', className: 'JSS 2A' },
  { email: 'parent@northstar.demo', role: 'parent', name: 'Chika Okafor', title: 'Parent / guardian', studentId: 'STU-2401', childName: 'Amara Okafor', className: 'JSS 2A' },
  { email: 'bursar@northstar.demo', role: 'bursar', name: 'Rose Eze', title: 'Accountant / bursar' },
  { email: 'librarian@northstar.demo', role: 'librarian', name: 'Peter Akin', title: 'Librarian' },
];
const tokenSecret = process.env.DEMO_SESSION_SECRET ? Buffer.from(process.env.DEMO_SESSION_SECRET) : randomBytes(32);
const loginAttempts = new Map();
const studentApplicationAttempts = new Map();
const initial = {
  school: { name: 'Northstar Academy', session: '2026/2027', term: 'First term' },
  students: [
    { id: 'STU-2401', name: 'Amara Okafor', className: 'JSS 2A', guardian: 'Chika Okafor', status: 'Active' },
    { id: 'STU-2402', name: 'Daniel Mensah', className: 'SSS 1B', guardian: 'Esi Mensah', status: 'Active' },
    { id: 'STU-2403', name: 'Zainab Bello', className: 'JSS 3A', guardian: 'Musa Bello', status: 'Pending' },
    { id: 'STU-2404', name: 'Tomi Adeyemi', className: 'SSS 2A', guardian: 'Kemi Adeyemi', status: 'Active' },
    { id: 'STU-2405', name: 'Chidi Nwosu', className: 'JSS 1B', guardian: 'Ada Nwosu', status: 'Active' },
  ],
  classes: ['JSS 1A', 'JSS 1B', 'JSS 2A', 'JSS 2B', 'JSS 3A', 'SSS 1A', 'SSS 1B', 'SSS 2A', 'SSS 3A'],
  subjects: ['Mathematics', 'English Language', 'Basic Science', 'Social Studies', 'Civic Education', 'Computer Studies'],
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function readStore() {
  try { return JSON.parse(await readFile(storePath, 'utf8')); }
  catch { await mkdir(path.dirname(storePath), { recursive: true }); await writeFile(storePath, JSON.stringify(initial, null, 2)); return structuredClone(initial); }
}
async function saveStore(data) { await writeFile(storePath, JSON.stringify(data, null, 2)); }
function normalizeStudent(row) {
  return { id: row.id, name: row.full_name ?? row.name, className: row.class_name ?? row.className, guardian: row.guardian_name ?? row.guardian ?? 'Not provided', status: row.status, admissionNumber: row.admission_number ?? row.admissionNumber ?? row.id, createdAt: row.created_at ?? row.createdAt ?? null };
}

function signToken(account) {
  const payload = Buffer.from(JSON.stringify({ sub: account.email, role: account.role, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })).toString('base64url');
  const signature = createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', tokenSecret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!claims.sub || claims.exp < Date.now() / 1000) return null;
    return accounts.find(account => account.email === claims.sub && account.role === claims.role) || null;
  } catch { return null; }
}
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (supabaseConfigured) {
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    try {
      const { data: verified, error: authError } = await supabaseAuth.auth.getClaims(token);
      const claims = verified?.claims;
      if (authError || !claims?.sub) return res.status(401).json({ message: 'Your Supabase session is invalid or expired.' });
      const scopedClient = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: profile, error: profileError } = await scopedClient.from('profiles').select('id, role, full_name').eq('id', claims.sub).maybeSingle();
      if (profileError) return res.status(403).json({ message: 'Could not read the account profile. Check the Supabase schema and row policies.' });
      if (!profile) return res.status(403).json({ message: 'This account has no school profile yet.' });
      req.supabase = scopedClient;
      req.user = { id: claims.sub, email: claims.email || '', role: profile.role, name: profile.full_name || claims.email || 'School user', title: profile.role.replaceAll('_', ' ') };
      return next();
    } catch (error) { return next(error); }
  }
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ message: 'Please sign in to continue.' });
  req.user = user;
  next();
}
function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Your account does not have access to this section.' });
}

app.get('/api/health', async (_req, res) => {
  let database = 'local-json-demo';
  if (supabaseConfigured) {
    try { const { error } = await supabaseAuth.from('school_settings').select('id').limit(1); database = error ? 'supabase-unavailable' : 'supabase'; }
    catch { database = 'supabase-unavailable'; }
  }
  res.json({ status: database.includes('unavailable') ? 'degraded' : 'ok', service: 'ssms-api', database });
});

app.get('/api/auth/demo-accounts', (_req, res) => {
  if (supabaseConfigured || process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Demo accounts are not available.' });
  res.json({ password: DEMO_PASSWORD, accounts: accounts.map(({ email, role, name, title }) => ({ email, role, name, title })) });
});
app.post('/api/auth/login', (req, res) => {
  if (supabaseConfigured || process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Use Supabase Auth to sign in.' });
  const ip = req.ip || 'unknown';
  const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  if (attempt.blockedUntil > Date.now()) return res.status(429).json({ message: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const account = accounts.find(item => item.email === email);
  const salt = `northstar-demo:${email}`;
  const submitted = scryptSync(password, salt, 32);
  const expected = scryptSync(DEMO_PASSWORD, salt, 32);
  if (!account || !timingSafeEqual(submitted, expected)) {
    attempt.count += 1;
    if (attempt.count >= 8) { attempt.count = 0; attempt.blockedUntil = Date.now() + 5 * 60 * 1000; }
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  loginAttempts.delete(ip);
  res.json({ token: signToken(account), user: { email: account.email, role: account.role, name: account.name, title: account.title } });
});
app.get('/api/auth/me', authenticate, (req, res) => res.json({ email: req.user.email, role: req.user.role, name: req.user.name, title: req.user.title }));

app.get('/api/public/classes', async (_req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Online student registration requires a configured Supabase project.' });
    const { data, error } = await supabaseAuth.from('school_classes').select('name').is('archived_at', null).order('sort_order').order('name');
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return res.status(503).json({ message: 'School classes are not available yet. Apply the Supabase school schema and admissions migration, then refresh this page.' });
      if (error.code === '42501' || error.code === 'PGRST301') return res.status(503).json({ message: 'Supabase is blocking public class-list access. Apply the latest student admissions migration to add the public read policy.' });
      console.error('Public classes query failed:', error.code, error.message);
      return res.status(502).json({ message: `Could not load classes from Supabase (${error.code || 'database error'}). Check the API server terminal.` });
    }
    res.json(data.map(item => item.name));
  } catch (error) { next(error); }
});

app.post('/api/student-applications', async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Online student registration requires a configured Supabase project.' });
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const attempt = studentApplicationAttempts.get(ip) || { count: 0, startedAt: now };
    if (now - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = now; }
    if (attempt.count >= 5) return res.status(429).json({ message: 'Too many applications were submitted from this connection. Please try again later.' });
    const body = req.body || {};
    const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : '';
    const requestedClass = typeof body.requestedClass === 'string' ? body.requestedClass.trim() : '';
    const guardianName = typeof body.guardianName === 'string' ? body.guardianName.trim() : '';
    const guardianEmail = typeof body.guardianEmail === 'string' ? body.guardianEmail.trim().toLowerCase() : '';
    const guardianPhone = typeof body.guardianPhone === 'string' ? body.guardianPhone.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const previousSchool = typeof body.previousSchool === 'string' ? body.previousSchool.trim() : '';
    const dateOfBirth = typeof body.dateOfBirth === 'string' && body.dateOfBirth ? body.dateOfBirth : null;
    const gender = ['Female', 'Male', 'Prefer not to say'].includes(body.gender) ? body.gender : null;
    if (studentName.length < 2 || studentName.length > 160 || guardianName.length < 2 || guardianName.length > 160) return res.status(400).json({ message: 'Enter the student’s full name and parent or guardian name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail) || guardianPhone.length < 7 || guardianPhone.length > 40) return res.status(400).json({ message: 'Enter a valid guardian email and phone number.' });
    if (requestedClass.length < 1 || address.length < 5 || address.length > 500 || previousSchool.length > 160) return res.status(400).json({ message: 'Choose a requested class and provide a valid home address.' });
    if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`)) || Date.parse(`${dateOfBirth}T00:00:00Z`) > now)) return res.status(400).json({ message: 'Enter a valid date of birth that is not in the future.' });
    const reference = `APP-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const { error } = await supabaseAuth.from('student_applications').insert({
      reference, student_full_name: studentName, date_of_birth: dateOfBirth, gender,
      requested_class: requestedClass, guardian_name: guardianName, guardian_email: guardianEmail,
      guardian_phone: guardianPhone, address, previous_school: previousSchool,
    });
    if (error) {
      if (error.code === '23503') return res.status(400).json({ message: 'That class is no longer available. Refresh the registration form and choose a current class.' });
      if (error.code === '42P01' || error.code === 'PGRST205') return res.status(503).json({ message: 'The student admissions migration is not installed yet.' });
      throw error;
    }
    attempt.count += 1;
    studentApplicationAttempts.set(ip, attempt);
    res.status(201).json({ reference, message: 'Application received. The school administrator will review it before creating the student record.' });
  } catch (error) { next(error); }
});

app.get('/api/student-applications', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Student admissions require a configured Supabase project.' });
    const status = String(req.query.status || 'pending');
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return res.status(400).json({ message: 'Choose a valid application status.' });
    let query = req.supabase.from('student_applications').select('id, reference, student_full_name, date_of_birth, gender, requested_class, guardian_name, guardian_email, guardian_phone, address, previous_school, status, review_note, student_id, created_at').order('created_at', { ascending: false }).limit(300);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.post('/api/student-applications/:id/approve', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Student admissions require a configured Supabase project.' });
    const { data, error } = await req.supabase.rpc('approve_student_application', { p_application_id: req.params.id });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: error.message });
      if (error.code === '22023') return res.status(409).json({ message: error.message });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'Apply the student admissions migration before approving applications.' });
      throw error;
    }
    const row = data?.student;
    if (!row?.id) return res.status(500).json({ message: 'The application was approved, but no student record was returned. Refresh the student directory and check the admissions queue.' });
    res.json({ student: normalizeStudent(row), alreadyApproved: Boolean(data?.alreadyApproved), message: data?.alreadyApproved ? 'This application was already approved.' : 'Application approved and student added to the register.' });
  } catch (error) { next(error); }
});

app.post('/api/student-applications/:id/reject', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Student admissions require a configured Supabase project.' });
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const { data, error } = await req.supabase.rpc('reject_student_application', { p_application_id: req.params.id, p_note: note });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: error.message });
      if (error.code === '22023') return res.status(400).json({ message: error.message });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'Apply the student admissions migration before reviewing applications.' });
      throw error;
    }
    res.json({ ...data, message: 'Application marked as rejected.' });
  } catch (error) { next(error); }
});

app.get('/api/portal/summary', authenticate, async (req, res, next) => {
  try {
    const user = req.user;
    if (supabaseConfigured) {
      let students = [];
      const schoolQuery = req.supabase.from('school_settings').select('name, current_session, current_term').eq('id', 1).maybeSingle();
      let classes = [];
      let subjects = [];
      let teachingAssignments = [];
      let studentCount = 0;
      if (user.role === 'teacher') {
        const [school, assignmentRows] = await Promise.all([
          schoolQuery,
          req.supabase.from('teaching_assignments').select('id, class_id, subject_id, school_classes!inner(id, name), subjects!inner(id, name, code)').eq('teacher_id', user.id).order('created_at'),
        ]);
        if (school.error) throw school.error;
        if (assignmentRows.error) throw assignmentRows.error;
        teachingAssignments = assignmentRows.data.map(item => ({ id: item.id, classId: item.class_id, className: item.school_classes.name, subjectId: item.subject_id, subjectName: item.subjects.name, subjectCode: item.subjects.code }));
        classes = [...new Set(teachingAssignments.map(item => item.className))];
        subjects = [...new Set(teachingAssignments.map(item => item.subjectName))];
        if (classes.length) {
          const { count, error: studentError } = await req.supabase.from('students').select('id', { count: 'exact', head: true }).in('class_name', classes).neq('status', 'Archived');
          if (studentError) throw studentError;
          studentCount = count || 0;
        }
        return res.json({ user: { email: user.email, role: user.role, name: user.name, title: user.title }, school: school.data ? { name: school.data.name, session: school.data.current_session, term: school.data.current_term } : null, students, studentCount, classes, subjects, teachingAssignments });
      }      if (user.role === 'student') {
        const [school, studentRows] = await Promise.all([
          schoolQuery,
          req.supabase.from('students').select('id, full_name, class_name, guardian_name, status, admission_number, created_at').eq('user_id', user.id),
        ]);
        if (school.error) throw school.error;
        if (studentRows.error) throw studentRows.error;
        students = studentRows.data.map(normalizeStudent);
        return res.json({ user: { email: user.email, role: user.role, name: user.name, title: user.title }, school: school.data ? { name: school.data.name, session: school.data.current_session, term: school.data.current_term } : null, students, classes, subjects });
      }
      if (user.role === 'parent') {
        const [school, links] = await Promise.all([
          schoolQuery,
          req.supabase.from('parent_student_links').select('student:students(id, full_name, class_name, guardian_name, status, admission_number, created_at)').eq('parent_id', user.id),
        ]);
        if (school.error) throw school.error;
        if (links.error) throw links.error;
        students = links.data.map(link => link.student).filter(Boolean).map(normalizeStudent);
        return res.json({ user: { email: user.email, role: user.role, name: user.name, title: user.title }, school: school.data ? { name: school.data.name, session: school.data.current_session, term: school.data.current_term } : null, students, classes, subjects });
      }
      const { data: school, error } = await schoolQuery;
      if (error) throw error;
      return res.json({ user: { email: user.email, role: user.role, name: user.name, title: user.title }, school: school ? { name: school.name, session: school.current_session, term: school.current_term } : null, students, classes, subjects });
    }
    const store = await readStore();
    let students = [];
    if (user.role === 'student' || user.role === 'parent') students = store.students.filter(s => s.id === user.studentId);
    if (user.role === 'teacher') students = store.students.filter(s => user.classes.includes(s.className));
    res.json({ user: { email: user.email, role: user.role, name: user.name, title: user.title }, school: store.school, students, classes: user.classes || [], subjects: user.subjects || [] });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', authenticate, allowRoles(...ADMIN_ROLES), async (_req, res, next) => {
  try {
    if (supabaseConfigured) {
      const [students, classes, school, subjects] = await Promise.all([
        _req.supabase.from('students').select('id, full_name, class_name, guardian_name, status, admission_number, created_at').neq('status', 'Archived').order('created_at', { ascending: false }).limit(100),
        _req.supabase.from('school_classes').select('name').is('archived_at', null).order('sort_order').order('name'),
        _req.supabase.from('school_settings').select('name, current_session, current_term').eq('id', 1).maybeSingle(),
        _req.supabase.from('subjects').select('name').is('archived_at', null).order('name'),
      ]);
      const failed = [students, classes, school, subjects].find(result => result.error);
      if (failed) throw failed.error;
      const settings = school.data;
      return res.json({ school: settings ? { name: settings.name, session: settings.current_session, term: settings.current_term } : initial.school, students: students.data.map(normalizeStudent), classes: classes.data.map(c => c.name), subjects: subjects.data.map(s => s.name) });
    }
    const data = await readStore();
    res.json({ ...data, students: data.students.filter(s => s.status !== 'Archived') });
  } catch (error) { next(error); }
});

app.get('/api/classes', authenticate, allowRoles(...MANAGEMENT_ROLES, 'teacher'), async (req, res, next) => {
  try {
    if (supabaseConfigured) {
      const { data, error } = await req.supabase.from('school_classes').select('id, name, sort_order').is('archived_at', null).order('sort_order').order('name');
      if (error) throw error;
      return res.json(data);
    }
    const data = await readStore();
    res.json(data.classes.filter(name => req.user.role !== 'teacher' || req.user.classes.includes(name)).map((name, sort_order) => ({ id: name, name, sort_order })));
  } catch (error) { next(error); }
});

app.post('/api/classes', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Enter a class name between 2 and 80 characters.' });
    if (supabaseConfigured) {
      const { data, error } = await req.supabase.from('school_classes').insert({ name }).select('id, name, sort_order').single();
      if (error?.code === '23505') return res.status(409).json({ message: 'A class with that name already exists.' });
      if (error) throw error;
      return res.status(201).json(data);
    }
    const store = await readStore();
    if (store.classes.some(item => item.toLowerCase() === name.toLowerCase())) return res.status(409).json({ message: 'A class with that name already exists.' });
    store.classes.push(name);
    await saveStore(store);
    res.status(201).json({ id: name, name, sort_order: store.classes.length });
  } catch (error) { next(error); }
});

app.get('/api/subjects', authenticate, allowRoles(...MANAGEMENT_ROLES, 'teacher'), async (req, res, next) => {
  try {
    if (supabaseConfigured) {
      const { data, error } = await req.supabase.from('subjects').select('id, name, code').is('archived_at', null).order('name');
      if (error) throw error;
      return res.json(data);
    }
    const data = await readStore();
    res.json(data.subjects.filter(name => req.user.role !== 'teacher' || req.user.subjects.includes(name)).map(name => ({ id: name, name, code: '' })));
  } catch (error) { next(error); }
});

app.post('/api/subjects', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (name.length < 2 || name.length > 100) return res.status(400).json({ message: 'Enter a subject name between 2 and 100 characters.' });
    if (code.length > 20) return res.status(400).json({ message: 'Subject code must be 20 characters or fewer.' });
    if (supabaseConfigured) {
      const { data, error } = await req.supabase.from('subjects').insert({ name, code: code || null }).select('id, name, code').single();
      if (error?.code === '23505') return res.status(409).json({ message: 'A subject with that name or code already exists.' });
      if (error) throw error;
      return res.status(201).json(data);
    }
    const store = await readStore();
    if (store.subjects.some(item => item.toLowerCase() === name.toLowerCase())) return res.status(409).json({ message: 'A subject with that name already exists.' });
    store.subjects.push(name);
    await saveStore(store);
    res.status(201).json({ id: name, name, code });
  } catch (error) { next(error); }
});

app.get('/api/teachers', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Teacher assignments require a configured Supabase project.' });
    const { data, error } = await req.supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name').order('email');
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/teaching-assignments', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Teacher assignments require a configured Supabase project.' });
    const { data, error } = await req.supabase.from('teaching_assignments').select('id, teacher_id, class_id, subject_id, teacher:profiles!teaching_assignments_teacher_id_fkey(full_name), class:school_classes!teaching_assignments_class_id_fkey(name), subject:subjects!teaching_assignments_subject_id_fkey(name)').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    res.json(data.map(item => ({ id: item.id, teacherId: item.teacher_id, teacherName: item.teacher?.full_name || 'Teacher', classId: item.class_id, className: item.class?.name || 'Class', subjectId: item.subject_id, subjectName: item.subject?.name || 'Subject' })));
  } catch (error) { next(error); }
});

app.post('/api/teaching-assignments', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Teacher assignments require a configured Supabase project.' });
    const { teacherId, classId, subjectId } = req.body || {};
    if (![teacherId, classId, subjectId].every(value => typeof value === 'string' && value.trim())) return res.status(400).json({ message: 'Select a teacher, class, and subject.' });
    const [teacher, classRecord, subject] = await Promise.all([
      req.supabase.from('profiles').select('id, full_name, role').eq('id', teacherId).maybeSingle(),
      req.supabase.from('school_classes').select('id, name').eq('id', classId).maybeSingle(),
      req.supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle(),
    ]);
    const failed = [teacher, classRecord, subject].find(result => result.error);
    if (failed) throw failed.error;
    if (!teacher.data || teacher.data.role !== 'teacher') return res.status(404).json({ message: 'Choose an existing account with the Teacher role.' });
    if (!classRecord.data || !subject.data) return res.status(404).json({ message: 'The selected class or subject could not be found.' });
    const { data, error } = await req.supabase.from('teaching_assignments').insert({ teacher_id: teacherId, class_id: classId, subject_id: subjectId }).select('id').single();
    if (error) { if (error.code === '23505') return res.status(409).json({ message: 'This teacher is already assigned to that class and subject.' }); throw error; }
    res.status(201).json({ id: data.id, teacherId, teacherName: teacher.data.full_name || 'Teacher', classId, className: classRecord.data.name, subjectId, subjectName: subject.data.name });
  } catch (error) { next(error); }
});

app.delete('/api/teaching-assignments/:id', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Teacher assignments require a configured Supabase project.' });
    const { data, error } = await req.supabase.from('teaching_assignments').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Teaching assignment not found.' });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.get('/api/teacher/classes/:classId/roster', authenticate, allowRoles('teacher'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Teacher class assignments require a configured Supabase project.' });
    const { data: assignment, error: assignmentError } = await req.supabase.from('teaching_assignments').select('class_id, school_classes!inner(id, name)').eq('teacher_id', req.user.id).eq('class_id', req.params.classId).limit(1).maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(403).json({ message: 'This class is not assigned to your account.' });
    const { data, error } = await req.supabase.from('students').select('id, full_name, class_name, guardian_name, status, admission_number').eq('class_name', assignment.school_classes.name).neq('status', 'Archived').order('full_name').limit(500);
    if (error) throw error;
    res.json({ className: assignment.school_classes.name, students: data.map(normalizeStudent) });
  } catch (error) { next(error); }
});

app.get('/api/attendance', authenticate, allowRoles('school_admin', 'teacher', 'student', 'parent'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Attendance requires a configured Supabase project.' });
    const isTeacher = req.user.role === 'teacher';
    const date = String(req.query.date || '');
    const className = String(req.query.className || '').trim();
    if (isTeacher && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !className)) return res.status(400).json({ message: 'Choose a class and valid attendance date.' });
    let query = req.supabase.from('attendance_records').select('id, student_id, attendance_date, status, notes, recorded_by, student:students!inner(id, full_name, class_name, admission_number)').order('attendance_date', { ascending: false });
    if (isTeacher) query = query.eq('attendance_date', date).eq('student.class_name', className).limit(200);
    else query = query.limit(100);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data.map(item => ({ id: item.id, studentId: item.student_id, date: item.attendance_date, status: item.status, notes: item.notes, student: item.student })));
  } catch (error) { next(error); }
});

app.put('/api/attendance', authenticate, allowRoles('school_admin', 'teacher'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Attendance requires a configured Supabase project.' });
    const { date, records } = req.body || {};
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(400).json({ message: 'Provide a valid attendance date.' });
    if (!Array.isArray(records) || records.length < 1 || records.length > 200) return res.status(400).json({ message: 'Submit between 1 and 200 student attendance records.' });
    const allowedStatuses = new Set(['Present', 'Absent', 'Late', 'Excused']);
    const studentIds = records.map(record => record?.studentId);
    if (studentIds.some(id => typeof id !== 'string' || !id) || new Set(studentIds).size !== studentIds.length || records.some(record => !allowedStatuses.has(record?.status))) return res.status(400).json({ message: 'Each student must have one valid attendance status.' });
    if (records.some(record => typeof record.notes === 'string' && record.notes.length > 500)) return res.status(400).json({ message: 'Attendance notes must be 500 characters or fewer.' });
    const rows = records.map(record => ({ student_id: record.studentId, attendance_date: date, status: record.status, notes: typeof record.notes === 'string' ? record.notes.trim() : '', recorded_by: req.user.id }));
    const { data, error } = await req.supabase.from('attendance_records').upsert(rows, { onConflict: 'student_id,attendance_date' }).select('id, student_id, attendance_date, status, notes');
    if (error) throw error;
    res.json({ saved: data.length });
  } catch (error) { next(error); }
});

app.get('/api/results', authenticate, allowRoles('school_admin', 'teacher', 'student', 'parent'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Assessment results require a configured Supabase project.' });
    let query = req.supabase.from('assessment_results').select('id, student_id, subject_id, school_session, term, assessment_name, score, max_score, publication_status, reviewed_by, reviewed_at, review_note, created_at, student:students!inner(id, full_name, class_name, admission_number), subject:subjects(id, name)').order('created_at', { ascending: false });
    if (req.user.role === 'teacher') {
      const { className, subjectId, schoolSession, term, assessmentName } = req.query;
      if (![className, subjectId, schoolSession, term, assessmentName].every(value => typeof value === 'string' && value.trim())) return res.status(400).json({ message: 'Choose a class, subject, session, term, and assessment.' });
      const { data: assigned, error: assignmentError } = await req.supabase.from('teaching_assignments').select('id, class:school_classes!inner(name)').eq('teacher_id', req.user.id).eq('subject_id', subjectId).eq('class.name', className).limit(1).maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assigned) return res.status(403).json({ message: 'This class and subject are not assigned to your account.' });
      query = query.eq('student.class_name', className).eq('subject_id', subjectId).eq('school_session', schoolSession).eq('term', term).eq('assessment_name', assessmentName);    } else if (req.user.role === 'school_admin') {
      const status = String(req.query.status || 'draft');
      if (status !== 'all') {
        if (!['draft', 'needs_revision', 'published'].includes(status)) return res.status(400).json({ message: 'Choose a valid result review status.' });
        query = query.eq('publication_status', status);
      }
      query = query.limit(500);
    } else query = query.eq('publication_status', 'published').limit(300);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data.map(item => ({ id: item.id, studentId: item.student_id, subjectId: item.subject_id, session: item.school_session, term: item.term, assessmentName: item.assessment_name, score: Number(item.score), maxScore: Number(item.max_score), publicationStatus: item.publication_status, reviewedBy: item.reviewed_by, reviewedAt: item.reviewed_at, reviewNote: item.review_note, student: item.student, subject: item.subject })));
  } catch (error) { next(error); }
});

app.put('/api/results', authenticate, allowRoles('school_admin', 'teacher'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Assessment results require a configured Supabase project.' });
    if (req.user.role === 'teacher') return res.status(400).json({ message: 'Teachers must submit the complete class result sheet from the Results tab.' });
    const { subjectId, schoolSession, term, assessmentName, maxScore, records } = req.body || {};
    const max = Number(maxScore);
    if (typeof subjectId !== 'string' || !subjectId || typeof schoolSession !== 'string' || !schoolSession.trim() || typeof term !== 'string' || !term.trim() || typeof assessmentName !== 'string' || !assessmentName.trim() || assessmentName.length > 80 || !Number.isFinite(max) || max <= 0 || max > 10000) return res.status(400).json({ message: 'Provide a subject, session, term, assessment name, and valid maximum score.' });
    if (!Array.isArray(records) || records.length < 1 || records.length > 200) return res.status(400).json({ message: 'Submit between 1 and 200 student scores.' });
    const studentIds = records.map(record => record?.studentId);
    if (studentIds.some(id => typeof id !== 'string' || !id) || new Set(studentIds).size !== studentIds.length || records.some(record => record.score === '' || !Number.isFinite(Number(record.score)) || Number(record.score) < 0 || Number(record.score) > max)) return res.status(400).json({ message: `Each student must have one score from 0 to ${max}.` });
    const rows = records.map(record => ({ student_id: record.studentId, subject_id: subjectId, school_session: schoolSession.trim(), term: term.trim(), assessment_name: assessmentName.trim(), score: Number(record.score), max_score: max, recorded_by: req.user.id, publication_status: 'draft', reviewed_by: null, reviewed_at: null, review_note: '' }));
    const { data, error } = await req.supabase.from('assessment_results').upsert(rows, { onConflict: 'student_id,subject_id,school_session,term,assessment_name' }).select('id, student_id, score, max_score');
    if (error) throw error;
    res.json({ saved: data.length });
  } catch (error) { next(error); }
});

app.put('/api/results/batch', authenticate, allowRoles('teacher'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Result submission requires a configured Supabase project.' });
    const { classId, schoolSession, term, assessmentName, records } = req.body || {};
    if (typeof classId !== 'string' || !classId || typeof schoolSession !== 'string' || !schoolSession.trim() || typeof term !== 'string' || !term.trim() || typeof assessmentName !== 'string' || !assessmentName.trim() || assessmentName.trim().length > 80) return res.status(400).json({ message: 'Choose an assigned class and provide the session, term, and assessment name.' });
    if (!Array.isArray(records) || records.length < 1 || records.length > 2000) return res.status(400).json({ message: 'The result sheet must contain between 1 and 2,000 scores.' });

    const { data: assignments, error: assignmentsError } = await req.supabase.from('teaching_assignments').select('class_id, subject_id, school_classes!inner(id, name), subjects!inner(id, name)').eq('teacher_id', req.user.id).eq('class_id', classId);
    if (assignmentsError) throw assignmentsError;
    if (!assignments.length) return res.status(403).json({ message: 'This class is not assigned to your account.' });
    const className = assignments[0].school_classes.name;
    const subjectIds = [...new Set(assignments.map(item => item.subject_id))];
    const { data: students, error: studentsError } = await req.supabase.from('students').select('id, admission_number').eq('class_name', className).neq('status', 'Archived').limit(500);
    if (studentsError) throw studentsError;
    if (!students.length) return res.status(400).json({ message: 'There are no active students in this class.' });

    const allowedPairs = new Set(subjectIds.flatMap(subjectId => students.map(student => `${student.id}:${subjectId}`)));
    const submittedPairs = new Set();
    const rows = [];
    for (const record of records) {
      const score = Number(record?.score);
      const maxScore = Number(record?.maxScore);
      const pair = `${record?.studentId}:${record?.subjectId}`;
      if (!allowedPairs.has(pair)) return res.status(400).json({ message: 'The result sheet contains a student or subject outside this teacher’s class assignment.' });
      if (submittedPairs.has(pair)) return res.status(400).json({ message: 'The result sheet contains a duplicate student and subject.' });
      if (record.score === '' || !Number.isFinite(score) || !Number.isFinite(maxScore) || score < 0 || maxScore <= 0 || score > maxScore || maxScore > 10000) return res.status(400).json({ message: 'Every subject score must be between zero and its valid maximum score.' });
      submittedPairs.add(pair);
      rows.push({ student_id: record.studentId, subject_id: record.subjectId, school_session: schoolSession.trim(), term: term.trim(), assessment_name: assessmentName.trim(), score, max_score: maxScore, recorded_by: req.user.id, publication_status: 'draft', reviewed_by: null, reviewed_at: null, review_note: '' });
    }
    if (submittedPairs.size !== allowedPairs.size || [...allowedPairs].some(pair => !submittedPairs.has(pair))) return res.status(400).json({ message: 'Complete every score for every active student and every subject assigned to you in this class before submitting.' });
    const { data: existingRows, error: existingError } = await req.supabase.from('assessment_results').select('student_id, subject_id, score, max_score, publication_status').in('student_id', students.map(student => student.id)).in('subject_id', subjectIds).eq('school_session', schoolSession.trim()).eq('term', term.trim()).eq('assessment_name', assessmentName.trim());
    if (existingError) throw existingError;
    const existingByPair = new Map(existingRows.map(item => [`${item.student_id}:${item.subject_id}`, item]));
    for (const row of rows) {
      const existing = existingByPair.get(`${row.student_id}:${row.subject_id}`);
      if (existing?.publication_status === 'published' && (Number(existing.score) !== row.score || Number(existing.max_score) !== row.max_score)) return res.status(409).json({ message: 'A published score is locked and cannot be changed. Contact the administrator if it must be corrected.' });
    }
    const rowsToSave = rows.filter(row => existingByPair.get(`${row.student_id}:${row.subject_id}`)?.publication_status !== 'published');
    let savedCount = 0;
    if (rowsToSave.length) {
      const { data, error } = await req.supabase.from('assessment_results').upsert(rowsToSave, { onConflict: 'student_id,subject_id,school_session,term,assessment_name' }).select('id');
      if (error) throw error;
      savedCount = data.length;
    }
    res.json({ submitted: savedCount, className, subjectCount: subjectIds.length, studentCount: students.length, message: `Submitted a complete result sheet for ${className} to the administrator for review.` });
  } catch (error) { next(error); }
});

app.patch('/api/results/:id/review', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Result review requires a configured Supabase project.' });
    const action = req.body?.action;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!['publish', 'request_changes'].includes(action)) return res.status(400).json({ message: 'Choose publish or request changes.' });
    if (action === 'request_changes' && note.length < 10) return res.status(400).json({ message: 'Provide at least 10 characters explaining the requested changes.' });
    const { data, error } = await req.supabase.rpc('review_assessment_result', { p_result_id: req.params.id, p_action: action, p_note: note });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: 'Only school administrators can review assessment results.' });
      if (error.code === 'P0001' || error.code === '22023') return res.status(409).json({ message: error.message });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'The result review migration is not installed. Apply the latest results review migration, then retry.' });
      throw error;
    }
    res.json({ ...data, message: action === 'publish' ? 'Result published to the student and linked parent.' : 'Changes requested from the teacher.' });
  } catch (error) { next(error); }
});

app.get('/api/fees/invoices', authenticate, allowRoles('school_admin', 'bursar', 'student', 'parent'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Fee management requires a configured Supabase project.' });
    const { data, error } = await req.supabase.from('fee_invoices')
      .select('id, invoice_number, student_id, title, school_session, term, amount, due_date, created_at, student:students!inner(id, full_name, class_name, admission_number), payments:fee_payments(id, amount, method, reference, note, received_by, paid_at)')
      .order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    res.json(data.map(invoice => {
      const paid = (invoice.payments || []).reduce((total, payment) => total + Number(payment.amount), 0);
      const amount = Number(invoice.amount);
      const balance = Math.max(0, amount - paid);
      const overdue = balance > 0 && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10);
      return { id: invoice.id, invoiceNumber: invoice.invoice_number, studentId: invoice.student_id, title: invoice.title, session: invoice.school_session, term: invoice.term, amount, paid, balance, dueDate: invoice.due_date, status: balance === 0 ? 'Paid' : overdue ? 'Overdue' : paid > 0 ? 'Partial' : 'Unpaid', createdAt: invoice.created_at, student: invoice.student, payments: invoice.payments || [] };
    }));
  } catch (error) { next(error); }
});

app.post('/api/fees/invoices', authenticate, allowRoles('school_admin', 'bursar'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Fee management requires a configured Supabase project.' });
    const { studentId, title, session, term, amount, dueDate } = req.body || {};
    const invoiceAmount = Number(amount);
    if (typeof studentId !== 'string' || !studentId || typeof title !== 'string' || !title.trim() || title.trim().length > 120 || typeof session !== 'string' || !session.trim() || session.trim().length > 40 || typeof term !== 'string' || !term.trim() || term.trim().length > 40 || !Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || invoiceAmount > 1000000000) return res.status(400).json({ message: 'Provide a student, fee title, session, term, and positive valid amount.' });
    if (dueDate !== null && dueDate !== undefined && dueDate !== '' && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) return res.status(400).json({ message: 'Enter a valid due date.' });
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const { data, error } = await req.supabase.from('fee_invoices').insert({ invoice_number: invoiceNumber, student_id: studentId, title: title.trim(), school_session: session.trim(), term: term.trim(), amount: invoiceAmount, due_date: dueDate || null, created_by: req.user.id }).select('id, invoice_number, student_id, title, school_session, term, amount, due_date, created_at').single();
    if (error) {
      if (error.code === '23503' || error.code === '42501') return res.status(403).json({ message: 'That student is unavailable for invoicing. Check the student record and your finance permissions.' });
      throw error;
    }
    res.status(201).json({ id: data.id, invoiceNumber: data.invoice_number, studentId: data.student_id, title: data.title, session: data.school_session, term: data.term, amount: Number(data.amount), dueDate: data.due_date, createdAt: data.created_at });
  } catch (error) { next(error); }
});

app.post('/api/fees/invoices/bulk', authenticate, allowRoles('school_admin', 'bursar'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Fee management requires a configured Supabase project.' });
    const { className, title, session, term, amount, dueDate } = req.body || {};
    const cleanClass = typeof className === 'string' ? className.trim() : '';
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanSession = typeof session === 'string' ? session.trim() : '';
    const cleanTerm = typeof term === 'string' ? term.trim() : '';
    const invoiceAmount = Number(amount);
    if (!cleanClass || cleanClass.length > 80 || !cleanTitle || cleanTitle.length > 120 || !cleanSession || cleanSession.length > 40 || !cleanTerm || cleanTerm.length > 40 || !Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || invoiceAmount > 1000000000) return res.status(400).json({ message: 'Provide a class, fee title, session, term, and positive valid amount.' });
    if (dueDate && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) return res.status(400).json({ message: 'Enter a valid due date.' });
    const { data, error } = await req.supabase.rpc('create_class_fee_invoices', { p_class_name: cleanClass, p_title: cleanTitle, p_session: cleanSession, p_term: cleanTerm, p_amount: invoiceAmount, p_due_date: dueDate || null });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: error.message });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'The class billing migration is not installed. Apply the latest class invoice migration, then retry.' });
      throw error;
    }
    res.status(201).json({ ...data, message: `${data.created} individual invoices created for ${cleanClass}.` });
  } catch (error) { next(error); }
});

app.post('/api/fees/invoices/:id/payments', authenticate, allowRoles('school_admin', 'bursar'), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Fee management requires a configured Supabase project.' });
    const amount = Number(req.body?.amount);
    const method = req.body?.method;
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'bank_transfer', 'pos', 'other'].includes(method)) return res.status(400).json({ message: 'Enter a positive payment amount and choose a valid payment method.' });
    if (reference.length > 100 || note.length > 300) return res.status(400).json({ message: 'Reference must be 100 characters or fewer and note 300 characters or fewer.' });
    const { data, error } = await req.supabase.rpc('record_fee_payment', { p_invoice_id: req.params.id, p_amount: amount, p_method: method, p_reference: reference || null, p_note: note });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: 'Only school administrators and bursars can record payments.' });
      if (error.code === '22023') return res.status(409).json({ message: error.message });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'The fee migration is not installed. Apply the latest fee invoices and payments migration, then retry.' });
      if (error.code === '23505') return res.status(409).json({ message: 'That payment reference has already been recorded.' });
      throw error;
    }
    res.status(201).json({ ...data, message: 'Payment recorded successfully.' });
  } catch (error) { next(error); }
});

app.get('/api/students', authenticate, allowRoles(...MANAGEMENT_ROLES, 'teacher', 'bursar'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    if (status === 'Archived' && req.user.role !== 'school_admin') return res.status(403).json({ message: 'Only school administrators can view archived student records.' });
    if (supabaseConfigured) {
      let query = req.supabase.from('students').select('id, full_name, class_name, guardian_name, status, admission_number, created_at', { count: 'exact' }).order('created_at', { ascending: false });
      if (status !== 'Archived') query = query.neq('status', 'Archived');
      if (q) query = query.ilike('full_name', `%${q}%`);
      if (status) query = query.eq('status', status);
      const { data, count, error } = await query.range((page - 1) * limit, page * limit - 1);
      if (error) throw error;
      return res.json({ data: data.map(normalizeStudent), page, limit, total: count || 0 });
    }
    const store = await readStore();
    const all = store.students.filter(s => status === 'Archived' ? s.status === 'Archived' : s.status !== 'Archived').filter(s => req.user.role !== 'teacher' || req.user.classes.includes(s.className)).filter(s => !status || s.status === status).filter(s => !q || `${s.name} ${s.id} ${s.className}`.toLowerCase().includes(q.toLowerCase()));
    res.json({ data: all.slice((page - 1) * limit, page * limit).map(normalizeStudent), page, limit, total: all.length });
  } catch (error) { next(error); }
});

app.get('/api/students/deletion-audit', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'The deletion audit requires a configured Supabase project.' });
    const { data, error } = await req.supabase.from('student_record_deletion_audit').select('id, student_id, admission_number, deleted_by, reason, deleted_at').order('deleted_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

app.post('/api/students', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, className, guardian, admissionNumber } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof className !== 'string' || !className.trim()) return res.status(400).json({ message: 'Student name and class are required.' });
    const student = { id: `STU-${randomUUID().slice(0, 8).toUpperCase()}`, name: name.trim(), className: className.trim(), guardian: typeof guardian === 'string' && guardian.trim() ? guardian.trim() : 'Not provided', admissionNumber: typeof admissionNumber === 'string' && admissionNumber.trim() ? admissionNumber.trim() : `ADM-${Date.now().toString().slice(-7)}`, status: 'Active' };
    if (supabaseConfigured) {
      const { data, error } = await req.supabase.from('students').insert({ id: student.id, full_name: student.name, class_name: student.className, guardian_name: student.guardian, admission_number: student.admissionNumber, status: student.status }).select('id, full_name, class_name, guardian_name, status, admission_number, created_at').single();
      if (error) { if (error.code === '23505') return res.status(409).json({ message: 'That admission number is already in use.' }); throw error; }
      return res.status(201).json(normalizeStudent(data));
    }
    const data = await readStore();
    if (data.students.some(s => s.admissionNumber === student.admissionNumber || s.id === student.admissionNumber)) return res.status(409).json({ message: 'That admission number is already in use.' });
    data.students.unshift(student);
    await saveStore(data);
    res.status(201).json(normalizeStudent(student));
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'That admission number is already in use.' });
    next(error);
  }
});

app.post('/api/students/:id/parent-link', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Parent account linking requires a configured Supabase project.' });
    const parentEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) return res.status(400).json({ message: 'Enter a valid parent account email address.' });
    const { data, error } = await req.supabase.rpc('link_parent_to_student', { p_parent_email: parentEmail, p_student_id: req.params.id });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: 'Only school administrators can link parent accounts.' });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'The parent-link database function is not installed yet. Run supabase/migrations/20261110000000_admin_parent_student_linking.sql in the Supabase SQL Editor, then retry.' });
      if (error.code === '42702') return res.status(502).json({ message: 'The parent-link SQL function has an ambiguous column reference. Apply supabase/migrations/20261114000000_fix_parent_link_ambiguous_id.sql in the Supabase SQL Editor, then retry.' });
      if (error.code === 'PGRST204' || error.code === 'PGRST205') return res.status(503).json({ message: 'Supabase has not refreshed its schema cache yet. Wait a few seconds, then retry the parent link.' });
      console.error('Parent link RPC failed:', error.code, error.message);
      return res.status(502).json({ message: `Supabase could not complete the parent link (database error ${error.code || 'unknown'}). Check the backend terminal for details.` });
    }
    res.json({ message: data?.parentName ? `${data.parentName} is linked to this student.` : 'Parent account linked to this student.' });
  } catch (error) { next(error); }
});

app.delete('/api/students/:id', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    if (!supabaseConfigured) return res.status(503).json({ message: 'Permanent student deletion requires a configured Supabase project.' });
    const admissionNumber = typeof req.body?.admissionNumber === 'string' ? req.body.admissionNumber.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!admissionNumber || reason.length < 10) return res.status(400).json({ message: 'Confirm the admission number and provide a reason of at least 10 characters.' });
    const { data, error } = await req.supabase.rpc('permanently_delete_archived_student', {
      p_student_id: req.params.id,
      p_confirm_admission_number: admissionNumber,
      p_reason: reason,
    });
    if (error) {
      if (error.code === 'P0002') return res.status(404).json({ message: error.message });
      if (error.code === '42501') return res.status(403).json({ message: 'Only school administrators can permanently delete student records.' });
      if (error.code === 'PGRST202' || error.code === '42883') return res.status(503).json({ message: 'The controlled deletion migration has not been installed. Run the latest student deletion SQL migration, then retry.' });
      if (error.code === 'P0001' || error.code === '23503') return res.status(409).json({ message: error.message });
      throw error;
    }
    res.json({ deleted: Boolean(data?.deleted), message: 'Student record permanently deleted. The action was added to the audit log.' });
  } catch (error) { next(error); }
});

app.patch('/api/students/:id', authenticate, allowRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, className, guardian, status } = req.body || {};
    if (status && !['Active', 'Pending', 'Withdrawn', 'Archived'].includes(status)) return res.status(400).json({ message: 'Status must be Active, Pending, Withdrawn, or Archived.' });
    if (supabaseConfigured) {
      const updates = {};
      if (name !== undefined) updates.full_name = String(name).trim();
      if (className !== undefined) updates.class_name = String(className).trim();
      if (guardian !== undefined) updates.guardian_name = String(guardian).trim() || 'Not provided';
      if (status !== undefined) updates.status = status;
      if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide at least one field to update.' });
      const { data, error } = await req.supabase.from('students').update(updates).eq('id', req.params.id).select('id, full_name, class_name, guardian_name, status, admission_number, created_at').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Student not found.' });
      return res.json(normalizeStudent(data));
    }
    const data = await readStore();
    const item = data.students.find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Student not found.' });
    if (name !== undefined) item.name = String(name).trim();
    if (className !== undefined) item.className = String(className).trim();
    if (guardian !== undefined) item.guardian = String(guardian).trim() || 'Not provided';
    if (status !== undefined) item.status = status;
    await saveStore(data);
    res.json(normalizeStudent(item));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'The request could not be completed.' });
});

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) app.listen(port, () => console.log(`SSMS API listening on http://localhost:${port} (${supabaseConfigured ? 'Supabase' : 'local JSON demo'} mode)`));

export default app;

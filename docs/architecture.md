# Project architecture and delivery plan

## Technology direction

The project uses **Node.js** for the backend, **React with Tailwind CSS** for the frontend, and **Supabase** for authentication, Postgres data, private file storage, and in-app realtime updates.

### Application structure

- `src/`: React single-page application, styles, and Supabase browser client.
- `server/`: Express API; each request verifies its Supabase access token and forwards that token to the database client so row-level security applies.
- `supabase/migrations/`: SQL schema, role policies, storage policies, and realtime publication setup.
- `data/school.json`: local-only demo persistence, generated on the first API request and excluded from Git.
- `docs/`: project decisions and delivery notes.

### Authentication and roles

Supabase Auth verifies school accounts. Each account has a profile with one of the supported roles: school administrator, teacher, student, parent/guardian, bursar, or librarian. The API validates the access token with Supabase before serving protected data. Database row-level security controls which school records each role can read or change. Local demo sessions are retained only when Supabase is not configured and the app is not running in production.

### Data and access

Supabase Postgres is the authoritative store for identity profiles, school settings, classes, subjects, students, parent/student links, teacher assignments, attendance, assessment results, fee invoices, and payments. SQL migrations are applied in filename order from `supabase/migrations/`. They enable row-level security on exposed tables. Student and parent visibility is scoped to the linked profile; teachers are scoped to assigned classes and subjects; administrators and bursars manage financial records. Cashier-entered payments are recorded through an invoice-locking database function to prevent concurrent overpayments.

The private `school-documents` Supabase Storage bucket has policies for authenticated school roles and a 10 MB file limit. Upload and download UI is still pending. Supabase Realtime publishes student record changes for signed-in portal refreshes. Push notifications require a later server-side function plus a push delivery provider.

## Delivery sequence

1. **Foundation:** Supabase configuration, schema, authentication, row-level security, school settings, audit logging, API conventions, and UI system.
2. **People and school structure:** admissions, students, parents, staff, classes, subjects, sessions, and terms.
3. **Academics:** assignments, attendance, assessments, result approval/publication, and report cards.
4. **Finance:** fees, invoices, payment verification, receipts, and reporting.
5. **Portals and communications:** student/parent experiences, timetable, learning materials, announcements, requests, notifications, and document upload screens.
6. **Optional modules:** library, inventory, transport, hostel, discipline, and events.
7. **Production readiness:** automated unit/integration/security checks, backups, monitoring, deployment, training, and recovery procedures.

## Data and security notes

Local demo records are not suitable for real student information. Production must be configured with Supabase and use school-managed accounts. Never expose a Supabase secret/service-role key to the browser. Official academic and financial records need audit trails and controlled state transitions. Payment status must be confirmed by trusted server-side gateway verification, never by a browser redirect alone. Multi-school tenancy and school-specific identifiers remain a later schema and policy requirement.

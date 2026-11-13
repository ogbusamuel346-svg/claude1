# Northstar School Management System

A web-based school management platform started from the supplied SSMS requirements. It currently includes the landing page, role portals, a school administration dashboard, and student registration and directory workflows.

## Technology

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide icons
- **Backend:** Node.js 20+ and Express 5
- **Authentication and data:** Supabase Auth and Supabase Postgres through the Supabase JavaScript client
- **Files and live updates:** private Supabase Storage bucket and Supabase Realtime for student record changes
- **Local preview:** JSON-backed demo mode when Supabase settings are absent; demo accounts are development-only

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed by the command (normally `http://localhost:5173`). The Express API runs on `http://localhost:3001`.

For Supabase mode, fill the existing ignored `.env` (or copy `.env.example` to `.env`) with the project URL and publishable key in both server and `VITE_` settings, then apply the SQL migrations in `supabase/migrations/` in filename order in the Supabase SQL editor. The initial migration creates profiles and school structure; later migrations add attendance, assessment results and publication review, invoices and payments, administrator parent-to-student linking, controlled student deletion, a parent-link ambiguity fix, profile email fields for the staff selector, and teacher signup/student admissions. Add users under Supabase Authentication. Newly created profiles default to `student`; promote school administrators or assign other roles from a trusted administrative context, for example:

```sql
update public.profiles p
set role = 'school_admin'
from auth.users u
where p.id = u.id and u.email = 'admin@your-school.example';
```

The client and API use the publishable key and the signed-in user's access token. Never place a Supabase secret/service-role key in a `VITE_` variable or browser code. Row-level security scopes database access. The migration creates a private `school-documents` bucket; file upload screens are not implemented yet.

## Teacher signup and student admissions

Apply `supabase/migrations/20261115000000_profile_email_for_staff_directory.sql`, `supabase/migrations/20261116000000_teacher_signup_student_admissions.sql`, then `supabase/migrations/20261117000000_parent_signup_role.sql`. The landing page and sign-in page link to **Teacher sign up**, **Parent sign up**, and **Student registration**. Teacher and parent self-signup create only their respective roles; teachers still have no class or student access until an admin assigns class-subject pairs in **Staff → Teachers & classes**. Parent accounts see children only after an administrator links them. Other public signups default to the student role, so public users cannot self-assign administrator privileges.

Student registration is an admissions application, not an enrolled student account. Families submit student and guardian details to the pending applications queue. Administrators review them under **Admissions** and can approve to create an active student record or reject with a reason. An approved student’s portal login is created and linked separately by the school administrator; the public form does not create credentials or an active school record. Public applications are insert-only, while the queue and decisions are restricted to school administrators.

## Test attendance end to end

1. Apply both SQL migrations in order if you have not already applied the second attendance migration.
2. In Supabase Auth, create or confirm one teacher, one student, and one parent user. Assign their `profiles.role` values to `teacher`, `student`, and `parent`.
3. Add a student in the admin dashboard and link that row's `user_id` to the student Auth user. Add a row to `parent_student_links` connecting the parent profile to that student.
4. Add a `teaching_assignments` row connecting the teacher profile to the student's class and a subject.
5. Sign in as the teacher, open **Attendance**, select the assigned class, choose Present/Absent/Late/Excused for each student, and save.
6. Sign in as the student or linked parent and open **Attendance** to see the saved records. The database policies restrict attendance to assigned teachers, the student, the linked parent, and the school administrator.

## Teacher class assignments and results

In Supabase, create the teacher’s Auth account and ensure `profiles.role` is `teacher`. Sign in as a school administrator, open **Staff → Teachers & classes**, and assign that teacher to each class and subject they teach. An assignment is a specific teacher, class, and subject combination. Teachers can see their assigned class names and subjects on the portal **Overview** and **My classes** tab. The roster is loaded for the selected class and includes student name, admission number, guardian, and status. Attendance and result entry use this assigned roster.

The teacher selector lists only accounts whose `profiles.role` is `teacher`. It does not create Auth accounts. Apply `supabase/migrations/20261115000000_profile_email_for_staff_directory.sql` so teacher names and emails appear instead of opaque ID fragments. Create teacher accounts in Supabase Authentication, then set each profile’s role to `teacher`; accounts left at the default `student` role will not appear.

For a complete class assessment, open the teacher **Results** tab, select the class, and enter an assessment name. The sheet includes every active student and every subject assigned to that teacher in the selected class. Set each subject’s maximum score, fill every score, and submit the complete sheet for administrator review. The teacher can download a CSV template (`admission_number,subject,score,max_score`), fill it, and upload it. The administrator reviews submissions in **Examinations** and can publish results or request changes with a note. Published marks are locked. Student and linked parent portals display only published marks.

The API checks the teacher’s assignment, class roster, subject set, and full score coverage again when saving. It rejects missing, duplicate, or out-of-assignment score cells. The underlying result and roster policies still apply. No additional migration is needed if the existing initial school schema and assessment/review migrations have already been applied.
## Link a parent account to a student

Apply `supabase/migrations/20261110000000_admin_parent_student_linking.sql` after the results migration. If this migration is already installed, also run `supabase/migrations/20261114000000_fix_parent_link_ambiguous_id.sql` to update the function. Create the parent in Supabase Authentication and set that account's profile role to `parent`. In the school administrator's **Students** directory, select **Link parent** on the child row and enter the parent's account email. The function only links an existing profile with the parent role; the linked parent's portal then shows the child's attendance and results.

## Archive, restore, and permanently delete students

Apply `supabase/migrations/20261111000000_controlled_student_deletion.sql` after the attendance, results, and parent-link migrations. Administrators archive routine departures from the student status selector. Archived records remain out of the current register and can be restored from **Archived students**. Permanent deletion is available only from that archived view, requires the admission number and a reason, and is refused if the record has a student login, parent link, attendance, or results. Successful deletions create a minimal audit entry visible under **Deletion log**.

## Test fees and payments

Apply `supabase/migrations/20261113000000_fee_invoices_and_payments.sql` and `supabase/migrations/20261117120000_class_fee_invoices.sql`. Administrators and bursars can create an invoice for one student or issue a class charge that creates one itemized invoice for every active student in that class in a single database transaction. They can record cash, transfer, POS, or other payments. Invoices display paid totals, balances, due dates, and payment status. Student and linked parent portals show their own invoice balances and payment history. Payment recording is a manual cashier workflow; online gateway verification is not implemented, so mark only payments confirmed by the school.

Edge Function secrets are separate from the app's root `.env`. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and put provider API credentials there for local Edge Function development. That file is ignored by Git. To serve local functions, use `supabase functions serve --env-file supabase/functions/.env`; to save those same secrets to the linked hosted Supabase project, use `supabase secrets set --env-file supabase/functions/.env`. Function code reads them with `Deno.env.get('EXTERNAL_API_KEY')`. Do not send a secret key to the browser or return its value from a function.

If no Supabase settings are present, the app uses local demo records in `data/school.json` (ignored by Git). Demo accounts exist for school administrator, teacher, student, parent, bursar, and librarian; use `SchoolDemo2026!` as the password. This mode is only for local preview and is disabled in production.

## Current functionality and limits

- Landing page, sign-in, role-based portals, and local demo authentication.
- Admin dashboard and student search, creation, status updates, and archival backed by Supabase or local JSON demo storage.
- Supabase role profiles, school settings, classes, subjects, student records, parent links, teacher assignments, row-level policies, private storage bucket, and Realtime publication.
- Student and parent record visibility is governed by profile ownership and parent links; teacher access is limited by teaching assignments.
- Dashboard figures and calendar rows remain illustrative. Attendance, results review, invoice creation, and payment recording have working Supabase workflows; online gateway checkout, library loans, communications, and file uploads remain to be implemented.

In-app live data refresh uses Supabase Realtime. Push notifications can be added later through a server-side function and a selected push provider. See [docs/architecture.md](docs/architecture.md) for the delivery plan.

# Management Interface Design

Status: implemented for the simplified site-based workspace.

## Navigation

Administrators and owners share five record-management sections in
`/manage`:

1. Employees
2. Sites
3. Courses
4. Medicals
5. Completions

Owners also receive an additional owner-only Administrators section. It is the
sixth section for owners and is not shown to administrators.

`/manage` redirects to `/manage/employees`. Overview, customer, and audit-log
screens are not part of the product.

Routes:

```text
/manage/employees
/manage/sites
/manage/sites/:siteId
/manage/courses
/manage/medicals
/manage/completions
/manage/administrators
```

Search, archive filters, pagination, and selected records are kept in route
query parameters where applicable.

## Shared Interaction Pattern

Management pages use:

- a heading and one primary action
- search and an include-archived filter
- a paginated resource table
- a selected-record detail panel
- right-side drawers for create and edit forms
- confirmation dialogs for archive, restore, and void actions
- field-level validation and toast feedback

Forms use explicit Save and Cancel actions and warn before discarding dirty
changes. Mutation results are refreshed from confirmed server responses rather
than applied optimistically.

Reusable components include `ManageNav`, `ResourceTable`, `SearchToolbar`,
`DetailPanel`, `FormDrawer`, `ConfirmDialog`, `ArchiveBadge`, `ToastRegion`,
and `PaginationControls`.

## Employees

An employee contains only:

- display name
- email
- required Cognito account identity
- active or archived state
- separate Training and Medical completion history

The list shows name, email, latest Training completion date, latest Medical
completion date, Cognito account state, and archive state. Search is by name or
email. The detail panel supports edit, archive/restore, invitation resend when
eligible, separate Training and Medical quick-entry links, and separate
completion-history sections. Quick-entry links open the matching mode of
Manage Completions with the employee preselected.

Adding an employee requires name and email for administrators and owners. The
API creates the Cognito user with invitation delivery initially suppressed,
adds the account only to the `employee` group, stores its immutable `sub`, and
then sends Cognito's temporary-password invitation. A failure removes both the
employee row and newly created Cognito user. Email and Cognito subject are
immutable after creation, and the subject is never returned by the API.

Every employee row is initially created with a provisioned Cognito account;
account state is not a second account-existence flag. The API loads the current
members of the Cognito `employee` group and joins them to employee records by
immutable `sub`. `FORCE_CHANGE_PASSWORD` is displayed as Invitation pending and
`CONFIRMED` as Account confirmed. Confirmed means that account setup is
complete, not that the employee has used the application. Disabled, missing,
email-mismatched, password-reset-required, and unavailable states are shown
separately. If the Cognito group lookup fails, the employee list and detail
remain available with Status unavailable instead of failing the
record-management workflow. Development authentication emulates accounts only
in memory, so seeded or post-restart employee records show Status unavailable.

Administrators and owners may resend only an active employee's pending
invitation. Cognito's `RESEND` operation generates a new temporary password,
restarts its validity period, and supersedes the old temporary password.
The API coalesces concurrent resend requests and applies a short resend-attempt
cooldown. Archived employees and disabled, confirmed, missing,
email-mismatched, or otherwise ineligible accounts cannot be resent. The browser
never receives a temporary password or Cognito subject.

Employee names are not unique. Archiving removes an employee from Training and
Medical readiness without removing either completion history or deleting the
Cognito user.

## Administrators

Only the owner can open `/manage/administrators`. The owner can list current
members of the Cognito `admin` group and invite a new administrator by email.
Cognito sends the temporary-password message and the API adds the new account
to the hardcoded `admin` group.

The application has no operation for creating or assigning another owner.
Initial owner membership is managed manually in Cognito.

## Sites

Sites are managed directly with no customer hierarchy.

The list shows:

- site name and time zone
- required-course count
- required-medical count
- active or archived state

The detail panel supports:

- editing name and IANA time zone
- archive and restore
- viewing the current required-course list
- viewing the current required-medical list

Assignments are read-only in the Sites workspace. Course assignments are
managed from Course Add/Edit and Medical assignments from Medical Add/Edit.
Neither assignment type has effective dates or warning-period fields.

Site archive preserves both assignment sets. Archived sites are absent from
Training and Medical, and restoring a site makes its previous requirements
active again.

An empty Training or Medical section states that the domain is neutral for site
access. A site with neither courses nor medicals clearly states that all
employees are ineligible until at least one requirement is assigned.

## Courses

The course catalogue shows:

- name
- validity in months
- assigned-site names and count
- active or archived state

Course Add/Edit requires a name, validity in months, and either assigned sites
or `No Site Requirement`. “Select all” selects the active sites that exist at
that time; later sites are not automatically added. No-site courses can receive
completion records but do not affect readiness. Course detail shows assigned
sites or the no-site state, plus recent employee completion history.

Courses do not have a reusable or site-specific flag:

- one assigned site normally represents site-specific training
- multiple assigned sites represents a shared course
- no assigned sites represents training tracked outside site readiness

Course names are permanently unique case-insensitively. Archiving preserves
site assignments while removing the course from readiness and new completion
entry. Restoring reactivates the saved assignments.

## Medicals

Medicals use the same configurable catalogue workspace as Courses, with
Medical terminology and separate APIs and database tables. The list and detail
show:

- name
- validity from 1 through 120 months
- assigned-site names and count, or `No Site Requirement`
- active or archived state
- recent Medical completion history and comments

Medical Add/Edit follows the same site-selection rules as Course Add/Edit.
One assigned site represents a site-specific medical, multiple sites represent
a shared medical, and no assigned sites track a medical without affecting site
readiness. “Select all” captures only the active sites available at that time.

Medical names are permanently unique case-insensitively within the Medical
catalogue. The Medical and Course namespaces are independent, so the same name
may exist once in each. Archiving a medical preserves its assignments and
completion history while removing it from readiness and new completion entry;
restore reactivates the saved assignments.

## Completions

The section has Training and Medical modes selected by
`type=training|medical`. A missing or invalid value defaults to Training so
existing links remain compatible. A second `view=pending|history` switch keeps
pending dates separate from immutable completion history; missing or invalid
values default to history. Pending and history views keep independent search
and pagination state, while each domain uses its matching catalogue, workflow
table, completion table, and API.

Changing modes preserves search and `Show voided`, then resets the page,
selected completion, open drawers and dialogs, and incompatible course or
medical prefills. Employee quick-entry links include both the mode and employee
ID. Completion option endpoints return every active employee and every active
item rather than truncating selection at the first page of records.

Completion entry is optimized for the common workflow:

1. Choose an employee.
2. Choose an active course or medical for the selected mode.
3. Enter the completion date when known, or leave it blank.
4. Optionally add a short comment.
5. Review the automatically calculated expiry when dated, or the pending-date
   notice when blank.
6. Save a dated completion or pending record.

Calculated expiry previews the selected course or medical validity period and
month-end clamping. The saved validity snapshot prevents later catalogue
changes from rewriting existing completion expiry.

Pending dates are management-only and never affect readiness. The pending view
supports search, pagination, exact-record links, and an option to show resolved
records. Open records can be finalized once with a required date or cancelled
with a reason. Finalization uses the validity captured when the pending record
was created, then produces a normal immutable completion. Employee detail
shows open Training and Medical pending records with direct `Add date` links.

History can be searched and filtered by employee, active mode item, and void
state. Comments appear in completion detail and can be opened from compact
history rows without changing the default list layout. They are management
data visible to administrators and owners, never employee readiness data.
Completion rows are never rewritten in place:

- Renewal opens a new entry in the active mode, prefilled with the employee and
  corresponding course or medical.
- `Edit dates` permits both completion and expiration dates to change and
  requires a reason. Saving atomically voids the original immutable row and
  creates a linked replacement.
- Void requires a reason and preserves the original row.

Bulk entry, attachments, and spreadsheet import remain outside v1.

## Training And Medical Workspaces

`Training`, `Medical`, and `Manage` are separate primary tabs, with Medical
between Training and Manage. `/training` remains the default authenticated
route, and `/medical` opens the Medical workspace. Training and Medical are
thin configurations of the same readiness workspace and filter directly by
Site. Neither displays customer, region, job title, crew, or home-base fields.

Administrators and owners receive the same all-employee dashboard. Employee
accounts receive a self-service dashboard containing only their own readiness
across active sites. The self-service APIs derive the employee from the
verified Cognito subject and do not accept an employee ID from the browser.

For the selected active site, each visible employee is displayed with:

- domain readiness status
- combined site-access eligibility across Training and Medical
- each required course in Training or required medical in Medical
- completion and expiry detail

Domain status and `Site access` are separate indicators. Detail panels explain
whether access is blocked by Training, Medical, both, or by the absence of all
site requirements. Expiring requirements use warning styling but remain
eligible. The global expiring threshold is 45 days.

Site, employee, requirement, and status filters change only visible rows in the
active domain. They do not recalculate server-provided combined access from a
filtered subset. A domain with no requirements is neutral to site access. An
empty Medical catalogue therefore still shows `No Requirements` Medical rows
and Training-derived combined access. Sites with no Training or Medical
requirements show `noRequirements` and ineligible employees.

Readiness responses contain status, completion date, and expiry data needed by
the workspace. Employee responses omit completion comments, recording actors,
and void metadata; those fields remain available only in administrator and
owner management views.

## API Failure Behavior

Management requires a running API and displays setup guidance when it is
unavailable. The client handles:

- JSON request and response bodies
- structured field errors
- request IDs
- authentication and authorization errors
- uniqueness and invalid-site-selection conflicts

There are no optimistic concurrency version fields or edit-conflict flows.

## CRUD Rules

| Entity | Create | Update | Lifecycle action | Delete |
| --- | --- | --- | --- | --- |
| Employee | Yes, with Cognito invitation | Name | Archive/restore; resend pending invitation | No |
| Site | Yes | Name/time zone | Archive/restore | No |
| Course | Yes | Name/validity/sites | Archive/restore | No |
| Medical | Yes | Name/validity/sites | Archive/restore | No |
| Course site assignment | Through course | Through course | Preserved on archive | No |
| Medical site assignment | Through medical | Through medical | Preserved on archive | No |
| Course completion | Yes | No | Renew, correct dates, or void with reason | No |
| Medical completion | Yes | No | Renew, correct dates, or void with reason | No |
| Course pending completion | Yes | No | Finalize once or cancel with reason | No |
| Medical pending completion | Yes | No | Finalize once or cancel with reason | No |

Course and Medical updates replace their own current site assignment set
atomically without affecting the other domain.

## Validation And Safeguards

- Normalize and validate required text fields on the API.
- Enforce active site-name uniqueness case-insensitively.
- Enforce permanent, domain-specific Course and Medical name uniqueness
  case-insensitively while allowing the same name across domains.
- Require each catalogue form to choose unique sites or explicitly choose
  `No Site Requirement`.
- Reject newly selected archived sites while allowing existing archived
  assignments to be retained or removed.
- Preserve both assignment types when a site, course, or medical is archived.
- Require Course and Medical validity to be an integer from 1 through 120
  months and preview calculated expiry from the matching type.
- Reject duplicate non-voided employee, item, and completion-date occurrences
  independently in each domain.
- Require a corrected expiration date on or after its corrected completion
  date, retain the original as voided history, and link no more than one
  replacement to a source row.
- Permit only one open pending date per employee and item in each domain.
- Require a reason when voiding a completion.
- Require a reason when cancelling a pending date and preserve both finalized
  and cancelled workflow history.

## Accessibility And Responsive Behavior

Tables support keyboard row selection. Drawers and confirmation dialogs expose
dialog roles and labelled controls. Status is communicated with text as well
as color.

On smaller screens, list/detail layouts collapse to one column, toolbars stack,
and primary actions become full width. The primary navigation retains usable
touch targets for Training, Medical, and Manage without horizontal page
overflow.

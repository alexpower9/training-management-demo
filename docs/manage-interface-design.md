# Management Interface Design

Status: implemented for the simplified site-based workspace.

## Navigation

The `/manage` workspace contains four record-management sections:

1. Employees
2. Sites
3. Courses
4. Completions

Owners also receive a fifth, owner-only Administrators section.

`/manage` redirects to `/manage/employees`. Overview, customer, and audit-log
screens are not part of the product.

Routes:

```text
/manage/employees
/manage/sites
/manage/sites/:siteId
/manage/courses
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
- completion history

The list shows name, email, latest completion date, and archive state. Search is
by name or email. The detail panel supports edit, archive/restore, quick
completion entry, current training, and active-course completion history.

Adding an employee requires name and email for administrators and owners. The
API creates the Cognito user with invitation delivery initially suppressed,
adds the account only to the `employee` group, stores its immutable `sub`, and
then sends Cognito's temporary-password invitation. A failure removes both the
employee row and newly created Cognito user. Email and Cognito subject are
immutable after creation, and the subject is never returned by the API.

Employee names are not unique. Archiving removes an employee from Training
readiness without removing historical completions or deleting the Cognito user.

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
- active or archived state

The detail panel supports:

- editing name and IANA time zone
- archive and restore
- viewing the current required-course list

Assignments are read-only in the Sites workspace and are managed from Course
Add/Edit. They have no effective dates or warning-period fields.

Site archive preserves assignments. Archived sites are absent from Training,
and restoring a site makes its previous requirements active again.

A site with no assigned courses clearly states that all employees are
ineligible until courses are assigned.

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

## Completions

Completion entry is optimized for the common workflow:

1. Choose an employee.
2. Choose an active course.
3. Enter the completion date.
4. Optionally add a short comment.
5. Review the automatically calculated expiry.
6. Save.

Calculated expiry previews the course validity period and month-end clamping.
The saved validity snapshot prevents later course changes from rewriting
existing completion expiry.

History can be searched and filtered by employee, course, and void state.
Comments appear in completion detail and can be opened from compact history rows
without changing the default list layout.
Completion rows are not edited:

- Renewal opens a new entry prefilled with employee and course.
- Void requires a reason and preserves the original row.

Bulk entry, attachments, and spreadsheet import remain outside v1.

## Training Workspace

The Training workspace filters directly by Site. It does not display customer,
region, job title, crew, or home-base fields.

Administrators retain the all-employee dashboard. Employee accounts receive a
self-service dashboard containing only their own readiness across active sites.
The self-service API derives the employee from the verified Cognito subject and
does not accept an employee ID from the browser.

For the selected active site, every active employee is displayed with:

- overall readiness status
- eligibility
- each required course
- completion and expiry detail

The global expiring threshold is 45 days. Sites with no assigned courses show
`noRequirements` and ineligible employees.

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
| Employee | Yes, with Cognito invitation | Name | Archive/restore | No |
| Site | Yes | Name/time zone | Archive/restore | No |
| Course | Yes | Name/validity/sites | Archive/restore | No |
| Site assignment | Through course | Through course | Preserved on archive | No |
| Completion | Yes | No | Void with reason | No |

Course updates replace the current site assignment set atomically.

## Validation And Safeguards

- Normalize and validate required text fields on the API.
- Enforce active site-name uniqueness case-insensitively.
- Enforce permanent course-name uniqueness case-insensitively.
- Require at least one unique site selection per course.
- Reject newly selected archived sites while allowing existing archived
  assignments to be retained or removed.
- Preserve assignments when a site or course is archived.
- Preview calculated expiry using required course validity.
- Reject duplicate non-voided completions.
- Require a reason when voiding a completion.

## Accessibility And Responsive Behavior

Tables support keyboard row selection. Drawers and confirmation dialogs expose
dialog roles and labelled controls. Status is communicated with text as well
as color.

On smaller screens, list/detail layouts collapse to one column, toolbars stack,
and primary actions become full width.

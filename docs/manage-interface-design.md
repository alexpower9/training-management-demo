# Management Interface Design

Status: implemented for the v1 administrative workspace.

The management interface should be organized around common administrative
tasks rather than exposing each database table as an equally important CRUD
screen.

## Recommended Navigation

Use a secondary navigation bar inside `/manage`:

1. Overview
2. Employees
3. Customers & Sites
4. Courses
5. Completions
6. Audit Log

Keep the current top-level `Training` and `Manage` navigation. The secondary
navigation appears only within the management workspace.

Suggested routes:

```text
/manage
/manage/employees
/manage/customers
/manage/sites/:siteId
/manage/courses
/manage/completions
/manage/audit
```

Separate routes are preferable to one large component with local tabs. They
support browser history, bookmarks, direct links, and simpler data loading.

## Shared Page Pattern

Most management pages should use the same structure:

```text
Page title                         Primary action
Short explanation                 Secondary action

Search | Filters | Show archived

List or table                     Selected-record detail panel
```

On desktop, use the existing list/detail layout from `Training.vue`. On narrow
screens, open the selected record as a full-width page or drawer.

Recommended interaction rules:

- Search and filter the list without leaving the page.
- Select a row to inspect it.
- Open create and edit forms in a right-side drawer.
- Use explicit Save and Cancel actions.
- Warn before closing a form with unsaved changes.
- Show field errors beside the affected input.
- Keep success and failure messages visible and specific.
- Preserve search, filters, and selected records in route query parameters.

Avoid making every table cell editable. Drawer forms are easier to validate,
more accessible, and safer for audited data.

## Overview

The overview is an administrative launchpad, not another reporting dashboard.

Show:

- active employee count;
- active customer and site counts;
- active course count;
- completions recorded recently;
- courses expiring soon;
- sites with no configured requirements; and
- recent administrative activity.

Prominent quick actions:

- Add employee
- Add customer/site
- Add course
- Record completion

The overview should also surface configuration problems, such as:

- a site with no requirements;
- an active requirement referencing an archived course;
- a calculated-expiry course without a validity period; and
- employees with duplicate-looking names.

## Employees

### List

Columns:

- employee name;
- job title;
- crew;
- home base;
- current/archived state; and
- most recent completion date.

Controls:

- search by name;
- filter by crew or home base;
- include archived employees;
- Add employee.

### Detail

The employee detail panel should contain:

- profile information;
- Edit employee;
- Archive or restore employee;
- Record completion;
- current courses and expiry status; and
- full completion history.

This screen answers both "who is this employee?" and "what training do they
currently hold?"

Archiving removes an employee from current readiness but never deletes their
completion history.

## Customers & Sites

Customers and sites belong in one workflow because users will usually think of
them as a hierarchy.

### Customer List

Show each customer with:

- contact;
- active site count;
- total active requirements; and
- archived state.

Selecting a customer shows its sites. From there, users can add or edit a site.

### Site Detail

The site detail screen is the most important configuration screen.

Show:

- customer, site name, region, and time zone;
- active requirement count;
- a list of required courses;
- effective dates and warning days for each requirement; and
- a link to view the site's readiness in the Training workspace.

Primary actions:

- Edit site
- Add required course
- End requirement

Adding a requirement should open a searchable course picker. The picker should
clearly distinguish:

- reusable courses already used at other sites; and
- site-specific courses.

Include a secondary "Create new course" action inside the picker. After the
course is created, return the user to the requirement form with it selected.

When ending a requirement, show the effective end date and explain that
historical readiness remains available.

## Courses

Treat this page as the shared course catalogue.

### List

Columns:

- code;
- name;
- category;
- default validity;
- number of sites using the course; and
- current/archived state.

Useful filters:

- reusable at multiple sites;
- used by one site;
- unused;
- category;
- include archived.

Do not store reusable/site-specific as a field. Display it from the number of
active site requirements:

- `Shared` when used by multiple sites;
- `Site-specific` when used by one site; and
- `Unused` when used by none.

### Detail

Show:

- course definition;
- sites that currently require it;
- historical site requirements;
- employees with current completions;
- completion history; and
- Edit or Archive actions.

Prevent archiving while an open site requirement exists. The interface should
list the requirements that must be ended first.

## Completions

This should be optimized for recording training, not presented as a generic
completion table.

### Quick Entry

The primary flow:

1. Choose one employee.
2. Choose a course.
3. Enter the completion date.
4. Choose calculated or manual expiry.
5. Review the resulting expiry date.
6. Save.

When calculated expiry is selected:

- show the course's validity period;
- calculate the date immediately in the form; and
- explain that this date will be stored as a historical snapshot.

When manual expiry is selected:

- require an expiry date; and
- show a warning if it differs significantly from the course default, without
  blocking the save.

### Completion History

Provide a searchable history table with filters for:

- employee;
- course;
- completion date;
- expiry status; and
- include voided records.

Completion rows are immutable. Available actions:

- View details
- Record renewal
- Void incorrect record

`Record renewal` opens the quick-entry form prefilled with the employee and
course. `Void` requires a reason and a confirmation showing the readiness
impact.

### Bulk Entry

Bulk entry is a useful second-phase feature if groups often attend training
together:

1. Choose a course.
2. Enter completion and expiry details once.
3. Select several employees.
4. Review the records to be created.
5. Save all records in one transaction.

Do not include spreadsheet import in the first version unless there is a real
source file and validation process to design around.

## Audit Log

The audit log is read-only.

Columns:

- time;
- administrator;
- action;
- entity type;
- entity name or ID; and
- request ID.

Selecting an event shows before and after values in a readable field-by-field
comparison. Raw JSON can be available in a secondary disclosure.

Filters:

- date range;
- administrator;
- action;
- entity type; and
- entity ID.

## CRUD Behavior By Entity

| Entity | Create | Update | Archive/End | Delete |
| --- | --- | --- | --- | --- |
| Employee | Yes | Yes | Archive/restore | No |
| Customer | Yes | Yes | Archive/restore | No |
| Site | Yes | Yes | Archive/restore | No |
| Course | Yes | Yes | Archive/restore | No |
| Site requirement | Yes | Limited | End with date | No |
| Completion | Yes | No | Void with reason | No |
| Audit event | System only | No | No | No |

This distinction should be visible in the language of the interface. Avoid a
generic Delete button for historical business records.

## Forms And Validation

Use consistent form sections:

- Details
- Dates and validity
- Relationships
- Review

Recommended safeguards:

- normalize whitespace before saving;
- check case-insensitive duplicate customer, site, and course names/codes;
- show where a reusable course is already required;
- preview calculated expiry;
- block impossible date ranges;
- prevent ending a requirement before it begins;
- prevent archiving a parent with active dependants; and
- disable Save while a request is in progress.

After a successful mutation, refresh the affected list and detail data. For
audited writes, prefer confirmed server responses over optimistic updates.

## Visual Direction

The current application already has suitable foundations:

- panels;
- searchable filters;
- responsive tables;
- status badges;
- split list/detail layouts; and
- primary and secondary actions.

Add a small set of reusable management components:

- `ManageNav`
- `ResourceTable`
- `SearchToolbar`
- `DetailPanel`
- `FormDrawer`
- `ConfirmDialog`
- `ArchiveBadge`
- `ToastRegion`
- `PaginationControls`

Use modals only for short confirmations. Longer create/edit forms belong in a
drawer or dedicated route.

## Recommended Delivery Order

1. Shared management navigation, form drawer, confirmation dialog, and API
   mutation helpers.
2. Employees.
3. Course catalogue.
4. Customers, sites, and site requirements.
5. Completion quick entry and history.
6. Archive/restore and void workflows.
7. Audit log.
8. Bulk completion entry, if operationally useful.

This order builds the reusable interaction patterns first and reaches the
highest-frequency workflow, recording completions, without attempting the
entire administration system in one pass.

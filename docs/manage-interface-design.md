# Demo management interface

The demo opens without signing in. Training and Medical show site readiness;
Manage provides the editable records behind those views.

- **Employees:** create and rename fictional employees, inspect completion
  history, and archive or restore records. Email is demo contact data only.
- **Sites:** create and rename sites, set their time zones, and inspect required
  courses and medicals.
- **Courses / Medicals:** maintain the catalogues, renewal periods, and site
  assignments. Archive unused items while preserving history.
- **Completions:** record completed training and medicals, add comments, save
  pending dates, finalize or cancel pending records, correct dates, and void
  incorrect records with a reason.

Search, pagination, detail panels, and form drawers retain the production app's
record-management interaction patterns. Mutations update the browser database
and readiness views use the saved records when opened.

No employee accounts are created and no invitations or emails are sent. Every
visitor can edit their own demo data. Records persist on refresh in the same
browser, while other visitors begin with independent sample data.

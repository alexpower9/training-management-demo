# Demo data model

The demo uses a versioned JSON database saved in browser `localStorage`. The
repository services read and write it directly; no network service is involved.

The data model preserves the compliance app's main relationships:

| Record | Purpose |
| --- | --- |
| Employees | Display names, email addresses, and archive state |
| Sites | Names, time zones, and archive state |
| Courses | Training catalogue entries and renewal periods |
| Medicals | Medical catalogue entries and renewal periods |
| Site requirements | Courses and medicals required for each site |
| Completions | Dated training and medical history with expiry and comments |
| Pending completions | Records awaiting a completion date |

Readiness combines each active site's training and medical requirements.
Missing or overdue requirements block access. Requirements expiring soon remain
eligible and show a warning. A domain with no requirements is neutral; a site
with no requirements in either domain does not grant access.

Archiving hides a record from active lists while retaining its history. Pending
completions do not count toward readiness until finalized. Voiding and correcting
completion dates retain the original record for history.

Manage records through the Employees, Sites, Courses, Medicals, and Completions
tabs in `/manage`. Sample dates are generated relative to the first load.

Each browser has independent storage; publishing does not synchronize edits.
Clearing this site's browser storage removes local edits and restores the sample
dataset on the next load. The storage is intended only for fictional demo
records, not production compliance or medical information.

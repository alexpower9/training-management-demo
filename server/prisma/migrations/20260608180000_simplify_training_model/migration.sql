-- Convert the original seven-table prototype into the five-table v1 model.
-- Open requirements become current site-course assignments; ended requirement
-- history and general audit events are intentionally outside the v1 scope.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM site
    WHERE archived_at IS NULL
    GROUP BY lower(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Active site names must be unique before simplifying the training model.';
  END IF;
END
$$;

ALTER TABLE employee
  DROP CONSTRAINT employee_version_check,
  DROP COLUMN job_title,
  DROP COLUMN crew,
  DROP COLUMN home_base,
  DROP COLUMN version;

DROP INDEX site_customer_archived_name_idx;
DROP INDEX site_active_customer_name_key;

ALTER TABLE site
  DROP CONSTRAINT site_customer_fkey,
  DROP CONSTRAINT site_version_check,
  DROP COLUMN customer_id,
  DROP COLUMN region,
  DROP COLUMN version;

CREATE INDEX site_archived_name_idx ON site(archived_at, name);
CREATE UNIQUE INDEX site_active_name_key
  ON site(lower(name)) WHERE archived_at IS NULL;

DROP TABLE customer;

ALTER TABLE course
  DROP CONSTRAINT course_version_check,
  DROP COLUMN version;

-- The new model stores only current assignments.
DELETE FROM site_course_requirement
WHERE effective_to IS NOT NULL;

DROP INDEX requirement_site_dates_idx;
DROP INDEX requirement_course_end_idx;

ALTER TABLE site_course_requirement
  DROP CONSTRAINT site_course_requirement_no_overlap,
  DROP CONSTRAINT site_course_requirement_pkey,
  DROP CONSTRAINT site_course_requirement_dates_check,
  DROP CONSTRAINT site_course_requirement_warning_check,
  DROP CONSTRAINT site_course_requirement_version_check,
  DROP COLUMN id,
  DROP COLUMN effective_from,
  DROP COLUMN effective_to,
  DROP COLUMN warning_days,
  DROP COLUMN created_by_subject,
  DROP COLUMN created_at,
  DROP COLUMN updated_at,
  DROP COLUMN version,
  ADD CONSTRAINT site_course_requirement_pkey PRIMARY KEY (site_id, course_id);

CREATE INDEX requirement_course_idx ON site_course_requirement(course_id);

DROP TABLE audit_event;
DROP EXTENSION btree_gist;

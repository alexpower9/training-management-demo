-- Courses are identified by name, own their complete site assignment set, and
-- always calculate completion expiry from a required validity period.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM course
    WHERE default_validity_months IS NULL
  ) THEN
    RAISE EXCEPTION
      'Every course must have a validity period before simplifying the course workflow.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM course
    GROUP BY lower(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Course names must be unique before simplifying the course workflow.';
  END IF;
END
$$;

DROP INDEX course_code_key;

ALTER TABLE course
  RENAME COLUMN default_validity_months TO validity_months;

ALTER TABLE course
  DROP CONSTRAINT course_validity_check,
  DROP COLUMN code,
  DROP COLUMN category,
  ALTER COLUMN validity_months SET NOT NULL,
  ADD CONSTRAINT course_validity_check CHECK (
    validity_months BETWEEN 1 AND 120
  );

CREATE UNIQUE INDEX course_name_key ON course(lower(name));

ALTER TABLE course_completion
  DROP CONSTRAINT course_completion_expiry_source_check,
  DROP COLUMN expiry_source,
  ADD CONSTRAINT course_completion_validity_check CHECK (
    validity_months_applied IS NULL
    OR validity_months_applied BETWEEN 1 AND 120
  );

DROP TYPE completion_expiry_source;

-- A pending completion records an employee/item assignment whose completion
-- date is not known yet. Dated completion history remains non-null and
-- append-only; resolving a pending row creates and links that history instead.

CREATE TYPE pending_completion_resolution AS ENUM ('FINALIZED', 'CANCELLED');

CREATE TABLE course_pending_completion (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  course_id UUID NOT NULL,
  validity_months_snapshot SMALLINT NOT NULL,
  comment VARCHAR(500),
  created_by_subject VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution pending_completion_resolution,
  resolved_at TIMESTAMPTZ(3),
  resolved_by_subject VARCHAR(255),
  cancellation_reason VARCHAR(500),
  completion_id UUID,
  CONSTRAINT course_pending_completion_pkey PRIMARY KEY (id),
  CONSTRAINT course_pending_completion_validity_check CHECK (
    validity_months_snapshot BETWEEN 1 AND 120
  ),
  CONSTRAINT course_pending_completion_resolution_check CHECK (
    (
      resolution IS NULL
      AND resolved_at IS NULL
      AND resolved_by_subject IS NULL
      AND cancellation_reason IS NULL
      AND completion_id IS NULL
    )
    OR
    (
      resolution = 'FINALIZED'
      AND resolved_at IS NOT NULL
      AND resolved_by_subject IS NOT NULL
      AND cancellation_reason IS NULL
      AND completion_id IS NOT NULL
    )
    OR
    (
      resolution = 'CANCELLED'
      AND resolved_at IS NOT NULL
      AND resolved_by_subject IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND length(trim(cancellation_reason)) >= 3
      AND completion_id IS NULL
    )
  ),
  CONSTRAINT course_pending_completion_employee_fkey FOREIGN KEY (employee_id)
    REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT course_pending_completion_course_fkey FOREIGN KEY (course_id)
    REFERENCES course(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT course_pending_completion_completion_fkey FOREIGN KEY (completion_id)
    REFERENCES course_completion(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE medical_pending_completion (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  medical_id UUID NOT NULL,
  validity_months_snapshot SMALLINT NOT NULL,
  comment VARCHAR(500),
  created_by_subject VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution pending_completion_resolution,
  resolved_at TIMESTAMPTZ(3),
  resolved_by_subject VARCHAR(255),
  cancellation_reason VARCHAR(500),
  completion_id UUID,
  CONSTRAINT medical_pending_completion_pkey PRIMARY KEY (id),
  CONSTRAINT medical_pending_completion_validity_check CHECK (
    validity_months_snapshot BETWEEN 1 AND 120
  ),
  CONSTRAINT medical_pending_completion_resolution_check CHECK (
    (
      resolution IS NULL
      AND resolved_at IS NULL
      AND resolved_by_subject IS NULL
      AND cancellation_reason IS NULL
      AND completion_id IS NULL
    )
    OR
    (
      resolution = 'FINALIZED'
      AND resolved_at IS NOT NULL
      AND resolved_by_subject IS NOT NULL
      AND cancellation_reason IS NULL
      AND completion_id IS NOT NULL
    )
    OR
    (
      resolution = 'CANCELLED'
      AND resolved_at IS NOT NULL
      AND resolved_by_subject IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND length(trim(cancellation_reason)) >= 3
      AND completion_id IS NULL
    )
  ),
  CONSTRAINT medical_pending_completion_employee_fkey FOREIGN KEY (employee_id)
    REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT medical_pending_completion_medical_fkey FOREIGN KEY (medical_id)
    REFERENCES medical(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT medical_pending_completion_completion_fkey FOREIGN KEY (completion_id)
    REFERENCES medical_completion(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX course_pending_completion_completion_id_key
  ON course_pending_completion(completion_id);
CREATE UNIQUE INDEX medical_pending_completion_completion_id_key
  ON medical_pending_completion(completion_id);

-- Resolved rows remain as audit history. Only an unresolved row participates in
-- this key, so cancellation/finalization makes room for a later pending renewal.
CREATE UNIQUE INDEX course_pending_completion_open_key
  ON course_pending_completion(employee_id, course_id)
  WHERE resolution IS NULL;
CREATE UNIQUE INDEX medical_pending_completion_open_key
  ON medical_pending_completion(employee_id, medical_id)
  WHERE resolution IS NULL;

CREATE INDEX course_pending_resolution_created_idx
  ON course_pending_completion(resolution, created_at);
CREATE INDEX course_pending_employee_resolution_created_idx
  ON course_pending_completion(employee_id, resolution, created_at);
CREATE INDEX course_pending_course_resolution_idx
  ON course_pending_completion(course_id, resolution);
CREATE INDEX medical_pending_resolution_created_idx
  ON medical_pending_completion(resolution, created_at);
CREATE INDEX medical_pending_employee_resolution_created_idx
  ON medical_pending_completion(employee_id, resolution, created_at);
CREATE INDEX medical_pending_medical_resolution_idx
  ON medical_pending_completion(medical_id, resolution);

-- Pending facts are immutable. The only permitted update is one atomic
-- transition from unresolved to a complete finalized/cancelled resolution.
CREATE FUNCTION enforce_pending_completion_resolution_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  completion_matches BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.resolution IS NOT NULL THEN
      RAISE EXCEPTION 'A pending completion must be inserted unresolved.';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.resolution IS NOT NULL THEN
    RAISE EXCEPTION 'Resolved pending completion history is immutable.';
  END IF;

  IF NEW.resolution IS NULL THEN
    RAISE EXCEPTION 'A pending completion update must resolve the record.';
  END IF;

  IF
    (
      to_jsonb(NEW)
      - ARRAY[
        'resolution',
        'resolved_at',
        'resolved_by_subject',
        'cancellation_reason',
        'completion_id'
      ]
    )
    IS DISTINCT FROM
    (
      to_jsonb(OLD)
      - ARRAY[
        'resolution',
        'resolved_at',
        'resolved_by_subject',
        'cancellation_reason',
        'completion_id'
      ]
    )
  THEN
    RAISE EXCEPTION 'Pending completion facts are immutable.';
  END IF;

  IF NEW.resolution = 'FINALIZED' THEN
    IF TG_TABLE_NAME = 'course_pending_completion' THEN
      SELECT EXISTS (
        SELECT 1
        FROM course_completion completion
        WHERE completion.id = NEW.completion_id
          AND completion.employee_id = NEW.employee_id
          AND completion.course_id = NEW.course_id
          AND completion.validity_months_applied = NEW.validity_months_snapshot
          AND completion.comment IS NOT DISTINCT FROM NEW.comment
          AND completion.recorded_by_subject = NEW.resolved_by_subject
          AND completion.voided_at IS NULL
      ) INTO completion_matches;
    ELSIF TG_TABLE_NAME = 'medical_pending_completion' THEN
      SELECT EXISTS (
        SELECT 1
        FROM medical_completion completion
        WHERE completion.id = NEW.completion_id
          AND completion.employee_id = NEW.employee_id
          AND completion.medical_id = NEW.medical_id
          AND completion.validity_months_applied = NEW.validity_months_snapshot
          AND completion.comment IS NOT DISTINCT FROM NEW.comment
          AND completion.recorded_by_subject = NEW.resolved_by_subject
          AND completion.voided_at IS NULL
      ) INTO completion_matches;
    ELSE
      RAISE EXCEPTION 'Unsupported pending completion table.';
    END IF;

    IF completion_matches IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION
        'A finalized pending completion must link its matching completion.';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER course_pending_completion_resolution_only
BEFORE INSERT OR UPDATE ON course_pending_completion
FOR EACH ROW EXECUTE FUNCTION enforce_pending_completion_resolution_only();

CREATE TRIGGER medical_pending_completion_resolution_only
BEFORE INSERT OR UPDATE ON medical_pending_completion
FOR EACH ROW EXECUTE FUNCTION enforce_pending_completion_resolution_only();

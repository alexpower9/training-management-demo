-- Medical requirements and completions are an independent compliance domain.
-- They intentionally share employees and sites with Training, but never reuse
-- course catalogue or completion rows.

CREATE TABLE medical (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  validity_months SMALLINT NOT NULL,
  archived_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT medical_pkey PRIMARY KEY (id),
  CONSTRAINT medical_validity_check CHECK (
    validity_months BETWEEN 1 AND 120
  )
);

CREATE TABLE site_medical_requirement (
  site_id UUID NOT NULL,
  medical_id UUID NOT NULL,
  CONSTRAINT site_medical_requirement_pkey PRIMARY KEY (site_id, medical_id),
  CONSTRAINT site_medical_requirement_site_fkey FOREIGN KEY (site_id)
    REFERENCES site(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT site_medical_requirement_medical_fkey FOREIGN KEY (medical_id)
    REFERENCES medical(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE medical_completion (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  medical_id UUID NOT NULL,
  completed_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  validity_months_applied SMALLINT NOT NULL,
  comment VARCHAR(500),
  recorded_by_subject VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMPTZ(3),
  voided_by_subject VARCHAR(255),
  void_reason VARCHAR(500),
  CONSTRAINT medical_completion_pkey PRIMARY KEY (id),
  CONSTRAINT medical_completion_dates_check CHECK (expires_on >= completed_on),
  CONSTRAINT medical_completion_validity_check CHECK (
    validity_months_applied BETWEEN 1 AND 120
  ),
  CONSTRAINT medical_completion_void_check CHECK (
    (voided_at IS NULL AND voided_by_subject IS NULL AND void_reason IS NULL)
    OR
    (
      voided_at IS NOT NULL
      AND voided_by_subject IS NOT NULL
      AND void_reason IS NOT NULL
      AND length(trim(void_reason)) >= 3
    )
  ),
  CONSTRAINT medical_completion_employee_fkey FOREIGN KEY (employee_id)
    REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT medical_completion_medical_fkey FOREIGN KEY (medical_id)
    REFERENCES medical(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX medical_archived_name_idx ON medical(archived_at, name);
CREATE UNIQUE INDEX medical_name_key ON medical(lower(name));
CREATE INDEX requirement_medical_idx
  ON site_medical_requirement(medical_id);
CREATE INDEX medical_completion_employee_medical_dates_idx
  ON medical_completion(employee_id, medical_id, completed_on DESC, recorded_at DESC);
CREATE INDEX medical_completion_medical_void_idx
  ON medical_completion(medical_id, voided_at);
CREATE UNIQUE INDEX medical_completion_active_occurrence_key
  ON medical_completion(employee_id, medical_id, completed_on)
  WHERE voided_at IS NULL;

-- Completion facts are append-only. The API may only transition an active row
-- to a fully populated void state; it may never rewrite or unvoid history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM course_completion
    WHERE NOT (
      (voided_at IS NULL AND voided_by_subject IS NULL AND void_reason IS NULL)
      OR
      (
        voided_at IS NOT NULL
        AND voided_by_subject IS NOT NULL
        AND void_reason IS NOT NULL
        AND length(trim(void_reason)) >= 3
      )
    )
  ) THEN
    RAISE EXCEPTION
      'Course completion void metadata must be repaired before adding Medicals.';
  END IF;
END
$$;

ALTER TABLE course_completion
  DROP CONSTRAINT course_completion_void_check,
  ADD CONSTRAINT course_completion_void_check CHECK (
    (voided_at IS NULL AND voided_by_subject IS NULL AND void_reason IS NULL)
    OR
    (
      voided_at IS NOT NULL
      AND voided_by_subject IS NOT NULL
      AND void_reason IS NOT NULL
      AND length(trim(void_reason)) >= 3
    )
  );

CREATE FUNCTION enforce_completion_void_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Voided completion history is immutable.';
  END IF;

  IF NEW.voided_at IS NULL
    OR NEW.voided_by_subject IS NULL
    OR NEW.void_reason IS NULL
    OR length(trim(NEW.void_reason)) < 3
  THEN
    RAISE EXCEPTION 'Completion updates must record complete void metadata.';
  END IF;

  IF
    (to_jsonb(NEW) - ARRAY['voided_at', 'voided_by_subject', 'void_reason'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['voided_at', 'voided_by_subject', 'void_reason'])
  THEN
    RAISE EXCEPTION 'Completion facts are immutable.';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER course_completion_void_only
BEFORE UPDATE ON course_completion
FOR EACH ROW EXECUTE FUNCTION enforce_completion_void_only();

CREATE TRIGGER medical_completion_void_only
BEFORE UPDATE ON medical_completion
FOR EACH ROW EXECUTE FUNCTION enforce_completion_void_only();

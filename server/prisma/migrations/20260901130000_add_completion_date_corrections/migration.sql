-- Completion corrections remain append-only: the original row is voided and
-- one new row may point back to it. Existing rows are ordinary completions and
-- receive the backwards-compatible expiry_manually_set = false default.

ALTER TABLE course_completion
  ADD COLUMN expiry_manually_set BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN corrects_completion_id UUID,
  ADD CONSTRAINT course_completion_manual_expiry_check CHECK (
    (corrects_completion_id IS NULL AND expiry_manually_set = false)
    OR
    (corrects_completion_id IS NOT NULL AND expiry_manually_set = true)
  );

ALTER TABLE medical_completion
  ADD COLUMN expiry_manually_set BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN corrects_completion_id UUID,
  ADD CONSTRAINT medical_completion_manual_expiry_check CHECK (
    (corrects_completion_id IS NULL AND expiry_manually_set = false)
    OR
    (corrects_completion_id IS NOT NULL AND expiry_manually_set = true)
  );

CREATE UNIQUE INDEX course_completion_corrects_completion_id_key
  ON course_completion(corrects_completion_id);
CREATE UNIQUE INDEX medical_completion_corrects_completion_id_key
  ON medical_completion(corrects_completion_id);

ALTER TABLE course_completion
  ADD CONSTRAINT course_completion_corrects_completion_fkey
  FOREIGN KEY (corrects_completion_id) REFERENCES course_completion(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE medical_completion
  ADD CONSTRAINT medical_completion_corrects_completion_fkey
  FOREIGN KEY (corrects_completion_id) REFERENCES medical_completion(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- All completion rows must be inserted active. Ordinary inserts cannot claim
-- correction-only manual-expiry metadata. A correction must point to a voided
-- completion whose immutable identity, snapshot, comment, and actor match.
CREATE OR REPLACE FUNCTION enforce_completion_void_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  correction_matches BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL
      OR NEW.voided_by_subject IS NOT NULL
      OR NEW.void_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'A completion must be inserted active.';
    END IF;

    IF NEW.corrects_completion_id IS NULL THEN
      IF NEW.expiry_manually_set THEN
        RAISE EXCEPTION
          'Manual expiry metadata is only valid on a completion correction.';
      END IF;

      RETURN NEW;
    END IF;

    IF NOT NEW.expiry_manually_set THEN
      RAISE EXCEPTION
        'A completion correction must declare its manually set expiry.';
    END IF;

    IF TG_TABLE_NAME = 'course_completion' THEN
      SELECT EXISTS (
        SELECT 1
        FROM course_completion source
        WHERE source.id = NEW.corrects_completion_id
          AND source.voided_at IS NOT NULL
          AND source.employee_id = NEW.employee_id
          AND source.course_id = NEW.course_id
          AND source.validity_months_applied
            IS NOT DISTINCT FROM NEW.validity_months_applied
          AND source.comment IS NOT DISTINCT FROM NEW.comment
          AND source.voided_by_subject = NEW.recorded_by_subject
      ) INTO correction_matches;
    ELSIF TG_TABLE_NAME = 'medical_completion' THEN
      SELECT EXISTS (
        SELECT 1
        FROM medical_completion source
        WHERE source.id = NEW.corrects_completion_id
          AND source.voided_at IS NOT NULL
          AND source.employee_id = NEW.employee_id
          AND source.medical_id = NEW.medical_id
          AND source.validity_months_applied
            IS NOT DISTINCT FROM NEW.validity_months_applied
          AND source.comment IS NOT DISTINCT FROM NEW.comment
          AND source.voided_by_subject = NEW.recorded_by_subject
      ) INTO correction_matches;
    ELSE
      RAISE EXCEPTION 'Unsupported completion table.';
    END IF;

    IF correction_matches IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION
        'A correction must link its matching voided completion.';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Voided completion history is immutable.';
  END IF;

  IF
    (to_jsonb(NEW) - ARRAY['voided_at', 'voided_by_subject', 'void_reason'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['voided_at', 'voided_by_subject', 'void_reason'])
  THEN
    RAISE EXCEPTION 'Completion facts are immutable.';
  END IF;

  IF NEW.voided_at IS NULL
    OR NEW.voided_by_subject IS NULL
    OR NEW.void_reason IS NULL
    OR length(trim(NEW.void_reason)) < 3
  THEN
    RAISE EXCEPTION 'Completion updates must record complete void metadata.';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER course_completion_void_only ON course_completion;
CREATE TRIGGER course_completion_void_only
BEFORE INSERT OR UPDATE ON course_completion
FOR EACH ROW EXECUTE FUNCTION enforce_completion_void_only();

DROP TRIGGER medical_completion_void_only ON medical_completion;
CREATE TRIGGER medical_completion_void_only
BEFORE INSERT OR UPDATE ON medical_completion
FOR EACH ROW EXECUTE FUNCTION enforce_completion_void_only();

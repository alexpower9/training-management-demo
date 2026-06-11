DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM employee) THEN
    RAISE EXCEPTION
      'Employee account migration requires an empty employee table.';
  END IF;
END
$$;

ALTER TABLE employee
  ADD COLUMN email VARCHAR(254) NOT NULL,
  ALTER COLUMN cognito_subject SET NOT NULL;

CREATE UNIQUE INDEX employee_email_key ON employee(lower(email));

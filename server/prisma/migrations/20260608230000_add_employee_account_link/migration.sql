ALTER TABLE employee
  ADD COLUMN cognito_subject VARCHAR(255);

CREATE UNIQUE INDEX employee_cognito_subject_key
  ON employee(cognito_subject);

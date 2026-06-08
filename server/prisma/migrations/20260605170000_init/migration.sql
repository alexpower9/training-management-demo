CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE completion_expiry_source AS ENUM ('MANUAL', 'CALCULATED');

CREATE TABLE employee (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name VARCHAR(160) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  crew VARCHAR(120),
  home_base VARCHAR(120),
  archived_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT employee_pkey PRIMARY KEY (id),
  CONSTRAINT employee_version_check CHECK (version > 0)
);

CREATE TABLE customer (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  contact VARCHAR(160),
  archived_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT customer_pkey PRIMARY KEY (id),
  CONSTRAINT customer_version_check CHECK (version > 0)
);

CREATE TABLE site (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  region VARCHAR(160),
  time_zone VARCHAR(80) NOT NULL DEFAULT 'America/St_Johns',
  archived_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT site_pkey PRIMARY KEY (id),
  CONSTRAINT site_version_check CHECK (version > 0),
  CONSTRAINT site_customer_fkey FOREIGN KEY (customer_id)
    REFERENCES customer(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE course (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100),
  default_validity_months SMALLINT,
  archived_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT course_pkey PRIMARY KEY (id),
  CONSTRAINT course_validity_check CHECK (
    default_validity_months IS NULL OR default_validity_months > 0
  ),
  CONSTRAINT course_version_check CHECK (version > 0)
);

CREATE TABLE site_course_requirement (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  course_id UUID NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  warning_days SMALLINT NOT NULL DEFAULT 45,
  created_by_subject VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT site_course_requirement_pkey PRIMARY KEY (id),
  CONSTRAINT site_course_requirement_dates_check CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT site_course_requirement_warning_check CHECK (warning_days >= 0),
  CONSTRAINT site_course_requirement_version_check CHECK (version > 0),
  CONSTRAINT site_course_requirement_site_fkey FOREIGN KEY (site_id)
    REFERENCES site(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT site_course_requirement_course_fkey FOREIGN KEY (course_id)
    REFERENCES course(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT site_course_requirement_no_overlap EXCLUDE USING gist (
    site_id WITH =,
    course_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  )
);

CREATE TABLE course_completion (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  course_id UUID NOT NULL,
  completed_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  expiry_source completion_expiry_source NOT NULL,
  validity_months_applied SMALLINT,
  recorded_by_subject VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMPTZ(3),
  voided_by_subject VARCHAR(255),
  void_reason VARCHAR(500),
  CONSTRAINT course_completion_pkey PRIMARY KEY (id),
  CONSTRAINT course_completion_dates_check CHECK (expires_on >= completed_on),
  CONSTRAINT course_completion_expiry_source_check CHECK (
    (expiry_source = 'CALCULATED' AND validity_months_applied > 0)
    OR
    (expiry_source = 'MANUAL' AND validity_months_applied IS NULL)
  ),
  CONSTRAINT course_completion_void_check CHECK (
    (voided_at IS NULL AND voided_by_subject IS NULL AND void_reason IS NULL)
    OR
    (voided_at IS NOT NULL AND voided_by_subject IS NOT NULL AND length(trim(void_reason)) >= 3)
  ),
  CONSTRAINT course_completion_employee_fkey FOREIGN KEY (employee_id)
    REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT course_completion_course_fkey FOREIGN KEY (course_id)
    REFERENCES course(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE audit_event (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_subject VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  request_id VARCHAR(100),
  before_data JSONB,
  after_data JSONB,
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_event_pkey PRIMARY KEY (id)
);

CREATE INDEX employee_archived_name_idx ON employee(archived_at, display_name);
CREATE INDEX customer_archived_name_idx ON customer(archived_at, name);
CREATE INDEX site_customer_archived_name_idx ON site(customer_id, archived_at, name);
CREATE INDEX course_archived_name_idx ON course(archived_at, name);
CREATE INDEX requirement_site_dates_idx
  ON site_course_requirement(site_id, effective_from, effective_to);
CREATE INDEX requirement_course_end_idx
  ON site_course_requirement(course_id, effective_to);
CREATE INDEX completion_employee_course_dates_idx
  ON course_completion(employee_id, course_id, completed_on DESC, recorded_at DESC);
CREATE INDEX completion_course_void_idx ON course_completion(course_id, voided_at);
CREATE INDEX audit_entity_idx
  ON audit_event(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_actor_idx ON audit_event(actor_subject, occurred_at DESC);

CREATE UNIQUE INDEX customer_active_name_key
  ON customer(lower(name)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX site_active_customer_name_key
  ON site(customer_id, lower(name)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX course_code_key ON course(lower(code));
CREATE UNIQUE INDEX completion_active_occurrence_key
  ON course_completion(employee_id, course_id, completed_on)
  WHERE voided_at IS NULL;

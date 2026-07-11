-- HR, attendance, advances, and payroll

INSERT INTO permissions (code, name_ar, module)
VALUES ('hr.manage', 'إدارة الموظفين والرواتب', 'hr')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code = 'hr.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(120) NOT NULL,
    start_time TIME NOT NULL DEFAULT '09:00',
    end_time TIME NOT NULL DEFAULT '17:00',
    required_hours DECIMAL(5,2) NOT NULL DEFAULT 8,
    grace_minutes INT NOT NULL DEFAULT 15,
    overtime_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE,
    full_name VARCHAR(160) NOT NULL,
    job_title VARCHAR(120),
    phone VARCHAR(30),
    salary_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
    base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    hourly_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    overtime_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    daily_required_hours DECIMAL(5,2) NOT NULL DEFAULT 8,
    work_days_per_month INT NOT NULL DEFAULT 26,
    absence_deduction_type VARCHAR(20) NOT NULL DEFAULT 'daily',
    shift_id INT REFERENCES employee_shifts(id),
    start_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employee_attendance (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    work_date DATE NOT NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'present',
    regular_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    late_minutes INT NOT NULL DEFAULT 0,
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS employee_advances (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(12,2) NOT NULL,
    installment_amount DECIMAL(12,2),
    installments_count INT NOT NULL DEFAULT 1,
    paid_installments INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    expense_id INT REFERENCES expenses(id),
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY,
    period_month DATE NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    total_gross DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_advances DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_net DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_at TIMESTAMPTZ,
    expense_id INT REFERENCES expenses(id),
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id SERIAL PRIMARY KEY,
    payroll_run_id INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id INT NOT NULL REFERENCES employees(id),
    base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    worked_days INT NOT NULL DEFAULT 0,
    absent_days INT NOT NULL DEFAULT 0,
    regular_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    late_minutes INT NOT NULL DEFAULT 0,
    overtime_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    absence_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    late_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    advance_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    gross_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON employee_attendance(employee_id, work_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_advances_employee ON employee_advances(employee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);

INSERT INTO employee_shifts (name_ar, start_time, end_time, required_hours, grace_minutes, overtime_enabled)
VALUES ('شيفت أساسي', '09:00', '17:00', 8, 15, TRUE)
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS tr_employee_shifts_updated ON employee_shifts;
CREATE TRIGGER tr_employee_shifts_updated BEFORE UPDATE ON employee_shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_employees_updated ON employees;
CREATE TRIGGER tr_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_employee_attendance_updated ON employee_attendance;
CREATE TRIGGER tr_employee_attendance_updated BEFORE UPDATE ON employee_attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_employee_advances_updated ON employee_advances;
CREATE TRIGGER tr_employee_advances_updated BEFORE UPDATE ON employee_advances FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_payroll_runs_updated ON payroll_runs;
CREATE TRIGGER tr_payroll_runs_updated BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

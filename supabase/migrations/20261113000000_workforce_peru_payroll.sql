-- Additive migration: Restaurant Workforce Management & Peru-Compliant Payroll
-- Compatible with PostgreSQL 15+ / Supabase + openpos_app role security model.

CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  ruc TEXT,
  ciiu_code TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  labor_regime TEXT NOT NULL DEFAULT 'GENERAL',
  remype_registered BOOLEAN NOT NULL DEFAULT false,
  remype_reg_number TEXT,
  remype_reg_date DATE,
  remype_activity_excluded BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.peru_labor_rules (
  id TEXT PRIMARY KEY,
  effective_from DATE NOT NULL,
  effective_to DATE,
  legal_source TEXT NOT NULL,
  rmv NUMERIC(12,2) NOT NULL,
  uit NUMERIC(12,2) NOT NULL,
  daily_hours NUMERIC(5,2) NOT NULL DEFAULT 8,
  weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 48,
  overtime_first_2h_pct NUMERIC(5,2) NOT NULL DEFAULT 25,
  overtime_after_2h_pct NUMERIC(5,2) NOT NULL DEFAULT 35,
  night_start TEXT NOT NULL DEFAULT '22:00',
  night_end TEXT NOT NULL DEFAULT '06:00',
  night_surcharge_pct NUMERIC(5,2) NOT NULL DEFAULT 35,
  essalud_pct NUMERIC(5,2) NOT NULL DEFAULT 9,
  eps_credit_pct NUMERIC(5,2) NOT NULL DEFAULT 6.75,
  onp_pct NUMERIC(5,2) NOT NULL DEFAULT 13,
  afp_obligatorio_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  plame_version TEXT NOT NULL DEFAULT '4.3',
  tips_treatment TEXT NOT NULL DEFAULT 'NON_COMPUTABLE_GRATUITY',
  notes TEXT,
  created_at BIGINT NOT NULL
);

-- Baseline statutory reference rule for Peru (editable and effective-dated).
INSERT INTO public.peru_labor_rules (
  id, effective_from, effective_to, legal_source, rmv, uit,
  daily_hours, weekly_hours, overtime_first_2h_pct, overtime_after_2h_pct,
  night_start, night_end, night_surcharge_pct, essalud_pct, eps_credit_pct,
  onp_pct, afp_obligatorio_pct, plame_version, tips_treatment, notes, created_at
) VALUES (
  'peru_rule_2025_baseline',
  DATE '2025-01-01',
  NULL,
  'D.S. 006-2024-TR (RMV S/ 1,130); D.L. 728; D.S. 007-2002-TR (Jornada/Sobretiempo/Nocturno); D.L. 713 (Vacaciones/Descansos); D.S. 001-97-TR (CTS); Ley 27735 (Gratificaciones); D.S. 013-2013-PRODUCE (REMYPE)',
  1130.00,
  5350.00,
  8.00,
  48.00,
  25.00,
  35.00,
  '22:00',
  '06:00',
  35.00,
  9.00,
  6.75,
  13.00,
  10.00,
  '4.3',
  'NON_COMPUTABLE_GRATUITY',
  'Baseline statutory rules effective Nov 2026. Update RMV/UIT via effective-dated rule rows if updated by supreme decree.',
  1735689600000
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.workforce_employees (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  doc_type TEXT NOT NULL DEFAULT 'DNI',
  doc_number TEXT,
  ruc TEXT,
  position TEXT NOT NULL DEFAULT 'Cashier',
  department TEXT NOT NULL DEFAULT 'Operations',
  role TEXT NOT NULL DEFAULT 'STAFF',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  hire_date DATE,
  termination_date DATE,
  pin_hash TEXT,
  pin_salt TEXT,
  pension_system TEXT NOT NULL DEFAULT 'ONP',
  afp_cuspp TEXT,
  afp_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  afp_insurance_pct NUMERIC(5,2) NOT NULL DEFAULT 1.70,
  has_eps BOOLEAN NOT NULL DEFAULT false,
  has_family_allowance BOOLEAN NOT NULL DEFAULT false,
  bank_name TEXT,
  bank_account TEXT,
  bank_cci TEXT,
  missing_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  employment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  contract_type TEXT NOT NULL DEFAULT 'INDEFINITE',
  labor_regime TEXT NOT NULL DEFAULT 'GENERAL',
  requested_regime TEXT,
  remype_verified BOOLEAN NOT NULL DEFAULT false,
  remype_reg_date DATE,
  requires_accountant_review BOOLEAN NOT NULL DEFAULT false,
  review_reason TEXT,
  wage_type TEXT NOT NULL DEFAULT 'MONTHLY',
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 48,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shift_schedules (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  position TEXT NOT NULL,
  department TEXT,
  shift_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INT NOT NULL DEFAULT 45,
  published BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  target_employee_id TEXT REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by TEXT,
  reviewed_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  shift_id TEXT REFERENCES public.shift_schedules(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  clock_in BIGINT NOT NULL,
  clock_out BIGINT,
  break_start BIGINT,
  break_end BIGINT,
  break_minutes INT NOT NULL DEFAULT 0,
  scheduled_minutes INT NOT NULL DEFAULT 0,
  worked_minutes INT NOT NULL DEFAULT 0,
  night_minutes INT NOT NULL DEFAULT 0,
  late_minutes INT NOT NULL DEFAULT 0,
  overtime_25_minutes INT NOT NULL DEFAULT 0,
  overtime_35_minutes INT NOT NULL DEFAULT 0,
  overtime_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'CLOCKED_IN',
  source TEXT NOT NULL DEFAULT 'PIN_KIOSK',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(6,2) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  document_ref TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by TEXT,
  reviewed_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  period_code TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'MONTHLY',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  payment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  approved_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  labor_regime TEXT NOT NULL,
  gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  employer_contributions NUMERIC(12,2) NOT NULL DEFAULT 0,
  cts_accrual NUMERIC(12,2) NOT NULL DEFAULT 0,
  gratificacion_accrual NUMERIC(12,2) NOT NULL DEFAULT 0,
  vacation_days_accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
  requires_accountant_review BOOLEAN NOT NULL DEFAULT false,
  boleta_snapshot JSONB NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'CALCULATED',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workforce_employees_branch ON public.workforce_employees (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_workforce_employees_auth ON public.workforce_employees (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_emp ON public.employee_contracts (employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_date ON public.shift_schedules (shift_date, branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp_date ON public.attendance_logs (employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON public.leave_requests (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON public.payroll_entries (period_id, employee_id);

DO $wf_rls$
DECLARE
  wf_table TEXT;
BEGIN
  FOREACH wf_table IN ARRAY ARRAY[
    'branches',
    'peru_labor_rules',
    'workforce_employees',
    'employee_contracts',
    'shift_schedules',
    'shift_swap_requests',
    'attendance_logs',
    'leave_requests',
    'payroll_periods',
    'payroll_entries'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', wf_table);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openpos_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO openpos_app', wf_table);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', wf_table);
    EXECUTE format('DROP POLICY IF EXISTS openpos_app_all ON public.%I', wf_table);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openpos_app') THEN
      EXECUTE format(
        'CREATE POLICY openpos_app_all ON public.%I FOR ALL TO openpos_app USING (true) WITH CHECK (true)',
        wf_table
      );
    END IF;
  END LOOP;
END
$wf_rls$;

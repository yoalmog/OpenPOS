const { hashPin, verifyPin, sanitizeEmployee } = require("./pin-crypto");
const {
  DEFAULT_PERU_RULE,
  selectEffectivePeruRule,
  resolveEffectiveLaborRegime,
  calculateNightMinutesLima,
  calculateEmployeePayroll,
  round2
} = require("./peru-payroll-engine");

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureLocalWorkforceState(store) {
  if (!store || typeof store !== "object") return;
  if (!Array.isArray(store.branches)) store.branches = [];
  if (!Array.isArray(store.peruLaborRules) || store.peruLaborRules.length === 0) {
    store.peruLaborRules = [{ ...DEFAULT_PERU_RULE }];
  }
  if (!Array.isArray(store.workforceEmployees)) store.workforceEmployees = [];
  if (!Array.isArray(store.employeeContracts)) store.employeeContracts = [];
  if (!Array.isArray(store.shiftSchedules)) store.shiftSchedules = [];
  if (!Array.isArray(store.shiftSwapRequests)) store.shiftSwapRequests = [];
  if (!Array.isArray(store.attendanceLogs)) store.attendanceLogs = [];
  if (!Array.isArray(store.leaveRequests)) store.leaveRequests = [];
  if (!Array.isArray(store.payrollPeriods)) store.payrollPeriods = [];
  if (!Array.isArray(store.payrollEntries)) store.payrollEntries = [];
}

function toLimaDateStr(epochMs = Date.now()) {
  const limaMs = Number(epochMs) - 5 * 60 * 60 * 1000;
  return new Date(limaMs).toISOString().slice(0, 10);
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function shiftIntervalsOverlap(a, b) {
  if (a.shiftDate !== b.shiftDate || a.employeeId !== b.employeeId || a.id === b.id) return false;
  const aStart = timeToMinutes(a.startTime);
  let aEnd = timeToMinutes(a.endTime);
  if (aEnd <= aStart) aEnd += 24 * 60;
  const bStart = timeToMinutes(b.startTime);
  let bEnd = timeToMinutes(b.endTime);
  if (bEnd <= bStart) bEnd += 24 * 60;
  return aStart < bEnd && bStart < aEnd;
}

function detectShiftConflicts(shifts) {
  const list = Array.isArray(shifts) ? shifts : [];
  const overlaps = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (shiftIntervalsOverlap(list[i], list[j])) {
        overlaps.push({
          employeeId: list[i].employeeId,
          shiftDate: list[i].shiftDate,
          shiftAId: list[i].id,
          shiftBId: list[j].id,
          windowA: `${list[i].startTime}-${list[i].endTime}`,
          windowB: `${list[j].startTime}-${list[j].endTime}`
        });
      }
    }
  }
  return overlaps;
}

function computeMissingDocs(emp) {
  const missing = [];
  if (!String(emp.docNumber || "").trim()) missing.push("DNI / CE");
  if (!String(emp.hireDate || "").trim()) missing.push("Fecha de ingreso");
  if (String(emp.pensionSystem || "").startsWith("AFP") && !String(emp.afpCuspp || "").trim()) {
    missing.push("Código CUSPP AFP");
  }
  if (!String(emp.bankCci || emp.bankAccount || "").trim()) missing.push("Cuenta bancaria / CCI");
  if (!emp.pinHash && !emp.hasPin) missing.push("PIN de asistencia");
  return missing;
}

function mapBranchRow(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || "",
    address: row.address || "",
    ruc: row.ruc || "",
    ciiuCode: row.ciiu_code || "",
    timezone: row.timezone || "America/Lima",
    laborRegime: row.labor_regime || "GENERAL",
    remypeRegistered: Boolean(row.remype_registered),
    remypeRegNumber: row.remype_reg_number || "",
    remypeRegDate: row.remype_reg_date ? String(row.remype_reg_date).slice(0, 10) : null,
    remypeActivityExcluded: Boolean(row.remype_activity_excluded),
    isActive: row.is_active !== false,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapRuleRow(row) {
  return {
    id: row.id,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    legalSource: row.legal_source,
    rmv: Number(row.rmv),
    uit: Number(row.uit),
    dailyHours: Number(row.daily_hours),
    weeklyHours: Number(row.weekly_hours),
    overtimeFirst2hPct: Number(row.overtime_first_2h_pct),
    overtimeAfter2hPct: Number(row.overtime_after_2h_pct),
    nightStart: row.night_start,
    nightEnd: row.night_end,
    nightSurchargePct: Number(row.night_surcharge_pct),
    essaludPct: Number(row.essalud_pct),
    epsCreditPct: Number(row.eps_credit_pct),
    onpPct: Number(row.onp_pct),
    afpObligatorioPct: Number(row.afp_obligatorio_pct),
    plameVersion: row.plame_version,
    tipsTreatment: row.tips_treatment,
    notes: row.notes || "",
    createdAt: Number(row.created_at)
  };
}

function mapEmployeeRow(row, includeSecrets = false) {
  const mapped = {
    id: row.id,
    authUserId: row.auth_user_id || null,
    branchId: row.branch_id || null,
    fullName: row.full_name,
    email: row.email || "",
    phone: row.phone || "",
    docType: row.doc_type || "DNI",
    docNumber: row.doc_number || "",
    ruc: row.ruc || "",
    position: row.position || "Staff",
    department: row.department || "Operations",
    role: row.role || "STAFF",
    status: row.status || "ACTIVE",
    hireDate: row.hire_date ? String(row.hire_date).slice(0, 10) : null,
    terminationDate: row.termination_date ? String(row.termination_date).slice(0, 10) : null,
    pensionSystem: row.pension_system || "ONP",
    afpCuspp: row.afp_cuspp || "",
    afpCommissionPct: Number(row.afp_commission_pct || 0),
    afpInsurancePct: Number(row.afp_insurance_pct ?? 1.7),
    hasEps: Boolean(row.has_eps),
    hasFamilyAllowance: Boolean(row.has_family_allowance),
    bankName: row.bank_name || "",
    bankAccount: row.bank_account || "",
    bankCci: row.bank_cci || "",
    missingDocs: typeof row.missing_docs === "string" ? JSON.parse(row.missing_docs) : (row.missing_docs || []),
    preferredHours: typeof row.preferred_hours === "string" ? JSON.parse(row.preferred_hours) : (row.preferred_hours || {}),
    employmentHistory: typeof row.employment_history === "string" ? JSON.parse(row.employment_history) : (row.employment_history || []),
    hasPin: Boolean(row.pin_hash),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
  if (includeSecrets) {
    mapped.pinHash = row.pin_hash || null;
    mapped.pinSalt = row.pin_salt || null;
  }
  return includeSecrets ? mapped : sanitizeEmployee(mapped);
}

function mapContractRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    branchId: row.branch_id || null,
    contractType: row.contract_type,
    laborRegime: row.labor_regime,
    requestedRegime: row.requested_regime || row.labor_regime,
    remypeVerified: Boolean(row.remype_verified),
    remypeRegDate: row.remype_reg_date ? String(row.remype_reg_date).slice(0, 10) : null,
    requiresAccountantReview: Boolean(row.requires_accountant_review),
    reviewReason: row.review_reason || "",
    wageType: row.wage_type,
    baseSalary: Number(row.base_salary),
    hourlyRate: Number(row.hourly_rate),
    weeklyHours: Number(row.weekly_hours),
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    status: row.status,
    notes: row.notes || "",
    createdAt: Number(row.created_at)
  };
}

function mapShiftRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    branchId: row.branch_id || null,
    position: row.position,
    department: row.department || "",
    shiftDate: String(row.shift_date).slice(0, 10),
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: Number(row.break_minutes || 0),
    published: Boolean(row.published),
    status: row.status,
    notes: row.notes || "",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapSwapRow(row) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    requesterId: row.requester_id,
    targetEmployeeId: row.target_employee_id || null,
    reason: row.reason || "",
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at ? Number(row.reviewed_at) : null,
    createdAt: Number(row.created_at)
  };
}

function mapAttendanceRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    branchId: row.branch_id || null,
    shiftId: row.shift_id || null,
    workDate: String(row.work_date).slice(0, 10),
    clockIn: Number(row.clock_in),
    clockOut: row.clock_out ? Number(row.clock_out) : null,
    breakStart: row.break_start ? Number(row.break_start) : null,
    breakEnd: row.break_end ? Number(row.break_end) : null,
    breakMinutes: Number(row.break_minutes || 0),
    scheduledMinutes: Number(row.scheduled_minutes || 0),
    workedMinutes: Number(row.worked_minutes || 0),
    nightMinutes: Number(row.night_minutes || 0),
    lateMinutes: Number(row.late_minutes || 0),
    overtime25Minutes: Number(row.overtime_25_minutes || 0),
    overtime35Minutes: Number(row.overtime_35_minutes || 0),
    overtimeApproved: Boolean(row.overtime_approved),
    approvedBy: row.approved_by || null,
    status: row.status,
    source: row.source || "PIN_KIOSK",
    notes: row.notes || "",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapLeaveRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    daysCount: Number(row.days_count),
    paid: Boolean(row.paid),
    reason: row.reason || "",
    documentRef: row.document_ref || "",
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at ? Number(row.reviewed_at) : null,
    createdAt: Number(row.created_at)
  };
}

function mapPeriodRow(row) {
  return {
    id: row.id,
    branchId: row.branch_id || null,
    periodCode: row.period_code,
    periodType: row.period_type,
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    paymentDate: String(row.payment_date).slice(0, 10),
    status: row.status,
    totals: typeof row.totals === "string" ? JSON.parse(row.totals) : (row.totals || {}),
    createdBy: row.created_by || null,
    approvedBy: row.approved_by || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapPayrollEntryRow(row) {
  return {
    id: row.id,
    periodId: row.period_id,
    employeeId: row.employee_id,
    branchId: row.branch_id || null,
    laborRegime: row.labor_regime,
    grossPay: Number(row.gross_pay),
    totalDeductions: Number(row.total_deductions),
    netPay: Number(row.net_pay),
    employerContributions: Number(row.employer_contributions),
    ctsAccrual: Number(row.cts_accrual),
    gratificacionAccrual: Number(row.gratificacion_accrual),
    vacationDaysAccrued: Number(row.vacation_days_accrued),
    requiresAccountantReview: Boolean(row.requires_accountant_review),
    boletaSnapshot: typeof row.boleta_snapshot === "string" ? JSON.parse(row.boleta_snapshot) : row.boleta_snapshot,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date ? String(row.payment_date).slice(0, 10) : null,
    status: row.status,
    createdAt: Number(row.created_at)
  };
}

// ---------------- Branches ----------------
async function listBranches({ pool, store }) {
  if (pool) {
    const res = await pool.query("SELECT * FROM public.branches ORDER BY created_at ASC");
    return res.rows.map(mapBranchRow);
  }
  ensureLocalWorkforceState(store);
  return [...store.branches];
}

async function saveBranch({ pool, store }, payload) {
  const now = Date.now();
  const name = String(payload?.name || "").trim();
  if (!name) throw new Error("Branch name is required.");
  const branch = {
    id: payload.id || makeId("br"),
    name,
    code: String(payload.code || "").trim(),
    address: String(payload.address || "").trim(),
    ruc: String(payload.ruc || "").trim(),
    ciiuCode: String(payload.ciiuCode || "").trim(),
    timezone: payload.timezone || "America/Lima",
    laborRegime: String(payload.laborRegime || "GENERAL").toUpperCase(),
    remypeRegistered: Boolean(payload.remypeRegistered),
    remypeRegNumber: String(payload.remypeRegNumber || "").trim(),
    remypeRegDate: payload.remypeRegDate || null,
    remypeActivityExcluded: Boolean(payload.remypeActivityExcluded),
    isActive: payload.isActive !== false,
    createdAt: Number(payload.createdAt) || now,
    updatedAt: now
  };
  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.branches (
        id, name, code, address, ruc, ciiu_code, timezone, labor_regime,
        remype_registered, remype_reg_number, remype_reg_date, remype_activity_excluded,
        is_active, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, code=EXCLUDED.code, address=EXCLUDED.address, ruc=EXCLUDED.ruc,
        ciiu_code=EXCLUDED.ciiu_code, timezone=EXCLUDED.timezone, labor_regime=EXCLUDED.labor_regime,
        remype_registered=EXCLUDED.remype_registered, remype_reg_number=EXCLUDED.remype_reg_number,
        remype_reg_date=EXCLUDED.remype_reg_date, remype_activity_excluded=EXCLUDED.remype_activity_excluded,
        is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at
      RETURNING *`,
      [
        branch.id, branch.name, branch.code, branch.address, branch.ruc, branch.ciiuCode,
        branch.timezone, branch.laborRegime, branch.remypeRegistered, branch.remypeRegNumber,
        branch.remypeRegDate, branch.remypeActivityExcluded, branch.isActive, branch.createdAt, branch.updatedAt
      ]
    );
    return mapBranchRow(res.rows[0]);
  }
  ensureLocalWorkforceState(store);
  const idx = store.branches.findIndex((b) => b.id === branch.id);
  if (idx >= 0) store.branches[idx] = branch;
  else store.branches.push(branch);
  return branch;
}

// ---------------- Peru Labor Rules ----------------
async function listPeruLaborRules({ pool, store }) {
  if (pool) {
    const res = await pool.query("SELECT * FROM public.peru_labor_rules ORDER BY effective_from DESC");
    return res.rows.length ? res.rows.map(mapRuleRow) : [{ ...DEFAULT_PERU_RULE }];
  }
  ensureLocalWorkforceState(store);
  return [...store.peruLaborRules].sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
}

async function savePeruLaborRule({ pool, store }, payload) {
  const rule = {
    id: payload.id || makeId("prule"),
    effectiveFrom: String(payload.effectiveFrom || new Date().toISOString().slice(0, 10)).slice(0, 10),
    effectiveTo: payload.effectiveTo ? String(payload.effectiveTo).slice(0, 10) : null,
    legalSource: String(payload.legalSource || "").trim() || DEFAULT_PERU_RULE.legalSource,
    rmv: Number(payload.rmv ?? DEFAULT_PERU_RULE.rmv),
    uit: Number(payload.uit ?? DEFAULT_PERU_RULE.uit),
    dailyHours: Number(payload.dailyHours ?? 8),
    weeklyHours: Number(payload.weeklyHours ?? 48),
    overtimeFirst2hPct: Number(payload.overtimeFirst2hPct ?? 25),
    overtimeAfter2hPct: Number(payload.overtimeAfter2hPct ?? 35),
    nightStart: payload.nightStart || "22:00",
    nightEnd: payload.nightEnd || "06:00",
    nightSurchargePct: Number(payload.nightSurchargePct ?? 35),
    essaludPct: Number(payload.essaludPct ?? 9),
    epsCreditPct: Number(payload.epsCreditPct ?? 6.75),
    onpPct: Number(payload.onpPct ?? 13),
    afpObligatorioPct: Number(payload.afpObligatorioPct ?? 10),
    plameVersion: String(payload.plameVersion || "4.3"),
    tipsTreatment: payload.tipsTreatment === "COMPUTABLE_SURCHARGE" ? "COMPUTABLE_SURCHARGE" : "NON_COMPUTABLE_GRATUITY",
    notes: String(payload.notes || "").trim(),
    createdAt: Number(payload.createdAt) || Date.now()
  };
  if (!Number.isFinite(rule.rmv) || rule.rmv <= 0) throw new Error("RMV must be a positive PEN amount.");
  if (!Number.isFinite(rule.uit) || rule.uit <= 0) throw new Error("UIT must be a positive PEN amount.");

  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.peru_labor_rules (
        id, effective_from, effective_to, legal_source, rmv, uit, daily_hours, weekly_hours,
        overtime_first_2h_pct, overtime_after_2h_pct, night_start, night_end, night_surcharge_pct,
        essalud_pct, eps_credit_pct, onp_pct, afp_obligatorio_pct, plame_version, tips_treatment, notes, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (id) DO UPDATE SET
        effective_from=EXCLUDED.effective_from, effective_to=EXCLUDED.effective_to, legal_source=EXCLUDED.legal_source,
        rmv=EXCLUDED.rmv, uit=EXCLUDED.uit, daily_hours=EXCLUDED.daily_hours, weekly_hours=EXCLUDED.weekly_hours,
        overtime_first_2h_pct=EXCLUDED.overtime_first_2h_pct, overtime_after_2h_pct=EXCLUDED.overtime_after_2h_pct,
        night_start=EXCLUDED.night_start, night_end=EXCLUDED.night_end, night_surcharge_pct=EXCLUDED.night_surcharge_pct,
        essalud_pct=EXCLUDED.essalud_pct, eps_credit_pct=EXCLUDED.eps_credit_pct, onp_pct=EXCLUDED.onp_pct,
        afp_obligatorio_pct=EXCLUDED.afp_obligatorio_pct, plame_version=EXCLUDED.plame_version,
        tips_treatment=EXCLUDED.tips_treatment, notes=EXCLUDED.notes
      RETURNING *`,
      [
        rule.id, rule.effectiveFrom, rule.effectiveTo, rule.legalSource, rule.rmv, rule.uit,
        rule.dailyHours, rule.weeklyHours, rule.overtimeFirst2hPct, rule.overtimeAfter2hPct,
        rule.nightStart, rule.nightEnd, rule.nightSurchargePct, rule.essaludPct, rule.epsCreditPct,
        rule.onpPct, rule.afpObligatorioPct, rule.plameVersion, rule.tipsTreatment, rule.notes, rule.createdAt
      ]
    );
    return mapRuleRow(res.rows[0]);
  }
  ensureLocalWorkforceState(store);
  const idx = store.peruLaborRules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) store.peruLaborRules[idx] = rule;
  else store.peruLaborRules.push(rule);
  return rule;
}

// ---------------- Employees & Contracts ----------------
async function listEmployees({ pool, store }, { branchId, includeSecrets = false } = {}) {
  if (pool) {
    const res = branchId
      ? await pool.query("SELECT * FROM public.workforce_employees WHERE branch_id = $1 ORDER BY full_name ASC", [branchId])
      : await pool.query("SELECT * FROM public.workforce_employees ORDER BY full_name ASC");
    return res.rows.map((r) => mapEmployeeRow(r, includeSecrets));
  }
  ensureLocalWorkforceState(store);
  let rows = [...store.workforceEmployees];
  if (branchId) rows = rows.filter((e) => e.branchId === branchId);
  return rows.map((e) => (includeSecrets ? { ...e } : sanitizeEmployee(e)));
}

async function saveEmployee({ pool, store }, payload) {
  const now = Date.now();
  const fullName = String(payload?.fullName || "").trim();
  if (!fullName) throw new Error("Employee full name is required.");

  let existing = null;
  if (payload.id) {
    const all = await listEmployees({ pool, store }, { includeSecrets: true });
    existing = all.find((e) => e.id === payload.id) || null;
  }

  let pinHash = existing?.pinHash || null;
  let pinSalt = existing?.pinSalt || null;
  if (payload.pin !== undefined && payload.pin !== null && String(payload.pin).trim() !== "") {
    const hashed = hashPin(String(payload.pin).trim());
    pinHash = hashed.hash;
    pinSalt = hashed.salt;
  }

  const history = Array.isArray(existing?.employmentHistory) ? [...existing.employmentHistory] : [];
  if (!existing) {
    history.unshift({ date: new Date(now).toISOString().slice(0, 10), event: "HIRED", detail: `${payload.position || "Staff"} (${payload.status || "ACTIVE"})` });
  } else if (payload.status && payload.status !== existing.status) {
    history.unshift({ date: new Date(now).toISOString().slice(0, 10), event: "STATUS_CHANGE", detail: `${existing.status} -> ${payload.status}` });
  }

  const employee = {
    id: payload.id || makeId("emp"),
    authUserId: payload.authUserId ?? existing?.authUserId ?? null,
    branchId: payload.branchId ?? existing?.branchId ?? null,
    fullName,
    email: String(payload.email ?? existing?.email ?? "").trim().toLowerCase(),
    phone: String(payload.phone ?? existing?.phone ?? "").trim(),
    docType: String(payload.docType ?? existing?.docType ?? "DNI").toUpperCase(),
    docNumber: String(payload.docNumber ?? existing?.docNumber ?? "").trim(),
    ruc: String(payload.ruc ?? existing?.ruc ?? "").trim(),
    position: String(payload.position ?? existing?.position ?? "Cashier").trim(),
    department: String(payload.department ?? existing?.department ?? "Operations").trim(),
    role: String(payload.role ?? existing?.role ?? "STAFF").toUpperCase(),
    status: String(payload.status ?? existing?.status ?? "ACTIVE").toUpperCase(),
    hireDate: payload.hireDate ?? existing?.hireDate ?? null,
    terminationDate: payload.terminationDate ?? existing?.terminationDate ?? null,
    pinHash,
    pinSalt,
    pensionSystem: String(payload.pensionSystem ?? existing?.pensionSystem ?? "ONP").toUpperCase(),
    afpCuspp: String(payload.afpCuspp ?? existing?.afpCuspp ?? "").trim(),
    afpCommissionPct: Number(payload.afpCommissionPct ?? existing?.afpCommissionPct ?? 0),
    afpInsurancePct: Number(payload.afpInsurancePct ?? existing?.afpInsurancePct ?? 1.7),
    hasEps: Boolean(payload.hasEps ?? existing?.hasEps ?? false),
    hasFamilyAllowance: Boolean(payload.hasFamilyAllowance ?? existing?.hasFamilyAllowance ?? false),
    bankName: String(payload.bankName ?? existing?.bankName ?? "").trim(),
    bankAccount: String(payload.bankAccount ?? existing?.bankAccount ?? "").trim(),
    bankCci: String(payload.bankCci ?? existing?.bankCci ?? "").trim(),
    preferredHours: payload.preferredHours ?? existing?.preferredHours ?? {},
    employmentHistory: history,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  employee.missingDocs = computeMissingDocs(employee);

  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.workforce_employees (
        id, auth_user_id, branch_id, full_name, email, phone, doc_type, doc_number, ruc,
        position, department, role, status, hire_date, termination_date, pin_hash, pin_salt,
        pension_system, afp_cuspp, afp_commission_pct, afp_insurance_pct, has_eps, has_family_allowance,
        bank_name, bank_account, bank_cci, missing_docs, preferred_hours, employment_history, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28::jsonb,$29::jsonb,$30,$31)
      ON CONFLICT (id) DO UPDATE SET
        auth_user_id=EXCLUDED.auth_user_id, branch_id=EXCLUDED.branch_id, full_name=EXCLUDED.full_name,
        email=EXCLUDED.email, phone=EXCLUDED.phone, doc_type=EXCLUDED.doc_type, doc_number=EXCLUDED.doc_number,
        ruc=EXCLUDED.ruc, position=EXCLUDED.position, department=EXCLUDED.department, role=EXCLUDED.role,
        status=EXCLUDED.status, hire_date=EXCLUDED.hire_date, termination_date=EXCLUDED.termination_date,
        pin_hash=EXCLUDED.pin_hash, pin_salt=EXCLUDED.pin_salt, pension_system=EXCLUDED.pension_system,
        afp_cuspp=EXCLUDED.afp_cuspp, afp_commission_pct=EXCLUDED.afp_commission_pct,
        afp_insurance_pct=EXCLUDED.afp_insurance_pct, has_eps=EXCLUDED.has_eps,
        has_family_allowance=EXCLUDED.has_family_allowance, bank_name=EXCLUDED.bank_name,
        bank_account=EXCLUDED.bank_account, bank_cci=EXCLUDED.bank_cci, missing_docs=EXCLUDED.missing_docs,
        preferred_hours=EXCLUDED.preferred_hours, employment_history=EXCLUDED.employment_history,
        updated_at=EXCLUDED.updated_at
      RETURNING *`,
      [
        employee.id, employee.authUserId, employee.branchId, employee.fullName, employee.email,
        employee.phone, employee.docType, employee.docNumber, employee.ruc, employee.position,
        employee.department, employee.role, employee.status, employee.hireDate, employee.terminationDate,
        employee.pinHash, employee.pinSalt, employee.pensionSystem, employee.afpCuspp,
        employee.afpCommissionPct, employee.afpInsurancePct, employee.hasEps, employee.hasFamilyAllowance,
        employee.bankName, employee.bankAccount, employee.bankCci, JSON.stringify(employee.missingDocs),
        JSON.stringify(employee.preferredHours), JSON.stringify(employee.employmentHistory),
        employee.createdAt, employee.updatedAt
      ]
    );
    return mapEmployeeRow(res.rows[0], false);
  }

  ensureLocalWorkforceState(store);
  const idx = store.workforceEmployees.findIndex((e) => e.id === employee.id);
  if (idx >= 0) store.workforceEmployees[idx] = employee;
  else store.workforceEmployees.unshift(employee);
  return sanitizeEmployee(employee);
}

async function listContracts({ pool, store }, { employeeId } = {}) {
  if (pool) {
    const res = employeeId
      ? await pool.query("SELECT * FROM public.employee_contracts WHERE employee_id = $1 ORDER BY effective_from DESC", [employeeId])
      : await pool.query("SELECT * FROM public.employee_contracts ORDER BY effective_from DESC");
    return res.rows.map(mapContractRow);
  }
  ensureLocalWorkforceState(store);
  let rows = [...store.employeeContracts];
  if (employeeId) rows = rows.filter((c) => c.employeeId === employeeId);
  return rows.sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
}

async function saveContract({ pool, store }, payload) {
  if (!payload?.employeeId) throw new Error("employeeId is required.");
  const branches = await listBranches({ pool, store });
  const branch = branches.find((b) => b.id === payload.branchId) || {};
  const regimeInfo = resolveEffectiveLaborRegime({ contract: payload, branch });

  const contract = {
    id: payload.id || makeId("ctr"),
    employeeId: payload.employeeId,
    branchId: payload.branchId || branch.id || null,
    contractType: String(payload.contractType || "INDEFINITE").toUpperCase(),
    laborRegime: regimeInfo.effectiveRegime,
    requestedRegime: regimeInfo.requestedRegime,
    remypeVerified: Boolean(payload.remypeVerified),
    remypeRegDate: payload.remypeRegDate || branch.remypeRegDate || null,
    requiresAccountantReview: regimeInfo.requiresAccountantReview,
    reviewReason: regimeInfo.reviewReasons.join(" "),
    wageType: String(payload.wageType || "MONTHLY").toUpperCase(),
    baseSalary: Number(payload.baseSalary || 0),
    hourlyRate: Number(payload.hourlyRate || 0),
    weeklyHours: Number(payload.weeklyHours || 48),
    effectiveFrom: String(payload.effectiveFrom || toLimaDateStr()).slice(0, 10),
    effectiveTo: payload.effectiveTo ? String(payload.effectiveTo).slice(0, 10) : null,
    status: String(payload.status || "ACTIVE").toUpperCase(),
    notes: String(payload.notes || "").trim(),
    createdAt: Number(payload.createdAt) || Date.now()
  };

  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.employee_contracts (
        id, employee_id, branch_id, contract_type, labor_regime, requested_regime,
        remype_verified, remype_reg_date, requires_accountant_review, review_reason,
        wage_type, base_salary, hourly_rate, weekly_hours, effective_from, effective_to, status, notes, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        branch_id=EXCLUDED.branch_id, contract_type=EXCLUDED.contract_type, labor_regime=EXCLUDED.labor_regime,
        requested_regime=EXCLUDED.requested_regime, remype_verified=EXCLUDED.remype_verified,
        remype_reg_date=EXCLUDED.remype_reg_date, requires_accountant_review=EXCLUDED.requires_accountant_review,
        review_reason=EXCLUDED.review_reason, wage_type=EXCLUDED.wage_type, base_salary=EXCLUDED.base_salary,
        hourly_rate=EXCLUDED.hourly_rate, weekly_hours=EXCLUDED.weekly_hours, effective_from=EXCLUDED.effective_from,
        effective_to=EXCLUDED.effective_to, status=EXCLUDED.status, notes=EXCLUDED.notes
      RETURNING *`,
      [
        contract.id, contract.employeeId, contract.branchId, contract.contractType, contract.laborRegime,
        contract.requestedRegime, contract.remypeVerified, contract.remypeRegDate,
        contract.requiresAccountantReview, contract.reviewReason, contract.wageType, contract.baseSalary,
        contract.hourlyRate, contract.weeklyHours, contract.effectiveFrom, contract.effectiveTo,
        contract.status, contract.notes, contract.createdAt
      ]
    );
    return mapContractRow(res.rows[0]);
  }
  ensureLocalWorkforceState(store);
  const idx = store.employeeContracts.findIndex((c) => c.id === contract.id);
  if (idx >= 0) store.employeeContracts[idx] = contract;
  else store.employeeContracts.unshift(contract);
  return contract;
}

// ---------------- Shifts & Swaps ----------------
async function listShifts({ pool, store }, { branchId, startDate, endDate, publishedOnly } = {}) {
  let rows;
  if (pool) {
    const res = await pool.query("SELECT * FROM public.shift_schedules ORDER BY shift_date ASC, start_time ASC");
    rows = res.rows.map(mapShiftRow);
  } else {
    ensureLocalWorkforceState(store);
    rows = [...store.shiftSchedules];
  }
  if (branchId) rows = rows.filter((s) => s.branchId === branchId);
  if (startDate) rows = rows.filter((s) => s.shiftDate >= startDate);
  if (endDate) rows = rows.filter((s) => s.shiftDate <= endDate);
  if (publishedOnly) rows = rows.filter((s) => s.published);
  return {
    shifts: rows,
    overlapConflicts: detectShiftConflicts(rows)
  };
}

async function saveShift({ pool, store }, payload) {
  const now = Date.now();
  if (!payload?.employeeId || !payload?.shiftDate || !payload?.startTime || !payload?.endTime) {
    throw new Error("employeeId, shiftDate, startTime, and endTime are required.");
  }
  const shift = {
    id: payload.id || makeId("shf"),
    employeeId: payload.employeeId,
    branchId: payload.branchId || null,
    position: String(payload.position || "Staff").trim(),
    department: String(payload.department || "Operations").trim(),
    shiftDate: String(payload.shiftDate).slice(0, 10),
    startTime: String(payload.startTime).slice(0, 5),
    endTime: String(payload.endTime).slice(0, 5),
    breakMinutes: Number(payload.breakMinutes ?? 45),
    published: Boolean(payload.published),
    status: String(payload.status || "SCHEDULED").toUpperCase(),
    notes: String(payload.notes || "").trim(),
    createdAt: Number(payload.createdAt) || now,
    updatedAt: now
  };
  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.shift_schedules (
        id, employee_id, branch_id, position, department, shift_date, start_time, end_time,
        break_minutes, published, status, notes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        employee_id=EXCLUDED.employee_id, branch_id=EXCLUDED.branch_id, position=EXCLUDED.position,
        department=EXCLUDED.department, shift_date=EXCLUDED.shift_date, start_time=EXCLUDED.start_time,
        end_time=EXCLUDED.end_time, break_minutes=EXCLUDED.break_minutes, published=EXCLUDED.published,
        status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at
      RETURNING *`,
      [
        shift.id, shift.employeeId, shift.branchId, shift.position, shift.department, shift.shiftDate,
        shift.startTime, shift.endTime, shift.breakMinutes, shift.published, shift.status, shift.notes,
        shift.createdAt, shift.updatedAt
      ]
    );
    const saved = mapShiftRow(res.rows[0]);
    const all = await listShifts({ pool, store }, { startDate: shift.shiftDate, endDate: shift.shiftDate });
    return { shift: saved, overlapConflicts: all.overlapConflicts };
  }
  ensureLocalWorkforceState(store);
  const idx = store.shiftSchedules.findIndex((s) => s.id === shift.id);
  if (idx >= 0) store.shiftSchedules[idx] = shift;
  else store.shiftSchedules.push(shift);
  const all = await listShifts({ pool, store }, { startDate: shift.shiftDate, endDate: shift.shiftDate });
  return { shift, overlapConflicts: all.overlapConflicts };
}

async function publishShifts({ pool, store }, { startDate, endDate, branchId } = {}) {
  const now = Date.now();
  if (pool) {
    const res = await pool.query(
      `UPDATE public.shift_schedules SET published = true, updated_at = $1
       WHERE ($2::date IS NULL OR shift_date >= $2::date)
         AND ($3::date IS NULL OR shift_date <= $3::date)
         AND ($4::text IS NULL OR branch_id = $4)
       RETURNING *`,
      [now, startDate || null, endDate || null, branchId || null]
    );
    return res.rows.map(mapShiftRow);
  }
  ensureLocalWorkforceState(store);
  const updated = [];
  store.shiftSchedules.forEach((s) => {
    if (
      (!startDate || s.shiftDate >= startDate) &&
      (!endDate || s.shiftDate <= endDate) &&
      (!branchId || s.branchId === branchId)
    ) {
      s.published = true;
      s.updatedAt = now;
      updated.push(s);
    }
  });
  return updated;
}

async function listSwaps({ pool, store }) {
  if (pool) {
    const res = await pool.query("SELECT * FROM public.shift_swap_requests ORDER BY created_at DESC");
    return res.rows.map(mapSwapRow);
  }
  ensureLocalWorkforceState(store);
  return [...store.shiftSwapRequests];
}

async function createSwapRequest({ pool, store }, payload) {
  if (!payload?.shiftId || !payload?.requesterId) throw new Error("shiftId and requesterId are required.");
  const swap = {
    id: makeId("swp"),
    shiftId: payload.shiftId,
    requesterId: payload.requesterId,
    targetEmployeeId: payload.targetEmployeeId || null,
    reason: String(payload.reason || "").trim(),
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: Date.now()
  };
  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.shift_swap_requests (id, shift_id, requester_id, target_employee_id, reason, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [swap.id, swap.shiftId, swap.requesterId, swap.targetEmployeeId, swap.reason, swap.status, swap.createdAt]
    );
    return mapSwapRow(res.rows[0]);
  }
  ensureLocalWorkforceState(store);
  store.shiftSwapRequests.unshift(swap);
  return swap;
}

async function decideSwapRequest({ pool, store }, { id, decision, reviewedBy }) {
  const status = decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const now = Date.now();
  if (pool) {
    const res = await pool.query(
      `UPDATE public.shift_swap_requests SET status = $2, reviewed_by = $3, reviewed_at = $4 WHERE id = $1 RETURNING *`,
      [id, status, reviewedBy || "Manager", now]
    );
    const swap = res.rows[0] ? mapSwapRow(res.rows[0]) : null;
    if (swap && status === "APPROVED" && swap.targetEmployeeId) {
      await pool.query("UPDATE public.shift_schedules SET employee_id = $2, updated_at = $3 WHERE id = $1", [
        swap.shiftId,
        swap.targetEmployeeId,
        now
      ]);
    }
    return swap;
  }
  ensureLocalWorkforceState(store);
  const swap = store.shiftSwapRequests.find((r) => r.id === id);
  if (!swap) return null;
  swap.status = status;
  swap.reviewedBy = reviewedBy || "Manager";
  swap.reviewedAt = now;
  if (status === "APPROVED" && swap.targetEmployeeId) {
    const shift = store.shiftSchedules.find((s) => s.id === swap.shiftId);
    if (shift) {
      shift.employeeId = swap.targetEmployeeId;
      shift.updatedAt = now;
    }
  }
  return swap;
}

// ---------------- Attendance & PIN Kiosk ----------------
async function listAttendance({ pool, store }, { employeeId, startDate, endDate } = {}) {
  let rows;
  if (pool) {
    const res = await pool.query("SELECT * FROM public.attendance_logs ORDER BY clock_in DESC LIMIT 500");
    rows = res.rows.map(mapAttendanceRow);
  } else {
    ensureLocalWorkforceState(store);
    rows = [...store.attendanceLogs];
  }
  if (employeeId) rows = rows.filter((a) => a.employeeId === employeeId);
  if (startDate) rows = rows.filter((a) => a.workDate >= startDate);
  if (endDate) rows = rows.filter((a) => a.workDate <= endDate);
  return rows;
}

async function authenticateEmployeeByPin({ pool, store }, { employeeId, pin }) {
  const employees = await listEmployees({ pool, store }, { includeSecrets: true });
  const active = employees.filter((e) => e.status === "ACTIVE" && e.pinHash && e.pinSalt);
  if (employeeId) {
    const emp = active.find((e) => e.id === employeeId);
    if (!emp || !verifyPin(pin, emp.pinSalt, emp.pinHash)) return null;
    return sanitizeEmployee(emp);
  }
  const matches = active.filter((e) => verifyPin(pin, e.pinSalt, e.pinHash));
  if (matches.length !== 1) return null; // Reject ambiguous or invalid PIN cleanly
  return sanitizeEmployee(matches[0]);
}

async function recordPinClockAction({ pool, store }, { employeeId, pin, action, branchId, nowMs = Date.now() }) {
  const employee = await authenticateEmployeeByPin({ pool, store }, { employeeId, pin });
  if (!employee) {
    const err = new Error("Invalid or unrecognized active employee PIN.");
    err.statusCode = 403;
    throw err;
  }

  const normalizedAction = String(action || "CLOCK_IN").toUpperCase();
  const workDate = toLimaDateStr(nowMs);
  const logs = await listAttendance({ pool, store }, { employeeId: employee.id });
  const openLog = logs.find((l) => l.status === "CLOCKED_IN" || l.status === "ON_BREAK");

  if (normalizedAction === "CLOCK_IN") {
    if (openLog) {
      const err = new Error("Employee already has an active clocked-in shift.");
      err.statusCode = 409;
      throw err;
    }
    const { shifts } = await listShifts({ pool, store }, { startDate: workDate, endDate: workDate });
    const assignedShift = shifts.find((s) => s.employeeId === employee.id);
    let lateMinutes = 0;
    let scheduledMinutes = 480;
    if (assignedShift) {
      const startMin = timeToMinutes(assignedShift.startTime);
      let endMin = timeToMinutes(assignedShift.endTime);
      if (endMin <= startMin) endMin += 24 * 60;
      scheduledMinutes = Math.max(0, endMin - startMin - (assignedShift.breakMinutes || 0));
      const limaClockIn = new Date(nowMs - 5 * 60 * 60 * 1000);
      const clockInMin = limaClockIn.getUTCHours() * 60 + limaClockIn.getUTCMinutes();
      lateMinutes = Math.max(0, clockInMin - startMin);
    }

    const log = {
      id: makeId("att"),
      employeeId: employee.id,
      branchId: branchId || employee.branchId || null,
      shiftId: assignedShift?.id || null,
      workDate,
      clockIn: nowMs,
      clockOut: null,
      breakStart: null,
      breakEnd: null,
      breakMinutes: 0,
      scheduledMinutes,
      workedMinutes: 0,
      nightMinutes: 0,
      lateMinutes,
      overtime25Minutes: 0,
      overtime35Minutes: 0,
      overtimeApproved: false,
      approvedBy: null,
      status: "CLOCKED_IN",
      source: "PIN_KIOSK",
      notes: "",
      createdAt: nowMs,
      updatedAt: nowMs
    };
    return persistAttendanceLog({ pool, store }, log, employee);
  }

  if (!openLog) {
    const err = new Error("No active shift found for this employee.");
    err.statusCode = 404;
    throw err;
  }

  if (normalizedAction === "BREAK_START") {
    openLog.breakStart = nowMs;
    openLog.status = "ON_BREAK";
    openLog.updatedAt = nowMs;
    return persistAttendanceLog({ pool, store }, openLog, employee);
  }

  if (normalizedAction === "BREAK_END") {
    if (openLog.breakStart) {
      openLog.breakMinutes += Math.max(0, Math.round((nowMs - openLog.breakStart) / 60000));
    }
    openLog.breakEnd = nowMs;
    openLog.status = "CLOCKED_IN";
    openLog.updatedAt = nowMs;
    return persistAttendanceLog({ pool, store }, openLog, employee);
  }

  if (normalizedAction === "CLOCK_OUT") {
    if (openLog.status === "ON_BREAK" && openLog.breakStart) {
      openLog.breakMinutes += Math.max(0, Math.round((nowMs - openLog.breakStart) / 60000));
      openLog.breakEnd = nowMs;
    }
    openLog.clockOut = nowMs;
    const grossMinutes = Math.max(0, Math.round((nowMs - openLog.clockIn) / 60000));
    openLog.workedMinutes = Math.max(0, grossMinutes - openLog.breakMinutes);
    openLog.nightMinutes = calculateNightMinutesLima(openLog.clockIn, nowMs);

    const ordinaryLimit = Math.max(openLog.scheduledMinutes || 480, 480);
    const totalOvertime = Math.max(0, openLog.workedMinutes - ordinaryLimit);
    openLog.overtime25Minutes = Math.min(120, totalOvertime);
    openLog.overtime35Minutes = Math.max(0, totalOvertime - 120);
    openLog.status = "COMPLETED";
    openLog.updatedAt = nowMs;
    return persistAttendanceLog({ pool, store }, openLog, employee);
  }

  throw new Error("Unsupported kiosk action.");
}

async function persistAttendanceLog({ pool, store }, log, employee) {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.attendance_logs (
        id, employee_id, branch_id, shift_id, work_date, clock_in, clock_out, break_start, break_end,
        break_minutes, scheduled_minutes, worked_minutes, night_minutes, late_minutes,
        overtime_25_minutes, overtime_35_minutes, overtime_approved, approved_by, status, source, notes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      ON CONFLICT (id) DO UPDATE SET
        clock_out=EXCLUDED.clock_out, break_start=EXCLUDED.break_start, break_end=EXCLUDED.break_end,
        break_minutes=EXCLUDED.break_minutes, worked_minutes=EXCLUDED.worked_minutes,
        night_minutes=EXCLUDED.night_minutes, overtime_25_minutes=EXCLUDED.overtime_25_minutes,
        overtime_35_minutes=EXCLUDED.overtime_35_minutes, overtime_approved=EXCLUDED.overtime_approved,
        approved_by=EXCLUDED.approved_by, status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at
      RETURNING *`,
      [
        log.id, log.employeeId, log.branchId, log.shiftId, log.workDate, log.clockIn, log.clockOut,
        log.breakStart, log.breakEnd, log.breakMinutes, log.scheduledMinutes, log.workedMinutes,
        log.nightMinutes, log.lateMinutes, log.overtime25Minutes, log.overtime35Minutes,
        log.overtimeApproved, log.approvedBy, log.status, log.source, log.notes, log.createdAt, log.updatedAt
      ]
    );
    return { log: mapAttendanceRow(res.rows[0]), employeeName: employee.fullName };
  }
  ensureLocalWorkforceState(store);
  const idx = store.attendanceLogs.findIndex((a) => a.id === log.id);
  if (idx >= 0) store.attendanceLogs[idx] = log;
  else store.attendanceLogs.unshift(log);
  return { log, employeeName: employee.fullName };
}

async function approveAttendanceOvertime({ pool, store }, { id, approved, approvedBy }) {
  const now = Date.now();
  if (pool) {
    const res = await pool.query(
      `UPDATE public.attendance_logs SET overtime_approved = $2, approved_by = $3, updated_at = $4 WHERE id = $1 RETURNING *`,
      [id, Boolean(approved), approvedBy || "Manager", now]
    );
    return res.rows[0] ? mapAttendanceRow(res.rows[0]) : null;
  }
  ensureLocalWorkforceState(store);
  const log = store.attendanceLogs.find((l) => l.id === id);
  if (!log) return null;
  log.overtimeApproved = Boolean(approved);
  log.approvedBy = approvedBy || "Manager";
  log.updatedAt = now;
  return log;
}

// ---------------- Leave Management ----------------
async function listLeaves({ pool, store }, { employeeId } = {}) {
  if (pool) {
    const res = employeeId
      ? await pool.query("SELECT * FROM public.leave_requests WHERE employee_id = $1 ORDER BY created_at DESC", [employeeId])
      : await pool.query("SELECT * FROM public.leave_requests ORDER BY created_at DESC");
    return res.rows.map(mapLeaveRow);
  }
  ensureLocalWorkforceState(store);
  let rows = [...store.leaveRequests];
  if (employeeId) rows = rows.filter((l) => l.employeeId === employeeId);
  return rows;
}

async function createLeaveRequest({ pool, store }, payload) {
  if (!payload?.employeeId || !payload?.leaveType || !payload?.startDate || !payload?.endDate) {
    throw new Error("employeeId, leaveType, startDate, and endDate are required.");
  }
  const s = new Date(payload.startDate);
  const e = new Date(payload.endDate);
  const computedDays = Number.isFinite(Number(payload.daysCount))
    ? Number(payload.daysCount)
    : Math.max(1, Math.round((e - s) / 86400000) + 1);
  const leaveType = String(payload.leaveType).toUpperCase();
  const leave = {
    id: makeId("lve"),
    employeeId: payload.employeeId,
    leaveType,
    startDate: String(payload.startDate).slice(0, 10),
    endDate: String(payload.endDate).slice(0, 10),
    daysCount: computedDays,
    paid: payload.paid !== undefined ? Boolean(payload.paid) : leaveType !== "UNPAID",
    reason: String(payload.reason || "").trim(),
    documentRef: String(payload.documentRef || "").trim(),
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: Date.now()
  };
  if (pool) {
    const res = await pool.query(
      `INSERT INTO public.leave_requests (
        id, employee_id, leave_type, start_date, end_date, days_count, paid, reason, document_ref, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [leave.id, leave.employeeId, leave.leaveType, leave.startDate, leave.endDate, leave.daysCount, leave.paid, leave.reason, leave.documentRef, leave.status, leave.createdAt]
    );
    return mapLeaveRow(res.rows[0]);
  }
  ensureLocalWorkforceState(store);
  store.leaveRequests.unshift(leave);
  return leave;
}

async function decideLeaveRequest({ pool, store }, { id, decision, reviewedBy }) {
  const status = decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const now = Date.now();
  if (pool) {
    const res = await pool.query(
      `UPDATE public.leave_requests SET status = $2, reviewed_by = $3, reviewed_at = $4 WHERE id = $1 RETURNING *`,
      [id, status, reviewedBy || "Manager", now]
    );
    return res.rows[0] ? mapLeaveRow(res.rows[0]) : null;
  }
  ensureLocalWorkforceState(store);
  const req = store.leaveRequests.find((l) => l.id === id);
  if (!req) return null;
  req.status = status;
  req.reviewedBy = reviewedBy || "Manager";
  req.reviewedAt = now;
  return req;
}

// ---------------- Payroll Calculation, Boletas & SUNAT Exports ----------------
async function listPayrollPeriods({ pool, store }) {
  if (pool) {
    const res = await pool.query("SELECT * FROM public.payroll_periods ORDER BY start_date DESC");
    return res.rows.map(mapPeriodRow);
  }
  ensureLocalWorkforceState(store);
  return [...store.payrollPeriods].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
}

async function listPayrollEntries({ pool, store }, { periodId, employeeId } = {}) {
  if (pool) {
    let res;
    if (periodId) {
      res = await pool.query("SELECT * FROM public.payroll_entries WHERE period_id = $1 ORDER BY created_at ASC", [periodId]);
    } else if (employeeId) {
      res = await pool.query("SELECT * FROM public.payroll_entries WHERE employee_id = $1 ORDER BY created_at DESC", [employeeId]);
    } else {
      res = await pool.query("SELECT * FROM public.payroll_entries ORDER BY created_at DESC");
    }
    return res.rows.map(mapPayrollEntryRow);
  }
  ensureLocalWorkforceState(store);
  let rows = [...store.payrollEntries];
  if (periodId) rows = rows.filter((e) => e.periodId === periodId);
  if (employeeId) rows = rows.filter((e) => e.employeeId === employeeId);
  return rows;
}

async function runPayrollForPeriod({ pool, store }, payload) {
  const now = Date.now();
  const periodType = String(payload?.periodType || "MONTHLY").toUpperCase();
  const startDate = String(payload?.startDate || `${toLimaDateStr().slice(0, 7)}-01`).slice(0, 10);
  const endDate = String(payload?.endDate || `${startDate.slice(0, 7)}-30`).slice(0, 10);
  const paymentDate = String(payload?.paymentDate || endDate).slice(0, 10);
  const periodCode = String(payload?.periodCode || `${startDate.slice(0, 7)}-${periodType}`).trim();

  const [branches, rules, employees, contracts, attendanceLogs, leaveRequests] = await Promise.all([
    listBranches({ pool, store }),
    listPeruLaborRules({ pool, store }),
    listEmployees({ pool, store }, { branchId: payload?.branchId || undefined }),
    listContracts({ pool, store }),
    listAttendance({ pool, store }, { startDate, endDate }),
    listLeaves({ pool, store })
  ]);

  const effectiveRule = selectEffectivePeruRule(rules, startDate);
  const activeEmployees = employees.filter((e) => e.status === "ACTIVE" || e.status === "ON_LEAVE");
  const periodId = payload?.periodId || makeId("payp");
  const period = {
    id: periodId,
    branchId: payload?.branchId || null,
    periodCode,
    periodType,
    startDate,
    endDate,
    paymentDate,
    status: "CALCULATED",
    totals: {},
    createdBy: payload?.createdBy || "Manager",
    approvedBy: null,
    createdAt: now,
    updatedAt: now
  };

  const entries = [];
  for (const emp of activeEmployees) {
    const empContracts = contracts.filter(
      (c) =>
        c.employeeId === emp.id &&
        c.effectiveFrom <= endDate &&
        (!c.effectiveTo || c.effectiveTo >= startDate)
    );
    const activeContract = empContracts[0];
    if (!activeContract) continue;

    const branch = branches.find((b) => b.id === (activeContract.branchId || emp.branchId)) || {};
    const empLogs = attendanceLogs.filter((l) => l.employeeId === emp.id && l.status === "COMPLETED");
    const approvedOt25Min = empLogs.filter((l) => l.overtimeApproved).reduce((s, l) => s + l.overtime25Minutes, 0);
    const approvedOt35Min = empLogs.filter((l) => l.overtimeApproved).reduce((s, l) => s + l.overtime35Minutes, 0);
    const unapprovedOtMin = empLogs.filter((l) => !l.overtimeApproved).reduce((s, l) => s + l.overtime25Minutes + l.overtime35Minutes, 0);
    const nightMin = empLogs.reduce((s, l) => s + l.nightMinutes, 0);
    const ordinaryHours = round2(empLogs.reduce((s, l) => s + Math.max(0, l.workedMinutes - l.overtime25Minutes - l.overtime35Minutes), 0) / 60);

    const empUnpaidLeaveDays = leaveRequests
      .filter((l) => l.employeeId === emp.id && l.status === "APPROVED" && !l.paid && l.startDate <= endDate && l.endDate >= startDate)
      .reduce((s, l) => s + Number(l.daysCount || 0), 0);

    const empAdjustments = (payload?.employeeAdjustments && payload.employeeAdjustments[emp.id]) || {};

    const calc = calculateEmployeePayroll({
      employee: emp,
      contract: activeContract,
      branch,
      period,
      attendance: {
        ordinaryHours,
        approvedOvertime25Hours: round2(approvedOt25Min / 60),
        approvedOvertime35Hours: round2(approvedOt35Min / 60),
        unapprovedOvertimeHours: round2(unapprovedOtMin / 60),
        nightHours: round2(nightMin / 60),
        absenceDays: Number(empAdjustments.absenceDays || 0)
      },
      leave: { unpaidDays: empUnpaidLeaveDays },
      rule: effectiveRule,
      adjustments: empAdjustments
    });

    entries.push({
      id: makeId("paye"),
      periodId,
      employeeId: emp.id,
      branchId: branch.id || emp.branchId || null,
      laborRegime: calc.laborRegime,
      grossPay: calc.grossPay,
      totalDeductions: calc.totalDeductions,
      netPay: calc.netPay,
      employerContributions: calc.employerContributions,
      ctsAccrual: calc.ctsAccrual,
      gratificacionAccrual: calc.gratificacionAccrual,
      vacationDaysAccrued: calc.vacationDaysAccrued,
      requiresAccountantReview: calc.requiresAccountantReview,
      boletaSnapshot: calc.boletaSnapshot,
      paymentMethod: emp.bankCci ? "BANK_TRANSFER" : "ACCOUNT_DEPOSIT",
      paymentDate,
      status: "CALCULATED",
      createdAt: now
    });
  }

  period.totals = {
    employeeCount: entries.length,
    grossPay: round2(entries.reduce((s, e) => s + e.grossPay, 0)),
    totalDeductions: round2(entries.reduce((s, e) => s + e.totalDeductions, 0)),
    netPay: round2(entries.reduce((s, e) => s + e.netPay, 0)),
    employerContributions: round2(entries.reduce((s, e) => s + e.employerContributions, 0)),
    ctsAccrual: round2(entries.reduce((s, e) => s + e.ctsAccrual, 0)),
    gratificacionAccrual: round2(entries.reduce((s, e) => s + e.gratificacionAccrual, 0)),
    reviewFlagCount: entries.filter((e) => e.requiresAccountantReview).length
  };

  if (pool) {
    const isDirectPool = typeof pool.connect !== "function";
    const client = isDirectPool ? pool : await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO public.payroll_periods (id, branch_id, period_code, period_type, start_date, end_date, payment_date, status, totals, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, totals=EXCLUDED.totals, updated_at=EXCLUDED.updated_at`,
        [period.id, period.branchId, period.periodCode, period.periodType, period.startDate, period.endDate, period.paymentDate, period.status, JSON.stringify(period.totals), period.createdBy, period.createdAt, period.updatedAt]
      );
      await client.query("DELETE FROM public.payroll_entries WHERE period_id = $1", [period.id]);
      for (const e of entries) {
        await client.query(
          `INSERT INTO public.payroll_entries (
            id, period_id, employee_id, branch_id, labor_regime, gross_pay, total_deductions, net_pay,
            employer_contributions, cts_accrual, gratificacion_accrual, vacation_days_accrued,
            requires_accountant_review, boleta_snapshot, payment_method, payment_date, status, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)`,
          [
            e.id, e.periodId, e.employeeId, e.branchId, e.laborRegime, e.grossPay, e.totalDeductions,
            e.netPay, e.employerContributions, e.ctsAccrual, e.gratificacionAccrual, e.vacationDaysAccrued,
            e.requiresAccountantReview, JSON.stringify(e.boletaSnapshot), e.paymentMethod, e.paymentDate, e.status, e.createdAt
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (!isDirectPool) client.release();
    }
  } else {
    ensureLocalWorkforceState(store);
    const idx = store.payrollPeriods.findIndex((p) => p.id === period.id);
    if (idx >= 0) store.payrollPeriods[idx] = period;
    else store.payrollPeriods.unshift(period);
    store.payrollEntries = store.payrollEntries.filter((e) => e.periodId !== period.id);
    store.payrollEntries.unshift(...entries);
  }

  return { period, entries, effectiveRule };
}

function buildPlameExport(entries, period, rule) {
  const version = rule?.plameVersion || "4.3";
  const lines = [
    `# OPENPOS_PLAME_EXPORT|VERSION=${version}|PERIOD=${period?.periodCode || ""}|INTERNAL_SYSTEM_RECORD_NOT_OFFICIAL_SUNAT`,
    "TipoDoc|NumDoc|CodigoConcepto|Concepto|Devengado|PagadoDescontado"
  ];
  for (const entry of entries) {
    const snap = entry.boletaSnapshot || {};
    const docTypeCode = snap.trabajador?.tipoDocumento === "CE" ? "04" : "01";
    const docNum = snap.trabajador?.numeroDocumento || "";
    for (const ing of snap.ingresos || []) {
      lines.push(`${docTypeCode}|${docNum}|${ing.code}|${ing.concept}|${Number(ing.amount).toFixed(2)}|${Number(ing.amount).toFixed(2)}`);
    }
    for (const desc of snap.descuentos || []) {
      lines.push(`${docTypeCode}|${docNum}|${desc.code}|${desc.concept}|0.00|${Number(desc.amount).toFixed(2)}`);
    }
    for (const ap of snap.aportesEmpleador || []) {
      lines.push(`${docTypeCode}|${docNum}|${ap.code}|${ap.concept}|${Number(ap.amount).toFixed(2)}|0.00`);
    }
  }
  return lines.join("\n") + "\n";
}

function buildTRegistroExport(employees, contracts, branches) {
  const lines = [
    "# OPENPOS_T_REGISTRO_EXPORT|INTERNAL_SYSTEM_RECORD_NOT_OFFICIAL_SUNAT",
    "TipoDoc|NumDoc|NombreCompleto|SedeRUC|FechaIngreso|RegimenLaboral|TipoContrato|SistemaPension|CUSPP|Estado"
  ];
  for (const emp of employees) {
    const contract = contracts.find((c) => c.employeeId === emp.id && c.status === "ACTIVE") || contracts.find((c) => c.employeeId === emp.id);
    const branch = branches.find((b) => b.id === (contract?.branchId || emp.branchId));
    const docTypeCode = emp.docType === "CE" ? "04" : "01";
    lines.push([
      docTypeCode,
      emp.docNumber || "",
      emp.fullName,
      branch?.ruc || "",
      emp.hireDate || contract?.effectiveFrom || "",
      contract?.laborRegime || "GENERAL",
      contract?.contractType || "INDEFINITE",
      emp.pensionSystem || "ONP",
      emp.afpCuspp || "",
      emp.status
    ].join("|"));
  }
  return lines.join("\n") + "\n";
}

async function buildWorkforceDashboard({ pool, store, receipts = [], forecast = {} }) {
  const [branches, rules, employees, contracts, shiftsData, swaps, attendance, leaves, periods, entries] = await Promise.all([
    listBranches({ pool, store }),
    listPeruLaborRules({ pool, store }),
    listEmployees({ pool, store }),
    listContracts({ pool, store }),
    listShifts({ pool, store }),
    listSwaps({ pool, store }),
    listAttendance({ pool, store }),
    listLeaves({ pool, store }),
    listPayrollPeriods({ pool, store }),
    listPayrollEntries({ pool, store })
  ]);

  const nowMs = Date.now();
  const thirtyDaysAgo = nowMs - 30 * 86400000;
  const sales30d = round2(
    (receipts || [])
      .filter((r) => !r.isRefund && Number(r.timestamp) >= thirtyDaysAgo)
      .reduce((s, r) => s + Number(r.grandTotal || 0), 0)
  );

  const workedHours30d = round2(
    attendance
      .filter((a) => Number(a.clockIn) >= thirtyDaysAgo && a.status === "COMPLETED")
      .reduce((s, a) => s + Number(a.workedMinutes || 0) / 60, 0)
  );

  const latestPeriod = periods[0] || null;
  const latestEntries = latestPeriod ? entries.filter((e) => e.periodId === latestPeriod.id) : [];
  const monthlyPayrollGross = round2(latestEntries.reduce((s, e) => s + e.grossPay, 0));
  const employerContrib = round2(latestEntries.reduce((s, e) => s + e.employerContributions, 0));
  const totalLaborCost = round2(monthlyPayrollGross + employerContrib);

  const laborCostPctOfSales = sales30d > 0 ? round2((totalLaborCost / sales30d) * 100) : 0;
  const salesPerLaborHour = workedHours30d > 0 ? round2(sales30d / workedHours30d) : 0;

  // Labor cost by branch and department
  const byBranchMap = new Map();
  const byDeptMap = new Map();
  for (const e of latestEntries) {
    const bName = branches.find((b) => b.id === e.branchId)?.name || "Sede Principal";
    const emp = employees.find((x) => x.id === e.employeeId);
    const dept = emp?.department || "Operations";
    byBranchMap.set(bName, round2((byBranchMap.get(bName) || 0) + e.grossPay + e.employerContributions));
    byDeptMap.set(dept, round2((byDeptMap.get(dept) || 0) + e.grossPay + e.employerContributions));
  }

  // Upcoming Peru statutory payment deadlines relative to current Lima year
  const limaToday = toLimaDateStr(nowMs);
  const year = Number(limaToday.slice(0, 4));
  const candidates = [
    { type: "CTS_MAY", label: "Depósito CTS Mayo", dueDate: `${year}-05-15`, legalRef: "D.S. 001-97-TR" },
    { type: "GRATIFICACION_JUL", label: "Gratificación Fiestas Patrias", dueDate: `${year}-07-15`, legalRef: "Ley 27735" },
    { type: "CTS_NOV", label: "Depósito CTS Noviembre", dueDate: `${year}-11-15`, legalRef: "D.S. 001-97-TR" },
    { type: "GRATIFICACION_DIC", label: "Gratificación Navidad", dueDate: `${year}-12-15`, legalRef: "Ley 27735" }
  ];
  const monthEnd = `${limaToday.slice(0, 7)}-30`;
  const upcomingDeadlines = [
    { type: "MONTHLY_SALARY", label: "Pago Planilla Mensual", dueDate: monthEnd, legalRef: "D.L. 728" },
    ...candidates.filter((c) => c.dueDate >= limaToday)
  ].slice(0, 4);

  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");
  const pendingSwaps = swaps.filter((s) => s.status === "PENDING");
  const pendingOvertime = attendance.filter((a) => !a.overtimeApproved && (a.overtime25Minutes + a.overtime35Minutes) > 0);
  const reviewContracts = contracts.filter((c) => c.requiresAccountantReview);
  const reviewPayrollEntries = latestEntries.filter((e) => e.requiresAccountantReview);
  const missingDocsEmployees = employees.filter((e) => Array.isArray(e.missingDocs) && e.missingDocs.length > 0);

  // Understaffing / overstaffing alerts comparing today's shifts vs forecast
  const todayShifts = shiftsData.shifts.filter((s) => s.shiftDate === limaToday);
  const staffingAlerts = [];
  for (const slot of forecast?.hourlyForecast || []) {
    const slotMin = timeToMinutes(slot.hour);
    const scheduledCount = todayShifts.filter((s) => {
      const sStart = timeToMinutes(s.startTime);
      let sEnd = timeToMinutes(s.endTime);
      if (sEnd <= sStart) sEnd += 24 * 60;
      return sStart <= slotMin && slotMin < sEnd;
    }).length;
    const rec = slot.recommendedStaff?.total || 0;
    if (rec > 0 && scheduledCount < rec) {
      staffingAlerts.push({ hour: slot.hour, status: "UNDERSTAFFED", scheduled: scheduledCount, recommended: rec });
    } else if (scheduledCount > rec + 2 && rec > 0) {
      staffingAlerts.push({ hour: slot.hour, status: "OVERSTAFFED", scheduled: scheduledCount, recommended: rec });
    }
  }

  return {
    currency: "PEN",
    currencySymbol: "S/",
    timezone: "America/Lima",
    activeRule: selectEffectivePeruRule(rules, limaToday),
    kpis: {
      activeEmployees: employees.filter((e) => e.status === "ACTIVE").length,
      branchesCount: branches.length,
      monthlyPayrollGross,
      employerContributions: employerContrib,
      totalLaborCost,
      sales30Days: sales30d,
      workedHours30Days: workedHours30d,
      salesPerLaborHour,
      laborCostPctOfSales
    },
    laborCostByBranch: Array.from(byBranchMap.entries()).map(([branch, totalCost]) => ({ branch, totalCost })),
    laborCostByDepartment: Array.from(byDeptMap.entries()).map(([department, totalCost]) => ({ department, totalCost })),
    upcomingDeadlines,
    pendingApprovals: {
      leaves: pendingLeaves.length,
      swaps: pendingSwaps.length,
      overtimeLogs: pendingOvertime.length,
      accountantReviewFlags: reviewContracts.length + reviewPayrollEntries.length
    },
    missingDocsEmployees: missingDocsEmployees.map((e) => ({ id: e.id, fullName: e.fullName, missingDocs: e.missingDocs })),
    overlapConflicts: shiftsData.overlapConflicts,
    staffingAlerts
  };
}

async function getSelfServiceProfile({ pool, store }, authUser) {
  const email = String(authUser?.email || "").trim().toLowerCase();
  const uid = authUser?.id || null;
  const employees = await listEmployees({ pool, store });
  const employee = employees.find((e) => (uid && e.authUserId === uid) || (email && e.email === email)) || null;
  if (!employee) return null;

  const [shiftsData, attendance, leaves, entries] = await Promise.all([
    listShifts({ pool, store }, { publishedOnly: true }),
    listAttendance({ pool, store }, { employeeId: employee.id }),
    listLeaves({ pool, store }, { employeeId: employee.id }),
    listPayrollEntries({ pool, store }, { employeeId: employee.id })
  ]);

  return {
    employee,
    shifts: shiftsData.shifts.filter((s) => s.employeeId === employee.id),
    attendance,
    leaves,
    boletas: entries.map((e) => ({
      id: e.id,
      periodId: e.periodId,
      laborRegime: e.laborRegime,
      grossPay: e.grossPay,
      totalDeductions: e.totalDeductions,
      netPay: e.netPay,
      paymentDate: e.paymentDate,
      boletaSnapshot: e.boletaSnapshot
    }))
  };
}

module.exports = {
  ensureLocalWorkforceState,
  detectShiftConflicts,
  listBranches,
  saveBranch,
  listPeruLaborRules,
  savePeruLaborRule,
  listEmployees,
  saveEmployee,
  listContracts,
  saveContract,
  listShifts,
  saveShift,
  publishShifts,
  listSwaps,
  createSwapRequest,
  decideSwapRequest,
  listAttendance,
  authenticateEmployeeByPin,
  recordPinClockAction,
  approveAttendanceOvertime,
  listLeaves,
  createLeaveRequest,
  decideLeaveRequest,
  listPayrollPeriods,
  listPayrollEntries,
  runPayrollForPeriod,
  buildPlameExport,
  buildTRegistroExport,
  buildWorkforceDashboard,
  getSelfServiceProfile
};

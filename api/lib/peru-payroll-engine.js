// Peru-Compliant Labor & Payroll Engine (America/Lima, PEN S/)
// Every calculation tracks its legal source, effective date, and accountant review flags.

const PERU_TIMEZONE = "America/Lima";
const LIMA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000; // Peru does not observe DST (UTC-5 year-round)

const DEFAULT_PERU_RULE = {
  id: "peru_rule_2025_baseline",
  effectiveFrom: "2025-01-01",
  effectiveTo: null,
  legalSource:
    "D.S. 006-2024-TR (RMV S/ 1,130); D.L. 728; D.S. 007-2002-TR (Jornada/Sobretiempo/Nocturno); D.L. 713 (Vacaciones/Descansos); D.S. 001-97-TR (CTS); Ley 27735 & Ley 30334 (Gratificaciones); D.S. 013-2013-PRODUCE (REMYPE)",
  rmv: 1130.0,
  uit: 5350.0,
  dailyHours: 8,
  weeklyHours: 48,
  overtimeFirst2hPct: 25,
  overtimeAfter2hPct: 35,
  nightStart: "22:00",
  nightEnd: "06:00",
  nightSurchargePct: 35,
  essaludPct: 9,
  epsCreditPct: 6.75,
  onpPct: 13,
  afpObligatorioPct: 10,
  plameVersion: "4.3",
  tipsTreatment: "NON_COMPUTABLE_GRATUITY",
  notes: "Statutory baseline effective Nov 2026; verify RMV/UIT decrees before closing each fiscal year."
};

// CIIU codes commonly excluded from REMYPE under D.S. 013-2013-PRODUCE Art. 3 (bars, nightclubs, casinos)
const EXCLUDED_REMYPE_CIIU_PREFIXES = ["5630", "9200"];

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

function selectEffectivePeruRule(rules, targetDateStr) {
  const list = Array.isArray(rules) && rules.length ? rules : [DEFAULT_PERU_RULE];
  const target = String(targetDateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const matching = list
    .filter((r) => {
      const from = String(r.effectiveFrom || "1900-01-01").slice(0, 10);
      const to = r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : "9999-12-31";
      return from <= target && target <= to;
    })
    .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
  return matching[0] ? { ...DEFAULT_PERU_RULE, ...matching[0] } : { ...DEFAULT_PERU_RULE };
}

/**
 * Resolves effective Peruvian labor regime without ever assuming REMYPE eligibility.
 */
function resolveEffectiveLaborRegime({ contract = {}, branch = {} } = {}) {
  const requestedRegime = String(contract.laborRegime || contract.requestedRegime || branch.laborRegime || "GENERAL").toUpperCase();
  const reviewReasons = [];

  if (requestedRegime === "GENERAL") {
    return {
      effectiveRegime: "GENERAL",
      requestedRegime,
      requiresAccountantReview: false,
      reviewReasons: [],
      annualVacationDays: 30,
      ctsFactor: 1,
      gratificacionFactor: 1,
      familyAllowanceEligible: true
    };
  }

  if (requestedRegime !== "REMYPE_MICRO" && requestedRegime !== "REMYPE_SMALL") {
    reviewReasons.push(`Régimen desconocido "${requestedRegime}". Se aplica Régimen General (D.L. 728) para revisión contable.`);
    return {
      effectiveRegime: "GENERAL",
      requestedRegime,
      requiresAccountantReview: true,
      reviewReasons,
      annualVacationDays: 30,
      ctsFactor: 1,
      gratificacionFactor: 1,
      familyAllowanceEligible: true
    };
  }

  const ciiu = String(branch.ciiuCode || "").trim();
  const activityExcluded =
    Boolean(branch.remypeActivityExcluded) ||
    EXCLUDED_REMYPE_CIIU_PREFIXES.some((prefix) => ciiu.startsWith(prefix));

  if (activityExcluded) {
    reviewReasons.push(
      `Actividad económica excluida de REMYPE (D.S. 013-2013-PRODUCE Art. 3: bares/discotecas/juegos, CIIU ${ciiu || "marcado"}). Se aplica Régimen General provisional.`
    );
  }

  if (!branch.remypeRegistered || !branch.remypeRegDate || !contract.remypeVerified) {
    reviewReasons.push(
      "Acreditación REMYPE no verificada (falta constancia, número o fecha de inscripción en MTPE). Se aplica Régimen General provisional hasta validación contable."
    );
  }

  const hireOrEffective = String(contract.effectiveFrom || "").slice(0, 10);
  const remypeDate = String(branch.remypeRegDate || "").slice(0, 10);
  if (branch.remypeRegistered && remypeDate && hireOrEffective && hireOrEffective < remypeDate) {
    reviewReasons.push(
      `Contrato vigente desde ${hireOrEffective} es anterior a la inscripción REMYPE (${remypeDate}). Según normativa REMYPE, mantiene Régimen General (D.L. 728).`
    );
  }

  if (reviewReasons.length > 0) {
    return {
      effectiveRegime: "GENERAL",
      requestedRegime,
      requiresAccountantReview: true,
      reviewReasons,
      annualVacationDays: 30,
      ctsFactor: 1,
      gratificacionFactor: 1,
      familyAllowanceEligible: true
    };
  }

  if (requestedRegime === "REMYPE_MICRO") {
    return {
      effectiveRegime: "REMYPE_MICRO",
      requestedRegime,
      requiresAccountantReview: false,
      reviewReasons: [],
      annualVacationDays: 15,
      ctsFactor: 0,
      gratificacionFactor: 0,
      familyAllowanceEligible: false
    };
  }

  // REMYPE_SMALL
  return {
    effectiveRegime: "REMYPE_SMALL",
    requestedRegime,
    requiresAccountantReview: false,
    reviewReasons: [],
    annualVacationDays: 15,
    ctsFactor: 0.5,
    gratificacionFactor: 0.5,
    familyAllowanceEligible: true
  };
}

/**
 * Exact minutes worked within the Peruvian statutory night window (22:00 - 06:00 America/Lima, UTC-5).
 */
function calculateNightMinutesLima(clockInMs, clockOutMs) {
  const start = Number(clockInMs);
  const end = Number(clockOutMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  // Step minute-by-minute cleanly up to 48 hours max per log to stay exact & predictable
  const maxEnd = Math.min(end, start + 48 * 60 * 60 * 1000);
  let cursor = Math.floor(start / 60000) * 60000;
  let nightMins = 0;

  while (cursor < maxEnd) {
    const limaMs = cursor + LIMA_UTC_OFFSET_MS;
    const minuteOfDay = Math.floor((limaMs % 86400000 + 86400000) % 86400000 / 60000);
    if (minuteOfDay >= 22 * 60 || minuteOfDay < 6 * 60) {
      nightMins += 1;
    }
    cursor += 60000;
  }
  return nightMins;
}

/**
 * Annualized 5th Category Income Tax withholding per Peruvian LIR Art. 40.
 */
function calculateFifthCategoryMonthlyIR({
  monthlyComputable,
  monthNumber = 1,
  uit = DEFAULT_PERU_RULE.uit,
  gratificacionFactor = 1,
  priorAnnualTaxableIncome = 0,
  priorIrWithheld = 0
}) {
  const m = Math.min(12, Math.max(1, Number(monthNumber) || 1));
  const remainingMonths = 12 - m + 1;
  const upcomingGrats = (m <= 7 ? 1 : 0) + (m <= 12 ? 1 : 0);
  const projectedAnnualGross =
    Number(priorAnnualTaxableIncome || 0) +
    Number(monthlyComputable || 0) * remainingMonths +
    Number(monthlyComputable || 0) * gratificacionFactor * upcomingGrats;

  const netTaxable = Math.max(0, projectedAnnualGross - 7 * Number(uit));
  if (netTaxable <= 0) return 0;

  const brackets = [
    { limit: 5 * uit, rate: 0.08 },
    { limit: 20 * uit, rate: 0.14 },
    { limit: 35 * uit, rate: 0.17 },
    { limit: 45 * uit, rate: 0.20 },
    { limit: Infinity, rate: 0.30 }
  ];

  let remaining = netTaxable;
  let prevLimit = 0;
  let annualTax = 0;
  for (const b of brackets) {
    const span = Math.max(0, Math.min(remaining, b.limit - prevLimit));
    annualTax += span * b.rate;
    remaining -= span;
    prevLimit = b.limit;
    if (remaining <= 0) break;
  }

  let divisor = 12;
  if (m >= 4 && m <= 4) divisor = 9;
  else if (m >= 5 && m <= 7) divisor = 8;
  else if (m === 8) divisor = 5;
  else if (m >= 9 && m <= 11) divisor = 4;
  else if (m === 12) divisor = 1;
  else divisor = 12;

  const monthlyTax = Math.max(0, (annualTax - Number(priorIrWithheld || 0)) / divisor);
  return round2(monthlyTax);
}

/**
 * Computes Peruvian monthly, gratification, or CTS payroll + printable Spanish boleta snapshot.
 */
function calculateEmployeePayroll({
  employee = {},
  contract = {},
  branch = {},
  period = {},
  attendance = {},
  leave = {},
  rule = DEFAULT_PERU_RULE,
  adjustments = {}
} = {}) {
  const effectiveRule = { ...DEFAULT_PERU_RULE, ...rule };
  const regimeInfo = resolveEffectiveLaborRegime({ contract, branch });
  const reviewReasons = [...regimeInfo.reviewReasons];
  const legalReferences = [
    `RMV S/ ${Number(effectiveRule.rmv).toFixed(2)} (${effectiveRule.legalSource.split(";")[0].trim()})`,
    `Régimen ${regimeInfo.effectiveRegime}`
  ];

  const periodType = String(period.periodType || "MONTHLY").toUpperCase();
  const dailyHours = Number(effectiveRule.dailyHours || 8);
  const weeklyHours = Number(contract.weeklyHours || effectiveRule.weeklyHours || 48);
  const isPartTime = weeklyHours < 24 || String(contract.contractType).toUpperCase() === "PART_TIME";

  const baseMonthly =
    contract.wageType === "HOURLY"
      ? round2(Number(contract.hourlyRate || 0) * dailyHours * 30)
      : round2(Number(contract.baseSalary || 0));

  const hourlyRate =
    contract.wageType === "HOURLY"
      ? round4(Number(contract.hourlyRate || 0))
      : round4(baseMonthly / 30 / dailyHours);

  // Check RMV minimum compliance for full-time (or proportional floor)
  const expectedMinMonthly = isPartTime
    ? round2((effectiveRule.rmv * weeklyHours) / 48)
    : effectiveRule.rmv;
  if (baseMonthly > 0 && baseMonthly < expectedMinMonthly) {
    reviewReasons.push(
      `Remuneración básica S/ ${baseMonthly.toFixed(2)} inferior al mínimo proporcional RMV S/ ${expectedMinMonthly.toFixed(2)}.`
    );
  }

  const extraBonusPct = employee.hasEps
    ? Number(effectiveRule.epsCreditPct || 6.75) / 100
    : Number(effectiveRule.essaludPct || 9) / 100;

  const hasFamAllowance = Boolean(employee.hasFamilyAllowance) && regimeInfo.familyAllowanceEligible;
  const familyAllowanceMonthly = hasFamAllowance ? round2(effectiveRule.rmv * 0.1) : 0;

  // Special periodic runs: GRATIFICACION_JUL / GRATIFICACION_DIC / CTS_MAY / CTS_NOV
  if (periodType === "GRATIFICACION_JUL" || periodType === "GRATIFICACION_DIC") {
    const eligibleMonths = Math.min(6, Math.max(0, Number(adjustments.eligibleMonths ?? 6)));
    const computableBase = round2(baseMonthly + familyAllowanceMonthly);
    const gratAmount = round2(computableBase * (eligibleMonths / 6) * regimeInfo.gratificacionFactor);
    const bonifExtra = round2(gratAmount * extraBonusPct);
    const grossPay = round2(gratAmount + bonifExtra);
    const netPay = grossPay; // Gratificaciones in Peru are exempt from EsSalud/AFP/ONP (Ley 30334), subject only to IR 5ta if projected

    legalReferences.push("Ley 27735 (Gratificaciones Fiestas Patrias/Navidad)", "Ley 30334 (Inafectación y Bonificación Extraordinaria)");

    return buildPayrollOutput({
      employee,
      branch,
      period,
      periodType,
      regimeInfo,
      effectiveRule,
      reviewReasons,
      legalReferences,
      ingresos: [
        { code: "0406", concept: periodType === "GRATIFICACION_JUL" ? "Gratificación Fiestas Patrias (Julio)" : "Gratificación Navidad (Diciembre)", amount: gratAmount },
        { code: "0312", concept: `Bonificación Extraordinaria Ley 30334 (${(extraBonusPct * 100).toFixed(2)}%)`, amount: bonifExtra }
      ],
      descuentos: [],
      aportesEmpleador: [],
      daysWorked: eligibleMonths * 30,
      workedHours: 0,
      overtime25Hours: 0,
      overtime35Hours: 0,
      nightHours: 0,
      ctsAccrual: 0,
      gratificacionAccrual: gratAmount,
      vacationDaysAccrued: 0,
      grossPay,
      totalDeductions: 0,
      netPay,
      employerContributions: 0
    });
  }

  if (periodType === "CTS_MAY" || periodType === "CTS_NOV") {
    const eligibleMonths = Math.min(6, Math.max(0, Number(adjustments.eligibleMonths ?? 6)));
    const computableBase = round2(baseMonthly + familyAllowanceMonthly + (baseMonthly + familyAllowanceMonthly) / 6);
    const ctsDeposit = round2(computableBase * (eligibleMonths / 12) * regimeInfo.ctsFactor);

    legalReferences.push("D.S. 001-97-TR (TUO Ley de CTS)");

    return buildPayrollOutput({
      employee,
      branch,
      period,
      periodType,
      regimeInfo,
      effectiveRule,
      reviewReasons,
      legalReferences,
      ingresos: [
        { code: "0904", concept: periodType === "CTS_MAY" ? "Depósito CTS Semestral (Mayo)" : "Depósito CTS Semestral (Noviembre)", amount: ctsDeposit }
      ],
      descuentos: [],
      aportesEmpleador: [],
      daysWorked: eligibleMonths * 30,
      workedHours: 0,
      overtime25Hours: 0,
      overtime35Hours: 0,
      nightHours: 0,
      ctsAccrual: ctsDeposit,
      gratificacionAccrual: 0,
      vacationDaysAccrued: 0,
      grossPay: ctsDeposit,
      totalDeductions: 0,
      netPay: ctsDeposit,
      employerContributions: 0
    });
  }

  // Standard MONTHLY Payroll
  const unpaidLeaveDays = Math.min(30, Math.max(0, Number(leave.unpaidDays || 0)));
  const absenceDays = Math.min(30, Math.max(0, Number(attendance.absenceDays || 0)));
  const paidDays = Math.max(0, Math.min(30, Number(adjustments.paidDays ?? (30 - unpaidLeaveDays - absenceDays))));

  const ordinaryBasicPay =
    contract.wageType === "HOURLY"
      ? round2(Number(attendance.ordinaryHours || 0) * hourlyRate)
      : round2(baseMonthly * (paidDays / 30));

  const familyAllowancePay = hasFamAllowance && paidDays > 0 ? familyAllowanceMonthly : 0;

  // Overtime (only approved overtime paid; unapproved triggers warning)
  const ot25Hours = Math.max(0, Number(attendance.approvedOvertime25Hours || 0));
  const ot35Hours = Math.max(0, Number(attendance.approvedOvertime35Hours || 0));
  const unapprovedOtHours = Math.max(0, Number(attendance.unapprovedOvertimeHours || 0));
  if (unapprovedOtHours > 0) {
    reviewReasons.push(`${unapprovedOtHours.toFixed(2)} horas extra registradas pendientes de aprobación de gerencia.`);
  }

  const ot25Pay = round2(ot25Hours * hourlyRate * (1 + Number(effectiveRule.overtimeFirst2hPct || 25) / 100));
  const ot35Pay = round2(ot35Hours * hourlyRate * (1 + Number(effectiveRule.overtimeAfter2hPct || 35) / 100));

  // Night Surcharge (22:00 - 06:00 minimum RMV + 35%)
  const nightHours = Math.max(0, Number(attendance.nightHours || 0));
  const minNightMonthly = round2(effectiveRule.rmv * (1 + Number(effectiveRule.nightSurchargePct || 35) / 100));
  const minNightHourly = round4(minNightMonthly / 30 / dailyHours);
  const nightTopUpPerHour = Math.max(0, minNightHourly - hourlyRate);
  const nightSurchargePay = round2(nightHours * nightTopUpPerHour);

  // Holiday / Sunday work without compensatory rest (100% surcharge per D.L. 713)
  const holidayHours = Math.max(0, Number(attendance.holidayHours || 0));
  const holidayPay = round2(holidayHours * hourlyRate * 1.0);

  // Tips / Service charge handling (never automatically computable unless configured)
  const tipsAmount = Math.max(0, Number(adjustments.tipsAmount || 0));
  const tipsComputable = effectiveRule.tipsTreatment === "COMPUTABLE_SURCHARGE";

  const computableGross = round2(
    ordinaryBasicPay +
      familyAllowancePay +
      ot25Pay +
      ot35Pay +
      nightSurchargePay +
      holidayPay +
      (tipsComputable ? tipsAmount : 0)
  );
  const nonComputableTips = !tipsComputable ? round2(tipsAmount) : 0;
  const grossPay = round2(computableGross + nonComputableTips);

  // Deductions: Pension (ONP 13% vs AFP 10% + insurance + commission) + 5th Category IR
  const pensionSystem = String(employee.pensionSystem || "ONP").toUpperCase();
  const descuentos = [];
  if (pensionSystem === "ONP") {
    const onpAmount = round2(computableGross * (Number(effectiveRule.onpPct || 13) / 100));
    descuentos.push({ code: "0607", concept: `ONP Sistema Nacional de Pensiones (${effectiveRule.onpPct}%)`, amount: onpAmount });
  } else if (pensionSystem.startsWith("AFP")) {
    const afpOblig = round2(computableGross * (Number(effectiveRule.afpObligatorioPct || 10) / 100));
    const afpIns = round2(computableGross * (Number(employee.afpInsurancePct ?? 1.7) / 100));
    const afpComm = round2(computableGross * (Number(employee.afpCommissionPct ?? 0) / 100));
    descuentos.push({ code: "0608", concept: `${pensionSystem} - Aporte Obligatorio (${effectiveRule.afpObligatorioPct}%)`, amount: afpOblig });
    if (afpIns > 0) descuentos.push({ code: "0606", concept: `${pensionSystem} - Prima de Seguro`, amount: afpIns });
    if (afpComm > 0) descuentos.push({ code: "0601", concept: `${pensionSystem} - Comisión sobre Remuneración`, amount: afpComm });
  }

  const periodMonth = period.startDate ? Number(String(period.startDate).slice(5, 7)) : new Date().getMonth() + 1;
  const ir5ta = calculateFifthCategoryMonthlyIR({
    monthlyComputable: computableGross,
    monthNumber: periodMonth,
    uit: effectiveRule.uit,
    gratificacionFactor: regimeInfo.gratificacionFactor,
    priorAnnualTaxableIncome: adjustments.priorAnnualTaxableIncome || 0,
    priorIrWithheld: adjustments.priorIrWithheld || 0
  });
  if (ir5ta > 0) {
    descuentos.push({ code: "0605", concept: "Impuesto a la Renta 5ta Categoría", amount: ir5ta });
  }

  const totalDeductions = round2(descuentos.reduce((s, d) => s + d.amount, 0));
  const netPay = round2(Math.max(0, grossPay - totalDeductions));

  // Employer Contributions: EsSalud 9% (min RMV base if full-time) or EPS 6.75% / 2.25%; REMYPE_MICRO uses SIS
  const aportesEmpleador = [];
  if (regimeInfo.effectiveRegime === "REMYPE_MICRO") {
    legalReferences.push("REMYPE Microempresa: Seguro Integral de Salud (SIS) en lugar de EsSalud 9%");
  } else {
    const contribBase = isPartTime ? computableGross : Math.max(computableGross, paidDays > 0 ? effectiveRule.rmv : 0);
    if (employee.hasEps) {
      const essaludPart = round2(contribBase * (Number(effectiveRule.epsCreditPct || 6.75) / 100));
      const epsPart = round2(contribBase * 0.0225);
      aportesEmpleador.push({ code: "0804", concept: "EsSalud Seguro Regular (con crédito EPS 6.75%)", amount: essaludPart });
      aportesEmpleador.push({ code: "0805", concept: "Aporte EPS (2.25%)", amount: epsPart });
    } else {
      const essalud = round2(contribBase * (Number(effectiveRule.essaludPct || 9) / 100));
      aportesEmpleador.push({ code: "0804", concept: `EsSalud (${effectiveRule.essaludPct}%)`, amount: essalud });
    }
  }
  const employerContributions = round2(aportesEmpleador.reduce((s, a) => s + a.amount, 0));

  // Monthly statutory provisions (CTS, Gratificación, Vacation days)
  const monthlyBenefitBase = computableGross;
  const ctsAccrual = round2(((monthlyBenefitBase + monthlyBenefitBase / 6) / 12) * regimeInfo.ctsFactor);
  const gratificacionAccrual = round2((monthlyBenefitBase / 6) * (1 + extraBonusPct) * regimeInfo.gratificacionFactor);
  const vacationDaysAccrued = round2((regimeInfo.annualVacationDays / 12) * (paidDays / 30));

  const ingresos = [{ code: "0121", concept: "Remuneración Básica", amount: ordinaryBasicPay }];
  if (familyAllowancePay > 0) ingresos.push({ code: "0201", concept: "Asignación Familiar (Ley 25129)", amount: familyAllowancePay });
  if (ot25Pay > 0) ingresos.push({ code: "0105", concept: `Horas Extras 25% (${ot25Hours.toFixed(2)}h)`, amount: ot25Pay });
  if (ot35Pay > 0) ingresos.push({ code: "0106", concept: `Horas Extras 35% (${ot35Hours.toFixed(2)}h)`, amount: ot35Pay });
  if (nightSurchargePay > 0) ingresos.push({ code: "0114", concept: `Bonificación Trabajo Nocturno 22:00-06:00 (${nightHours.toFixed(2)}h)`, amount: nightSurchargePay });
  if (holidayPay > 0) ingresos.push({ code: "0107", concept: `Sobretasa Descanso / Feriado 100% (${holidayHours.toFixed(2)}h)`, amount: holidayPay });
  if (tipsAmount > 0) {
    ingresos.push({
      code: tipsComputable ? "0118" : "0999",
      concept: tipsComputable ? "Recargo al Consumo / Propinas Computables" : "Propinas (No Computables)",
      amount: round2(tipsAmount)
    });
  }

  legalReferences.push("D.S. 007-2002-TR (Horas Extras 25%/35% y Jornada Nocturna 35% sobre RMV)");

  return buildPayrollOutput({
    employee,
    branch,
    period,
    periodType,
    regimeInfo,
    effectiveRule,
    reviewReasons,
    legalReferences,
    ingresos,
    descuentos,
    aportesEmpleador,
    daysWorked: paidDays,
    workedHours: Number(attendance.ordinaryHours || paidDays * dailyHours),
    overtime25Hours: ot25Hours,
    overtime35Hours: ot35Hours,
    nightHours,
    ctsAccrual,
    gratificacionAccrual,
    vacationDaysAccrued,
    grossPay,
    totalDeductions,
    netPay,
    employerContributions
  });
}

function buildPayrollOutput({
  employee,
  branch,
  period,
  periodType,
  regimeInfo,
  effectiveRule,
  reviewReasons,
  legalReferences,
  ingresos,
  descuentos,
  aportesEmpleador,
  daysWorked,
  workedHours,
  overtime25Hours,
  overtime35Hours,
  nightHours,
  ctsAccrual,
  gratificacionAccrual,
  vacationDaysAccrued,
  grossPay,
  totalDeductions,
  netPay,
  employerContributions
}) {
  const boletaSnapshot = {
    titulo: "BOLETA DE PAGO DE REMUNERACIONES",
    moneda: "PEN",
    simboloMoneda: "S/",
    pais: "Perú",
    zonaHoraria: PERU_TIMEZONE,
    empleador: {
      razonSocial: branch.name || "OpenPOS Perú",
      ruc: branch.ruc || "",
      direccion: branch.address || "",
      sucursal: branch.name || "Sede Principal",
      regimenLaboral: regimeInfo.effectiveRegime
    },
    trabajador: {
      id: employee.id || "",
      nombreCompleto: employee.fullName || "",
      tipoDocumento: employee.docType || "DNI",
      numeroDocumento: employee.docNumber || "",
      cargo: employee.position || "",
      departamento: employee.department || "",
      fechaIngreso: employee.hireDate || "",
      sistemaPension: employee.pensionSystem || "ONP",
      cuspp: employee.afpCuspp || ""
    },
    periodo: {
      codigo: period.periodCode || "",
      tipo: periodType,
      fechaInicio: period.startDate || "",
      fechaFin: period.endDate || "",
      fechaPago: period.paymentDate || "",
      metodoPago: employee.bankCci ? `Transferencia Bancaria (${employee.bankName || "Banco"})` : "Depósito / Cuenta Haberes",
      diasLaborados: daysWorked,
      horasOrdinarias: round2(workedHours),
      horasExtras25: round2(overtime25Hours),
      horasExtras35: round2(overtime35Hours),
      horasNocturnas: round2(nightHours)
    },
    ingresos,
    descuentos,
    aportesEmpleador,
    resumen: {
      totalIngresos: grossPay,
      totalDescuentos: totalDeductions,
      netoPagar: netPay,
      totalAportesEmpleador: employerContributions,
      provisionCtsMensual: ctsAccrual,
      provisionGratificacionMensual: gratificacionAccrual,
      diasVacacionesDevengados: vacationDaysAccrued
    },
    reglasLegales: {
      rmvVigente: effectiveRule.rmv,
      uitVigente: effectiveRule.uit,
      plameVersion: effectiveRule.plameVersion,
      fuenteLegal: effectiveRule.legalSource,
      referencias: legalReferences
    },
    requiereRevisionContable: reviewReasons.length > 0,
    observacionesContables: reviewReasons,
    avisoLegal: "Registro interno del sistema — no constituye presentación oficial ante SUNAT"
  };

  return {
    laborRegime: regimeInfo.effectiveRegime,
    requestedRegime: regimeInfo.requestedRegime,
    grossPay,
    totalDeductions,
    netPay,
    employerContributions,
    ctsAccrual,
    gratificacionAccrual,
    vacationDaysAccrued,
    requiresAccountantReview: reviewReasons.length > 0,
    reviewReasons,
    legalReferences,
    boletaSnapshot
  };
}

module.exports = {
  PERU_TIMEZONE,
  DEFAULT_PERU_RULE,
  selectEffectivePeruRule,
  resolveEffectiveLaborRegime,
  calculateNightMinutesLima,
  calculateFifthCategoryMonthlyIR,
  calculateEmployeePayroll,
  round2
};

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PERU_RULE,
  selectEffectivePeruRule,
  resolveEffectiveLaborRegime,
  calculateNightMinutesLima,
  calculateFifthCategoryMonthlyIR,
  calculateEmployeePayroll
} = require("../api/lib/peru-payroll-engine");

test("selectEffectivePeruRule picks latest rule valid for target date", () => {
  const rules = [
    { ...DEFAULT_PERU_RULE, id: "r2024", effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31", rmv: 1025 },
    { ...DEFAULT_PERU_RULE, id: "r2025", effectiveFrom: "2025-01-01", effectiveTo: null, rmv: 1130 }
  ];
  assert.equal(selectEffectivePeruRule(rules, "2024-06-15").rmv, 1025);
  assert.equal(selectEffectivePeruRule(rules, "2026-11-15").rmv, 1130);
});

test("resolveEffectiveLaborRegime never assumes REMYPE and enforces CIIU/date guardrails", () => {
  const unverified = resolveEffectiveLaborRegime({
    contract: { laborRegime: "REMYPE_MICRO", remypeVerified: false, effectiveFrom: "2026-01-01" },
    branch: { remypeRegistered: false }
  });
  assert.equal(unverified.effectiveRegime, "GENERAL");
  assert.equal(unverified.requiresAccountantReview, true);

  const barExcluded = resolveEffectiveLaborRegime({
    contract: { laborRegime: "REMYPE_SMALL", remypeVerified: true, effectiveFrom: "2026-01-01" },
    branch: { remypeRegistered: true, remypeRegDate: "2025-01-01", ciiuCode: "5630" }
  });
  assert.equal(barExcluded.effectiveRegime, "GENERAL");
  assert.equal(barExcluded.requiresAccountantReview, true);
  assert.match(barExcluded.reviewReasons[0], /5630|excluida/i);

  const preRemypeHire = resolveEffectiveLaborRegime({
    contract: { laborRegime: "REMYPE_SMALL", remypeVerified: true, effectiveFrom: "2024-02-01" },
    branch: { remypeRegistered: true, remypeRegDate: "2025-06-01", ciiuCode: "5610" }
  });
  assert.equal(preRemypeHire.effectiveRegime, "GENERAL");
  assert.equal(preRemypeHire.requiresAccountantReview, true);

  const validSmall = resolveEffectiveLaborRegime({
    contract: { laborRegime: "REMYPE_SMALL", remypeVerified: true, effectiveFrom: "2026-01-01" },
    branch: { remypeRegistered: true, remypeRegDate: "2025-06-01", ciiuCode: "5610" }
  });
  assert.equal(validSmall.effectiveRegime, "REMYPE_SMALL");
  assert.equal(validSmall.requiresAccountantReview, false);
  assert.equal(validSmall.annualVacationDays, 15);
  assert.equal(validSmall.ctsFactor, 0.5);
});

test("calculateNightMinutesLima accurately computes 22:00-06:00 Lima local window", () => {
  // 21:00 to 07:00 America/Lima (UTC-5) => 02:00Z to 12:00Z next day = 10h total, 8h (480 mins) night
  const start = Date.parse("2026-11-10T02:00:00Z"); // 21:00 Lima
  const end = Date.parse("2026-11-10T12:00:00Z");   // 07:00 Lima
  assert.equal(calculateNightMinutesLima(start, end), 480);
});

test("calculateEmployeePayroll computes General vs REMYPE, OT 25%/35%, night surcharge, ONP/AFP & Spanish Boleta", () => {
  const generalCalc = calculateEmployeePayroll({
    employee: {
      id: "e1",
      fullName: "María Quispe",
      docType: "DNI",
      docNumber: "45678912",
      pensionSystem: "ONP",
      hasFamilyAllowance: true,
      hasEps: false
    },
    contract: { laborRegime: "GENERAL", wageType: "MONTHLY", baseSalary: 1130, weeklyHours: 48, effectiveFrom: "2025-01-01" },
    branch: { id: "b1", name: "Sede Miraflores", ruc: "20123456789" },
    period: { periodCode: "2026-11", periodType: "MONTHLY", startDate: "2026-11-01", endDate: "2026-11-30", paymentDate: "2026-11-30" },
    attendance: { approvedOvertime25Hours: 2, approvedOvertime35Hours: 1, nightHours: 10 },
    adjustments: { tipsAmount: 150 } // Default non-computable gratuity
  });

  // Base 1130 + FamAllow 113 = 1243 (hourly 5.1792). + OT25 + OT35 + Night top-up + 150 non-computable tips
  assert.equal(generalCalc.laborRegime, "GENERAL");
  assert.equal(generalCalc.vacationDaysAccrued, 2.5);
  assert.ok(generalCalc.ctsAccrual > 0);
  assert.ok(generalCalc.gratificacionAccrual > 0);
  assert.ok(generalCalc.employerContributions > 100); // EsSalud 9%
  assert.equal(generalCalc.boletaSnapshot.moneda, "PEN");
  assert.equal(generalCalc.boletaSnapshot.avisoLegal, "Registro interno del sistema — no constituye presentación oficial ante SUNAT");

  // Gratificación July with EPS (6.75% extraordinary bonus)
  const gratCalc = calculateEmployeePayroll({
    employee: { id: "e1", fullName: "María Quispe", pensionSystem: "AFP_INTEGRA", hasFamilyAllowance: true, hasEps: true },
    contract: { laborRegime: "GENERAL", wageType: "MONTHLY", baseSalary: 2000, weeklyHours: 48, effectiveFrom: "2025-01-01" },
    branch: { id: "b1", name: "Sede Miraflores", ruc: "20123456789" },
    period: { periodCode: "2026-07-GRAT", periodType: "GRATIFICACION_JUL", startDate: "2026-07-01", endDate: "2026-07-15", paymentDate: "2026-07-15" }
  });
  // Base 2000 + 113 FamAllow = 2113 + 6.75% (142.63) = 2255.63
  assert.equal(gratCalc.grossPay, 2255.63);
  assert.equal(gratCalc.netPay, 2255.63);

  // Micro REMYPE verified => 0 CTS, 0 Gratif, 1.25 vac days/month
  const microCalc = calculateEmployeePayroll({
    employee: { id: "e2", fullName: "Carlos Rojas", pensionSystem: "AFP_PRIMA", afpCommissionPct: 1.6, afpInsurancePct: 1.7, hasFamilyAllowance: true },
    contract: { laborRegime: "REMYPE_MICRO", remypeVerified: true, wageType: "MONTHLY", baseSalary: 1130, weeklyHours: 48, effectiveFrom: "2026-02-01" },
    branch: { id: "b2", name: "Sede Barranco", remypeRegistered: true, remypeRegDate: "2025-01-01", ciiuCode: "5610" },
    period: { periodCode: "2026-11", periodType: "MONTHLY", startDate: "2026-11-01", endDate: "2026-11-30", paymentDate: "2026-11-30" }
  });
  assert.equal(microCalc.laborRegime, "REMYPE_MICRO");
  assert.equal(microCalc.ctsAccrual, 0);
  assert.equal(microCalc.gratificacionAccrual, 0);
  assert.equal(microCalc.vacationDaysAccrued, 1.25);
  assert.equal(microCalc.employerContributions, 0);
});

test("calculateFifthCategoryMonthlyIR withholds above 7 UIT threshold and zero below", () => {
  assert.equal(calculateFifthCategoryMonthlyIR({ monthlyComputable: 1500, monthNumber: 1, uit: 5350 }), 0);
  const highIncomeIr = calculateFifthCategoryMonthlyIR({ monthlyComputable: 6000, monthNumber: 1, uit: 5350 });
  assert.ok(highIncomeIr > 300);
});

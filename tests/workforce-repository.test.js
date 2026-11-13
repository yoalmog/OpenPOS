const test = require("node:test");
const assert = require("node:assert/strict");
const workforceRepo = require("../api/lib/workforce-repository");

test("Employee PINs are PBKDF2-hashed, never leaked in API payloads, and clock-in/out computes night & overtime", async () => {
  const store = {};
  workforceRepo.ensureLocalWorkforceState(store);

  const branch = await workforceRepo.saveBranch({ store }, {
    name: "Sede Lima Centro",
    ruc: "20555666777",
    ciiuCode: "5610",
    laborRegime: "GENERAL"
  });

  const savedEmp = await workforceRepo.saveEmployee({ store }, {
    fullName: "Ana Lucía Torres",
    email: "ana@openpos.pe",
    docType: "DNI",
    docNumber: "70123456",
    branchId: branch.id,
    position: "Barista",
    department: "Bar",
    role: "BARISTA",
    hireDate: "2026-01-10",
    pensionSystem: "ONP",
    bankCci: "00219100000000000123",
    pin: "4829",
    hasFamilyAllowance: true
  });

  assert.equal(savedEmp.hasPin, true);
  assert.equal("pinHash" in savedEmp, false);
  assert.equal("pinSalt" in savedEmp, false);
  assert.equal("pin" in savedEmp, false);

  const list = await workforceRepo.listEmployees({ store });
  assert.equal(list.length, 1);
  assert.equal("pinHash" in list[0], false);

  // Wrong PIN rejected
  await assert.rejects(
    () => workforceRepo.recordPinClockAction({ store }, { pin: "0000", action: "CLOCK_IN" }),
    /Invalid or unrecognized active employee PIN/
  );

  // Correct PIN clocks in & out across night window (21:00 to 07:00 Lima -> 10h = 8h ord + 2h OT25 + 8h night)
  const clockInMs = Date.parse("2026-11-10T02:00:00Z");  // 21:00 Lima
  const clockOutMs = Date.parse("2026-11-10T12:00:00Z"); // 07:00 Lima

  const inRes = await workforceRepo.recordPinClockAction({ store }, { pin: "4829", action: "CLOCK_IN", nowMs: clockInMs });
  assert.equal(inRes.log.status, "CLOCKED_IN");

  const outRes = await workforceRepo.recordPinClockAction({ store }, { pin: "4829", action: "CLOCK_OUT", nowMs: clockOutMs });
  assert.equal(outRes.log.status, "COMPLETED");
  assert.equal(outRes.log.workedMinutes, 600);
  assert.equal(outRes.log.nightMinutes, 480);
  assert.equal(outRes.log.overtime25Minutes, 120);
  assert.equal(outRes.log.overtimeApproved, false);

  // Manager approves overtime
  const approvedLog = await workforceRepo.approveAttendanceOvertime({ store }, { id: outRes.log.id, approved: true, approvedBy: "owner@openpos.pe" });
  assert.equal(approvedLog.overtimeApproved, true);

  // Contract + Payroll Run + PLAME/T-REGISTRO Export + Self-Service Scoping
  await workforceRepo.saveContract({ store }, {
    employeeId: savedEmp.id,
    branchId: branch.id,
    laborRegime: "GENERAL",
    wageType: "MONTHLY",
    baseSalary: 1130,
    effectiveFrom: "2026-01-10"
  });

  const run = await workforceRepo.runPayrollForPeriod({ store }, {
    periodCode: "2026-11",
    periodType: "MONTHLY",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    paymentDate: "2026-11-30"
  });
  assert.equal(run.entries.length, 1);
  assert.ok(run.entries[0].grossPay > 1243); // Includes FamAllow + approved OT25 + night surcharge

  const plame = workforceRepo.buildPlameExport(run.entries, run.period, run.effectiveRule);
  assert.match(plame, /OPENPOS_PLAME_EXPORT\|VERSION=4\.3/);
  assert.match(plame, /70123456/);

  const tReg = workforceRepo.buildTRegistroExport([savedEmp], store.employeeContracts, [branch]);
  assert.match(tReg, /Ana Lucía Torres/);
  assert.match(tReg, /20555666777/);

  const selfProfile = await workforceRepo.getSelfServiceProfile({ store }, { email: "ana@openpos.pe" });
  assert.equal(selfProfile.employee.id, savedEmp.id);
  assert.equal("pinHash" in selfProfile.employee, false);
  assert.equal(selfProfile.boletas.length, 1);
});

test("Shift scheduling detects overlaps and swap approval reassigns shift", async () => {
  const store = {};
  workforceRepo.ensureLocalWorkforceState(store);

  const e1 = await workforceRepo.saveEmployee({ store }, { fullName: "Emp One", pin: "1111" });
  const e2 = await workforceRepo.saveEmployee({ store }, { fullName: "Emp Two", pin: "2222" });

  const s1 = await workforceRepo.saveShift({ store }, { employeeId: e1.id, shiftDate: "2026-11-15", startTime: "08:00", endTime: "16:00", position: "Cashier" });
  assert.equal(s1.overlapConflicts.length, 0);

  const s2 = await workforceRepo.saveShift({ store }, { employeeId: e1.id, shiftDate: "2026-11-15", startTime: "14:00", endTime: "20:00", position: "Cashier" });
  assert.equal(s2.overlapConflicts.length, 1);

  const swap = await workforceRepo.createSwapRequest({ store }, { shiftId: s1.shift.id, requesterId: e1.id, targetEmployeeId: e2.id, reason: "Doctor" });
  const decided = await workforceRepo.decideSwapRequest({ store }, { id: swap.id, decision: "APPROVED", reviewedBy: "Manager" });
  assert.equal(decided.status, "APPROVED");

  const updatedShifts = await workforceRepo.listShifts({ store }, { startDate: "2026-11-15", endDate: "2026-11-15" });
  const reassigned = updatedShifts.shifts.find((s) => s.id === s1.shift.id);
  assert.equal(reassigned.employeeId, e2.id);
});

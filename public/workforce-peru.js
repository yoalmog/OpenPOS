// OpenPOS Workforce Management & Peru Payroll Frontend Controller
(function initWorkforcePeruNamespace(global) {
  const I18N = {
    en: {
      mainHeading: 'Workforce Management & Peru Payroll Control Center',
      mainSubtitle: 'Multi-branch scheduling, PIN attendance, labor analytics & Peru-compliant payroll (PEN S/ • America/Lima)',
      pinKiosk: 'PIN Clock Kiosk',
      tabOverview: 'Overview & Forecast',
      tabEmployees: 'Employees & Branches',
      tabSchedules: 'Shifts & Attendance',
      tabLeaves: 'Leave & Swaps',
      tabPayroll: 'Peru Payroll & Boletas',
      tabMyPortal: 'My Portal',
      kpiPredictedOrders: 'Projected Daily Orders',
      kpiMonthlyPayroll: 'Monthly Payroll (PEN)',
      kpiLaborPct: 'Labor Cost % vs Sales',
      kpiPendingApprovals: 'Pending Approvals & Docs',
      deadlinesTitle: 'Upcoming Peru Payroll & Statutory Deadlines',
      branchCostsTitle: 'Labor Cost by Branch & Staffing Alerts',
      forecastTableTitle: 'Hourly Order Forecast & Staffing Demand',
      branchesFormTitle: 'Branch & REMYPE Verification',
      employeeFormTitle: 'Add / Update Employee & Hashed PIN'
    },
    es: {
      mainHeading: 'Gestión de Personal y Planilla Perú',
      mainSubtitle: 'Horarios multisede, asistencia con PIN, analítica laboral y planilla Perú (PEN S/ • America/Lima)',
      pinKiosk: 'Reloj Biométrico PIN',
      tabOverview: 'Resumen y Demanda',
      tabEmployees: 'Personal y Sedes',
      tabSchedules: 'Horarios y Asistencia',
      tabLeaves: 'Vacaciones y Cambios',
      tabPayroll: 'Planilla Perú y Boletas',
      tabMyPortal: 'Mi Portal',
      kpiPredictedOrders: 'Pedidos Proyectados Hoy',
      kpiMonthlyPayroll: 'Planilla Mensual (PEN)',
      kpiLaborPct: 'Costo Laboral % vs Ventas',
      kpiPendingApprovals: 'Aprobaciones y Docs Faltantes',
      deadlinesTitle: 'Próximos Vencimientos de Planilla y Ley Perú',
      branchCostsTitle: 'Costo Laboral por Sede y Alertas',
      forecastTableTitle: 'Demanda Horaria y Personal Recomendado',
      branchesFormTitle: 'Sede y Verificación REMYPE',
      employeeFormTitle: 'Registrar / Editar Trabajador y PIN'
    }
  };

  const wfState = {
    lang: 'en',
    initialized: false,
    isAdmin: true,
    dashboard: null,
    branches: [],
    rules: [],
    employees: [],
    contracts: [],
    shifts: [],
    overlapConflicts: [],
    swaps: [],
    attendance: [],
    leaves: [],
    periods: [],
    entries: []
  };

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pen(val) {
    return `S/ ${(Number(val) || 0).toFixed(2)}`;
  }

  function toast(msg, type = 'success') {
    if (typeof global.showToast === 'function') global.showToast(msg, type);
  }

  async function apiJson(url, options = {}) {
    const res = await global.fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data;
  }

  function applyLanguage(lang) {
    wfState.lang = lang === 'es' ? 'es' : 'en';
    const dict = I18N[wfState.lang];
    document.querySelectorAll('.wf-lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.wfLang === wfState.lang);
    });
    const heading = document.getElementById('wfMainHeading');
    const sub = document.getElementById('wfMainSubtitle');
    if (heading) heading.innerHTML = `<i class="fa-solid fa-users-gear"></i> ${esc(dict.mainHeading)}`;
    if (sub) sub.textContent = dict.mainSubtitle;
    document.querySelectorAll('[data-wf-i18n]').forEach((el) => {
      const key = el.getAttribute('data-wf-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
  }

  function setDefaultDates() {
    const today = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = `${today.slice(0, 7)}-30`;
    const assignIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = val;
    };
    assignIfEmpty('wfEmpHireDate', today);
    assignIfEmpty('wfCtrFrom', today);
    assignIfEmpty('wfShiftDate', today);
    assignIfEmpty('wfLeaveStart', today);
    assignIfEmpty('wfLeaveEnd', today);
    assignIfEmpty('wfRuleFrom', today);
    assignIfEmpty('wfPayCode', today.slice(0, 7));
    assignIfEmpty('wfPayStart', monthStart);
    assignIfEmpty('wfPayEnd', monthEnd);
    assignIfEmpty('wfPayDate', monthEnd);
  }

  function renderSelectOptions() {
    const branchOpts = ['<option value="">All / Default Branch</option>']
      .concat(wfState.branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.laborRegime)})</option>`))
      .join('');
    ['wfEmpBranch', 'wfCtrBranch', 'wfShiftBranch', 'wfPayBranch'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = branchOpts;
    });

    const empOpts = ['<option value="">Select Employee...</option>']
      .concat(wfState.employees.map((e) => `<option value="${esc(e.id)}">${esc(e.fullName)} (${esc(e.position)})</option>`))
      .join('');
    ['wfCtrEmployee', 'wfShiftEmp', 'wfLeaveEmp', 'wfSwapTarget'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = empOpts;
    });

    const kioskEl = document.getElementById('kioskEmployeeSelect');
    if (kioskEl) {
      kioskEl.innerHTML = ['<option value="">Auto-detect by unique PIN</option>']
        .concat(wfState.employees.filter((e) => e.status === 'ACTIVE').map((e) => `<option value="${esc(e.id)}">${esc(e.fullName)}</option>`))
        .join('');
    }

    const swapShiftEl = document.getElementById('wfSwapShift');
    if (swapShiftEl) {
      swapShiftEl.innerHTML = ['<option value="">Select Shift...</option>']
        .concat(wfState.shifts.map((s) => {
          const empName = wfState.employees.find((e) => e.id === s.employeeId)?.fullName || s.employeeId;
          return `<option value="${esc(s.id)}">${esc(s.shiftDate)} ${esc(s.startTime)}-${esc(s.endTime)} • ${esc(empName)}</option>`;
        }))
        .join('');
    }
  }

  function renderOverview() {
    const d = wfState.dashboard;
    if (!d) return;
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('wfKpiMonthlyPayroll', pen(d.kpis?.monthlyPayrollGross));
    set('wfKpiEmployerContrib', `EsSalud/EPS: ${pen(d.kpis?.employerContributions)}`);
    set('wfKpiLaborPct', `${Number(d.kpis?.laborCostPctOfSales || 0).toFixed(1)}%`);
    set('wfKpiSalesPerHour', `Sales/Hr: ${pen(d.kpis?.salesPerLaborHour)}`);

    const pendingTotal =
      (d.pendingApprovals?.leaves || 0) +
      (d.pendingApprovals?.swaps || 0) +
      (d.pendingApprovals?.overtimeLogs || 0) +
      (d.pendingApprovals?.accountantReviewFlags || 0);
    set('wfKpiPendingCount', String(pendingTotal));
    set('wfKpiMissingDocs', `Missing Docs: ${d.missingDocsEmployees?.length || 0}`);

    const alertsBox = document.getElementById('wfAccountantAlerts');
    if (alertsBox) {
      const items = [];
      if (d.pendingApprovals?.accountantReviewFlags > 0) {
        items.push(`<strong>Accountant Review Needed:</strong> ${d.pendingApprovals.accountantReviewFlags} contract/payroll entry flagged (e.g., REMYPE verification or RMV threshold).`);
      }
      if (d.overlapConflicts?.length > 0) {
        items.push(`<strong>Shift Overlaps Detected:</strong> ${d.overlapConflicts.length} overlapping employee shift(s).`);
      }
      if (d.missingDocsEmployees?.length > 0) {
        items.push(`<strong>Missing Employee Docs:</strong> ${d.missingDocsEmployees.map((x) => `${esc(x.fullName)} (${esc(x.missingDocs.join(', '))})`).join(' • ')}`);
      }
      alertsBox.innerHTML = items.length
        ? `<div class="wf-alert-banner">${items.join('<br>')}</div>`
        : '';
    }

    const dlBody = document.getElementById('wfDeadlinesBody');
    if (dlBody) {
      const rows = d.upcomingDeadlines || [];
      dlBody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td>${esc(r.dueDate)}</td><td><span class="wf-badge wf-badge-info">${esc(r.legalRef)}</span></td></tr>`).join('')
        : '<tr><td colspan="3" class="text-center text-muted">No deadlines computed.</td></tr>';
    }

    const branchBox = document.getElementById('wfBranchCostSummary');
    if (branchBox) {
      const branchRows = (d.laborCostByBranch || []).map(
        (b) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--op-line);"><span>${esc(b.branch)}</span><strong>${pen(b.totalCost)}</strong></div>`
      );
      const staffAlerts = (d.staffingAlerts || []).slice(0, 5).map(
        (a) => `<div style="margin-top:8px;"><span class="wf-badge ${a.status === 'UNDERSTAFFED' ? 'wf-badge-danger' : 'wf-badge-warn'}">${esc(a.hour)} ${esc(a.status)}: ${a.scheduled}/${a.recommended} staff</span></div>`
      );
      branchBox.innerHTML =
        (branchRows.length ? branchRows.join('') : '<div class="text-muted">Calculate a payroll period to view branch labor costs.</div>') +
        staffAlerts.join('');
    }
  }

  function renderEmployeesAndContracts() {
    const tbody = document.getElementById('wfEmployeesBody');
    if (!tbody) return;
    if (!wfState.employees.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No employees recorded yet. Add your first employee above.</td></tr>';
      return;
    }
    tbody.innerHTML = wfState.employees.map((emp) => {
      const branch = wfState.branches.find((b) => b.id === emp.branchId);
      const ctr = wfState.contracts.find((c) => c.employeeId === emp.id && c.status === 'ACTIVE') || wfState.contracts.find((c) => c.employeeId === emp.id);
      const regimeBadge = ctr
        ? `<span class="wf-badge ${ctr.requiresAccountantReview ? 'wf-badge-warn' : 'wf-badge-good'}">${esc(ctr.laborRegime)} • ${ctr.wageType === 'HOURLY' ? `${pen(ctr.hourlyRate)}/h` : `${pen(ctr.baseSalary)}/m`}</span>${ctr.requiresAccountantReview ? `<div style="font-size:11px;color:var(--op-warn);margin-top:3px;">${esc(ctr.reviewReason)}</div>` : ''}`
        : '<span class="wf-badge wf-badge-warn">No Contract</span>';
      const missing = emp.missingDocs?.length
        ? `<span class="wf-badge wf-badge-danger">${esc(emp.missingDocs.join(', '))}</span>`
        : '<span class="wf-badge wf-badge-good">Complete</span>';
      return `
        <tr>
          <td><strong>${esc(emp.fullName)}</strong><div style="font-size:11px;color:var(--text-muted);">${esc(emp.position)} • ${esc(emp.role)} (${esc(emp.status)})</div></td>
          <td>${esc(emp.docType)} ${esc(emp.docNumber || '—')}</td>
          <td>${esc(branch?.name || 'Unassigned')}<div style="font-size:11px;color:var(--text-muted);">${esc(emp.department)}</div></td>
          <td>${esc(emp.pensionSystem)}${emp.hasPin ? ' • <span class="wf-badge wf-badge-info">PIN Set</span>' : ''}</td>
          <td>${regimeBadge}</td>
          <td>${missing}</td>
          <td><button type="button" class="btn btn-outline btn-sm" onclick="window.__wfEditEmployee('${esc(emp.id)}')"><i class="fa-solid fa-pen"></i> Edit</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderSchedulesAndAttendance() {
    const overlapBanner = document.getElementById('wfOverlapBanner');
    if (overlapBanner) {
      if (wfState.overlapConflicts.length) {
        overlapBanner.style.display = 'block';
        overlapBanner.innerHTML = `<strong>Overlap Conflicts:</strong> ` + wfState.overlapConflicts.map((c) => {
          const empName = wfState.employees.find((e) => e.id === c.employeeId)?.fullName || c.employeeId;
          return `${esc(empName)} on ${esc(c.shiftDate)} (${esc(c.windowA)} overlaps ${esc(c.windowB)})`;
        }).join(' • ');
      } else {
        overlapBanner.style.display = 'none';
      }
    }

    const shiftsBody = document.getElementById('wfShiftsBody');
    if (shiftsBody) {
      shiftsBody.innerHTML = wfState.shifts.length
        ? wfState.shifts.map((s) => {
            const empName = wfState.employees.find((e) => e.id === s.employeeId)?.fullName || s.employeeId;
            return `<tr><td>${esc(s.shiftDate)}</td><td><strong>${esc(empName)}</strong></td><td>${esc(s.startTime)} - ${esc(s.endTime)}</td><td>${esc(s.position)}</td><td><span class="wf-badge ${s.published ? 'wf-badge-good' : 'wf-badge-warn'}">${s.published ? 'Published' : 'Draft'}</span></td></tr>`;
          }).join('')
        : '<tr><td colspan="5" class="text-center text-muted">No shifts scheduled yet.</td></tr>';
    }

    const attBody = document.getElementById('wfAttendanceBody');
    if (attBody) {
      attBody.innerHTML = wfState.attendance.length
        ? wfState.attendance.map((a) => {
            const empName = wfState.employees.find((e) => e.id === a.employeeId)?.fullName || a.employeeId;
            const totalOt = (a.overtime25Minutes || 0) + (a.overtime35Minutes || 0);
            const otAction = totalOt > 0 && !a.overtimeApproved
              ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.__wfApproveOvertime('${esc(a.id)}')">Approve OT</button>`
              : (a.overtimeApproved ? '<span class="wf-badge wf-badge-good">OT Approved</span>' : `<span class="wf-badge wf-badge-info">${esc(a.status)}</span>`);
            return `<tr><td>${esc(a.workDate)}</td><td><strong>${esc(empName)}</strong></td><td>${(a.workedMinutes / 60).toFixed(2)}h</td><td>${a.lateMinutes}m late / ${(a.nightMinutes / 60).toFixed(1)}h night</td><td>25%: ${(a.overtime25Minutes / 60).toFixed(1)}h • 35%: ${(a.overtime35Minutes / 60).toFixed(1)}h</td><td>${otAction}</td></tr>`;
          }).join('')
        : '<tr><td colspan="6" class="text-center text-muted">No attendance logs yet.</td></tr>';
    }
  }

  function renderLeavesAndSwaps() {
    const leavesBody = document.getElementById('wfLeavesBody');
    if (leavesBody) {
      leavesBody.innerHTML = wfState.leaves.length
        ? wfState.leaves.map((l) => {
            const empName = wfState.employees.find((e) => e.id === l.employeeId)?.fullName || l.employeeId;
            const actions = l.status === 'PENDING'
              ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.__wfDecideLeave('${esc(l.id)}','APPROVED')">Approve</button> <button type="button" class="btn btn-outline btn-sm" onclick="window.__wfDecideLeave('${esc(l.id)}','REJECTED')">Reject</button>`
              : esc(l.reviewedBy || 'Reviewed');
            return `<tr><td><strong>${esc(empName)}</strong></td><td>${esc(l.leaveType)}</td><td>${esc(l.startDate)} → ${esc(l.endDate)} (${l.daysCount}d)</td><td><span class="wf-badge ${l.status === 'APPROVED' ? 'wf-badge-good' : (l.status === 'REJECTED' ? 'wf-badge-danger' : 'wf-badge-warn')}">${esc(l.status)}</span></td><td>${actions}</td></tr>`;
          }).join('')
        : '<tr><td colspan="5" class="text-center text-muted">No leave requests.</td></tr>';
    }

    const swapsBody = document.getElementById('wfSwapsBody');
    if (swapsBody) {
      swapsBody.innerHTML = wfState.swaps.length
        ? wfState.swaps.map((sw) => {
            const reqName = wfState.employees.find((e) => e.id === sw.requesterId)?.fullName || sw.requesterId;
            const tgtName = wfState.employees.find((e) => e.id === sw.targetEmployeeId)?.fullName || sw.targetEmployeeId || 'Open';
            const actions = sw.status === 'PENDING'
              ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.__wfDecideSwap('${esc(sw.id)}','APPROVED')">Approve</button> <button type="button" class="btn btn-outline btn-sm" onclick="window.__wfDecideSwap('${esc(sw.id)}','REJECTED')">Reject</button>`
              : esc(sw.reviewedBy || 'Reviewed');
            return `<tr><td>${esc(sw.shiftId)}</td><td>${esc(reqName)} → ${esc(tgtName)}</td><td><span class="wf-badge ${sw.status === 'APPROVED' ? 'wf-badge-good' : (sw.status === 'REJECTED' ? 'wf-badge-danger' : 'wf-badge-warn')}">${esc(sw.status)}</span></td><td>${actions}</td></tr>`;
          }).join('')
        : '<tr><td colspan="4" class="text-center text-muted">No shift swap requests.</td></tr>';
    }
  }

  function renderPayrollAndRules() {
    const activeRule = wfState.rules[0];
    if (activeRule) {
      const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
      setVal('wfRuleFrom', activeRule.effectiveFrom);
      setVal('wfRuleRmv', activeRule.rmv);
      setVal('wfRuleUit', activeRule.uit);
      setVal('wfRulePlame', activeRule.plameVersion);
      setVal('wfRuleTips', activeRule.tipsTreatment);
      setVal('wfRuleSource', activeRule.legalSource);
    }

    const body = document.getElementById('wfPayrollEntriesBody');
    if (!body) return;
    if (!wfState.entries.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Run a payroll calculation to generate Boletas de Pago.</td></tr>';
      return;
    }
    body.innerHTML = wfState.entries.map((entry) => {
      const snap = entry.boletaSnapshot || {};
      const empName = snap.trabajador?.nombreCompleto || wfState.employees.find((e) => e.id === entry.employeeId)?.fullName || entry.employeeId;
      const periodCode = snap.periodo?.codigo || entry.periodId;
      const flag = entry.requiresAccountantReview
        ? '<span class="wf-badge wf-badge-warn">Revisión Contable</span>'
        : '<span class="wf-badge wf-badge-good">OK</span>';
      return `
        <tr>
          <td>${esc(periodCode)}</td>
          <td><strong>${esc(empName)}</strong></td>
          <td>${esc(entry.laborRegime)}</td>
          <td>${pen(entry.grossPay)}</td>
          <td>${pen(entry.totalDeductions)}</td>
          <td><strong>${pen(entry.netPay)}</strong></td>
          <td>${pen(entry.employerContributions)}</td>
          <td>${flag}</td>
          <td><button type="button" class="btn btn-outline btn-sm" onclick="window.__wfOpenBoleta('${esc(entry.id)}')"><i class="fa-solid fa-file-invoice"></i> Ver Boleta</button></td>
        </tr>
      `;
    }).join('');
  }

  function openBoletaModal(entryOrSnapshot) {
    const snap = entryOrSnapshot?.boletaSnapshot || entryOrSnapshot;
    if (!snap) return;
    const container = document.getElementById('printableBoletaSheet');
    const modal = document.getElementById('boletaPrintModal');
    if (!container || !modal) return;

    const ingresosRows = (snap.ingresos || []).map((i) => `<tr><td>${esc(i.code)}</td><td>${esc(i.concept)}</td><td style="text-align:right;">${pen(i.amount)}</td></tr>`).join('');
    const descuentosRows = (snap.descuentos || []).length
      ? snap.descuentos.map((d) => `<tr><td>${esc(d.code)}</td><td>${esc(d.concept)}</td><td style="text-align:right;">${pen(d.amount)}</td></tr>`).join('')
      : '<tr><td colspan="3" style="color:#64748b;">Sin descuentos aplicados</td></tr>';
    const aportesRows = (snap.aportesEmpleador || []).length
      ? snap.aportesEmpleador.map((a) => `<tr><td>${esc(a.code)}</td><td>${esc(a.concept)}</td><td style="text-align:right;">${pen(a.amount)}</td></tr>`).join('')
      : '<tr><td colspan="3" style="color:#64748b;">Régimen SIS / Inafecto</td></tr>';

    const obsHtml = snap.requiereRevisionContable && snap.observacionesContables?.length
      ? `<div style="margin-bottom:10px;padding:8px 12px;border:1px solid #f59e0b;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px;"><strong>Observaciones para revisión contable:</strong><br>${snap.observacionesContables.map(esc).join('<br>')}</div>`
      : '';

    container.innerHTML = `
      <div class="boleta-header">
        <div>
          <div style="font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:0.08em;">D.S. N° 001-98-TR • PLANILLA ELECTRÓNICA PERÚ</div>
          <h2 style="margin:4px 0 0;font-size:20px;">${esc(snap.titulo || 'BOLETA DE PAGO DE REMUNERACIONES')}</h2>
          <div style="font-size:12px;color:#475569;">${esc(snap.empleador?.razonSocial)} • RUC: ${esc(snap.empleador?.ruc || 'Por configurar')}</div>
        </div>
        <div style="text-align:right;font-size:12px;">
          <div><strong>Periodo:</strong> ${esc(snap.periodo?.codigo)} (${esc(snap.periodo?.tipo)})</div>
          <div><strong>Del:</strong> ${esc(snap.periodo?.fechaInicio)} <strong>Al:</strong> ${esc(snap.periodo?.fechaFin)}</div>
          <div><strong>Régimen:</strong> ${esc(snap.empleador?.regimenLaboral)}</div>
        </div>
      </div>

      <div class="boleta-meta-grid">
        <div><strong>Trabajador:</strong> ${esc(snap.trabajador?.nombreCompleto)}</div>
        <div><strong>Documento:</strong> ${esc(snap.trabajador?.tipoDocumento)} ${esc(snap.trabajador?.numeroDocumento || '—')}</div>
        <div><strong>Cargo / Área:</strong> ${esc(snap.trabajador?.cargo)} / ${esc(snap.trabajador?.departamento)}</div>
        <div><strong>Pensión / CUSPP:</strong> ${esc(snap.trabajador?.sistemaPension)} ${snap.trabajador?.cuspp ? `(${esc(snap.trabajador.cuspp)})` : ''}</div>
        <div><strong>Días Laborados:</strong> ${esc(snap.periodo?.diasLaborados)} • <strong>Horas Ord.:</strong> ${esc(snap.periodo?.horasOrdinarias)}h</div>
        <div><strong>Fecha y Método de Pago:</strong> ${esc(snap.periodo?.fechaPago)} • ${esc(snap.periodo?.metodoPago)}</div>
      </div>

      <div class="boleta-cols">
        <div>
          <h4 style="margin:0 0 6px;">INGRESOS (PEN)</h4>
          <table class="boleta-table">
            <thead><tr><th>Cód.</th><th>Concepto</th><th style="text-align:right;">Monto</th></tr></thead>
            <tbody>${ingresosRows}</tbody>
          </table>
        </div>
        <div>
          <h4 style="margin:0 0 6px;">DESCUENTOS AL TRABAJADOR</h4>
          <table class="boleta-table">
            <thead><tr><th>Cód.</th><th>Concepto</th><th style="text-align:right;">Monto</th></tr></thead>
            <tbody>${descuentosRows}</tbody>
          </table>
          <h4 style="margin:12px 0 6px;">APORTES DEL EMPLEADOR</h4>
          <table class="boleta-table">
            <thead><tr><th>Cód.</th><th>Concepto</th><th style="text-align:right;">Monto</th></tr></thead>
            <tbody>${aportesRows}</tbody>
          </table>
        </div>
      </div>

      <div class="boleta-totals">
        <span>Total Ingresos: ${pen(snap.resumen?.totalIngresos)} | Descuentos: ${pen(snap.resumen?.totalDescuentos)}</span>
        <span style="font-size:18px;color:#1d4ed8;">NETO A PAGAR: ${pen(snap.resumen?.netoPagar)}</span>
      </div>

      <div style="font-size:11px;color:#475569;margin-bottom:10px;">
        Provisiones devengadas en el periodo — CTS: ${pen(snap.resumen?.provisionCtsMensual)} | Gratificación: ${pen(snap.resumen?.provisionGratificacionMensual)} | Vacaciones: ${esc(snap.resumen?.diasVacacionesDevengados)} días.<br>
        <strong>Base Legal:</strong> ${esc((snap.reglasLegales?.referencias || []).join(' • '))}
      </div>

      ${obsHtml}
      <div class="boleta-legal-notice">${esc(snap.avisoLegal || 'Registro interno del sistema — no constituye presentación oficial ante SUNAT')}</div>
    `;

    modal.classList.add('active');
  }

  async function refreshAllWorkforceData() {
    if (global.openposAuthRequired && !global.__openposSignedIn) return;
    try {
      const me = await apiJson('/api/workforce/me');
      wfState.isAdmin = Boolean(me.isAdmin);
      const selfBtn = document.getElementById('wfSelfServiceTabBtn');
      if (selfBtn) selfBtn.style.display = me.profile ? '' : 'none';

      if (me.profile) {
        const myShifts = document.getElementById('wfMyShiftsBody');
        const myBoletas = document.getElementById('wfMyBoletasBody');
        if (myShifts) {
          myShifts.innerHTML = me.profile.shifts?.length
            ? me.profile.shifts.map((s) => `<tr><td>${esc(s.shiftDate)}</td><td>${esc(s.startTime)}-${esc(s.endTime)}</td><td>${esc(s.position)}</td><td>${esc(s.status)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="text-center text-muted">No published shifts yet.</td></tr>';
        }
        if (myBoletas) {
          wfState.selfBoletas = me.profile.boletas || [];
          myBoletas.innerHTML = wfState.selfBoletas.length
            ? wfState.selfBoletas.map((b, idx) => `<tr><td>${esc(b.boletaSnapshot?.periodo?.codigo || b.periodId)}</td><td>${esc(b.laborRegime)}</td><td>${pen(b.grossPay)}</td><td><strong>${pen(b.netPay)}</strong></td><td>${esc(b.paymentDate)}</td><td><button type="button" class="btn btn-outline btn-sm" onclick="window.__wfOpenSelfBoleta(${idx})">Ver Boleta</button></td></tr>`).join('')
            : '<tr><td colspan="6" class="text-center text-muted">No payslips yet.</td></tr>';
        }
      }

      if (!wfState.isAdmin) {
        // Restrict UI strictly to self-service pane for non-admin employees
        document.querySelectorAll('.wf-subtab-btn').forEach((btn) => {
          const isSelf = btn.dataset.wfPane === 'selfservice';
          btn.style.display = isSelf ? '' : 'none';
          btn.classList.toggle('active', isSelf);
        });
        document.querySelectorAll('.wf-subpane').forEach((p) => {
          p.classList.toggle('active', p.id === 'wf-pane-selfservice');
        });
        return;
      }

      const [dashboard, branches, rules, employees, contracts, shiftsData, swaps, attendance, leaves, periods, entries] = await Promise.all([
        apiJson('/api/workforce/dashboard'),
        apiJson('/api/workforce/branches'),
        apiJson('/api/workforce/rules'),
        apiJson('/api/workforce/employees'),
        apiJson('/api/workforce/contracts'),
        apiJson('/api/workforce/shifts'),
        apiJson('/api/workforce/swaps'),
        apiJson('/api/workforce/attendance'),
        apiJson('/api/workforce/leaves'),
        apiJson('/api/workforce/payroll/periods'),
        apiJson('/api/workforce/payroll/entries')
      ]);

      wfState.dashboard = dashboard;
      wfState.branches = branches || [];
      wfState.rules = rules || [];
      wfState.employees = employees || [];
      wfState.contracts = contracts || [];
      wfState.shifts = shiftsData?.shifts || [];
      wfState.overlapConflicts = shiftsData?.overlapConflicts || [];
      wfState.swaps = swaps || [];
      wfState.attendance = attendance || [];
      wfState.leaves = leaves || [];
      wfState.periods = periods || [];
      wfState.entries = entries || [];

      renderSelectOptions();
      renderOverview();
      renderEmployeesAndContracts();
      renderSchedulesAndAttendance();
      renderLeavesAndSwaps();
      renderPayrollAndRules();
    } catch (error) {
      console.warn('[Workforce] Refresh skipped or failed:', error.message);
    }
  }

  function bindUiEventsOnce() {
    if (wfState.initialized) return;
    wfState.initialized = true;
    setDefaultDates();

    document.querySelectorAll('.wf-lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyLanguage(btn.dataset.wfLang));
    });

    document.getElementById('wfSubNav')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.wf-subtab-btn');
      if (!btn) return;
      document.querySelectorAll('.wf-subtab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.wf-subpane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`wf-pane-${btn.dataset.wfPane}`)?.classList.add('active');
    });

    document.getElementById('wfOpenPinKioskBtn')?.addEventListener('click', () => {
      const resBox = document.getElementById('pinKioskResult');
      if (resBox) resBox.textContent = '';
      document.getElementById('pinKioskForm')?.reset();
      document.getElementById('pinKioskModal')?.classList.add('active');
    });

    document.getElementById('confirmPrintBoletaBtn')?.addEventListener('click', () => {
      global.print();
    });

    document.getElementById('wfBranchForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiJson('/api/workforce/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('wfBranchName').value.trim(),
            ruc: document.getElementById('wfBranchRuc').value.trim(),
            ciiuCode: document.getElementById('wfBranchCiiu').value.trim(),
            laborRegime: document.getElementById('wfBranchRegime').value,
            remypeRegNumber: document.getElementById('wfBranchRemypeNum').value.trim(),
            remypeRegDate: document.getElementById('wfBranchRemypeDate').value || null,
            remypeRegistered: document.getElementById('wfBranchRemypeReg').checked,
            remypeActivityExcluded: document.getElementById('wfBranchExcluded').checked
          })
        });
        toast('Branch saved successfully.');
        e.target.reset();
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfEmpResetBtn')?.addEventListener('click', () => {
      document.getElementById('wfEmployeeForm')?.reset();
      document.getElementById('wfEmpId').value = '';
    });

    document.getElementById('wfEmployeeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiJson('/api/workforce/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: document.getElementById('wfEmpId').value || undefined,
            fullName: document.getElementById('wfEmpName').value.trim(),
            email: document.getElementById('wfEmpEmail').value.trim(),
            docType: document.getElementById('wfEmpDocType').value,
            docNumber: document.getElementById('wfEmpDocNum').value.trim(),
            branchId: document.getElementById('wfEmpBranch').value || null,
            position: document.getElementById('wfEmpPosition').value.trim() || 'Staff',
            department: document.getElementById('wfEmpDepartment').value.trim() || 'Operations',
            role: document.getElementById('wfEmpRole').value,
            status: document.getElementById('wfEmpStatus').value,
            hireDate: document.getElementById('wfEmpHireDate').value || null,
            pensionSystem: document.getElementById('wfEmpPension').value,
            afpCuspp: document.getElementById('wfEmpCuspp').value.trim(),
            bankCci: document.getElementById('wfEmpCci').value.trim(),
            pin: document.getElementById('wfEmpPin').value.trim() || undefined,
            hasFamilyAllowance: document.getElementById('wfEmpFamAllow').checked,
            hasEps: document.getElementById('wfEmpEps').checked
          })
        });
        toast('Employee saved (PIN securely hashed).');
        e.target.reset();
        document.getElementById('wfEmpId').value = '';
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfContractForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiJson('/api/workforce/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: document.getElementById('wfCtrEmployee').value,
            branchId: document.getElementById('wfCtrBranch').value || null,
            laborRegime: document.getElementById('wfCtrRegime').value,
            wageType: document.getElementById('wfCtrWageType').value,
            baseSalary: Number(document.getElementById('wfCtrSalary').value || 0),
            hourlyRate: Number(document.getElementById('wfCtrHourly').value || 0),
            effectiveFrom: document.getElementById('wfCtrFrom').value,
            remypeVerified: document.getElementById('wfCtrRemypeVerified').checked
          })
        });
        if (res.contract?.requiresAccountantReview) {
          toast('Contract saved under provisional GENERAL regime (flagged for accountant review).', 'error');
        } else {
          toast('Contract saved.');
        }
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfShiftForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiJson('/api/workforce/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: document.getElementById('wfShiftEmp').value,
            branchId: document.getElementById('wfShiftBranch').value || null,
            position: document.getElementById('wfShiftPosition').value.trim() || 'Staff',
            shiftDate: document.getElementById('wfShiftDate').value,
            startTime: document.getElementById('wfShiftStart').value,
            endTime: document.getElementById('wfShiftEnd').value
          })
        });
        toast(res.overlapConflicts?.length ? 'Shift saved, overlap conflict detected!' : 'Shift scheduled.');
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfPublishShiftsBtn')?.addEventListener('click', async () => {
      try {
        const res = await apiJson('/api/workforce/shifts/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        toast(`Published ${res.count} shift(s) to staff.`);
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('pinKioskForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resultEl = document.getElementById('pinKioskResult');
      try {
        const res = await apiJson('/api/workforce/kiosk/clock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: document.getElementById('kioskEmployeeSelect').value || undefined,
            pin: document.getElementById('kioskPinInput').value.trim(),
            action: document.getElementById('kioskActionSelect').value
          })
        });
        if (resultEl) resultEl.innerHTML = `<span class="wf-badge wf-badge-good">Recorded ${esc(res.log.status)} for ${esc(res.employeeName)}</span>`;
        document.getElementById('kioskPinInput').value = '';
        refreshAllWorkforceData();
      } catch (err) {
        if (resultEl) resultEl.innerHTML = `<span class="wf-badge wf-badge-danger">${esc(err.message)}</span>`;
      }
    });

    document.getElementById('wfLeaveForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiJson('/api/workforce/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: document.getElementById('wfLeaveEmp').value,
            leaveType: document.getElementById('wfLeaveType').value,
            startDate: document.getElementById('wfLeaveStart').value,
            endDate: document.getElementById('wfLeaveEnd').value,
            reason: document.getElementById('wfLeaveReason').value.trim()
          })
        });
        toast('Leave request logged.');
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfSwapForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const shiftId = document.getElementById('wfSwapShift').value;
        const shift = wfState.shifts.find((s) => s.id === shiftId);
        await apiJson('/api/workforce/swaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shiftId,
            requesterId: shift?.employeeId || '',
            targetEmployeeId: document.getElementById('wfSwapTarget').value,
            reason: document.getElementById('wfSwapReason').value.trim()
          })
        });
        toast('Shift swap request submitted.');
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfRuleForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiJson('/api/workforce/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effectiveFrom: document.getElementById('wfRuleFrom').value,
            rmv: Number(document.getElementById('wfRuleRmv').value),
            uit: Number(document.getElementById('wfRuleUit').value),
            plameVersion: document.getElementById('wfRulePlame').value.trim(),
            tipsTreatment: document.getElementById('wfRuleTips').value,
            legalSource: document.getElementById('wfRuleSource').value.trim()
          })
        });
        toast('Effective-dated Peru labor rule saved.');
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('wfPayrollRunForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiJson('/api/workforce/payroll/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periodCode: document.getElementById('wfPayCode').value.trim(),
            periodType: document.getElementById('wfPayType').value,
            branchId: document.getElementById('wfPayBranch').value || null,
            startDate: document.getElementById('wfPayStart').value,
            endDate: document.getElementById('wfPayEnd').value,
            paymentDate: document.getElementById('wfPayDate').value
          })
        });
        toast(`Payroll calculated for ${res.entries?.length || 0} employee(s).`);
        refreshAllWorkforceData();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  global.__wfEditEmployee = (id) => {
    const emp = wfState.employees.find((e) => e.id === id);
    if (!emp) return;
    document.getElementById('wfEmpId').value = emp.id;
    document.getElementById('wfEmpName').value = emp.fullName || '';
    document.getElementById('wfEmpEmail').value = emp.email || '';
    document.getElementById('wfEmpDocType').value = emp.docType || 'DNI';
    document.getElementById('wfEmpDocNum').value = emp.docNumber || '';
    document.getElementById('wfEmpBranch').value = emp.branchId || '';
    document.getElementById('wfEmpPosition').value = emp.position || '';
    document.getElementById('wfEmpDepartment').value = emp.department || '';
    document.getElementById('wfEmpRole').value = emp.role || 'STAFF';
    document.getElementById('wfEmpStatus').value = emp.status || 'ACTIVE';
    document.getElementById('wfEmpHireDate').value = emp.hireDate || '';
    document.getElementById('wfEmpPension').value = emp.pensionSystem || 'ONP';
    document.getElementById('wfEmpCuspp').value = emp.afpCuspp || '';
    document.getElementById('wfEmpCci').value = emp.bankCci || '';
    document.getElementById('wfEmpPin').value = '';
    document.getElementById('wfEmpFamAllow').checked = Boolean(emp.hasFamilyAllowance);
    document.getElementById('wfEmpEps').checked = Boolean(emp.hasEps);
    document.getElementById('wfEmpName').focus();
  };

  global.__wfApproveOvertime = async (id) => {
    try {
      await apiJson(`/api/workforce/attendance/${encodeURIComponent(id)}/overtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
      });
      toast('Overtime approved for payroll.');
      refreshAllWorkforceData();
    } catch (err) { toast(err.message, 'error'); }
  };

  global.__wfDecideLeave = async (id, decision) => {
    try {
      await apiJson(`/api/workforce/leaves/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      toast(`Leave ${decision.toLowerCase()}.`);
      refreshAllWorkforceData();
    } catch (err) { toast(err.message, 'error'); }
  };

  global.__wfDecideSwap = async (id, decision) => {
    try {
      await apiJson(`/api/workforce/swaps/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      toast(`Shift swap ${decision.toLowerCase()}.`);
      refreshAllWorkforceData();
    } catch (err) { toast(err.message, 'error'); }
  };

  global.__wfOpenBoleta = (entryId) => {
    const entry = wfState.entries.find((e) => e.id === entryId);
    if (entry) openBoletaModal(entry);
  };

  global.__wfOpenSelfBoleta = (idx) => {
    const entry = (wfState.selfBoletas || [])[idx];
    if (entry) openBoletaModal(entry);
  };

  global.refreshWorkforcePeruData = refreshAllWorkforceData;
  global.initWorkforcePeruModule = () => {
    bindUiEventsOnce();
    refreshAllWorkforceData();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', global.initWorkforcePeruModule);
  } else {
    global.initWorkforcePeruModule();
  }
})(window);

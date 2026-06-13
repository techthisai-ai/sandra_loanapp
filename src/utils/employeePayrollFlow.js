export const EMPLOYEE_PAYROLL_STATUSES = {
  INACTIVE: "inactive",
  PAID: "paid",
  PENDING: "pending",
  UNASSIGNED: "unassigned",
};

export function normalizeEmployeeIdKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeEmployeeStatus(employee) {
  const status = String(employee?.employeeStatus || employee?.status || "").toLowerCase();
  return status === "inactive" ? "inactive" : "active";
}

export function isActiveEmployee(employee) {
  return normalizeEmployeeStatus(employee) === "active";
}

export function getAssignedMonthlySalary(employee) {
  const amount = Number(employee?.monthlySalary || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function isSalaryRecordPaid(record) {
  return Boolean(record) && String(record.payment_status || "").toLowerCase() === "paid";
}

export function resolveSalaryRecordForEmployee(employee, salaryByEmployeeId = new Map()) {
  const key = normalizeEmployeeIdKey(employee?.employeeId);
  return key ? salaryByEmployeeId.get(key) || null : null;
}

/**
 * Pending amount for an active employee in the selected payroll period.
 * Uses the salary record net pay when present, otherwise the assigned monthly salary.
 */
export function resolvePendingSalaryAmount(employee, salaryRecord) {
  if (!isActiveEmployee(employee) || isSalaryRecordPaid(salaryRecord)) {
    return 0;
  }

  const recordAmount = Number(salaryRecord?.final_salary || 0);
  if (Number.isFinite(recordAmount) && recordAmount > 0) {
    return recordAmount;
  }

  return getAssignedMonthlySalary(employee);
}

/**
 * Payroll status shown in the Last payroll table.
 * Inactive employees are excluded from pending totals but still visible in the table.
 */
export function resolvePayrollRowStatus(employee, salaryRecord) {
  if (!isActiveEmployee(employee)) {
    return EMPLOYEE_PAYROLL_STATUSES.INACTIVE;
  }
  if (isSalaryRecordPaid(salaryRecord)) {
    return EMPLOYEE_PAYROLL_STATUSES.PAID;
  }
  if (getAssignedMonthlySalary(employee) > 0 || salaryRecord) {
    return EMPLOYEE_PAYROLL_STATUSES.PENDING;
  }
  return EMPLOYEE_PAYROLL_STATUSES.UNASSIGNED;
}

export function buildEmployeePayrollRow({
  employee,
  salaryRecord = null,
  currentMonth = "",
  formatCurrency = (value) => String(value ?? ""),
  formatMonthLabel = (value) => String(value ?? ""),
  formatAssignedCentersLabel = () => "--",
}) {
  const employeeId = employee?.employeeId || "—";
  const assignedSalary = getAssignedMonthlySalary(employee);
  const payrollStatus = resolvePayrollRowStatus(employee, salaryRecord);
  const pendingAmount = resolvePendingSalaryAmount(employee, salaryRecord);

  return {
    key: employee?.id || employeeId,
    employeeId,
    name: employee?.displayName || employee?.username || "—",
    center: formatAssignedCentersLabel(employee),
    month: salaryRecord?.salary_month ? formatMonthLabel(salaryRecord.salary_month) : formatMonthLabel(currentMonth),
    salary: assignedSalary > 0 ? formatCurrency(assignedSalary) : "—",
    net: salaryRecord ? formatCurrency(salaryRecord.final_salary) : "—",
    status: payrollStatus,
    employeeStatus: normalizeEmployeeStatus(employee),
    pendingAmount,
    assignedSalary,
    salaryRecordId: salaryRecord?.salary_id || "",
    isPayrollEligible: isActiveEmployee(employee),
  };
}

export function buildPayrollPeriodStats({
  employees = [],
  salaryByEmployeeId = new Map(),
  periodLabel = "",
}) {
  const activeEmployees = employees.filter(isActiveEmployee);
  let paid = 0;
  let pendingSalaryAmount = 0;

  activeEmployees.forEach((employee) => {
    const salaryRecord = resolveSalaryRecordForEmployee(employee, salaryByEmployeeId);
    const payrollStatus = resolvePayrollRowStatus(employee, salaryRecord);

    if (payrollStatus === EMPLOYEE_PAYROLL_STATUSES.PAID) {
      paid += 1;
      return;
    }

    pendingSalaryAmount += resolvePendingSalaryAmount(employee, salaryRecord);
  });

  const total = activeEmployees.length;
  const pending = Math.max(total - paid, 0);
  const inactive = employees.length - total;

  return {
    total,
    paid,
    pending,
    inactive,
    pendingSalaryAmount,
    periodLabel,
  };
}

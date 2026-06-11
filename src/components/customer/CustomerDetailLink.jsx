import { Link } from "react-router-dom";
import { EMPLOYEE_ROOT_DAYS } from "../../constants/employeeDays";

function resolveEmployeeDay(selectedDay) {
  return selectedDay || EMPLOYEE_ROOT_DAYS[0]?.label || "Monday";
}

export function buildCustomerDetailPath({ customerId, variant = "admin", selectedDay }) {
  if (!customerId) return null;
  if (variant === "employee") {
    const day = resolveEmployeeDay(selectedDay);
    return `/employee/customers/${encodeURIComponent(day)}/${encodeURIComponent(customerId)}`;
  }
  return `/dashboard/customer/${encodeURIComponent(customerId)}/profile`;
}

export default function CustomerDetailLink({
  customerId,
  children,
  className = "",
  variant = "admin",
  selectedDay,
  state,
  title,
  onClick,
}) {
  const to = buildCustomerDetailPath({ customerId, variant, selectedDay });
  const content = children ?? customerId ?? "—";

  if (!to) {
    return (
      <span className={className} title={title}>
        {content}
      </span>
    );
  }

  return (
    <Link
      to={to}
      state={state ?? (customerId ? { viewOnly: true, customerId } : undefined)}
      className={`hover:text-blue-700 hover:underline ${className}`.trim()}
      title={title}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}

import { Eye, FileSpreadsheet, FileText, LoaderCircle, Printer } from "lucide-react";

const VARIANT_ICONS = {
  view: Eye,
  excel: FileSpreadsheet,
  pdf: FileText,
  print: Printer,
};

export function ExportToolbar({ children, className = "" }) {
  return <div className={`app-export-toolbar ${className}`.trim()}>{children}</div>;
}

export function ExportToolbarButton({
  variant = "neutral",
  loading = false,
  icon,
  children,
  className = "",
  ...props
}) {
  const Icon = icon || VARIANT_ICONS[variant] || null;
  const DisplayIcon = loading ? LoaderCircle : Icon;

  return (
    <button
      type="button"
      className={`app-export-btn app-export-btn--${variant} ${className}`.trim()}
      disabled={loading || props.disabled}
      {...props}
    >
      {DisplayIcon ? (
        <DisplayIcon className={`h-3.5 w-3.5 shrink-0 ${loading ? "animate-spin" : ""}`} aria-hidden />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

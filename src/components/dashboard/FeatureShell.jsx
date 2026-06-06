export default function FeatureShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  children,
}) {
  return (
    <div className="app-panel app-content-wrap w-full rounded-[26px] p-4 md:p-5">
      <div className="flex flex-col gap-2 border-b border-slate-200/70 pb-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="app-icon-shell flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="app-eyebrow text-[11px] font-semibold uppercase tracking-[0.24em]">{eyebrow}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 md:text-xl">{title}</h3>
            {description ? <p className="app-description mt-1 max-w-3xl text-sm leading-5">{description}</p> : null}
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>

      <div className="pt-3">{children}</div>
    </div>
  );
}

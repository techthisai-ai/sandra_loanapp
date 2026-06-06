import FeatureShell from "./FeatureShell";

export default function AdminSectionPage({
  eyebrow,
  title,
  description,
  icon,
  badges = [],
  cards = [],
}) {
  return (
    <FeatureShell eyebrow={eyebrow} title={title} description={description} icon={icon}>
      <div className="grid gap-4">
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/85 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.title} className="app-panel-muted rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="app-icon-shell flex h-10 w-10 items-center justify-center rounded-xl border border-white/70">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">{card.title}</h4>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </FeatureShell>
  );
}

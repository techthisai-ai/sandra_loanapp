/** Lightweight skeleton placeholders for collector screens. */
export function EmployeeDayCardsSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-slate-200/80 bg-slate-100/90 p-3 sm:rounded-[22px] sm:p-3.5"
        >
          <div className="mx-auto h-9 w-9 rounded-xl bg-slate-200/90 sm:h-10 sm:w-10" />
          <div className="mx-auto mt-2 h-2.5 w-10 rounded bg-slate-200/90" />
          <div className="mx-auto mt-1.5 h-2 w-16 rounded bg-slate-200/70" />
        </div>
      ))}
    </div>
  );
}

export function EmployeeCenterListSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200/90" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200/90" />
              <div className="h-2.5 w-16 rounded bg-slate-200/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

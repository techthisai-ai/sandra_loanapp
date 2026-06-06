import { ArrowRight } from "lucide-react";

export default function Navbar() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 text-slate-900 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Loan Web</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">Simple and secure access</h1>
        </div>
        <a
          href="/dashboard"
          className="app-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowRight className="h-4 w-4" />
          Open dashboard
        </a>
      </div>
    </header>
  );
}

import BrandLogo from "./BrandLogo";

export default function AppLoadingScreen({ message = "Loading..." }) {
  return (
    <div
      className="app-loading-screen app-shell flex min-h-[100dvh] min-h-screen flex-col items-center justify-center px-6 py-10 text-slate-900"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-loading-screen-card flex w-full max-w-sm flex-col items-center rounded-[28px] border border-slate-200/80 bg-white/95 px-8 py-10 text-center shadow-lg shadow-slate-200/60 backdrop-blur-sm">
        <BrandLogo variant="splash" priority className="mx-auto object-center" />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700">
          Ruthra Financial Solutions
        </p>
        <div
          className="mt-6 h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-teal-600"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-medium text-slate-600">{message}</p>
      </div>
    </div>
  );
}

import BrandLogo from "../components/BrandLogo";

export default function Home() {
  return (
    <main className="min-h-[100dvh] px-6 py-14 pb-[max(3.5rem,env(safe-area-inset-bottom))] text-slate-900">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col gap-6 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[var(--app-shadow-soft)] md:flex-row md:items-center md:gap-10 md:p-10">
          <BrandLogo variant="lg" className="shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Home</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Ruthra Financial Solutions</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Loan operations and collections in one place—built for teams in the field and at the desk, with a calm, shop-grade experience on mobile and web.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

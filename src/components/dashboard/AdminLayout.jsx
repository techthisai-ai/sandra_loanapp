import Sidebar from "./Sidebar";

export default function AdminLayout({ title, description, children, action, eyebrow = "Admin" }) {
  return (
    <div className="app-shell min-h-screen overflow-x-hidden text-slate-900">
      <div className="flex min-h-screen w-full min-w-0">
        <Sidebar />

        <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden px-2 pb-2 pt-14 md:px-4 md:py-3 lg:pl-[286px] lg:pr-4 lg:pt-3">
          {action ? (
            <div className="app-content-wrap mb-1 flex w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
              {action}
            </div>
          ) : null}

          <section className="flex w-full min-w-0 max-w-full flex-1 items-start justify-center py-1 md:py-2">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}

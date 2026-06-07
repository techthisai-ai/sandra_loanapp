import Sidebar from "./Sidebar";

export default function AdminLayout({ title, description, children, action, eyebrow = "Admin" }) {
  return (
    <div className="app-shell min-h-screen overflow-x-hidden text-slate-900">
      <div className="flex min-h-screen w-full min-w-0">
        <Sidebar />

        <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-3 pt-14 sm:px-4 md:pl-[248px] md:pr-4 md:pt-3 md:pb-4 lg:pl-[286px]">
          {action ? (
            <div className="app-content-wrap mb-1 flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              {action}
            </div>
          ) : null}

          <section className="flex w-full min-w-0 max-w-full flex-1 flex-col py-1 md:py-2">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}

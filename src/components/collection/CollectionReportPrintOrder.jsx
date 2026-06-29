import { useState } from "react";
import { GripVertical, X } from "lucide-react";

function PrintOrderSubCenterList({ subCenter, items, isActive, onRemove, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const finishDrop = (targetIndex) => {
    if (dragIndex == null || targetIndex == null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    onReorder(subCenter, dragIndex, targetIndex);
    setDragIndex(null);
    setDropIndex(null);
  };

  if (!items.length) {
    return null;
  }

  return (
    <ol className="space-y-2" aria-label={`Print order for ${subCenter}`}>
      {items.map((item, index) => (
        <li
          key={item.customerId}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragEnd={() => {
            setDragIndex(null);
            setDropIndex(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDropIndex(index);
          }}
          onDrop={(event) => {
            event.preventDefault();
            finishDrop(index);
          }}
          className={`flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 shadow-sm transition ${
            dragIndex === index
              ? "border-blue-300 opacity-60"
              : dropIndex === index && dragIndex != null
                ? "border-blue-400 ring-2 ring-blue-100"
                : isActive
                  ? "border-slate-200"
                  : "border-slate-200"
          }`}
        >
          <span
            className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:cursor-grabbing"
            aria-hidden="true"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{item.customerName || "Unnamed"}</p>
            <p className="truncate text-xs text-slate-500">{item.customerId}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(subCenter, item.customerId)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            aria-label={`Remove ${item.customerName || item.customerId} from print order`}
          >
            <X className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function CollectionReportPrintOrder({
  sections = [],
  onRemove,
  onReorder,
}) {
  if (!sections.length) {
    return null;
  }

  return (
    <section className="collection-report-print-order mt-4 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Print order</p>
      </div>

      <div className="mt-3 space-y-4">
        {sections.map((section) => (
            <div
              key={section.subCenter}
              className={`rounded-2xl border p-3 ${
                section.isActive ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-slate-50/40"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">{section.subCenter}</p>
                {section.isActive ? (
                  <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    Current
                  </span>
                ) : null}
              </div>
              <PrintOrderSubCenterList
                subCenter={section.subCenter}
                items={section.items}
                isActive={section.isActive}
                onRemove={onRemove}
                onReorder={onReorder}
              />
            </div>
          ))}
        </div>
    </section>
  );
}

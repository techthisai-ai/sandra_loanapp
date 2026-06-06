/** Shown when customer has a day centre but no sub-centre leaf. */
export const NO_SUB_CENTER_LABEL = "No sub-center assigned";

/** Shown when customer has no centre assignment. */
export const NO_CENTER_LABEL = "Centre not assigned";

function norm(v) {
  return String(v ?? "").trim();
}

/**
 * Resolve day centre + sub-centre labels for reporting from Firestore fields and/or loanCenters tree.
 * Never returns a bare "--" for sub-centre; uses {@link NO_SUB_CENTER_LABEL} when appropriate.
 *
 * @param {Record<string, unknown>} customer
 * @param {Array<{ label: string, parent?: string }>} centers
 * @returns {{ dayCenter: string, subCenter: string }}
 */
export function resolveCustomerCenterDisplay(customer, centers = []) {
  const list = Array.isArray(centers) ? centers : [];
  const centerByLabel = new Map(list.map((c) => [c.label, c]));

  const explicitParent = norm(customer.parentCenterLabel);
  const explicitSub = norm(customer.subCenterLabel);

  if (explicitParent && explicitSub) {
    return { dayCenter: explicitParent, subCenter: explicitSub };
  }
  if (explicitParent) {
    return { dayCenter: explicitParent, subCenter: explicitSub || NO_SUB_CENTER_LABEL };
  }

  const selected = norm(customer.selectedDay);
  if (!selected) {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      console.warn("[centerDisplay] Customer has no selectedDay / centre fields", customer.customerId || customer.id);
    }
    return { dayCenter: NO_CENTER_LABEL, subCenter: NO_SUB_CENTER_LABEL };
  }

  const node = centerByLabel.get(selected);
  if (node) {
    const parent = norm(node.parent);
    if (parent) {
      return { dayCenter: parent, subCenter: selected };
    }
    return { dayCenter: selected, subCenter: NO_SUB_CENTER_LABEL };
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn("[centerDisplay] Unknown centre label (not in loanCenters tree)", {
      customerId: customer.customerId || customer.id,
      selectedDay: selected,
    });
  }
  return { dayCenter: selected, subCenter: NO_SUB_CENTER_LABEL };
}

/**
 * Maps resolved display labels to fields stored on the customer document.
 * Avoids persisting human-readable fallback strings like {@link NO_SUB_CENTER_LABEL} as real sub-centre names.
 *
 * @param {string} selectedDayLeaf
 * @param {Array<{ label: string, parent?: string }>} centers
 * @returns {{ parentCenterLabel: string, subCenterLabel: string }}
 */
export function persistableCenterFieldsFromSelectedDay(selectedDayLeaf, centers = []) {
  const { dayCenter, subCenter } = resolveCustomerCenterDisplay({ selectedDay: selectedDayLeaf }, centers);
  return {
    parentCenterLabel: dayCenter === NO_CENTER_LABEL ? "" : dayCenter,
    subCenterLabel:
      subCenter === NO_SUB_CENTER_LABEL || subCenter === NO_CENTER_LABEL ? "" : subCenter,
  };
}

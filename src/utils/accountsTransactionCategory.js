/** Internal select value — never persisted to Firebase; custom text is saved instead. */
export const TRANSACTION_CATEGORY_OTHERS_VALUE = "__category_others__";

export const TRANSACTION_CATEGORY_OTHERS_LABEL = "Others";

export function isTransactionOthersSelection(category) {
  return category === TRANSACTION_CATEGORY_OTHERS_VALUE;
}

export function resolveTransactionCategoryForSave({ category, customCategory }) {
  if (isTransactionOthersSelection(category)) {
    return String(customCategory || "").trim();
  }
  return String(category || "").trim();
}

export function predefinedCategoryNameSet(categoryRows = []) {
  return new Set(
    categoryRows.map((item) => String(item.name || "").trim()).filter(Boolean)
  );
}

/** Map stored category to form dropdown + optional custom field (edit / hydrate). */
export function transactionCategoryFieldsFromRecord(savedCategory, categoryRows = []) {
  const saved = String(savedCategory || "").trim();
  if (!saved) {
    return { category: "", customCategory: "" };
  }
  const names = predefinedCategoryNameSet(categoryRows);
  if (names.has(saved)) {
    return { category: saved, customCategory: "" };
  }
  return { category: TRANSACTION_CATEGORY_OTHERS_VALUE, customCategory: saved };
}

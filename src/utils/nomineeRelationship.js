export const NOMINEE_RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Mother",
  "Father",
  "Brother",
  "Daughter",
  "Son",
];

const ALIASES = {
  spouse: "Spouse",
  wife: "Spouse",
  husband: "Spouse",
  partner: "Spouse",
  mother: "Mother",
  mom: "Mother",
  mum: "Mother",
  father: "Father",
  dad: "Father",
  brother: "Brother",
  bro: "Brother",
  daughter: "Daughter",
  son: "Son",
  parent: "",
  parents: "",
};

/** Map legacy free-text or variant casing to a canonical option value, or "" if unknown. */
export function normalizeNomineeRelation(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const exact = NOMINEE_RELATIONSHIP_OPTIONS.find((opt) => opt === trimmed);
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  const fromAlias = ALIASES[lower];
  if (fromAlias) return fromAlias;

  const caseInsensitive = NOMINEE_RELATIONSHIP_OPTIONS.find((opt) => opt.toLowerCase() === lower);
  return caseInsensitive || "";
}

export function isValidNomineeRelation(value) {
  return NOMINEE_RELATIONSHIP_OPTIONS.includes(value);
}

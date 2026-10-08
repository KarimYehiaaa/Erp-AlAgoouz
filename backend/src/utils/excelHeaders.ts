const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

/** Match explicit column names, preferring canonical aliases over generic ones. */
export const findExcelHeaderIndex = (headers: unknown[], aliases: string[]): number => {
  const normalized = headers.map(normalizeHeader);
  const names = aliases.map(normalizeHeader);
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index !== -1) return index;
  }

  // Templates may annotate a column with its currency or date format.
  const annotated = normalized.map((header) => header.replace(/(?:\([^()]*\)|\[[^[\]]*\])$/, ''));
  for (const name of names) {
    const index = annotated.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
};

const TAIWAN_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["支持", "支援"],
  ["公布", "公佈"],
];

export function normalizeTaiwanText(value: string): string {
  return TAIWAN_TERMS.reduce(
    (text, [source, replacement]) => text.replaceAll(source, replacement),
    value,
  );
}

export function normalizeTaiwanCopy<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeTaiwanText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTaiwanCopy(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeTaiwanCopy(item)]),
    ) as T;
  }
  return value;
}

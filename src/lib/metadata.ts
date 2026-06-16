export function serializeMetadata(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function parseMetadataInRow<T>(row: T): T {
  if (!row) return row;
  const r = row as unknown as { metadata?: unknown };
  if (typeof r.metadata === "string") {
    return { ...(row as object), metadata: JSON.parse(r.metadata) } as T;
  }
  return row;
}

export function parseMetadataInRows<T>(rows: T[]): T[] {
  return rows.map(parseMetadataInRow);
}

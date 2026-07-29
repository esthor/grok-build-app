// Tolerant JSON helpers for tailing files other processes are writing.
// Torn lines and unexpected shapes are normal; never throw, never trust.

export type JObj = Record<string, unknown>;

export function parseObj(line: string): JObj | null {
  try {
    const v: unknown = JSON.parse(line);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as JObj;
    return null;
  } catch {
    return null;
  }
}

export function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

export function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}

export function bool(v: unknown, d = false): boolean {
  return typeof v === "boolean" ? v : d;
}

export function sub(v: unknown): JObj | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JObj) : null;
}

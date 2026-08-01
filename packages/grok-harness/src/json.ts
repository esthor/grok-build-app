// Tolerant JSON helpers for reading files another process owns.
// Torn lines and unexpected shapes are normal operating conditions for the
// grok-build session surfaces: never throw, never trust.

export type JObj = Record<string, unknown>;

export function parseObj(line: string): JObj | null {
  try {
    const v: unknown = JSON.parse(line);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

export function isObj(v: unknown): v is JObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
  return isObj(v) ? v : null;
}

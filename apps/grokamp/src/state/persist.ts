/** tiny localStorage persistence with corruption tolerance */

const PREFIX = "grokamp.v1.";

export function loadPersisted<T>(key: string, decode: (raw: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) {
      return null;
    }
    return decode(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePersisted(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full / private mode: shrug, it's 1997
  }
}

export function debounced(fn: () => void, ms: number): () => void {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (handle !== null) {
      clearTimeout(handle);
    }
    handle = setTimeout(fn, ms);
  };
}

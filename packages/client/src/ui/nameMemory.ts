const STORAGE_KEY = "coop-zombie.display-names";
const MAX_NAMES = 8;

export type StoredNames = {
  last: string;
  previous: string[];
};

function read(): StoredNames {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { last: "", previous: [] };
    const parsed = JSON.parse(raw) as Partial<StoredNames>;
    const previous = Array.isArray(parsed.previous)
      ? parsed.previous.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      : [];
    const last = typeof parsed.last === "string" ? parsed.last.trim() : "";
    return { last, previous };
  } catch {
    return { last: "", previous: [] };
  }
}

function write(data: StoredNames): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function getRememberedName(): string {
  return read().last;
}

export function getPreviousNames(): string[] {
  return read().previous;
}

export function rememberName(name: string): void {
  const cleaned = name.trim().slice(0, 16);
  if (!cleaned) return;

  const current = read();
  const previous = [
    cleaned,
    ...current.previous.filter((n) => n.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, MAX_NAMES);

  write({ last: cleaned, previous });
}

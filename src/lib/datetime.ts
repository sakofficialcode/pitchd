// Shift/swap timestamps are UTC-anchored wall clock (see server/scheduler.ts's
// parseWallClock), so every member sees the configured hours wherever they are.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// <input type="datetime-local"> works in local wall-clock time, so this must
// format explicitly rather than use toISOString (always UTC).
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

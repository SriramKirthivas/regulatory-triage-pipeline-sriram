import type { Flag, ItemStatus, Severity } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

export function Pill({ status }: { status: ItemStatus }) {
  return <span className={`pill s-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Sev({ value }: { value: Severity }) {
  return <span className={`sev sev-${value}`}>{value === "unknown" ? "unknown" : value}</span>;
}

export function Priority({ value }: { value: number }) {
  // 1 = most urgent, drawn as 5 bars; 5 = least, drawn as 1 bar
  const bars = 6 - value;
  return (
    <span className={`prio p${value}`} title={`Priority ${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= bars ? "on" : ""} />
      ))}
    </span>
  );
}

export function Marks({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  const seen = new Map<string, Flag>();
  flags.forEach((f) => {
    const prev = seen.get(f.code);
    if (!prev || (prev.level === "warn" && f.level === "error")) seen.set(f.code, f);
  });
  return (
    <span className="marks">
      {[...seen.values()].map((f) => (
        <span key={f.code} className={`mark ${f.level}`} title={f.message}>
          {f.code.replace(/_/g, " ")}
        </span>
      ))}
    </span>
  );
}

export function fmtDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`;
}

export function dueClass(d: string | null, status: ItemStatus): string {
  if (!d || status === "resolved") return "due";
  const days = (new Date(d).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "due late";
  if (days < 7) return "due soon";
  return "due";
}

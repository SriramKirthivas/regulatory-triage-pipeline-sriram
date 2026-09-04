import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useRef, useState, type MouseEvent } from "react";
import type { ItemStatus, WritableStatus } from "../lib/types";
import { STATUS_LABEL, WRITABLE } from "../lib/types";

// Mirrors _ALLOWED_TRANSITIONS on the server so the UI can grey out illegal
// moves before the request is sent. The server remains the authority.
const ALLOWED: Record<ItemStatus, WritableStatus[]> = {
  pending: ["in_progress", "blocked", "resolved"],
  in_progress: ["pending", "blocked", "resolved"],
  blocked: ["pending", "in_progress"],
  resolved: ["pending", "in_progress"],
  unknown: ["pending", "in_progress", "blocked", "resolved"],
};

interface Props {
  value: ItemStatus;
  busy: boolean;
  onChange: (next: WritableStatus) => void;
}

export function StatusControl({ value, busy, onChange }: Props) {
  const reduce = useReducedMotion();
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number; i: number } | null>(null);
  const seq = useRef(0);
  const allowed = ALLOWED[value];
  const activeIndex = WRITABLE.indexOf(value as WritableStatus);

  const click = (e: MouseEvent<HTMLButtonElement>, s: WritableStatus, i: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - r.left, y: e.clientY - r.top, k: ++seq.current, i });
    onChange(s);
  };

  return (
    <LayoutGroup>
      <div className={`status-control${busy ? " busy" : ""}`} role="radiogroup" aria-label="Status">
        {activeIndex >= 0 && (
          <motion.span
            className="thumb"
            layout
            style={{ width: `calc((100% - 6px - 6px) / 4)`, left: `calc(3px + ${activeIndex} * ((100% - 6px - 6px) / 4 + 2px))` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
          />
        )}
        {WRITABLE.map((s, i) => {
          const on = s === value;
          const can = on || allowed.includes(s);
          return (
            <motion.button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!can || busy}
              className={`opt ${s}${on ? " on" : ""}`}
              onClick={(e) => !on && click(e, s, i)}
              whileTap={can && !on && !reduce ? { scale: 0.93 } : undefined}
              transition={{ type: "spring", stiffness: 700, damping: 30 }}
            >
              {STATUS_LABEL[s]}
              <kbd>{i + 1}</kbd>
              {ripple && ripple.i === i && !reduce && (
                <motion.span
                  key={ripple.k}
                  className="ripple"
                  style={{ left: ripple.x, top: ripple.y }}
                  initial={{ scale: 0, opacity: 0.35 }}
                  animate={{ scale: 12, opacity: 0 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export function transitionNote(value: ItemStatus): string {
  if (value === "unknown") return "Quarantined: the source status code was unrecognised. Choose the real status to repair it.";
  if (value === "blocked") return "Blocked items go back to Pending or In progress before they can be resolved.";
  if (value === "resolved") return "Reopen by moving to Pending or In progress.";
  return "";
}

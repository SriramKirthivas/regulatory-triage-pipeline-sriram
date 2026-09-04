import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastMsg {
  id: number;
  text: string;
  tone: "ok" | "error" | "info";
  code?: string;
}

const Ctx = createContext<(t: Omit<ToastMsg, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = ++seq.current;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.tone === "error" ? 4200 : 2000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {list.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.tone}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            >
              {t.text}
              {t.code && <span className="t-code">{t.code}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

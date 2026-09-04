import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { api } from "../lib/api";

export function Arrow() {
  return (
    <i className="arrow" aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6h10M6.5 1.5L11 6l-4.5 4.5" />
      </svg>
    </i>
  );
}

export function Btn({ to, children, tone = "", sm = false, onClick }: { to?: string; children: ReactNode; tone?: string; sm?: boolean; onClick?: () => void }) {
  const cls = `btn ${tone}${sm ? " sm" : ""}`;
  const inner = (
    <>
      <span className="label">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      <Arrow />
    </>
  );
  const M = motion(Link);
  if (to)
    return (
      <M to={to} className={cls} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 600, damping: 28 }}>
        {inner}
      </M>
    );
  return (
    <motion.button type="button" className={cls} onClick={onClick} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 600, damping: 28 }}>
      {inner}
    </motion.button>
  );
}

const LINKS = [
  { to: "/", label: "Overview" },
  { to: "/triage", label: "Triage" },
  { to: "/directives", label: "Directives" },
  { to: "/anomalies", label: "Data quality" },
];

export function Nav() {
  const loc = useLocation();
  const s = useQuery({ queryKey: ["anomalies"], queryFn: api.anomalies });
  return (
    <nav className="nav">
      <Link to="/" className="logo">
        <span className="dot" />
        Artixio
      </Link>
      <div className="links">
        {LINKS.map((l) => {
          const on = l.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(l.to);
          return (
            <NavLink key={l.to} to={l.to} className={on ? "on" : ""} end={l.to === "/"}>
              {on && <motion.span layoutId="nav-ink" className="ink" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
              {l.label}
            </NavLink>
          );
        })}
      </div>
      <div className="right">
        {s.data && (
          <div className="live">
            <span>
              <b>{s.data.total_directives}</b> directives
            </span>
            <span>
              <b>{s.data.total_items}</b> items
            </span>
            <span className="hot">
              <b>{s.data.items_with_errors}</b> need review
            </span>
          </div>
        )}
        {loc.pathname !== "/triage" && (
          <Btn to="/triage" tone="amber" sm>
            Open triage
          </Btn>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <h4>Artixio Regulatory Triage</h4>
            <p>A decision layer for compliance teams. Directives from eight regulators, turned into ranked action items, with every data fault the pipeline caught shown in the open.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/triage">Triage</Link></li>
              <li><Link to="/directives">Directives</Link></li>
              <li><Link to="/anomalies">Data quality</Link></li>
            </ul>
          </div>
          <div>
            <h4>Engineering</h4>
            <ul>
              <li><a href="http://localhost:8787/docs" target="_blank" rel="noreferrer">API reference</a></li>
              <li><a href="http://localhost:8787/api/anomalies" target="_blank" rel="noreferrer">Anomaly feed (JSON)</a></li>
              <li><a href="http://localhost:8787/api/health" target="_blank" rel="noreferrer">Health</a></li>
            </ul>
          </div>
          <div>
            <h4>Stack</h4>
            <ul>
              <li>PostgreSQL 16</li>
              <li>FastAPI, SQLAlchemy, Pydantic</li>
              <li>React, Vite, TanStack, Framer Motion</li>
            </ul>
          </div>
        </div>
        <div className="base">
          <span>Technical assignment build, {new Date().getFullYear()}. Mock data only.</span>
          <button className="up" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Back to top
            <i>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 11V1M1.5 5.5L6 1l4.5 4.5" />
              </svg>
            </i>
          </button>
        </div>
      </div>
    </footer>
  );
}

export function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

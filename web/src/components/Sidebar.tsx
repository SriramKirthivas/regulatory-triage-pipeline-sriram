import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { Icons } from "./ui";

/**
 * Primary navigation.
 *
 * Counts live on the nav items themselves, so the operator sees where the work is
 * before choosing a screen — the density argument for not having a landing
 * dashboard whose only job is to show the same numbers.
 */

const PRIMARY = [
  { to: "/updates", label: "Updates", icon: Icons.inbox, count: "directives" },
  { to: "/authorities", label: "Authorities", icon: Icons.building, count: "authorities" },
  { to: "/directives", label: "Directives", icon: Icons.doc, count: "directives" },
  { to: "/action-items", label: "Action Items", icon: Icons.task, count: "openItems" },
  { to: "/data-quality", label: "Data Quality", icon: Icons.alert, count: "flags" },
  { to: "/saved-views", label: "Saved Views", icon: Icons.layers, count: null },
] as const;

const SECONDARY = [
  { to: "/api-health", label: "API Health", icon: Icons.pulse },
  { to: "/settings", label: "Settings", icon: Icons.gear },
] as const;

export function Sidebar() {
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
  });

  const values: Record<string, number | undefined> = {
    directives: counts?.total_directives,
    authorities: counts?.by_authority.length,
    openItems: counts?.open_action_items,
    flags: counts?.flagged_directives,
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-mark">A</div>
        <div className="sidebar-brand-text">
          <strong>Artixio</strong>
          <span>Regulatory Intelligence</span>
        </div>
      </div>

      <div className="sidebar-section">
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const value = item.count ? values[item.count] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <Icon />
              {item.label}
              {value !== undefined && (
                <span className={item.count === "flags" ? "nav-count alert" : "nav-count"}>
                  {value}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        {SECONDARY.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <Icon />
              {item.label}
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-foot">
        <span className={`dot ${health?.status === "ok" ? "ok" : health ? "bad" : ""}`} />
        {health
          ? `API ${health.status} · ${health.latency_ms ?? "–"} ms`
          : "Checking API…"}
        <br />
        <span style={{ opacity: 0.7 }}>v{health?.version ?? "—"}</span>
      </div>
    </aside>
  );
}

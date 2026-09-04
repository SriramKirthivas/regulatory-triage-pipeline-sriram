import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, EMPTY_UPDATE_FILTERS } from "../api";
import { Icons } from "./ui";

/**
 * Top navigation.
 *
 * Two bands: identity and global tools on the upper row, section navigation on
 * the lower one. Horizontal nav suits this product better than a rail — there
 * are only eight destinations, and giving the full width to content matters more
 * when the content is a wide record list.
 *
 * Counts sit on the nav items themselves, so where the work is stays visible
 * from every screen.
 */

const PRIMARY = [
  { to: "/updates", label: "Updates", icon: Icons.inbox, count: "directives" },
  { to: "/authorities", label: "Authorities", icon: Icons.building, count: "authorities" },
  { to: "/directives", label: "Directives", icon: Icons.doc, count: "directives" },
  { to: "/action-items", label: "Action Items", icon: Icons.task, count: "openItems" },
  { to: "/data-quality", label: "Data Quality", icon: Icons.alert, count: "flags" },
  { to: "/saved-views", label: "Saved Views", icon: Icons.layers, count: null },
] as const;

export function TopNav() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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

  const submitSearch = () => {
    const term = query.trim();
    if (!term) return;
    navigate("/updates", { state: { filters: { ...EMPTY_UPDATE_FILTERS, q: term } } });
    setQuery("");
  };

  return (
    <header className="topnav">
      <div className="topnav-main">
        <NavLink to="/updates" className="topnav-brand">
          <span className="topnav-mark">A</span>
          <span className="topnav-brand-text">
            <strong>Artixio</strong>
            <span>Regulatory Intelligence</span>
          </span>
        </NavLink>

        <div className="topnav-search">
          <Icons.search />
          <input
            value={query}
            placeholder="Search updates, references, owners…"
            aria-label="Search regulatory records"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          />
        </div>

        <div className="topnav-utils">
          <span className="healthchip" title={`API ${health?.status ?? "checking"}`}>
            <span className={`dot ${health?.status === "ok" ? "ok" : health ? "bad" : ""}`} />
            {health ? `API ${health.status}` : "Checking…"}
            {health?.latency_ms != null && (
              <span className="healthchip-ms">{health.latency_ms}ms</span>
            )}
          </span>
          <NavLink
            to="/api-health"
            className={({ isActive }) => (isActive ? "iconbtn active" : "iconbtn")}
            title="API Health"
            aria-label="API Health"
          >
            <Icons.pulse />
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? "iconbtn active" : "iconbtn")}
            title="Settings"
            aria-label="Settings"
          >
            <Icons.gear />
          </NavLink>
        </div>
      </div>

      <nav className="topnav-links" aria-label="Sections">
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const value = item.count ? values[item.count] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "navpill active" : "navpill")}
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
      </nav>
    </header>
  );
}

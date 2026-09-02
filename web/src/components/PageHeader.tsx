import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Page header.
 *
 * `eyebrow` renders the small monospace register line above the title — it names
 * what the screen *is* in the system's own vocabulary, which is the detail that
 * makes this read as an institutional register rather than a web dashboard.
 * `breadcrumb` occupies the same slot on detail screens, where the trail back is
 * more useful than a restatement of the section.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  subtitle?: string;
  eyebrow?: string;
  breadcrumb?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div style={{ minWidth: 0 }}>
        {breadcrumb ? (
          <div className="crumb">
            {breadcrumb.map((crumb, index) => (
              <span key={index}>
                {index > 0 && " / "}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
              </span>
            ))}
          </div>
        ) : (
          eyebrow && <div className="crumb">{eyebrow}</div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="pagehead-actions">{actions}</div>}
    </header>
  );
}

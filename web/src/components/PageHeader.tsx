import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  subtitle?: string;
  breadcrumb?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && (
          <div className="crumb">
            {breadcrumb.map((crumb, index) => (
              <span key={index}>
                {index > 0 && " / "}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="pagehead-actions">{actions}</div>}
    </header>
  );
}

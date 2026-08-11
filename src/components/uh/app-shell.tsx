import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/command-center", label: "Command Center" },
  { to: "/triage/new", label: "Triage Intake" },
  { to: "/hospital/h1", label: "Hospital Ops" },
  { to: "/ambulance/u1", label: "Ambulance" },
  { to: "/reunify", label: "Reunification" },
] as const;

export function AppShell({
  role,
  title,
  subtitle,
  actions,
  children,
}: {
  role: string;
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <Activity className="h-5 w-5" aria-hidden />
            <span className="font-display text-lg font-semibold tracking-tight">UrHealth</span>
          </Link>
          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-1.5 text-sm/6 opacity-75 transition-opacity hover:opacity-100"
                activeProps={{ className: "bg-sidebar-accent opacity-100" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="shrink-0 rounded-full border border-sidebar-border px-3 py-1 text-xs uppercase tracking-wider opacity-90">
              {role}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

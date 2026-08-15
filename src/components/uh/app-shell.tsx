import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, Home, LogOut, User } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth-context";

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
  const { user, isPublicAuth, isStaffAuth, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  // Build role-scoped navigation tabs for staff sessions
  const staffNav: { to: string; label: string }[] = [];
  if (isStaffAuth && user) {
    if (user.role === "district_admin") {
      staffNav.push(
        { to: "/command-center", label: "Command Center" },
        { to: "/staff/manage", label: "Manage Staff" },
        { to: "/audit-logs", label: "Audit Logs" },
        { to: "/triage/new", label: "Triage Intake" },
        { to: "/hospital/h1", label: "Hospital Ops" },
        { to: "/ambulance/u1", label: "Ambulance" }
      );
    } else if (user.role === "hospital_coordinator") {
      staffNav.push({
        to: `/hospital/${user.hospital_id || "h1"}`,
        label: "My Hospital Ops",
      });
    } else if (user.role === "triage_staff") {
      staffNav.push({ to: "/triage/new", label: "Triage Intake" });
    } else if (user.role === "ambulance_crew") {
      staffNav.push({
        to: `/ambulance/${user.unit_id || "u1"}`,
        label: "Ambulance Console",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
            <span className="font-display text-lg font-semibold tracking-tight text-white">UrHealth</span>
          </Link>

          {/* High-visibility Home Redirect Button with Teal Green Theme */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-emerald-950 shadow-sm hover:bg-emerald-50 hover:text-emerald-900 transition-all border border-emerald-200"
          >
            <Home className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
            <span>Home</span>
          </Link>

          {/* PUBLIC SURFACE NAVBAR: No operational tabs */}
          {isPublicAuth && (
            <nav className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto md:flex">
              <Link
                to="/reunify"
                className="rounded-md px-3 py-1.5 text-sm/6 font-medium bg-sidebar-accent text-white"
              >
                Family Re-Unification
              </Link>
            </nav>
          )}

          {/* STAFF SURFACE NAVBAR: Only role-scoped tabs */}
          {isStaffAuth && (
            <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
              {staffNav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className="rounded-md px-3 py-1.5 text-sm/6 opacity-85 text-white transition-opacity hover:opacity-100"
                  activeProps={{ className: "bg-sidebar-accent opacity-100 font-medium text-white" }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right Header User Info & Action */}
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-950/60 px-3 py-1 text-xs font-medium text-emerald-100">
                  <User className="h-3.5 w-3.5 text-emerald-300" />
                  <span>{user.name || user.username || user.email}</span>
                  <span className="opacity-70 font-mono text-[10px]">({user.role})</span>
                </span>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-rose-500/20 hover:text-rose-200 transition-colors border border-emerald-400/20"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-100">
                {role}
              </span>
            )}
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

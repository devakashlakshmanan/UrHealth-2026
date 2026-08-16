import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Ambulance, Building2, ClipboardPlus, HeartPulse, Radar, Search, ShieldCheck, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UrHealth — Emergency Orchestration & Family Re-Unification" },
      {
        name: "description",
        content:
          "Pre-arrival ambulance-to-hospital routing with Golden Hour bed locks, live network capacity, and a public family re-unification portal.",
      },
      { property: "og:title", content: "UrHealth — Emergency Orchestration & Family Re-Unification" },
      {
        property: "og:description",
        content: "Route ambulances before arrival, lock beds, and reunite families with one tracking ID.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, isStaffAuth } = useAuth();

  const commandCenterTarget = isStaffAuth && user
    ? user.role === "district_admin"
      ? "/command-center"
      : user.role === "hospital_coordinator"
      ? `/hospital/${user.hospital_id || "h1"}`
      : user.role === "triage_staff"
      ? "/triage/new"
      : `/ambulance/${user.unit_id || "u1"}`
    : "/staff/login";

  return (
    <div className="min-h-screen bg-background">
      <section className="command-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex items-center justify-between opacity-90">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" aria-hidden />
              <span className="font-display text-lg font-semibold">UrHealth</span>
            </div>
            {user ? (
              <span className="flex items-center gap-1.5 rounded-full border border-sidebar-border bg-sidebar-accent/80 px-3 py-1 text-xs font-semibold">
                <UserCheck className="h-3.5 w-3.5 text-primary" /> Active Session: {user.name || user.email} ({user.role})
              </span>
            ) : null}
          </div>
          <h1 className="mt-8 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Beds are locked before the ambulance moves.
          </h1>
          <p className="mt-5 max-w-2xl text-base opacity-85 sm:text-lg">
            Smart emergency orchestration for mass casualty incidents — predictive ambulance-to-hospital routing with a
            Golden Hour bed lock, and a family re-unification portal fed by the same record.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={commandCenterTarget as any}
              className="rounded-md bg-primary-foreground px-5 py-2.5 text-sm font-semibold text-primary-deep transition-opacity hover:opacity-90 flex items-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" /> Open Command Center
            </Link>
            <Link
              to="/reunify"
              className="rounded-md border border-sidebar-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent flex items-center gap-2"
            >
              <Search className="h-4 w-4" /> Find a family member
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Public Surface</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/reunify" className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)] border-primary/30">
              <Search className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">Public Surface — Google Auth Required</p>
              <h3 className="mt-1 text-lg font-semibold">Re-Unification Portal</h3>
              <p className="mt-2 text-sm text-muted-foreground">Search patient status with low-friction Google Identity. Audited identity search without passwords.</p>
            </Link>
          </div>
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Staff Operational Consoles (Provisioned Login)</h2>
            <Link to="/staff/login" className="text-xs text-primary font-semibold hover:underline">
              Go to Staff Login →
            </Link>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Link to="/command-center" className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <Radar className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">District Admin</p>
              <h3 className="mt-1 text-base font-semibold">Command Center</h3>
              <p className="mt-2 text-xs text-muted-foreground">Declare an MCI, watch network-wide capacity, read AI shortfall forecasts.</p>
            </Link>

            <Link to="/triage/new" className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <ClipboardPlus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Triage Staff</p>
              <h3 className="mt-1 text-base font-semibold">Triage Intake</h3>
              <p className="mt-2 text-xs text-muted-foreground">Log a patient at the scene and generate a tracking ID instantly.</p>
            </Link>

            <Link to="/hospital/$hospitalId" params={{ hospitalId: "h1" }} className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <Building2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Hospital Coordinator</p>
              <h3 className="mt-1 text-base font-semibold">Hospital Ops Console</h3>
              <p className="mt-2 text-xs text-muted-foreground">Incoming assignments, confirm or reject holds, edit local resource counts.</p>
            </Link>

            <a
              href="https://urhealth-2025.onrender.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)] block cursor-pointer"
            >
              <HeartPulse className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Hospital Management</p>
              <h3 className="mt-1 text-base font-semibold">Advanced Emergency Console</h3>
              <p className="mt-2 text-xs text-muted-foreground">Manage ICU beds, emergency patients, resources, AI predictions, and critical alerts in one unified console.</p>
            </a>

            <Link to="/ambulance/$unitId" params={{ unitId: "u1" }} className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <Ambulance className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Ambulance Crew</p>
              <h3 className="mt-1 text-base font-semibold">Ambulance Field View</h3>
              <p className="mt-2 text-xs text-muted-foreground">Assigned hospital, ETA countdown, hold status, patient tracking ID.</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

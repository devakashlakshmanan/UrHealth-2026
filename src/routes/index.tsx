import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Ambulance, Building2, ClipboardPlus, Radar, Search } from "lucide-react";

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

const ENTRIES = [
  {
    to: "/command-center",
    icon: Radar,
    title: "Command Center",
    role: "District Admin",
    desc: "Declare an MCI, watch network-wide capacity, read AI shortfall forecasts.",
  },
  {
    to: "/triage/new",
    icon: ClipboardPlus,
    title: "Triage Intake",
    role: "Triage Staff",
    desc: "Log a patient at the scene and generate a tracking ID instantly.",
  },
  {
    to: "/hospital/h1",
    icon: Building2,
    title: "Hospital Ops Console",
    role: "Coordinator",
    desc: "Incoming assignments, confirm or reject holds, edit local resource counts.",
  },
  {
    to: "/ambulance/u1",
    icon: Ambulance,
    title: "Ambulance Field View",
    role: "Crew",
    desc: "Assigned hospital, ETA countdown, hold status, patient tracking ID.",
  },
  {
    to: "/reunify",
    icon: Search,
    title: "Re-Unification Portal",
    role: "Public — no login",
    desc: "Search by tracking ID or description. Status only, never medical detail.",
  },
] as const;

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <section className="command-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex items-center gap-2 opacity-90">
            <Activity className="h-5 w-5" aria-hidden />
            <span className="font-display text-lg font-semibold">UrHealth</span>
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
              to="/command-center"
              className="rounded-md bg-primary-foreground px-5 py-2.5 text-sm font-semibold text-primary-deep transition-opacity hover:opacity-90"
            >
              Open Command Center
            </Link>
            <Link
              to="/reunify"
              className="rounded-md border border-sidebar-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent"
            >
              Find a family member
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Choose your console</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENTRIES.map((e) => (
            <Link key={e.to} to={e.to} className="panel group p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <e.icon className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{e.role}</p>
              <h3 className="mt-1 text-lg font-semibold">{e.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{e.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

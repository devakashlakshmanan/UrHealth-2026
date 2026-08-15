import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeft, ShieldCheck, Home } from "lucide-react";
import { api } from "@/lib/api";
import { PublicAuthRoute } from "@/components/uh/route-guards";

export const Route = createFileRoute("/reunify/$trackingId")({
  head: () => ({
    meta: [
      { title: "Patient Status — UrHealth Re-Unification" },
      { name: "description", content: "Public status page for a tracking ID: current hospital and admission status only." },
      { property: "og:title", content: "Patient Status — UrHealth Re-Unification" },
      { property: "og:description", content: "Status-only lookup, updated automatically as the patient is routed and admitted." },
    ],
  }),
  component: TrackingStatusGuarded,
});

const STEPS = ["dispatched", "en_route", "admitted"] as const;
const STEP_LABEL: Record<string, string> = {
  dispatched: "Assigned to hospital",
  en_route: "En route",
  admitted: "Admitted",
};

function TrackingStatusGuarded() {
  return (
    <PublicAuthRoute>
      <TrackingStatus />
    </PublicAuthRoute>
  );
}

function TrackingStatus() {
  const { trackingId } = Route.useParams();
  const q = useQuery({
    queryKey: ["tracking", trackingId],
    queryFn: () => api.lookupTracking(trackingId),
    refetchInterval: 15_000,
  });

  const r = q.data;
  const stepIndex = r ? STEPS.indexOf(r.status as (typeof STEPS)[number]) : -1;

  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/reunify" className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
              <span className="font-display text-lg font-semibold text-white">UrHealth</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-emerald-950 shadow-sm hover:bg-emerald-50 hover:text-emerald-900 transition-all border border-emerald-200"
            >
              <Home className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
              <span>Home</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link to="/reunify" className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline font-semibold">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to search
        </Link>

        <div className="panel mt-6 p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tracking ID</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.16em] text-primary">{trackingId.toUpperCase()}</p>

          {q.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Looking up…</p> : null}

          {!q.isLoading && !r ? (
            <p className="mt-6 rounded-md bg-muted p-4 text-sm text-muted-foreground">
              No record found for this ID yet. If it was just issued, this page will update automatically.
            </p>
          ) : null}

          {r ? (
            <>
              <div className="mt-6 rounded-lg bg-primary-soft p-5">
                <p className="text-sm text-muted-foreground font-medium">Current status</p>
                <p className="mt-1 text-xl font-semibold text-primary-deep">
                  {r.status === "admitted" ? "Admitted" : r.status === "en_route" ? "En route" : "Assigned — en route"}
                  {r.hospital_name ? ` · ${r.hospital_name}` : ""}
                </p>
                {r.hospital_address ? <p className="mt-1 text-sm text-muted-foreground">{r.hospital_address}</p> : null}
              </div>

              <ol className="mt-6 space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={
                        i <= stepIndex
                          ? "h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                          : "h-2.5 w-2.5 shrink-0 rounded-full bg-border"
                      }
                    />
                    <span className={i <= stepIndex ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                      {STEP_LABEL[s]}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-6 text-sm text-muted-foreground">
                Picked up near {r.pickup_area}. For any further information, please contact the hospital front desk in
                person.
              </p>
            </>
          ) : null}
        </div>

        <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          Medical details are never shown on this page. Search identity is logged for audit compliance.
        </p>
      </main>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/reunify/")({
  head: () => ({
    meta: [
      { title: "Find a Loved One — UrHealth Re-Unification" },
      { name: "description", content: "Search by tracking ID or description to find where a person has been taken during an emergency. No login required." },
      { property: "og:title", content: "Find a Loved One — UrHealth Re-Unification" },
      { property: "og:description", content: "Status-only public search across every hospital in the network." },
    ],
  }),
  component: Reunify,
});

const STATUS_TEXT: Record<string, string> = {
  dispatched: "Assigned — en route",
  en_route: "En route",
  admitted: "Admitted",
  discharged: "Discharged — contact hospital front desk",
};

function Reunify() {
  const [tracking, setTracking] = useState("");
  const [filters, setFilters] = useState({ age_range: "any", gender: "any", area: "" });
  const [query, setQuery] = useState<Record<string, string> | null>(null);

  // Public portal polls (15s) instead of using the WebSocket channel.
  const results = useQuery({
    queryKey: ["public-search", query],
    queryFn: () => api.searchPatients(query ?? {}),
    enabled: Boolean(query),
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="h-5 w-5" aria-hidden />
            <span className="font-display text-lg font-semibold">UrHealth</span>
          </Link>
          <span className="ml-auto text-xs opacity-85">Public portal · no login needed</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">Find a loved one</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          If you were given a tracking ID, enter it below. Otherwise search by description. We show location and status
          only — for anything else, please contact the hospital front desk.
        </p>

        <div className="panel mt-8 p-5">
          <Label htmlFor="tid">Tracking ID</Label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="tid"
              value={tracking}
              maxLength={12}
              placeholder="UH-XXXXXX"
              onChange={(e) => setTracking(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
            <Button onClick={() => setQuery({ tracking_id: tracking })} disabled={!tracking.trim()}>
              <Search className="mr-2 h-4 w-4" aria-hidden /> Search
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or search by description <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Approximate age</Label>
              <Select value={filters.age_range} onValueChange={(v) => setFilters((f) => ({ ...f, age_range: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["any", "0-12", "13-17", "18-30", "31-45", "46-60", "60+"].map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={filters.gender} onValueChange={(v) => setFilters((f) => ({ ...f, gender: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["any", "male", "female", "other", "unknown"].map((g) => (
                    <SelectItem key={g} value={g} className="capitalize">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="area">Area last seen</Label>
              <Input
                id="area"
                value={filters.area}
                maxLength={80}
                placeholder="Coastal Expressway"
                onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}
                className="mt-1.5"
              />
            </div>
          </div>
          <Button variant="outline" className="mt-4" onClick={() => setQuery({ ...filters })}>
            Search by description
          </Button>
        </div>

        {query ? (
          <section className="mt-8">
            <h2 className="text-base font-semibold">
              {results.isFetching ? "Searching…" : `${results.data?.length ?? 0} match${results.data?.length === 1 ? "" : "es"}`}
            </h2>
            <div className="mt-4 space-y-3">
              {(results.data ?? []).map((r) => (
                <Link
                  key={r.tracking_id}
                  to="/reunify/$trackingId"
                  params={{ trackingId: r.tracking_id }}
                  className="panel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-primary">{r.tracking_id}</p>
                    <p className="mt-1 truncate text-sm">
                      {STATUS_TEXT[r.status]}
                      {r.hospital_name ? ` — ${r.hospital_name}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.age_range} · {r.gender} · picked up near {r.pickup_area}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-primary">View</span>
                </Link>
              ))}
              {!results.isFetching && results.data?.length === 0 ? (
                <p className="panel p-5 text-sm text-muted-foreground">
                  No match yet. Records appear as soon as a triage team logs the person — try again shortly, this page
                  refreshes automatically.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <p className="mt-10 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          Privacy: this portal never displays medical details, injuries, or contact information. Hospital front desks
          remain the human handoff point.
        </p>
      </main>
    </div>
  );
}

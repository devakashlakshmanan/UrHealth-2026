import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/uh/app-shell";
import { Countdown, HoldBadge, SeverityBadge, StatCard } from "@/components/uh/badges";
import { api, useNetworkChannel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/hospital/$hospitalId")({
  head: () => ({
    meta: [
      { title: "Hospital Ops Console — UrHealth" },
      { name: "description", content: "Incoming ambulance assignments, Golden Hour bed holds, and manual resource counts for coordinators." },
      { property: "og:title", content: "Hospital Ops Console — UrHealth" },
      { property: "og:description", content: "Confirm arrivals, reject and auto-reroute, and keep bed counts current." },
    ],
  }),
  component: HospitalConsole,
});

const FIELDS = [
  { key: "available_beds", label: "Available beds" },
  { key: "icu_available", label: "ICU available" },
  { key: "ot_available", label: "OT slots free" },
] as const;

function HospitalConsole() {
  const { hospitalId } = Route.useParams();
  useNetworkChannel();

  const hospital = useQuery({ queryKey: ["hospital", hospitalId], queryFn: () => api.getHospital(hospitalId) });
  const holds = useQuery({ queryKey: ["holds"], queryFn: api.getHolds });
  const patients = useQuery({ queryKey: ["patients"], queryFn: api.getPatients });

  const confirm = useMutation({
    mutationFn: (holdId: string) => api.confirmArrival(holdId),
    onSuccess: () => toast.success("Arrival confirmed — hold converted to admission"),
  });
  const reject = useMutation({
    mutationFn: (holdId: string) => api.rejectHold(holdId),
    onSuccess: (res) =>
      toast.info("Re-routed", {
        description: res ? `Patient reassigned to ${res.hospital.name}` : "No alternative hospital available",
      }),
  });
  const update = useMutation({
    mutationFn: (patch: Record<string, number>) => api.updateResources(hospitalId, patch),
    onSuccess: () => toast.success("Resource counts published to network"),
  });

  const h = hospital.data;
  const incoming = (holds.data ?? []).filter((x) => x.hospital_id === hospitalId && x.status === "active");
  const admitted = (holds.data ?? []).filter((x) => x.hospital_id === hospitalId && x.status === "confirmed");

  if (!h) {
    return (
      <AppShell role="Coordinator" title="Hospital not found">
        <Link to="/command-center" className="text-primary underline-offset-4 hover:underline">
          Back to command center
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell role="Coordinator" title={h.name} subtitle={h.address}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Beds free" value={h.available_beds} hint={`of ${h.total_beds}`} />
        <StatCard label="ICU free" value={h.icu_available} hint={`of ${h.icu_total}`} />
        <StatCard label="OT free" value={h.ot_available} hint={`of ${h.ot_total}`} />
        <StatCard label="Incoming" value={incoming.length} hint={`${admitted.length} admitted this incident`} />
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-base font-semibold">Incoming assignments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm on arrival, or reject to re-run best-fit routing excluding this hospital.
        </p>
        <div className="mt-4 space-y-3">
          {incoming.length === 0 ? (
            <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">No active holds. Waiting on dispatch.</p>
          ) : null}
          {incoming.map((hold) => {
            const p = (patients.data ?? []).find((x) => x.id === hold.patient_id);
            return (
              <div key={hold.id} className="rounded-lg border border-border p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">{p?.tracking_id}</span>
                      {p ? <SeverityBadge severity={p.severity} /> : null}
                      <HoldBadge status={hold.status} />
                    </div>
                    <p className="mt-2 truncate text-sm text-muted-foreground">
                      {hold.resource_label} held · pickup {p?.pickup_area} · {p?.suspected_condition || "condition unspecified"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Hold expires</p>
                    <Countdown to={hold.expires_at} className="text-lg font-semibold" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => confirm.mutate(hold.id)}>
                    Confirm arrival
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reject.mutate(hold.id)}>
                    Cannot accept — re-route
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="text-base font-semibold">Local resource editor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual counts — no EMR integration required. Changes publish to the network instantly.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            update.mutate(
              Object.fromEntries(FIELDS.map((f) => [f.key, Math.max(0, Number(fd.get(f.key) ?? 0))])) as Record<string, number>,
            );
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input id={f.key} name={f.key} type="number" min={0} defaultValue={h[f.key]} className="mt-1.5" />
            </div>
          ))}
          <div className="sm:col-span-3">
            <Button type="submit" disabled={update.isPending}>
              Publish counts
            </Button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}

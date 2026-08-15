import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AlertTriangle, Radio } from "lucide-react";
import { AppShell } from "@/components/uh/app-shell";
import { Countdown, HoldBadge, SeverityBadge, StatCard } from "@/components/uh/badges";
import { api, useNetworkChannel } from "@/lib/api";
import type { Hospital, ResourceType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StaffRoute } from "@/components/uh/route-guards";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export const Route = createFileRoute("/command-center")({
  head: () => ({
    meta: [
      { title: "Command Center — UrHealth Orchestration" },
      { name: "description", content: "Declare incidents, watch live network capacity, and read AI shortfall forecasts across every hospital." },
      { property: "og:title", content: "Command Center — UrHealth Orchestration" },
      { property: "og:description", content: "Network-wide bed, ICU and OT status with predictive saturation flags." },
    ],
  }),
  component: CommandCenterGuarded,
});

function occupancyPct(h: Hospital) {
  return Math.round(((h.total_beds - h.available_beds) / h.total_beds) * 100);
}

function CommandCenterGuarded() {
  return (
    <StaffRoute allowedRoles={["district_admin"]}>
      <CommandCenter />
    </StaffRoute>
  );
}

function CommandCenter() {
  useNetworkChannel();
  const [resource, setResource] = useState<ResourceType>("icu");

  // Modal State for Declare Incident
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<"MCI" | "disaster" | "pandemic">("MCI");
  const [label, setLabel] = useState("");
  const [severity, setSeverity] = useState<number>(4);

  const network = useQuery({ queryKey: ["network"], queryFn: api.getNetworkStatus });
  const holds = useQuery({ queryKey: ["holds"], queryFn: api.getHolds });
  const patients = useQuery({ queryKey: ["patients"], queryFn: api.getPatients });
  const units = useQuery({ queryKey: ["units"], queryFn: api.getUnits });
  const predictions = useQuery({ queryKey: ["predictions"], queryFn: api.getPredictions });

  const declare = useMutation({
    mutationFn: (input: { type: "MCI" | "disaster" | "pandemic"; label: string; severity_estimate: number }) =>
      api.declareIncident(input),
    onSuccess: (inc) => {
      toast.warning(`${inc.type} declared`, { description: `Broadcast to all network hospitals · ${inc.id}` });
      setIsModalOpen(false);
      setLabel("");
      network.refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to declare incident");
    },
  });

  const hospitals = network.data?.hospitals ?? [];
  const incidents = network.data?.incidents ?? [];
  const activeHolds = (holds.data ?? []).filter((h) => h.status === "active");
  const preds = predictions.data ?? [];

  const chartData = (preds.find((p) => p.hospital_id === hospitals[0]?.id && p.resource_type === resource)?.series ?? []).map(
    (s, i) => ({
      t: s.t,
      ...Object.fromEntries(
        hospitals.map((h) => [
          h.name,
          preds.find((p) => p.hospital_id === h.id && p.resource_type === resource)?.series[i]?.projected ?? 0,
        ]),
      ),
    }),
  );

  const totals = hospitals.reduce(
    (acc, h) => ({
      beds: acc.beds + h.available_beds,
      icu: acc.icu + h.icu_available,
      ot: acc.ot + h.ot_available,
    }),
    { beds: 0, icu: 0, ot: 0 },
  );

  return (
    <AppShell
      role="District Admin"
      title="Orchestration dashboard"
      subtitle="Live network capacity, predicted shortfalls, and active ambulance assignments."
      actions={
        <Button variant="destructive" onClick={() => setIsModalOpen(true)}>
          <AlertTriangle className="mr-2 h-4 w-4" aria-hidden /> Declare Emergency Incident
        </Button>
      }
    >

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available beds" value={totals.beds} hint={`${hospitals.length} hospitals in network`} />
        <StatCard label="ICU available" value={totals.icu} />
        <StatCard label="OT slots" value={totals.ot} />
        <StatCard label="Active holds" value={activeHolds.length} hint="Golden Hour locks in force" />
      </div>

      {incidents[0] ? (
        <div className="panel mt-6 flex items-start gap-3 border-l-4 border-l-critical p-4">
          <span className="pulse-dot mt-1.5 block h-2 w-2 shrink-0 rounded-full bg-critical text-critical" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {incidents[0].type} active · severity {incidents[0].severity_estimate}/5
            </p>
            <p className="truncate text-sm text-muted-foreground">{incidents[0].label}</p>
          </div>
        </div>
      ) : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="panel p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="truncate text-base font-semibold">Hospital network status</h2>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className="h-3.5 w-3.5 text-primary" aria-hidden /> live via /ws/network
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {hospitals.map((h) => {
              const pred = preds.find((p) => p.hospital_id === h.id && p.resource_type === resource);
              const saturating = Boolean(pred?.predicted_shortfall_at);
              const pct = occupancyPct(h);
              return (
                <Link
                  key={h.id}
                  to="/hospital/$hospitalId"
                  params={{ hospitalId: h.id }}
                  className={cn(
                    "rounded-lg border p-4 transition-colors hover:bg-muted/50",
                    saturating ? "border-warning bg-warning/10" : "border-border",
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <p className="truncate font-semibold">{h.name}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        pct > 85 ? "bg-critical text-critical-foreground" : pct > 65 ? "bg-warning text-warning-foreground" : "bg-stable/20 text-stable-foreground",
                      )}
                    >
                      {pct}% full
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Beds</dt>
                      <dd className="font-mono">{h.available_beds}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ICU</dt>
                      <dd className="font-mono">{h.icu_available}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">OT</dt>
                      <dd className="font-mono">{h.ot_available}</dd>
                    </div>
                  </dl>
                  <p className={cn("mt-3 text-xs", saturating ? "text-warning-foreground" : "text-muted-foreground")}>
                    {saturating
                      ? `Predicted ${resource.toUpperCase()} shortfall by ${new Date(pred!.predicted_shortfall_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${Math.round(pred!.confidence * 100)}% conf.`
                      : `No ${resource.toUpperCase()} shortfall forecast in window`}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="truncate text-base font-semibold">Predicted availability</h2>
            <div className="flex shrink-0 gap-1">
              {(["bed", "icu", "ot"] as ResourceType[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setResource(r)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium uppercase transition-colors",
                    resource === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {hospitals.slice(0, 5).map((h, i) => (
                  <Area
                    key={h.id}
                    type="monotone"
                    dataKey={h.name}
                    stroke={`var(--chart-${i + 1})`}
                    fill={`var(--chart-${i + 1})`}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Forecasts feed the routing algorithm directly — hospitals predicted to saturate before ETA are deprioritised.
          </p>
        </div>
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="text-base font-semibold">Ambulance tracker</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Unit</th>
                <th className="py-2 pr-4 font-medium">Tracking ID</th>
                <th className="py-2 pr-4 font-medium">Severity</th>
                <th className="py-2 pr-4 font-medium">Assigned hospital</th>
                <th className="py-2 pr-4 font-medium">Hold</th>
                <th className="py-2 pr-4 font-medium">Expires in</th>
              </tr>
            </thead>
            <tbody>
              {(units.data ?? []).map((u) => {
                const patient = (patients.data ?? []).find((p) => p.id === u.assigned_patient_id);
                const hold = (holds.data ?? []).find((h) => h.patient_id === u.assigned_patient_id && h.status !== "released");
                const hospital = hospitals.find((h) => h.id === patient?.assigned_hospital_id);
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-mono">{u.unit_code}</td>
                    <td className="py-3 pr-4 font-mono">{patient?.tracking_id ?? "—"}</td>
                    <td className="py-3 pr-4">{patient ? <SeverityBadge severity={patient.severity} /> : "—"}</td>
                    <td className="py-3 pr-4">{hospital?.name ?? "Unassigned"}</td>
                    <td className="py-3 pr-4">{hold ? <HoldBadge status={hold.status} /> : "—"}</td>
                    <td className="py-3 pr-4">{hold && hold.status === "active" ? <Countdown to={hold.expires_at} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!patients.data?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No patients logged yet — create one from the{" "}
            <Link to="/triage/new" className="font-medium text-primary underline-offset-4 hover:underline">
              triage intake form
            </Link>
            .
          </p>
        ) : null}
      </section>

      {/* Declare Incident Confirmation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Declare Network Emergency Incident
            </DialogTitle>
            <DialogDescription>
              Declaring an incident broadcasts an active alert across every hospital and ambulance unit in the network.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) {
                toast.error("Please enter an incident description label");
                return;
              }
              declare.mutate({
                type: incidentType,
                label: label.trim(),
                severity_estimate: severity,
              });
            }}
            className="space-y-4 py-2"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incident Type
              </label>
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value as any)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="MCI">MCI (Mass Casualty Incident)</option>
                <option value="disaster">Natural / Industrial Disaster</option>
                <option value="pandemic">Pandemic / Health Surge</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incident Description / Label
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe the nature, location, and details of the incident..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estimated Severity Level (1 – 5)
              </label>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setSeverity(lvl)}
                    className={cn(
                      "flex-1 rounded-md py-2 text-sm font-semibold border transition-all",
                      severity === lvl
                        ? "bg-destructive text-destructive-foreground border-destructive"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    )}
                  >
                    Level {lvl}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={declare.isPending}>
                {declare.isPending ? "Broadcasting..." : "Confirm & Declare Incident"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );

}

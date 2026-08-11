import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Printer } from "lucide-react";
import { AppShell } from "@/components/uh/app-shell";
import { SeverityBadge } from "@/components/uh/badges";
import { api, useNetworkChannel } from "@/lib/api";
import type { Severity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/triage/new")({
  head: () => ({
    meta: [
      { title: "Triage Intake — UrHealth" },
      { name: "description", content: "Log a patient at the point of pickup and generate a public tracking ID instantly." },
      { property: "og:title", content: "Triage Intake — UrHealth" },
      { property: "og:description", content: "Scene-side patient logging with instant tracking ID and auto-routing." },
    ],
  }),
  component: TriageIntake,
});

const SEVERITIES: { value: Severity; label: string; help: string }[] = [
  { value: "red", label: "Red", help: "Immediate · ICU" },
  { value: "yellow", label: "Yellow", help: "Delayed · OT" },
  { value: "green", label: "Green", help: "Minor · Ward" },
  { value: "black", label: "Black", help: "Expectant" },
];

const AGE_RANGES = ["0-12", "13-17", "18-30", "31-45", "46-60", "60+"];

function TriageIntake() {
  useNetworkChannel();
  const navigate = useNavigate();
  const [severity, setSeverity] = useState<Severity>("red");
  const [form, setForm] = useState({
    name: "",
    age_range: "18-30",
    gender: "unknown",
    identifying_marks: "",
    suspected_condition: "",
    pickup_location: "18.9982, 72.8611 · Coastal Expressway KM 14",
    pickup_area: "Coastal Expressway",
  });
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.createPatient>> | null>(null);

  const create = useMutation({
    mutationFn: () => api.createPatient({ ...form, severity }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Tracking ID ${res.patient.tracking_id} generated`, {
        description: res.assignment
          ? `Routed to ${res.assignment.hospital.name} · ETA ${res.assignment.eta_minutes} min`
          : "No hospital with matching capacity — escalate to command",
      });
    },
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AppShell
      role="Triage Staff"
      title="Triage intake"
      subtitle="Submitting creates the patient record, issues a public tracking ID, and triggers routing before pickup."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <form
          className="panel space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <Label className="mb-2 block">Triage severity</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-colors",
                    severity === s.value ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.help}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name (leave blank if unidentified)</Label>
              <Input id="name" value={form.name} maxLength={100} onChange={(e) => set("name")(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Age range</Label>
              <Select value={form.age_range} onValueChange={set("age_range")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGE_RANGES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={set("gender")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["male", "female", "other", "unknown"].map((g) => (
                    <SelectItem key={g} value={g} className="capitalize">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cond">Suspected condition</Label>
              <Input
                id="cond"
                value={form.suspected_condition}
                maxLength={140}
                placeholder="Blunt chest trauma"
                onChange={(e) => set("suspected_condition")(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="marks">Visible identifying marks</Label>
            <Textarea
              id="marks"
              value={form.identifying_marks}
              maxLength={300}
              placeholder="Blue jacket, scar on left forearm"
              onChange={(e) => set("identifying_marks")(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="loc">Pickup location (geo-tagged)</Label>
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{form.pickup_location}</span>
              </div>
            </div>
            <div>
              <Label htmlFor="area">Area (used by family search)</Label>
              <Input id="area" value={form.pickup_area} maxLength={80} onChange={(e) => set("pickup_area")(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={create.isPending} className="w-full">
            {create.isPending ? "Creating record & routing…" : "Create patient & generate tracking ID"}
          </Button>
        </form>

        <div className="space-y-4">
          {result ? (
            <div className="panel p-6 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Patient tracking ID</p>
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.18em] text-primary">{result.patient.tracking_id}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <SeverityBadge severity={result.patient.severity} />
              </div>
              {result.assignment ? (
                <div className="mt-5 rounded-md bg-primary-soft p-4 text-left text-sm">
                  <p className="font-semibold text-primary-deep">{result.assignment.hospital.name}</p>
                  <p className="mt-1 text-muted-foreground">
                    {result.assignment.hold.resource_label} held · ETA {result.assignment.eta_minutes} min
                  </p>
                </div>
              ) : (
                <p className="mt-5 rounded-md bg-critical/10 p-4 text-sm text-critical">
                  No matching capacity in radius — escalate to Command Center.
                </p>
              )}
              <div className="mt-5 grid gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" aria-hidden /> Print wristband tag
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate({ to: "/reunify/$trackingId", params: { trackingId: result.patient.tracking_id } })}
                >
                  View public status page
                </Button>
              </div>
            </div>
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">
              <h2 className="text-base font-semibold text-foreground">What happens on submit</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-4">
                <li>Patient row created with a public tracking ID.</li>
                <li>Routing engine filters hospitals by the resource this severity needs.</li>
                <li>Candidates re-ranked against predicted shortfall before ETA.</li>
                <li>Bed hold created and pushed to the ambulance and hospital queue.</li>
                <li>Family portal shows “en route” immediately.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

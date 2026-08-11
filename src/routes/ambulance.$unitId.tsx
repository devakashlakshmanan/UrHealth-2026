import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Navigation } from "lucide-react";
import { AppShell } from "@/components/uh/app-shell";
import { Countdown, HoldBadge, PatientStatusBadge, SeverityBadge } from "@/components/uh/badges";
import { api, useNetworkChannel } from "@/lib/api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ambulance/$unitId")({
  head: () => ({
    meta: [
      { title: "Ambulance Field View — UrHealth" },
      { name: "description", content: "Assigned hospital, live ETA countdown, bed hold status and patient tracking ID for ambulance crews." },
      { property: "og:title", content: "Ambulance Field View — UrHealth" },
      { property: "og:description", content: "Mobile-first crew view with auto re-assignment when a hold expires." },
    ],
  }),
  component: AmbulanceView,
});

function AmbulanceView() {
  const { unitId } = Route.useParams();
  useNetworkChannel();

  const units = useQuery({ queryKey: ["units"], queryFn: api.getUnits });
  const patients = useQuery({ queryKey: ["patients"], queryFn: api.getPatients });
  const holds = useQuery({ queryKey: ["holds"], queryFn: api.getHolds });
  const network = useQuery({ queryKey: ["network"], queryFn: api.getNetworkStatus });

  const onboard = useMutation({
    mutationFn: () => api.confirmOnboard(unitId),
    onSuccess: () => toast.success("Patient onboard — ETA clock started for hospital"),
  });

  const unit = (units.data ?? []).find((u) => u.id === unitId);
  const patient = (patients.data ?? []).find((p) => p.id === unit?.assigned_patient_id);
  const hold = (holds.data ?? []).find((h) => h.patient_id === patient?.id && h.status === "active");
  const hospital = (network.data?.hospitals ?? []).find((h) => h.id === patient?.assigned_hospital_id);

  return (
    <AppShell role="Ambulance Crew" title={unit ? unit.unit_code : "Unit"} subtitle={unit?.current_location}>
      <div className="mx-auto max-w-xl space-y-4">
        {!patient ? (
          <div className="panel p-6 text-center">
            <p className="text-base font-semibold">No patient assigned</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Log a pickup from the{" "}
              <Link to="/triage/new" className="text-primary underline-offset-4 hover:underline">
                triage form
              </Link>{" "}
              and the routing engine will assign this unit.
            </p>
          </div>
        ) : (
          <>
            <div className="panel p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Patient tracking ID</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.16em] text-primary">{patient.tracking_id}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <SeverityBadge severity={patient.severity} />
                <PatientStatusBadge status={patient.status} />
              </div>
            </div>

            <div className="panel p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Assigned hospital</p>
              <h2 className="mt-1 text-xl font-semibold">{hospital?.name ?? "Awaiting assignment"}</h2>
              {hospital ? (
                <a
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                  href={`https://maps.google.com/?q=${encodeURIComponent(hospital.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="h-4 w-4" aria-hidden /> {hospital.address}
                </a>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-primary-soft p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ETA</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-primary-deep">{unit?.eta_minutes ?? 0} min</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Hold expires</p>
                  <div className="mt-1 text-2xl font-semibold">
                    {hold ? <Countdown to={hold.expires_at} /> : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>

              {hold ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <HoldBadge status={hold.status} /> {hold.resource_label}
                </p>
              ) : null}
            </div>

            <Button size="lg" className="w-full" onClick={() => onboard.mutate()} disabled={patient.status !== "dispatched"}>
              <Navigation className="mr-2 h-4 w-4" aria-hidden />
              {patient.status === "dispatched" ? "Confirm patient onboard" : "Onboard confirmed"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              If the hold expires before arrival, this screen updates automatically with the re-assigned hospital.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

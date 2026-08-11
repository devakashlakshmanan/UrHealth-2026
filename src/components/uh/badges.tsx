import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { HoldStatus, PatientStatus, Severity } from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, { label: string; cls: string }> = {
  red: { label: "Immediate", cls: "bg-critical text-critical-foreground" },
  yellow: { label: "Delayed", cls: "bg-warning text-warning-foreground" },
  green: { label: "Minor", cls: "bg-stable/20 text-stable-foreground border border-stable/40" },
  black: { label: "Expectant", cls: "bg-deceased text-deceased-foreground" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}

const PATIENT_STATUS: Record<PatientStatus, string> = {
  dispatched: "Dispatched",
  en_route: "En route",
  admitted: "Admitted",
  discharged: "Discharged",
};

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
      {PATIENT_STATUS[status]}
    </span>
  );
}

const HOLD_STYLE: Record<HoldStatus, string> = {
  active: "bg-warning/20 text-warning-foreground",
  confirmed: "bg-stable/20 text-stable-foreground",
  released: "bg-muted text-muted-foreground",
  expired: "bg-critical/15 text-critical",
};

export function HoldBadge({ status }: { status: HoldStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", HOLD_STYLE[status])}>
      {status}
    </span>
  );
}

export function Countdown({ to, className }: { to: string; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const ms = new Date(to).getTime() - Date.now();
  const expired = ms <= 0;
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return (
    <span className={cn("font-mono tabular-nums", expired ? "text-critical" : "text-foreground", className)}>
      {expired ? "expired" : `${mm}:${ss}`}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

import type {
  AmbulanceUnit,
  BedHold,
  Hospital,
  Incident,
  Patient,
  Prediction,
  ResourceType,
  Severity,
} from "./types";

/**
 * In-memory mock backend that mirrors the FastAPI contract 1:1.
 * Swap `src/lib/api.ts` to hit real HTTP/WS endpoints; UI code never changes.
 */

type Snapshot = {
  hospitals: Hospital[];
  incidents: Incident[];
  patients: Patient[];
  holds: BedHold[];
  units: AmbulanceUnit[];
  predictions: Prediction[];
};

const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const minutes = (n: number) => n * 60_000;

function makeHospital(
  id: string,
  name: string,
  address: string,
  lat: number,
  lng: number,
  beds: [number, number],
  icu: [number, number],
  ot: [number, number],
): Hospital {
  return {
    id,
    name,
    address,
    lat,
    lng,
    total_beds: beds[0],
    available_beds: beds[1],
    icu_total: icu[0],
    icu_available: icu[1],
    ot_total: ot[0],
    ot_available: ot[1],
    blood_bank_status: { "O+": 24, "O-": 6, "A+": 18, "B+": 12, "AB+": 4 },
    network_id: "net-central",
  };
}

const db: Snapshot = {
  hospitals: [
    makeHospital("h1", "City General Hospital", "12 Marine Drive, Sector 4", 19.076, 72.877, [420, 63], [40, 7], [12, 3]),
    makeHospital("h2", "St. Anne Medical Center", "88 Ridge Road, Northside", 19.104, 72.842, [260, 21], [22, 2], [8, 1]),
    makeHospital("h3", "Riverside Trauma Institute", "5 Riverside Way, East Bank", 19.041, 72.918, [180, 48], [30, 11], [10, 5]),
    makeHospital("h4", "Meridian District Hospital", "301 Meridian Ave, Southgate", 18.998, 72.861, [340, 95], [18, 4], [6, 2]),
    makeHospital("h5", "Harbour Point Clinic", "7 Dockyard Lane, Harbour", 19.062, 72.951, [90, 12], [6, 0], [3, 0]),
  ],
  incidents: [
    {
      id: "inc-1",
      type: "MCI",
      declared_at: iso(new Date(Date.now() - minutes(42))),
      status: "active",
      network_id: "net-central",
      severity_estimate: 4,
      label: "Multi-vehicle collision — Coastal Expressway KM 14",
    },
  ],
  patients: [],
  holds: [],
  units: [
    { id: "u1", unit_code: "AMB-114", current_location: "Coastal Expressway KM 14", status: "idle", assigned_patient_id: null, eta_minutes: 0 },
    { id: "u2", unit_code: "AMB-207", current_location: "Sector 9 Depot", status: "idle", assigned_patient_id: null, eta_minutes: 0 },
    { id: "u3", unit_code: "AMB-311", current_location: "Northside Junction", status: "idle", assigned_patient_id: null, eta_minutes: 0 },
  ],
  predictions: [],
};

/* ---------------------------------- bus ---------------------------------- */

export type NetworkEvent =
  | { type: "incident_declared"; incident: Incident }
  | { type: "assignment"; patient: Patient; hold: BedHold }
  | { type: "hold_expired"; hold: BedHold }
  | { type: "resources_updated"; hospital: Hospital }
  | { type: "patient_updated"; patient: Patient };

const listeners = new Set<(e: NetworkEvent) => void>();

export function subscribeNetwork(fn: (e: NetworkEvent) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const STORAGE_KEY = "urhealth-demo-state";

/** Session persistence so a full page reload keeps the demo scenario intact. */
export function persist() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable — demo continues in memory */
  }
}

export function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Snapshot;
    Object.assign(db, parsed);
  } catch {
    /* ignore malformed state */
  }
}

function publish(e: NetworkEvent) {
  persist();
  listeners.forEach((l) => l(e));
}

/* -------------------------------- helpers -------------------------------- */

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function makeTrackingId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `UH-${s}`;
}

function requiredResource(severity: Severity): ResourceType {
  if (severity === "red") return "icu";
  if (severity === "yellow") return "ot";
  return "bed";
}

function availableOf(h: Hospital, r: ResourceType) {
  return r === "icu" ? h.icu_available : r === "ot" ? h.ot_available : h.available_beds;
}

function decrement(h: Hospital, r: ResourceType, by: number) {
  if (r === "icu") h.icu_available = Math.max(0, h.icu_available - by);
  else if (r === "ot") h.ot_available = Math.max(0, h.ot_available - by);
  else h.available_beds = Math.max(0, h.available_beds - by);
}

function pseudoEta(h: Hospital) {
  return 6 + Math.round((Math.abs(h.lat - 19.06) + Math.abs(h.lng - 72.88)) * 260);
}

/* ------------------------------- predictions ------------------------------ */

export function refreshPredictions(): Prediction[] {
  const out: Prediction[] = [];
  const g = iso(now());
  for (const h of db.hospitals) {
    for (const r of ["bed", "icu", "ot"] as ResourceType[]) {
      const capacity = availableOf(h, r);
      const incoming = db.holds.filter((x) => x.hospital_id === h.id && x.resource_type === r && x.status === "active").length;
      // MVP exponential-trend forecast: demand grows with incident severity + queue.
      const rate = 0.35 + incoming * 0.28 + (db.incidents.some((i) => i.status === "active") ? 0.45 : 0);
      const series = Array.from({ length: 7 }, (_, i) => {
        const t = i * 30;
        return {
          t: `+${t}m`,
          projected: Math.max(0, Math.round(capacity - rate * i * (1 + i * 0.22))),
          capacity,
        };
      });
      const breach = series.findIndex((s) => s.projected <= 0);
      out.push({
        id: `${h.id}-${r}`,
        hospital_id: h.id,
        resource_type: r,
        predicted_shortfall_at: breach === -1 ? "" : iso(new Date(Date.now() + minutes(breach * 30))),
        shortfall: breach === -1 ? 0 : Math.max(1, Math.round(rate * breach)),
        confidence: 0.62 + Math.min(0.3, incoming * 0.06),
        generated_at: g,
        series,
      });
    }
  }
  db.predictions = out;
  return out;
}

refreshPredictions();

/** Minutes until a hospital is forecast to saturate for a resource (Infinity if safe). */
function minutesToSaturation(hospitalId: string, r: ResourceType) {
  const p = db.predictions.find((x) => x.hospital_id === hospitalId && x.resource_type === r);
  if (!p || !p.predicted_shortfall_at) return Infinity;
  return (new Date(p.predicted_shortfall_at).getTime() - Date.now()) / 60_000;
}

/* --------------------------------- store --------------------------------- */

export const store = {
  hospitals: () => db.hospitals.map((h) => ({ ...h })),
  hospital: (id: string) => db.hospitals.find((h) => h.id === id),
  incidents: () => db.incidents.map((i) => ({ ...i })),
  patients: () => db.patients.map((p) => ({ ...p })),
  patient: (id: string) => db.patients.find((p) => p.id === id),
  patientByTracking: (t: string) => db.patients.find((p) => p.tracking_id.toLowerCase() === t.trim().toLowerCase()),
  holds: () => db.holds.map((h) => ({ ...h })),
  units: () => db.units.map((u) => ({ ...u })),
  predictions: () => db.predictions.map((p) => ({ ...p })),

  declareIncident(input: { type: Incident["type"]; label: string; severity_estimate: number }) {
    const inc: Incident = {
      id: rid("inc"),
      type: input.type,
      label: input.label,
      declared_at: iso(now()),
      status: "active",
      network_id: "net-central",
      severity_estimate: input.severity_estimate,
    };
    db.incidents.unshift(inc);
    refreshPredictions();
    publish({ type: "incident_declared", incident: inc });
    return inc;
  },

  /** POST /api/routing/assign — best-fit routing with predictive re-ranking. */
  assign(patientId: string, exclude: string[] = []) {
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) return null;
    const need = requiredResource(patient.severity);

    const candidates = db.hospitals
      .filter((h) => !exclude.includes(h.id))
      .map((h) => {
        const eta = pseudoEta(h);
        const avail = availableOf(h, need);
        const sat = minutesToSaturation(h.id, need);
        // score: availability - travel penalty - predicted-saturation penalty
        const satPenalty = sat < eta + 15 ? 40 : sat < 120 ? 12 : 0;
        return { h, eta, avail, sat, score: avail * 4 - eta * 1.2 - satPenalty };
      })
      .filter((c) => c.avail > 0)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best) return null;

    decrement(best.h, need, 1);
    const hold: BedHold = {
      id: rid("hold"),
      patient_id: patient.id,
      hospital_id: best.h.id,
      resource_type: need,
      resource_label: `${need === "icu" ? "ICU bed" : need === "ot" ? "OT slot" : "Ward bed"} #${Math.floor(Math.random() * 40) + 1}`,
      held_at: iso(now()),
      expires_at: iso(new Date(Date.now() + minutes(best.eta + 10))),
      status: "active",
    };
    db.holds.unshift(hold);
    patient.assigned_hospital_id = best.h.id;
    patient.status = "dispatched";

    const unit = db.units.find((u) => u.assigned_patient_id === patient.id) ?? db.units.find((u) => u.status === "idle");
    if (unit) {
      unit.assigned_patient_id = patient.id;
      unit.status = "dispatched";
      unit.eta_minutes = best.eta;
    }

    refreshPredictions();
    publish({ type: "assignment", patient: { ...patient }, hold: { ...hold } });
    publish({ type: "resources_updated", hospital: { ...best.h } });
    return { patient: { ...patient }, hold: { ...hold }, hospital: { ...best.h }, eta_minutes: best.eta };
  },

  /** POST /api/patients — creates record, tracking id, then auto-routes. */
  createPatient(input: {
    name?: string;
    age_range: string;
    gender: string;
    identifying_marks: string;
    suspected_condition: string;
    severity: Severity;
    pickup_location: string;
    pickup_area: string;
    incident_id?: string | null;
  }) {
    const patient: Patient = {
      id: rid("pat"),
      tracking_id: makeTrackingId(),
      incident_id: input.incident_id ?? db.incidents.find((i) => i.status === "active")?.id ?? null,
      name: input.name?.trim() ? input.name.trim() : null,
      age_range: input.age_range,
      gender: input.gender,
      identifying_marks: input.identifying_marks,
      suspected_condition: input.suspected_condition,
      severity: input.severity,
      status: "dispatched",
      assigned_hospital_id: null,
      pickup_location: input.pickup_location,
      pickup_area: input.pickup_area,
      created_at: iso(now()),
    };
    db.patients.unshift(patient);
    const assignment = store.assign(patient.id);
    return { patient: store.patient(patient.id)!, assignment };
  },

  confirmArrival(holdId: string) {
    const hold = db.holds.find((h) => h.id === holdId);
    if (!hold) return;
    hold.status = "confirmed";
    const patient = db.patients.find((p) => p.id === hold.patient_id);
    if (patient) {
      patient.status = "admitted";
      publish({ type: "patient_updated", patient: { ...patient } });
    }
    refreshPredictions();
    persist();
  },

  rejectHold(holdId: string) {
    const hold = db.holds.find((h) => h.id === holdId);
    if (!hold) return null;
    hold.status = "released";
    const h = db.hospitals.find((x) => x.id === hold.hospital_id);
    if (h) {
      if (hold.resource_type === "icu") h.icu_available += 1;
      else if (hold.resource_type === "ot") h.ot_available += 1;
      else h.available_beds += 1;
      publish({ type: "resources_updated", hospital: { ...h } });
    }
    return store.assign(hold.patient_id, [hold.hospital_id]);
  },

  confirmOnboard(unitId: string) {
    const u = db.units.find((x) => x.id === unitId);
    if (!u || !u.assigned_patient_id) return;
    u.status = "onboard";
    const p = db.patients.find((x) => x.id === u.assigned_patient_id);
    if (p) {
      p.status = "en_route";
      publish({ type: "patient_updated", patient: { ...p } });
    }
    persist();
  },

  updateResources(hospitalId: string, patch: Partial<Hospital>) {
    const h = db.hospitals.find((x) => x.id === hospitalId);
    if (!h) return;
    Object.assign(h, patch);
    refreshPredictions();
    publish({ type: "resources_updated", hospital: { ...h } });
  },

  /** GET /api/patients/search — sanitized public projection only. */
  search(q: { tracking_id?: string; age_range?: string; gender?: string; area?: string }) {
    return db.patients
      .filter((p) => {
        if (q.tracking_id?.trim()) return p.tracking_id.toLowerCase().includes(q.tracking_id.trim().toLowerCase());
        if (q.age_range && q.age_range !== "any" && p.age_range !== q.age_range) return false;
        if (q.gender && q.gender !== "any" && p.gender !== q.gender) return false;
        if (q.area?.trim() && !p.pickup_area.toLowerCase().includes(q.area.trim().toLowerCase())) return false;
        return Boolean(q.age_range || q.gender || q.area?.trim());
      })
      .map((p) => ({
        tracking_id: p.tracking_id,
        status: p.status,
        age_range: p.age_range,
        gender: p.gender,
        pickup_area: p.pickup_area,
        hospital_name: db.hospitals.find((h) => h.id === p.assigned_hospital_id)?.name ?? null,
        hospital_address: db.hospitals.find((h) => h.id === p.assigned_hospital_id)?.address ?? null,
        updated_at: p.created_at,
      }));
  },
};

export type PublicPatientView = ReturnType<typeof store.search>[number];

/* --------------------------- background scheduler -------------------------- */

let started = false;
export function startBackgroundJobs() {
  if (started || typeof window === "undefined") return;
  started = true;
  setInterval(() => {
    const t = Date.now();
    for (const hold of db.holds) {
      if (hold.status === "active" && new Date(hold.expires_at).getTime() < t) {
        hold.status = "expired";
        publish({ type: "hold_expired", hold: { ...hold } });
        store.assign(hold.patient_id, [hold.hospital_id]);
      }
    }
  }, 5000);
  setInterval(() => refreshPredictions(), 60_000);
}

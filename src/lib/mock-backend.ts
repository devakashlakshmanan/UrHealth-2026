import type {
  AmbulanceUnit,
  BedHold,
  BedSlot,
  Hospital,
  Incident,
  Patient,
  PatientVitals,
  Prediction,
  ResourceType,
  Severity,
} from "./types";
import { sound } from "./sound";

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

function generateBedMatrix(hospitalId: string, icuTotal: number, wardTotal: number, otTotal: number): BedSlot[] {
  const slots: BedSlot[] = [];
  
  // ICU slots (e.g. 101 to 100+icuTotal)
  for (let i = 1; i <= Math.min(icuTotal, 16); i++) {
    slots.push({
      id: `${hospitalId}-icu-${i}`,
      room_number: `ICU-Pod ${String.fromCharCode(64 + Math.ceil(i / 4))}`,
      bed_code: `ICU-${String(i).padStart(2, "0")}`,
      unit_type: "icu",
      status: i <= 2 ? "held" : i <= 6 ? "occupied" : i === 7 ? "sanitizing" : "available",
      held_expires_at: i <= 2 ? iso(new Date(Date.now() + minutes(12))) : null,
    });
  }

  // OT suites
  for (let i = 1; i <= Math.min(otTotal, 8); i++) {
    slots.push({
      id: `${hospitalId}-ot-${i}`,
      room_number: `Trauma OR Suite ${i}`,
      bed_code: `OR-${i}`,
      unit_type: "ot",
      status: i === 1 ? "held" : i === 2 ? "occupied" : "available",
      held_expires_at: i === 1 ? iso(new Date(Date.now() + minutes(18))) : null,
    });
  }

  // General Ward beds
  for (let i = 1; i <= 20; i++) {
    slots.push({
      id: `${hospitalId}-ward-${i}`,
      room_number: `Ward 3-${Math.ceil(i / 4)}`,
      bed_code: `W3-${String(i).padStart(2, "0")}`,
      unit_type: "ward",
      status: i <= 4 ? "occupied" : i === 5 ? "sanitizing" : "available",
    });
  }

  return slots;
}

function makeHospital(
  id: string,
  name: string,
  address: string,
  lat: number,
  lng: number,
  beds: [number, number],
  icu: [number, number],
  ot: [number, number],
  traumaLevel: 1 | 2 | 3,
  capabilities: { burn: boolean; peds: boolean; helipad: boolean; ct: boolean; phone: string; chief: string },
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
    blood_bank_status: { "O-": 8, "O+": 24, "A+": 18, "A-": 6, "B+": 14, "B-": 4, "AB+": 7, "AB-": 3 },
    network_id: "net-central",
    trauma_level: traumaLevel,
    burn_unit: capabilities.burn,
    pediatric_er: capabilities.peds,
    helipad: capabilities.helipad,
    ct_scan: capabilities.ct,
    decon_ready: true,
    phone_emergency: capabilities.phone,
    chief_of_emergency: capabilities.chief,
    bed_matrix: generateBedMatrix(id, icu[0], beds[0], ot[0]),
    staff_on_duty: {
      traumaSurgeons: traumaLevel === 1 ? 4 : 2,
      erNurses: traumaLevel === 1 ? 16 : 8,
      anesthesiologists: traumaLevel === 1 ? 5 : 2,
    },
  };
}

const initialDb: Snapshot = {
  hospitals: [
    makeHospital("h1", "City General Hospital", "12 Marine Drive, Sector 4", 19.076, 72.877, [420, 63], [40, 7], [12, 3], 1, {
      burn: true,
      peds: true,
      helipad: true,
      ct: true,
      phone: "+1 (555) 019-2831",
      chief: "Dr. Alistair Vance, MD, FACS",
    }),
    makeHospital("h2", "St. Anne Medical Center", "88 Ridge Road, Northside", 19.104, 72.842, [260, 21], [22, 2], [8, 1], 2, {
      burn: false,
      peds: true,
      helipad: false,
      ct: true,
      phone: "+1 (555) 014-9920",
      chief: "Dr. Elena Rostova, MD",
    }),
    makeHospital("h3", "Riverside Trauma Institute", "5 Riverside Way, East Bank", 19.041, 72.918, [180, 48], [30, 11], [10, 5], 1, {
      burn: true,
      peds: false,
      helipad: true,
      ct: true,
      phone: "+1 (555) 018-7711",
      chief: "Dr. Marcus Thorne, MD, FCCM",
    }),
    makeHospital("h4", "Meridian District Hospital", "301 Meridian Ave, Southgate", 18.998, 72.861, [340, 95], [18, 4], [6, 2], 2, {
      burn: false,
      peds: false,
      helipad: false,
      ct: true,
      phone: "+1 (555) 012-3401",
      chief: "Dr. Priya Patel, MD",
    }),
    makeHospital("h5", "Harbour Point Clinic", "7 Dockyard Lane, Harbour", 19.062, 72.951, [90, 12], [6, 0], [3, 0], 3, {
      burn: false,
      peds: false,
      helipad: false,
      ct: false,
      phone: "+1 (555) 017-6655",
      chief: "Dr. Kevin Zhang, MD",
    }),
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
      casualties_estimated: 14,
      evacuation_zone: "Sector 4 Coastal Highway Corridor",
    },
  ],
  patients: [
    {
      id: "pat-seed-1",
      tracking_id: "UH-9B4X2M",
      incident_id: "inc-1",
      name: "Marcus Holloway (Unverified)",
      age_range: "31-45",
      gender: "male",
      identifying_marks: "Navy blue hoodie, metallic wrist watch, scar over right brow",
      suspected_condition: "Blunt thoracic trauma with suspected pneumothorax",
      severity: "red",
      status: "en_route",
      assigned_hospital_id: "h1",
      pickup_location: "18.9982, 72.8611 · Coastal Expressway KM 14",
      pickup_area: "Coastal Expressway",
      created_at: iso(new Date(Date.now() - minutes(14))),
      vitals: {
        heartRate: 118,
        systolicBP: 95,
        diastolicBP: 62,
        spO2: 91,
        respRate: 28,
        gcs: 13,
        tempCelsius: 36.6,
      },
      injury_tags: ["Thorax / Chest", "Head / Brow"],
      field_notes: "Chest wall asymmetry noted. 2L O2 delivered via NRB mask. Golden hour lock engaged.",
      paramedic_unit: "AMB-114",
    },
    {
      id: "pat-seed-2",
      tracking_id: "UH-7K8L2P",
      incident_id: "inc-1",
      name: "Sarah Chen",
      age_range: "18-30",
      gender: "female",
      identifying_marks: "Green jacket, red backpack nearby",
      suspected_condition: "Left femur fracture, stable hemodynamics",
      severity: "yellow",
      status: "en_route",
      assigned_hospital_id: "h3",
      pickup_location: "18.9982, 72.8611 · Coastal Expressway KM 14",
      pickup_area: "Coastal Expressway",
      created_at: iso(new Date(Date.now() - minutes(10))),
      vitals: {
        heartRate: 88,
        systolicBP: 124,
        diastolicBP: 78,
        spO2: 98,
        respRate: 18,
        gcs: 15,
        tempCelsius: 36.9,
      },
      injury_tags: ["Left Lower Extremity / Femur"],
      field_notes: "Traction splint applied in field. Distal pulses intact.",
      paramedic_unit: "AMB-207",
    },
    {
      id: "pat-seed-3",
      tracking_id: "UH-4W9D1Z",
      incident_id: "inc-1",
      name: "David K.",
      age_range: "46-60",
      gender: "male",
      identifying_marks: "Grey overcoat",
      suspected_condition: "Superficial glass lacerations, contusions",
      severity: "green",
      status: "admitted",
      assigned_hospital_id: "h4",
      pickup_location: "18.9982, 72.8611 · Coastal Expressway KM 14",
      pickup_area: "Coastal Expressway",
      created_at: iso(new Date(Date.now() - minutes(28))),
      vitals: {
        heartRate: 76,
        systolicBP: 120,
        diastolicBP: 80,
        spO2: 99,
        respRate: 16,
        gcs: 15,
        tempCelsius: 37.0,
      },
      injury_tags: ["Right Arm / Forearm"],
      field_notes: "Lacerations irrigated and dressed. Ambulatory at scene.",
      paramedic_unit: "AMB-311",
    },
  ],
  holds: [
    {
      id: "hold-seed-1",
      patient_id: "pat-seed-1",
      hospital_id: "h1",
      resource_type: "icu",
      resource_label: "ICU Resuscitation Pod #04",
      held_at: iso(new Date(Date.now() - minutes(14))),
      expires_at: iso(new Date(Date.now() + minutes(16))),
      status: "active",
    },
    {
      id: "hold-seed-2",
      patient_id: "pat-seed-2",
      hospital_id: "h3",
      resource_type: "ot",
      resource_label: "Trauma OR Suite #2",
      held_at: iso(new Date(Date.now() - minutes(10))),
      expires_at: iso(new Date(Date.now() + minutes(22))),
      status: "active",
    },
    {
      id: "hold-seed-3",
      patient_id: "pat-seed-3",
      hospital_id: "h4",
      resource_type: "bed",
      resource_label: "General Ward Bed W3-08",
      held_at: iso(new Date(Date.now() - minutes(28))),
      expires_at: iso(new Date(Date.now() - minutes(5))),
      status: "confirmed",
    },
  ],
  units: [
    {
      id: "u1",
      unit_code: "AMB-114",
      current_location: "Coastal Expressway KM 14",
      status: "onboard",
      assigned_patient_id: "pat-seed-1",
      eta_minutes: 7,
      driver_name: "Capt. Ray Cooper",
      paramedic_lead: "Lt. Sarah Lin, NREMT-P",
      fuel_pct: 84,
      speed_kmh: 78,
      live_vitals: {
        heartRate: 118,
        systolicBP: 95,
        diastolicBP: 62,
        spO2: 91,
        respRate: 28,
        gcs: 13,
        tempCelsius: 36.6,
      },
    },
    {
      id: "u2",
      unit_code: "AMB-207",
      current_location: "En route to Riverside Trauma",
      status: "onboard",
      assigned_patient_id: "pat-seed-2",
      eta_minutes: 12,
      driver_name: "Officer Jack Miller",
      paramedic_lead: "Paramedic David Kim",
      fuel_pct: 68,
      speed_kmh: 82,
      live_vitals: {
        heartRate: 88,
        systolicBP: 124,
        diastolicBP: 78,
        spO2: 98,
        respRate: 18,
        gcs: 15,
        tempCelsius: 36.9,
      },
    },
    {
      id: "u3",
      unit_code: "AMB-311",
      current_location: "Meridian District Hospital ER Bay",
      status: "arrived",
      assigned_patient_id: "pat-seed-3",
      eta_minutes: 0,
      driver_name: "Paramedic Maya Jensen",
      paramedic_lead: "Paramedic Chris Evans",
      fuel_pct: 92,
      speed_kmh: 0,
      live_vitals: {
        heartRate: 76,
        systolicBP: 120,
        diastolicBP: 80,
        spO2: 99,
        respRate: 16,
        gcs: 15,
        tempCelsius: 37.0,
      },
    },
  ],
  predictions: [],
};

const db: Snapshot = JSON.parse(JSON.stringify(initialDb));

/* ---------------------------------- bus ---------------------------------- */

export type NetworkEvent =
  | { type: "incident_declared"; incident: Incident }
  | { type: "assignment"; patient: Patient; hold: BedHold }
  | { type: "hold_expired"; hold: BedHold }
  | { type: "resources_updated"; hospital: Hospital }
  | { type: "patient_updated"; patient: Patient }
  | { type: "unit_updated"; unit: AmbulanceUnit };

const listeners = new Set<(e: NetworkEvent) => void>();

export function subscribeNetwork(fn: (e: NetworkEvent) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const STORAGE_KEY = "urhealth-demo-state-v2";

/** Session persistence so a full page reload keeps the demo scenario intact. */
export function persist() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable */
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

export function makeTrackingId() {
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
      casualties_estimated: input.severity_estimate * 4,
      evacuation_zone: "Metropolitan Incident Zone",
    };
    db.incidents.unshift(inc);
    refreshPredictions();
    sound.playEmergency();
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
      resource_label: `${need === "icu" ? "ICU Bed Pod" : need === "ot" ? "Trauma OR Suite" : "General Ward Bed"} #${Math.floor(Math.random() * 20) + 1}`,
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
      if (patient.vitals) {
        unit.live_vitals = { ...patient.vitals };
      }
    }

    refreshPredictions();
    sound.playSuccess();
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
    vitals?: PatientVitals;
    injury_tags?: string[];
    field_notes?: string;
  }) {
    const defaultVitals: PatientVitals = input.vitals ?? {
      heartRate: input.severity === "red" ? 122 : input.severity === "yellow" ? 95 : 78,
      systolicBP: input.severity === "red" ? 90 : input.severity === "yellow" ? 115 : 122,
      diastolicBP: input.severity === "red" ? 58 : input.severity === "yellow" ? 72 : 80,
      spO2: input.severity === "red" ? 89 : input.severity === "yellow" ? 96 : 99,
      respRate: input.severity === "red" ? 30 : input.severity === "yellow" ? 20 : 16,
      gcs: input.severity === "red" ? 11 : input.severity === "yellow" ? 14 : 15,
      tempCelsius: 36.8,
    };

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
      vitals: defaultVitals,
      injury_tags: input.injury_tags ?? [],
      field_notes: input.field_notes ?? "",
      paramedic_unit: "AMB-114",
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
    const unit = db.units.find((u) => u.assigned_patient_id === hold.patient_id);
    if (unit) {
      unit.status = "arrived";
      publish({ type: "unit_updated", unit: { ...unit } });
    }
    refreshPredictions();
    sound.playSuccess();
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
    sound.playWarning();
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
    sound.playSuccess();
    persist();
  },

  updateVitals(unitId: string, vitals: Partial<PatientVitals>) {
    const u = db.units.find((x) => x.id === unitId);
    if (!u) return;
    if (u.live_vitals) {
      Object.assign(u.live_vitals, vitals);
    }
    if (u.assigned_patient_id) {
      const p = db.patients.find((pat) => pat.id === u.assigned_patient_id);
      if (p && p.vitals) {
        Object.assign(p.vitals, vitals);
        publish({ type: "patient_updated", patient: { ...p } });
      }
    }
    publish({ type: "unit_updated", unit: { ...u } });
  },

  updateResources(hospitalId: string, patch: Partial<Hospital>) {
    const h = db.hospitals.find((x) => x.id === hospitalId);
    if (!h) return;
    Object.assign(h, patch);
    refreshPredictions();
    sound.playClick();
    publish({ type: "resources_updated", hospital: { ...h } });
  },

  updateBloodBank(hospitalId: string, group: string, amount: number) {
    const h = db.hospitals.find((x) => x.id === hospitalId);
    if (!h || !h.blood_bank_status) return;
    h.blood_bank_status[group] = Math.max(0, (h.blood_bank_status[group] ?? 0) + amount);
    sound.playClick();
    publish({ type: "resources_updated", hospital: { ...h } });
  },

  updateBedStatus(hospitalId: string, bedSlotId: string, newStatus: BedSlot["status"]) {
    const h = db.hospitals.find((x) => x.id === hospitalId);
    if (!h || !h.bed_matrix) return;
    const bed = h.bed_matrix.find((b) => b.id === bedSlotId);
    if (bed) {
      bed.status = newStatus;
      sound.playClick();
      publish({ type: "resources_updated", hospital: { ...h } });
    }
  },

  /** Simulates an active mass casualty surge for live testing */
  simulateMciSurge(scenarioName: string = "Expressway Multi-Vehicle Pileup") {
    store.declareIncident({
      type: "MCI",
      label: `${scenarioName} · Critical casualty influx`,
      severity_estimate: 5,
    });

    // Generate 3 urgent casualties with realistic injuries
    const casualties: { severity: Severity; name: string; age: string; gender: string; cond: string; marks: string; tags: string[] }[] = [
      {
        severity: "red",
        name: "Unidentified Male (Driver)",
        age: "31-45",
        gender: "male",
        cond: "Traumatic brain injury, flail chest",
        marks: "Black leather jacket, silver signet ring",
        tags: ["Head / Cranial", "Thorax / Chest"],
      },
      {
        severity: "red",
        name: "Elena G.",
        age: "18-30",
        gender: "female",
        cond: "Pelvic crush injury, hypovolemic shock",
        marks: "Yellow rain poncho, floral tattoo left wrist",
        tags: ["Pelvis / Abdomen", "Left Upper Extremity"],
      },
      {
        severity: "yellow",
        name: "Robert M.",
        age: "46-60",
        gender: "male",
        cond: "Compound bilateral lower leg fractures",
        marks: "Denim overalls, work boots",
        tags: ["Bilateral Lower Extremities"],
      },
    ];

    casualties.forEach((c) => {
      store.createPatient({
        name: c.name,
        age_range: c.age,
        gender: c.gender,
        suspected_condition: c.cond,
        identifying_marks: c.marks,
        severity: c.severity,
        pickup_location: "Coastal Expressway KM 14",
        pickup_area: "Coastal Expressway",
        injury_tags: c.tags,
      });
    });

    sound.playEmergency();
    return true;
  },

  /** Reset all state to clean initial defaults */
  resetDemoData() {
    Object.assign(db, JSON.parse(JSON.stringify(initialDb)));
    refreshPredictions();
    sound.playSuccess();
    publish({ type: "resources_updated", hospital: db.hospitals[0]! });
    persist();
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
  hydrate();
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

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hospital, Incident, Severity, Patient, BedHold, AmbulanceUnit, Prediction, PatientVitals, BedSlot } from "./types";
import { store, subscribeNetwork, type NetworkEvent, startBackgroundJobs } from "./mock-backend";

const API_BASE = (import.meta.env["VITE_API_URL"] as string) || "http://localhost:8000";
const WS_BASE = (import.meta.env["VITE_WS_URL"] as string) || "ws://localhost:8000";

// Ensure background hold expiry / prediction scheduler runs in client
if (typeof window !== "undefined") {
  startBackgroundJobs();
}

function getAuthHeader(): Record<string, string> {
  if (typeof window !== "undefined" && window.localStorage) {
    const token = localStorage.getItem("urhealth_auth_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

async function http<T>(path: string, options?: RequestInit, fallbackFn?: () => T | Promise<T>): Promise<T> {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...options?.headers,
    };
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    if (res.ok) {
      return (await res.json()) as T;
    }
    const errText = await res.text();
    let errDetail = res.statusText;
    try {
      const parsed = JSON.parse(errText);
      errDetail = parsed.detail || errDetail;
    } catch {}
    throw new Error(`API ${res.status}: ${errDetail}`);
  } catch (err) {
    if (fallbackFn) {
      return await fallbackFn();
    }
    throw err;
  }
}

export interface StaffAccountData {
  id: string;
  email: string;
  username: string;
  role: string;
  hospital_id?: string | null;
  unit_id?: string | null;
  created_by_admin_id?: string | null;
  created_at: string;
}

export interface AuditLogData {
  id: string;
  public_user_id: string | null;
  public_user_email: string;
  public_user_name: string;
  searched_at: string;
  query_type: string;
  query_params: Record<string, any>;
  tracking_id_result: string | null;
  ip_address: string;
}

export const api = {
  getNetworkStatus: () =>
    http<{ hospitals: Hospital[]; incidents: Incident[] }>(
      "/api/network/status",
      undefined,
      () => ({ hospitals: store.hospitals(), incidents: store.incidents() })
    ),

  getHospital: (id: string) =>
    http<Hospital | null>(`/api/hospitals/${id}`, undefined, () => store.hospital(id) ?? null),

  getIncidents: () =>
    http<Incident[]>("/api/incidents", undefined, () => store.incidents()),

  getPatients: () =>
    http<Patient[]>("/api/patients", undefined, () => store.patients()),

  getHolds: () =>
    http<BedHold[]>("/api/holds", undefined, () => store.holds()),

  getUnits: () =>
    http<AmbulanceUnit[]>("/api/ambulances", undefined, () => store.units()),

  getPredictions: () =>
    http<Prediction[]>("/api/predictions", undefined, () => store.predictions()),

  declareIncident: (input: { type: Incident["type"]; label: string; severity_estimate: number }) =>
    http<Incident>(
      "/api/incidents",
      { method: "POST", body: JSON.stringify(input) },
      () => store.declareIncident(input)
    ),

  createPatient: (input: {
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
  }) =>
    http<{ patient: Patient; assignment: { hospital: Hospital; hold: BedHold; eta_minutes: number } | null }>(
      "/api/patients",
      { method: "POST", body: JSON.stringify(input) },
      () => store.createPatient(input)
    ),

  confirmArrival: (holdId: string) =>
    http<{ status: string; hold_id: string }>(
      `/api/hospitals/confirm/action?hold_id=${holdId}`,
      { method: "POST" },
      () => {
        store.confirmArrival(holdId);
        return { status: "confirmed", hold_id: holdId };
      }
    ),

  rejectHold: (holdId: string) =>
    http<{ hospital: Hospital; hold: BedHold; eta_minutes: number } | null>(
      `/api/hospitals/reject/action?hold_id=${holdId}`,
      { method: "POST" },
      () => store.rejectHold(holdId)
    ),

  confirmOnboard: (unitId: string) =>
    http<{ status: string; unit_id: string }>(
      `/api/ambulances/${unitId}/onboard`,
      { method: "POST" },
      () => {
        store.confirmOnboard(unitId);
        return { status: "onboard", unit_id: unitId };
      }
    ),

  updateVitals: (unitId: string, vitals: Partial<PatientVitals>) => {
    store.updateVitals(unitId, vitals);
  },

  updateResources: (hospitalId: string, patch: Partial<Hospital>) =>
    http<Hospital>(
      `/api/hospitals/${hospitalId}/resources`,
      { method: "PATCH", body: JSON.stringify(patch) },
      () => {
        store.updateResources(hospitalId, patch);
        return store.hospital(hospitalId)!;
      }
    ),

  updateBloodBank: (hospitalId: string, group: string, amount: number) => {
    store.updateBloodBank(hospitalId, group, amount);
  },

  updateBedStatus: (hospitalId: string, bedSlotId: string, newStatus: BedSlot["status"]) => {
    store.updateBedStatus(hospitalId, bedSlotId, newStatus);
  },

  simulateSurge: (scenarioName?: string) => {
    return store.simulateMciSurge(scenarioName);
  },

  resetDemo: () => {
    store.resetDemoData();
  },

  searchPatients: (q: { tracking_id?: string; age_range?: string; gender?: string; area?: string }) => {
    const params = new URLSearchParams();
    if (q.tracking_id) params.set("tracking_id", q.tracking_id);
    if (q.age_range) params.set("age_range", q.age_range);
    if (q.gender) params.set("gender", q.gender);
    if (q.area) params.set("area", q.area);
    const queryString = params.toString() ? `?${params.toString()}` : "";

    return http<
      {
        tracking_id: string;
        status: string;
        age_range: string;
        gender: string;
        pickup_area: string;
        hospital_name: string | null;
        hospital_address: string | null;
        updated_at: string;
      }[]
    >(`/api/patients/search${queryString}`, undefined, () => store.search(q));
  },

  lookupTracking: (trackingId: string) =>
    http<{
      tracking_id: string;
      status: string;
      age_range: string;
      gender: string;
      pickup_area: string;
      hospital_name: string | null;
      hospital_address: string | null;
      updated_at: string;
    } | null>(`/api/patients/${encodeURIComponent(trackingId)}`, undefined, () => {
      const p = store.patientByTracking(trackingId);
      if (!p) return null;
      return {
        tracking_id: p.tracking_id,
        status: p.status,
        age_range: p.age_range,
        gender: p.gender,
        pickup_area: p.pickup_area,
        hospital_name: store.hospitals().find((h) => h.id === p.assigned_hospital_id)?.name ?? null,
        hospital_address: store.hospitals().find((h) => h.id === p.assigned_hospital_id)?.address ?? null,
        updated_at: p.created_at,
      };
    }),

  getStaffAccounts: () =>
    http<StaffAccountData[]>("/api/staff/accounts", undefined, () => [
      {
        id: "staff-1",
        email: "admin@urhealth.org",
        username: "admin",
        role: "district_admin",
        hospital_id: null,
        unit_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "staff-2",
        email: "coord.h1@urhealth.org",
        username: "coord_h1",
        role: "hospital_coordinator",
        hospital_id: "h1",
        unit_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "staff-3",
        email: "triage@urhealth.org",
        username: "triage_staff",
        role: "triage_staff",
        hospital_id: null,
        unit_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "staff-4",
        email: "crew.u1@urhealth.org",
        username: "crew_u1",
        role: "ambulance_crew",
        hospital_id: null,
        unit_id: "u1",
        created_at: new Date().toISOString(),
      },
    ]),

  createStaffAccount: (input: {
    email: string;
    username: string;
    password: string;
    role: string;
    hospital_id?: string | null;
    unit_id?: string | null;
  }) =>
    http<StaffAccountData>(
      "/api/staff/accounts",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      () => ({
        id: `staff-${Date.now()}`,
        email: input.email,
        username: input.username,
        role: input.role,
        hospital_id: input.hospital_id || null,
        unit_id: input.unit_id || null,
        created_at: new Date().toISOString(),
      })
    ),

  getAuditLogs: () =>
    http<AuditLogData[]>("/api/audit-logs", undefined, () => [
      {
        id: "log-1",
        public_user_id: "usr_google_1",
        public_user_email: "sarah.miller@gmail.com",
        public_user_name: "Sarah Miller",
        searched_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        query_type: "tracking_id",
        query_params: { tracking_id: "UH-9B4X2M" },
        tracking_id_result: "UH-9B4X2M",
        ip_address: "192.168.1.104",
      },
      {
        id: "log-2",
        public_user_id: "usr_google_2",
        public_user_email: "david.chen@gmail.com",
        public_user_name: "David Chen",
        searched_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
        query_type: "demographic",
        query_params: { age_range: "18-30", gender: "female", area: "Coastal Expressway" },
        tracking_id_result: "UH-7K8L2P",
        ip_address: "192.168.1.112",
      },
    ]),
};

/** Network event channel supporting both real WebSocket and in-memory event bus */
export function useNetworkChannel(onEvent?: (e: NetworkEvent) => void) {
  const qc = useQueryClient();
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // 1. Subscribe to in-memory bus immediately
    const unsubInternal = subscribeNetwork((e) => {
      qc.invalidateQueries();
      onEvent?.(e);
    });

    // 2. Also attempt WebSocket connection to backend if available
    let socket: WebSocket | null = null;
    let isCancelled = false;

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const token = localStorage.getItem("urhealth_auth_token");
        if (token) {
          socket = new WebSocket(`${WS_BASE}/ws/network?token=${encodeURIComponent(token)}`);
          socket.onopen = () => {
            if (!isCancelled) setIsConnected(true);
          };
          socket.onmessage = (event) => {
            if (isCancelled) return;
            try {
              const data = JSON.parse(event.data) as NetworkEvent;
              qc.invalidateQueries();
              onEvent?.(data);
            } catch {
              qc.invalidateQueries();
            }
          };
        }
      }
    } catch {
      // WS unavailable, internal bus handles synchronization
    }

    return () => {
      isCancelled = true;
      unsubInternal();
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  return { isConnected };
}

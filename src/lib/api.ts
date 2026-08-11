import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hydrate, startBackgroundJobs, store, subscribeNetwork, type NetworkEvent } from "./mock-backend";
import type { Hospital, Incident, Severity, Patient, BedHold, AmbulanceUnit, Prediction } from "./types";

if (typeof window !== "undefined") hydrate();

const API_BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
const WS_BASE = (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8000";

let isBackendAvailable = true;

async function http<T>(path: string, options?: RequestInit, fallbackFn?: () => Promise<T> | T): Promise<T> {
  if (isBackendAvailable) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...options?.headers },
        ...options,
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
    } catch {
      // Backend is unreachable; flag fallback
      isBackendAvailable = false;
    }
  }

  if (fallbackFn) {
    return await fallbackFn();
  }
  throw new Error(`API call failed for ${path} and no fallback provided`);
}

const delay = <T,>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const api = {
  getNetworkStatus: () =>
    http<{ hospitals: Hospital[]; incidents: Incident[] }>(
      "/api/network/status",
      undefined,
      () => delay({ hospitals: store.hospitals(), incidents: store.incidents() })
    ),

  getHospital: (id: string) =>
    http<Hospital | null>(
      `/api/hospitals/${id}`,
      undefined,
      () => delay(store.hospital(id) ?? null)
    ),

  getIncidents: () =>
    http<Incident[]>(
      "/api/incidents",
      undefined,
      () => delay(store.incidents())
    ),

  getPatients: () =>
    http<Patient[]>(
      "/api/patients",
      undefined,
      () => delay(store.patients())
    ),

  getHolds: () =>
    http<BedHold[]>(
      "/api/holds",
      undefined,
      () => delay(store.holds())
    ),

  getUnits: () =>
    http<AmbulanceUnit[]>(
      "/api/ambulances",
      undefined,
      () => delay(store.units())
    ),

  getPredictions: () =>
    http<Prediction[]>(
      "/api/predictions",
      undefined,
      () => delay(store.predictions())
    ),

  declareIncident: (input: { type: Incident["type"]; label: string; severity_estimate: number }) =>
    http<Incident>(
      "/api/incidents",
      { method: "POST", body: JSON.stringify(input) },
      () => delay(store.declareIncident(input))
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
  }) =>
    http<{ patient: Patient; assignment: { hospital: Hospital; hold: BedHold; eta_minutes: number } | null }>(
      "/api/patients",
      { method: "POST", body: JSON.stringify(input) },
      () => delay(store.createPatient(input), 300)
    ),

  confirmArrival: (holdId: string) =>
    http<{ status: string; hold_id: string }>(
      `/api/hospitals/confirm/action?hold_id=${holdId}`,
      { method: "POST" },
      async () => {
        store.confirmArrival(holdId);
        return { status: "success", hold_id: holdId };
      }
    ),

  rejectHold: (holdId: string) =>
    http<{ hospital: Hospital; hold: BedHold; eta_minutes: number } | null>(
      `/api/hospitals/reject/action?hold_id=${holdId}`,
      { method: "POST" },
      () => delay(store.rejectHold(holdId), 300)
    ),

  confirmOnboard: (unitId: string) =>
    http<{ status: string; unit_id: string }>(
      `/api/ambulances/${unitId}/onboard`,
      { method: "POST" },
      async () => {
        store.confirmOnboard(unitId);
        return { status: "success", unit_id: unitId };
      }
    ),

  updateResources: (hospitalId: string, patch: Partial<Hospital>) =>
    http<Hospital>(
      `/api/hospitals/${hospitalId}/resources`,
      { method: "PATCH", body: JSON.stringify(patch) },
      async () => {
        store.updateResources(hospitalId, patch);
        return store.hospital(hospitalId)!;
      }
    ),

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
    >(
      `/api/patients/search${queryString}`,
      undefined,
      () => delay(store.search(q), 300)
    );
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
    } | null>(
      `/api/patients/${encodeURIComponent(trackingId)}`,
      undefined,
      async () => {
        const p = store.patientByTracking(trackingId);
        if (!p) return delay(null, 300);
        return delay(store.search({ tracking_id: p.tracking_id })[0] ?? null, 300);
      }
    ),
};

/** Real WebSocket client for /ws/network with automatic reconnect & fallback */
export function useNetworkChannel(onEvent?: (e: NetworkEvent) => void) {
  const qc = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    startBackgroundJobs();
    let socket: WebSocket | null = null;
    let fallbackUnsub: (() => void) | null = null;
    let isCancelled = false;

    function connectWS() {
      try {
        socket = new WebSocket(`${WS_BASE}/ws/network`);
        socket.onopen = () => {
          if (!isCancelled) {
            setIsConnected(true);
            isBackendAvailable = true;
          }
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
        socket.onerror = () => {
          if (!isCancelled) {
            setIsConnected(false);
          }
        };
        socket.onclose = () => {
          if (!isCancelled) {
            setIsConnected(false);
            // Attach fallback channel
            if (!fallbackUnsub) {
              fallbackUnsub = subscribeNetwork((e) => {
                qc.invalidateQueries();
                onEvent?.(e);
              });
            }
          }
        };
      } catch {
        if (!isCancelled) {
          setIsConnected(false);
          fallbackUnsub = subscribeNetwork((e) => {
            qc.invalidateQueries();
            onEvent?.(e);
          });
        }
      }
    }

    connectWS();

    return () => {
      isCancelled = true;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (fallbackUnsub) {
        fallbackUnsub();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  return { isConnected };
}

export type ResourceType = "bed" | "icu" | "ot";
export type Severity = "red" | "yellow" | "green" | "black";
export type PatientStatus = "dispatched" | "en_route" | "admitted" | "discharged";
export type HoldStatus = "active" | "confirmed" | "released" | "expired";

export interface Hospital {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  total_beds: number;
  available_beds: number;
  icu_total: number;
  icu_available: number;
  ot_total: number;
  ot_available: number;
  blood_bank_status: Record<string, number>;
  network_id: string;
}

export interface Incident {
  id: string;
  type: "MCI" | "disaster" | "pandemic";
  declared_at: string;
  status: "active" | "resolved";
  network_id: string;
  severity_estimate: number;
  label: string;
}

export interface Patient {
  id: string;
  tracking_id: string;
  incident_id: string | null;
  name: string | null;
  age_range: string;
  gender: string;
  identifying_marks: string;
  suspected_condition: string;
  severity: Severity;
  status: PatientStatus;
  assigned_hospital_id: string | null;
  pickup_location: string;
  pickup_area: string;
  created_at: string;
}

export interface BedHold {
  id: string;
  patient_id: string;
  hospital_id: string;
  resource_type: ResourceType;
  resource_label: string;
  held_at: string;
  expires_at: string;
  status: HoldStatus;
}

export interface AmbulanceUnit {
  id: string;
  unit_code: string;
  current_location: string;
  status: "idle" | "dispatched" | "onboard" | "arrived";
  assigned_patient_id: string | null;
  eta_minutes: number;
}

export interface Prediction {
  id: string;
  hospital_id: string;
  resource_type: ResourceType;
  predicted_shortfall_at: string;
  shortfall: number;
  confidence: number;
  generated_at: string;
  series: { t: string; projected: number; capacity: number }[];
}

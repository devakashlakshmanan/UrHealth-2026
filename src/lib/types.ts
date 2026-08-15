export type ResourceType = "bed" | "icu" | "ot";
export type Severity = "red" | "yellow" | "green" | "black";
export type PatientStatus = "dispatched" | "en_route" | "admitted" | "discharged";
export type HoldStatus = "active" | "confirmed" | "released" | "expired";
export type BedSlotStatus = "available" | "held" | "occupied" | "sanitizing";

export interface BedSlot {
  id: string;
  room_number: string;
  bed_code: string;
  unit_type: "icu" | "ward" | "ot" | "trauma_bay";
  status: BedSlotStatus;
  patient_id?: string | null;
  patient_tracking_id?: string | null;
  held_expires_at?: string | null;
}

export interface PatientVitals {
  heartRate: number; // bpm
  systolicBP: number; // mmHg
  diastolicBP: number; // mmHg
  spO2: number; // %
  respRate: number; // breaths/min
  gcs: number; // Glasgow Coma Scale (3-15)
  tempCelsius: number;
}

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
  
  // Extended Clinical & Facility Capabilities
  trauma_level?: 1 | 2 | 3;
  burn_unit?: boolean;
  pediatric_er?: boolean;
  helipad?: boolean;
  ct_scan?: boolean;
  decon_ready?: boolean;
  phone_emergency?: string;
  chief_of_emergency?: string;
  bed_matrix?: BedSlot[];
  staff_on_duty?: {
    traumaSurgeons: number;
    erNurses: number;
    anesthesiologists: number;
  };
}

export interface Incident {
  id: string;
  type: "MCI" | "disaster" | "pandemic";
  declared_at: string;
  status: "active" | "resolved";
  network_id: string;
  severity_estimate: number;
  label: string;
  casualties_estimated?: number;
  evacuation_zone?: string;
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
  
  // Extended Clinical Vitals & Injury Tags
  vitals?: PatientVitals;
  injury_tags?: string[];
  field_notes?: string;
  paramedic_unit?: string;
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
  driver_name?: string;
  paramedic_lead?: string;
  fuel_pct?: number;
  speed_kmh?: number;
  live_vitals?: PatientVitals;
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

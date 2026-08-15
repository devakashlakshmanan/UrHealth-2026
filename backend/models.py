import json
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Column, JSON

class Hospital(SQLModel, table=True):
    __tablename__ = "hospitals"
    id: str = Field(primary_key=True)
    name: str
    address: str
    lat: float
    lng: float
    total_beds: int
    available_beds: int
    icu_total: int
    icu_available: int
    ot_total: int
    ot_available: int
    blood_bank_status: Dict[str, int] = Field(default={}, sa_column=Column(JSON))
    network_id: str = Field(default="net-central")

class Incident(SQLModel, table=True):
    __tablename__ = "incidents"
    id: str = Field(primary_key=True)
    type: str  # "MCI", "disaster", "pandemic"
    declared_at: str
    status: str  # "active", "resolved"
    network_id: str = Field(default="net-central")
    severity_estimate: int
    label: str

class Patient(SQLModel, table=True):
    __tablename__ = "patients"
    id: str = Field(primary_key=True)
    tracking_id: str = Field(index=True, unique=True)
    incident_id: Optional[str] = Field(default=None, foreign_key="incidents.id")
    name: Optional[str] = Field(default=None)
    age_range: str
    gender: str
    identifying_marks: str = Field(default="")
    suspected_condition: str = Field(default="")
    severity: str  # "red", "yellow", "green", "black"
    status: str  # "dispatched", "en_route", "admitted", "discharged"
    assigned_hospital_id: Optional[str] = Field(default=None, foreign_key="hospitals.id")
    pickup_location: str
    pickup_area: str
    created_at: str

class BedHold(SQLModel, table=True):
    __tablename__ = "bed_holds"
    id: str = Field(primary_key=True)
    patient_id: str = Field(foreign_key="patients.id")
    hospital_id: str = Field(foreign_key="hospitals.id")
    resource_type: str  # "bed", "icu", "ot"
    resource_label: str
    held_at: str
    expires_at: str
    status: str  # "active", "confirmed", "released", "expired"

class AmbulanceUnit(SQLModel, table=True):
    __tablename__ = "ambulance_units"
    id: str = Field(primary_key=True)
    unit_code: str
    current_location: str
    status: str  # "idle", "dispatched", "onboard", "arrived"
    assigned_patient_id: Optional[str] = Field(default=None)
    eta_minutes: int = Field(default=0)

class Prediction(SQLModel, table=True):
    __tablename__ = "predictions"
    id: str = Field(primary_key=True)
    hospital_id: str = Field(foreign_key="hospitals.id")
    resource_type: str  # "bed", "icu", "ot"
    predicted_shortfall_at: str = Field(default="")
    shortfall: int = Field(default=0)
    confidence: float = Field(default=0.0)
    generated_at: str
    series: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))

# --- Auth & Audit Log Models ---

class PublicUser(SQLModel, table=True):
    __tablename__ = "public_users"
    id: str = Field(primary_key=True)
    google_sub: str = Field(index=True, unique=True)
    email: str
    name: str
    picture: Optional[str] = None
    created_at: str

class StaffAccount(SQLModel, table=True):
    __tablename__ = "staff_accounts"
    id: str = Field(primary_key=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    role: str  # "district_admin", "hospital_coordinator", "triage_staff", "ambulance_crew"
    hospital_id: Optional[str] = Field(default=None, foreign_key="hospitals.id")
    unit_id: Optional[str] = Field(default=None)
    created_by_admin_id: Optional[str] = None
    created_at: str

class ReunificationSearchLog(SQLModel, table=True):
    __tablename__ = "reunification_search_logs"
    id: str = Field(primary_key=True)
    public_user_id: Optional[str] = Field(default=None, foreign_key="public_users.id")
    searched_at: str
    query_type: str  # "tracking_id" or "descriptive_filters"
    query_params: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    tracking_id_result: Optional[str] = None
    ip_address: str = "127.0.0.1"

# --- DTOs / Request & Response Schemas ---

class IncidentCreate(SQLModel):
    type: str = "MCI"
    label: str
    severity_estimate: int = 4

class PatientCreate(SQLModel):
    name: Optional[str] = None
    age_range: str
    gender: str
    identifying_marks: str = ""
    suspected_condition: str = ""
    severity: str
    pickup_location: str
    pickup_area: str
    incident_id: Optional[str] = None

class ResourceUpdate(SQLModel):
    available_beds: Optional[int] = None
    icu_available: Optional[int] = None
    ot_available: Optional[int] = None

class PublicPatientView(SQLModel):
    tracking_id: str
    status: str
    age_range: str
    gender: str
    pickup_area: str
    hospital_name: Optional[str] = None
    hospital_address: Optional[str] = None
    updated_at: str

class GoogleAuthRequest(SQLModel):
    id_token: str

class StaffAccountCreate(SQLModel):
    email: str
    username: str
    password: str
    role: str
    hospital_id: Optional[str] = None
    unit_id: Optional[str] = None

class StaffAccountResponse(SQLModel):
    id: str
    email: str
    username: str
    role: str
    hospital_id: Optional[str] = None
    unit_id: Optional[str] = None
    created_by_admin_id: Optional[str] = None
    created_at: str

class StaffLoginRequest(SQLModel):
    username_or_email: str
    password: str

class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user: Dict[str, Any]


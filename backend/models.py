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

import random
import string
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from sqlmodel import Session, select
from backend.models import Hospital, Patient, BedHold, AmbulanceUnit
from backend.predictions import refresh_predictions, minutes_to_saturation, get_available_capacity

def random_id(prefix: str) -> str:
    rand_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}-{rand_str}"

def generate_tracking_id() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = ''.join(random.choices(alphabet, k=6))
    return f"UH-{code}"

def required_resource(severity: str) -> str:
    if severity == "red":
        return "icu"
    elif severity == "yellow":
        return "ot"
    return "bed"

def pseudo_eta(hospital: Hospital) -> int:
    return 6 + round((abs(hospital.lat - 19.06) + abs(hospital.lng - 72.88)) * 260)

def decrement_hospital_capacity(hospital: Hospital, resource_type: str, amount: int = 1):
    if resource_type == "icu":
        hospital.icu_available = max(0, hospital.icu_available - amount)
    elif resource_type == "ot":
        hospital.ot_available = max(0, hospital.ot_available - amount)
    else:
        hospital.available_beds = max(0, hospital.available_beds - amount)

def increment_hospital_capacity(hospital: Hospital, resource_type: str, amount: int = 1):
    if resource_type == "icu":
        hospital.icu_available = min(hospital.icu_total, hospital.icu_available + amount)
    elif resource_type == "ot":
        hospital.ot_available = min(hospital.ot_total, hospital.ot_available + amount)
    else:
        hospital.available_beds = min(hospital.total_beds, hospital.available_beds + amount)

def assign_patient_to_best_fit(session: Session, patient_id: str, exclude_hospital_ids: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    if exclude_hospital_ids is None:
        exclude_hospital_ids = []

    patient = session.get(Patient, patient_id)
    if not patient:
        return None

    need = required_resource(patient.severity)
    hospitals = session.exec(select(Hospital)).all()

    candidates = []
    for h in hospitals:
        if h.id in exclude_hospital_ids:
            continue
        
        eta = pseudo_eta(h)
        avail = get_available_capacity(h, need)
        if avail <= 0:
            continue

        sat = minutes_to_saturation(session, h.id, need)
        sat_penalty = 40 if sat < (eta + 15) else (12 if sat < 120 else 0)
        score = avail * 4 - eta * 1.2 - sat_penalty
        candidates.append({"hospital": h, "eta": eta, "avail": avail, "sat": sat, "score": score})

    if not candidates:
        return None

    # Sort descending by score
    candidates.sort(key=lambda x: x["score"], reverse=True)
    best = candidates[0]
    best_hospital: Hospital = best["hospital"]
    eta_mins: int = best["eta"]

    # Decrement resource capacity
    decrement_hospital_capacity(best_hospital, need, 1)
    session.add(best_hospital)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=eta_mins + 10)

    label_prefix = "ICU bed" if need == "icu" else ("OT slot" if need == "ot" else "Ward bed")
    resource_label = f"{label_prefix} #{random.randint(1, 40)}"

    hold = BedHold(
        id=random_id("hold"),
        patient_id=patient.id,
        hospital_id=best_hospital.id,
        resource_type=need,
        resource_label=resource_label,
        held_at=now.isoformat(),
        expires_at=expires_at.isoformat(),
        status="active"
    )
    session.add(hold)

    patient.assigned_hospital_id = best_hospital.id
    patient.status = "dispatched"
    session.add(patient)

    # Assign unit if available or already assigned
    unit = session.exec(
        select(AmbulanceUnit).where(AmbulanceUnit.assigned_patient_id == patient.id)
    ).first()
    if not unit:
        unit = session.exec(
            select(AmbulanceUnit).where(AmbulanceUnit.status == "idle")
        ).first()

    if unit:
        unit.assigned_patient_id = patient.id
        unit.status = "dispatched"
        unit.eta_minutes = eta_mins
        session.add(unit)

    session.commit()
    session.refresh(patient)
    session.refresh(hold)
    session.refresh(best_hospital)

    refresh_predictions(session)

    return {
        "patient": patient,
        "hold": hold,
        "hospital": best_hospital,
        "eta_minutes": eta_mins
    }

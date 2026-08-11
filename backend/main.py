import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from backend.database import init_db, get_session, engine
from backend.models import (
    Hospital, Incident, Patient, BedHold, AmbulanceUnit, Prediction,
    IncidentCreate, PatientCreate, ResourceUpdate, PublicPatientView
)
from backend.predictions import refresh_predictions
from backend.routing import (
    random_id, generate_tracking_id, assign_patient_to_best_fit,
    increment_hospital_capacity
)

def to_dict(obj):
    if obj is None:
        return None
    if hasattr(obj, "__table__"):
        d = {}
        for col in obj.__table__.columns:
            val = getattr(obj, col.name)
            d[col.name] = val
        return d
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return obj

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        payload = json.dumps(message)
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                to_remove.append(connection)
        for conn in to_remove:
            self.disconnect(conn)

manager = ConnectionManager()

# --- Background Task for Hold Expiry & Periodic Predictions ---
async def hold_expiry_checker():
    while True:
        try:
            await asyncio.sleep(5)
            now = datetime.now(timezone.utc)
            with Session(engine) as session:
                active_holds = session.exec(
                    select(BedHold).where(BedHold.status == "active")
                ).all()

                for hold in active_holds:
                    try:
                        exp_dt = datetime.fromisoformat(hold.expires_at)
                        if exp_dt < now:
                            hold.status = "expired"
                            session.add(hold)

                            # Return capacity to hospital
                            h = session.get(Hospital, hold.hospital_id)
                            if h:
                                increment_hospital_capacity(h, hold.resource_type, 1)
                                session.add(h)

                            session.commit()

                            # Notify WebSocket
                            await manager.broadcast({
                                "type": "hold_expired",
                                "hold": to_dict(hold)
                            })

                            # Auto re-route patient excluding expired hospital
                            new_assignment = assign_patient_to_best_fit(
                                session, hold.patient_id, exclude_hospital_ids=[hold.hospital_id]
                            )
                            if new_assignment:
                                await manager.broadcast({
                                    "type": "assignment",
                                    "patient": to_dict(new_assignment["patient"]),
                                    "hold": to_dict(new_assignment["hold"])
                                })
                    except Exception as e:
                        print(f"Error checking hold {hold.id}: {e}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in hold_expiry_checker loop: {e}")

async def periodic_prediction_refresher():
    while True:
        try:
            await asyncio.sleep(60)
            with Session(engine) as session:
                refresh_predictions(session)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in periodic_prediction_refresher: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(engine) as session:
        refresh_predictions(session)

    expiry_task = asyncio.create_task(hold_expiry_checker())
    pred_task = asyncio.create_task(periodic_prediction_refresher())
    yield
    expiry_task.cancel()
    pred_task.cancel()

app = FastAPI(
    title="UrHealth Emergency Orchestration & Re-Unification API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WebSocket Channel ---
@app.websocket("/ws/network")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# --- REST Endpoints ---

@app.get("/api/network/status")
def get_network_status(session: Session = Depends(get_session)):
    hospitals = session.exec(select(Hospital)).all()
    incidents = session.exec(select(Incident)).all()
    return {
        "hospitals": [to_dict(h) for h in hospitals],
        "incidents": [to_dict(i) for i in incidents]
    }

@app.get("/api/hospitals")
def get_hospitals(session: Session = Depends(get_session)):
    return [to_dict(h) for h in session.exec(select(Hospital)).all()]

@app.get("/api/hospitals/{hospital_id}")
def get_hospital(hospital_id: str, session: Session = Depends(get_session)):
    h = session.get(Hospital, hospital_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return to_dict(h)

@app.get("/api/incidents")
def get_incidents(session: Session = Depends(get_session)):
    return [to_dict(i) for i in session.exec(select(Incident)).all()]

@app.post("/api/incidents")
async def declare_incident(input_data: IncidentCreate, session: Session = Depends(get_session)):
    inc = Incident(
        id=random_id("inc"),
        type=input_data.type,
        declared_at=datetime.now(timezone.utc).isoformat(),
        status="active",
        network_id="net-central",
        severity_estimate=input_data.severity_estimate,
        label=input_data.label
    )
    session.add(inc)
    session.commit()
    session.refresh(inc)

    refresh_predictions(session)
    inc_dict = to_dict(inc)
    await manager.broadcast({"type": "incident_declared", "incident": inc_dict})
    return inc_dict

@app.get("/api/patients")
def get_patients(session: Session = Depends(get_session)):
    patients = session.exec(select(Patient).order_by(Patient.created_at.desc())).all()
    return [to_dict(p) for p in patients]

@app.post("/api/patients")
async def create_patient(input_data: PatientCreate, session: Session = Depends(get_session)):
    active_inc = session.exec(select(Incident).where(Incident.status == "active")).first()
    incident_id = input_data.incident_id or (active_inc.id if active_inc else None)

    patient = Patient(
        id=random_id("pat"),
        tracking_id=generate_tracking_id(),
        incident_id=incident_id,
        name=input_data.name.strip() if input_data.name and input_data.name.strip() else None,
        age_range=input_data.age_range,
        gender=input_data.gender,
        identifying_marks=input_data.identifying_marks,
        suspected_condition=input_data.suspected_condition,
        severity=input_data.severity,
        status="dispatched",
        assigned_hospital_id=None,
        pickup_location=input_data.pickup_location,
        pickup_area=input_data.pickup_area,
        created_at=datetime.now(timezone.utc).isoformat()
    )
    session.add(patient)
    session.commit()
    session.refresh(patient)

    assignment = assign_patient_to_best_fit(session, patient.id)
    session.refresh(patient)
    patient_dict = to_dict(patient)

    if assignment:
        hold_dict = to_dict(assignment["hold"])
        h_dict = to_dict(assignment["hospital"])
        await manager.broadcast({"type": "assignment", "patient": patient_dict, "hold": hold_dict})
        await manager.broadcast({"type": "resources_updated", "hospital": h_dict})
        assignment_resp = {
            "hospital": h_dict,
            "hold": hold_dict,
            "eta_minutes": assignment["eta_minutes"]
        }
    else:
        assignment_resp = None

    return {"patient": patient_dict, "assignment": assignment_resp}

@app.get("/api/patients/search", response_model=List[PublicPatientView])
def search_patients_public(
    tracking_id: Optional[str] = Query(None),
    age_range: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    session: Session = Depends(get_session)
):
    query = select(Patient)
    results = session.exec(query).all()

    filtered = []
    for p in results:
        if tracking_id and tracking_id.strip():
            if tracking_id.strip().lower() not in p.tracking_id.lower():
                continue
        else:
            if age_range and age_range != "any" and p.age_range != age_range:
                continue
            if gender and gender != "any" and p.gender != gender:
                continue
            if area and area.strip() and area.strip().lower() not in p.pickup_area.lower():
                continue
            if not (age_range and age_range != "any") and not (gender and gender != "any") and not (area and area.strip()):
                continue

        h = session.get(Hospital, p.assigned_hospital_id) if p.assigned_hospital_id else None
        filtered.append(
            PublicPatientView(
                tracking_id=p.tracking_id,
                status=p.status,
                age_range=p.age_range,
                gender=p.gender,
                pickup_area=p.pickup_area,
                hospital_name=h.name if h else None,
                hospital_address=h.address if h else None,
                updated_at=p.created_at
            )
        )

    return filtered

@app.get("/api/patients/{tracking_id}")
def lookup_patient_public(tracking_id: str, session: Session = Depends(get_session)):
    patient = session.exec(
        select(Patient).where(Patient.tracking_id.ilike(tracking_id.strip()))
    ).first()
    if not patient:
        return None

    h = session.get(Hospital, patient.assigned_hospital_id) if patient.assigned_hospital_id else None
    return PublicPatientView(
        tracking_id=patient.tracking_id,
        status=patient.status,
        age_range=patient.age_range,
        gender=patient.gender,
        pickup_area=patient.pickup_area,
        hospital_name=h.name if h else None,
        hospital_address=h.address if h else None,
        updated_at=patient.created_at
    )

@app.get("/api/holds")
def get_holds(session: Session = Depends(get_session)):
    holds = session.exec(select(BedHold).order_by(BedHold.held_at.desc())).all()
    return [to_dict(h) for h in holds]

@app.post("/api/hospitals/confirm/action")
@app.post("/api/hospitals/{hospital_id}/confirm")
async def confirm_arrival(hold_id: str, hospital_id: Optional[str] = None, session: Session = Depends(get_session)):
    hold = session.get(BedHold, hold_id)
    if not hold:
        raise HTTPException(status_code=404, detail="Hold not found")
    
    hold.status = "confirmed"
    session.add(hold)

    patient = session.get(Patient, hold.patient_id)
    if patient:
        patient.status = "admitted"
        session.add(patient)

    session.commit()
    refresh_predictions(session)

    if patient:
        p_dict = to_dict(patient)
        await manager.broadcast({"type": "patient_updated", "patient": p_dict})

    return {"status": "success", "hold_id": hold_id}

@app.post("/api/hospitals/reject/action")
@app.post("/api/hospitals/{hospital_id}/reject")
async def reject_hold(hold_id: str, hospital_id: Optional[str] = None, session: Session = Depends(get_session)):
    hold = session.get(BedHold, hold_id)
    if not hold:
        raise HTTPException(status_code=404, detail="Hold not found")

    hold.status = "released"
    session.add(hold)

    h = session.get(Hospital, hold.hospital_id)
    if h:
        increment_hospital_capacity(h, hold.resource_type, 1)
        session.add(h)
        session.commit()
        session.refresh(h)
        await manager.broadcast({
            "type": "resources_updated",
            "hospital": to_dict(h)
        })

    # Re-run best fit excluding rejecting hospital
    new_assignment = assign_patient_to_best_fit(session, hold.patient_id, exclude_hospital_ids=[hold.hospital_id])

    if new_assignment:
        p_dict = to_dict(new_assignment["patient"])
        hold_dict = to_dict(new_assignment["hold"])
        h_dict = to_dict(new_assignment["hospital"])
        await manager.broadcast({"type": "assignment", "patient": p_dict, "hold": hold_dict})
        await manager.broadcast({"type": "resources_updated", "hospital": h_dict})
        return {
            "hospital": h_dict,
            "hold": hold_dict,
            "eta_minutes": new_assignment["eta_minutes"]
        }
    return None

@app.patch("/api/hospitals/{hospital_id}/resources")
async def update_resources(hospital_id: str, patch: ResourceUpdate, session: Session = Depends(get_session)):
    h = session.get(Hospital, hospital_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")

    if patch.available_beds is not None:
        h.available_beds = max(0, patch.available_beds)
    if patch.icu_available is not None:
        h.icu_available = max(0, patch.icu_available)
    if patch.ot_available is not None:
        h.ot_available = max(0, patch.ot_available)

    session.add(h)
    session.commit()
    session.refresh(h)

    refresh_predictions(session)
    h_dict = to_dict(h)
    await manager.broadcast({"type": "resources_updated", "hospital": h_dict})
    return h_dict

@app.get("/api/ambulances")
def get_ambulances(session: Session = Depends(get_session)):
    units = session.exec(select(AmbulanceUnit)).all()
    return [to_dict(u) for u in units]

@app.post("/api/ambulances/{unit_id}/onboard")
async def confirm_onboard(unit_id: str, session: Session = Depends(get_session)):
    u = session.get(AmbulanceUnit, unit_id)
    if not u or not u.assigned_patient_id:
        raise HTTPException(status_code=404, detail="Unit or assigned patient not found")

    u.status = "onboard"
    session.add(u)

    p = session.get(Patient, u.assigned_patient_id)
    if p:
        p.status = "en_route"
        session.add(p)

    session.commit()

    if p:
        p_dict = to_dict(p)
        await manager.broadcast({"type": "patient_updated", "patient": p_dict})

    return {"status": "success", "unit_id": unit_id}

@app.get("/api/predictions")
def get_predictions(session: Session = Depends(get_session)):
    preds = session.exec(select(Prediction)).all()
    return [to_dict(p) for p in preds]

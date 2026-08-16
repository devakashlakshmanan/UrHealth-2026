import asyncio
import hashlib
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

import google.oauth2.id_token
import google.auth.transport.requests

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from backend.database import init_db, get_session, engine
from backend.models import (
    Hospital, Incident, Patient, BedHold, AmbulanceUnit, Prediction,
    PublicUser, StaffAccount, ReunificationSearchLog,
    IncidentCreate, PatientCreate, ResourceUpdate, PublicPatientView,
    GoogleAuthRequest, StaffLoginRequest, TokenResponse,
    StaffAccountCreate, StaffAccountResponse
)
from backend.predictions import refresh_predictions
from backend.routing import (
    random_id, generate_tracking_id, assign_patient_to_best_fit,
    increment_hospital_capacity
)
from backend.auth import (
    create_jwt_token, decode_jwt_token, get_current_user,
    get_current_user_optional, require_roles, verify_hospital_access,
    verify_password, hash_password
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

# --- Background Tasks ---
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

                            h = session.get(Hospital, hold.hospital_id)
                            if h:
                                increment_hospital_capacity(h, hold.resource_type, 1)
                                session.add(h)

                            session.commit()

                            await manager.broadcast({
                                "type": "hold_expired",
                                "hold": to_dict(hold)
                            })

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
allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
if allowed_origins_raw.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- Health & Root Endpoints ---
@app.get("/")
def root():
    return {
        "status": "online",
        "service": "UrHealth Emergency Orchestration & Re-Unification API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# --- WebSocket Channel (Staff Roles Only) ---
@app.websocket("/ws/network")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    if not token:
        await websocket.close(code=4001, reason="Token required for WebSocket connection")
        return
    try:
        payload = decode_jwt_token(token)
        if payload.get("role") not in ["district_admin", "hospital_coordinator", "triage_staff", "ambulance_crew"]:
            await websocket.close(code=4003, reason="Staff authentication required")
            return
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# --- Authentication Endpoints ---

@app.post("/api/auth/google", response_model=TokenResponse)
def google_auth(req: GoogleAuthRequest, session: Session = Depends(get_session)):
    """Authenticate Google user (Public Surface). Verifies Google ID token against Google's public keys."""
    if not req.id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google id_token is required"
        )
    
    google_client_id = os.getenv("VITE_GOOGLE_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID")
    
    try:
        request_adapter = google.auth.transport.requests.Request()
        id_info = google.oauth2.id_token.verify_oauth2_token(
            req.id_token,
            request_adapter,
            audience=google_client_id if google_client_id else None
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google ID token verification failed: {str(e)}"
        )

    google_sub = id_info.get("sub")
    email = id_info.get("email")
    name = id_info.get("name") or (email.split("@")[0].capitalize() if email else "Google User")
    picture = id_info.get("picture")

    if not google_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Verified Google payload missing required sub/email fields"
        )

    user = session.exec(select(PublicUser).where(PublicUser.google_sub == google_sub)).first()
    if not user:
        user = PublicUser(
            id=random_id("pubuser"),
            google_sub=google_sub,
            email=email,
            name=name,
            picture=picture,
            created_at=datetime.now(timezone.utc).isoformat()
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        user.email = email
        user.name = name
        user.picture = picture
        session.add(user)
        session.commit()

    token_payload = {
        "sub": user.id,
        "public_user_id": user.id,
        "email": user.email,
        "name": user.name,
        "role": "public"
    }
    access_token = create_jwt_token(token_payload)

    return TokenResponse(
        access_token=access_token,
        role="public",
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "role": "public"
        }
    )


@app.post("/api/auth/staff/login", response_model=TokenResponse)
def staff_login(req: StaffLoginRequest, session: Session = Depends(get_session)):
    """Authenticate staff user against provisioned staff_accounts table."""
    identifier = req.username_or_email.strip().lower()
    staff = session.exec(
        select(StaffAccount).where(
            (StaffAccount.email.ilike(identifier)) | (StaffAccount.username.ilike(identifier))
        )
    ).first()

    if not staff or not verify_password(req.password, staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff credentials or unauthorized account"
        )

    token_payload = {
        "sub": staff.id,
        "email": staff.email,
        "name": staff.username,
        "role": staff.role,
        "hospital_id": staff.hospital_id,
        "unit_id": staff.unit_id
    }
    access_token = create_jwt_token(token_payload)

    return TokenResponse(
        access_token=access_token,
        role=staff.role,
        user={
            "id": staff.id,
            "email": staff.email,
            "username": staff.username,
            "role": staff.role,
            "hospital_id": staff.hospital_id,
            "unit_id": staff.unit_id
        }
    )

@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get current active session user info."""
    return current_user

@app.post("/api/staff/accounts", response_model=StaffAccountResponse)
def create_staff_account(
    input_data: StaffAccountCreate,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["district_admin"]))
):
    """District Admin endpoint to create a new StaffAccount."""
    email = input_data.email.strip().lower()
    username = input_data.username.strip().lower()
    
    existing_email = session.exec(select(StaffAccount).where(StaffAccount.email.ilike(email))).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Staff account with this email already exists")
        
    existing_username = session.exec(select(StaffAccount).where(StaffAccount.username.ilike(username))).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Staff account with this username already exists")

    new_staff = StaffAccount(
        id=random_id("staff"),
        email=email,
        username=username,
        password_hash=hash_password(input_data.password),
        role=input_data.role,
        hospital_id=input_data.hospital_id,
        unit_id=input_data.unit_id,
        created_by_admin_id=current_user.get("sub"),
        created_at=datetime.now(timezone.utc).isoformat()
    )
    session.add(new_staff)
    session.commit()
    session.refresh(new_staff)

    return StaffAccountResponse(
        id=new_staff.id,
        email=new_staff.email,
        username=new_staff.username,
        role=new_staff.role,
        hospital_id=new_staff.hospital_id,
        unit_id=new_staff.unit_id,
        created_by_admin_id=new_staff.created_by_admin_id,
        created_at=new_staff.created_at
    )

@app.get("/api/staff/accounts", response_model=List[StaffAccountResponse])
def get_staff_accounts(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["district_admin"]))
):
    """District Admin endpoint to list all staff accounts (password hashes omitted)."""
    accounts = session.exec(select(StaffAccount).order_by(StaffAccount.created_at.desc())).all()
    return [
        StaffAccountResponse(
            id=acc.id,
            email=acc.email,
            username=acc.username,
            role=acc.role,
            hospital_id=acc.hospital_id,
            unit_id=acc.unit_id,
            created_by_admin_id=acc.created_by_admin_id,
            created_at=acc.created_at
        )
        for acc in accounts
    ]


# --- Public Search Endpoints with Mandatory Audit Logging ---

@app.get("/api/patients/search", response_model=List[PublicPatientView])
def search_patients_public(
    request: Request,
    tracking_id: Optional[str] = Query(None),
    age_range: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Public patient search gated by authenticated session. Logs search audit entry first."""
    # Enforce role: public or any staff can search reunification
    raw_user_id = current_user.get("public_user_id") or current_user.get("sub")
    public_user_id = raw_user_id if raw_user_id and session.get(PublicUser, raw_user_id) else None
    client_ip = request.client.host if request.client else "127.0.0.1"

    query_params = {
        "tracking_id": tracking_id,
        "age_range": age_range,
        "gender": gender,
        "area": area
    }
    query_type = "tracking_id" if tracking_id else "descriptive_filters"

    query = select(Patient)
    results = session.exec(query).all()

    filtered = []
    found_tracking_ids = []
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

        found_tracking_ids.append(p.tracking_id)
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
                updated_at=p.created_at,
                name=p.name if (p.name and p.name.strip()) else "Unknown"
            )
        )

    # MANDATORY SEARCH AUDIT LOGGING: Log first before returning
    log_entry = ReunificationSearchLog(
        id=random_id("slog"),
        public_user_id=public_user_id,
        searched_at=datetime.now(timezone.utc).isoformat(),
        query_type=query_type,
        query_params=query_params,
        tracking_id_result=",".join(found_tracking_ids[:5]) if found_tracking_ids else None,
        ip_address=client_ip
    )
    session.add(log_entry)
    session.commit()

    return filtered

@app.get("/api/patients/{tracking_id}")
def lookup_patient_public(
    tracking_id: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Direct lookup of patient by tracking ID. Logs search audit entry first."""
    raw_user_id = current_user.get("public_user_id") or current_user.get("sub")
    public_user_id = raw_user_id if raw_user_id and session.get(PublicUser, raw_user_id) else None
    client_ip = request.client.host if request.client else "127.0.0.1"

    patient = session.exec(
        select(Patient).where(Patient.tracking_id.ilike(tracking_id.strip()))
    ).first()

    # MANDATORY SEARCH AUDIT LOGGING: Log first
    log_entry = ReunificationSearchLog(
        id=random_id("slog"),
        public_user_id=public_user_id,
        searched_at=datetime.now(timezone.utc).isoformat(),
        query_type="tracking_id",
        query_params={"tracking_id": tracking_id},
        tracking_id_result=patient.tracking_id if patient else None,
        ip_address=client_ip
    )
    session.add(log_entry)
    session.commit()

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
        updated_at=patient.created_at,
        name=patient.name if (patient.name and patient.name.strip()) else "Unknown"
    )

# --- Staff Operational Endpoints ---

STAFF_ROLES = ["district_admin", "hospital_coordinator", "triage_staff", "ambulance_crew"]

@app.get("/api/network/status")
def get_network_status(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    hospitals = session.exec(select(Hospital)).all()
    incidents = session.exec(select(Incident)).all()
    return {
        "hospitals": [to_dict(h) for h in hospitals],
        "incidents": [to_dict(i) for i in incidents]
    }

@app.get("/api/hospitals")
def get_hospitals(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    return [to_dict(h) for h in session.exec(select(Hospital)).all()]

@app.get("/api/hospitals/{hospital_id}")
def get_hospital(
    hospital_id: str,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    h = session.get(Hospital, hospital_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return to_dict(h)

@app.get("/api/incidents")
def get_incidents(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    return [to_dict(i) for i in session.exec(select(Incident)).all()]

@app.post("/api/incidents")
async def declare_incident(
    input_data: IncidentCreate,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["district_admin"]))
):
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
def get_patients(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    patients = session.exec(select(Patient).order_by(Patient.created_at.desc())).all()
    return [to_dict(p) for p in patients]

@app.post("/api/patients")
async def create_patient(
    input_data: PatientCreate,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["triage_staff", "ambulance_crew", "district_admin"]))
):
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

@app.get("/api/holds")
def get_holds(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    holds = session.exec(select(BedHold).order_by(BedHold.held_at.desc())).all()
    return [to_dict(h) for h in holds]

@app.post("/api/hospitals/confirm/action")
@app.post("/api/hospitals/{hospital_id}/confirm")
async def confirm_arrival(
    hold_id: str,
    hospital_id: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["hospital_coordinator", "district_admin"]))
):
    hold = session.get(BedHold, hold_id)
    if not hold:
        raise HTTPException(status_code=404, detail="Hold not found")
    
    target_h_id = hospital_id or hold.hospital_id
    verify_hospital_access(target_h_id, current_user)
    
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
async def reject_hold(
    hold_id: str,
    hospital_id: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["hospital_coordinator", "district_admin"]))
):
    hold = session.get(BedHold, hold_id)
    if not hold:
        raise HTTPException(status_code=404, detail="Hold not found")

    target_h_id = hospital_id or hold.hospital_id
    verify_hospital_access(target_h_id, current_user)

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
async def update_resources(
    hospital_id: str,
    patch: ResourceUpdate,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["hospital_coordinator", "district_admin"]))
):
    verify_hospital_access(hospital_id, current_user)
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
def get_ambulances(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    units = session.exec(select(AmbulanceUnit)).all()
    return [to_dict(u) for u in units]

@app.post("/api/ambulances/{unit_id}/onboard")
async def confirm_onboard(
    unit_id: str,
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["ambulance_crew", "district_admin"]))
):
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
def get_predictions(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(STAFF_ROLES))
):
    preds = session.exec(select(Prediction)).all()
    return [to_dict(p) for p in preds]

@app.get("/api/audit-logs")
def get_audit_logs(
    session: Session = Depends(get_session),
    current_user: Dict[str, Any] = Depends(require_roles(["district_admin"]))
):
    """District Admin endpoint to review reunification search audit logs."""
    logs = session.exec(select(ReunificationSearchLog).order_by(ReunificationSearchLog.searched_at.desc())).all()
    res = []
    for l in logs:
        user = session.get(PublicUser, l.public_user_id) if l.public_user_id else None
        res.append({
            "id": l.id,
            "public_user_id": l.public_user_id,
            "public_user_email": user.email if user else "Anonymous / Unknown",
            "public_user_name": user.name if user else "Unknown",
            "searched_at": l.searched_at,
            "query_type": l.query_type,
            "query_params": l.query_params,
            "tracking_id_result": l.tracking_id_result,
            "ip_address": l.ip_address
        })
    return res

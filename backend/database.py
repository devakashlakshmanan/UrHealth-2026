import os
from datetime import datetime, timezone
from sqlmodel import SQLModel, create_engine, Session, select
from backend.models import Hospital, Incident, AmbulanceUnit, StaffAccount
from backend.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./urhealth.db")

# connect_args={"check_same_thread": False} is needed for SQLite multi-thread FastAPI handlers
engine_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=engine_args)

def get_session():
    with Session(engine) as session:
        yield session

def init_db():
    SQLModel.metadata.create_all(engine)
    seed_data()

def seed_data():
    with Session(engine) as session:
        default_hospitals = [
            Hospital(
                id="h1",
                name="City General Hospital",
                address="12 Marine Drive, Sector 4",
                lat=19.076,
                lng=72.877,
                total_beds=420,
                available_beds=63,
                icu_total=40,
                icu_available=7,
                ot_total=12,
                ot_available=3,
                blood_bank_status={"O+": 24, "O-": 6, "A+": 18, "B+": 12, "AB+": 4},
                network_id="net-central",
            ),
            Hospital(
                id="h2",
                name="St. Anne Medical Center",
                address="88 Ridge Road, Northside",
                lat=19.104,
                lng=72.842,
                total_beds=260,
                available_beds=21,
                icu_total=22,
                icu_available=2,
                ot_total=8,
                ot_available=1,
                blood_bank_status={"O+": 14, "O-": 2, "A+": 10, "B+": 8, "AB+": 1},
                network_id="net-central",
            ),
            Hospital(
                id="h3",
                name="Riverside Trauma Institute",
                address="5 Riverside Way, East Bank",
                lat=19.041,
                lng=72.918,
                total_beds=180,
                available_beds=48,
                icu_total=30,
                icu_available=11,
                ot_total=10,
                ot_available=5,
                blood_bank_status={"O+": 30, "O-": 8, "A+": 22, "B+": 15, "AB+": 5},
                network_id="net-central",
            ),
            Hospital(
                id="h4",
                name="Meridian District Hospital",
                address="301 Meridian Ave, Southgate",
                lat=18.998,
                lng=72.861,
                total_beds=340,
                available_beds=95,
                icu_total=18,
                icu_available=4,
                ot_total=6,
                ot_available=2,
                blood_bank_status={"O+": 40, "O-": 10, "A+": 25, "B+": 20, "AB+": 6},
                network_id="net-central",
            ),
            Hospital(
                id="h5",
                name="Harbour Point Clinic",
                address="7 Dockyard Lane, Harbour",
                lat=19.062,
                lng=72.951,
                total_beds=90,
                available_beds=12,
                icu_total=6,
                icu_available=0,
                ot_total=3,
                ot_available=0,
                blood_bank_status={"O+": 5, "O-": 1, "A+": 4, "B+": 3, "AB+": 0},
                network_id="net-central",
            ),
        ]

        existing_hospitals = session.exec(select(Hospital)).all()
        if not existing_hospitals:
            for h in default_hospitals:
                session.add(h)
        else:
            existing_map = {h.id: h for h in existing_hospitals}
            for new_h in default_hospitals:
                if new_h.id in existing_map:
                    target = existing_map[new_h.id]
                    target.name = new_h.name
                    target.address = new_h.address
                    target.lat = new_h.lat
                    target.lng = new_h.lng
                    session.add(target)
                else:
                    session.add(new_h)

        existing_incidents = session.exec(select(Incident)).all()
        if not existing_incidents:
            inc = Incident(
                id="inc-1",
                type="MCI",
                declared_at=datetime.now(timezone.utc).isoformat(),
                status="active",
                network_id="net-central",
                severity_estimate=4,
                label="Multi-vehicle collision — Coastal Expressway KM 14",
            )
            session.add(inc)

        existing_units = session.exec(select(AmbulanceUnit)).all()
        if not existing_units:
            units = [
                AmbulanceUnit(id="u1", unit_code="AMB-114", current_location="Coastal Expressway KM 14", status="idle"),
                AmbulanceUnit(id="u2", unit_code="AMB-207", current_location="Sector 9 Depot", status="idle"),
                AmbulanceUnit(id="u3", unit_code="AMB-311", current_location="Northside Junction", status="idle"),
            ]
            for u in units:
                session.add(u)

        # Seed Staff Accounts if not present
        existing_staff = session.exec(select(StaffAccount)).all()
        if not existing_staff:
            now_iso = datetime.now(timezone.utc).isoformat()
            staff_list = [
                StaffAccount(
                    id="staff-admin-1",
                    email="admin@urhealth.org",
                    username="admin",
                    password_hash=hash_password("admin123"),
                    role="district_admin",
                    hospital_id=None,
                    unit_id=None,
                    created_at=now_iso
                ),
                StaffAccount(
                    id="staff-coord-h1",
                    email="coordinator.h1@urhealth.org",
                    username="coord_h1",
                    password_hash=hash_password("coord123"),
                    role="hospital_coordinator",
                    hospital_id="h1",
                    unit_id=None,
                    created_at=now_iso
                ),
                StaffAccount(
                    id="staff-coord-h2",
                    email="coordinator.h2@urhealth.org",
                    username="coord_h2",
                    password_hash=hash_password("coord123"),
                    role="hospital_coordinator",
                    hospital_id="h2",
                    unit_id=None,
                    created_at=now_iso
                ),
                StaffAccount(
                    id="staff-triage-1",
                    email="triage@urhealth.org",
                    username="triage_staff",
                    password_hash=hash_password("triage123"),
                    role="triage_staff",
                    hospital_id=None,
                    unit_id=None,
                    created_at=now_iso
                ),
                StaffAccount(
                    id="staff-crew-u1",
                    email="crew.u1@urhealth.org",
                    username="crew_u1",
                    password_hash=hash_password("crew123"),
                    role="ambulance_crew",
                    hospital_id=None,
                    unit_id="u1",
                    created_at=now_iso
                )
            ]
            for s in staff_list:
                session.add(s)

        session.commit()

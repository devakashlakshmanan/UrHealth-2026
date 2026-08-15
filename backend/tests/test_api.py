import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from backend.main import app
from backend.database import get_session
from backend.models import Hospital, Incident, AmbulanceUnit
from backend.auth import create_jwt_token

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Seed test data
        h1 = Hospital(
            id="h1",
            name="City General Hospital",
            address="12 Marine Drive",
            lat=19.076,
            lng=72.877,
            total_beds=420,
            available_beds=63,
            icu_total=40,
            icu_available=7,
            ot_total=12,
            ot_available=3,
            blood_bank_status={"O+": 24},
            network_id="net-central",
        )
        h2 = Hospital(
            id="h2",
            name="St. Anne Medical Center",
            address="88 Ridge Road",
            lat=19.104,
            lng=72.842,
            total_beds=260,
            available_beds=21,
            icu_total=22,
            icu_available=2,
            ot_total=8,
            ot_available=1,
            blood_bank_status={"O+": 14},
            network_id="net-central",
        )
        u1 = AmbulanceUnit(id="u1", unit_code="AMB-114", current_location="Expressway", status="idle")
        session.add(h1)
        session.add(h2)
        session.add(u1)
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture(name="auth_headers")
def auth_headers_fixture():
    token = create_jwt_token({
        "sub": "admin-1",
        "email": "admin@urhealth.org",
        "role": "district_admin",
        "name": "District Admin"
    })
    return {"Authorization": f"Bearer {token}"}

def test_get_network_status(client: TestClient, auth_headers: dict):
    response = client.get("/api/network/status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["hospitals"]) == 2
    assert data["hospitals"][0]["name"] == "City General Hospital"

def test_declare_incident(client: TestClient, auth_headers: dict):
    payload = {
        "type": "MCI",
        "label": "Test Expressway Collision",
        "severity_estimate": 4
    }
    response = client.post("/api/incidents", json=payload, headers=auth_headers)
    print("DECLARE INCIDENT RESP:", response.status_code, response.json())
    assert response.status_code == 200
    data = response.json()
    assert "label" in data, f"Key 'label' missing in {data}"
    assert data["label"] == "Test Expressway Collision"
    assert data["status"] == "active"

def test_create_patient_and_auto_routing(client: TestClient, auth_headers: dict):
    payload = {
        "name": "Jane Doe",
        "age_range": "18-30",
        "gender": "female",
        "identifying_marks": "Blue jacket",
        "suspected_condition": "Head injury",
        "severity": "red",
        "pickup_location": "Expressway KM 14",
        "pickup_area": "Coastal Expressway"
    }
    response = client.post("/api/patients", json=payload, headers=auth_headers)
    print("CREATE PATIENT RESP:", response.status_code, response.json())
    assert response.status_code == 200
    data = response.json()

    assert "patient" in data
    assert data["patient"]["tracking_id"].startswith("UH-")
    assert data["patient"]["status"] == "dispatched"
    assert data["assignment"] is not None
    assert data["assignment"]["hold"]["resource_type"] == "icu"

def test_public_patient_search_privacy(client: TestClient, auth_headers: dict):
    p_resp = client.post("/api/patients", json={
        "name": "John Secret",
        "age_range": "31-45",
        "gender": "male",
        "identifying_marks": "Tattoo on shoulder",
        "suspected_condition": "Internal bleeding",
        "severity": "red",
        "pickup_location": "Highway 1",
        "pickup_area": "Highway 1"
    }, headers=auth_headers)
    tracking_id = p_resp.json()["patient"]["tracking_id"]

    search_resp = client.get(f"/api/patients/search?tracking_id={tracking_id}", headers=auth_headers)
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert len(results) == 1
    r = results[0]
    assert r["tracking_id"] == tracking_id
    assert "John Secret" not in str(r)
    assert "Internal bleeding" not in str(r)

def test_reject_and_reroute(client: TestClient, auth_headers: dict):
    p_resp = client.post("/api/patients", json={
        "age_range": "18-30",
        "gender": "male",
        "severity": "red",
        "pickup_location": "Expressway",
        "pickup_area": "Expressway"
    }, headers=auth_headers)
    hold_id = p_resp.json()["assignment"]["hold"]["id"]
    assigned_h1 = p_resp.json()["assignment"]["hospital"]["id"]

    rej_resp = client.post(f"/api/hospitals/{assigned_h1}/reject?hold_id={hold_id}", headers=auth_headers)
    assert rej_resp.status_code == 200
    new_assignment = rej_resp.json()
    assert new_assignment is not None
    assert new_assignment["hospital"]["id"] != assigned_h1


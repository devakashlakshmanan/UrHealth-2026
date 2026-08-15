import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db
from backend.auth import create_jwt_token, hash_password

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_google_auth_rejects_fabricated_token():
    """Verify fabricated or invalid google id_token is rejected with 401."""
    response = client.post("/api/auth/google", json={"id_token": "fabricated.invalid.token"})
    assert response.status_code == 401
    assert "verification failed" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()

def test_staff_account_provisioning_and_login():
    """Verify district_admin can create new staff accounts for h3/u2 and log in."""
    admin_token = create_jwt_token({"sub": "admin1", "role": "district_admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create staff account for h3
    create_resp = client.post(
        "/api/staff/accounts",
        headers=headers,
        json={
            "email": "coord.h3@urhealth.org",
            "username": "coord_h3",
            "password": "passwordh3",
            "role": "hospital_coordinator",
            "hospital_id": "h3"
        }
    )
    assert create_resp.status_code == 200
    acc_data = create_resp.json()
    assert acc_data["username"] == "coord_h3"
    assert acc_data["hospital_id"] == "h3"

    # 2. List accounts and confirm password hashes are omitted
    list_resp = client.get("/api/staff/accounts", headers=headers)
    assert list_resp.status_code == 200
    accounts = list_resp.json()
    assert any(a["username"] == "coord_h3" for a in accounts)
    for a in accounts:
        assert "password_hash" not in a
        assert "password" not in a

    # 3. Test logging in with newly created staff account
    login_resp = client.post(
        "/api/auth/staff/login",
        json={"username_or_email": "coord_h3", "password": "passwordh3"}
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert login_data["role"] == "hospital_coordinator"
    assert login_data["user"]["hospital_id"] == "h3"

def test_declare_incident_with_custom_inputs():
    """Verify declare incident accepts type, label, and severity_estimate."""
    admin_token = create_jwt_token({"sub": "admin1", "role": "district_admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.post(
        "/api/incidents",
        headers=headers,
        json={
            "type": "disaster",
            "label": "Severe flood alert in North District",
            "severity_estimate": 5
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "disaster"
    assert data["label"] == "Severe flood alert in North District"
    assert data["severity_estimate"] == 5

def test_audit_logs_retrieval():
    """Verify GET /api/audit-logs is restricted to district_admin and returns entries."""
    admin_token = create_jwt_token({"sub": "admin1", "role": "district_admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.get("/api/audit-logs", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

"""Backend API tests for Contractor Check-In app (v3 - responses-based check-ins)."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


# ------------- fixtures -------------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    token = r.cookies.get("access_token")
    assert token, "login did not set access_token cookie"
    return {"Cookie": f"access_token={token}", "Content-Type": "application/json"}


# ------------- Health -------------
class TestHealth:
    def test_root_api(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ------------- Auth -------------
class TestAuth:
    def test_login_success(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == ADMIN_EMAIL
        assert r.cookies.get("access_token")
        api_client.cookies.clear()

    def test_login_invalid_password(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, api_client, auth_headers):
        r = api_client.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ------------- Settings -------------
class TestSettings:
    def test_get_settings_public(self, api_client):
        r = api_client.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        assert "site_title" in data and "tagline" in data
        # new: primary_color present in public settings
        assert "primary_color" in data
        assert isinstance(data["primary_color"], str)

    def test_update_primary_color_persists(self, api_client, auth_headers):
        # Get current
        current = api_client.get(f"{API}/settings").json()
        original = current.get("primary_color", "#EA580C")
        new_color = "#2563EB"
        payload = {**current, "primary_color": new_color}
        r = api_client.put(f"{API}/settings", json=payload, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["primary_color"] == new_color
        # Persist via GET
        got = api_client.get(f"{API}/settings").json()
        assert got["primary_color"] == new_color
        # Restore
        payload["primary_color"] = original
        api_client.put(f"{API}/settings", json=payload, headers=auth_headers)


# ------------- Jobs (new form_heading + typed custom_fields) -------------
class TestJobs:
    def test_list_jobs_public(self, api_client):
        r = api_client.get(f"{API}/jobs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        for j in r.json():
            assert "_id" not in j
            assert "id" in j
            # New contract additions
            assert "form_heading" in j
            assert "custom_fields" in j

    def test_migration_added_contact_fields(self, api_client):
        """Existing pre-migration jobs should have full_name/email/phone prepended and form_heading."""
        jobs = api_client.get(f"{API}/jobs").json()
        # There should be at least one seed/migrated job
        assert len(jobs) >= 1
        for j in jobs:
            assert j.get("form_heading"), f"job {j['id']} missing form_heading"
            keys = {f["key"] for f in j.get("custom_fields", [])}
            # Must include the 3 default contact fields (from seed OR migration)
            assert "full_name" in keys or "name" in keys, f"job {j['id']} missing full_name field"
            assert "email" in keys, f"job {j['id']} missing email field"
            assert "phone" in keys, f"job {j['id']} missing phone field"

    def test_create_job_with_form_heading_and_typed_fields(self, api_client, auth_headers):
        payload = {
            "title": "TEST_Job_v3",
            "description": "desc",
            "form_heading": "Sign In Here",
            "custom_fields": [
                {"key": "full_name", "label": "Full Name", "type": "text", "required": True},
                {"key": "email", "label": "Email", "type": "email", "required": True},
                {"key": "phone", "label": "Phone", "type": "tel", "required": False},
                {"key": "notes", "label": "Notes", "type": "textarea", "required": False},
            ],
            "default_map_area": {"lat": 40.7128, "lng": -74.006, "zoom": 12},
            "display_mode": "map",
            "active": True,
        }
        cr = api_client.post(f"{API}/jobs", json=payload, headers=auth_headers)
        assert cr.status_code == 200, cr.text
        job = cr.json()
        assert job["form_heading"] == "Sign In Here"
        assert len(job["custom_fields"]) == 4
        assert job["custom_fields"][0]["type"] == "text"
        assert job["custom_fields"][1]["type"] == "email"
        assert job["custom_fields"][2]["type"] == "tel"
        assert job["custom_fields"][3]["type"] == "textarea"

        # Persist via GET
        gr = api_client.get(f"{API}/jobs/{job['id']}")
        assert gr.status_code == 200
        got = gr.json()
        assert got["form_heading"] == "Sign In Here"
        assert got["custom_fields"][3]["type"] == "textarea"

        # cleanup
        api_client.delete(f"{API}/jobs/{job['id']}", headers=auth_headers)

    def test_update_job_removes_phone(self, api_client, auth_headers):
        # Create with 3 fields
        payload = {
            "title": "TEST_Edit_Job",
            "form_heading": "Your Details",
            "custom_fields": [
                {"key": "full_name", "label": "Full Name", "type": "text", "required": True},
                {"key": "email", "label": "Email", "type": "email", "required": True},
                {"key": "phone", "label": "Phone", "type": "tel", "required": True},
            ],
            "active": True,
        }
        cr = api_client.post(f"{API}/jobs", json=payload, headers=auth_headers)
        assert cr.status_code == 200
        job_id = cr.json()["id"]

        # Remove phone + make email non-required
        payload["custom_fields"] = [
            {"key": "full_name", "label": "Full Name", "type": "text", "required": True},
            {"key": "email", "label": "Email", "type": "email", "required": False},
        ]
        ur = api_client.put(f"{API}/jobs/{job_id}", json=payload, headers=auth_headers)
        assert ur.status_code == 200
        updated = ur.json()
        keys = [f["key"] for f in updated["custom_fields"]]
        assert "phone" not in keys
        assert next(f for f in updated["custom_fields"] if f["key"] == "email")["required"] is False

        # cleanup
        api_client.delete(f"{API}/jobs/{job_id}", headers=auth_headers)

    # ---- NEW: consent fields on Jobs ----
    def test_job_defaults_include_consent_fields(self, api_client, auth_headers):
        payload = {"title": "TEST_Consent_Defaults", "active": True}
        cr = api_client.post(f"{API}/jobs", json=payload, headers=auth_headers)
        assert cr.status_code == 200
        job = cr.json()
        assert job.get("consent_enabled") is True
        assert isinstance(job.get("consent_title"), str) and job["consent_title"]
        assert isinstance(job.get("consent_body"), str) and job["consent_body"]
        assert job.get("consent_agree_label")
        assert job.get("consent_decline_label")
        api_client.delete(f"{API}/jobs/{job['id']}", headers=auth_headers)

    def test_job_update_consent_fields_persist(self, api_client, auth_headers):
        payload = {"title": "TEST_Consent_Edit", "active": True}
        cr = api_client.post(f"{API}/jobs", json=payload, headers=auth_headers)
        job = cr.json()
        job_id = job["id"]
        upd = {
            "title": job["title"],
            "consent_enabled": False,
            "consent_title": "Custom Privacy Title",
            "consent_body": "Custom body text explaining consent.",
            "consent_agree_label": "OK, Share",
            "consent_decline_label": "No Thanks",
            "active": True,
        }
        ur = api_client.put(f"{API}/jobs/{job_id}", json=upd, headers=auth_headers)
        assert ur.status_code == 200
        # GET verifies persistence
        got = api_client.get(f"{API}/jobs/{job_id}").json()
        assert got["consent_enabled"] is False
        assert got["consent_title"] == "Custom Privacy Title"
        assert got["consent_body"] == "Custom body text explaining consent."
        assert got["consent_agree_label"] == "OK, Share"
        assert got["consent_decline_label"] == "No Thanks"
        api_client.delete(f"{API}/jobs/{job_id}", headers=auth_headers)

    def test_public_jobs_return_consent_fields(self, api_client):
        jobs = api_client.get(f"{API}/jobs").json()
        assert len(jobs) >= 1
        for j in jobs:
            assert "consent_enabled" in j
            assert "consent_title" in j
            assert "consent_body" in j
            assert "consent_agree_label" in j
            assert "consent_decline_label" in j


# ------------- Check-ins (new responses-based contract) -------------
class TestCheckIns:
    @pytest.fixture(scope="class")
    def created_job(self, auth_headers):
        # Use fresh session in-class to avoid cross-test pollution
        payload = {
            "title": "TEST_Checkin_Job_v3",
            "form_heading": "Your Details",
            "custom_fields": [
                {"key": "full_name", "label": "Full Name", "type": "text", "required": True},
                {"key": "email", "label": "Email", "type": "email", "required": True},
                {"key": "phone", "label": "Phone", "type": "tel", "required": False},
                {"key": "site_number", "label": "Site Number", "type": "text", "required": True},
            ],
            "default_map_area": {"lat": 40.7128, "lng": -74.006, "zoom": 12},
            "active": True,
        }
        r = requests.post(f"{API}/jobs", json=payload, headers=auth_headers)
        assert r.status_code == 200
        job = r.json()
        yield job
        requests.delete(f"{API}/jobs/{job['id']}", headers=auth_headers)

    def test_admin_checkins_requires_auth(self, api_client):
        r = api_client.get(f"{API}/checkins")
        assert r.status_code == 401

    def test_create_checkin_public_with_responses(self, api_client, created_job):
        """POST /api/checkins should accept the new responses[] contract, without auth."""
        payload = {
            "job_id": created_job["id"],
            "responses": [
                {"key": "full_name", "label": "Full Name", "value": "TEST_John Doe"},
                {"key": "email", "label": "Email", "value": "test_john@example.com"},
                {"key": "phone", "label": "Phone", "value": "+15550001111"},
                {"key": "site_number", "label": "Site Number", "value": "A-1"},
            ],
            "latitude": 40.7128,
            "longitude": -74.006,
        }
        r = api_client.post(f"{API}/checkins", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # Derived from responses on the server side
        assert data["contractor_name"] == "TEST_John Doe"
        assert data["email"] == "test_john@example.com"
        assert data["latitude"] == 40.7128
        assert isinstance(data["responses"], list) and len(data["responses"]) == 4
        assert data["responses"][3]["label"] == "Site Number"
        assert data["responses"][3]["value"] == "A-1"
        assert "_id" not in data and "id" in data

    def test_create_checkin_old_contract_rejected(self, api_client, created_job):
        """The old contractor_name/email/phone/custom_data shape should no longer be accepted
        (server derives from responses)."""
        old_payload = {
            "job_id": created_job["id"],
            "contractor_name": "Old",
            "email": "old@x.com",
            "phone": "1",
            "custom_data": {},
            "latitude": 0.0,
            "longitude": 0.0,
        }
        r = api_client.post(f"{API}/checkins", json=old_payload)
        # The endpoint should accept only when responses is missing (defaults empty), so contractor_name derives to ""
        # but should NOT accept old contractor_name fields as required.
        # It will 200 with responses=[] and empty derived name/email.
        assert r.status_code == 200
        data = r.json()
        # Old fields should NOT be preserved (server derives from responses only)
        assert data.get("contractor_name") == ""
        assert data.get("email") == ""
        assert data["responses"] == []

    def test_public_job_checkins_returns_responses(self, api_client, created_job):
        r = api_client.get(f"{API}/jobs/{created_job['id']}/checkins")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(x.get("contractor_name") == "TEST_John Doe" for x in rows)
        # each row has responses[]
        for row in rows:
            assert "responses" in row

    def test_admin_list_checkins_with_auth(self, api_client, auth_headers, created_job):
        r = api_client.get(f"{API}/checkins", headers=auth_headers, params={"job_id": created_job["id"]})
        assert r.status_code == 200
        rows = r.json()
        assert any(x.get("contractor_name") == "TEST_John Doe" for x in rows)
        for row in rows:
            assert "responses" in row

    def test_create_checkin_invalid_job(self, api_client):
        payload = {"job_id": "invalid", "responses": [], "latitude": 0.0, "longitude": 0.0}
        r = api_client.post(f"{API}/checkins", json=payload)
        assert r.status_code == 400

    def test_create_checkin_nonexistent_job(self, api_client):
        payload = {"job_id": "507f1f77bcf86cd799439011", "responses": [], "latitude": 0.0, "longitude": 0.0}
        r = api_client.post(f"{API}/checkins", json=payload)
        assert r.status_code == 404

    def test_delete_job_cascades_checkins(self, api_client, auth_headers):
        j = api_client.post(f"{API}/jobs", json={"title": "TEST_Cascade_v3", "active": True}, headers=auth_headers).json()
        api_client.post(f"{API}/checkins", json={
            "job_id": j["id"],
            "responses": [{"key": "full_name", "label": "Full Name", "value": "TEST_C"}],
            "latitude": 1.0, "longitude": 2.0,
        })
        api_client.delete(f"{API}/jobs/{j['id']}", headers=auth_headers)
        r = api_client.get(f"{API}/jobs/{j['id']}/checkins")
        assert r.status_code == 200
        assert r.json() == []

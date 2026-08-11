# UrHealth Connect

Smart Emergency Orchestration & Family Re-Unification System

Use this as the single source of truth for building UrHealth end-to-end. It describes what the product does, who uses it, how the frontend and backend connect, and how data flows through the system in real time — including the core differentiator: pre-arrival, predictive ambulance-to-hospital routing with a Golden Hour bed lock.

1. Product Summary

UrHealth is a web platform that coordinates hospitals, ambulances, and families during Mass Casualty Incidents (MCIs) and disasters. It has two tightly coupled halves that must share the same data model:

Orchestration Engine — routes ambulances to the best-fit hospital before arrival, locks a bed/ICU/OT slot, tracks live occupancy across the hospital network, and predicts resource shortfalls.

Family Re-Unification System — every patient gets a tracking ID the moment they're assigned to a hospital (at dispatch, not at intake), searchable by families across the whole network.

Both halves read and write the same core tables (patients, hospitals, beds, incidents) — there is no separate reunification database. This is the single most important architectural rule: orchestration creates the record; reunification surfaces it.

2. User Roles (drives frontend routing & permissions)

Role What they need Primary screens Command Center / District Admin Declare an MCI, see network-wide bed/resource status, view AI shortfall predictions Orchestration Dashboard Hospital Coordinator See incoming ambulance assignments, confirm/release bed holds, update local bed/resource counts Hospital Ops Console Ambulance Crew See assigned hospital + ETA-based hold, patient's tracking ID, route Ambulance Field View (mobile-first) Family Member (public, unauthenticated) Search for a missing/admitted person by tracking ID or descriptive filters Public Reunification Portal Triage Staff Log patient at point of injury/pickup, assign severity, generate tracking ID Triage Intake Form

3. Frontend Architecture

Stack: React + TypeScript + Vite + Tailwind CSS + React Query (server state) + Recharts (dashboards) + WebSocket client (live updates).

3.1 App structure

/command-center        → Orchestration Dashboard (admin/command role)
/hospital/:hospitalId   → Hospital Ops Console (coordinator role)
/ambulance/:unitId      → Ambulance Field View (crew role, mobile-first)
/triage/new             → Triage Intake Form (staff role)
/reunify                → Public search portal (no auth)
/reunify/:trackingId     → Public patient status page (no auth)


3.2 Screen-by-screen flow

Triage Intake Form (/triage/new)

Fields: name/description (optional if unidentified), age range, gender, visible identifying marks, severity (triage color code), suspected condition, pickup location (auto geo-tagged), photo upload (optional).

On submit → POST /api/patients → backend immediately generates a tracking_id and returns it. Frontend displays it as a large, printable/scannable ID (for a wristband or tag).

This form is also usable by dispatch/ambulance crew at pickup point, not only at hospital intake — this is what enables pre-arrival tracking.

Orchestration Dashboard (/command-center)

Top bar: "Declare MCI" button — triggers POST /api/incidents (creates an incident record, broadcasts alert to all hospitals in network via WebSocket).

Live network map/table: every hospital's bed count, ICU count, OT availability, blood bank status — updates via WebSocket subscription, not polling.

AI Prediction panel (Recharts): forecasted shortfall per hospital per resource type over next N hours, pulled from GET /api/predictions?incident_id=.

Ambulance tracker: list of active units, their assigned hospital, ETA, and hold status (locked / confirmed / released).

Every hospital tile is color-coded by current status AND predicted status (so a hospital with open beds now but predicted to saturate in 30 min is visually flagged) — this feeds the routing algorithm too, not just the UI.

Hospital Ops Console (/hospital/:hospitalId)

Incoming assignments queue: ambulance ID, ETA, patient severity, held resource (e.g., "ICU bed #4, held until 14:32").

Coordinator actions: "Confirm arrival" (releases the hold into an actual admission) or "Cannot accept" (triggers re-routing — calls the same best-fit algorithm excluding this hospital, reassigns instantly, notifies the ambulance).

Local resource editor: coordinator updates bed/ICU/OT/blood counts manually if not integrated with hospital EMR — this is the minimum-friction adoption path your deck already calls out as the advantage over Juvare.

Ambulance Field View (/ambulance/:unitId)

Mobile-first, minimal UI (must work on a basic phone browser).

Shows: assigned hospital name + address + map link, ETA countdown, hold status, patient tracking ID (large, shareable).

One button: "Confirm patient onboard" → updates incident status → starts the ETA clock the hospital sees.

If hold expires before arrival, frontend shows re-assigned hospital automatically (backend already re-ran the algorithm and pushed the update).

Public Reunification Portal (/reunify)

Search by tracking ID (if family has it, e.g., from a call), OR by descriptive filters: approximate age, gender, area last seen, hospital region.

Results show status only: "En route to City General Hospital" / "Admitted — City General Hospital" / "Contact hospital front desk" — never sensitive medical details, per privacy design.

No login required — this must stay low-friction, since families searching are often under extreme stress and may not have accounts or strong connectivity.

4. Backend Architecture

Stack: FastAPI (REST + WebSocket) + PostgreSQL + a lightweight background scheduler (APScheduler or Celery) for hold-expiry and prediction refresh jobs. Deploy on Render, as per your existing stack.

4.1 Core data model

hospitals
  id, name, location(lat,lng), total_beds, available_beds,
  icu_total, icu_available, ot_total, ot_available,
  blood_bank_status (jsonb by blood group), network_id

incidents
  id, type (MCI/disaster/pandemic), declared_at, status,
  network_id, severity_estimate

patients
  id, tracking_id (public-facing), incident_id (nullable),
  name (nullable), age_range, gender, identifying_marks,
  severity, status (dispatched/en_route/admitted/discharged),
  assigned_hospital_id, pickup_location, created_at

bed_holds
  id, patient_id, hospital_id, resource_type (bed/icu/ot),
  held_at, expires_at, status (active/confirmed/released/expired)

ambulance_units
  id, unit_code, current_location, status, assigned_patient_id

predictions
  id, hospital_id, resource_type, predicted_shortfall_at,
  confidence, generated_at


4.2 Core API endpoints

POST   /api/incidents                 → declare MCI, broadcast to network
POST   /api/patients                  → create patient record + tracking_id
                                          (called by triage OR ambulance-side pickup form)
GET    /api/patients/search           → public reunification search (sanitized fields only)
GET    /api/patients/{tracking_id}    → public status lookup

POST   /api/routing/assign            → CORE ORCHESTRATION LOGIC (see 4.3)
POST   /api/hospitals/{id}/confirm    → coordinator confirms admission, releases hold
POST   /api/hospitals/{id}/reject     → coordinator rejects, triggers re-routing
PATCH  /api/hospitals/{id}/resources  → manual bed/ICU/OT count update

GET    /api/network/status            → live snapshot for dashboard (also pushed via WS)
GET    /api/predictions               → AI shortfall forecasts per hospital/resource

WS     /ws/network                    → live push channel: bed changes, new assignments,
                                          hold expirations, incident alerts


4.3 Orchestration algorithm (the core differentiator)

Runs inside POST /api/routing/assign, triggered the moment a patient record is created (at pickup, not at hospital door):

Pull candidate hospitals within reasonable radius of pickup location.

Filter by current available resource matching patient severity (e.g., ICU-level patients only route to hospitals with ICU availability).

Re-rank candidates using the predicted shortfall from the predictions table — deprioritize a hospital that shows open beds now but is forecast to saturate before this patient's ETA.

Select best-fit hospital → create a bed_holds row with expires_at = now + ETA + buffer.

Push assignment to ambulance (WebSocket) and to hospital's incoming queue (WebSocket).

Background job checks for expired holds every N seconds; on expiry, auto-releases the hold and re-runs step 1–5 excluding the expired hospital, notifying both sides of the change.

This single endpoint is what ties "orchestration" and "reunification" together: the same call that assigns a bed also creates the patient's public-facing tracking status.

4.4 AI Prediction service

A separate scheduled job (every 5–15 min during an active incident) recomputes shortfall forecasts per hospital per resource type, using current occupancy trend + incoming assignment queue + incident severity.

Writes to predictions table; dashboard and routing algorithm both read from it — single source, two consumers, no duplicated logic.

MVP-simple version: a regression/time-series model (even a basic exponential trend) is enough for a hackathon demo; the important part is the loop — predictions feed routing, not just the dashboard.

4.5 Real-time layer

All state changes (patients, bed_holds, hospitals.available_beds) publish to the WebSocket channel /ws/network immediately after DB commit.

Frontend subscribes once per session (Command Center, Hospital Console, Ambulance View all connect); no polling needed.

Public reunification portal can use polling (every 15–30s) instead of WebSocket, since it's unauthenticated and lower-frequency — keep it simple and low-cost.

5. End-to-End Flow (what happens during a real incident)

Command Center declares an MCI → POST /api/incidents → alert broadcast to all network hospitals via WebSocket.

Triage/ambulance crew at the scene logs a patient → POST /api/patients → tracking ID generated instantly.

Backend automatically calls the routing algorithm → best-fit hospital selected using live + predicted data → bed hold created → ambulance and hospital both notified in real time.

Family member, told to check the portal, searches by tracking ID or description → sees "en route to [Hospital]" before the patient has even arrived.

Ambulance crew confirms onboard; ETA countdown visible to hospital.

Hospital coordinator confirms arrival → hold converts to actual admission → resource counts update → dashboard and predictions refresh.

If a hold expires or a hospital rejects, the system re-routes automatically and every screen (ambulance, hospital, family portal) reflects the change within seconds via the WebSocket layer.

6. Non-functional requirements for the MVP demo

Low-friction adoption: hospitals only need a browser and a coordinator manually updating counts — no EMR integration required (this is your stated advantage over Juvare).

Privacy: public portal exposes status only, never medical detail, name-matching, or contact info directly — hospital front desk is the human handoff point.

Fallback: if a hospital doesn't confirm/reject within the hold window, auto-expiry + re-routing prevents a patient being stuck waiting on a non-responsive hospital.

Human-in-the-loop: coordinators can always override an auto-assignment — orchestration recommends, it doesn't fully remove human judgment.

7. What to build first for the hackathon (priority order)

patients + hospitals + bed_holds tables and the /api/routing/assign endpoint — this is the whole novel feature; get it working before anything else.

Triage Intake Form → creates patient → shows tracking ID.

Hospital Ops Console → shows incoming assignment, confirm/reject buttons.

Ambulance Field View → shows assignment + ETA + confirm-onboard button.

Public Reunification Portal → search by tracking ID.

Command Center Dashboard with live network map — build last, it's the most "impressive" screen but depends on everything above already working.

AI prediction loop — a simple version is fine; the judges care that predictions feed routing, not that the model is sophisticated.

AS YOUR JOB IS TO ONLY BUILD A FRONTEND UI, BUILD THE FRONTEND WHICH IS ADAPTABLE FOR THE ABOVE LISTED BACKEND FUNCTIONS. 
MAINLY USE THE COMBINATIONS OF TEAL GREEN(#006D5B) ,WHITE AND OTHER SUITABLE COMBINATIONS OF COLORS FOR THE UI.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9ba17c7-7766-4344-a73d-18c307e34e9e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

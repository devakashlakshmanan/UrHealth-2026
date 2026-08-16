# 🚀 Deploying UrHealth to Render

This repository is fully configured for deployment on [Render](https://render.com) using the included `render.yaml` Blueprint or manual Web Service creation.

---

## 🛠 Web Service Settings (Node SSR)

If configuring `urhealth-frontend` manually as a **Web Service** on Render:

- **Name**: `urhealth-frontend`
- **Runtime**: `Node`
- **Build Command**:
  ```bash
  rm -rf node_modules package-lock.json && npm install && npm i --no-save @rolldown/binding-linux-x64-gnu@1.2.3 && NITRO_PRESET=node-server npm run build
  ```
- **Start Command**:
  ```bash
  node .output/server/index.mjs
  ```
- **Environment Variables**:
  - `NODE_VERSION`: `20.18.0`
  - `NITRO_PRESET`: `node-server`
  - `HOST`: `0.0.0.0`
  - `VITE_API_URL`: `https://urhealth-backend.onrender.com` (replace with your live backend service URL)

---

## 🔑 Default Staff Credentials for Verification

| Role | Username | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **District Admin** | `admin` | `admin123` | Full network command center, audit logs |
| **Hospital Coordinator** | `coord_h1` | `coord123` | City General Hospital dashboard |
| **Triage Staff** | `triage_staff` | `triage123` | Emergency patient intake & AI auto-routing |
| **Ambulance Crew** | `crew_u1` | `crew123` | Unit AMB-114 live telemetry & field view |

---

## 🩺 Health Check Verification

- **Backend Health Check**: `https://<your-backend-url>.onrender.com/health` (Returns `{"status": "healthy"}`)
- **Backend API Docs**: `https://<your-backend-url>.onrender.com/docs`
- **Frontend App**: `https://<your-frontend-url>.onrender.com`

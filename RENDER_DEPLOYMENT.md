# 🚀 Deploying UrHealth to Render

This repository is fully configured for deployment on [Render](https://render.com) using the included `render.yaml` Blueprint or manual Web Service creation.

---

## ⚡ Option 1: Automatic Blueprint Deployment (Recommended)

Render Blueprints allow you to deploy the complete full-stack architecture (FastAPI backend + TanStack React frontend) with a single click.

1. **Log in to Render**: Go to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your GitHub repository:
   ```text
   https://github.com/devakashlakshmanan/UrHealth-2026.git
   ```
4. Render will automatically detect [`render.yaml`](file:///c:/Users/HP/Downloads/urhealth-connect-main/urhealth-connect-main/render.yaml) and configure two services:
   - **`urhealth-backend`**: Python FastAPI Web Service with WebSocket and SQLite database.
   - **`urhealth-frontend`**: Node / TanStack SSR Web Service connected to the backend.
5. Click **Apply Blueprint**.
6. Render will automatically build and deploy both services!

---

## 🛠 Option 2: Manual Web Service Setup

If you prefer setting up the services manually in Render:

### Step 1: Deploy the Backend Service
1. In Render Dashboard, click **New +** → **Web Service**.
2. Select repository: `https://github.com/devakashlakshmanan/UrHealth-2026.git`.
3. Configure the settings:
   - **Name**: `urhealth-backend`
   - **Runtime**: `Python 3`
   - **Branch**: `main`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
4. Add Environment Variables:
   - `PYTHON_VERSION`: `3.11.9`
   - `ALLOWED_ORIGINS`: `*`
   - `JWT_SECRET_KEY`: *(Click Generate or enter a secure random string)*
5. Click **Create Web Service**.
6. Copy your deployed Backend URL (e.g. `https://urhealth-backend.onrender.com`).

---

### Step 2: Deploy the Frontend Service
1. In Render Dashboard, click **New +** → **Web Service**.
2. Select repository: `https://github.com/devakashlakshmanan/UrHealth-2026.git`.
3. Configure the settings:
   - **Name**: `urhealth-frontend`
   - **Runtime**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && NITRO_PRESET=node-server npm run build`
   - **Start Command**: `node .output/server/index.mjs`
4. Add Environment Variables:
   - `NODE_VERSION`: `20.18.0`
   - `NITRO_PRESET`: `node-server`
   - `VITE_API_URL`: *(Paste your deployed Backend URL, e.g. `https://urhealth-backend.onrender.com`)*
5. Click **Create Web Service**.

---

## 🔑 Default Staff Credentials for Verification

Once deployed, you can access the system using the pre-seeded staff roles:

| Role | Username | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **District Admin** | `admin` | `admin123` | Full network command center, audit logs, staff management |
| **Hospital Coordinator** | `coord_h1` | `coord123` | City General Hospital dashboard, bed management |
| **Triage Staff** | `triage_staff` | `triage123` | Emergency patient intake & dynamic AI auto-routing |
| **Ambulance Crew** | `crew_u1` | `crew123` | Unit AMB-114 live telemetry & vitals stream |

---

## 🩺 Verifying Deployment Health

- **Backend Health Check**: `https://<your-backend>.onrender.com/health` (Returns `{"status": "healthy"}`)
- **Swagger Interactive API Docs**: `https://<your-backend>.onrender.com/docs`
- **Frontend App**: `https://<your-frontend>.onrender.com`

# 🚀 Deploying UrHealth to Render

This repository is fully configured for deployment on [Render](https://render.com) using the included `render.yaml` Blueprint or manual service creation.

---

## 🔧 Fix for `Cannot find native binding` Error on Render

Render builds in a Linux container environment. When `package-lock.json` is generated on Windows, npm omits Linux native bindings (`@rolldown/binding-linux-x64-gnu`), throwing:
`Error: Cannot find native binding. npm has a bug related to optional dependencies`

This issue has been resolved directly in `render.yaml` and `package.json` by ensuring Linux native binaries are installed during deployment.

### Method A: Automatic Deployment (Recommended)
1. Commit and push the updated files to GitHub (`git push origin main`).
2. Render will automatically detect the commit and deploy cleanly!
3. If doing a manual re-deploy in Render Dashboard, click **Manual Deploy** → **Clear build cache & deploy**.

---

## 🛠 Web Service Settings (Node SSR)

If configuring `urhealth-frontend` manually as a **Web Service**:

- **Name**: `urhealth-frontend`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm i --no-save @rolldown/binding-linux-x64-gnu@1.2.3 @rolldown/binding-linux-x64-musl@1.2.3 && NITRO_PRESET=node-server npm run build`
- **Start Command**: `node .output/server/index.mjs`
- **Environment Variables**:
  - `NODE_VERSION`: `20.18.0`
  - `NITRO_PRESET`: `node-server`
  - `HOST`: `0.0.0.0`
  - `VITE_API_URL`: `https://urhealth-backend.onrender.com` (replace with your actual backend service URL)

---

## 🌐 Static Site Settings (Alternative Static Frontend)

If configuring `urhealth-frontend` as a Render **Static Site**:

- **Name**: `urhealth-frontend`
- **Build Command**: `npm install && npm i --no-save @rolldown/binding-linux-x64-gnu@1.2.3 && npm run build`
- **Publish Directory**: `.output/public`
- **Rewrite Rules**: Add rule `/*` → `/index.html` (Rewrite)
- **Environment Variables**:
  - `VITE_API_URL`: `https://urhealth-backend.onrender.com`

---

## 🔑 Default Staff Credentials for Verification

Once deployed, access operational consoles using pre-seeded roles:

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

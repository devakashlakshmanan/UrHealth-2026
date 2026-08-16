# 🚀 Deploying UrHealth to Render

This repository is fully configured for deployment on [Render](https://render.com) using the included `render.yaml` Blueprint or manual service creation.

---

## 🔍 Breakdown of the 6 Errors & Solutions

| # | Error Log Message | Root Cause | Implemented Solution |
| :- | :--- | :--- | :--- |
| **1** | `Error: Cannot find native binding. npm has a bug related to optional dependencies` | Lockfile generated on Windows omitted Linux/WASM native modules during `npm install` on Render. | Added `"prebuild"` lifecycle hook in `package.json` that automatically fetches Linux & WASM bindings before build. |
| **2** | `cause: Error: Cannot find module '@rolldown/binding-linux-x64-gnu'` | Missing glibc native binding module in `node_modules`. | Force-installed `@rolldown/binding-linux-x64-gnu@1.2.3` via `prebuild` script. |
| **3** | `cause: Error: Cannot find module '../rolldown-binding.linux-x64-gnu.node'` | Missing compiled binary file `.node` for Linux x64. | Pre-installed native package into `node_modules` during prebuild step. |
| **4** | `cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'` | Fallback WebAssembly binding was also missing. | Added `@rolldown/binding-wasm32-wasi@1.2.3` to `prebuild` auto-installer. |
| **5** | `cause: Error: Cannot find module '../rolldown-binding.wasi.cjs'` | Missing WASM CJS wrapper script. | Downloaded as part of `@rolldown/binding-wasm32-wasi`. |
| **6** | Manual Render Dashboard Command Bypass | Manual Render Web Service settings bypassed `render.yaml` custom commands. | By placing binary installation inside `package.json` `"prebuild"`, npm runs it automatically regardless of Dashboard command overrides. |

---

## 🛠 Web Service Settings (Node SSR)

If configuring `urhealth-frontend` manually as a **Web Service**:

- **Name**: `urhealth-frontend`
- **Runtime**: `Node`
- **Build Command**: `npm install && NITRO_PRESET=node-server npm run build`
- **Start Command**: `node .output/server/index.mjs`
- **Environment Variables**:
  - `NODE_VERSION`: `20.18.0`
  - `NITRO_PRESET`: `node-server`
  - `HOST`: `0.0.0.0`
  - `VITE_API_URL`: `https://urhealth-backend.onrender.com` (replace with your actual backend service URL)

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

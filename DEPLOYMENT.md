# Deployment Guide

This app is now wired for both:
- **single-service production** (server can serve the built Vite app)
- **split deployment** with frontend + backend on separate hosts

For your setup, the best practical option is:

## Recommended: Vercel + Fly.io
- **Frontend:** Vercel
- **Backend:** Fly.io
- **Database:** SQLite on a Fly volume
- **Uploads:** stored on the same Fly volume

Why this is better:
- Vercel is great for static Vite frontend hosting
- Fly.io supports persistent volumes
- SQLite survives restarts/redeploys when stored on `/data`
- uploads also survive when stored inside `/data/uploads`

---

## 1. Production code behavior

### Backend
The server now:
- serves `client/dist` automatically when present
- keeps `/api/*` and `/uploads/*` on the backend
- falls back to `client/dist/index.html` for app routes
- supports `UPLOADS_DIR` for persistent file storage

### Database
The database now:
- uses `process.env.DB_PATH` when provided
- otherwise defaults to `server/data/dairy-farm.db`
- auto-creates the parent folder if needed

### Frontend API
The client now supports:
- same-origin API calls by default
- optional remote backend via `VITE_API_URL`

Example:
```env
VITE_API_URL=https://your-server.fly.dev
```

---

## 2. Required environment variables

### Backend (Fly.io)
```env
PORT=4000
JWT_SECRET=replace-this-with-a-long-random-secret
DB_PATH=/data/dairy-farm.db
UPLOADS_DIR=/data/uploads
```

### Frontend (Vercel)
```env
VITE_API_URL=https://your-server.fly.dev
```

---

## 3. Deploy backend on Fly.io

### Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
```

### Login
```bash
fly auth login
```

### Launch backend app
```bash
cd server
fly launch
```

During setup:
- app name: choose anything unique
- region: choose closest to you/users
- PostgreSQL: **No**
- Redis: **No**
- deploy now: **No** if you want to review config first

### Create persistent volume
```bash
fly volumes create dairy_data --size 1
```

### Mount volume
In `fly.toml`, mount:
```toml
[mounts]
  source = "dairy_data"
  destination = "/data"
```

### Set secrets/env
```bash
fly secrets set JWT_SECRET="your-long-random-secret"
fly secrets set DB_PATH="/data/dairy-farm.db"
fly secrets set UPLOADS_DIR="/data/uploads"
```

### Deploy
```bash
fly deploy
```

Backend URL will be something like:
```text
https://your-app-name.fly.dev
```

---

## 4. Deploy frontend on Vercel

### In Vercel
- Import GitHub repo
- Set **Root Directory** to `client`
- Framework preset: **Vite**

### Build settings
- Build command: `npm run build`
- Output directory: `dist`

### Add environment variable
```env
VITE_API_URL=https://your-app-name.fly.dev
```

### Deploy
Frontend URL will be something like:
```text
https://your-app-name.vercel.app
```

---

## 5. Final safe env set

### Backend
```env
DB_PATH=/data/dairy-farm.db
UPLOADS_DIR=/data/uploads
JWT_SECRET=your-secret
```

### Frontend
```env
VITE_API_URL=https://your-fly-app.fly.dev
```

---

## 6. Important notes

### SQLite rule
- keep only **one backend instance** when using SQLite

### Persistence rule
Anything outside `/data` can be replaced on deploy.
So for Fly durability:
- DB must be in `/data/...`
- uploads must be in `/data/...`

### CORS
For local/dev self-hosting, the backend allows localhost, private LAN origins, and public/DDNS hostnames on app ports `5173`, `5174`, and `4000`. This lets a DDNS hostname keep working when the ISP public IP changes.

For production, prefer a fixed HTTPS frontend/backend origin and restrict CORS with `CLIENT_URL` or a reverse proxy.

### Home router / DDNS self-hosting
If you run the README dev workflow on a laptop/server:
- forward public `5173` to the server's LAN `5173`
- do not expose public `4000` unless you specifically need direct backend access
- browse to `http://your-ddns-name:5173`
- `/api` and `/uploads` requests go through Vite on `5173` and are proxied internally to backend `4000`

---

## 7. Local test example

### Backend
```bash
cd server
DB_PATH=./data/dairy-farm.db UPLOADS_DIR=./uploads JWT_SECRET=test-secret node src/index.js
```

### Frontend
Set:
```env
VITE_API_URL=http://localhost:4000
```

Then:
```bash
cd client
npm run build
```

---

## 8. Recommended order

1. Apply backend deploy on Fly.io
2. Verify API works
3. Verify SQLite file is created in `/data`
4. Verify uploads land in `/data/uploads`
5. Deploy frontend on Vercel with `VITE_API_URL`
6. Test login, save, upload, and export

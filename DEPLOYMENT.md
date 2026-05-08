# Deployment Guide

This app is now wired for production deployment with:
- Vite client build served by the Node/Express server
- SQLite path configurable through `DB_PATH`
- root-level `npm run build` and `npm start`

## Recommended option

For this repo, the safest simple setup is:

### Option A — Render only (simple)
- One Render Web Service for the whole repo
- One persistent disk mounted at `/data`
- `DB_PATH=/data/dairy-farm.db`

This works fine **if you run a single instance**.

### Option B — Vercel + Fly.io (best split setup)
- `client/` on Vercel
- `server/` on Fly.io with a mounted volume
- `DB_PATH=/data/dairy-farm.db`

This is cleaner if you want frontend/backend separated.

---

## 1. Production code behavior

The server now:
- serves `client/dist` automatically when present
- keeps `/api/*` and `/uploads/*` on the backend
- falls back to `client/dist/index.html` for app routes

The database now:
- uses `process.env.DB_PATH` when provided
- otherwise defaults to `server/data/dairy-farm.db`
- auto-creates the parent folder if needed

---

## 2. Required environment variables

### Required in production
- `JWT_SECRET` = a strong secret string
- `DB_PATH` = persistent-disk path

### Example
```env
PORT=4000
JWT_SECRET=replace-this-with-a-long-random-secret
DB_PATH=/data/dairy-farm.db
```

---

## 3. Render deployment steps

### Create service
- Push repo to GitHub
- In Render: **New → Web Service**
- Connect this repo

### Use these settings
- **Root Directory:** leave blank
- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Environment:** `Node`

### Add persistent disk
- Open the service
- Go to **Disks**
- Add disk:
  - **Mount path:** `/data`
  - **Size:** 1 GB or more

### Add env vars
- `JWT_SECRET=your-strong-secret`
- `DB_PATH=/data/dairy-farm.db`

### Important note
Keep the Render service at **1 instance only** when using SQLite.

---

## 4. Vercel + Fly.io split deployment

## Backend on Fly.io
- Deploy repo or `server/` app to Fly.io
- Create a volume mounted at `/data`
- Set:
```env
DB_PATH=/data/dairy-farm.db
JWT_SECRET=your-strong-secret
PORT=4000
```

## Frontend on Vercel
Set frontend API base URL only if you later convert API calls to absolute URLs.
Right now this app is easiest to run as a single service because client API calls are same-origin (`/api/...`).

If you want split hosting later, the next step would be adding a `VITE_API_URL` based client helper.

---

## 5. First deploy checklist

1. Build succeeds locally
2. Server starts locally after build
3. `DB_PATH` points to persistent storage
4. `JWT_SECRET` is set
5. Only one backend instance is running
6. Uploads folder behavior is understood

---

## 6. Important limitation: uploads

Uploaded files currently live under:
- `server/uploads`

That means uploaded files are **not persistent across redeploys** unless you also move uploads to persistent disk/object storage.

If you want, the next safe improvement is:
- make uploads use `UPLOADS_DIR`
- point it to `/data/uploads`

That would keep uploaded bills/images safe too.

---

## 7. Local production test

From repo root:
```bash
npm run build
npm start
```

Then open:
- `http://localhost:4000`

You should see the app served by Express.

---

## 8. Recommended next improvement

Best next deployment-safe code change:
1. move uploads to env-based persistent storage path
2. optionally add `VITE_API_URL` support if splitting frontend/backend

If you want, do this next:
- **A. keep single-service Render deploy and make uploads persistent**
- **B. prepare split deploy for Vercel + Fly.io**

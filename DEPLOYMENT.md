# Deployment Guide

This app is now wired for both:
- **single-service production** (server can serve the built Vite app)
- **split deployment** with frontend + backend on separate hosts

For your setup, the best practical option is:

## Recommended: Vercel + Fly.io
- **Frontend:** Vercel
- **Backend:** Fly.io
- **Database:** SQLite on a Fly volume

Why this is better:
- Vercel is great for static Vite frontend hosting
- Fly.io supports persistent volumes
- SQLite survives restarts/redeploys when stored on `/data`
- cheaper/safer than trying to trust ephemeral local disk on a free web host

---

## 1. Production code behavior

### Backend
The server now:
- serves `client/dist` automatically when present
- keeps `/api/*` and `/uploads/*` on the backend
- falls back to `client/dist/index.html` for app routes

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

### From repo root
You can deploy the backend from the `server/` app context, or keep root repo and point Fly to server start flow.

Simplest path for this repo:

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

### Set secrets/env
```bash
fly secrets set JWT_SECRET="your-long-random-secret"
fly secrets set DB_PATH="/data/dairy-farm.db"
```

### Mount volume
In `fly.toml`, mount the volume at:
```toml
[mounts]
  source = "dairy_data"
  destination = "/data"
```

### Deploy backend
```bash
fly deploy
```

After deploy your API will be something like:
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
After deploy your frontend will be something like:
```text
https://your-app-name.vercel.app
```

---

## 5. Important: CORS

Because frontend and backend are on different domains in split deployment, your backend must allow your Vercel origin.

Right now the server uses broad default CORS behavior. That works, but for production security you may later want to restrict it to your Vercel domain.

---

## 6. Important: uploads

Uploaded files currently live under:
- `server/uploads`

That means uploaded files are **not automatically persistent** on Fly unless you also move them to the mounted volume.

Best next improvement:
- add `UPLOADS_DIR`
- set it to `/data/uploads`

Then both:
- SQLite DB
- uploaded files

will survive redeploys.

---

## 7. Local split-deploy test

### Backend
```bash
cd server
DB_PATH=./data/dairy-farm.db JWT_SECRET=test-secret node src/index.js
```

### Frontend
In `client/.env.production` or Vercel env:
```env
VITE_API_URL=http://localhost:4000
```

Then build frontend:
```bash
cd client
npm run build
```

---

## 8. Best next code improvement

If you want the deployment to be properly durable, the next fix should be:

### Move uploads to persistent storage too
Example env:
```env
UPLOADS_DIR=/data/uploads
```

That’s the missing piece for full Fly.io durability.

---

## 9. Recommended order for you

1. Deploy backend on Fly.io
2. Confirm API works
3. Deploy frontend on Vercel with `VITE_API_URL`
4. Test login and data save
5. Then improve uploads persistence

---

## 10. Summary

### Best option for this repo
- **Frontend:** Vercel
- **Backend:** Fly.io
- **Database:** SQLite at `/data/dairy-farm.db`

### Avoid
- free hosting with ephemeral local filesystem for SQLite
- multiple backend instances with SQLite

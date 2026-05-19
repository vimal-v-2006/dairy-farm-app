# **Milk Business Pro**

## Dairy Farm Financial Management App

A professional single-user dairy business management application for tracking milk production, sales, expenses, calves, cows, buyers, reports, and capital/assets recovery.

Built for dairy owners who want a practical day-to-day operating system with clean records, business insights, and export-ready reports.

---

## Overview

This app helps manage the financial and operational side of a dairy farm in one place.

It supports:
- daily milk entry
- buyer-wise sales tracking
- expense and feed tracking
- calf rearing records
- cow records and history
- business reports and exports
- separate capital/assets recovery tracking

The system is designed so that **daily income/expense/profit records remain separate** from **capital/assets tracking**, helping preserve core business analysis without mixing long-term investment recovery into normal operating profit data.

## About / Complete Use Case

This application is designed for a dairy owner, farm operator, or office staff member who wants to manage the full business workflow of a dairy unit from one system.

### Primary use case
A dairy farm produces milk every day, sells milk to one or more buyers, spends money on feed and other operating costs, raises calves into future productive animals, and makes long-term capital investments such as buying cows or adding other business assets. This app helps manage all of those activities in a structured way.

### What problems this app solves
- Replaces scattered notebook/manual records with organized digital records
- Tracks daily milk production and sales in one place
- Keeps buyer-wise income history available for reporting
- Separates common expenses and feed expenses clearly
- Maintains separate calf rearing records before transfer into productive cows
- Maintains long-term cow records including milk and feed history
- Generates business reports for review, printing, and export
- Tracks capital/assets recovery separately without disturbing regular P&L reporting

### End-to-end business flow supported by the app
1. **Farm setup**
   - Create the first user account
   - Add buyers
   - Add expense categories
   - Add feed items and rates
   - Register cows and calves

2. **Daily operations**
   - Enter daily milk production
   - Record buyer-wise milk sales
   - Record rates and payment status
   - Record common expenses and feed expenses
   - Save the day’s complete business record

3. **Animal record management**
   - Maintain cow profiles and status changes
   - Track calf growth and calf-specific expenses
   - Transfer calves into cows when they enter lactation stage

4. **Business review and analysis**
   - Monitor dashboard trends
   - Review daily, monthly, and date-range reports
   - Export PDF and Excel reports
   - Review buyer-wise and expense-wise business performance

5. **Capital/assets monitoring**
   - Add a direct asset or capital entry
   - Import a cow or calf as a capital item
   - Check when business income has recovered the invested amount
   - Automatically move recovered items into the finished section

### Suitable scenarios
This app is suitable for:
- small dairy farms
- medium dairy farms
- single-owner dairy businesses
- farm office record keeping
- daily milk and expense bookkeeping
- preparing report data before sharing with partners, accountants, or family members

### What this app is not trying to be
This app is not a full ERP or multi-company accounting suite. It is a focused dairy operations and finance management tool built for practical daily use.

---

## Key Features

### 1. Secure single-user access
- First-time account creation
- Login required every time the app is opened
- JWT-based authentication

### 2. Dashboard
- Daily and monthly business summary
- Milk production overview
- Income, expense, and profit snapshots
- Buyer split and recent trend charts
- Cow performance summary

### 3. Daily Entry Management
- Record daily milk production
- Choose direct total entry or cow-wise milk entry
- Record milk sales by buyer
- Record common expenses and feed expenses
- Track remaining milk usage
- Edit or delete saved daily entries

### 4. Cow Management
- Add and update cow records
- Track status and status dates
- View milk history by date
- View feed history by date
- View cow update history
- Export individual and full cow records

### 5. Calf Management
- Add and update calf records
- Track calf expenses separately
- Record food and common calf expenses
- Transfer a calf into the cows section when ready
- Export calf records

### 6. Buyer Management
- Add and manage buyers or selling places
- Store default milk rates
- Save location, contact, and notes
- Activate/deactivate buyers

### 7. Expense Category and Feed Management
- Default and custom expense categories
- Feed item creation and rate history tracking
- Historical feed price reference for future entries

### 8. Reports and Export
- Filter by date range
- Summary reporting
- Buyer-wise and expense-wise breakdowns
- Business register view
- PDF and Excel exports

### 9. Capital / Assets Tracking
- Separate from daily profit analysis
- Add direct/manual capital investments
- Import assets from cows
- Import assets from calves
- Automatically mark completed items when income recovery reaches the asset amount
- Move completed items into a finished section
- Preserve existing income/expense/profit analysis without modifying past records

---

## Tech Stack

### Frontend
- React
- Vite
- Tailwind CSS
- Recharts
- Framer Motion
- Lucide React

### Backend
- Node.js
- Express
- better-sqlite3
- JWT authentication
- bcryptjs

### Database
- SQLite

### Export / Utilities
- jsPDF
- jsPDF AutoTable
- ExcelJS
- SheetJS (`xlsx`)
- date-fns
- dayjs

## How It Works (Technology Behind the App)

This application uses a **modern frontend + lightweight backend + local database** architecture.

### 1. Frontend working
The user interface is built with **React** and bundled with **Vite**.

- React manages the application screens, forms, tabs, tables, and interactive state
- Vite provides fast development startup and optimized production builds
- Tailwind CSS is used for styling and responsive layouts
- Framer Motion is used for smooth UI animation and transitions
- Recharts is used for dashboard and report charts
- Lucide React provides the icon system used across the UI

The frontend sends requests to the backend API for authentication, saving records, loading reports, and exporting data.

### 2. Backend working
The backend is built with **Node.js + Express**.

Its job is to:
- handle login and authentication
- validate incoming requests
- save and update business records
- calculate summaries and reports
- enforce business rules
- return structured JSON data to the frontend

Other backend components used:
- `bcryptjs` for password hashing
- `jsonwebtoken` for login session tokens
- `helmet` for safer HTTP headers
- `cors` for frontend-backend communication
- `morgan` for request logging
- `multer` for upload-ready request handling
- `express-validator` for validating API inputs

### 3. Database working
The app uses **SQLite** through **better-sqlite3**.

Why this is useful:
- no separate database server required
- easy local setup
- fast for single-user business software
- simple backup using the database file itself

The backend creates tables automatically if they do not exist. It also handles schema updates for some new columns/tables when the app starts.

### 4. Authentication flow
- On first use, the app allows creation of one user
- Password is hashed before storage
- On login, the backend verifies the password
- A JWT token is returned
- The frontend stores and sends that token for protected API requests

This keeps the app private to the authorized user.

### 5. AI agent workflow

The AI farm agent uses a tool-calling loop backed by a local Ollama LLM.

How it works:
- The frontend sends the user's message to `POST /api/agent/chat`
- The backend builds a system prompt with available tool definitions and sends it (plus conversation history) to Ollama
- The model responds with JSON: either `{"type":"tool_call","tool":"...","arguments":{...}}` or `{"type":"final","answer":"..."}`
- For tool calls, the backend executes the tool (reads from the database or prepares a write action)
- Write actions (add cow, add expense, delete, etc.) require user confirmation before execution
- The tool result is fed back into the conversation, and the model decides whether to call another tool or give a final answer
- Maximum 6 tool calls per request to prevent runaway loops

Key components in `server/agent/`:
- `ollamaClient.js` — communicates with Ollama's `/api/chat` endpoint
- `toolSchemas.js` — Zod schemas and tool definitions the model sees
- `toolExecutor.js` — executes tool calls against the SQLite database
- `agent.js` — orchestrates the message loop and JSON parsing
- `systemPrompt.js` — builds the system prompt with rules and available tools

The agent supports full CRUD operations across cows, calves, buyers, expenses, milk entries, milk sales, food items, expense categories, investments, and daily entries.

### 6. Daily entry workflow
When a user saves a daily entry:
- frontend collects milk, sales, and expense data
- backend validates and normalizes the data
- milk sales income is calculated
- expense totals are calculated
- remaining milk is derived
- daily summary values such as total income, total expenses, and profit are stored
- related child rows such as cow milk entries, milk sales, and expense rows are saved in linked tables

This creates a structured daily business record that powers dashboard and report analysis later.

### 6. Reporting workflow
Reports are generated from saved database records.

The backend:
- filters records by date range
- aggregates milk, income, expenses, and profit
- groups buyer-wise and expense-wise summaries
- returns summarized data to the frontend

The frontend then displays:
- report summary cards
- tables
- graphs
- export options

### 7. Cow and calf record workflow
- Cows and calves are stored in separate tables
- Calves can hold their own expense history
- When a calf is transferred, a cow record is created from that calf context
- Cow update history is saved separately so profile changes can be reviewed later

This helps preserve lifecycle tracking from calf stage to productive cow stage.

### 8. Feed and expense tracking workflow
- Feed items store current values and price history
- When feed-related expenses are saved, the app can preserve the effective rate snapshot
- This helps keep historical calculations stable even if feed prices change later

### 9. Capital / assets workflow
The capital/assets module is intentionally separated from normal business profit analysis.

It works like this:
- a capital item is saved in a dedicated `investments` table
- the item may come from manual entry, cow import, or calf import
- the backend compares the investment amount against business income from the chosen investment date onward
- once income reaches or exceeds that amount, the item is marked as finished
- the completion date is stored separately
- this process does not rewrite previous daily expense, income, or profit records

This allows capital recovery tracking without damaging standard daily business reporting.

### 10. AI Farm Agent (Ollama-powered chatbot)

The app includes an AI-powered farm assistant that understands natural language and can query or modify your farm data using tools.

> **Important:** You must be **signed in** to your farm account to use the AI assistant. The chat button appears at the bottom-left of the screen after login.

- Ask questions like "How much milk did we produce today?" or "Which cow is giving the least milk?"
- Request actions like "Add an expense for cattle feed" or "Update Bella's status to Sold"
- The AI confirms before writing anything to the database
- Powered by a local Ollama model (e.g., `gemma4:31b-cloud`)
- All agent logic is in `server/agent/` and `server/routes/agent.js`

### 11. Export technology
The app supports export features using:
- **jsPDF** for PDF generation
- **jsPDF AutoTable** for structured PDF tables
- **ExcelJS / xlsx** for spreadsheet-style exports

This makes the app useful not just for internal entry, but also for sharing records outside the app.

### 11. Why this architecture fits this use case
This architecture is a good fit because it is:
- simple to install
- low maintenance
- fast for a single-user workflow
- easy to back up
- practical for local or small-office deployment
- easier to customize compared with heavy enterprise systems

---

## Project Structure

```text
dairy-farm-app/
├── client/              # React frontend
├── server/              # Express backend + SQLite logic
├── package.json         # Root scripts for app orchestration
├── package-lock.json
└── README.md
```

### Important directories

```text
client/src/              # Main UI code
server/src/              # API, DB initialization, business logic
server/data/             # SQLite database file gets created here automatically
server/uploads/          # Uploaded files directory (if used later)
```

---

## Prerequisites

Before installing, make sure your machine has:

- **Node.js** 18 or newer recommended
- **npm** 9 or newer recommended
- A modern browser such as Chrome, Edge, or Firefox
- **(Optional for AI agent)** [Ollama](https://ollama.com) installed locally with a model pulled (e.g., `ollama pull gemma4:31b-cloud`)

To verify installation:

```bash
node -v
npm -v
```

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd dairy-farm-app
```

### 2. Install dependencies

Install root dependencies:

```bash
npm install
```

If needed, you can also install per package:

```bash
cd client && npm install
cd ../server && npm install
```

---

## Running the App in Development

From the project root:

```bash
npm run dev
```

This starts:
- frontend on `http://localhost:5173`
- backend on `http://localhost:4000`

The browser should normally open the frontend URL. The frontend calls `/api/...` and Vite proxies those requests to the backend on port `4000`.

### Root development script
The root project uses `concurrently` to run both client and server together.

---

## Local Network / DDNS Access

For a simple self-hosted setup on a home/office laptop or mini PC:

1. Run the app on the server machine:
   ```bash
   npm run dev
   ```
2. Open/forward only the frontend port publicly:
   ```text
   external 5173 -> SERVER_LAN_IP:5173
   ```
3. Keep backend port `4000` private if possible. The frontend dev server proxies `/api` and `/uploads` to `http://localhost:4000` from inside the server.
4. If using DDNS, open the app with:
   ```text
   http://your-ddns-name:5173
   ```

In development mode the backend accepts localhost, private LAN origins, and public/DDNS origins on ports `5173`, `5174`, and `4000`. This avoids hardcoding a changing public IP in CORS for DDNS/self-hosted installs.

---

## First-Time Setup

When you open the app for the first time:

1. Go to the frontend URL in your browser
2. Create the first and only user account
3. Log in using that account
4. Start adding farm data

This is a **single-user system**, so only one primary account is intended.

---

## Build for Production

To build the frontend:

```bash
npm run build
```

This creates the production-ready frontend build inside:

```text
client/dist/
```

To run the backend in production mode:

```bash
npm run start
```

---

## Environment Configuration

The backend supports a custom JWT secret and optional Ollama configuration.

### JWT Secret
```bash
cd server
export JWT_SECRET="change-this-in-production"
npm run dev
```

### Ollama AI Agent (optional)
Create `server/.env` with:
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:31b-cloud
AI_AGENT_ENABLED=true
```
- `OLLAMA_BASE_URL` — your local Ollama server URL
- `OLLAMA_MODEL` — the model name to use (must be pulled in Ollama)
- `AI_AGENT_ENABLED` — set to `false` to disable the AI agent

If not provided, the app falls back to an internal default JWT secret. For real deployment, **always set your own secure secret**.

---

## Database

The app uses SQLite and creates the database automatically.

### Default database path
```text
server/data/dairy-farm.db
```

### Main data stored
- users
- cows
- calves
- buyers
- expense_categories
- food_items
- food_price_history
- daily_entries
- cow_milk_entries
- milk_sales
- expenses
- calf_expenses
- investments
- cow_update_history

### Important note
The database file is local. If you move or delete it, your stored records move or disappear with it unless backed up.

---

## How to Use the App

## 1. Dashboard
Use the dashboard to quickly review:
- today’s milk, income, expenses, and profit
- monthly business performance
- top buyers
- recent business trends

## 2. Daily Entry
Use **Daily Entry** every day to record:
- total milk or cow-wise milk
- buyer-wise sales
- milk rate per buyer
- daily expenses
- feed expenses by cow
- remaining milk usage

This section is the core operational record of the app.

## 3. Calves
Use **Calves** to:
- register new calves
- record calf-related expenses separately
- keep rearing records isolated from cow productivity records
- transfer a calf to cows when it starts lactating

## 4. Cows
Use **Cows** to:
- maintain active cow records
- review milk history
- review feed history
- export records
- track profile updates over time

## 5. Buyers
Use **Buyers** to manage:
- milk customers
- collection points
- places
- default rates
- notes and contact information

## 6. Expense Categories / Feed Settings
Use **Expense categories** to:
- add custom categories
- manage feed items
- update feed prices
- keep historical feed cost tracking

## 7. Reports
Use **Reports** to:
- filter by date range
- review summary performance
- export PDFs and spreadsheets
- inspect saved raw daily data
- generate business register outputs

## 8. Capital / Assets
Use **Capital / Assets** for investment recovery tracking.

This is meant for things like:
- cow purchase investments
- calf-based assets
- direct capital spending
- business asset recovery monitoring

### Important behavior
This section is **separate from normal expense/income/profit analysis**.

It does **not**:
- rewrite past daily records
- alter old profit calculations
- modify existing reports
- merge capital recovery into standard expense analysis

### How it works
- Add a manual capital item, or import one from a cow/calf
- Set the investment amount and date
- The app checks income recovery from that date onward
- If income already covers the amount, it can move directly to the finished section
- Once finished, it stores completion status separately

---

## Suggested Daily Workflow

A professional way to use the app each day:

1. Open the app and log in
2. Add the day’s milk production
3. Record all milk sales buyer-wise
4. Record the day’s expenses
5. Save the daily entry
6. Review dashboard numbers
7. Periodically update cows, calves, and buyers
8. Use reports weekly or monthly for review
9. Use Capital / Assets only for long-term recovery tracking

---

## Professional Usage Notes

### Keep operating analysis separate
Use the main daily entry and reports for:
- normal business performance
- income
- expenses
- profit

Use Capital / Assets only for:
- capital tracking
- asset recovery visibility
- investment completion monitoring

### Add accurate dates
For the best analysis quality:
- save correct entry dates
- use correct purchase dates when available
- keep buyer rates accurate
- record feed quantities correctly

### Back up regularly
Since SQLite is file-based, regular backups are strongly recommended.

---

## Available Scripts

### Root
```bash
npm run dev      # Run client + server together
npm run build    # Build frontend
npm run start    # Start backend server
```

### Client
```bash
npm run dev      # Start Vite dev server
npm run build    # Build production frontend
npm run preview  # Preview production build
```

### Server
```bash
npm run dev      # Start backend with nodemon
npm run start    # Start backend with node
```

---

## Production Deployment Notes

For production deployment, consider the following:

- set a strong `JWT_SECRET`
- serve the frontend behind Nginx or another reverse proxy
- keep the backend protected on a private/internal port if possible
- enable HTTPS
- back up `server/data/dairy-farm.db`
- restrict machine access if this is deployed on a farm office PC or VPS

---

## Backup Recommendation

At minimum, back up:

```text
server/data/dairy-farm.db
```

You may also want to back up:
- exported reports
- screenshots
- future uploads/receipts if enabled later

---

## Known Design Principles

This app is intentionally designed as:
- **single-user**, not multi-tenant
- **local SQLite-based**, not cloud-database dependent
- **practical and business-focused**, not overloaded with unnecessary ERP complexity
- **separated by responsibility**, so capital/assets tracking does not corrupt normal P&L reporting

---

## Future Improvements

Potential future enhancements:
- Excel/CSV import wizard
- receipt upload UI
- multi-language support
- automated backups
- role-based access control
- mobile-friendly data entry improvements
- printable invoice/sale slip workflow
- advanced analytics for per-cow profitability

---

## Screenshots

![Dashboard](https://raw.githubusercontent.com/vimal-v-2006/dairy-farm-app/main/docs/dashboard.png)
![Daily Entry](https://raw.githubusercontent.com/vimal-v-2006/dairy-farm-app/main/docs/daily-entry.png)

---

## Troubleshooting

### Frontend does not open
Check that the Vite server is running:

```bash
npm run dev
```

### Backend API not responding
Check that the backend is running on port `4000`.

### Login issue after changing secret
If `JWT_SECRET` changes, old tokens may stop working. Log in again.

### Database issues
If the database file is missing or corrupted, restore from backup.

---

## License

Add your preferred license here before publishing to GitHub.

Example:
- MIT
- Proprietary
- Private internal use only

---

## Summary

**Milk Business Pro** is a practical business tool for managing:
- daily dairy operations
- farm finances
- cow and calf records
- buyer records
- reports and exports
- capital/assets recovery tracking

It is especially useful for dairy owners who want **clean records, usable reports, and separate capital monitoring without disturbing normal business analysis**.

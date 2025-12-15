# Copilot / AI Agent Instructions — OccupanyTracking

This file gives compact, actionable guidance for AI coding agents working on this repository.

High-level architecture
- Backend: Node.js Express service in `backend/server.js` that performs SNMP polling against Cisco switches (uses `net-snmp`). Key classes: `SnmpSession` and `SwitchPoller`. Config is loaded from `backend/sites-config.json`.
- Frontend: React app (Create React App) under `frontend/` (entry `src/App.js`). UI polls lightweight REST endpoints and stores backups in localStorage.
- Orchestration: `docker-compose.yml` defines `backend` (port 3000) and `frontend` (port 80). Helper scripts at repo root (`start.sh`, `stop.sh`, `restart.sh`, `update.sh`, `logs.sh`) wrap docker-compose operations.

Request/Response patterns & important endpoints
- Frontend calls these endpoints; preserve their shapes:
  - `GET /api/config/sites` — returns `{ success, sites, globalSettings }`.
  - `POST /api/config/sites` — accepts `{ sites, globalSettings, lastUpdate }` to persist config (frontend posts on changes).
  - `GET /api/sessions/:siteId` — returns `{ success, sessions: [...] }` (sessions are serialized arrays in storage; frontend reconstructs Maps).
  - `GET /api/history/:siteId` and `GET /api/summary` — return historical data used by charts.

Project-specific conventions and patterns
- SNMP polling is heavy; backend does the polling and publishes lightweight JSON for the frontend. Do not move SNMP logic into the frontend.
- Data structures:
  - Server uses `Map` objects for runtime session and historical stores; when persisted (backend or localStorage) they are serialized as arrays/objects. Example keys saved in frontend localStorage: `capacity-sites-config`, `sessions-<siteId>`.
  - `sites-config.json` contains `sites[]` each with `switches[]` with fields: `ipAddress`, `community`, `stackMembers`, `excludedPorts`, etc. Edits in the UI POST the full config back to backend.
- Interface filtering: backend expects Cisco-like `ifDescr` strings (e.g., `GigabitEthernet...`) and ignores down interfaces — check `server.js` when changing filters.

Developer workflows (how to build, run, debug)
- Quick start (development):
  - Start services: `./start.sh` (wraps `docker-compose up -d`).
  - Stop services: `./stop.sh` or `docker-compose down`.
  - Rebuild: `./update.sh` or `docker-compose build` + `docker-compose up -d`.
  - View logs: `./logs.sh backend` or `docker-compose logs -f backend`.
- Backend local development:
  - From `backend/`: `npm run dev` uses `nodemon` to reload `server.js`.
  - `backend/package.json` scripts: `start` (production) and `dev` (nodemon).
- Frontend local development:
  - From `frontend/`: `npm start` runs CRA dev server. The frontend fetches `/api/*` paths — use a proxy or run both services via docker-compose.

Testing and safety notes for agents
- Avoid changing SNMP OIDs or the polling flow unless you confirm hardware compatibility — tests are environment-specific.
- When adding fields to stored session objects, update serialization/deserialization in both backend and frontend (`saveToStorage` / load logic in `frontend/src/App.js` and any backend persist paths).

Where to look for examples and edits
- Polling and SNMP logic: `backend/server.js` (Search: `class SwitchPoller`, `SnmpSession`, and OID constants near top).
- Config schema and sample: `backend/sites-config.json` (shows `sites[]` and example `switches[]`).
- Frontend usage and localStorage handling: `frontend/src/App.js` (see `fetch('/api/config/sites')`, localStorage keys, and the polling useEffect) and `frontend/src/components/SiteConfigModal.js` (site / switch editing UI).
- API helper calls: `frontend/src/utils/api.js` shows the REST endpoints the UI expects.

If you change APIs
- Update both frontend `fetch(...)` calls and backend route handlers. Keep response shape unchanged (avoid renaming keys) or incrementally add optional keys.

Questions for maintainers (ask these if unclear)
- Should session persistence be centralized in the backend or remain a frontend localStorage fallback? (frontend currently saves a backup.)
- Are there supported switch models/OID exceptions we must handle when extending VLAN/mapping logic?

If something's unclear, tell me which file or area to expand and I will update this guidance.

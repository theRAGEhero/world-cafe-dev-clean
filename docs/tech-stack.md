# World Café Platform Tech Stack

## Application Overview
- Full-stack Node.js application orchestrating World Café workshop sessions with audio capture, transcription, table management, analytics, and QR-enabled onboarding.
- Backend (`backend/server.js`) exposes REST and Socket.IO interfaces, orchestrates recording workflows, and runs on Node 18 (Alpine base image).
- Frontend is a static, mobile-first SPA served from `public/`, implemented with vanilla ES modules, CSS design tokens, and minimal external dependencies.

## Backend Stack
- **Framework & Runtime**
  - `express@4.18` hosts REST endpoints and static assets; `http` + `socket.io@4.7` provide real-time collaboration channels.
  - `dotenv` loads environment config; `cors` and `body-parser` handle cross-origin requests and large JSON payloads (1 GB cap for uploads).
  - Session management uses `express-session` backed by signed, non-secure cookies (configured in `backend/server.js:28-41`).
- **API Surface (selected)**
  - `/api/sessions` CRUD endpoints manage sessions, tables, and administrative flows.
  - `/api/sessions/:sessionId/tables/:tableNumber/upload-audio` ingests table recordings via `multer` (disk storage in `/uploads`).
  - `/api/recordings/live-transcription` streams prerecord buffers into Deepgram transcription.
  - `/api/sessions/:sessionId/chat` proxies structured context to Groq LLM for AI analysis (`backend/sessionChatService.js`).
  - `/api/admin/settings/*` provides password, API key, and platform-guard management.
- **Real-Time Collaboration**
  - Socket rooms differentiate sessions/tables (`io.on('connection'...)` in `backend/server.js:235+`).
  - Events broadcast participant counts, recording status, live transcription readiness, and dashboard metrics.
  - Heartbeat keeps mobile clients alive; server tracks table membership via in-memory maps.
- **Recording & Transcription Workflow**
  - `multer` enforces 1 GB upload bound, streams files into `/uploads` with UUID filenames (`backend/server.js:120-163`).
  - `@deepgram/sdk` wraps prerecorded and live transcription (`backend/transcription.js`), supporting diarization, utterance segmentation, and retries on HTML error bodies.
  - Resulting transcripts persisted in MySQL (`transcriptions` table) with JSON speaker metadata.
- **AI Session Analysis**
  - `backend/sessionChatService.js` throttles prompt size, diffs context windows, and invokes `groq.chat.completions` with LLaMA 3 family models.
  - Token budgeting logic truncates transcripts when crossing model-specific limits.
- **QR + Media Utilities**
  - `backend/database/models/QRCode.js` couples `qrcode` library with disk storage in `public/qr-codes` and semantic file naming.
  - `sharp` dependency is provisioned for potential image manipulation (not yet exercised in codebase).
- **Logging & Observability**
  - `backend/utils/logger.js` builds a `winston` logger writing structured files (`backend/logs/`) and optionally mirroring actions into the `activity_logs` table.
  - `/api/logs` ingests frontend log batches for unified auditing.
- **Security Helpers**
  - `backend/passwordUtils.js` generates session/table passcodes using Node `crypto` and SHA-256 hashing (no salts).
  - Platform guard middleware (`backend/server.js:48-118`) enforces an optional portal password before any HTML/REST content.

## Data & Persistence Layer
- **MySQL Storage**
  - Default target: MySQL 8 (`mysql2/promise`) with pooling configured in `backend/database/connection.js`.
  - `.env` keys define host, credentials, SSL, and connection limits.
- **ORM Pattern**
  - Lightweight data-mapper scheme: `backend/database/models/BaseModel.js` supplies CRUD helpers; domain models (Session, Table, Recording, Transcription, QRCode, Settings) extend it with richer queries.
  - Transactions supported via pool connection wrappers (`DatabaseConnection.transaction`).
- **Schema**
  - Baseline schema captured in repository root `database_schema.sql` for container bootstrap.
  - Core tables: `sessions`, `tables`, `participants`, `recordings`, `transcriptions`, `qr_codes`, `global_settings`, `activity_logs`, `session_analyses`, plus migration bookkeeping (`migrations`).
  - Tables store both hashed and legacy plaintext password columns for compatibility; numerous indexes accelerate status lookups and full-text transcript search (`MATCH ... AGAINST` in `Transcription.searchTranscripts`).
- **Migrations & Tooling**
  - Incremental SQL migrations live in `backend/database/migrations/*.sql` (e.g., 011–013 for transcription metadata).
  - CLI utilities in `backend/database/init.js` and `backend/migrate.js` expose `init`, `reset`, `demo`, `migrate`, `status` commands.
  - Schema synchronization scripts (`scripts/sync-docker-schema.sh`, `scripts/validate-docker-schema.sh`) keep Docker SQL snapshots aligned with live migrations.

## External Integrations & Services
- **Deepgram**: Speech-to-text for live and prerecorded audio (requires `DEEPGRAM_API_KEY`).
- **Groq**: Large Language Model completions for AI session chat (requires `GROQ_API_KEY`).
- **Socket.IO**: WebSocket abstraction for all real-time notifications; clients include `/socket.io/socket.io.js` bundle.
- **jsQR CDN**: Frontend QR scanner used for joining tables via camera (`public/index.html`).
- **Moment.js**: Date formatting for backend scheduling and UI labels.
- **node-fetch**: Present for compatibility, though Node 18 global `fetch` is used in practice.

## Frontend Stack
- **Delivery Model**
  - Single-page application delivered from `public/index.html`; routes handled client-side with DOM swaps.
  - Assets versioned manually via querystring (e.g., `styles.css?v=202509041831`).
- **Runtime**
  - Vanilla JavaScript in `public/app.js` (~6k LOC) orchestrates UI state, fetch calls, Socket.IO subscriptions, and MediaRecorder workflows.
  - Audio capture leverages `navigator.mediaDevices.getUserMedia` + `MediaRecorder`, chunk buffering, and 1 GB client-side limits.
  - Live transcription uses `MediaRecorder` streaming uploads, while offline uploads send completed blobs to `/api/.../upload-audio`.
  - `FrontendLogger` (`public/logger.js`) batches structured logs, persists context in `localStorage`, and flushes to `/api/logs` when network allows.
- **UX & Mobile Optimizations**
  - Device detection toggles CSS classes (`mobile`, `touch`) and registers touch/keyboard behaviors for viewport corrections.
  - Swipe gestures, haptic feedback, and double-tap zoom prevention enhance kiosk/tablet deployments.
- **Design System**
  - CSS tokens consolidated across `public/styles.css`, `public/design-system.css`, and `public/components.css`; layout primitives defined in `public/layout.css`.
  - PWA metadata via `public/manifest.json`; icon set stored alongside logos for installable experience.
- **Feature Highlights**
  - QR join flow integrates camera scanning (jsQR) with sanitized URL parsing.
  - Session dashboards show real-time table metrics fed from Socket.IO events.
  - Admin panel manages API keys, platform password, and service health checks.

## Build & Developer Tooling
- **npm Scripts** (`package.json`)
  - `start`: runs `node backend/server.js`.
  - `dev`: executes via `nodemon` for hot reloads.
  - `client`: legacy placeholder referencing a non-existent `frontend/` React app (safe to ignore).
  - `install-all`: installs root and legacy frontend deps.
- **Dependencies**
  - Production: Express, Socket.IO, Multer, Deepgram SDK, mysql2, UUID, QRCode, Moment, Sharp, Winston.
  - Development: `nodemon` for live reload.
- **Local Resources**
  - Audio and QR artifacts stored in `/uploads` and `backend/public/qr-codes` (mapped to persistent Docker volumes).
  - Logs captured in `backend/logs/`.
- **Documentation & Scripts**
  - Deployment runbooks live in `README.md`, `QUICK-DEPLOY.md`, `DEPLOYMENT.md`, and `PRODUCTION_DEPLOYMENT.md`.
  - `scripts/export-image.sh` exports Docker images for air-gapped deployments.

## Deployment & Operations
- **Dockerization**
  - `Dockerfile` builds from `node:18-alpine`, bundles production deps, ensures upload directories/permissions, and exposes port 3000 with health check (`/api/admin/settings/status`).
  - `docker-compose.yml` pairs the app with a MySQL service (`alexdoit/democracyroutes-cafe-mysql`) and mounts persistent volumes (`mysql_data`, `uploads_data`, `qr_data`).
  - `docker-compose.production.yml` targets canonical images, binds HTTP to port 80, and references environment variables for secrets.
  - `Dockerfile.mysql` packages a custom MySQL image preloaded with `database_schema.sql` and initialization script.
- **Reverse Proxy Guidance**
  - `nginx.conf` template tunes buffering, timeouts, and max body size for 1 GB uploads while preserving WebSocket upgrades (`proxy_set_header Upgrade`).
- **Environment Configuration**
  - `.env.example` enumerates Deepgram/Groq keys, DB credentials, admin and platform passwords, port bindings, and session secret.
  - QR base URL (`BASE_URL`) determines encoded links for dynamic join flows.

## Security & Access Control
- Session cookies are HTTP-only but not marked secure; TLS termination is expected at Nginx or cloud ingress.
- Platform password middleware gates UI until users authenticate; verification state stored in `express-session`.
- Admin endpoints enforce password checks against `global_settings` entries, managed through `/api/admin/login` with hashed storage.
- Table/session passwords support optional per-table gating (stored in both hashed and plaintext columns for migration compatibility).
- API keys can be persisted to DB and injected back into process env on boot (`Settings.loadIntoEnvironment`).

## Observability & Diagnostics
- Health endpoints: `/api/health`, `/health`, `/api/admin/database/status`, `/api/admin/settings/status` for UI probes and Docker health check.
- Activity auditing: `logger.logUserAction` and related helpers persist structured metadata (IP, user agent) to `activity_logs` table.
- Frontend telemetry: browser logs queue offline and sync when online, capturing page views, table events, and performance timings.
- MySQL connection health tracked on startup via `DatabaseConnection.connect()` with console diagnostics.

## Notable Directories & Files
- `backend/server.js`: Main Express server, route definitions, Socket.IO orchestration.
- `backend/transcription.js`: Deepgram client wrapper with retry/backoff logic.
- `backend/sessionChatService.js`: Groq LLM integration with token management and error handling.
- `backend/database/models/*.js`: Data access layer for sessions, tables, recordings, transcriptions, QR codes, settings.
- `public/app.js`: Client SPA controller handling session lifecycle, recordings, live transcription, admin UI, QR scanning.
- `public/logger.js`: Structured frontend logging utility with offline queue.
- `database_schema.sql`: Canonical SQL schema for bootstrap and Docker image baking.
- `scripts/*.sh`: Schema synchronization and Docker export utilities.

## Future Considerations
- `sharp` dependency can enable QR/image resizing but is unused; consider removing or wiring into QR pipeline.
- Authentication currently relies on SHA-256 without salts; upgrading to bcrypt/argon2 would strengthen password hygiene.
- `frontend` npm script points to a non-existent directory, signalling legacy artifact removal or future SPA rewrite.
- Potential to modularize `public/app.js` for maintainability (currently monolithic).

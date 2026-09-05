it# Procteria - Assessment Platform Backend

A proctored online assessment platform backend. Admins create assessments and questions, assign assessments to candidates with per-assignment timer/violation configuration, and candidates attempt them with browser-level proctoring (tab switch, window blur, fullscreen exit, copy/paste, right-click tracking), autosave, and resume-after-refresh support.

## Tech Stack

- Node.js + Express + TypeScript
- MongoDB + Mongoose
- JWT authentication via httpOnly cookie (not bearer header)
- bcryptjs for password hashing

## Project Structure

```text
src/
  config/       # env.ts, db.ts
  models/       # User, Question, Assessment, Assignment, Attempt
  controllers/  # authController, candidateController, questionController,
                # assessmentController, assignmentController, attemptController,
                # submissionController
  routes/       # authRoutes, adminRoutes, candidateRoutes
  middleware/   # auth (requireAuth/requireRole), errorHandler
  seeds/        # seedUsers.ts
  utils/        # response, asyncHandler
  app.ts
  server.ts
```

## Prerequisites

- Node.js 18–22 (see `engines` in `package.json`)
- A running MongoDB instance (local or Atlas)

## Getting Started

```bash
npm install
cp .env.example .env   # or create .env manually — see Environment Variables below
npm run dev            # starts the API with tsx watch (auto-restart)
npm run seed           # populates sample candidates + admin (optional but recommended)
```

The API runs at `http://localhost:4000/api` by default (`PORT` in `.env`), with a health check at `GET /health`.

## Environment Variables

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/proctored-assessment
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000,http://localhost:3001
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | No | `development` | |
| `PORT` | No | `4000` | |
| `MONGODB_URI` | No (has a local fallback) | `mongodb://127.0.0.1:27017/proctored-assessment` | Set explicitly outside local dev |
| `JWT_SECRET` | No (has an insecure dev fallback) | `development-only-secret` | **Must** be overridden outside local development |
| `JWT_EXPIRES_IN` | No | `7d` | |
| `CLIENT_URL` | No | `http://localhost:3000` | Comma-separated list of allowed frontend origins, used for both CORS and cookie auth |

## Database Setup

No manual schema setup needed — Mongoose creates collections and indexes automatically on first write, as long as `MONGODB_URI` points at a reachable MongoDB instance.

## Seed Data

```bash
npm run seed
```

Inserts (or upserts, by email — safe to re-run) 1 admin and 10 candidate users, all sharing the password `assessment@19`.

**Sample login credentials:**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@proctoredassessment.com` | `assessment@19` |
| Candidate | `aarav.sharma@example.com` | `assessment@19` |
| Candidate | `priya.nair@example.com` | `assessment@19` |
| Candidate | *(8 more — see `src/seeds/seedUsers.ts` for the full list)* | `assessment@19` |

## Scripts

```bash
npm run dev        # tsx watch — auto-restarts on file changes
npm run build      # compile TypeScript to dist/
npm start           # run the compiled build (node dist/server.js)
npm run typecheck  # tsc --noEmit, no build output
npm run seed        # populate sample users
```

## API Overview

Base path: `/api`. Full request/response examples live in [`postman/assessment-platform.postman_collection.json`](./postman/assessment-platform.postman_collection.json) and [`API_ENDPOINTS.md`](./API_ENDPOINTS.md) — import the Postman collection and run **Auth → Login** first; the httpOnly cookie is picked up automatically by Postman's cookie jar for subsequent requests.

| Area | Base path | Notes |
|---|---|---|
| Auth | `/api/auth` | register, login, logout, me |
| Admin — Candidates | `/api/admin/candidates` | CRUD + search |
| Admin — Questions | `/api/admin/questions` | CRUD |
| Admin — Assessments | `/api/admin/assessments` | CRUD |
| Admin — Assignments | `/api/admin/assignments` | assign, edit, cancel, delete, list, per-assignment candidate list |
| Admin — Submissions | `/api/admin/assignments/:assignmentId/candidates/:candidateId/attempt`, `/api/admin/attempts/:attemptId/score` | view + manually grade attempts |
| Candidate | `/api/candidate/*` | list assigned assessments, start/resume attempt, autosave, log proctoring violations, submit |

Auth roles: `admin`, `creator`, `candidate`. Admin/creator-only routes require `requireRole("admin", "creator")`; candidate routes require `requireRole("candidate", "admin", "creator")`.

## Assumptions & Known Limitations

- **Assignment config, not assessment config**: `durationMinutes` and per-type `violationLimits` live on the `Assignment` (the assign action), not on the `Assessment` itself — the same assessment can be reassigned later with different timing/limits (e.g. a stricter retest).
- **Timer is server-enforced, lazily**: there's no background cron auto-submitting expired attempts. Every attempt-touching request (`getAttemptState`, `saveAnswer`, `logViolation`, `startAttempt`) checks elapsed time against `startedAt + durationMinutes` on read and force-submits if expired — meaning an attempt only flips to `submitted` once *some* request touches it, not the instant time runs out.
- **Editing an assignment is blocked once any candidate has started** (`in_progress` or `submitted`), to avoid mid-exam configuration changes producing inconsistent state across candidates.
- **The answer key (`Question.additionalInfo` — `correctAnswers`/`expectedAnswer`) must never reach a candidate before submission.** This is enforced at the controller level, not the schema level — any new candidate-facing endpoint touching `Question` must explicitly strip these fields.
- **Short-answer questions are not auto-scored** — they're flagged `needsManualReview: true` at submission and require an admin to grade them via the manual scoring endpoint before `isFullyScored` becomes `true`.
- **Candidate-facing attempt visibility must always resolve `candidateId` from the JWT, never a URL param** — a route that accepts `:candidateId` in the URL for a candidate-role endpoint is a cross-candidate data leak; only admin routes should accept `candidateId` as a param.
# Proctored Assessment Platform Backend

A Node.js + Express + TypeScript backend for a proctored assessment platform using MongoDB and JWT-based cookie authentication.

## Tech Stack

- Node.js
- TypeScript
- Express
- MongoDB + Mongoose
- JWT with HTTP-only cookies
- bcryptjs for password hashing

## Project Structure

```text
src/
  config/
    db.ts
    env.ts
  models/
  controllers/
  routes/
  middleware/
  services/
  utils/
  app.ts
  server.ts
```

## Getting Started

1. Copy `.env.example` to `.env`
2. Install dependencies
3. Start MongoDB locally
4. Run the app

```bash
cp .env.example .env
npm install
npm run dev
```

## Environment Variables

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/proctored-assessment
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Notes

- This is the initial backend scaffold.
- Authentication, routes, and domain logic will be added in subsequent steps.

# Campout

Campout schedules shifts for groups that need a set number of people at one location around the clock, such as a student tenting group holding its place in line for event tickets. An organizer creates a group and shares its link. Members mark when they can and cannot be present, and the app builds a shift rotation that respects those limits and spreads hours evenly. After the schedule is published, members can trade shifts with each other without going through the organizer.

## Key Features

- **Group setup.** The organizer sets the scheduling window, how many people each time slot needs, and the slot length (15, 30, or 60 minutes). An optional overnight window can require a different number of people. An optional admin password restricts who can generate the schedule. Without one, anyone with the group link can do it.
- **Availability grid.** Members fill in a weekly grid using three states: available, not preferred, and unavailable. Marking any cell inside the overnight window applies that state to the whole night.
- **Google Calendar import.** A member can give the app read-only access to their primary Google Calendar. Any slot that overlaps a timed event is marked unavailable. Members can also export their availability as CSV.
- **Member passwords without sign-up.** The first time a member submits availability, their name is tied to a password, which the server stores as a scrypt hash. That password is required to edit availability, view the schedule, or trade shifts.
- **Schedule generation.** `server/scheduler.ts` fills the schedule one time slot at a time:
  - Members are never placed in slots they marked unavailable.
  - Members already on shift stay on until they become unavailable or reach the three-hour limit for daytime shifts. Overnight shifts have no limit and run as one continuous block.
  - When the scheduler needs to start a new shift, it ranks candidates in this order: members who have rested at least 30 minutes, then members who marked the slot available rather than not preferred, then members with the fewest minutes worked so far, and finally whoever can stay on the longest.
  - If nobody else can cover a slot, it skips the rest period rather than leaving the slot empty.
  - Any time ranges it still cannot fill are listed as understaffed.
- **Admin dashboard.** Shows which members have submitted availability and when, and lets the organizer generate a new schedule or reload the most recent one.
- **Schedule view.** Shows each week as a calendar with a color for each member, along with a total workload for each member and a list of understaffed periods.
- **Shift swaps.** A member drags to select part of their own shift and offers it to another member. They can also ask for part of that member's shift in return. The other member accepts or declines. Accepting a swap runs in a single database transaction that locks both the swap request and the schedule. The swap is rejected if either shift has changed since the request was sent.
- **Consistent times across time zones.** Shift times are stored in UTC and shown exactly as the organizer entered them, so every member sees the same hours wherever they are.

## Tech Stack

| Layer               | Technology                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Language            | TypeScript 5.9 (frontend and backend)                                                             |
| Frontend            | React 19, React Router 7, Vite 7                                                                  |
| UI                  | Tailwind CSS 4 (`@tailwindcss/vite`), Base UI (`@base-ui/react`), Lucide icons                    |
| Backend             | Node.js 22, Express 5, run directly from TypeScript source with `tsx`                              |
| Database            | PostgreSQL through `pg`, hosted on Neon. Migrations are plain SQL files.                           |
| Integrations        | Google Identity Services, Google Calendar API v3 (`gapi-script`)                                  |
| Testing and linting | `node:test` run through `tsx`; ESLint 9 with `typescript-eslint`                                  |
| Hosting             | Cloudflare Pages (frontend); AWS EC2 with pm2 and Cloudflare Tunnel (API); Neon (database)        |

## Project Structure

```
.
├── index.html                    Vite HTML entry; loads the Google Identity Services script
├── vite.config.ts                React and Tailwind plugins; proxies /api to localhost:4000 in dev
├── public/                       Static files copied into dist/ unchanged
├── src/                          Frontend (single-page React app)
│   ├── main.tsx                  Client entry point
│   ├── App.tsx                   Route definitions
│   ├── index.css                 Tailwind import and shared ui-* component classes
│   ├── pages/
│   │   ├── Create.tsx            /                 Create a group
│   │   ├── GroupPage.tsx         /:uuid            Member login and availability entry
│   │   ├── WeekScheduler.tsx                       Availability grid, Google Calendar import, CSV export
│   │   ├── AdminPage.tsx         /:uuid/admin      Submission status and schedule generation
│   │   └── SchedulePage.tsx      /:uuid/schedule   Member schedule view and swap requests
│   ├── components/
│   │   ├── ScheduleResults.tsx   Weekly schedule display and swap range selection
│   │   └── SwapRequestsPanel.tsx Incoming and outgoing swap requests
│   └── lib/
│       ├── api.ts                Typed fetch client for the API
│       ├── datetime.ts           Formatting helpers for UTC-stored times
│       ├── colors.ts             Colorblind-safe palette for member colors
│       └── types.ts              Shared type definitions used by the frontend
└── server/                       Backend (Express API)
    ├── index.ts                  Server entry point: CORS, JSON body parsing, /api/health, error handler
    ├── routes.ts                 REST endpoints under /api/groups
    ├── db.ts                     Postgres connection pool and all queries
    ├── scheduler.ts              Schedule generation algorithm
    ├── swaps.ts                  Applies an accepted swap to the schedule
    ├── auth.ts                   Password hashing and verification (scrypt)
    ├── types.ts                  Server-side type definitions
    ├── migrate.ts                Migration runner
    ├── migrations/               Numbered .sql migration files
    ├── seed-auburn-tenting.ts    Creates a demo group from the fixture data
    ├── fixtures/                 Anonymized availability data from a real group
    └── *.test.ts                 Scheduler unit tests and database integration tests
```

## Local Development Setup

### Prerequisites

- **Node.js** 20.19+ or 22.12+ (the version range Vite 7 supports). The project is developed on Node 22.
- **npm.** The repository includes a `package-lock.json`, so use npm rather than yarn or pnpm.
- **PostgreSQL**, either a local install, a Docker container, or a Neon branch. Do not use the production database.
- **A Google Cloud OAuth client and API key.** These are optional and only needed for Google Calendar import. See [Environment Variables](#environment-variables).

### Steps

1. Clone the repository and install dependencies.

   ```bash
   git clone git@github.com:sakofficialcode/pitchd.git
   cd pitchd
   npm install
   ```

2. Set up a database. To run Postgres locally with Docker:

   ```bash
   docker run -d --name campout-db -p 5432:5432 \
     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=campout postgres:17
   ```

   To use Neon instead, create a branch from the main branch in the Neon console and copy its connection string.

3. Create `.env` in the repository root. This file is required, and the server will not start without it.

   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/campout
   ```

4. Optionally, create `.env.local` to enable Google Calendar import. Everything else in the app works without it.

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   ```

5. Create the database tables.

   ```bash
   npm run db:migrate
   ```

6. Start the frontend and the API.

   ```bash
   npm run dev
   ```

   The app runs at http://localhost:5173 and the API at http://localhost:4000. The API restarts automatically when you edit server files. Vite forwards `/api` requests to port 4000, so do not set `VITE_API_BASE_URL` during development.

7. Optionally, load demo data. The seed script creates a 12-member group, generates its schedule, and prints the group UUID.

   ```bash
   npx tsx --env-file=.env server/seed-auburn-tenting.ts
   ```

   To see the schedule, open `http://localhost:5173/<uuid>/admin` and click View Last Schedule. To act as a member, open `http://localhost:5173/<uuid>/schedule` and log in as `M1` through `M12` with the password `demo-password`.

### Scripts

| Command                  | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `npm run dev`            | Runs the Vite dev server and the API together                            |
| `npm run dev:client`     | Runs only the Vite dev server                                            |
| `npm run dev:server`     | Runs only the API, restarting it when files change                       |
| `npm run build`          | Type-checks `src/` and builds the frontend into `dist/`                  |
| `npm run preview`        | Serves the contents of `dist/` locally                                   |
| `npm start`              | Runs the API without restarting on file changes (used in production)    |
| `npm run db:migrate`     | Applies any migrations in `server/migrations/` that have not run yet     |
| `npm run test:scheduler` | Runs the scheduler unit tests; no database needed                        |
| `npm run test:db`        | Runs the database integration tests against `DATABASE_URL`               |
| `npm run lint`           | Runs ESLint on the repository                                            |

### Notes

- `npm run test:db` adds test groups to whichever database `DATABASE_URL` points to and does not remove them afterward. Only run it against a development database.
- `npm run build` does not type-check the `server/` directory. The server runs through `tsx`, which removes type annotations without checking them, so type errors in server code only appear in your editor.
- To change the database schema, add a new file to `server/migrations/` with the next number, such as `002_add_column.sql`. The runner applies files in name order, runs each one in its own transaction, and records it in the `_migrations` table. Do not edit a migration that has already been applied.

## Environment Variables

The server reads `.env` through Node's `--env-file` flag. The frontend reads `.env.local` in development and the Cloudflare Pages build settings in production. Both files are excluded from git.

Vite copies every `VITE_*` value into the JavaScript bundle at build time, so anyone who loads the site can read them. Never store a secret in a `VITE_*` variable.

### Server (`.env`)

| Variable       | Required        | Default                | Description                                                                                                                    |
| -------------- | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | Yes             | None                   | PostgreSQL connection string. For local work, use a development database, never production.                                   |
| `PORT`         | No              | `4000`                 | Port the API listens on. The Vite dev proxy is set to port 4000, so if you change this locally, update `vite.config.ts` too.  |
| `CORS_ORIGIN`  | In production   | Not set (any origin)   | The exact origin of the deployed frontend, for example `https://app.campoutapp.com`.                                           |
| `NODE_ENV`     | No              | Not set                | When set to `production`, the server logs a warning at startup if `CORS_ORIGIN` is missing.                                    |

### Frontend (`.env.local` or Cloudflare Pages build settings)

| Variable                | Required               | Description                                                                                                                                                              |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL`     | In production          | The API's origin with no trailing slash, for example `https://api.campoutapp.com`. The frontend adds `/api/...` to this value. Leave it unset in development.            |
| `VITE_GOOGLE_CLIENT_ID` | For calendar import    | OAuth 2.0 web client ID from Google Cloud Console. Every origin the app runs on must be listed under Authorized JavaScript origins, including `http://localhost:5173`.    |
| `VITE_GOOGLE_API_KEY`   | For calendar import    | API key for a Google Cloud project with the Google Calendar API enabled. Restrict it to your site's URLs (HTTP referrer restriction), since it is visible in the browser. |

## Deployment

| Component | Host                                                        | URL                        |
| --------- | ----------------------------------------------------------- | -------------------------- |
| Frontend  | Cloudflare Pages                                            | https://app.campoutapp.com |
| API       | Express under pm2 on EC2, reached through Cloudflare Tunnel | https://api.campoutapp.com |
| Database  | Neon Postgres (production is the main branch)               | Not public                 |

If a change affects both the database schema and the API, run the migration before restarting the API. If a frontend change relies on a new API endpoint, deploy the API first.

### Frontend (Cloudflare Pages)

The Pages project is connected to the GitHub repository, and pushing to `main` starts a production build.

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`

These values are fixed at build time, so after changing one, redeploy for it to take effect. No redirect rules are needed for routes like `/:uuid/schedule`, because Pages serves `index.html` for any path that does not match a file.

To check a production build locally before pushing, run `npm run build && npm run preview`.

### API (EC2)

The server runs directly from TypeScript source through `tsx`, so there is no build step. For the same reason, `tsx` is listed under `dependencies` instead of `devDependencies`.

To set up a new host:

1. Install Node.js 22 and pm2 (`npm install -g pm2`).
2. Clone the repository and run `npm ci --omit=dev`.
3. Create `.env` with the production `DATABASE_URL`, `CORS_ORIGIN`, and `NODE_ENV=production`.
4. Run `npm run db:migrate`.
5. Start the API with `pm2 start npm --name campout-api -- start`. Then run `pm2 save` and `pm2 startup` so it restarts after a reboot.
6. Configure `cloudflared` to send traffic for the API hostname to `http://localhost:4000`. The instance does not need any inbound HTTP or HTTPS ports open.

To deploy an update, run these commands in the repository directory on the host:

```bash
git pull
npm ci --omit=dev
npm run db:migrate
pm2 restart campout-api --update-env
curl https://api.campoutapp.com/api/health   # expect {"status":"ok"}
```

If the frontend moves to a new domain, make two changes. Update `CORS_ORIGIN` on the API host and restart pm2, and add the new domain to Authorized JavaScript origins in the Google OAuth client settings. Until `CORS_ORIGIN` is updated, browsers will block requests to the API, even though tools like `curl` still get normal responses.

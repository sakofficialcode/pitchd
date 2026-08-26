import express from 'express';
import cors from 'cors';
import { router } from './routes.ts';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// In production this must be set to the exact frontend origin (e.g.
// https://campout.pages.dev) — leaving it unset falls back to reflecting
// any request origin, which is fine for local dev but not for prod.
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === 'production' && !CORS_ORIGIN) {
  console.warn('CORS_ORIGIN is not set — allowing requests from any origin. Set it in production.');
}

app.use(cors({ origin: CORS_ORIGIN ?? true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', router);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Campout API listening on http://localhost:${PORT}`);
});

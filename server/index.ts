import express from 'express';
import { router } from './routes.ts';

const app = express();
const PORT = 4000;

app.use(express.json());
app.use('/api', router);

app.listen(PORT, () => {
  console.log(`Campout API listening on http://localhost:${PORT}`);
});

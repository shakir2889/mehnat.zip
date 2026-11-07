import 'dotenv/config';
import { app } from './app';
for (const k of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'PUBLIC_BASE_URL']) if (!process.env[k]) throw new Error(`Missing env ${k}`);
app.listen(Number(process.env.PORT) || 3000, () => console.log('Mehnat API running'));

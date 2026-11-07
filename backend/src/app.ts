import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from './middleware/auth';
import { authRouter } from './routes/auth';
import { businessRouter } from './routes/businesses';
import { invoiceRouter } from './routes/invoices';
import { khataRouter } from './routes/khata';
import { publicRouter } from './routes/public';
import { bookingRouter, locationRouter } from './routes/bookings';
import { profileRouter } from './routes/profiles';
import { adminRouter } from './routes/admin';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.get('/health', (_q, r) => r.json({ ok: true }));

app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRouter);
app.use(publicRouter);
app.use('/api/v1/businesses', requireAuth, businessRouter);
app.use('/api/v1/invoices', requireAuth, invoiceRouter);
app.use('/api/v1/khata', requireAuth, khataRouter);
app.use('/api/v1/bookings', requireAuth, bookingRouter);
app.use('/api/v1/location', requireAuth, locationRouter);
app.use('/api/v1/profiles', requireAuth, profileRouter);
app.use('/api/v1/admin', requireAuth, requireRole('admin'), adminRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err); res.status(500).json({ error: 'internal_error' });
});

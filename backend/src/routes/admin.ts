import { Router } from 'express';
import { z } from 'zod';
import { eq, count } from 'drizzle-orm';
import { db } from '../db';
import { users, workers, drivers, vehicles, invoices, bookings, auditLogs } from '../db/schema';
import { AuthedRequest } from '../middleware/auth';
import { audit } from '../lib/helpers';

export const adminRouter = Router();

adminRouter.get('/stats', async (_req, res) => {
  const c = async (t: any) => (await db.select({ c: count() }).from(t))[0].c;
  res.json({ users: await c(users), workers: await c(workers), drivers: await c(drivers), vehicles: await c(vehicles), invoices: await c(invoices), bookings: await c(bookings) });
});
adminRouter.post('/approve/:type/:id', async (req: AuthedRequest, res) => {
  const { type, id } = req.params;
  if (type === 'worker') await db.update(workers).set({ approved: true }).where(eq(workers.userId, id));
  else if (type === 'driver') await db.update(drivers).set({ approved: true }).where(eq(drivers.userId, id));
  else if (type === 'vehicle') await db.update(vehicles).set({ approved: true }).where(eq(vehicles.id, id));
  else return res.status(400).json({ error: 'bad_type' });
  await audit(req.user!.id, 'approve', type, id);
  res.json({ ok: true });
});
adminRouter.post('/suspend/:userId', async (req: AuthedRequest, res) => {
  const p = z.object({ suspended: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  await db.update(users).set({ suspended: p.data.suspended }).where(eq(users.id, req.params.userId));
  await audit(req.user!.id, p.data.suspended ? 'suspend' : 'unsuspend', 'user', req.params.userId);
  res.json({ ok: true });
});
adminRouter.get('/audit-logs', async (_req, res) => res.json(await db.select().from(auditLogs).limit(200)));

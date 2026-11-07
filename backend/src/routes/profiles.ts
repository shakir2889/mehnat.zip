import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { workers, drivers, vehicles } from '../db/schema';
import { AuthedRequest, requireRole } from '../middleware/auth';

export const profileRouter = Router();
// Registration creates UNAPPROVED profiles; admin must approve before they appear in matching.
profileRouter.post('/workers', requireRole('worker'), async (req: AuthedRequest, res) => {
  const p = z.object({ category: z.string(), experienceYears: z.number().int().min(0), dayRate: z.number().positive() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  await db.insert(workers).values({ userId: req.user!.id, category: p.data.category, experienceYears: p.data.experienceYears, dayRate: p.data.dayRate.toFixed(2) }).onConflictDoNothing();
  res.status(201).json({ ok: true, status: 'pending_approval' });
});
profileRouter.post('/drivers', requireRole('driver'), async (req: AuthedRequest, res) => {
  await db.insert(drivers).values({ userId: req.user!.id }).onConflictDoNothing();
  res.status(201).json({ ok: true, status: 'pending_approval' });
});
profileRouter.post('/vehicles', requireRole('driver'), async (req: AuthedRequest, res) => {
  const p = z.object({ category: z.enum(['3_ton', '5_ton', '7_ton', 'large', 'pickup', 'trailer', 'jcb', 'excavator', 'crane']), plate: z.string().min(3), capacityTons: z.number().positive().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const [v] = await db.insert(vehicles).values({ driverId: req.user!.id, category: p.data.category, plate: p.data.plate, capacityTons: p.data.capacityTons?.toFixed(2) }).returning();
  res.status(201).json(v);
});

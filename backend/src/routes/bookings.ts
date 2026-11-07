import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { bookings, workers, drivers, vehicles, users, notifications } from '../db/schema';
import { AuthedRequest, requireRole } from '../middleware/auth';

export const bookingRouter = Router();
export const locationRouter = Router();

const dist = (lat: number, lng: number, t: string) =>
  sql.raw(`6371 * acos(least(1, cos(radians(${lat})) * cos(radians(${t}.lat)) * cos(radians(${t}.lng) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${t}.lat))))`);

locationRouter.post('/update', requireRole('worker', 'driver'), async (req: AuthedRequest, res) => {
  const p = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), available: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const set = { lat: p.data.lat, lng: p.data.lng, available: p.data.available, locationUpdatedAt: new Date() };
  if (req.user!.role === 'worker') await db.update(workers).set(set).where(eq(workers.userId, req.user!.id));
  else await db.update(drivers).set(set).where(eq(drivers.userId, req.user!.id));
  res.json({ ok: true });
});

// Expanding radius search: 5 km -> 10 km -> 20 km.
async function nearby(kind: 'labour' | 'truck', category: string, lat: number, lng: number) {
  for (const radius of [5, 10, 20]) {
    let rows: { userId: string; distanceKm: number }[];
    if (kind === 'labour') {
      const d = dist(lat, lng, 'workers');
      rows = await db.select({ userId: workers.userId, distanceKm: sql<number>`${d}` }).from(workers)
        .where(and(eq(workers.available, true), eq(workers.approved, true), eq(workers.category, category), sql`workers.lat is not null and ${d} <= ${radius}`)).orderBy(d).limit(20);
    } else {
      const d = dist(lat, lng, 'drivers');
      rows = await db.selectDistinct({ userId: drivers.userId, distanceKm: sql<number>`${d}` }).from(drivers).innerJoin(vehicles, eq(vehicles.driverId, drivers.userId))
        .where(and(eq(drivers.available, true), eq(drivers.approved, true), eq(vehicles.approved, true), eq(vehicles.category, category), sql`drivers.lat is not null and ${d} <= ${radius}`)).orderBy(d).limit(20);
    }
    if (rows.length) return { radius, rows };
  }
  return { radius: 20, rows: [] as { userId: string; distanceKm: number }[] };
}

locationRouter.get('/nearby', async (req, res) => {
  const p = z.object({ kind: z.enum(['labour', 'truck']), category: z.string(), lat: z.coerce.number(), lng: z.coerce.number() }).safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  res.json(await nearby(p.data.kind, p.data.category, p.data.lat, p.data.lng)); // id + distance only; exact coordinates never returned
});

bookingRouter.post('/', async (req: AuthedRequest, res) => {
  const p = z.object({ kind: z.enum(['labour', 'truck']), category: z.string(), pickupLat: z.number(), pickupLng: z.number(), dropLat: z.number().optional(), dropLng: z.number().optional(), paymentMethod: z.enum(['cash', 'online']).default('cash') }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id));
  const [b] = await db.insert(bookings).values({ ...p.data, customerId: u.id, currency: u.country === 'QA' ? 'QAR' : 'PKR' }).returning();
  const found = await nearby(p.data.kind, p.data.category, p.data.pickupLat, p.data.pickupLng);
  if (found.rows.length) await db.insert(notifications).values(found.rows.map((r) => ({ userId: r.userId, title: 'New job request', body: `${p.data.category} job within ${found.radius} km` })));
  // TODO Phase 11: FCM push + WebSocket events to these providers.
  res.status(201).json({ booking: b, notified: found.rows.length, radiusKm: found.radius });
});

bookingRouter.post('/:id/accept', requireRole('worker', 'driver'), async (req: AuthedRequest, res) => {
  const p = z.object({ quote: z.number().positive() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'quote_required' });
  const [b] = await db.update(bookings).set({ providerId: req.user!.id, status: 'accepted', quote: p.data.quote.toFixed(2) })
    .where(and(eq(bookings.id, req.params.id), eq(bookings.status, 'requested'))).returning(); // atomic: first acceptor wins
  if (!b) return res.status(409).json({ error: 'already_taken_or_missing' });
  await db.insert(notifications).values({ userId: b.customerId, title: 'Booking accepted', body: `Quote: ${b.currency} ${b.quote}` });
  res.json(b);
});

bookingRouter.post('/:id/status', async (req: AuthedRequest, res) => {
  const p = z.object({ status: z.enum(['in_progress', 'completed', 'cancelled']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const [cur] = await db.select().from(bookings).where(eq(bookings.id, req.params.id));
  if (!cur || (cur.customerId !== req.user!.id && cur.providerId !== req.user!.id)) return res.status(404).json({ error: 'not_found' });
  const [b] = await db.update(bookings).set({ status: p.data.status }).where(eq(bookings.id, cur.id)).returning();
  res.json(b);
});

bookingRouter.get('/mine', async (req: AuthedRequest, res) => {
  res.json(await db.select().from(bookings).where(sql`${bookings.customerId} = ${req.user!.id} or ${bookings.providerId} = ${req.user!.id}`));
});

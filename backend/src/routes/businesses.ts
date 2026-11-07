import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { businesses, customerAccounts } from '../db/schema';
import { AuthedRequest } from '../middleware/auth';
import { canAccessBusiness, audit } from '../lib/helpers';

export const businessRouter = Router();

businessRouter.post('/', async (req: AuthedRequest, res) => {
  const p = z.object({ name: z.string().min(2), country: z.enum(['QA', 'PK']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const currency = p.data.country === 'QA' ? 'QAR' : 'PKR';
  const [b] = await db.insert(businesses).values({ ...p.data, currency, ownerId: req.user!.id }).returning();
  await audit(req.user!.id, 'create', 'business', b.id);
  res.status(201).json(b);
});

businessRouter.get('/', async (req: AuthedRequest, res) => {
  res.json(await db.select().from(businesses).where(eq(businesses.ownerId, req.user!.id)));
});

businessRouter.post('/:businessId/accounts', async (req: AuthedRequest, res) => {
  if (!(await canAccessBusiness(req.user!.id, req.params.businessId))) return res.status(403).json({ error: 'forbidden' });
  const p = z.object({ name: z.string().min(1), phone: z.string().optional(), type: z.enum(['customer', 'supplier']).default('customer') }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const [a] = await db.insert(customerAccounts).values({ ...p.data, businessId: req.params.businessId }).returning();
  res.status(201).json(a);
});

businessRouter.get('/:businessId/accounts', async (req: AuthedRequest, res) => {
  if (!(await canAccessBusiness(req.user!.id, req.params.businessId))) return res.status(403).json({ error: 'forbidden' });
  res.json(await db.select().from(customerAccounts).where(eq(customerAccounts.businessId, req.params.businessId)));
});

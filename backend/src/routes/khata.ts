import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { ledgerEntries, customerAccounts } from '../db/schema';
import { AuthedRequest } from '../middleware/auth';
import { canAccessBusiness, audit } from '../lib/helpers';

export const khataRouter = Router();

// Manual khata entry (credit/debit). Append-only.
khataRouter.post('/entries', async (req: AuthedRequest, res) => {
  const p = z.object({ accountId: z.string().uuid(), direction: z.enum(['debit', 'credit']), amount: z.number().positive(), note: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const [acc] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, p.data.accountId));
  if (!acc || !(await canAccessBusiness(req.user!.id, acc.businessId))) return res.status(404).json({ error: 'not_found' });
  const [e] = await db.insert(ledgerEntries).values({ businessId: acc.businessId, accountId: acc.id, direction: p.data.direction, amount: p.data.amount.toFixed(2), note: p.data.note, createdBy: req.user!.id }).returning();
  await audit(req.user!.id, 'khata_entry', 'ledger_entry', e.id);
  res.status(201).json(e);
});

// Controlled reversal: opposite entry linked to the original. Originals are never edited.
khataRouter.post('/entries/:id/reverse', async (req: AuthedRequest, res) => {
  const [orig] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, req.params.id));
  if (!orig || !(await canAccessBusiness(req.user!.id, orig.businessId))) return res.status(404).json({ error: 'not_found' });
  const [already] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.reversalOf, orig.id));
  if (already || orig.reversalOf) return res.status(409).json({ error: 'already_reversed_or_is_reversal' });
  const [r] = await db.insert(ledgerEntries).values({ businessId: orig.businessId, accountId: orig.accountId, direction: orig.direction === 'debit' ? 'credit' : 'debit', amount: orig.amount, note: `Reversal of ${orig.id}`, reversalOf: orig.id, createdBy: req.user!.id }).returning();
  await audit(req.user!.id, 'reverse', 'ledger_entry', orig.id);
  res.status(201).json(r);
});

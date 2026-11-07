import { Router } from 'express';
import { z } from 'zod';
import { and, eq, count, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { invoices, invoiceItems, invoicePayments, ledgerEntries, customerAccounts } from '../db/schema';
import { AuthedRequest } from '../middleware/auth';
import { canAccessBusiness, audit } from '../lib/helpers';
import { newToken } from '../lib/auth';

export const invoiceRouter = Router();

const createSchema = z.object({
  businessId: z.string().uuid(), accountId: z.string().uuid(),
  description: z.string().optional(), dueDate: z.string().datetime().optional(),
  items: z.array(z.object({ description: z.string().min(1), quantity: z.number().positive(), unitPrice: z.number().nonnegative() })).min(1),
});

invoiceRouter.post('/', async (req: AuthedRequest, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const biz = await canAccessBusiness(req.user!.id, p.data.businessId);
  if (!biz) return res.status(403).json({ error: 'forbidden' });
  const [acc] = await db.select().from(customerAccounts).where(and(eq(customerAccounts.id, p.data.accountId), eq(customerAccounts.businessId, biz.id)));
  if (!acc) return res.status(404).json({ error: 'account_not_found' });
  const total = p.data.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice * 100), 0) / 100;

  const inv = await db.transaction(async (tx) => {
    const [{ c }] = await tx.select({ c: count() }).from(invoices).where(eq(invoices.businessId, biz.id));
    const number = `INV-${new Date().getFullYear()}-${String(c + 1).padStart(3, '0')}`;
    const [row] = await tx.insert(invoices).values({
      businessId: biz.id, accountId: acc.id, number, publicToken: newToken(24), currency: biz.currency,
      total: total.toFixed(2), description: p.data.description, dueDate: p.data.dueDate ? new Date(p.data.dueDate) : null,
    }).returning();
    await tx.insert(invoiceItems).values(p.data.items.map((i) => ({ invoiceId: row.id, description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
    await tx.insert(ledgerEntries).values({ businessId: biz.id, accountId: acc.id, direction: 'debit', amount: total.toFixed(2), note: `Invoice ${number}`, invoiceId: row.id, createdBy: req.user!.id });
    return row;
  });
  await audit(req.user!.id, 'create', 'invoice', inv.id);
  res.status(201).json({ ...inv, shareUrl: `${process.env.PUBLIC_BASE_URL}/bill/${inv.publicToken}` });
});

invoiceRouter.get('/', async (req: AuthedRequest, res) => {
  const businessId = String(req.query.businessId || '');
  if (!(await canAccessBusiness(req.user!.id, businessId))) return res.status(403).json({ error: 'forbidden' });
  res.json(await db.select().from(invoices).where(eq(invoices.businessId, businessId)).orderBy(desc(invoices.createdAt)));
});

// Record a CASH payment. Online payments will only be recorded from verified provider webhooks (Phase 12).
invoiceRouter.post('/:id/payments', async (req: AuthedRequest, res) => {
  const p = z.object({ amount: z.number().positive() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, req.params.id));
  if (!inv || !(await canAccessBusiness(req.user!.id, inv.businessId))) return res.status(404).json({ error: 'not_found' });
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(invoices).where(eq(invoices.id, inv.id)).for('update');
    const remaining = Number(locked.total) - Number(locked.paid);
    if (p.data.amount > remaining + 1e-9) return { error: 'exceeds_balance' as const };
    await tx.insert(invoicePayments).values({ invoiceId: inv.id, amount: p.data.amount.toFixed(2), method: 'cash', createdBy: req.user!.id });
    await tx.insert(ledgerEntries).values({ businessId: inv.businessId, accountId: inv.accountId, direction: 'credit', amount: p.data.amount.toFixed(2), note: `Payment for ${inv.number}`, invoiceId: inv.id, createdBy: req.user!.id });
    const paid = Number(locked.paid) + p.data.amount;
    const status = paid >= Number(locked.total) - 1e-9 ? 'paid' : 'partial';
    const [u] = await tx.update(invoices).set({ paid: paid.toFixed(2), status }).where(eq(invoices.id, inv.id)).returning();
    return { invoice: u };
  });
  if ('error' in result) return res.status(400).json(result);
  await audit(req.user!.id, 'payment', 'invoice', inv.id, { amount: p.data.amount });
  res.status(201).json(result.invoice);
});

// Khata balance per account = debits - credits
invoiceRouter.get('/ledger/:accountId', async (req: AuthedRequest, res) => {
  const [acc] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, req.params.accountId));
  if (!acc || !(await canAccessBusiness(req.user!.id, acc.businessId))) return res.status(404).json({ error: 'not_found' });
  const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, acc.id)).orderBy(desc(ledgerEntries.createdAt));
  const [b] = await db.select({ bal: sql<string>`coalesce(sum(case when direction='debit' then amount else -amount end),0)` }).from(ledgerEntries).where(eq(ledgerEntries.accountId, acc.id));
  res.json({ account: acc, balance: b.bal, entries });
});

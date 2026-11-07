import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { invoices, invoiceItems, businesses, customerAccounts } from '../db/schema';

export const publicRouter = Router();

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [inv] = await db.select().from(invoices).where(eq(invoices.publicToken, token));
  if (!inv) return null;
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, inv.businessId));
  const [acc] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, inv.accountId));
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  // Only safe fields exposed; phone masked; no internal ids.
  const mask = (p?: string | null) => (p ? p.slice(0, 4) + '****' + p.slice(-2) : null);
  return {
    number: inv.number, business: biz.name, customer: acc.name, customerPhone: mask(acc.phone),
    currency: inv.currency, total: inv.total, paid: inv.paid, status: inv.status, description: inv.description,
    issueDate: inv.issueDate, dueDate: inv.dueDate, items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
  };
}

publicRouter.get('/api/v1/public/bills/:token', async (req, res) => {
  const b = await load(req.params.token);
  b ? res.json(b) : res.status(404).json({ error: 'not_found' });
});

publicRouter.get('/api/v1/public/bills/:token/pdf', async (req, res) => {
  const b = await load(req.params.token);
  if (!b) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${b.number}.pdf"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text(b.business).moveDown(0.5);
  doc.fontSize(12).text(`Invoice: ${b.number}`).text(`Customer: ${b.customer}`).text(`Status: ${b.status.toUpperCase()}`).moveDown();
  b.items.forEach((i) => doc.text(`${i.description}  x${i.quantity}  @ ${i.unitPrice}`));
  doc.moveDown().fontSize(14).text(`Total: ${b.currency} ${b.total}`).text(`Paid: ${b.currency} ${b.paid}`);
  doc.end();
});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
publicRouter.get('/bill/:token', async (req, res) => {
  const b = await load(req.params.token);
  if (!b) return res.status(404).send('Bill not found');
  res.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(b.number)}</title>
<body style="font-family:sans-serif;max-width:480px;margin:auto;padding:16px"><h2 style="color:#4c1d95">${esc(b.business)}</h2>
<p>Invoice <b>${esc(b.number)}</b><br>Customer: ${esc(b.customer)}<br>Status: <b>${esc(b.status)}</b></p>
<table width=100%>${b.items.map((i) => `<tr><td>${esc(i.description)} x${esc(i.quantity)}</td><td align=right>${esc(i.unitPrice)}</td></tr>`).join('')}</table>
<h3>Total: ${esc(b.currency)} ${esc(b.total)}</h3><p>Paid: ${esc(b.currency)} ${esc(b.paid)}</p>
<a href="/api/v1/public/bills/${esc(req.params.token)}/pdf">Download PDF</a></body>`);
});

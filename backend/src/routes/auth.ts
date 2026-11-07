import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { users, refreshTokens } from '../db/schema';
import { signAccess, newToken, sha256 } from '../lib/auth';

export const authRouter = Router();
const REFRESH_DAYS = 30;

async function issue(userId: string, role: string) {
  const refresh = newToken(48);
  await db.insert(refreshTokens).values({ userId, tokenHash: sha256(refresh), expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) });
  return { accessToken: signAccess(userId, role), refreshToken: refresh };
}

const registerSchema = z.object({
  phone: z.string().min(8).max(20), name: z.string().min(2), password: z.string().min(8),
  country: z.enum(['QA', 'PK']), role: z.enum(['customer', 'business_owner', 'worker', 'driver']).default('customer'),
});

authRouter.post('/register', async (req, res) => {
  const p = registerSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  const [exists] = await db.select().from(users).where(eq(users.phone, p.data.phone));
  if (exists) return res.status(409).json({ error: 'phone_in_use' });
  const { password, ...rest } = p.data;
  const [u] = await db.insert(users).values({ ...rest, passwordHash: await bcrypt.hash(password, 12) }).returning();
  // TODO: send real OTP via SMS provider; phoneVerified stays false until then.
  res.status(201).json({ user: { id: u.id, name: u.name, role: u.role }, ...(await issue(u.id, u.role)) });
});

authRouter.post('/login', async (req, res) => {
  const p = z.object({ phone: z.string(), password: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const [u] = await db.select().from(users).where(eq(users.phone, p.data.phone));
  if (!u || u.suspended || !(await bcrypt.compare(p.data.password, u.passwordHash))) return res.status(401).json({ error: 'invalid_credentials' });
  res.json({ user: { id: u.id, name: u.name, role: u.role }, ...(await issue(u.id, u.role)) });
});

// Refresh rotation: old token revoked on use; reuse of a revoked token revokes all sessions.
authRouter.post('/refresh', async (req, res) => {
  const p = z.object({ refreshToken: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const [t] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(p.data.refreshToken)));
  if (!t || t.expiresAt < new Date()) return res.status(401).json({ error: 'invalid_refresh' });
  if (t.revokedAt) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, t.userId), isNull(refreshTokens.revokedAt)));
    return res.status(401).json({ error: 'token_reuse_detected' });
  }
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, t.id));
  const [u] = await db.select().from(users).where(eq(users.id, t.userId));
  if (!u || u.suspended) return res.status(401).json({ error: 'account_unavailable' });
  res.json(await issue(u.id, u.role));
});

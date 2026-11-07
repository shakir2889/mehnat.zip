import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/auth';
export interface AuthedRequest extends Request { user?: { id: string; role: string } }
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try { const p = verifyAccess(h.slice(7)); req.user = { id: p.sub, role: p.role }; next(); }
  catch { res.status(401).json({ error: 'invalid_token' }); }
}
export const requireRole = (...roles: string[]) => (req: AuthedRequest, res: Response, next: NextFunction) =>
  roles.includes(req.user!.role) ? next() : res.status(403).json({ error: 'forbidden' });

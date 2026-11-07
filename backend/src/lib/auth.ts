import jwt from 'jsonwebtoken';
import crypto from 'crypto';
const A = () => process.env.JWT_ACCESS_SECRET!;
export const signAccess = (id: string, role: string) => jwt.sign({ sub: id, role }, A(), { expiresIn: '15m' });
export const verifyAccess = (t: string) => jwt.verify(t, A()) as unknown as { sub: string; role: string };
export const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

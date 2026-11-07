import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { businesses, businessMembers, auditLogs } from '../db/schema';
export async function canAccessBusiness(userId: string, businessId: string) {
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!biz) return null;
  if (biz.ownerId === userId) return biz;
  const [m] = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)));
  return m ? biz : null;
}
export const audit = (actorId: string | null, action: string, entity: string, entityId?: string, meta?: unknown) =>
  db.insert(auditLogs).values({ actorId, action, entity, entityId, meta: meta ? JSON.stringify(meta) : null });

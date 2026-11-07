import { pgTable, uuid, text, timestamp, numeric, integer, boolean, doublePrecision, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['customer', 'business_owner', 'worker', 'driver', 'admin']);
export const countryEnum = pgEnum('country', ['QA', 'PK']);
export const currencyEnum = pgEnum('currency', ['QAR', 'PKR']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['unpaid', 'partial', 'paid', 'void']);
export const accountTypeEnum = pgEnum('account_type', ['customer', 'supplier']);
export const bookingKindEnum = pgEnum('booking_kind', ['labour', 'truck']);
export const bookingStatusEnum = pgEnum('booking_status', ['requested', 'accepted', 'in_progress', 'completed', 'cancelled']);

const ts = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const money = (n: string) => numeric(n, { precision: 14, scale: 2 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  email: text('email'),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('customer'),
  country: countryEnum('country').notNull(),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  suspended: boolean('suspended').notNull().default(false),
  createdAt: ts(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: ts(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  country: countryEnum('country').notNull(),
  currency: currencyEnum('currency').notNull(),
  createdAt: ts(),
});

export const businessMembers = pgTable('business_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('staff'),
}, (t) => ({ uq: uniqueIndex('bm_uq').on(t.businessId, t.userId) }));

export const customerAccounts = pgTable('customer_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  type: accountTypeEnum('type').notNull().default('customer'),
  name: text('name').notNull(),
  phone: text('phone'),
  createdAt: ts(),
}, (t) => ({ biz: index('ca_biz').on(t.businessId) }));

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  accountId: uuid('account_id').notNull().references(() => customerAccounts.id),
  number: text('number').notNull(),
  publicToken: text('public_token').notNull().unique(),
  currency: currencyEnum('currency').notNull(),
  total: money('total').notNull(),
  paid: money('paid').notNull().default('0'),
  status: invoiceStatusEnum('status').notNull().default('unpaid'),
  description: text('description'),
  issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdAt: ts(),
}, (t) => ({ uq: uniqueIndex('inv_num_uq').on(t.businessId, t.number), biz: index('inv_biz').on(t.businessId) }));

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: money('quantity').notNull(),
  unitPrice: money('unit_price').notNull(),
});

// Immutable: never UPDATE/DELETE. Corrections = reversal row.
export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: money('amount').notNull(),
  method: text('method').notNull(), // cash | online
  reversalOf: uuid('reversal_of'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts(),
});

// Immutable ledger. debit = customer owes more, credit = customer paid.
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  accountId: uuid('account_id').notNull().references(() => customerAccounts.id),
  direction: text('direction').notNull(), // debit | credit
  amount: money('amount').notNull(),
  note: text('note'),
  invoiceId: uuid('invoice_id'),
  reversalOf: uuid('reversal_of'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts(),
}, (t) => ({ acc: index('le_acc').on(t.accountId) }));

export const workers = pgTable('workers', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  category: text('category').notNull(),
  experienceYears: integer('experience_years').notNull().default(0),
  dayRate: money('day_rate'),
  available: boolean('available').notNull().default(false),
  approved: boolean('approved').notNull().default(false),
  lat: doublePrecision('lat'), lng: doublePrecision('lng'),
  locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
});

export const drivers = pgTable('drivers', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  approved: boolean('approved').notNull().default(false),
  available: boolean('available').notNull().default(false),
  lat: doublePrecision('lat'), lng: doublePrecision('lng'),
  locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
});

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverId: uuid('driver_id').notNull().references(() => drivers.userId),
  category: text('category').notNull(),
  plate: text('plate').notNull().unique(),
  capacityTons: numeric('capacity_tons', { precision: 6, scale: 2 }),
  approved: boolean('approved').notNull().default(false),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: bookingKindEnum('kind').notNull(),
  customerId: uuid('customer_id').notNull().references(() => users.id),
  providerId: uuid('provider_id').references(() => users.id),
  category: text('category').notNull(),
  status: bookingStatusEnum('status').notNull().default('requested'),
  pickupLat: doublePrecision('pickup_lat').notNull(), pickupLng: doublePrecision('pickup_lng').notNull(),
  dropLat: doublePrecision('drop_lat'), dropLng: doublePrecision('drop_lng'),
  quote: money('quote'),
  currency: currencyEnum('currency').notNull(),
  paymentMethod: text('payment_method').notNull().default('cash'),
  createdAt: ts(),
}, (t) => ({ cust: index('bk_cust').on(t.customerId), prov: index('bk_prov').on(t.providerId) }));

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: text('title').notNull(), body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: ts(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(), entityId: text('entity_id'),
  meta: text('meta'),
  createdAt: ts(),
});

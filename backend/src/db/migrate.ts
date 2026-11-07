import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';
migrate(db, { migrationsFolder: './drizzle' }).then(() => { console.log('migrated'); return pool.end(); });

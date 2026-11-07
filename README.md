# Mehnat (Qatar + Pakistan) — Billing • Khata • Labour • Transport

## Termux setup (backend)
```
pkg update && pkg install nodejs-lts git postgresql -y
mkdir -p $PREFIX/var/lib/postgresql && initdb $PREFIX/var/lib/postgresql
pg_ctl -D $PREFIX/var/lib/postgresql start
createdb mehnat
cd mehnat/backend && cp .env.example .env   # edit secrets + DATABASE_URL
npm install
npm run typecheck
npm run db:generate && npm run db:migrate
ADMIN_PHONE=+97400000000 ADMIN_PASSWORD='StrongPass123' npm run db:seed
npm run dev
```
Test: `curl localhost:3000/health`

## Mobile
```
cd mobile && npm install && npx expo start
```
Edit `mobile/src/api.ts` with your server address.

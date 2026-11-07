# TODO
- Run typecheck + write/run automated tests (vitest + supertest)
- OTP via SMS provider (Twilio/local Qatar+Pakistan gateway) — needs credentials
- Reversal flow for invoice_payments table
- Remaining tables: user_profiles, countries, service_categories, reviews, complaints, platform_commissions, conversations, messages, location_events, payment_methods, payment_transactions
- WebSocket events, FCM push (Firebase project + service account needed)
- Chat + image upload (object storage: S3/R2 credentials)
- Payments: real provider merchant accounts (Qatar: e.g. Dibsy/MyFatoorah/Checkout; Pakistan: JazzCash/Easypaisa/Safepay) + webhook signature verification
- Admin dashboard (React), Next.js web portal, Arabic/Urdu i18n + RTL
- Rate limit per-user, backups, HTTPS domain, deployment

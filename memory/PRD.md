# PRD — The Shopkeeper's Day (Khata + Inventory + Supplier Suite)

## Original Problem Statement
PWA for small retail shopkeepers: khata ledger with dues aging + reminders, inventory with Gemini bill OCR, supplier ordering + sales analytics. Bilingual (Hindi/English), dark/light mode, customer OTP login, ₹1Cr transaction cap, offline-capable PWA shell. Three separable modules with their own API namespaces (/api/khata, /api/inventory, /api/suppliers).

## User Choices
- Single-user per shop (no staff accounts)
- Plain bills for demo (GST deferred)
- Twilio: credentials NOT provided → MOCKED (OTP returned as dev_otp + toast; SMS/WhatsApp reminders logged, marked mock). Env placeholders ready in backend/.env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_NUMBER, TWILIO_WHATSAPP_NUMBER) — real keys auto-enable sending.
- Bill OCR: Gemini (gemini-3-flash-preview) via EMERGENT_LLM_KEY
- Build all modules in one go

## Architecture
- Backend: FastAPI single server.py — JWT (bcrypt + PyJWT, Bearer tokens), APScheduler cron (overdue check every 6h), aging engine (payments FIFO against credits → 0-30/31-60/60+ buckets), ₹1Cr hard cap / ₹80L soft warning enforced server + client.
- DB: MongoDB — users, customers, ledger_entries, sales, products, bills, suppliers, purchase_orders, notifications, otp_codes, login_attempts. UUID string ids, ISO datetimes.
- Frontend: React (CRA template) + shadcn + Tailwind, react-query, Recharts, custom i18n context (en/hi), next-themes dark/light, sidebar (desktop) + bottom nav (mobile), PWA manifest + service worker (cached shell).

## Implemented (June 2026, first delivery)
- Shopkeeper auth (register/login/me) with lockout after 5 failed logins (15 min)
- Khata: customer CRUD, credit/payment entries, aging chips, per-customer threshold overdue flag, cap validation, send reminder (SMS+WhatsApp mock), transaction history
- Notifications: bell popover, overdue cron notifications, reminder logs
- Inventory: product CRUD, low-stock badges, cash/credit sell dialog (credit creates ledger entry), Bill OCR (upload → Gemini extract → editable confirm → stock-in creating/updating products), image validation (type/size/magic bytes)
- Suppliers: CRUD, reorder suggestions, PO workflow draft→sent→received (received increments stock)
- Analytics: daily/weekly/monthly sales bar chart, top items, aging pie, dashboard summary
- Customer OTP portal: phone → OTP (mock dev_otp) → read-only khata with aging + history
- Hindi/English toggle, dark/light/system theme, PWA installable
- Testing: 44 functional + 5 hardening backend tests pass (/app/backend/tests), full frontend E2E pass (iteration_1)

## Test Credentials
See /app/memory/test_credentials.md (ssjrocks6969@gmail.com / shop123456; customer +919876543210)

## Backlog / Remaining
- P0: Real Twilio credentials wiring (just fill .env), object storage for bill images (currently not persisted)
- P1: Offline-first data sync (Dexie/IndexedDB background sync, last-write-wins) — only PWA shell caching done; barcode scanner via camera
- P2: GST invoice format, staff accounts, pagination on large lists, aging aggregation query optimization (N+1 noted), PWA install prompt UX

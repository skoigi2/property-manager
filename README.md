# Property Manager

Full-stack web application for managing **Alba Gardens** (3 Airbnb short-let units) and **Riara One** (5 long-term tenanted units) in Nairobi, Kenya.

All currency is in **Kenyan Shillings (KSh)**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL via Prisma ORM 5 |
| Styling | Tailwind CSS (DM Serif / DM Mono / DM Sans) |
| Auth | NextAuth v5 (Credentials, JWT) |
| PDF | @react-pdf/renderer (server-side) |
| Deployment | Vercel + Supabase |

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- PostgreSQL database (local or Supabase)

### 1. Clone and install
```bash
git clone <repo-url>
cd "Property Manager"
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://USER:PASS@HOST:6543/DATABASE?schema=public&pgbouncer=true"
DIRECT_URL="postgresql://USER:PASS@HOST:5432/DATABASE?schema=public"
NEXTAUTH_SECRET="your-secret-here"
AUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Run database migration
```bash
npx prisma migrate dev --name init
```

### 4. Seed with historical data
```bash
npm run db:seed
```

### 5. Start development server
```bash
npm run dev
```

---

## Default Credentials

> **Change these passwords immediately after first login!**

| Role | Email | Password |
|---|---|---|
| Manager (full access) | `manager@alba.co.ke` | `manager123` |
| Owner (report view only) | `owner@alba.co.ke` | `owner123` |

---

## Pages

| Page | Role | Description |
|---|---|---|
| `/dashboard` | Manager | KPIs, alerts, rent status, Alba revenue, charts |
| `/income` | Manager | Log & view income entries |
| `/expenses` | Manager | Log & view expenses with sunk cost flag |
| `/petty-cash` | Manager | Ledger with running balance |
| `/tenants` | Manager | Tenant list, lease flags, edit, history |
| `/report` | Both | Generate & download PDF owner report |
| `/settings` | Manager | Management fee rates, unit overview |

---

## Business Logic

### Management Fee
- **Riara One**: Flat KSh 6,000/month (1-bed), KSh 8,800/month (2-bed)
- **Alba Gardens**: 10% of gross revenue per unit

### Net Income Formula
```
Gross Income − Agent Commissions = Net Revenue
Net Revenue − Operating Expenses = Net Profit to Owner
```
Capital / sunk costs are shown separately and excluded from P&L.

### Error Prevention (vs the source Excel)
1. All totals computed from DB records — no manual totals
2. Petty cash balance = `SUM(IN) − SUM(OUT)` always recomputed
3. Alert if long-term tenant has no rent entry by the 10th
4. Alert if Airbnb unit has costs but zero income
5. Management fee reconciliation always shown, never blank
6. `leaseEnd = null` triggers persistent TBC alert
7. Airbnb entries require check-in + check-out range, not a single date

---

## Deployment (Vercel + Supabase)

### 1. Create Supabase project
Get connection strings from **Settings → Database → Connection pooling**:
- Transaction mode (port 6543) → `DATABASE_URL`
- Direct connection (port 5432) → `DIRECT_URL`

### 2. Run migrations
```bash
npx prisma migrate deploy
npm run db:seed
```

### 3. Deploy to Vercel
```bash
vercel --prod
```

Set environment variables in the Vercel dashboard:
`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`

---

## Useful Commands

```bash
npm run dev           # Development server
npm run build         # Production build
npm run db:seed       # Seed historical data (Jun–Oct 2025)
npm run db:migrate    # Apply pending migrations
npm run db:studio     # Open Prisma Studio
```

---

*Property Manager · Alba Gardens & Riara One · Nairobi, Kenya*

# MySpendo

A simple personal finance tracker to help you manage income, expenses, and budgets. Built with Go and Next.js.

![Go](https://img.shields.io/badge/Go-1.24-00ADD8?style=flat&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14-336791?style=flat&logo=postgresql&logoColor=white)

**Live Demo:** https://myspendo.vercel.app

## What It Does

Track your money, set budgets, and see where your cash goes. That's pretty much it.

## Features

**Transactions**
- Add/edit/delete income and expenses
- Search and filter by category, date, amount
- Export to CSV or JSON

**Budgets**
- Set monthly or yearly spending limits
- Per-category or overall budgets
- Alert notifications when you exceed thresholds

**Recurring Transactions**
- Auto-create transactions (daily, weekly, monthly, yearly)
- Handles subscriptions, rent, bills automatically
- Background job processes every hour

**Analytics**
- Dashboard with charts and graphs
- Monthly breakdowns and trends
- Category-wise spending analysis

## Architecture

```
┌─────────────────────────────────────────────────┐
│     Next.js Frontend (React + TypeScript)       │
│     Dashboard │ Transactions │ Budgets          │
└────────────────────┬────────────────────────────┘
                     │ REST API (JWT Auth)
┌────────────────────▼────────────────────────────┐
│           Go Backend (Port 8080)                │
│   Handlers │ Middleware │ Background Jobs       │
└────────────────────┬────────────────────────────┘
                     │ SQL Queries
┌────────────────────▼────────────────────────────┐
│              PostgreSQL Database                │
│   Users │ Categories │ Transactions │ Budgets   │
└─────────────────────────────────────────────────┘
```

## Tech Stack

**Backend:** Go 1.24, PostgreSQL, JWT auth
**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS, Recharts

## Getting Started

### You'll need:
- Node.js 18+
- Go 1.24+
- PostgreSQL 14+

### Setup

**1. Clone the repo**
```bash
git clone https://github.com/vidya381/myspendo.git
cd myspendo
```

**2. Setup PostgreSQL**
```bash
psql -U postgres
CREATE DATABASE myspendo;
\q
```

**3. Backend setup**
```bash
cd go-backend

# Install dependencies
go mod download

# Configure environment
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# Run migrations
go run migrate.go

# Start server
go run main.go db.go
```

Backend runs on `http://localhost:8080`

**4. Frontend setup**
```bash
cd nextjs-frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your backend URL

# Start dev server
npm run dev
```

Frontend runs on `http://localhost:3000`

## Environment Variables

**Backend (.env)**
```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/myspendo?sslmode=disable

# Or use individual params
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=myspendo
DB_SSLMODE=disable

# Auth (generate with: openssl rand -hex 32)
JWT_SECRET=your_strong_random_secret

# CORS
CORS_ORIGIN=http://localhost:3000
```

**Frontend (.env.local)**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Deployment

- Backend: Deploy to Render (or any Go hosting)
- Frontend: Deploy to Vercel
- Database: Use Neon (or any PostgreSQL hosting)

## API Docs

See `go-backend/API.md` for all API endpoints and examples.

## Project Structure

```
myspendo/
├── go-backend/          # Go REST API
│   ├── main.go         # Server and routes
│   ├── handlers/       # API handlers
│   ├── middleware/     # Auth, rate limiting, security
│   ├── models/         # Data models
│   ├── migrations/     # SQL migrations
│   └── utils/          # Helpers
├── nextjs-frontend/     # React frontend
│   └── src/
│       ├── app/        # Pages
│       ├── components/ # React components
│       └── context/    # Auth state
└── README.md
```

## Security

- JWT tokens (72-hour expiry)
- Bcrypt password hashing
- Rate limiting (5 req/min for login, 100 req/min for API)
- Input validation and sanitization
- HTTPS enforcement (production)
- CORS protection

---

Built with Go, Next.js, React, and PostgreSQL. Background jobs handle recurring transaction processing every hour. See [API.md](./go-backend/API.md) for all endpoints and examples.

---


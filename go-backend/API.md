# MySpendo API Reference

Base URL: `http://localhost:8080` (or your deployed URL)

## Authentication

Most endpoints need authentication. Add this header to your requests:
```
Authorization: Bearer <your_jwt_token>
```

Get a token by logging in at `/login`.

---

## Auth Endpoints

### Register
`POST /register`

Create a new account.

```bash
curl -X POST http://localhost:8080/register \
  -F "username=zoro" \
  -F "email=zoro@example.com" \
  -F "password=password123"
```

**Requirements:**
- Username: 3-50 chars, alphanumeric/underscore/hyphen only
- Email: valid format
- Password: min 8 chars

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully!"
}
```

### Login
`POST /login`

Get your JWT token.

```bash
curl -X POST http://localhost:8080/login \
  -F "email=zoro@example.com" \
  -F "password=password123"
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Token expires in 72 hours.

---

## Categories

### Add Category
`POST /category/add` 🔒

```bash
curl -X POST http://localhost:8080/category/add \
  -H "Authorization: Bearer <token>" \
  -F "name=Groceries" \
  -F "type=expense"
```

**Type:** `expense` or `income`

### List Categories
`GET /category/list` 🔒

```bash
curl http://localhost:8080/category/list \
  -H "Authorization: Bearer <token>"
```

---

## Transactions

### Add Transaction
`POST /transaction/add` 🔒

```bash
curl -X POST http://localhost:8080/transaction/add \
  -H "Authorization: Bearer <token>" \
  -F "category_id=1" \
  -F "amount=45.99" \
  -F "description=Weekly groceries" \
  -F "date=2024-01-15"
```

### List Transactions
`GET /transaction/list` 🔒

```bash
curl http://localhost:8080/transaction/list \
  -H "Authorization: Bearer <token>"
```

### Update Transaction
`POST /transaction/update` 🔒

```bash
curl -X POST http://localhost:8080/transaction/update \
  -H "Authorization: Bearer <token>" \
  -F "id=1" \
  -F "category_id=1" \
  -F "amount=50.00" \
  -F "description=Updated" \
  -F "date=2024-01-15"
```

### Delete Transaction
`POST /transaction/delete` 🔒

```bash
curl -X POST http://localhost:8080/transaction/delete \
  -H "Authorization: Bearer <token>" \
  -F "id=1"
```

### Search Transactions
`GET /transactions/search` 🔒

Filter by category, date range, amount, or keyword.

```bash
curl "http://localhost:8080/transactions/search?category_id=1&from=2024-01-01&to=2024-01-31&sort=date_desc" \
  -H "Authorization: Bearer <token>"
```

**Query params:**
- `q`: keyword search
- `category_id`: filter by category
- `from`, `to`: date range (YYYY-MM-DD)
- `min_amount`, `max_amount`: amount range
- `sort`: `date_asc`, `date_desc`, `amount_asc`, `amount_desc`
- `limit`: max results (default 20, max 1000)
- `offset`: pagination offset

---

## Budgets

### Add Budget
`POST /budget/add` 🔒

```bash
curl -X POST http://localhost:8080/budget/add \
  -H "Authorization: Bearer <token>" \
  -F "category_id=1" \
  -F "amount=500.00" \
  -F "period=monthly" \
  -F "alert_threshold=80"
```

**category_id:** Use `0` for overall budget, or a specific category ID
**period:** `monthly` or `yearly`
**alert_threshold:** percentage (0-100)

### List Budgets
`GET /budget/list` 🔒

Shows current spending vs budget.

```bash
curl http://localhost:8080/budget/list \
  -H "Authorization: Bearer <token>"
```

### Update Budget
`POST /budget/update` 🔒

```bash
curl -X POST http://localhost:8080/budget/update \
  -H "Authorization: Bearer <token>" \
  -F "id=1" \
  -F "amount=600.00" \
  -F "alert_threshold=85"
```

### Delete Budget
`POST /budget/delete` 🔒

```bash
curl -X POST http://localhost:8080/budget/delete \
  -H "Authorization: Bearer <token>" \
  -F "id=1"
```

### Budget Alerts
`GET /budget/alerts` 🔒

Get budgets where spending exceeded the alert threshold.

```bash
curl http://localhost:8080/budget/alerts \
  -H "Authorization: Bearer <token>"
```

---

## Recurring Transactions

### Add Recurring Rule
`POST /recurring/add` 🔒

```bash
curl -X POST http://localhost:8080/recurring/add \
  -H "Authorization: Bearer <token>" \
  -F "category_id=1" \
  -F "amount=100.00" \
  -F "description=Monthly rent" \
  -F "start_date=2024-01-01" \
  -F "recurrence=monthly"
```

**recurrence:** `daily`, `weekly`, `monthly`, or `yearly`

### List Recurring Rules
`GET /recurring/list` 🔒

```bash
curl http://localhost:8080/recurring/list \
  -H "Authorization: Bearer <token>"
```

### Edit Recurring Rule
`POST /recurring/edit` 🔒

```bash
curl -X POST http://localhost:8080/recurring/edit \
  -H "Authorization: Bearer <token>" \
  -F "id=1" \
  -F "amount=120.00" \
  -F "description=Updated rent" \
  -F "start_date=2024-01-01" \
  -F "recurrence=monthly"
```

### Delete Recurring Rule
`POST /recurring/delete` 🔒

```bash
curl -X POST http://localhost:8080/recurring/delete \
  -H "Authorization: Bearer <token>" \
  -F "id=1"
```

---

## Summary & Analytics

### Overall Totals
`GET /summary/totals` 🔒

Total income and expenses across all time.

```bash
curl http://localhost:8080/summary/totals \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "total_expenses": 1250.50,
  "total_income": 3000.00
}
```

### Monthly Totals
`GET /summary/monthly` 🔒

Income and expenses per month.

```bash
curl http://localhost:8080/summary/monthly \
  -H "Authorization: Bearer <token>"
```

### Category Breakdown
`GET /summary/category` 🔒

Spending by category. Optionally filter by date range.

```bash
curl "http://localhost:8080/summary/category?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <token>"
```

### Group by Period
`GET /summary/group` 🔒

Group transactions by day, week, month, or year.

```bash
curl "http://localhost:8080/summary/group?by=month" \
  -H "Authorization: Bearer <token>"
```

**by:** `day`, `week`, `month`, or `year`

### Category Monthly Summary
`GET /summary/category/monthly` 🔒

Category spending for a specific month.

```bash
curl "http://localhost:8080/summary/category/monthly?year=2024&month=1" \
  -H "Authorization: Bearer <token>"
```

---

## Export

### Export Transactions
`GET /export` 🔒

Download transactions as CSV or JSON.

```bash
# CSV
curl "http://localhost:8080/export?format=csv" \
  -H "Authorization: Bearer <token>" \
  -o transactions.csv

# JSON
curl "http://localhost:8080/export?format=json" \
  -H "Authorization: Bearer <token>" \
  -o transactions.json
```

---

## Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Validation error message"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "User not authenticated"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Something went wrong"
}
```

---

## Rate Limits

**Auth endpoints** (`/register`, `/login`): 5 requests/minute per IP
**API endpoints** (everything else): 100 requests/minute per IP

Exceeded? You'll get a `429 Too Many Requests` response.

---

## Notes

- All dates use `YYYY-MM-DD` format
- Amounts are decimal with max 2 decimal places
- Tokens expire after 72 hours (3 days)
- Recurring transactions process every hour via background job
- CORS is enabled for configured origins

🔒 = Requires authentication

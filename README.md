# Mirror.ng — Financial Intelligence Engine

Open-source financial dashboard that parses Nigerian bank email alerts, applies ML-driven analytics, and answers natural language questions about your money.

**Live demo**: [mirror-ng.fly.dev](https://mirror-ng.fly.dev) (requires a Yahoo/Gmail account)

---

## Data Pipeline

```
Email (IMAP/Gmail API)
  → Bank-specific parsers (regex + NLP)
  → SQLite warehouse (transactions, balances, aliases)
  → FastAPI REST layer
  → React dashboard + ML engine + AI agent
```

Six bank parsers handle the variety of Nigerian email alert formats — different date formats, amount positions, balance placements, narration styles. Each is a tailored regex transformation that normalizes unstructured email text into structured transaction records.

## ML & AI Features

### 7-Day Spend Forecast
Linear regression on daily transaction totals. Extrapolates the trend line 7 days forward to predict future spend. Model improves as more transactions sync. (`backend/app/intent_agent.py`)

### Anomaly Detection
Z-score based — flags transactions that deviate more than 2 standard deviations from their category mean. In a 30-day window across ~50 transactions, it surfaced 4 anomalous transactions worth ~₦45,000 that the user otherwise would not have noticed. (`backend/app/intent_agent.py`)

### AI Agent ("Ask Mirror")
Natural language interface to financial data. Powered by Groq LLM and DeepSeek API. Handles queries like:
- "What's my current balance?"
- "How much did I spend on transfers last week?"
- "Who sent me the most money?"
- "What number do I buy airtime for most?"

The agent converts plain English to SQL, executes against the transaction warehouse, and returns results in natural language. (`backend/app/agent.py`, `backend/app/intent_agent.py`)

### Executive View
Aggregated analytics layer: spend breakdown by category, daily credit/debit trends, volume analysis, and data intelligence layer summarizing 50+ transactions per window.

## Data Sources & Ingestion

| Source | Method | Parsers |
|--------|--------|---------|
| Yahoo Mail | IMAP (app password) | Sterling, Wema/ALAT, Kuda, OPay, GTBank, Access |
| Gmail | IMAP or OAuth 2.0 | Same 6 parsers |

Parser architecture is extensible — each implements a shared `BankParser` interface with regex for amount, balance, date, narration, and account number extraction.

## Tech Stack

- **Backend**: Python (FastAPI), SQLite
- **Frontend**: React 18, Vite, Tailwind CSS
- **ML**: scikit-learn (linear regression, z-score)
- **AI**: Groq LLM, DeepSeek API for query understanding
- **Email**: Python `imaplib`, Google Gmail API
- **Auth**: JWT, bcrypt, Google OAuth

## Quick Start

```bash
git clone https://github.com/Tobi-ii/mirror-ng.git
cd mirror-ng
cp backend/.env.example backend/.env
# Edit backend/.env with your email credentials
docker compose up -d
```

Open http://localhost:80

## Project Structure

```
mirror-ng/
├── backend/app/
│   ├── main.py                 # REST API (20+ endpoints)
│   ├── agent.py                # AI agent — NL query → SQL
│   ├── intent_agent.py         # Forecasting + anomaly detection
│   ├── balance_manager.py      # Running balance computation
│   ├── email_fetcher.py        # IMAP ingestion
│   ├── parsers/                # 6 bank-specific parsers
│   │   ├── base.py             # Abstract BankParser
│   │   ├── sterling.py, wema.py, kuda.py, opay.py, gtbank.py, access.py
│   │   └── __init__.py         # Parser registry
│   └── database.py             # SQLite schema & migrations
├── frontend/src/
│   ├── pages/Dashboard.jsx, Settings.jsx
│   ├── services/api.js, localData.js
│   └── components/             # MLGroupView, TransactionRow, etc.
└── docker-compose.yml
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/transactions/{user_id}` | Paginated transactions |
| `GET /api/balances/{user_id}` | Current balances per account |
| `POST /api/transactions/{user_id}/sync` | Trigger email sync |
| `POST /api/ai/chat/{user_id}` | Ask Mirror agent |
| `GET /api/suggestions/aliases/{user_id}` | ML alias recommendations |
| `POST /api/transactions/{user_id}/group` | ML transaction grouping |

Full API at `app/main.py`.

## License

MIT

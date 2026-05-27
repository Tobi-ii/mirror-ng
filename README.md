
# Mirror.ng - Your Financial Mirror

Track all your Nigerian bank accounts in one place. No APIs needed - just your email alerts.

## Features

- **Privacy First** - Only reads bank alert emails, stores nothing else
- **Multi-Bank Support** - Sterling, Wema/ALAT, Kuda, Opay, GTBank, Access
- **Real-time Mirror** - Automatic balance updates from email alerts
- **Open Source** - Fully auditable, self-hostable
- **Manual Adjustments** - Fix balances anytime
- **ML-Powered Suggestions** - Smart transaction categorization and alias recommendations
- **Anchor Accounts** - Pin one account to track your true financial position

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- A Yahoo or Gmail account with app password

### Backend

```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Run the backend:
```bash
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Configuration

Edit `backend/.env` with your email provider settings:

| Variable | Description |
|----------|-------------|
| `EMAIL_PROVIDER` | `yahoo`, `gmail`, or `gmail_oauth` |
| `YAHOO_EMAIL` | Your Yahoo email address |
| `YAHOO_APP_PASSWORD` | Yahoo app password (requires 2FA enabled) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for Gmail OAuth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GROQ_API_KEY` | Groq API key for LLM features |
| `SECRET_KEY` | A random 32+ character string for JWT |

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **ML/AI**: scikit-learn, Groq LLM, DeepSeek API
- **Email**: IMAP (Yahoo/Gmail), Gmail API (OAuth)

## Project Structure

```
mirror-ng/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app & REST endpoints
│   │   ├── database.py      # SQLite schema & initialization
│   │   ├── balance_manager.py  # Balance CRUD operations
│   │   ├── models.py        # Pydantic models
│   │   ├── email_fetcher.py # IMAP email fetching
│   │   ├── gmail_auth.py    # Gmail API OAuth flow
│   │   └── parsers/
│   │       ├── base.py      # BankParser base class
│   │       ├── sterling.py  # Sterling Bank parser
│   │       ├── wema.py      # Wema/ALAT parser
│   │       └── __init__.py  # Parser registry
│   ├── .env.example         # Environment template
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile           # Backend Docker image
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx   # Main dashboard
│   │   │   └── Settings.jsx    # Account & alias settings
│   │   ├── components/
│   │   │   ├── MLGroupView.jsx # ML grouping drill-down
│   │   │   ├── TransactionRow.jsx # Transaction card
│   │   │   └── FloatingNavItem.jsx # Navigation pill
│   │   ├── contexts/
│   │   │   └── BalanceContext.jsx # Balance state management
│   │   ├── hooks/
│   │   │   └── useBlurContext.jsx # Zen blur context
│   │   └── services/
│   │       └── api.js          # API client
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── Dockerfile              # Frontend Docker image
├── docker-compose.yml          # Full-stack Docker Compose
├── .gitignore
└── README.md
```

## Account Tiers (Settings)

| Tier | Badge | Editable? | Description |
|------|-------|-----------|-------------|
| Auto-tracked | Green | Read-only | Has email parser, balance auto-updates |
| Anchor not set | Amber | Balance only | Has transactions but no anchor set |
| Manual | Indigo | Balance + Delete | No email parser, fully manual |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/balances/{user_id}` | All balances with `provides_balance` flag |
| PUT | `/api/balances/{user_id}/{account_id}` | Update balance amount |
| PUT | `/api/balances/{user_id}/{account_id}/anchor` | Set anchor account |
| DELETE | `/api/balances/{user_id}/{account_id}` | Remove manual account |
| GET | `/api/transactions/{user_id}` | All transactions (sorted, latest first) |
| PUT | `/api/transactions/{user_id}/{txn_id}/alias` | Set transaction alias |
| POST | `/api/transactions/{user_id}/group` | ML group transactions |
| GET | `/api/suggestions/aliases/{user_id}` | ML alias suggestions |
| POST | `/api/aliases/clear/{user_id}` | Clear all aliases |
| GET | `/health` | Health check |

## Live URL

The official instance runs at **[mirror.ng](https://mirror.ng)** — no setup required, just visit and connect your email.

## Self-Host

For developers and power users who want full control:

### Option A: Docker (recommended)

```bash
git clone https://github.com/YOUR_USER/mirror-ng.git
cd mirror-ng
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials
nano backend/.env
docker compose up -d
```

Open http://localhost:80

### Option B: Manual (frontend + backend separate)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## License

MIT

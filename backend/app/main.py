"""
Mirror.ng FastAPI Main Application
Supports: Yahoo IMAP, Gmail OAuth2, Gmail App Password
Nigerian Bank Alert Aggregator with ML Insights
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
import logging
import re
import imaplib
import email
import quopri
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import sqlite3
from dotenv import load_dotenv
import email.utils as email_utils
from email.policy import default
from pydantic import BaseModel as PydanticBase
import asyncio

# OAuth imports
from authlib.integrations.starlette_client import OAuth
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
import base64

# Auth
from .auth import create_access_token, get_current_user_id, encrypt_password, decrypt_password

# Core Modules
from .database import get_db, init_db
from .balance_manager import BalanceManager
from .parsers import get_parser_for_sender
from .agent import run_agent
from .intent_agent import run_intent_agent
from .temporal import get_agent_temporal_context

# ML Modules
from .ml.classifier import predict_category, train_classifier
from .ml.anomaly import detect_anomalies
from .ml.forecaster import weekly_spend_forecast
from .ml.merchant import get_top_merchants
from .ml.recurring import detect_recurring

# Models
from .models import (
    SyncRequest,
    InitialBalanceRequest,
    ManualAdjustRequest,
    AgentChatRequest,
    CloudSyncToggle,
    DataExportResponse,
    DataImportRequest,
    OnboardingDatesRequest
)

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── In-memory rate limiter ─────────────────────────────────────────
from collections import defaultdict
import time

_rate_limit_store = defaultdict(list)

def check_rate_limit(ip: str, max_attempts: int = 5, window_seconds: int = 60):
    """Returns True if under limit, False if rate-limited."""
    now = time.time()
    window_start = now - window_seconds
    attempts = _rate_limit_store[ip]
    # Prune old entries
    _rate_limit_store[ip] = [t for t in attempts if t > window_start]
    if len(_rate_limit_store[ip]) >= max_attempts:
        return False
    _rate_limit_store[ip].append(now)
    return True

app = FastAPI(
    title="Mirror.ng API",
    description="Financial mirror for Nigerian bank alerts with ML insights",
    version="2.0.0"
)

# CORS Configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET_KEY"]
)

# OAuth Setup
oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
        'redirect_uri': os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback')
    }
)

# ============ EMAIL FETCHER CLASSES ============

class EmailFetcher:
    """Unified email fetcher for Yahoo IMAP, Gmail IMAP, and Gmail API"""

    def __init__(self, email_address: str, password: str = None, provider: str = 'yahoo',
                 access_token: str = None, refresh_token: str = None):
        self.email_address = email_address
        self.password = password
        self.provider = provider
        self.access_token = access_token
        self.refresh_token = refresh_token

    def connect_imap(self):
        """Connect via IMAP (Yahoo or Gmail with app password)"""
        if self.provider == 'yahoo':
            server = "imap.mail.yahoo.com"
            port = 993
        else:
            server = "imap.gmail.com"
            port = 993

        try:
            import socket
            socket.setdefaulttimeout(60)
            mail = imaplib.IMAP4_SSL(server, port)
            mail.login(self.email_address, self.password)
            mail.select("INBOX")
            logger.info(f"✅ Connected to {self.provider.upper()} IMAP: {self.email_address}")
            return mail
        except TimeoutError:
            raise ValueError(f"{self.provider.upper()} IMAP timed out.")
        except imaplib.IMAP4.error as e:
            raise ValueError(f"Invalid {self.provider.upper()} credentials.")
        except Exception as e:
            raise

    def fetch_via_imap(self, sender_patterns: List[str], limit: int = 100,
                       since_date: Optional[str] = None,
                       until_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch bank alert emails via IMAP.
        Searches per sender pattern so only bank emails are fetched —
        never pulls the full inbox. No date-range limit cutoff.
        """
        mail = self.connect_imap()
        try:
            # Build date range strings once
            since_imap = None
            until_imap = None
            if since_date:
                since_imap = datetime.strptime(since_date, "%Y-%m-%d").strftime("%d-%b-%Y")
            if until_date:
                d_until = datetime.strptime(until_date, "%Y-%m-%d") + timedelta(days=1)
                until_imap = d_until.strftime("%d-%b-%Y")

            # Search per sender — ask Yahoo/Gmail for only bank emails
            all_message_ids = []
            seen = set()

            for pattern in sender_patterns:
                # Strip leading @ for FROM search (Yahoo needs bare domain or full address)
                search_pattern = pattern.lstrip("@")
                criteria_parts = [f'FROM "{search_pattern}"']
                if since_imap:
                    criteria_parts.append(f'SINCE {since_imap}')
                if until_imap:
                    criteria_parts.append(f'BEFORE {until_imap}')
                criteria = " ".join(criteria_parts)

                try:
                    status, messages = mail.search(None, criteria)
                    if status == "OK" and messages[0]:
                        for mid in messages[0].split():
                            if mid not in seen:
                                seen.add(mid)
                                all_message_ids.append(mid)
                except Exception as e:
                    logger.debug(f"Search failed for pattern '{pattern}': {e}")
                    continue

            logger.info(f"📬 Found {len(all_message_ids)} bank alert emails across all senders")

            if not all_message_ids:
                return []

            bank_emails = []
            for msg_id in reversed(all_message_ids):
                try:
                    status, msg_data = mail.fetch(msg_id, "(RFC822)")
                    if status != "OK":
                        continue
                    msg = email.message_from_bytes(msg_data[0][1], policy=default)
                    bank_emails.append({
                        "subject": msg.get("Subject", ""),
                        "from": msg.get("From", ""),
                        "raw": self._get_email_body(msg),
                        "date": msg.get("Date", ""),
                        "message_id": msg.get("Message-ID", "")
                    })
                except Exception as e:
                    logger.debug(f"Skipping email {msg_id}: {e}")
                    continue

            logger.info(f"📥 Fetched {len(bank_emails)} bank alert emails")
            return bank_emails

        finally:
            try:
                mail.logout()
            except Exception:
                pass

    def fetch_via_gmail_api(self, sender_patterns: List[str], limit: int = 100,
                            since_date: Optional[str] = None,
                            until_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch emails via Gmail API using OAuth"""
        try:
            creds = Credentials(
                token=self.access_token,
                refresh_token=self.refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=os.getenv('GOOGLE_CLIENT_ID'),
                client_secret=os.getenv('GOOGLE_CLIENT_SECRET')
            )

            if creds.expired:
                creds.refresh(GoogleRequest())

            service = build('gmail', 'v1', credentials=creds)

            bank_queries = []
            for pattern in sender_patterns:
                if pattern.startswith('no-reply@') or pattern.startswith('e-business@'):
                    bank_queries.append(f'from:({pattern})')
                else:
                    bank_queries.append(f'from:({pattern})')
            bank_domains = ' OR '.join(bank_queries)
            query = f'({bank_domains})'

            if since_date:
                query += f' after:{since_date.replace("-", "/")}'

            results = service.users().messages().list(
                userId='me',
                q=query,
                maxResults=limit
            ).execute()

            bank_emails = []
            for msg in results.get('messages', []):
                msg_data = service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='full'
                ).execute()

                headers = {h['name'].lower(): h['value'] for h in msg_data['payload'].get('headers', [])}
                body = self._extract_gmail_body(msg_data['payload'])

                bank_emails.append({
                    "subject": headers.get('subject', ''),
                    "from": headers.get('from', ''),
                    "raw": body,
                    "date": headers.get('date', ''),
                    "message_id": msg['id']
                })

            logger.info(f"📥 Gmail API: Found {len(bank_emails)} bank alert emails")
            return bank_emails

        except Exception as e:
            logger.error(f"Gmail API error: {e}", exc_info=True)
            raise ValueError(f"Gmail API error: {e}")

    def fetch_alerts(self, sender_patterns: List[str], limit: int = 100,
                     since_date: Optional[str] = None,
                     until_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch alerts using the appropriate method"""
        if self.provider == 'gmail_oauth' and self.access_token:
            return self.fetch_via_gmail_api(sender_patterns, limit, since_date, until_date)
        else:
            return self.fetch_via_imap(sender_patterns, limit, since_date, until_date)

    def _get_email_body(self, msg) -> str:
        """Extract body from IMAP email"""
        try:
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        return self._decode_and_clean(part)
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        return self._decode_and_clean(part, is_html=True)
            else:
                return self._decode_and_clean(msg, msg.get_content_type() == "text/html")
        except Exception as e:
            logger.warning(f"Failed to extract email body: {e}")
        return ""

    def _extract_gmail_body(self, payload: dict) -> str:
        """Extract body from Gmail API payload"""
        if 'parts' in payload:
            for part in payload['parts']:
                body = self._extract_gmail_body(part)
                if body:
                    return body
            return ""

        if payload.get('mimeType') == 'text/plain':
            data = payload.get('body', {}).get('data', '')
            if data:
                return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        return ""

    def _decode_and_clean(self, part, is_html: bool = False) -> str:
        try:
            payload = part.get_payload(decode=True)
            if not payload:
                payload = part.get_payload()
                if isinstance(payload, list):
                    payload = payload[0] if payload else ""
            charset = part.get_content_charset() or 'utf-8'
            text = payload.decode(charset, errors='ignore') if isinstance(payload, bytes) else str(payload)
            if '=3D' in text or '=20' in text:
                try:
                    text = quopri.decodestring(text.encode('utf-8')).decode('utf-8', errors='ignore')
                except Exception:
                    pass
            if is_html:
                text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
                text = re.sub(r'<[^>]+>', ' ', text)
                html_entities = {'&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"}
                for entity, char in html_entities.items():
                    text = text.replace(entity, char)
            return re.sub(r'\s+', ' ', text).strip()
        except Exception:
            return ""


# ============ TIMEOUT MIDDLEWARE ============

class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=300.0)
        except asyncio.TimeoutError:
            return JSONResponse(
                {"detail": "Request timed out — Please try again"},
                status_code=504
            )

app.add_middleware(TimeoutMiddleware)


# ============ SECURITY HEADERS MIDDLEWARE ============

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ============ APP EVENTS ============

@app.on_event("startup")
async def startup_event():
    # Validate required secrets
    required_secrets = ["SECRET_KEY", "SESSION_SECRET_KEY"]
    for s in required_secrets:
        val = os.getenv(s, "")
        if val.strip() in ("", "change-this-in-production"):
            raise RuntimeError(f"{s} is not set or is using an insecure default. Generate a random value with: python -c \"import secrets; print(secrets.token_hex(32))\"")

    init_db()
    logger.info("✓ Database initialized")
    try:
        train_classifier()
        logger.info("✓ ML Classifier trained and ready")
    except Exception as e:
        logger.error(f"⚠️ ML training failed on startup: {e}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ============ AUTHENTICATION ROUTES ============

@app.get("/api/auth/google/login")
async def google_login(request: Request):
    redirect_uri = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback')
    state = os.urandom(32).hex()
    request.session['oauth_state'] = state
    return await oauth.google.authorize_redirect(request, redirect_uri, state=state)

@app.get("/api/auth/google/callback")
async def google_auth_callback(request: Request):
    try:
        # Verify OAuth state to prevent CSRF
        expected_state = request.session.pop('oauth_state', None)
        actual_state = request.query_params.get('state')
        if not expected_state or not actual_state or expected_state != actual_state:
            logger.error("OAuth state mismatch — possible CSRF attack")
            return JSONResponse({"success": False, "error": "Authentication failed"}, status_code=400)

        token = await oauth.google.authorize_access_token(request)
        # Try token first (openid scope includes it), fall back to API call
        userinfo = token.get('userinfo')
        if not userinfo:
            resp = await oauth.google.get(
                'https://www.googleapis.com/oauth2/v1/userinfo', token=token
            )
            userinfo = resp if isinstance(resp, dict) else await resp.json()

        email_addr = userinfo.get('email')
        name = userinfo.get('name')

        if not email_addr:
            raise ValueError("No email received from Google")

        conn = get_db()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                auth_provider TEXT DEFAULT 'yahoo',
                access_token TEXT,
                refresh_token TEXT,
                email_password_enc TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

        cursor = conn.execute('SELECT * FROM users WHERE email = ?', (email_addr,))
        user = cursor.fetchone()

        if not user:
            cursor = conn.execute('''
                INSERT INTO users (email, name, auth_provider, access_token, refresh_token)
                VALUES (?, ?, ?, ?, ?) RETURNING id
            ''', (email_addr, name, 'gmail_oauth', token.get('access_token'), token.get('refresh_token')))
            user_id = cursor.fetchone()['id']
        else:
            user_id = user['id']
            conn.execute('''
                UPDATE users SET access_token = ?, refresh_token = ?, auth_provider = ? WHERE id = ?
            ''', (token.get('access_token'), token.get('refresh_token'), 'gmail_oauth', user_id))

        conn.commit()
        conn.close()

        session_token = create_access_token({"user_id": str(user_id), "email": email_addr})
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}/auth/callback#token={session_token}&email={email_addr}&userId={user_id}")

    except Exception:
        logger.error(f"Google auth error")
        return JSONResponse({"success": False, "error": "Authentication failed"}, status_code=400)


@app.post("/api/auth/email-login")
async def email_login(request: Request):
    # Rate limit: 5 attempts per 60s per IP
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        logger.warning(f"Rate limit hit for {client_ip}")
        return JSONResponse({
            "success": False,
            "error": "Too many login attempts. Try again later."
        }, status_code=429)

    data = await request.json()
    email_addr = data.get('email')
    password = data.get('password')
    provider = data.get('provider', 'yahoo')

    if provider == 'gmail_app':
        provider = 'gmail'

    try:
        server = "imap.mail.yahoo.com" if provider == 'yahoo' else "imap.gmail.com"
        import socket
        socket.setdefaulttimeout(15)
        mail = imaplib.IMAP4_SSL(server, 993)
        mail.login(email_addr, password)
        mail.logout()

        conn = get_db()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                auth_provider TEXT DEFAULT 'yahoo',
                access_token TEXT,
                refresh_token TEXT,
                email_password_enc TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

        try:
            conn.execute('ALTER TABLE users ADD COLUMN email_password_enc TEXT')
            conn.commit()
        except Exception:
            pass

        cursor = conn.execute('SELECT * FROM users WHERE email = ?', (email_addr,))
        user = cursor.fetchone()

        if not user:
            cursor = conn.execute('''
                INSERT INTO users (email, name, auth_provider, email_password_enc)
                VALUES (?, ?, ?, ?) RETURNING id
            ''', (email_addr, email_addr.split('@')[0] if '@' in email_addr else email_addr, provider, encrypt_password(password)))
            user_id = cursor.fetchone()['id']
        else:
            user_id = user['id']
            conn.execute('UPDATE users SET email_password_enc = ? WHERE id = ?',
                         (encrypt_password(password), user_id))

        conn.commit()
        conn.close()

        token = create_access_token({"user_id": str(user_id), "email": email_addr})
        return JSONResponse({
            "success": True,
            "user": {"user_id": user_id, "email": email_addr, "provider": provider},
            "access_token": token
        })

    except Exception:
        logger.error(f"Email login failed for {email_addr}")
        return JSONResponse({
            "success": False,
            "error": "Login failed. Check your credentials and try again."
        }, status_code=401)


# ============ TRANSACTION ROUTES ============

@app.get("/api/transactions/{user_id}")
async def get_transactions(user_id: str, req: Request, limit: int = 50, offset: int = 0, bank: Optional[str] = None):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        if bank:
            cursor = conn.execute('''
                SELECT * FROM transactions WHERE user_id = ? AND bank = ?
                ORDER BY timestamp DESC LIMIT ? OFFSET ?
            ''', (user_id, bank, limit, offset))
        else:
            cursor = conn.execute('''
                SELECT * FROM transactions WHERE user_id = ?
                ORDER BY timestamp DESC LIMIT ? OFFSET ?
            ''', (user_id, limit, offset))
        transactions = [dict(row) for row in cursor.fetchall()]
        return JSONResponse({
            "success": True,
            "transactions": transactions,
            "count": len(transactions),
            "has_more": len(transactions) == limit
        })
    except Exception as e:
        logger.error(f"Error fetching transactions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch transactions")
    finally:
        conn.close()


@app.post("/api/sync")
async def sync_transactions(request: SyncRequest, req: Request):
    # Verify JWT — use token user_id, not request body
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != request.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    conn = get_db()
    try:
        cursor = conn.execute('''
            SELECT email, auth_provider, access_token, refresh_token, email_password_enc
            FROM users WHERE id = ?
        ''', (request.user_id,))
        user = cursor.fetchone()

        if not user:
            raise HTTPException(status_code=400, detail="User not found.")

        email_addr = user['email']
        provider = user['auth_provider'] or 'yahoo'

        if not email_addr:
            raise HTTPException(status_code=400, detail="Email not found. Please login again.")

        # Check cloud sync preference
        pref_cursor = conn.execute('SELECT cloud_sync FROM user_prefs WHERE user_id = ?', (request.user_id,))
        pref_row = pref_cursor.fetchone()
        cloud_sync = bool(pref_row['cloud_sync']) if pref_row else True

        # OAuth users use Gmail API — no password needed
        if provider == 'gmail_oauth':
            if not user['access_token']:
                raise HTTPException(status_code=400, detail="Google OAuth session expired. Please login again.")
            fetcher = EmailFetcher(
                email_address=email_addr,
                password=None,
                provider=provider,
                access_token=user['access_token'],
                refresh_token=user['refresh_token']
            )
        else:
            # Email-based user — decrypt stored password
            enc_pw = user['email_password_enc']
            if not enc_pw:
                raise HTTPException(status_code=400, detail="Password not stored. Please login again.")
            try:
                password = decrypt_password(enc_pw)
            except Exception:
                raise HTTPException(status_code=400, detail="Failed to decrypt stored password. Please login again.")
            fetcher = EmailFetcher(
                email_address=email_addr,
                password=password,
                provider=provider,
                access_token=None,
                refresh_token=None
            )

        sender_patterns = [
            "e-business@sterling.ng",       # Sterling transaction alerts
            "no-reply@alat.ng",             # ALAT (Wema) alerts
            "no-reply@11054915.brevosend.com", # Wema via Brevosend
            "no-reply@opay-nigeria.com",    # OPay alerts
            "gtbank.com",
            "accessbankplc.com",
            "firstbanknigeria.com",
            "kuda.com",
            "moniepoint.com",
            "palmspay.com",
            "StanbicIBTC-E-Alert@stanbicibtc.com",   # Stanbic IBTC
            "alerts.nigeria@sc.com",                 # Standard Chartered
            "no-reply@moniepoint.com",               # Moniepoint
            "GeNS@gtbank.com",                       # GTBank
        ]

        email_alerts = fetcher.fetch_alerts(
            sender_patterns=sender_patterns,
            since_date=request.since_date,
            until_date=request.until_date
        )

        logger.info(f"Total emails fetched: {len(email_alerts)}")

        # Sort oldest first so balance progression is correct
        def safe_parse_date(x):
            try:
                return email_utils.parsedate_to_datetime(x.get('date', ''))
            except Exception:
                return datetime.min

        email_alerts.sort(key=safe_parse_date)

        balance_manager = BalanceManager(conn)
        new_transactions = []

        # Updated keywords to include OPay "Transfer Successful"
        TRANSACTION_KEYWORDS = [
            "money out", "money in", "debit alert", "credit alert",
            "transaction", "ngn", "credited", "debited", "debit", "credit",
            "transfer successful",   # OPay
            "transfer",              # catches OPay + others
        ]
        
        # Blocklist for promo/OTP emails
        BLOCKED_SUBJECTS = [
            "verification code", "otp", "home hacks", "newsletter",
            "you logged in", "login", "logged into", "promo", "offer",
            "update", "welcome", "verify your"
        ]

        for alert in email_alerts:
            subject = alert.get("subject", "").lower()
            
            # Skip blocked subjects first (OTP, promos, etc.)
            if any(b in subject for b in BLOCKED_SUBJECTS):
                continue
                
            # Then check if it's a transaction email
            if not any(kw in subject for kw in TRANSACTION_KEYWORDS):
                continue
                
            try:
                parser = get_parser_for_sender(alert["from"])
                if not parser:
                    continue
                    
                parsed_tx = parser.parse(alert.get("subject", ""), alert["raw"])
                if not parsed_tx:
                    continue

                normalized_last4 = str(parsed_tx.account_last4)[-4:] if parsed_tx.account_last4 else None

                parsed_tx.category = predict_category(parsed_tx.narration)
                new_transactions.append(parsed_tx)
                logger.info(f"Parsed: {parsed_tx.bank} - {parsed_tx.tx_type}")
            except Exception as e:
                logger.debug(f"Error processing alert: {e}")

        # Only store in DB if cloud sync is ON
        if cloud_sync:
            stored = 0
            for parsed_tx in new_transactions:
                normalized_last4 = str(parsed_tx.account_last4)[-4:] if parsed_tx.account_last4 else None
                cursor = conn.execute('''
                    SELECT id FROM transactions
                    WHERE user_id = ? AND bank = ? AND amount = ? AND timestamp = ?
                ''', (request.user_id, parsed_tx.bank, parsed_tx.amount,
                      parsed_tx.timestamp.isoformat() if parsed_tx.timestamp else ""))
                if cursor.fetchone():
                    continue

                try:
                    cursor = conn.execute('''
                        INSERT INTO transactions
                        (user_id, bank, tx_type, amount, narration, account_last4, timestamp, category, balance_after)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        RETURNING id
                    ''', (
                        request.user_id, parsed_tx.bank, parsed_tx.tx_type,
                        parsed_tx.amount, parsed_tx.narration, normalized_last4,
                        parsed_tx.timestamp.isoformat() if parsed_tx.timestamp else None,
                        parsed_tx.category, parsed_tx.balance
                    ))
                    tx_id = cursor.fetchone()['id']
                    new_balance = balance_manager.update_balance_from_transaction(request.user_id, parsed_tx)
                    if new_balance is not None:
                        conn.execute('UPDATE transactions SET balance_after = ? WHERE id = ?', (new_balance, tx_id))
                    stored += 1
                except Exception as e:
                    logger.debug(f"Error storing: {e}")

            conn.commit()
            logger.info(f"Cloud sync: stored {stored} new transactions")
        else:
            logger.info(f"Local sync: returning {len(new_transactions)} parsed transactions (no DB storage)")
            # Detect gaps from in-memory transactions
            tx_accounts = [{"bank": tx.bank, "account_last4": tx.account_last4} for tx in new_transactions]
            gaps, total_accounts = detect_onboarding_gaps(tx_accounts, set(), request.user_id)

        return JSONResponse({
            "success": True,
            "new_transactions": [tx.to_dict() for tx in new_transactions],
            "total_synced": len(new_transactions),
            "cloud_sync": cloud_sync,
            "gaps": gaps if not cloud_sync else None,
            "total_accounts": total_accounts if not cloud_sync else None,
        })
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Sync failed. Please try again.")
    finally:
        conn.close()


# ============ AGENT / CHAT ROUTES ============

def _make_local_db(transactions, user_id=None):
    """Create an in-memory SQLite DB from local transactions for agent queries."""
    mem = sqlite3.connect(':memory:')
    mem.row_factory = sqlite3.Row
    mem.execute('''
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT, bank TEXT, tx_type TEXT, amount REAL,
            balance_after REAL, narration TEXT, account_last4 TEXT,
            timestamp TEXT, category TEXT
        )
    ''')
    mem.execute('''
        CREATE TABLE account_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL, bank TEXT NOT NULL,
            account_last4 TEXT NOT NULL, balance REAL NOT NULL,
            last_updated TEXT NOT NULL
        )
    ''')
    for tx in transactions:
        d = tx if isinstance(tx, dict) else (tx.model_dump() if hasattr(tx, 'model_dump') else {})
        tx_user_id = user_id or d.get('user_id')
        mem.execute('''
            INSERT INTO transactions (user_id, bank, tx_type, amount, balance_after, narration, account_last4, timestamp, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            tx_user_id, d.get('bank'), d.get('tx_type'), d.get('amount'),
            d.get('balance'), d.get('narration'), d.get('account_last4'),
            d.get('timestamp'), d.get('category', 'other')
        ))
    mem.commit()
    return mem


@app.post("/api/agent/chat")
async def agent_chat(request: AgentChatRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != request.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    is_local = bool(request.local_transactions)
    
    if is_local:
        mem_db = _make_local_db(request.local_transactions, request.user_id)
        try:
            temporal_context = get_agent_temporal_context(
                user_id=request.user_id,
                payload_since=request.since_date,
                payload_until=request.until_date,
                db_conn=mem_db
            )
            result = run_agent(
                user_id=request.user_id,
                message=request.message,
                history=request.history,
                db_conn=mem_db,
                since_date=request.since_date,
                until_date=request.until_date,
                temporal_context=temporal_context
            )
            return JSONResponse({"success": True, **result})
        finally:
            mem_db.close()
    else:
        conn = get_db()
        try:
            temporal_context = get_agent_temporal_context(
                user_id=request.user_id,
                payload_since=request.since_date,
                payload_until=request.until_date,
                db_conn=conn
            )
            result = run_agent(
                user_id=request.user_id,
                message=request.message,
                history=request.history,
                db_conn=conn,
                since_date=request.since_date,
                until_date=request.until_date,
                temporal_context=temporal_context
            )
            return JSONResponse({"success": True, **result})
        except Exception as e:
            logger.error(f"Agent error: {e}")
            raise HTTPException(status_code=500, detail="Agent failed")
        finally:
            conn.close()


@app.post("/api/agent/chat-v2")
async def agent_chat_v2(request: AgentChatRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != request.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    is_local = bool(request.local_transactions)
    
    if is_local:
        mem_db = _make_local_db(request.local_transactions, request.user_id)
        try:
            temporal_context = get_agent_temporal_context(
                user_id=request.user_id,
                payload_since=request.since_date,
                payload_until=request.until_date,
                db_conn=mem_db
            )
            result = run_intent_agent(
                user_id=request.user_id,
                message=request.message,
                history=request.history,
                db_conn=mem_db,
                since_date=request.since_date,
                until_date=request.until_date,
                temporal_context=temporal_context
            )
            return JSONResponse({"success": True, **result})
        finally:
            mem_db.close()
    else:
        conn = get_db()
        try:
            temporal_context = get_agent_temporal_context(
                user_id=request.user_id,
                payload_since=request.since_date,
                payload_until=request.until_date,
                db_conn=conn
            )
            result = run_intent_agent(
                user_id=request.user_id,
                message=request.message,
                history=request.history,
                db_conn=conn,
                since_date=request.since_date,
                until_date=request.until_date,
                temporal_context=temporal_context
            )
            return JSONResponse({"success": True, **result})
        except Exception as e:
            logger.error(f"Intent agent error: {e}")
            raise HTTPException(status_code=500, detail="Agent failed")
        finally:
            conn.close()


# ============ INSIGHTS & ANALYTICS ============

@app.get("/api/insights/{user_id}")
async def get_insights(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp ASC', (user_id,))
        transactions = [dict(row) for row in cursor.fetchall()]
        if not transactions:
            return {"success": True, "anomalies": [], "forecast": [], "merchants": [], "recurring": [], "message": "Insufficient data"}
        anomalies = [t for t in detect_anomalies(transactions) if t.get('is_anomaly')]
        forecast_data = weekly_spend_forecast(transactions)
        merchants = get_top_merchants(transactions)
        recurring = detect_recurring(transactions)
        return JSONResponse({
            'success': True,
            'anomalies': anomalies,
            'forecast': forecast_data,
            'merchants': merchants,
            'recurring': recurring,
            'stats': {
                'total_anomalies': len(anomalies),
                'total_analyzed': len(transactions),
                'total_merchants': len(merchants),
                'total_recurring': len(recurring),
            }
        })
    finally:
        conn.close()


@app.get("/api/insights/merchants/{user_id}")
async def get_merchant_insights(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp ASC', (user_id,))
        transactions = [dict(row) for row in cursor.fetchall()]
        merchants = get_top_merchants(transactions, min_count=1, limit=50)
        return {"success": True, "merchants": merchants, "total": len(merchants)}
    finally:
        conn.close()


@app.get("/api/insights/recurring/{user_id}")
async def get_recurring_payments(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp ASC', (user_id,))
        transactions = [dict(row) for row in cursor.fetchall()]
        recurring = detect_recurring(transactions)
        return {"success": True, "recurring": recurring, "total": len(recurring)}
    finally:
        conn.close()


# ============ BALANCES & ONBOARDING ============

@app.get("/api/balances/{user_id}")
async def get_balances(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        balances = balance_manager.get_all_current_balances(user_id)

        from .parsers import PARSER_CLASSES
        BANK_PROVIDES_BALANCE = {}
        for ParserClass in PARSER_CLASSES:
            parser = ParserClass()
            provides = getattr(parser, 'PROVIDES_BALANCE', False)
            BANK_PROVIDES_BALANCE[parser.BANK_NAME] = provides

        for b in balances:
            b['is_anchor'] = bool(b.get('is_anchor', False))
            b['provides_balance'] = BANK_PROVIDES_BALANCE.get(b['bank'], False)
            b['balance'] = b.get('balance', 0) or 0

        return {"success": True, "balances": balances}
    finally:
        conn.close()

@app.post("/api/set-initial-balances")
async def set_initial_balances(request: InitialBalanceRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != request.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        for account in request.balances:
            norm_last4 = str(account['account_last4'])[-4:]
            balance_manager.set_initial_balance(
                user_id=request.user_id,
                bank=account['bank'],
                account_last4=norm_last4,
                balance=account['balance']
            )
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@app.post("/api/manual-adjust-balance")
async def manual_adjust_balance(request: ManualAdjustRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != request.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        norm_last4 = str(request.account_last4)[-4:]
        balance_manager.set_initial_balance(
            user_id=request.user_id,
            bank=request.bank,
            account_last4=norm_last4,
            balance=request.new_balance
        )
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


# ============ DELETE BALANCE ============

class DeleteBalanceRequest(PydanticBase):
    bank: str
    account_last4: str

@app.delete("/api/balances/{user_id}")
async def delete_balance(user_id: str, request: DeleteBalanceRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        conn.execute(
            'DELETE FROM account_balances WHERE user_id = ? AND bank = ? AND account_last4 = ?',
            (user_id, request.bank, request.account_last4)
        )
        conn.commit()
        return JSONResponse({"success": True})
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete balance")
    finally:
        conn.close()


# ============ ALIAS ENDPOINTS ============

@app.get("/api/aliases/{user_id}")
async def get_aliases(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute(
            'SELECT * FROM user_aliases WHERE user_id = ? ORDER BY created_at DESC',
            (user_id,)
        )
        return JSONResponse({"success": True, "aliases": [dict(row) for row in cursor.fetchall()]})
    finally:
        conn.close()

@app.post("/api/aliases/{user_id}")
async def save_alias(user_id: str, payload: dict, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        conn.execute('''
            INSERT OR REPLACE INTO user_aliases
            (user_id, recipient_pattern, display_name, category)
            VALUES (?, ?, ?, ?)
        ''', (
            user_id,
            payload['recipient_pattern'],
            payload['display_name'],
            payload.get('category', 'General')
        ))
        conn.commit()
        return JSONResponse({"success": True})
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to save alias")
    finally:
        conn.close()

@app.delete("/api/aliases/{user_id}/{alias_id}")
async def delete_alias(user_id: str, alias_id: int, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        conn.execute(
            'DELETE FROM user_aliases WHERE id = ? AND user_id = ?',
            (alias_id, user_id)
        )
        conn.commit()
        return JSONResponse({"success": True})
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete alias")
    finally:
        conn.close()


# ============ ONBOARDING GAPS ENDPOINTS ============

def detect_onboarding_gaps(tx_accounts, anchored_accounts, user_id=None):
    """Detect which accounts need configuration (account number or anchor balance).
    
    Args:
        tx_accounts: List of dicts with 'bank' and 'account_last4' keys
        anchored_accounts: Set of (bank, account_last4) tuples that already have anchors
        user_id: Optional user_id for DB query fallback
    
    Returns:
        (gaps_list, total_accounts_count)
    """
    from .parsers import PARSER_CLASSES
    provides_balance_map = {}
    for ParserClass in PARSER_CLASSES:
        p = ParserClass()
        provides_balance_map[p.BANK_NAME] = getattr(p, 'PROVIDES_BALANCE', False)

    gaps = []
    seen = set()

    for acct in tx_accounts:
        bank  = acct['bank']
        last4 = acct['account_last4']
        key   = (bank, last4)

        if key in seen:
            continue
        seen.add(key)

        provides_bal = provides_balance_map.get(bank, False)

        needs_account_number = not last4
        needs_anchor = (not provides_bal) and (key not in anchored_accounts)

        if needs_account_number or needs_anchor:
            gaps.append({
                "bank":                 bank,
                "account_last4":        last4,
                "needs_account_number": needs_account_number,
                "needs_anchor":         needs_anchor,
                "provides_balance":     provides_bal,
            })

    return gaps, len(seen)

@app.get("/api/onboarding-gaps/{user_id}")
async def get_onboarding_gaps(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute('''
            SELECT DISTINCT bank, account_last4
            FROM transactions
            WHERE user_id = ?
        ''', (user_id,))
        tx_accounts = [dict(r) for r in cursor.fetchall()]

        cursor = conn.execute('''
            SELECT DISTINCT bank, account_last4
            FROM account_balances
            WHERE user_id = ? AND is_anchor = 1
        ''', (user_id,))
        anchored = {(r['bank'], r['account_last4']) for r in cursor.fetchall()}

        gaps, total = detect_onboarding_gaps(tx_accounts, anchored, user_id)
        return JSONResponse({"success": True, "gaps": gaps, "total_accounts": total})
    except Exception as e:
        logger.error(f"Error getting onboarding gaps: {e}")
        raise HTTPException(status_code=500, detail="Failed to get onboarding gaps")
    finally:
        conn.close()


@app.post("/api/onboarding-gaps/{user_id}/resolve")
async def resolve_onboarding_gaps(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        data = await req.json()
        resolutions = data.get("resolutions", [])

        for item in resolutions:
            bank       = item.get("bank")
            old_last4  = item.get("old_last4")
            new_last4  = str(item.get("new_last4", ""))[-4:] if item.get("new_last4") else old_last4
            anchor_bal = item.get("anchor_balance")

            # Update transactions where last4 was missing
            if not old_last4 and new_last4:
                conn.execute('''
                    UPDATE transactions
                    SET account_last4 = ?
                    WHERE user_id = ? AND bank = ?
                    AND (account_last4 IS NULL OR account_last4 = '')
                ''', (new_last4, user_id, bank))

            # Only set anchor if one was provided
            if anchor_bal is not None:
                balance_manager.set_initial_balance(
                    user_id=user_id,
                    bank=bank,
                    account_last4=new_last4 or old_last4,
                    balance=float(anchor_bal)
                )

        conn.commit()
        return JSONResponse({"success": True})
    except Exception as e:
        logger.error(f"Gap resolution error: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to resolve onboarding gaps")
    finally:
        conn.close()


# ============ CLOUD SYNC / DATA MIGRATION ENDPOINTS ============

@app.get("/api/cloud-sync/{user_id}")
async def get_cloud_sync(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute('SELECT cloud_sync FROM user_prefs WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()
        return {"success": True, "cloud_sync": bool(row['cloud_sync']) if row else True}
    except Exception:
        return {"success": True, "cloud_sync": True}
    finally:
        conn.close()


@app.post("/api/cloud-sync/{user_id}")
async def set_cloud_sync(user_id: str, request: CloudSyncToggle, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        conn.execute('''
            INSERT INTO user_prefs (user_id, cloud_sync, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET cloud_sync = ?, updated_at = datetime('now')
        ''', (user_id, int(request.cloud_sync), int(request.cloud_sync)))
        conn.commit()

        # If turning sync OFF, delete user data from server
        if not request.cloud_sync:
            conn.execute('DELETE FROM transactions WHERE user_id = ?', (user_id,))
            conn.execute('DELETE FROM account_balances WHERE user_id = ?', (user_id,))
            conn.execute('DELETE FROM user_aliases WHERE user_id = ?', (user_id,))
            conn.commit()

        return {"success": True, "cloud_sync": request.cloud_sync}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to update cloud sync preference")
    finally:
        conn.close()


# ============ ONBOARDING AUDIT DATES ENDPOINTS ============

@app.get("/api/user/onboarding-dates/{user_id}")
async def get_onboarding_dates(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        cursor = conn.execute(
            'SELECT onboarding_start_date, onboarding_end_date FROM users WHERE user_id = ?',
            (user_id,)
        )
        row = cursor.fetchone()
        return {
            "success": True,
            "start_date": row['onboarding_start_date'] if row else None,
            "end_date": row['onboarding_end_date'] if row else None,
            "has_onboarding": bool(row and row['onboarding_start_date'] and row['onboarding_end_date'])
        }
    except Exception as e:
        logger.error(f"Error getting onboarding dates: {e}")
        return {"success": True, "start_date": None, "end_date": None, "has_onboarding": False}
    finally:
        conn.close()


@app.post("/api/user/onboarding-dates/{user_id}")
async def set_onboarding_dates(user_id: str, request: OnboardingDatesRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        conn.execute(
            'UPDATE users SET onboarding_start_date = ?, onboarding_end_date = ? WHERE user_id = ?',
            (request.start_date, request.end_date, user_id)
        )
        conn.commit()
        return {"success": True, "start_date": request.start_date, "end_date": request.end_date}
    except Exception as e:
        conn.rollback()
        logger.error(f"Error setting onboarding dates: {e}")
        raise HTTPException(status_code=500, detail="Failed to set onboarding dates")
    finally:
        conn.close()


@app.get("/api/data/export/{user_id}")
async def export_user_data(user_id: str, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        tx_cursor = conn.execute(
            'SELECT bank, tx_type, amount, balance_after, narration, account_last4, timestamp, category '
            'FROM transactions WHERE user_id = ? ORDER BY timestamp', (user_id,)
        )
        transactions = [dict(r) for r in tx_cursor.fetchall()]

        bal_cursor = conn.execute(
            'SELECT bank, account_last4, balance, last_updated, is_anchor '
            'FROM account_balances WHERE user_id = ? AND (user_id, bank, account_last4, last_updated) IN '
            '(SELECT user_id, bank, account_last4, MAX(last_updated) FROM account_balances WHERE user_id = ? GROUP BY user_id, bank, account_last4)',
            (user_id, user_id)
        )
        balances = [dict(r) for r in bal_cursor.fetchall()]

        alias_cursor = conn.execute(
            'SELECT recipient_pattern, display_name, category FROM user_aliases WHERE user_id = ?', (user_id,)
        )
        aliases = [dict(r) for r in alias_cursor.fetchall()]

        return {
            "success": True,
            "transactions": transactions,
            "balances": balances,
            "aliases": aliases
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to export data")
    finally:
        conn.close()


@app.post("/api/data/import/{user_id}")
async def import_user_data(user_id: str, request: DataImportRequest, req: Request):
    token_user_id = await get_current_user_id(req)
    if not token_user_id or token_user_id != user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        # Import transactions
        for tx in request.transactions:
            conn.execute(
                'INSERT INTO transactions (user_id, bank, tx_type, amount, balance_after, narration, account_last4, timestamp, category) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    user_id, tx.get('bank'), tx.get('tx_type'), tx.get('amount'),
                    tx.get('balance_after'), tx.get('narration'), tx.get('account_last4'),
                    tx.get('timestamp'), tx.get('category', 'other')
                )
            )

        # Import balances
        for bal in request.balances:
            balance_manager.set_initial_balance(
                user_id=user_id,
                bank=bal.get('bank'),
                account_last4=bal.get('account_last4', '0000'),
                balance=float(bal.get('balance', 0))
            )

        # Import aliases
        for alias in request.aliases:
            conn.execute(
                'INSERT OR REPLACE INTO user_aliases (user_id, recipient_pattern, display_name, category) '
                'VALUES (?, ?, ?, ?)',
                (user_id, alias.get('recipient_pattern'), alias.get('display_name'), alias.get('category', 'General'))
            )

        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to import data")
    finally:
        conn.close()


# ============ FRONTEND STATIC FILES ============

import pathlib

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.exception_handler(404)
    async def spa_fallback(request: Request, exc):
        if request.url.path.startswith("/api/") or request.url.path.startswith("/health"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        resolved = (FRONTEND_DIR / full_path).resolve()
        if not str(resolved).startswith(str(FRONTEND_DIR.resolve())):
            raise HTTPException(status_code=404)
        if resolved.exists() and resolved.is_file():
            return FileResponse(str(resolved))
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")

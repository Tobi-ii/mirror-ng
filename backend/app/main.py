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
import os
import logging
import re
import imaplib
import email
import quopri
import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
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

# Core Modules
from .database import get_db, init_db
from .balance_manager import BalanceManager
from .parsers import get_parser_for_sender
from .agent import run_agent
from .intent_agent import run_intent_agent

# ML Modules
from .ml.classifier import predict_category, train_classifier
from .ml.anomaly import detect_anomalies
from .ml.forecaster import weekly_spend_forecast

# Models
from .models import (
    SyncRequest,
    InitialBalanceRequest,
    ManualAdjustRequest,
    AgentChatRequest
)

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    allow_methods=["*"],
    allow_headers=["*"],
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
            socket.setdefaulttimeout(15)
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
        """Fetch emails via IMAP"""
        mail = self.connect_imap()
        try:
            search_criteria = "ALL"
            if since_date:
                d_since = datetime.strptime(since_date, "%Y-%m-%d")
                since_imap = d_since.strftime("%d-%b-%Y")
                search_criteria = f'SINCE {since_imap}'
                if until_date:
                    d_until = datetime.strptime(until_date, "%Y-%m-%d")
                    from datetime import timedelta
                    d_until = d_until + timedelta(days=1)
                    until_imap = d_until.strftime("%d-%b-%Y")
                    search_criteria += f' BEFORE {until_imap}'

            logger.info(f"🔍 IMAP Search: {search_criteria}")
            status, messages = mail.search(None, search_criteria)
            
            if status != "OK" or not messages[0]:
                logger.warning(f"No messages found")
                return []

            message_ids = messages[0].split()
            logger.info(f"📬 Found {len(message_ids)} total emails")
            
            if len(message_ids) > limit:
                message_ids = message_ids[-limit:]

            bank_emails = []

            for msg_id in reversed(message_ids):
                try:
                    status, msg_data = mail.fetch(msg_id, "(RFC822)")
                    if status != "OK":
                        continue
                    
                    msg = email.message_from_bytes(msg_data[0][1], policy=default)
                    sender = msg.get("From", "")
                    date_str = msg.get("Date", "")

                    if any(re.search(pattern, sender, re.IGNORECASE) for pattern in sender_patterns):
                        bank_emails.append({
                            "subject": msg.get("Subject", ""),
                            "from": sender,
                            "raw": self._get_email_body(msg),
                            "date": date_str,
                            "message_id": msg.get("Message-ID", "")
                        })
                except Exception as e:
                    logger.debug(f"Skipping email {msg_id}: {e}")
                    continue

            logger.info(f"📥 Found {len(bank_emails)} bank alert emails")
            return bank_emails
        finally:
            mail.logout()
    
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
            
            # Build query for bank alerts
            bank_domains = ' OR '.join([f'from:{pattern.replace("@", "")}' for pattern in sender_patterns if '@' in pattern])
            query = f'({bank_domains}) AND (subject:Debit OR subject:Credit OR subject:Alert OR subject:Transaction)'
            
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
                
                # Extract headers
                headers = {h['name'].lower(): h['value'] for h in msg_data['payload'].get('headers', [])}
                
                # Extract body
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
            logger.error(f"Gmail API error: {e}")
            return []
    
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
                except:
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
            return await asyncio.wait_for(call_next(request), timeout=60.0)
        except asyncio.TimeoutError:
            return JSONResponse(
                {"detail": "Request timed out — Please try again"},
                status_code=504
            )

app.add_middleware(TimeoutMiddleware)


# ============ APP EVENTS ============

@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("✓ Database initialized")
    try:
        train_classifier()
        logger.info("✓ ML Classifier trained and ready")
    except Exception as e:
        logger.error(f"⚠️ ML training failed on startup: {e}")

@app.get("/")
async def root():
    return {"message": "Mirror.ng API", "status": "operational", "version": "2.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ============ AUTHENTICATION ROUTES ============

@app.get("/api/auth/google/login")
async def google_login(request: Request):
    """Initiate Google OAuth login"""
    redirect_uri = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/api/auth/google/callback")
async def google_auth_callback(request: Request):
    """Handle Google OAuth callback"""
    try:
        token = await oauth.google.authorize_access_token(request)
        
        # Get user info
        resp = await oauth.google.get('https://www.googleapis.com/oauth2/v1/userinfo', token=token)
        userinfo = await resp.json()
        
        email = userinfo.get('email')
        name = userinfo.get('name')
        
        if not email:
            raise ValueError("No email received from Google")
        
        # Store user in database
        conn = get_db()
        
        # Create users table if not exists
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                auth_provider TEXT DEFAULT 'yahoo',
                access_token TEXT,
                refresh_token TEXT,
                email_password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        
        cursor = conn.execute('SELECT * FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor = conn.execute('''
                INSERT INTO users (email, name, auth_provider, access_token, refresh_token) 
                VALUES (?, ?, ?, ?, ?) RETURNING id
            ''', (email, name, 'gmail_oauth', token.get('access_token'), token.get('refresh_token')))
            user_id = cursor.fetchone()['id']
        else:
            user_id = user['id']
            conn.execute('''
                UPDATE users SET access_token = ?, refresh_token = ?, auth_provider = ? WHERE id = ?
            ''', (token.get('access_token'), token.get('refresh_token'), 'gmail_oauth', user_id))
        
        conn.commit()
        conn.close()
        
        # Create session token
        session_token = secrets.token_urlsafe(32)
        
        # Redirect to frontend
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}/auth/callback?token={session_token}&email={email}&userId={user_id}")
        
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


@app.post("/api/auth/email-login")
async def email_login(request: Request):
    """Login with email/password for Yahoo/Gmail with app password"""
    data = await request.json()
    email = data.get('email')
    password = data.get('password')
    provider = data.get('provider', 'yahoo')
    
    # Normalize provider
    if provider == 'gmail_app':
        provider = 'gmail'
    
    # Test IMAP connection
    try:
        if provider == 'yahoo':
            server = "imap.mail.yahoo.com"
            port = 993
        else:
            server = "imap.gmail.com"
            port = 993
            
        import socket
        socket.setdefaulttimeout(15)
        mail = imaplib.IMAP4_SSL(server, port)
        mail.login(email, password)
        mail.logout()
        
        # Store user in database
        conn = get_db()
        
        # Create users table if not exists
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                auth_provider TEXT DEFAULT 'yahoo',
                access_token TEXT,
                refresh_token TEXT,
                email_password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        
        cursor = conn.execute('SELECT * FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor = conn.execute('''
                INSERT INTO users (email, name, auth_provider, email_password) 
                VALUES (?, ?, ?, ?) RETURNING id
            ''', (email, email.split('@')[0], provider, password))
            user_id = cursor.fetchone()['id']
        else:
            user_id = user['id']
            conn.execute('''
                UPDATE users SET email_password = ?, auth_provider = ? WHERE id = ?
            ''', (password, provider, user_id))
        
        conn.commit()
        conn.close()
        
        session_token = secrets.token_urlsafe(32)
        
        return JSONResponse({
            "success": True,
            "user": {"user_id": user_id, "email": email, "provider": provider},
            "access_token": session_token
        })
        
    except imaplib.IMAP4.error as e:
        logger.error(f"IMAP login error: {e}")
        return JSONResponse({
            "success": False,
            "error": "Invalid credentials. For Gmail, use an App Password."
        }, status_code=401)
    except Exception as e:
        logger.error(f"Email login error: {e}")
        return JSONResponse({
            "success": False,
            "error": f"Connection failed: {str(e)}"
        }, status_code=500)


# ============ TRANSACTION ROUTES ============

@app.get("/api/transactions/{user_id}")
async def get_transactions(user_id: str, limit: int = 50, offset: int = 0, bank: Optional[str] = None):
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/sync")
async def sync_transactions(request: SyncRequest):
    conn = get_db()
    try:
        # Get user's email credentials
        cursor = conn.execute('''
            SELECT email, email_password, auth_provider, access_token, refresh_token 
            FROM users WHERE id = ?
        ''', (request.user_id,))
        user = cursor.fetchone()
        
        if not user or not user['email_password']:
            # Fallback to environment credentials
            email = os.getenv("YAHOO_EMAIL")
            password = os.getenv("YAHOO_APP_PASSWORD")
            provider = "yahoo"
            access_token = None
            refresh_token = None
        else:
            email = user['email']
            password = user['email_password']
            provider = user['auth_provider'] or 'yahoo'
            access_token = user.get('access_token')
            refresh_token = user.get('refresh_token')
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not found. Please login again.")
        
        # Create fetcher
        fetcher = EmailFetcher(
            email_address=email,
            password=password,
            provider=provider,
            access_token=access_token,
            refresh_token=refresh_token
        )
        
        # Bank sender patterns
        sender_patterns = [
            "@sterling.ng", "alerts@sterling.ng", "no-reply.alat.ng", "alat.ng",
            "@wema.com", "info@wemabank.com", "@gtbank.com", "no-reply@gtbank.com",
            "@accessbankplc.com", "no-reply@accessbank.com", "@firstbanknigeria.com",
            "@kuda.com", "alert@kuda.com", "@opay.com", "noreply@opay.com",
            "@moniepoint.com", "@palmspay.com"
        ]
        
        email_alerts = fetcher.fetch_alerts(
            sender_patterns=sender_patterns,
            limit=500,
            since_date=request.since_date,
            until_date=request.until_date
        )
        
        # Sort by date
        email_alerts.sort(key=lambda x: email_utils.parsedate_to_datetime(x.get('date', '')) or datetime.min)
        
        balance_manager = BalanceManager(conn)
        new_transactions = []
        
        TRANSACTION_KEYWORDS = ["money out", "money in", "debit alert", "credit alert",
                                "transaction", "ngn", "credited", "debited", "debit", "credit"]
        
        for alert in email_alerts:
            subject = alert.get("subject", "").lower()
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
                
                # Check for duplicate
                cursor = conn.execute('''
                    SELECT id FROM transactions
                    WHERE user_id = ? AND bank = ? AND amount = ? AND timestamp = ?
                ''', (request.user_id, parsed_tx.bank, parsed_tx.amount,
                      parsed_tx.timestamp.isoformat() if parsed_tx.timestamp else ""))
                if cursor.fetchone():
                    continue
                
                parsed_tx.category = predict_category(parsed_tx.narration)
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
                new_transactions.append(parsed_tx)
            except Exception as e:
                logger.error(f"❌ Error processing alert: {e}")
        
        conn.commit()
        return JSONResponse({
            "success": True,
            "new_transactions": [tx.to_dict() for tx in new_transactions],
            "total_synced": len(new_transactions)
        })
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ============ AGENT / CHAT ROUTES ============

@app.post("/api/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """Original tool-based agent (Groq/DeepSeek with function calling)"""
    conn = get_db()
    try:
        result = run_agent(
            user_id=request.user_id,
            message=request.message,
            history=request.history,
            db_conn=conn
        )
        return JSONResponse({"success": True, **result})
    except Exception as e:
        logger.error(f"Agent error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/agent/chat-v2")
async def agent_chat_v2(request: AgentChatRequest):
    """New structured intent agent (LLM → JSON → SQL → Response)"""
    conn = get_db()
    try:
        result = run_intent_agent(
            user_id=request.user_id,
            message=request.message,
            history=request.history,
            db_conn=conn
        )
        return JSONResponse({"success": True, **result})
    except Exception as e:
        logger.error(f"Intent agent error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ============ INSIGHTS & ANALYTICS ============

@app.get("/api/insights/{user_id}")
async def get_insights(user_id: str):
    conn = get_db()
    try:
        cursor = conn.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp ASC', (user_id,))
        transactions = [dict(row) for row in cursor.fetchall()]
        if not transactions:
            return {"success": True, "anomalies": [], "forecast": [], "message": "Insufficient data"}
        anomalies = [t for t in detect_anomalies(transactions) if t.get('is_anomaly')]
        forecast_data = weekly_spend_forecast(transactions)
        return JSONResponse({
            'success': True,
            'anomalies': anomalies,
            'forecast': forecast_data,
            'stats': {'total_anomalies': len(anomalies), 'total_analyzed': len(transactions)}
        })
    finally:
        conn.close()


# ============ BALANCES & ONBOARDING ============

@app.get("/api/balances/{user_id}")
async def get_balances(user_id: str):
    conn = get_db()
    balance_manager = BalanceManager(conn)
    try:
        balances = balance_manager.get_all_current_balances(user_id)

        # Map bank names to whether their email alerts provide account balance
        from .parsers import PARSER_CLASSES
        BANK_PROVIDES_BALANCE = {}
        for ParserClass in PARSER_CLASSES:
            parser = ParserClass()
            provides = getattr(parser, 'PROVIDES_BALANCE', False)
            # Create a sample transaction to get the bank name
            BANK_PROVIDES_BALANCE[parser.BANK_NAME] = provides

        for b in balances:
            b['is_anchor'] = bool(b.get('is_anchor', False))
            b['provides_balance'] = BANK_PROVIDES_BALANCE.get(b['bank'], False)
            b['balance'] = b.get('balance', 0) or 0

        return {"success": True, "balances": balances}
    finally:
        conn.close()

@app.post("/api/set-initial-balances")
async def set_initial_balances(request: InitialBalanceRequest):
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
async def manual_adjust_balance(request: ManualAdjustRequest):
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
async def delete_balance(user_id: str, request: DeleteBalanceRequest):
    conn = get_db()
    try:
        conn.execute(
            'DELETE FROM account_balances WHERE user_id = ? AND bank = ? AND account_last4 = ?',
            (user_id, request.bank, request.account_last4)
        )
        conn.commit()
        return JSONResponse({"success": True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ============ FRONTEND STATIC FILES (for Fly.io single-image deploy) ============

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
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")


# ============ ALIAS ENDPOINTS ============

@app.get("/api/aliases/{user_id}")
async def get_aliases(user_id: str):
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
async def save_alias(user_id: str, payload: dict):
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
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/aliases/{user_id}/{alias_id}")
async def delete_alias(user_id: str, alias_id: int):
    conn = get_db()
    try:
        conn.execute(
            'DELETE FROM user_aliases WHERE id = ? AND user_id = ?',
            (alias_id, user_id)
        )
        conn.commit()
        return JSONResponse({"success": True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
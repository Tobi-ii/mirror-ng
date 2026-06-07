"""
Mirror.ng Agent — LLM-powered financial assistant
Primary: Groq (Llama 3.3 70B) | Fallback: DeepSeek
"""

import os
import json
import logging
import re
from typing import List, Dict, Any, Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

# ── LLM Clients ────────────────────────────────────────────────────────
def get_groq_client():
    return OpenAI(
        api_key=os.getenv("GROQ_API_KEY"),
        base_url="https://api.groq.com/openai/v1"
    )

def get_deepseek_client():
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com/v1"
    )

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
DEEPSEEK_MODEL = "deepseek-chat"

# ── Tool Definitions ────────────────────────────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_balance",
            "description": "Get current account balances for all the user's bank accounts",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_transactions",
            "description": "Get transaction history. Can filter by date or bank.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of transactions to fetch (default 20)"
                    },
                    "since_date": {
                        "type": "string",
                        "description": "Filter from this date onward. Format: YYYY-MM-DD"
                    },
                    "bank": {
                        "type": "string",
                        "description": "Filter by bank name e.g. 'Sterling Bank'"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_insights",
            "description": "Get ML insights: 7-day spend forecast, anomaly detection, spending trends",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "summarize_spend",
            "description": "Summarize spending by category for a given period",
            "parameters": {
                "type": "object",
                "properties": {
                    "since_date": {
                        "type": "string",
                        "description": "Start date for summary. Format: YYYY-MM-DD"
                    },
                    "category": {
                        "type": "string",
                        "description": "Filter to specific category e.g. 'Utilities', 'Transfer', 'Food'"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_narrations",
            "description": "Search and analyze transaction narrations. Use for questions like 'what number did I top up most', 'who sent me money', 'which recipient got the most transfers'. Extracts patterns from narration text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tx_type": {
                        "type": "string",
                        "enum": ["debit", "credit", "all"],
                        "description": "Filter by transaction type"
                    },
                    "keyword": {
                        "type": "string",
                        "description": "Optional keyword to filter narrations e.g. 'airtime', 'transfer', 'data'"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_largest_transactions",
            "description": "Get the largest transactions by amount, useful for 'what was my biggest spend'",
            "parameters": {
                "type": "object",
                "properties": {
                    "tx_type": {
                        "type": "string",
                        "enum": ["debit", "credit", "all"],
                        "description": "Filter by transaction type"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "How many to return (default 5)"
                    }
                },
                "required": []
            }
        }
    }
]

SYSTEM_PROMPT = """You are Mirror, an intelligent financial assistant built into Mirror.ng — a financial tracking tool for Nigerians.

You analyze real bank alert data from Sterling Bank, Wema/ALAT, Kuda, OPay and other Nigerian banks.

PERSONALITY:
- Direct and sharp. No fluff.
- Use ₦ for naira always. Format: ₦1,000.00
- Conversational but precise.
- Flag anything suspicious.
- Give actionable insight, not just data.

HOW TO HANDLE QUESTIONS:
- "what number did i buy airtime for most" → use search_narrations with keyword="airtime" then analyze phone_number_breakdown
- "who sent my highest credit" → use get_largest_transactions with tx_type="credit" then read narrations for sender names
- "how much did i spend on transfers" → use summarize_spend with category="Transfer"  
- "any unusual transactions" → use get_insights and report anomalies
- "what's my balance" → use get_balance
- "biggest expense" → use get_largest_transactions with tx_type="debit"
- For ANY question about specific people, numbers, or narration content → use search_narrations

RULES:
- Always fetch real data with tools before answering.
- Never make up numbers or names.
- Never use placeholder text like "[insert name]" or "[extracted sender]". Use the actual data from tool results.
- If a tool returns data, read the fields carefully and use the actual values in your response.
- Extract phone numbers, recipient names, and sender names from narration text when relevant.
- Keep responses concise unless user asks for detail.
- If data is insufficient, say so clearly.
- NEVER invent a merchant name, store name, or recipient that isn't in the data.

AUDIT CONTEXT (current view window):
- Period: {since_date} to {until_date}
- When asked about spend, transfers, or any time-bounded question, use this period automatically. Do NOT ask the user to specify a date range — the audit window is already set."""

def load_aliases(db_conn, user_id: str) -> List[Dict]:
    """Load user aliases for narration cleaning."""
    try:
        cursor = db_conn.execute(
            'SELECT recipient_pattern, display_name FROM user_aliases WHERE user_id = ?',
            (user_id,)
        )
        return [dict(r) for r in cursor.fetchall()]
    except Exception:
        return []


def apply_aliases_to_narration(narration: str, aliases: List[Dict]) -> str:
    """Replace narration with alias display_name if pattern matches."""
    for a in aliases:
        pattern = a['recipient_pattern'].lower()
        if pattern and pattern in narration.lower():
            return a['display_name']
    return narration


def clean_tx_narration(tx: Dict, aliases: List[Dict]) -> Dict:
    """Apply aliases and shorten common prefixes on a transaction dict."""
    tx = dict(tx)
    raw = tx.get('narration', '') or ''
    aliased = apply_aliases_to_narration(raw, aliases)
    cleaned = aliased

    # Remove leading reference number: "000001260515072215138153450611 | ..."
    cleaned = re.sub(r'^\d+\s*\|\s*', '', cleaned).strip()

    # "OneBank Transfer from X to Y" → "Transfer to Y"
    m = re.search(r'OneBank\s+Transfer\s+from\s+.*?\s+to\s+(.+)', cleaned, re.IGNORECASE)
    if m:
        to_part = m.group(1).strip()
        # Clean parenthetical suffixes: "Name(Extra)" → "Name"
        to_part = re.sub(r'\(.*?\)', '', to_part).strip()
        cleaned = f"Transfer to {to_part}"
    else:
        # Other known prefixes to strip
        for prefix in ['BANKNIP From', 'NIP:', 'OneBank Transfer from', '00000']:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
                break

    tx['narration'] = cleaned or aliased
    return tx


# ── Tool Executor ───────────────────────────────────────────────────────
def execute_tool(tool_name: str, tool_args: Dict, user_id: str, db_conn) -> str:
    try:
        aliases = load_aliases(db_conn, user_id)

        if tool_name == "get_balance":
            from .balance_manager import BalanceManager
            balances = []
            try:
                bm = BalanceManager(db_conn)
                balances = bm.get_all_current_balances(user_id)
            except Exception:
                balances = []
            
            # Also compute from transactions for banks with no anchor
            cursor = db_conn.execute(
                'SELECT bank, account_last4, tx_type, amount FROM transactions WHERE user_id = ?',
                (user_id,)
            )
            txs = cursor.fetchall()
            
            if txs:
                banks_in_txs = set(t['bank'] for t in txs)
                banks_with_anchor = set(b['bank'] for b in balances)

                for bank in banks_in_txs - banks_with_anchor:
                    bank_txs = [t for t in txs if t['bank'] == bank]
                    last4 = next((t['account_last4'] for t in bank_txs if t['account_last4']), '????')
                    net = sum(t['amount'] if t['tx_type'] == 'credit' else -t['amount'] for t in bank_txs)
                    balances.append({
                        'bank': bank,
                        'account_last4': last4,
                        'balance': net,
                        'note': 'computed from transactions (no anchor set)'
                    })

            if not balances:
                return "No account balances found."
            return json.dumps(balances, default=str)

        elif tool_name == "get_transactions":
            limit = tool_args.get("limit", 20)
            since_date = tool_args.get("since_date")
            bank = tool_args.get("bank")

            query = "SELECT * FROM transactions WHERE user_id = ?"
            params = [user_id]
            if since_date:
                query += " AND timestamp >= ?"
                params.append(since_date)
            if bank:
                query += " AND bank LIKE ?"
                params.append(f"%{bank}%")

            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            cursor = db_conn.execute(query, params)
            txs = [clean_tx_narration(dict(row), aliases) for row in cursor.fetchall()]
            return json.dumps(txs, default=str) if txs else "No transactions found."

        elif tool_name == "get_insights":
            from .ml.anomaly import detect_anomalies
            from .ml.forecaster import weekly_spend_forecast

            cursor = db_conn.execute(
                "SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp ASC",
                (user_id,)
            )
            txs = [dict(row) for row in cursor.fetchall()]
            anomalies = [t for t in detect_anomalies(txs) if t.get("is_anomaly")]
            forecast = weekly_spend_forecast(txs)
            return json.dumps({
                "forecast": forecast,
                "anomalies": anomalies,
                "total_transactions": len(txs)
            }, default=str)

        elif tool_name == "summarize_spend":
            since_date = tool_args.get("since_date")
            category = tool_args.get("category")

            query = "SELECT * FROM transactions WHERE user_id = ? AND tx_type = 'debit'"
            params = [user_id]
            if since_date:
                query += " AND timestamp >= ?"
                params.append(since_date)

            cursor = db_conn.execute(query, params)
            rows = [dict(row) for row in cursor.fetchall()]

            def effective_category(row):
                raw_narration = row.get('narration', '') or ''
                for a in aliases:
                    if a['recipient_pattern'].lower() in raw_narration.lower():
                        return a.get('category') or row.get('category', 'General') or 'General'
                return row.get('category', 'General') or 'General'

            by_category: Dict[str, float] = {}
            for tx in rows:
                cat = effective_category(tx)
                if category and category.lower() not in cat.lower():
                    continue
                by_category[cat] = by_category.get(cat, 0) + float(tx["amount"])

            return json.dumps({
                "total_spent": sum(by_category.values()),
                "by_category": by_category,
                "transaction_count": len(rows),
                "period_start": since_date or "all time"
            }, default=str)

        elif tool_name == "search_narrations":
            tx_type = tool_args.get("tx_type", "all")
            keyword = tool_args.get("keyword", "")

            query = "SELECT narration, amount, tx_type, bank, timestamp FROM transactions WHERE user_id = ?"
            params = [user_id]
            if tx_type != "all":
                query += " AND tx_type = ?"
                params.append(tx_type)
            if keyword:
                query += " AND narration LIKE ?"
                params.append(f"%{keyword}%")

            query += " ORDER BY timestamp DESC"
            cursor = db_conn.execute(query, params)
            txs = [clean_tx_narration(dict(row), aliases) for row in cursor.fetchall()]

            phone_counts: Dict[str, Dict] = {}
            for tx in txs:
                narration = tx.get("narration", "")
                phones = re.findall(r'0[789]\d{9}', narration)
                for phone in phones:
                    if phone not in phone_counts:
                        phone_counts[phone] = {"count": 0, "total_amount": 0, "transactions": []}
                    phone_counts[phone]["count"] += 1
                    phone_counts[phone]["total_amount"] += float(tx["amount"])
                    phone_counts[phone]["transactions"].append({
                        "narration": narration, "amount": tx["amount"], "date": tx["timestamp"]
                    })

            return json.dumps({
                "total_matched": len(txs),
                "phone_number_breakdown": phone_counts,
                "raw_narrations": [{"narration": t["narration"], "amount": t["amount"], "tx_type": t["tx_type"]} for t in txs[:30]]
            }, default=str)

        elif tool_name == "get_largest_transactions":
            tx_type = tool_args.get("tx_type", "all")
            limit = tool_args.get("limit", 5)
            query = "SELECT * FROM transactions WHERE user_id = ?"
            params = [user_id]
            if tx_type != "all":
                query += " AND tx_type = ?"
                params.append(tx_type)
            query += " ORDER BY amount DESC LIMIT ?"
            params.append(limit)
            cursor = db_conn.execute(query, params)
            txs = [clean_tx_narration(dict(row), aliases) for row in cursor.fetchall()]
            results = []
            for tx in txs:
                narration = tx.get('narration', '') or ''
                # Extract likely sender name (words after 'from', 'to', or first 3 words)
                sender = ''
                from_m = re.search(r'(?:from|sent by|via)\s+([A-Z][A-Za-z .]+)', narration, re.IGNORECASE)
                if from_m:
                    sender = from_m.group(1).strip()
                if not sender:
                    sender = ' '.join(narration.split()[:3])
                results.append({
                    "bank": tx.get('bank', ''),
                    "amount": tx.get('amount', 0),
                    "narration": narration,
                    "sender_recipient": sender,
                    "date": tx.get('timestamp', ''),
                    "tx_type": tx.get('tx_type', '')
                })
            return json.dumps(results, default=str)

        return f"Unknown tool: {tool_name}"

    except Exception as e:
        logger.error(f"Tool error ({tool_name}): {e}")
        return f"An error occurred while processing that request."

# ── Agent Loop ──────────────────────────────────────────────────────────
def run_agent(user_id: str, message: str, history: List[Dict], db_conn, since_date: Optional[str] = None, until_date: Optional[str] = None) -> Dict:
    prompt = SYSTEM_PROMPT.format(since_date=since_date or "earliest", until_date=until_date or "present")
    messages = [{"role": "system", "content": prompt}, *history, {"role": "user", "content": message}]
    tool_calls_made = []
    
    def call_llm(client, model, msgs):
        return client.chat.completions.create(
            model=model, messages=msgs, tools=TOOLS, tool_choice="auto", temperature=0.3, max_tokens=1024
        )

    try:
        client = get_groq_client()
        response = call_llm(client, GROQ_MODEL, messages)
        model_used = f"groq/{GROQ_MODEL}"
    except Exception:
        client = get_deepseek_client()
        response = call_llm(client, DEEPSEEK_MODEL, messages)
        model_used = f"deepseek/{DEEPSEEK_MODEL}"

    for _ in range(5):
        if response.choices[0].finish_reason != "tool_calls":
            break
            
        assistant_msg = response.choices[0].message
        messages.append({"role": "assistant", "content": assistant_msg.content or "", "tool_calls": assistant_msg.tool_calls})

        for tool_call in assistant_msg.tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments or "{}")
            tool_calls_made.append({"tool": tool_name, "args": tool_args})
            
            result = execute_tool(tool_name, tool_args, user_id, db_conn)
            messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": result})

        response = call_llm(client, GROQ_MODEL if "groq" in model_used else DEEPSEEK_MODEL, messages)

    return {
        "response": response.choices[0].message.content or "I couldn't generate a response.",
        "tool_calls_made": tool_calls_made,
        "model_used": model_used
    }
"""
Mirror.ng Intent Agent — Structured Query Architecture
Layer 1: LLM intent parser → Layer 2: Query validator → Layer 3: Query engine → Layer 4: Response formatter
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

# ── Query Schema (the only thing the LLM can output) ───────────────────
INTENT_SCHEMA = {
    "intent": "aggregate | list | insight | lookup",
    "metric": "sum | count | max | min | average",
    "field": "amount",
    "filters": {
        "tx_type": "debit | credit | all",
        "category": "string",
        "bank": "string",
        "narration_contains": "string",
        "date_from": "YYYY-MM-DD",
        "date_to": "YYYY-MM-DD"
    },
    "group_by": "sender | recipient | date | category | bank | none",
    "order_by": "amount | date",
    "order": "asc | desc",
    "limit": 1
}

# ── System Prompt (tight, no reasoning allowed) ─────────────────────────
INTENT_SYSTEM_PROMPT = """You are Mirror Intent Parser.

Your ONLY job is to convert user questions into valid JSON queries.

RULES:
- NEVER answer the question.
- NEVER compute or estimate values.
- NEVER use outside knowledge.
- ONLY output valid JSON matching the schema below.
- If unclear, set "intent": "lookup" and narrow filters conservatively.
- If the user asks about a person or business name, use narration_contains.
- If the user asks "most" or "highest", use order_by + desc + limit.
- "group_by": "none" means no grouping, return single value.

SCHEMA:
{
  "intent": "aggregate|list|insight|lookup",
  "metric": "sum|count|max|min|average",
  "field": "amount",
  "filters": {
    "tx_type": "debit|credit|all",
    "category": "string or null",
    "bank": "string or null",
    "narration_contains": "string or null",
    "date_from": "YYYY-MM-DD or null",
    "date_to": "YYYY-MM-DD or null"
  },
  "group_by": "sender|recipient|date|category|bank|none",
  "order_by": "amount|date",
  "order": "asc|desc",
  "limit": null or integer
}

EXAMPLE INPUT: "Who sent me the most money?"
EXAMPLE OUTPUT: {"intent":"aggregate","metric":"sum","field":"amount","filters":{"tx_type":"credit"},"group_by":"sender","order_by":"amount","order":"desc","limit":1}

EXAMPLE INPUT: "How much did I spend on airtime?"
EXAMPLE OUTPUT: {"intent":"aggregate","metric":"sum","field":"amount","filters":{"tx_type":"debit","narration_contains":"airtime"},"group_by":"none"}

EXAMPLE INPUT: "What day did I spend the most?"
EXAMPLE OUTPUT: {"intent":"aggregate","metric":"sum","field":"amount","filters":{"tx_type":"debit"},"group_by":"date","order_by":"amount","order":"desc","limit":1}

EXAMPLE INPUT: "What's my biggest expense?"
EXAMPLE OUTPUT: {"intent":"lookup","metric":"max","field":"amount","filters":{"tx_type":"debit"},"limit":1}

EXAMPLE INPUT: "Show me my last 5 transfers"
EXAMPLE OUTPUT: {"intent":"list","metric":"count","field":"amount","filters":{"tx_type":"debit","narration_contains":"transfer"},"order_by":"date","order":"desc","limit":5}

OUTPUT ONLY JSON. NO TEXT. NO EXPLANATION."""

# ── Layer 2: Query Validator ───────────────────────────────────────────
ALLOWED_INTENTS = {"aggregate", "list", "insight", "lookup"}
ALLOWED_METRICS = {"sum", "count", "max", "min", "average"}
ALLOWED_TX_TYPES = {"debit", "credit", "all"}
ALLOWED_GROUP_BY = {"sender", "recipient", "date", "category", "bank", "none"}
ALLOWED_ORDER_BY = {"amount", "date"}
ALLOWED_ORDER = {"asc", "desc"}

def validate_query(query: dict) -> dict:
    """Validate and sanitize the LLM-generated query. Rejects unsafe queries."""
    
    # Ensure required fields exist
    intent = query.get("intent", "lookup")
    if intent not in ALLOWED_INTENTS:
        intent = "lookup"
    
    metric = query.get("metric", "sum")
    if metric not in ALLOWED_METRICS:
        metric = "sum"
    
    filters = query.get("filters", {})
    if not isinstance(filters, dict):
        filters = {}
    
    # Sanitize filters
    safe_filters = {}
    
    tx_type = filters.get("tx_type", "all")
    if tx_type in ALLOWED_TX_TYPES:
        safe_filters["tx_type"] = tx_type
    else:
        safe_filters["tx_type"] = "all"
    
    if filters.get("category"):
        safe_filters["category"] = str(filters["category"])[:50]
    
    if filters.get("bank"):
        safe_filters["bank"] = str(filters["bank"])[:50]
    
    if filters.get("narration_contains"):
        safe_filters["narration_contains"] = str(filters["narration_contains"])[:100]
    
    if filters.get("date_from"):
        if re.match(r'^\d{4}-\d{2}-\d{2}$', str(filters["date_from"])):
            safe_filters["date_from"] = filters["date_from"]
    
    if filters.get("date_to"):
        if re.match(r'^\d{4}-\d{2}-\d{2}$', str(filters["date_to"])):
            safe_filters["date_to"] = filters["date_to"]
    
    group_by = query.get("group_by", "none")
    if group_by not in ALLOWED_GROUP_BY:
        group_by = "none"
    
    order_by = query.get("order_by", "date")
    if order_by not in ALLOWED_ORDER_BY:
        order_by = "date"
    
    order = query.get("order", "desc")
    if order not in ALLOWED_ORDER:
        order = "desc"
    
    limit = query.get("limit")
    if limit is not None:
        try:
            limit = int(limit)
            limit = max(1, min(limit, 100))  # Clamp between 1-100
        except (ValueError, TypeError):
            limit = None
    
    return {
        "intent": intent,
        "metric": metric,
        "field": "amount",
        "filters": safe_filters,
        "group_by": group_by,
        "order_by": order_by,
        "order": order,
        "limit": limit
    }

# ── Layer 3: Query Engine (Pure SQL, no LLM) ──────────────────────────
def execute_query(query: dict, user_id: str, db_conn) -> dict:
    """Execute a validated query against the database. Deterministic only."""
    
    intent = query["intent"]
    metric = query["metric"]
    filters = query["filters"]
    group_by = query["group_by"]
    order_by = query["order_by"]
    order = query["order"]
    limit = query.get("limit")
    
    # Build SQL WHERE clause
    where_parts = ["user_id = ?"]
    params = [user_id]
    
    if filters.get("tx_type") and filters["tx_type"] != "all":
        where_parts.append("tx_type = ?")
        params.append(filters["tx_type"])
    
    if filters.get("category"):
        where_parts.append("category LIKE ?")
        params.append(f"%{filters['category']}%")
    
    if filters.get("bank"):
        where_parts.append("bank LIKE ?")
        params.append(f"%{filters['bank']}%")
    
    if filters.get("narration_contains"):
        where_parts.append("narration LIKE ?")
        params.append(f"%{filters['narration_contains']}%")
    
    if filters.get("date_from"):
        where_parts.append("date(timestamp) >= date(?)")
        params.append(filters["date_from"])
    
    if filters.get("date_to"):
        where_parts.append("date(timestamp) <= date(?)")
        params.append(filters["date_to"])
    
    where_clause = " AND ".join(where_parts)
    
    # Load aliases for narration mapping
    try:
        alias_cursor = db_conn.execute(
            'SELECT recipient_pattern, display_name, category FROM user_aliases WHERE user_id = ?',
            (user_id,)
        )
        aliases = alias_cursor.fetchall()
    except Exception:
        aliases = []
    
    def apply_alias(narration):
        """Replace narration with alias display name if matched."""
        if not narration:
            return "Unknown"
        for alias in aliases:
            if alias["recipient_pattern"].lower() in narration.lower():
                return alias["display_name"]
        return narration
    
    def apply_alias_category(narration, original_category):
        """Override category if alias exists."""
        if not narration:
            return original_category or "General"
        for alias in aliases:
            if alias["recipient_pattern"].lower() in narration.lower():
                return alias["category"] or original_category or "General"
        return original_category or "General"
    
    # ── Handle different intent types ──
    
    if intent == "aggregate" and group_by == "none":
        # Single value query: "How much did I spend on X?"
        select = "SELECT "
        if metric == "sum":
            select += "SUM(amount)"
        elif metric == "count":
            select += "COUNT(*)"
        elif metric == "max":
            select += "MAX(amount)"
        elif metric == "min":
            select += "MIN(amount)"
        elif metric == "average":
            select += "AVG(amount)"
        
        cursor = db_conn.execute(
            f"{select} FROM transactions WHERE {where_clause}",
            params
        )
        result = cursor.fetchone()
        value = result[0] if result and result[0] else 0
        
        return {
            "type": "single_value",
            "value": float(value),
            "metric": metric,
            "filters_applied": filters
        }
    
    elif intent == "aggregate" and group_by != "none":
        # Grouped aggregation: "Who sent me the most?"
        group_column = {
            "sender": "narration",
            "recipient": "narration",
            "date": "date(timestamp)",
            "category": "category",
            "bank": "bank"
        }.get(group_by, "category")
        
        select = "SELECT "
        if metric == "sum":
            select += "SUM(amount) as total"
        elif metric == "count":
            select += "COUNT(*) as total"
        elif metric == "max":
            select += "MAX(amount) as total"
        elif metric == "min":
            select += "MIN(amount) as total"
        elif metric == "average":
            select += "AVG(amount) as total"
        
        order_dir = "DESC" if order == "desc" else "ASC"
        limit_clause = f"LIMIT {limit}" if limit else "LIMIT 10"
        
        cursor = db_conn.execute(
            f"{select}, {group_column} as grp, narration FROM transactions WHERE {where_clause} GROUP BY grp ORDER BY total {order_dir} {limit_clause}",
            params
        )
        rows = cursor.fetchall()
        
        groups = []
        for row in rows:
            narration = row["narration"] if "narration" in row.keys() else row["grp"]
            display_name = apply_alias(narration) if group_by in ("sender", "recipient") else row["grp"]
            groups.append({
                "group": str(display_name),
                "total": float(row["total"]),
                "count": len([r for r in rows if r["grp"] == row["grp"]]),
                "raw_narration": narration if display_name != narration else None
            })
        
        return {
            "type": "grouped",
            "groups": groups,
            "metric": metric,
            "group_by": group_by,
            "filters_applied": filters
        }
    
    elif intent == "list":
        # List transactions
        order_dir = "DESC" if order == "desc" else "ASC"
        order_col = "amount" if order_by == "amount" else "timestamp"
        limit_clause = f"LIMIT {limit}" if limit else "LIMIT 20"
        
        cursor = db_conn.execute(
            f"SELECT * FROM transactions WHERE {where_clause} ORDER BY {order_col} {order_dir} {limit_clause}",
            params
        )
        rows = cursor.fetchall()
        
        transactions = []
        for row in rows:
            narration = row["narration"] or "Unknown"
            display = apply_alias(narration)
            cat = apply_alias_category(narration, row["category"])
            
            transactions.append({
                "id": row["id"],
                "bank": row["bank"],
                "tx_type": row["tx_type"],
                "amount": float(row["amount"]),
                "narration": display,
                "original_narration": narration if display != narration else None,
                "category": cat,
                "timestamp": row["timestamp"],
                "balance_after": float(row["balance_after"]) if row["balance_after"] else None
            })
        
        return {
            "type": "list",
            "transactions": transactions,
            "count": len(transactions),
            "filters_applied": filters
        }
    
    elif intent == "lookup":
        # Single record lookup
        order_dir = "DESC" if order == "desc" else "ASC"
        order_col = "amount" if order_by == "amount" else "timestamp"
        
        cursor = db_conn.execute(
            f"SELECT * FROM transactions WHERE {where_clause} ORDER BY {order_col} {order_dir} LIMIT 1",
            params
        )
        row = cursor.fetchone()
        
        if not row:
            return {
                "type": "lookup",
                "found": False,
                "message": "No matching transaction found."
            }
        
        narration = row["narration"] or "Unknown"
        display = apply_alias(narration)
        
        return {
            "type": "lookup",
            "found": True,
            "transaction": {
                "id": row["id"],
                "bank": row["bank"],
                "tx_type": row["tx_type"],
                "amount": float(row["amount"]),
                "narration": display,
                "original_narration": narration if display != narration else None,
                "category": apply_alias_category(narration, row["category"]),
                "timestamp": row["timestamp"]
            }
        }
    
    elif intent == "insight":
        # Quick insight: total in, total out, net
        cursor = db_conn.execute(
            f"SELECT tx_type, SUM(amount) as total FROM transactions WHERE {where_clause} GROUP BY tx_type",
            params
        )
        rows = cursor.fetchall()
        
        total_in = 0
        total_out = 0
        for row in rows:
            if row["tx_type"] == "credit":
                total_in = float(row["total"])
            elif row["tx_type"] == "debit":
                total_out = float(row["total"])
        
        return {
            "type": "insight",
            "total_in": total_in,
            "total_out": total_out,
            "net": total_in - total_out,
            "transaction_count": sum(1 for r in rows),
            "filters_applied": filters
        }
    
    return {"type": "error", "message": f"Unknown intent: {intent}"}

# ── Layer 4: Response Formatter ────────────────────────────────────────
FORMATTER_PROMPT = """You are Mirror, a sharp financial assistant for Nigerians.

Convert this financial data into a natural, concise answer. 
Use ₦ for naira. Be direct. Flag anything unusual.

DATA: {data}
USER QUESTION: {question}

RULES:
- Use the data provided. Do not invent numbers.
- Keep it under 3 sentences unless asked for detail.
- If data shows unusual patterns, mention it."""

def format_response(result: dict, question: str) -> str:
    """Optionally use LLM to format the response. Falls back to structured text."""
    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{
                "role": "user",
                "content": FORMATTER_PROMPT.format(
                    data=json.dumps(result, default=str, indent=2),
                    question=question
                )
            }],
            temperature=0.3,
            max_tokens=300
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.warning(f"Formatter LLM failed, using fallback: {e}")
        # Fallback formatting
        if result.get("type") == "single_value":
            return f"{result['metric'].title()}: ₦{result['value']:,.2f}"
        elif result.get("type") == "grouped" and result.get("groups"):
            top = result["groups"][0]
            return f"Top: {top['group']} — ₦{top['total']:,.2f}"
        elif result.get("type") == "insight":
            return f"In: ₦{result['total_in']:,.2f} | Out: ₦{result['total_out']:,.2f} | Net: ₦{result['net']:,.2f}"
        return json.dumps(result, default=str, indent=2)

# ── Pattern-based Intent Parser (zero LLM dependency) ───────────────
def parse_intent_via_patterns(message: str) -> dict:
    """Convert common question patterns to structured intent. No LLM needed."""
    lower = message.lower().strip()

    # "Balance"
    if re.search(r'\b(?:balance|how much (?:money|funds) do i have)\b', lower):
        return {"intent": "insight", "metric": "sum", "field": "amount", "filters": {"tx_type": "all"}, "group_by": "none"}

    # "Biggest / largest / highest single debit"
    if re.search(r'(?:biggest|largest|highest|most expensive).*(?:debit|purchase|spend|withdrawal)', lower):
        return {"intent": "lookup", "metric": "max", "field": "amount", "filters": {"tx_type": "debit"}, "order_by": "amount", "order": "desc", "limit": 1}

    # "Biggest / largest / highest single credit"
    if re.search(r'(?:biggest|largest|highest|most).*(?:credit|income|deposit|received)', lower):
        return {"intent": "lookup", "metric": "max", "field": "amount", "filters": {"tx_type": "credit"}, "order_by": "amount", "order": "desc", "limit": 1}

    # "Who sent me the most / highest" — grouped by sender
    if re.search(r'who (?:sent|transferred|paid|gave) me (?:the most|the highest|most money)', lower):
        return {"intent": "aggregate", "metric": "max", "field": "amount", "filters": {"tx_type": "credit"}, "group_by": "sender", "order_by": "amount", "order": "desc", "limit": 1}

    # "What number did I buy airtime for most?"
    if re.search(r'(?:what number|who|which number).*airtime|airtime.*(?:most|often|number)', lower):
        return {"intent": "aggregate", "metric": "sum", "field": "amount", "filters": {"tx_type": "debit", "narration_contains": "airtime"}, "group_by": "recipient", "order_by": "amount", "order": "desc", "limit": 1}

    # "How much did I spend on X?"
    spend_on = re.search(r'how much (?:did|do) i (?:spend|spent|pay|paid) (?:on|for) (.+)', lower)
    if spend_on:
        return {"intent": "aggregate", "metric": "sum", "field": "amount", "filters": {"tx_type": "debit", "narration_contains": spend_on.group(1).strip()}, "group_by": "none"}

    # "How much did I spend this week / month?"
    if re.search(r'how much (?:did|do) i (?:spend|spent) (?:this|last) (?:week|month)', lower):
        return {"intent": "aggregate", "metric": "sum", "field": "amount", "filters": {"tx_type": "debit"}, "group_by": "none"}

    # "Forecast" / "Predict"
    if re.search(r'\b(?:forecast|predict|project(?:ion)?)\b', lower):
        return {"intent": "insight", "metric": "sum", "field": "amount", "filters": {"tx_type": "debit"}, "group_by": "none"}

    # "Unusual" / "Anomaly"
    if re.search(r'\b(?:unusual|anomaly|suspicious|strange|weird)\b', lower):
        return {"intent": "insight", "metric": "count", "field": "amount", "filters": {"tx_type": "debit"}, "group_by": "none"}

    # "Last N transactions" / "Show transactions"
    last_n = re.search(r'(?:last|latest|recent|show|list)\s*(\d+)?\s*(?:transaction|movement|activity|history)', lower)
    if last_n:
        limit = int(last_n.group(1)) if last_n.group(1) else 10
        return {"intent": "list", "metric": "count", "field": "amount", "filters": {"tx_type": "all"}, "order_by": "date", "order": "desc", "limit": min(limit, 50)}

    # "Transfers"
    if re.search(r'\b(?:transfer|bank transfer|send money)\b', lower):
        return {"intent": "aggregate", "metric": "sum", "field": "amount", "filters": {"tx_type": "debit", "narration_contains": "transfer"}, "group_by": "none"}

    # "Biggest expense"
    if re.search(r'biggest (?:expense|spending|cost|purchase|payment)', lower):
        return {"intent": "lookup", "metric": "max", "field": "amount", "filters": {"tx_type": "debit"}, "order_by": "amount", "order": "desc", "limit": 1}

    return None

# ── Main Agent Function ────────────────────────────────────────────────
def run_intent_agent(user_id: str, message: str, history: List[Dict], db_conn) -> Dict:
    """
    Production-safe agent:
    Layer 1: LLM → JSON intent (fallback: pattern-matching)
    Layer 2: Validate query
    Layer 3: Execute query (SQL only)
    Layer 4: Format response
    """
    
    raw_json = None
    model_used = None
    parsed_intent = None
    
    # Layer 1: Try LLM-based intent parsing first
    messages = [
        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
        {"role": "user", "content": message}
    ]
    
    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.1,
            max_tokens=300
        )
        raw_json = response.choices[0].message.content.strip()
        model_used = f"groq/{GROQ_MODEL}"
    except Exception:
        try:
            client = get_deepseek_client()
            response = client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=messages,
                temperature=0.1,
                max_tokens=300
            )
            raw_json = response.choices[0].message.content.strip()
            model_used = f"deepseek/{DEEPSEEK_MODEL}"
        except Exception as e:
            logger.warning(f"LLM call failed, trying pattern fallback: {e}")
    
    # If LLM succeeded, parse its JSON output
    if raw_json:
        raw_json = re.sub(r'^```(?:json)?\s*', '', raw_json)
        raw_json = re.sub(r'\s*```$', '', raw_json)
        try:
            parsed_intent = json.loads(raw_json)
        except json.JSONDecodeError:
            logger.warning(f"LLM returned invalid JSON, trying pattern fallback: {raw_json[:200]}")
    
    # Layer 1 fallback: pattern-based intent parsing (no LLM)
    if parsed_intent is None:
        pattern_intent = parse_intent_via_patterns(message)
        if pattern_intent:
            parsed_intent = pattern_intent
            model_used = "pattern-fallback"
            logger.info(f"Pattern fallback matched: {json.dumps(pattern_intent)}")
        else:
            return {
                "response": "I couldn't process that request. Try rephrasing (e.g. 'How much did I spend on transfers?').",
                "model_used": "none",
                "intent_parsed": None,
                "result": None
            }
    
    # Layer 2: Validate
    validated_query = validate_query(parsed_intent)
    
    # Layer 3: Execute
    try:
        result = execute_query(validated_query, user_id, db_conn)
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        return {
            "response": "I couldn't fetch that data. Please try again.",
            "model_used": model_used,
            "intent_parsed": validated_query,
            "result": None
        }
    
    # Layer 4: Format
    response_text = format_response(result, message)
    
    return {
        "response": response_text,
        "model_used": model_used,
        "intent_parsed": validated_query,
        "result": result
    }
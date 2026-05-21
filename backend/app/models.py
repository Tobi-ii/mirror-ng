"""
models.py — Pydantic models for Mirror.ng API
Defines request/response schemas for FastAPI endpoints.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal
from datetime import datetime


# ─────────────────────────────────────────────────────────────────────
# Transaction — normalized transaction model (for API responses)
# ─────────────────────────────────────────────────────────────────────

class Transaction(BaseModel):
    """
    Normalized transaction returned by API endpoints.
    """
    id: Optional[int] = None
    bank: str
    tx_type: Literal["credit", "debit", "unknown"]
    amount: float = Field(..., ge=0)
    balance: Optional[float] = None
    narration: str
    account_last4: Optional[str] = None
    timestamp: Optional[datetime] = None
    category: str = "other"
    
    class Config:
        from_attributes = True 
    
    @field_validator('amount')
    def amount_must_be_positive(cls, v):
        if v < 0:
            raise ValueError('Amount cannot be negative')
        return v


# ─────────────────────────────────────────────────────────────────────
# AccountBalance — for balance endpoints
# ─────────────────────────────────────────────────────────────────────

class AccountBalance(BaseModel):
    """
    Current balance for a single bank account.
    """
    bank: str
    account_last4: str
    balance: float = Field(..., ge=0)
    last_updated: Optional[datetime] = None
    is_anchor: bool = True


# ─────────────────────────────────────────────────────────────────────
# Request Models — what the API accepts
# ─────────────────────────────────────────────────────────────────────

class SyncRequest(BaseModel):
    """Request body for POST /api/sync"""
    user_id: str = Field(..., min_length=1, max_length=100)
    since_date: Optional[str] = None
    until_date: Optional[str] = None  # NEW: For date range audits
    
    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user_12345",
                "since_date": "2026-04-04",
                "until_date": "2026-05-04"
            }
        }


class InitialBalanceRequest(BaseModel):
    """
    Request body for POST /api/set-initial-balances
    """
    user_id: str = Field(..., min_length=1, max_length=100)
    balances: List[dict] = Field(..., min_length=1)
    
    @field_validator('balances')
    def balances_must_be_valid(cls, v):
        for item in v:
            if not all(k in item for k in ['bank', 'account_last4', 'balance']):
                raise ValueError('Each balance must have bank, account_last4, and balance')
            
            # CRITICAL FIX: Ensure we only store the last 4 digits
            item['account_last4'] = str(item['account_last4'])[-4:]
            
            if item['balance'] < 0:
                raise ValueError('Balance cannot be negative')
        return v


class ManualAdjustRequest(BaseModel):
    """Request body for POST /api/manual-adjust-balance"""
    user_id: str = Field(..., min_length=1, max_length=100)
    bank: str = Field(..., min_length=1)
    account_last4: str = Field(..., min_length=4, max_length=4)
    new_balance: float = Field(..., ge=0)
    reason: Optional[str] = Field(None, max_length=200)


# ─────────────────────────────────────────────────────────────────────
# Response Models — what the API returns
# ─────────────────────────────────────────────────────────────────────

class SyncResponse(BaseModel):
    user_id: str
    success: bool = True
    new_transactions: List[Transaction]
    balances: List[AccountBalance]
    total_synced: int
    parse_errors: int
    synced_at: datetime


class BalanceResponse(BaseModel):
    success: bool = True
    balances: List[AccountBalance]
    total_accounts: int


class TransactionResponse(BaseModel):
    success: bool = True
    transactions: List[Transaction]
    count: int
    has_more: bool


class ErrorResponse(BaseModel):
    success: bool = False
    detail: str
    error_code: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────
# Agent / AI Models — Added for ML Insights
# ─────────────────────────────────────────────────────────────────────

class AgentChatRequest(BaseModel):
    """
    Request body for AI-driven financial insights chat.
    """
    user_id: str
    message: str
    history: List[dict] = []

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user_12345",
                "message": "What is my biggest expense this month?",
                "history": []
            }
        }
"""Chart of Accounts + Tax Rates — the foundation of the accounting module.

The Chart of Accounts is a tree of `Account` rows; every report (P&L, Balance
Sheet, Cash Flow) classifies on `Account.type`. We seed a UAE-suitable default
chart the first time `/api/accounting/chart/bootstrap` is called (idempotent),
so a fresh deployment can start posting journals immediately.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List

from backend.database.db import get_db
from backend.database.models import Account, TaxRate, JournalLine, User
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/accounting", tags=["accounting"])

ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AccountIn(BaseModel):
    code: str
    name: str
    type: str
    sub_type: Optional[str] = None
    parent_id: Optional[int] = None
    currency: str = "AED"
    is_active: bool = True
    description: Optional[str] = None


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    sub_type: Optional[str] = None
    parent_id: Optional[int] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class TaxRateIn(BaseModel):
    code: str
    name: str
    rate: float = 0.0
    type: str = "both"
    is_active: bool = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def account_balance(db: Session, account_id: int) -> float:
    """Net balance of an account (sum of debits − sum of credits). For asset
    and expense accounts this reads as a positive balance; for liability /
    equity / income it reads as a negative balance — the report layer flips
    the sign as appropriate."""
    row = db.query(
        func.coalesce(func.sum(JournalLine.debit), 0.0).label("d"),
        func.coalesce(func.sum(JournalLine.credit), 0.0).label("c"),
    ).filter(JournalLine.account_id == account_id).one()
    return round(float(row.d) - float(row.c), 2)


def serialize_account(a: Account, db: Optional[Session] = None) -> dict:
    out = {
        "id": a.id,
        "code": a.code,
        "name": a.name,
        "type": a.type,
        "sub_type": a.sub_type,
        "parent_id": a.parent_id,
        "currency": a.currency,
        "is_active": a.is_active,
        "description": a.description,
    }
    if db is not None:
        out["balance"] = account_balance(db, a.id)
    return out


# ─── Chart of Accounts CRUD ───────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(
    include_balance: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(Account).order_by(Account.code.asc()).all()
    return [serialize_account(a, db if include_balance else None) for a in rows]


@router.post("/accounts")
def create_account(
    payload: AccountIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if payload.type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {ACCOUNT_TYPES}")
    if db.query(Account).filter(Account.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Account code already exists")
    a = Account(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return serialize_account(a, db)


@router.patch("/accounts/{account_id}")
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    a = db.query(Account).filter(Account.id == account_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    data = payload.model_dump(exclude_unset=True)
    if "type" in data and data["type"] not in ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {ACCOUNT_TYPES}")
    if "code" in data and data["code"] != a.code:
        if db.query(Account).filter(Account.code == data["code"]).first():
            raise HTTPException(status_code=400, detail="Account code already exists")
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return serialize_account(a, db)


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    a = db.query(Account).filter(Account.id == account_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Account not found")
    if db.query(JournalLine).filter(JournalLine.account_id == account_id).first():
        raise HTTPException(status_code=400, detail="Cannot delete: account has journal lines. Deactivate instead.")
    db.delete(a)
    db.commit()
    return {"ok": True}


# ─── Tax Rates CRUD ───────────────────────────────────────────────────────────

@router.get("/tax-rates")
def list_tax_rates(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [
        {"id": t.id, "code": t.code, "name": t.name, "rate": t.rate, "type": t.type, "is_active": t.is_active}
        for t in db.query(TaxRate).order_by(TaxRate.code.asc()).all()
    ]


@router.post("/tax-rates")
def create_tax_rate(payload: TaxRateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.query(TaxRate).filter(TaxRate.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Tax rate code already exists")
    t = TaxRate(**payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "code": t.code, "name": t.name, "rate": t.rate, "type": t.type, "is_active": t.is_active}


@router.patch("/tax-rates/{tax_id}")
def update_tax_rate(tax_id: int, payload: TaxRateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    t = db.query(TaxRate).filter(TaxRate.id == tax_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "code": t.code, "name": t.name, "rate": t.rate, "type": t.type, "is_active": t.is_active}


@router.delete("/tax-rates/{tax_id}")
def delete_tax_rate(tax_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    t = db.query(TaxRate).filter(TaxRate.id == tax_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ─── Bootstrap: seed a default UAE chart of accounts and standard VAT rates ──
# Idempotent — running it twice does nothing. Codes are stable; types drive
# every downstream report.

DEFAULT_ACCOUNTS = [
    # Assets ─────────────────────────────────────────────
    ("1100", "Current Assets",          "asset",     "current_asset",         None),
    ("1110", "Cash on Hand",            "asset",     "cash",                  "1100"),
    ("1120", "Bank Accounts",           "asset",     "bank",                  "1100"),
    ("1130", "Accounts Receivable",     "asset",     "accounts_receivable",   "1100"),
    ("1140", "VAT Recoverable",         "asset",     "current_asset",         "1100"),
    ("1150", "Prepayments",             "asset",     "current_asset",         "1100"),
    ("1200", "Fixed Assets",            "asset",     "fixed_asset",           None),
    ("1210", "Office Equipment",        "asset",     "fixed_asset",           "1200"),
    ("1220", "Furniture & Fittings",    "asset",     "fixed_asset",           "1200"),
    ("1290", "Accumulated Depreciation","asset",     "fixed_asset",           "1200"),
    # Liabilities ────────────────────────────────────────
    ("2100", "Current Liabilities",     "liability", "current_liability",     None),
    ("2110", "Accounts Payable",        "liability", "accounts_payable",      "2100"),
    ("2120", "VAT Payable",             "liability", "vat_payable",           "2100"),
    ("2130", "Accrued Expenses",        "liability", "current_liability",     "2100"),
    ("2140", "Payroll Liabilities",     "liability", "current_liability",     "2100"),
    # Equity ─────────────────────────────────────────────
    ("3100", "Owner's Capital",         "equity",    "equity",                None),
    ("3200", "Retained Earnings",       "equity",    "retained_earnings",     None),
    ("3300", "Owner's Drawings",        "equity",    "equity",                None),
    # Income ─────────────────────────────────────────────
    ("4100", "Service Revenue",         "income",    "revenue",               None),
    ("4200", "Consulting Revenue",      "income",    "revenue",               None),
    ("4900", "Other Income",            "income",    "other_income",          None),
    # Expenses ───────────────────────────────────────────
    ("5100", "Operating Expenses",      "expense",   "operating_expense",     None),
    ("5110", "Rent",                    "expense",   "operating_expense",     "5100"),
    ("5120", "Utilities",               "expense",   "operating_expense",     "5100"),
    ("5130", "Internet & Phone",        "expense",   "operating_expense",     "5100"),
    ("5140", "Office Supplies",         "expense",   "operating_expense",     "5100"),
    ("5150", "Software Subscriptions",  "expense",   "operating_expense",     "5100"),
    ("5160", "Bank Charges",            "expense",   "operating_expense",     "5100"),
    ("5200", "Salaries & Benefits",     "expense",   "operating_expense",     None),
    ("5210", "Salaries & Wages",        "expense",   "operating_expense",     "5200"),
    ("5220", "Employee Benefits",       "expense",   "operating_expense",     "5200"),
    ("5300", "Marketing & Sales",       "expense",   "operating_expense",     None),
    ("5310", "Advertising",             "expense",   "operating_expense",     "5300"),
    ("5320", "Marketing Tools",         "expense",   "operating_expense",     "5300"),
    ("5400", "Professional Services",   "expense",   "operating_expense",     None),
    ("5410", "Legal Fees",              "expense",   "operating_expense",     "5400"),
    ("5420", "Accounting Fees",         "expense",   "operating_expense",     "5400"),
    ("5900", "Other Expenses",          "expense",   "other_expense",         None),
]

DEFAULT_TAX_RATES = [
    ("VAT5",   "UAE VAT 5%",          5.0, "both"),
    ("ZERO",   "Zero-rated (0%)",     0.0, "both"),
    ("EXEMPT", "Exempt",              0.0, "both"),
    ("OOS",    "Out of Scope",        0.0, "both"),
]


@router.post("/chart/bootstrap")
def bootstrap_defaults(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Seed default UAE chart + VAT rates. Idempotent — existing codes are kept."""
    created_accounts = 0
    by_code: dict[str, Account] = {a.code: a for a in db.query(Account).all()}
    # First pass: insert any missing codes without parent linkage so parent codes
    # always exist by the time their children look them up.
    for code, name, type_, sub, _parent in DEFAULT_ACCOUNTS:
        if code in by_code:
            continue
        a = Account(code=code, name=name, type=type_, sub_type=sub, currency="AED", is_active=True)
        db.add(a)
        by_code[code] = a
        created_accounts += 1
    db.flush()
    # Second pass: wire parent_id on the rows we just created.
    for code, _n, _t, _s, parent_code in DEFAULT_ACCOUNTS:
        if parent_code and code in by_code and parent_code in by_code:
            a = by_code[code]
            if a.parent_id is None:
                a.parent_id = by_code[parent_code].id

    created_tax = 0
    existing_tax = {t.code for t in db.query(TaxRate).all()}
    for code, name, rate, type_ in DEFAULT_TAX_RATES:
        if code in existing_tax:
            continue
        db.add(TaxRate(code=code, name=name, rate=rate, type=type_, is_active=True))
        created_tax += 1

    db.commit()
    return {"created_accounts": created_accounts, "created_tax_rates": created_tax}

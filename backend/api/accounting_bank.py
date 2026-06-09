"""Bank & Cash Accounts + statement-line Transactions.

Each BankAccount is mirrored by a CoA `Account` (asset/bank or asset/cash). The
current balance is derived from JournalLines posted against that CoA mirror, so
expense/bill/payment auto-postings flow through automatically.

Manual BankTransaction rows let users record arbitrary deposits/withdrawals
(interest, transfers, opening adjustments). Each posts a balanced JE.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional

from backend.database.db import get_db
from backend.database.models import (
    BankAccount, BankTransaction, Account, JournalEntry, JournalLine, User,
)
from backend.services.auth_service import get_current_user
from backend.api.accounting_purchases import (
    _post_je, _delete_je_for_source, _account_id_by_code, _round, _next_number,
)

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


# ─── Bank Accounts ────────────────────────────────────────────────────────────

class BankAccountIn(BaseModel):
    name: str
    account_type: str = "bank"            # bank, cash, credit_card
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    iban: Optional[str] = None
    currency: str = "AED"
    opening_balance: float = 0.0
    coa_account_id: Optional[int] = None
    is_active: bool = True
    notes: Optional[str] = None


def _account_balance_from_je(db: Session, account_id: int) -> float:
    row = db.query(
        func.coalesce(func.sum(JournalLine.debit), 0.0).label("d"),
        func.coalesce(func.sum(JournalLine.credit), 0.0).label("c"),
    ).filter(JournalLine.account_id == account_id).one()
    return _round(float(row.d) - float(row.c))


def _serialize_bank(b: BankAccount, db: Optional[Session] = None) -> dict:
    out = {
        "id": b.id, "name": b.name, "account_type": b.account_type,
        "bank_name": b.bank_name, "account_number": b.account_number,
        "iban": b.iban, "currency": b.currency,
        "opening_balance": b.opening_balance,
        "coa_account_id": b.coa_account_id,
        "coa_account_code": b.coa_account.code if b.coa_account else None,
        "coa_account_name": b.coa_account.name if b.coa_account else None,
        "is_active": b.is_active, "notes": b.notes,
    }
    if db is not None and b.coa_account_id:
        out["current_balance"] = _round(b.opening_balance + _account_balance_from_je(db, b.coa_account_id))
    else:
        out["current_balance"] = b.opening_balance
    return out


def _auto_link_coa(db: Session, ba: BankAccount):
    """If no CoA account is set, mirror this bank/cash account to a fresh CoA
    leaf under the appropriate parent (1120 Bank Accounts / 1110 Cash on Hand).
    Idempotent — no-op if `coa_account_id` is already set."""
    if ba.coa_account_id:
        return
    if ba.account_type == "cash":
        parent_code, sub = "1110", "cash"
    else:
        parent_code, sub = "1120", "bank"
    parent = db.query(Account).filter(Account.code == parent_code).first()
    # Next free code under that parent: parent_code + "-N"
    n = db.query(Account).filter(Account.parent_id == (parent.id if parent else None)).count() + 1
    code = f"{parent_code}-{n:02d}"
    a = Account(
        code=code, name=ba.name, type="asset", sub_type=sub,
        parent_id=parent.id if parent else None, currency=ba.currency, is_active=True,
    )
    db.add(a); db.flush()
    ba.coa_account_id = a.id
    # If the user gave an opening balance, post an opening JE: DR bank CoA, CR Owner's Capital (3100)
    if ba.opening_balance and abs(ba.opening_balance) > 0.001:
        equity_id = _account_id_by_code(db, "3100")
        if equity_id:
            amt = _round(ba.opening_balance)
            _post_je(
                db, source_type="bank_account_opening", source_id=ba.id,
                entry_date=datetime.utcnow().strftime("%Y-%m-%d"),
                memo=f"Opening balance — {ba.name}", user_id=None,
                lines=[(a.id, amt, 0.0, "Opening balance"), (equity_id, 0.0, amt, "Opening capital")],
            )


@router.get("/bank-accounts")
def list_bank_accounts(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [_serialize_bank(b, db) for b in db.query(BankAccount).order_by(BankAccount.name.asc()).all()]


@router.post("/bank-accounts")
def create_bank_account(payload: BankAccountIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = BankAccount(**payload.model_dump())
    db.add(b); db.flush()
    _auto_link_coa(db, b)
    db.commit(); db.refresh(b)
    return _serialize_bank(b, db)


@router.patch("/bank-accounts/{bank_id}")
def update_bank_account(bank_id: int, payload: BankAccountIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.query(BankAccount).filter(BankAccount.id == bank_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for k, v in payload.model_dump().items():
        setattr(b, k, v)
    _auto_link_coa(db, b)
    db.commit(); db.refresh(b)
    return _serialize_bank(b, db)


@router.delete("/bank-accounts/{bank_id}")
def delete_bank_account(bank_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.query(BankAccount).filter(BankAccount.id == bank_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bank account not found")
    if db.query(BankTransaction).filter(BankTransaction.bank_account_id == bank_id).first():
        raise HTTPException(status_code=400, detail="Has transactions — deactivate instead.")
    db.delete(b); db.commit()
    return {"ok": True}


# ─── Bank Transactions (manual statement lines) ───────────────────────────────

class BankTxnIn(BaseModel):
    bank_account_id: int
    txn_date: str
    description: Optional[str] = None
    amount: float                          # signed: + deposit, − withdrawal
    reference: Optional[str] = None
    counterparty_account_id: Optional[int] = None
    is_reconciled: bool = False


def _serialize_txn(t: BankTransaction) -> dict:
    return {
        "id": t.id, "bank_account_id": t.bank_account_id, "txn_date": t.txn_date,
        "description": t.description, "amount": t.amount, "reference": t.reference,
        "counterparty_account_id": t.counterparty_account_id,
        "counterparty_code": t.counterparty_account.code if t.counterparty_account else None,
        "counterparty_name": t.counterparty_account.name if t.counterparty_account else None,
        "is_reconciled": t.is_reconciled, "source_type": t.source_type,
    }


def _post_bank_txn_je(db: Session, t: BankTransaction, bank_coa_id: int, user_id: Optional[int]):
    """Deposit (amount > 0): DR bank CoA,  CR counterparty (default income 4900).
    Withdrawal (amount < 0): DR counterparty (default expense 5900), CR bank CoA."""
    if not bank_coa_id:
        return
    if t.amount >= 0:
        cp_id = t.counterparty_account_id or _account_id_by_code(db, "4900")
        if not cp_id:
            return
        lines = [
            (bank_coa_id, t.amount, 0.0, t.description or "Deposit"),
            (cp_id, 0.0, t.amount, t.description or "Deposit"),
        ]
    else:
        cp_id = t.counterparty_account_id or _account_id_by_code(db, "5900")
        if not cp_id:
            return
        amt = -t.amount
        lines = [
            (cp_id, amt, 0.0, t.description or "Withdrawal"),
            (bank_coa_id, 0.0, amt, t.description or "Withdrawal"),
        ]
    _post_je(
        db, source_type="bank_transaction", source_id=t.id,
        entry_date=t.txn_date, memo=t.description or "Bank transaction",
        user_id=user_id, lines=lines,
    )


@router.get("/bank-accounts/{bank_id}/transactions")
def list_transactions(bank_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.query(BankAccount).filter(BankAccount.id == bank_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bank account not found")
    rows = (
        db.query(BankTransaction)
        .filter(BankTransaction.bank_account_id == bank_id)
        .order_by(BankTransaction.txn_date.desc(), BankTransaction.id.desc())
        .all()
    )
    return [_serialize_txn(t) for t in rows]


@router.post("/bank-transactions")
def create_transaction(payload: BankTxnIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.query(BankAccount).filter(BankAccount.id == payload.bank_account_id).first()
    if not b:
        raise HTTPException(status_code=400, detail="Bank account not found")
    if abs(payload.amount) < 0.001:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")
    t = BankTransaction(**payload.model_dump(), source_type="manual", created_by=user.id)
    db.add(t); db.flush()
    _post_bank_txn_je(db, t, b.coa_account_id, user.id)
    db.commit(); db.refresh(t)
    return _serialize_txn(t)


@router.delete("/bank-transactions/{txn_id}")
def delete_transaction(txn_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    t = db.query(BankTransaction).filter(BankTransaction.id == txn_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _delete_je_for_source(db, "bank_transaction", t.id)
    db.delete(t); db.commit()
    return {"ok": True}

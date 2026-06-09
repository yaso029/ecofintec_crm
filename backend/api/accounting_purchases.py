"""Purchases side of the Accounting module — Suppliers, Bills, Bill Payments,
and direct Expenses. Each transaction auto-posts a balanced Journal Entry so
the P&L / Balance Sheet / Cash Flow reports reflect it without manual entry.

Auto-posting rules:
  • Expense       → DR expense_account,         CR bank_account / Cash
                    (+ DR VAT Recoverable for the VAT portion, when applicable)
  • Bill (open)   → DR expense_account(s),      CR Accounts Payable
                    (+ DR VAT Recoverable for VAT)
  • SupplierPayment → DR Accounts Payable,      CR bank_account
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.database.db import get_db
from backend.database.models import (
    Supplier, Bill, BillLineItem, SupplierPayment, Expense,
    BankAccount, Account, JournalEntry, JournalLine, User,
)
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/accounting", tags=["accounting"])

DEFAULT_VAT_RATE = 5.0


# ─── Shared helpers ───────────────────────────────────────────────────────────

def _round(x: float) -> float:
    return round(float(x or 0), 2)


def _account_id_by_code(db: Session, code: str) -> Optional[int]:
    a = db.query(Account).filter(Account.code == code).first()
    return a.id if a else None


def _bank_coa_account_id(db: Session, bank_account_id: Optional[int]) -> Optional[int]:
    """Resolve a BankAccount's mirroring CoA account, falling back to the default
    "1110 Cash on Hand" so a missing link doesn't silently break posting."""
    if bank_account_id:
        ba = db.query(BankAccount).filter(BankAccount.id == bank_account_id).first()
        if ba and ba.coa_account_id:
            return ba.coa_account_id
    return _account_id_by_code(db, "1110")  # Cash on Hand fallback


def _next_number(db: Session, model, field: str, prefix_root: str) -> str:
    """Sequential per calendar year: {prefix_root}-YYYY-0001."""
    year = datetime.utcnow().year
    prefix = f"{prefix_root}-{year}-"
    count = db.query(model).filter(getattr(model, field).like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def _post_je(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    entry_date: str,
    memo: str,
    user_id: Optional[int],
    lines: List[tuple],
) -> Optional[JournalEntry]:
    """Create a posted JournalEntry. `lines` is a list of
    (account_id, debit, credit, description). Skips silently when any required
    account_id is None — useful before the chart is bootstrapped."""
    valid = [(aid, _round(d), _round(c), desc) for (aid, d, c, desc) in lines if aid]
    if not valid:
        return None
    total_d = sum(d for _a, d, _c, _x in valid)
    total_c = sum(c for _a, _d, c, _x in valid)
    if abs(total_d - total_c) > 0.01:
        # Caller bug — don't post an unbalanced entry.
        raise HTTPException(status_code=500, detail=f"Unbalanced JE: D={total_d} C={total_c}")
    je = JournalEntry(
        entry_number=_next_number(db, JournalEntry, "entry_number", "JE"),
        entry_date=entry_date or datetime.utcnow().strftime("%Y-%m-%d"),
        memo=memo,
        source_type=source_type,
        source_id=source_id,
        is_posted=True,
        created_by=user_id,
    )
    db.add(je)
    db.flush()
    for aid, d, c, desc in valid:
        db.add(JournalLine(entry_id=je.id, account_id=aid, debit=d, credit=c, description=desc))
    return je


def _delete_je_for_source(db: Session, source_type: str, source_id: int) -> None:
    """Remove any JE previously auto-posted for this source — used on update
    so we can re-post fresh. Lines cascade-delete with the entry."""
    for je in db.query(JournalEntry).filter(
        JournalEntry.source_type == source_type, JournalEntry.source_id == source_id
    ).all():
        db.delete(je)
    db.flush()


# ─── Suppliers ────────────────────────────────────────────────────────────────

class SupplierIn(BaseModel):
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    trn: Optional[str] = None
    address: Optional[str] = None
    payment_terms_days: int = 30
    notes: Optional[str] = None
    is_active: bool = True


def _serialize_supplier(s: Supplier) -> dict:
    return {
        "id": s.id, "name": s.name, "contact_name": s.contact_name,
        "email": s.email, "phone": s.phone, "trn": s.trn, "address": s.address,
        "payment_terms_days": s.payment_terms_days, "notes": s.notes,
        "is_active": s.is_active,
    }


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [_serialize_supplier(s) for s in db.query(Supplier).order_by(Supplier.name.asc()).all()]


@router.post("/suppliers")
def create_supplier(payload: SupplierIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = Supplier(**payload.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return _serialize_supplier(s)


@router.patch("/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, payload: SupplierIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    db.commit(); db.refresh(s)
    return _serialize_supplier(s)


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if db.query(Bill).filter(Bill.supplier_id == supplier_id).first():
        raise HTTPException(status_code=400, detail="Cannot delete supplier with bills. Deactivate instead.")
    db.delete(s); db.commit()
    return {"ok": True}


# ─── Bills (AP) ───────────────────────────────────────────────────────────────

class BillLineIn(BaseModel):
    description: str
    expense_account_id: Optional[int] = None
    quantity: float = 1.0
    unit_price: float = 0.0


class BillIn(BaseModel):
    supplier_id: int
    supplier_reference: Optional[str] = None
    status: str = "open"
    currency: str = "AED"
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    vat_rate: float = DEFAULT_VAT_RATE
    notes: Optional[str] = None
    line_items: List[BillLineIn] = []


def _recompute_bill_totals(b: Bill):
    subtotal = 0.0
    for li in b.line_items:
        li.line_total = _round((li.quantity or 0) * (li.unit_price or 0))
        subtotal += li.line_total
    b.subtotal = _round(subtotal)
    b.vat_amount = _round(b.subtotal * (b.vat_rate or 0) / 100.0)
    b.total = _round(b.subtotal + b.vat_amount)


def _reconcile_bill_status(b: Bill):
    paid = _round(sum((p.amount or 0) for p in b.payments))
    b.amount_paid = paid
    if b.status in ("draft", "void"):
        return
    if paid <= 0:
        b.status = "open"
    elif paid + 0.01 < b.total:
        b.status = "partially_paid"
    else:
        b.status = "paid"


def _serialize_bill(b: Bill) -> dict:
    return {
        "id": b.id, "bill_number": b.bill_number, "supplier_id": b.supplier_id,
        "supplier_name": b.supplier.name if b.supplier else None,
        "supplier_reference": b.supplier_reference, "status": b.status,
        "currency": b.currency, "issue_date": b.issue_date, "due_date": b.due_date,
        "subtotal": b.subtotal, "vat_rate": b.vat_rate, "vat_amount": b.vat_amount,
        "total": b.total, "amount_paid": b.amount_paid, "notes": b.notes,
        "line_items": [
            {"id": li.id, "description": li.description,
             "expense_account_id": li.expense_account_id,
             "quantity": li.quantity, "unit_price": li.unit_price, "line_total": li.line_total}
            for li in b.line_items
        ],
        "payments": [
            {"id": p.id, "amount": p.amount, "method": p.method, "paid_at": p.paid_at,
             "reference": p.reference, "bank_account_id": p.bank_account_id}
            for p in b.payments
        ],
    }


def _post_bill_je(db: Session, b: Bill, user_id: Optional[int]):
    """DR each line's expense account (default 5900) + DR VAT Recoverable (1140), CR AP (2110)."""
    if b.status in ("draft", "void"):
        return
    ap_id = _account_id_by_code(db, "2110")
    vat_recov_id = _account_id_by_code(db, "1140")
    default_exp_id = _account_id_by_code(db, "5900")
    if not ap_id:
        return  # chart not bootstrapped; skip auto-post
    lines = []
    for li in b.line_items:
        aid = li.expense_account_id or default_exp_id
        lines.append((aid, li.line_total, 0.0, li.description))
    if b.vat_amount and vat_recov_id:
        lines.append((vat_recov_id, b.vat_amount, 0.0, f"VAT on {b.bill_number}"))
    lines.append((ap_id, 0.0, b.total, f"Bill {b.bill_number} — {b.supplier.name if b.supplier else ''}"))
    _post_je(
        db, source_type="bill", source_id=b.id,
        entry_date=b.issue_date or datetime.utcnow().strftime("%Y-%m-%d"),
        memo=f"Bill {b.bill_number}", user_id=user_id, lines=lines,
    )


@router.get("/bills")
def list_bills(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(Bill).order_by(Bill.id.desc()).all()
    return [_serialize_bill(b) for b in rows]


@router.get("/bills/{bill_id}")
def get_bill(bill_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _serialize_bill(b)


@router.post("/bills")
def create_bill(payload: BillIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(Supplier).filter(Supplier.id == payload.supplier_id).first():
        raise HTTPException(status_code=400, detail="Supplier not found")
    b = Bill(
        bill_number=_next_number(db, Bill, "bill_number", "BILL"),
        supplier_id=payload.supplier_id, supplier_reference=payload.supplier_reference,
        status=payload.status, currency=payload.currency,
        issue_date=payload.issue_date or datetime.utcnow().strftime("%Y-%m-%d"),
        due_date=payload.due_date, vat_rate=payload.vat_rate, notes=payload.notes,
        created_by=user.id,
    )
    db.add(b); db.flush()
    for li in payload.line_items:
        db.add(BillLineItem(bill_id=b.id, **li.model_dump()))
    db.flush()
    db.refresh(b)
    _recompute_bill_totals(b)
    _post_bill_je(db, b, user.id)
    db.commit(); db.refresh(b)
    return _serialize_bill(b)


@router.patch("/bills/{bill_id}")
def update_bill(bill_id: int, payload: BillIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    data = payload.model_dump()
    b.supplier_id = data["supplier_id"]
    b.supplier_reference = data["supplier_reference"]
    b.status = data["status"]
    b.currency = data["currency"]
    b.issue_date = data["issue_date"] or b.issue_date
    b.due_date = data["due_date"]
    b.vat_rate = data["vat_rate"]
    b.notes = data["notes"]
    # Replace line items wholesale (simpler than diffing for an MVP)
    for li in list(b.line_items):
        db.delete(li)
    db.flush()
    for li_in in data["line_items"]:
        db.add(BillLineItem(bill_id=b.id, **li_in))
    db.flush(); db.refresh(b)
    _recompute_bill_totals(b)
    _reconcile_bill_status(b)
    _delete_je_for_source(db, "bill", b.id)
    _post_bill_je(db, b, user.id)
    db.commit(); db.refresh(b)
    return _serialize_bill(b)


@router.delete("/bills/{bill_id}")
def delete_bill(bill_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    _delete_je_for_source(db, "bill", b.id)
    for p in list(b.payments):
        _delete_je_for_source(db, "supplier_payment", p.id)
    db.delete(b); db.commit()
    return {"ok": True}


# ─── Supplier Payments ────────────────────────────────────────────────────────

class SupplierPaymentIn(BaseModel):
    amount: float
    currency: str = "AED"
    method: str = "bank_transfer"
    bank_account_id: Optional[int] = None
    reference: Optional[str] = None
    paid_at: Optional[str] = None


def _post_supplier_payment_je(db: Session, p: SupplierPayment, bill: Bill, user_id: Optional[int]):
    ap_id = _account_id_by_code(db, "2110")
    bank_coa_id = _bank_coa_account_id(db, p.bank_account_id)
    if not ap_id or not bank_coa_id:
        return
    _post_je(
        db, source_type="supplier_payment", source_id=p.id,
        entry_date=p.paid_at or datetime.utcnow().strftime("%Y-%m-%d"),
        memo=f"Payment for {bill.bill_number}", user_id=user_id,
        lines=[
            (ap_id, p.amount, 0.0, f"Pay {bill.bill_number}"),
            (bank_coa_id, 0.0, p.amount, p.reference or "Supplier payment"),
        ],
    )


@router.post("/bills/{bill_id}/payments")
def record_supplier_payment(
    bill_id: int, payload: SupplierPaymentIn,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    p = SupplierPayment(
        bill_id=b.id, amount=_round(payload.amount), currency=payload.currency,
        method=payload.method, bank_account_id=payload.bank_account_id,
        reference=payload.reference,
        paid_at=payload.paid_at or datetime.utcnow().strftime("%Y-%m-%d"),
        recorded_by=user.id,
    )
    db.add(p); db.flush()
    _reconcile_bill_status(b)
    _post_supplier_payment_je(db, p, b, user.id)
    db.commit(); db.refresh(b)
    return _serialize_bill(b)


@router.delete("/bills/{bill_id}/payments/{payment_id}")
def delete_supplier_payment(
    bill_id: int, payment_id: int,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    p = db.query(SupplierPayment).filter(SupplierPayment.id == payment_id, SupplierPayment.bill_id == bill_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    _delete_je_for_source(db, "supplier_payment", p.id)
    bill = p.bill
    db.delete(p); db.flush()
    _reconcile_bill_status(bill)
    db.commit(); db.refresh(bill)
    return _serialize_bill(bill)


# ─── Direct Expenses ──────────────────────────────────────────────────────────

class ExpenseIn(BaseModel):
    expense_date: str
    description: str
    expense_account_id: Optional[int] = None
    bank_account_id: Optional[int] = None
    supplier_id: Optional[int] = None
    amount: float = 0.0                       # net (pre-VAT)
    vat_rate: float = 0.0
    currency: str = "AED"
    payment_method: str = "cash"
    reference: Optional[str] = None
    notes: Optional[str] = None


def _recompute_expense_totals(e: Expense):
    e.amount = _round(e.amount)
    e.vat_amount = _round(e.amount * (e.vat_rate or 0) / 100.0)
    e.total = _round(e.amount + e.vat_amount)


def _serialize_expense(e: Expense) -> dict:
    return {
        "id": e.id, "expense_date": e.expense_date, "description": e.description,
        "expense_account_id": e.expense_account_id,
        "expense_account_code": e.expense_account.code if e.expense_account else None,
        "expense_account_name": e.expense_account.name if e.expense_account else None,
        "bank_account_id": e.bank_account_id,
        "bank_account_name": e.bank_account.name if e.bank_account else None,
        "supplier_id": e.supplier_id,
        "supplier_name": e.supplier.name if e.supplier else None,
        "amount": e.amount, "vat_rate": e.vat_rate, "vat_amount": e.vat_amount,
        "total": e.total, "currency": e.currency,
        "payment_method": e.payment_method, "reference": e.reference, "notes": e.notes,
    }


def _post_expense_je(db: Session, e: Expense, user_id: Optional[int]):
    """DR expense_account (default 5900) + DR VAT Recoverable (1140) for VAT,
    CR bank_account_id's CoA mirror (default 1110 Cash)."""
    exp_id = e.expense_account_id or _account_id_by_code(db, "5900")
    vat_recov_id = _account_id_by_code(db, "1140")
    bank_coa_id = _bank_coa_account_id(db, e.bank_account_id)
    if not exp_id or not bank_coa_id:
        return
    lines = [(exp_id, e.amount, 0.0, e.description)]
    if e.vat_amount and vat_recov_id:
        lines.append((vat_recov_id, e.vat_amount, 0.0, "Input VAT"))
    lines.append((bank_coa_id, 0.0, e.total, e.reference or e.description))
    _post_je(
        db, source_type="expense", source_id=e.id,
        entry_date=e.expense_date, memo=e.description[:200],
        user_id=user_id, lines=lines,
    )


@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(Expense).order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    return [_serialize_expense(e) for e in rows]


@router.post("/expenses")
def create_expense(payload: ExpenseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    e = Expense(**payload.model_dump(), created_by=user.id)
    _recompute_expense_totals(e)
    db.add(e); db.flush()
    _post_expense_je(db, e, user.id)
    db.commit(); db.refresh(e)
    return _serialize_expense(e)


@router.patch("/expenses/{expense_id}")
def update_expense(expense_id: int, payload: ExpenseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    for k, v in payload.model_dump().items():
        setattr(e, k, v)
    _recompute_expense_totals(e)
    _delete_je_for_source(db, "expense", e.id)
    _post_expense_je(db, e, user.id)
    db.commit(); db.refresh(e)
    return _serialize_expense(e)


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    _delete_je_for_source(db, "expense", e.id)
    db.delete(e); db.commit()
    return {"ok": True}

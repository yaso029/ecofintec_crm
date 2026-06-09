"""Manual Journal Entries.

Lets accountants record direct DR/CR entries — opening balances, corrections,
period-end adjustments. Auto-posted entries (from expenses, bills, payments)
are listed here read-only (filterable by source_type).
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.database.db import get_db
from backend.database.models import JournalEntry, JournalLine, Account, User
from backend.services.auth_service import get_current_user
from backend.api.accounting_purchases import _next_number, _round

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


class JournalLineIn(BaseModel):
    account_id: int
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0


class JournalEntryIn(BaseModel):
    entry_date: str
    memo: Optional[str] = None
    reference: Optional[str] = None
    lines: List[JournalLineIn]


def _serialize_je(je: JournalEntry) -> dict:
    return {
        "id": je.id, "entry_number": je.entry_number, "entry_date": je.entry_date,
        "memo": je.memo, "reference": je.reference,
        "source_type": je.source_type, "source_id": je.source_id,
        "is_posted": je.is_posted,
        "total_debit": _round(sum((l.debit or 0) for l in je.lines)),
        "total_credit": _round(sum((l.credit or 0) for l in je.lines)),
        "lines": [
            {
                "id": l.id, "account_id": l.account_id,
                "account_code": l.account.code if l.account else None,
                "account_name": l.account.name if l.account else None,
                "description": l.description, "debit": l.debit, "credit": l.credit,
            }
            for l in je.lines
        ],
    }


@router.get("/journal-entries")
def list_journal_entries(
    source_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(JournalEntry)
    if source_type:
        q = q.filter(JournalEntry.source_type == source_type)
    rows = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).all()
    return [_serialize_je(je) for je in rows]


@router.get("/journal-entries/{entry_id}")
def get_journal_entry(entry_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    je = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not je:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return _serialize_je(je)


@router.post("/journal-entries")
def create_journal_entry(payload: JournalEntryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not payload.lines or len(payload.lines) < 2:
        raise HTTPException(status_code=400, detail="At least two lines required")
    total_d = _round(sum(l.debit for l in payload.lines))
    total_c = _round(sum(l.credit for l in payload.lines))
    if abs(total_d - total_c) > 0.01:
        raise HTTPException(status_code=400, detail=f"Entry is unbalanced: debits={total_d}, credits={total_c}")
    if total_d <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than zero")
    for li in payload.lines:
        if not db.query(Account).filter(Account.id == li.account_id).first():
            raise HTTPException(status_code=400, detail=f"Account {li.account_id} not found")
        if (li.debit or 0) > 0 and (li.credit or 0) > 0:
            raise HTTPException(status_code=400, detail="A line can't have both debit and credit > 0")
    je = JournalEntry(
        entry_number=_next_number(db, JournalEntry, "entry_number", "JE"),
        entry_date=payload.entry_date or datetime.utcnow().strftime("%Y-%m-%d"),
        memo=payload.memo, reference=payload.reference,
        source_type="manual", is_posted=True, created_by=user.id,
    )
    db.add(je); db.flush()
    for li in payload.lines:
        db.add(JournalLine(
            entry_id=je.id, account_id=li.account_id, description=li.description,
            debit=_round(li.debit), credit=_round(li.credit),
        ))
    db.commit(); db.refresh(je)
    return _serialize_je(je)


@router.delete("/journal-entries/{entry_id}")
def delete_journal_entry(entry_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    je = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not je:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if je.source_type != "manual":
        raise HTTPException(
            status_code=400,
            detail=f"Auto-posted entry (source={je.source_type}). Delete the source record instead.",
        )
    db.delete(je); db.commit()
    return {"ok": True}

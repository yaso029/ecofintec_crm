"""Accounting Reports — P&L, Balance Sheet, Cash Flow.

All three roll up the same source of truth: posted JournalLines aggregated by
Account.type / sub_type. Date filters apply to the parent JournalEntry's
entry_date. Cash Flow uses a simplified indirect-method approach: net income +
changes in working capital, but for an MVP we report cash movements directly
from the bank/cash CoA accounts (cash-basis) which is what most small UAE
practices actually want to see.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from backend.database.db import get_db
from backend.database.models import Account, JournalEntry, JournalLine, User
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/accounting/reports", tags=["accounting"])


def _round(x: float) -> float:
    return round(float(x or 0), 2)


def _account_totals(db: Session, start: Optional[str], end: Optional[str]) -> dict[int, dict]:
    """Return {account_id: {debit, credit, balance}} for all journal lines within
    the optional date window. `balance` is debit − credit (raw sign)."""
    q = (
        db.query(
            JournalLine.account_id,
            func.coalesce(func.sum(JournalLine.debit), 0.0).label("d"),
            func.coalesce(func.sum(JournalLine.credit), 0.0).label("c"),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .filter(JournalEntry.is_posted == True)  # noqa: E712
    )
    if start:
        q = q.filter(JournalEntry.entry_date >= start)
    if end:
        q = q.filter(JournalEntry.entry_date <= end)
    q = q.group_by(JournalLine.account_id)
    out = {}
    for aid, d, c in q.all():
        out[int(aid)] = {"debit": _round(d), "credit": _round(c), "balance": _round(float(d) - float(c))}
    return out


def _classify(accounts: list[Account], totals: dict[int, dict]) -> dict[str, list]:
    """Group accounts by `type` with their net amount expressed in the natural
    sign for that type (assets/expenses positive when DR>CR, the rest flipped)."""
    groups: dict[str, list] = {"asset": [], "liability": [], "equity": [], "income": [], "expense": []}
    for a in accounts:
        t = totals.get(a.id, {"debit": 0.0, "credit": 0.0, "balance": 0.0})
        if a.type in ("asset", "expense"):
            amount = t["balance"]                  # DR positive
        else:
            amount = -t["balance"]                 # CR positive
        if a.type not in groups:
            continue
        groups[a.type].append({
            "id": a.id, "code": a.code, "name": a.name, "sub_type": a.sub_type,
            "parent_id": a.parent_id, "amount": _round(amount),
        })
    return groups


# ─── Profit & Loss ────────────────────────────────────────────────────────────

@router.get("/profit-loss")
def profit_and_loss(
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    accounts = db.query(Account).order_by(Account.code).all()
    totals = _account_totals(db, start, end)
    groups = _classify(accounts, totals)
    income_rows = [r for r in groups["income"] if r["amount"] != 0]
    expense_rows = [r for r in groups["expense"] if r["amount"] != 0]
    total_income = _round(sum(r["amount"] for r in groups["income"]))
    total_expense = _round(sum(r["amount"] for r in groups["expense"]))
    net = _round(total_income - total_expense)
    return {
        "period": {"start": start, "end": end},
        "income": income_rows,
        "expenses": expense_rows,
        "total_income": total_income,
        "total_expenses": total_expense,
        "net_profit": net,
    }


# ─── Balance Sheet ────────────────────────────────────────────────────────────

@router.get("/balance-sheet")
def balance_sheet(
    as_of: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    accounts = db.query(Account).order_by(Account.code).all()
    # Balance sheet is cumulative up to `as_of` — no start bound.
    totals = _account_totals(db, start=None, end=as_of)
    groups = _classify(accounts, totals)

    # Retained earnings = net income to date (income − expense). Reported as a
    # synthetic equity row so the sheet balances even without a year-end close.
    total_income = sum(r["amount"] for r in groups["income"])
    total_expense = sum(r["amount"] for r in groups["expense"])
    retained = _round(total_income - total_expense)

    assets = [r for r in groups["asset"] if r["amount"] != 0]
    liabilities = [r for r in groups["liability"] if r["amount"] != 0]
    equity = [r for r in groups["equity"] if r["amount"] != 0]
    if retained != 0:
        equity.append({
            "id": None, "code": "RE-YTD", "name": "Net Income (Current Period)",
            "sub_type": "retained_earnings", "parent_id": None, "amount": retained,
        })

    total_assets = _round(sum(r["amount"] for r in assets))
    total_liabilities = _round(sum(r["amount"] for r in liabilities))
    total_equity = _round(sum(r["amount"] for r in equity))
    return {
        "as_of": as_of,
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "liabilities_plus_equity": _round(total_liabilities + total_equity),
        "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.02,
    }


# ─── Cash Flow ────────────────────────────────────────────────────────────────
# Cash-basis: aggregate movements on bank/cash CoA accounts (sub_type in
# {"bank","cash"}) over the period, broken down by counterparty account type
# (operating from income/expense, financing from equity, etc.).

@router.get("/cash-flow")
def cash_flow(
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cash_account_ids = [
        a.id for a in db.query(Account).filter(
            Account.type == "asset",
            Account.sub_type.in_(["bank", "cash"]),
        ).all()
    ]
    if not cash_account_ids:
        return {
            "period": {"start": start, "end": end},
            "operating": 0.0, "investing": 0.0, "financing": 0.0,
            "net_cash_change": 0.0, "movements": [],
        }

    # Walk every JE that touches a cash account; for each such entry, the cash
    # side's net delta is `Σdebit − Σcredit` on the cash legs, and the
    # counterparty leg's account_type tells us which section it belongs in.
    type_section = {
        "income": "operating", "expense": "operating",
        "asset": "investing", "liability": "financing", "equity": "financing",
    }

    je_q = (
        db.query(JournalEntry)
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .filter(JournalLine.account_id.in_(cash_account_ids))
        .filter(JournalEntry.is_posted == True)  # noqa: E712
    )
    if start:
        je_q = je_q.filter(JournalEntry.entry_date >= start)
    if end:
        je_q = je_q.filter(JournalEntry.entry_date <= end)
    je_ids = {je.id for je in je_q.distinct().all()}

    sections = {"operating": 0.0, "investing": 0.0, "financing": 0.0}
    movements = []
    for je_id in je_ids:
        je = db.query(JournalEntry).filter(JournalEntry.id == je_id).first()
        if not je:
            continue
        cash_delta = 0.0
        cp_types: dict[str, float] = {}
        for line in je.lines:
            if line.account_id in cash_account_ids:
                cash_delta += (line.debit or 0) - (line.credit or 0)
            else:
                other_amt = (line.credit or 0) - (line.debit or 0)
                # other_amt > 0 means cash came in from this source (credit on the
                # counterparty side mirrors the debit to cash).
                acc = db.query(Account).filter(Account.id == line.account_id).first()
                if acc:
                    cp_types[acc.type] = cp_types.get(acc.type, 0.0) + other_amt
        # Distribute the cash delta across counterparty types proportionally.
        # In practice nearly every auto-posted JE has exactly one non-cash type,
        # so this is a no-op weighted sum 99% of the time.
        if abs(cash_delta) < 0.001 or not cp_types:
            continue
        total_other = sum(abs(v) for v in cp_types.values()) or 1.0
        for acc_type, amt in cp_types.items():
            weight = abs(amt) / total_other
            slice_amt = _round(cash_delta * weight * (1 if amt >= 0 else -1) / max(1, sum(1 if v >= 0 else -1 for v in cp_types.values()) or 1))
            section = type_section.get(acc_type, "operating")
            sections[section] += slice_amt
        movements.append({
            "entry_id": je.id, "entry_number": je.entry_number,
            "entry_date": je.entry_date, "memo": je.memo,
            "cash_delta": _round(cash_delta),
        })

    net = _round(sum(sections.values()))
    return {
        "period": {"start": start, "end": end},
        "operating": _round(sections["operating"]),
        "investing": _round(sections["investing"]),
        "financing": _round(sections["financing"]),
        "net_cash_change": net,
        "movements": sorted(movements, key=lambda m: m["entry_date"]),
    }


# ─── VAT Return ───────────────────────────────────────────────────────────────
# Output VAT (sales) = credit balance on "VAT Payable" (2120) over the period.
# Input VAT (purchases) = debit balance on "VAT Recoverable" (1140) over the period.
# Net VAT due = Output − Input (positive = pay to FTA; negative = recoverable).

@router.get("/vat-return")
def vat_return(
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    totals = _account_totals(db, start, end)

    vat_payable = db.query(Account).filter(Account.code == "2120").first()
    vat_recov = db.query(Account).filter(Account.code == "1140").first()

    # Output VAT (liability — natural credit balance)
    output_vat = 0.0
    if vat_payable:
        t = totals.get(vat_payable.id, {"debit": 0.0, "credit": 0.0})
        output_vat = _round(float(t["credit"]) - float(t["debit"]))

    # Input VAT (asset — natural debit balance)
    input_vat = 0.0
    if vat_recov:
        t = totals.get(vat_recov.id, {"debit": 0.0, "credit": 0.0})
        input_vat = _round(float(t["debit"]) - float(t["credit"]))

    # Sales / purchases bases — sum lines on revenue / expense accounts within
    # the same window, so the report shows the taxable bases alongside the VAT
    # numbers (useful for FTA-style return preparation).
    sales_base = 0.0
    purchases_base = 0.0
    for a in db.query(Account).all():
        t = totals.get(a.id)
        if not t:
            continue
        if a.type == "income":
            sales_base += float(t["credit"]) - float(t["debit"])
        elif a.type == "expense":
            purchases_base += float(t["debit"]) - float(t["credit"])

    net = _round(output_vat - input_vat)
    return {
        "period": {"start": start, "end": end},
        "currency": "AED",
        "sales_base": _round(sales_base),
        "purchases_base": _round(purchases_base),
        "output_vat": output_vat,
        "input_vat": input_vat,
        "net_vat_payable": net,
        "direction": "due_to_fta" if net > 0 else ("refundable" if net < 0 else "nil"),
    }


# ─── Dashboard summary (for the Accounting module home page) ─────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from backend.database.models import Bill, Expense, BankAccount, Supplier
    open_bills = db.query(Bill).filter(Bill.status.in_(["open", "partially_paid"])).count()
    total_payables = _round(sum(
        (b.total - b.amount_paid) for b in db.query(Bill).filter(Bill.status.in_(["open", "partially_paid"])).all()
    ))
    expense_count = db.query(Expense).count()
    suppliers_count = db.query(Supplier).filter(Supplier.is_active == True).count()  # noqa
    bank_accounts = db.query(BankAccount).filter(BankAccount.is_active == True).all()  # noqa
    cash_total = 0.0
    for ba in bank_accounts:
        bal = ba.opening_balance or 0
        if ba.coa_account_id:
            row = db.query(
                func.coalesce(func.sum(JournalLine.debit), 0.0),
                func.coalesce(func.sum(JournalLine.credit), 0.0),
            ).filter(JournalLine.account_id == ba.coa_account_id).one()
            bal += float(row[0]) - float(row[1])
        cash_total += bal
    return {
        "open_bills": open_bills,
        "total_payables": total_payables,
        "expenses_count": expense_count,
        "suppliers_count": suppliers_count,
        "bank_accounts_count": len(bank_accounts),
        "cash_on_hand": _round(cash_total),
    }

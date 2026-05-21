"""Phase 7 — deterministic UAE tax/compliance checklist.

Pure rules, no AI, no network: builds a per-client compliance checklist and the
next upcoming filing deadlines from the client profile (TRN, CT registration,
ESR flag, fiscal year end) and their services.

NOT legal/tax advice — these are workflow reminders. UAE rules change; staff must
confirm against current FTA guidance. The disclaimer is returned with the result.
"""
import calendar
from datetime import date

DISCLAIMER = (
    "These are workflow reminders generated from the client profile, not tax or "
    "legal advice. UAE FTA rules and deadlines change — always confirm the "
    "client's assigned tax periods and current requirements with the FTA."
)

# VAT mandatory / voluntary registration thresholds (AED)
VAT_MANDATORY_THRESHOLD = 375_000
VAT_VOLUNTARY_THRESHOLD = 187_500


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    year = d.year + m // 12
    month = m % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _fy_end_candidates(today: date, month: int, day: int):
    for y in (today.year - 1, today.year, today.year + 1):
        last = calendar.monthrange(y, month)[1]
        yield date(y, month, min(day, last))


def _next_deadline_from_fy(today: date, month: int, day: int, months_after: int) -> date:
    cands = sorted(_add_months(e, months_after) for e in _fy_end_candidates(today, month, day))
    for c in cands:
        if c >= today:
            return c
    return cands[-1]


def _next_vat_quarter_due(today: date) -> date:
    """Next standard quarterly VAT return deadline (28th of the month after the
    quarter end). Assumes a standard calendar-quarter tax period."""
    quarter_end_months = [3, 6, 9, 12]
    cands = []
    for y in (today.year, today.year + 1):
        for qm in quarter_end_months:
            due_month = 1 if qm == 12 else qm + 1
            due_year = y + 1 if qm == 12 else y
            cands.append(date(due_year, due_month, 28))
    cands.sort()
    for c in cands:
        if c >= today:
            return c
    return cands[-1]


def _item(key, title, category, status, detail, due_date=None):
    return {"key": key, "title": title, "category": category, "status": status,
            "detail": detail, "due_date": due_date.isoformat() if due_date else None}


def build_checklist(client, services=None) -> dict:
    """client: ORM Client. services: list of ORM Service (optional)."""
    today = date.today()
    services = services or []
    items = []

    fy_m = client.fiscal_year_end_month or 12
    fy_d = client.fiscal_year_end_day or 31

    # ── VAT ────────────────────────────────────────────────────────────────────
    if client.trn:
        items.append(_item(
            "vat_registration", "VAT registered", "registration", "ok",
            f"TRN on file: {client.trn}.",
        ))
        items.append(_item(
            "vat_return", "VAT return filing", "deadline", "upcoming",
            "Standard quarterly VAT return — due by the 28th of the month following "
            "the tax period. Confirm the client's FTA-assigned period.",
            due_date=_next_vat_quarter_due(today),
        ))
    else:
        items.append(_item(
            "vat_registration", "VAT registration not confirmed", "recommendation", "action_needed",
            f"No TRN on file. VAT registration is mandatory once taxable supplies exceed "
            f"AED {VAT_MANDATORY_THRESHOLD:,} (voluntary above AED {VAT_VOLUNTARY_THRESHOLD:,}). "
            "Confirm whether this client must register.",
        ))

    # ── Corporate Tax (9%) ──────────────────────────────────────────────────────
    ct_deadline = _next_deadline_from_fy(today, fy_m, fy_d, 9)
    if client.ct_registration_number:
        items.append(_item(
            "ct_registration", "Corporate Tax registered", "registration", "ok",
            f"CT registration number on file: {client.ct_registration_number}.",
        ))
    else:
        items.append(_item(
            "ct_registration", "Corporate Tax registration not confirmed", "recommendation", "action_needed",
            "No CT registration number on file. UAE Corporate Tax registration is "
            "required for taxable persons — confirm the client is registered with the FTA.",
        ))
    items.append(_item(
        "ct_return", "Corporate Tax return filing", "deadline", "upcoming",
        "CT return and payment are due within 9 months of the financial year-end "
        f"(FY end {calendar.month_abbr[fy_m]} {fy_d}).",
        due_date=ct_deadline,
    ))

    # ── ESR ─────────────────────────────────────────────────────────────────────
    if client.esr_applicable:
        items.append(_item(
            "esr_notification", "ESR notification", "deadline", "info",
            "If ESR applies for the period, the notification is due within 6 months "
            "of the financial year-end. Note: ESR was repealed for financial years "
            "ending after 31 Dec 2022 — verify applicability.",
            due_date=_next_deadline_from_fy(today, fy_m, fy_d, 6),
        ))
        items.append(_item(
            "esr_report", "ESR report", "deadline", "info",
            "Where applicable, the ESR report is due within 12 months of the "
            "financial year-end. Verify current applicability with the FTA.",
            due_date=_next_deadline_from_fy(today, fy_m, fy_d, 12),
        ))

    # ── Audit / financial statements (from services) ────────────────────────────
    svc_types = {s.service_type for s in services}
    if "audit" in svc_types or "financial_statements" in svc_types:
        items.append(_item(
            "financial_statements", "Annual financial statements", "filing", "upcoming",
            "Prepare annual financial statements for the financial year-end "
            f"({calendar.month_abbr[fy_m]} {fy_d}).",
            due_date=_next_deadline_from_fy(today, fy_m, fy_d, 0),
        ))

    # ── Trade licence ────────────────────────────────────────────────────────────
    if client.trade_license_number:
        items.append(_item(
            "trade_license", "Trade licence renewal", "info", "info",
            f"Trade licence {client.trade_license_number} "
            f"({client.trade_license_emirate or 'emirate not set'}) renews annually — "
            "verify the expiry date and renew on time.",
        ))

    counts = {
        "action_needed": sum(1 for i in items if i["status"] == "action_needed"),
        "upcoming": sum(1 for i in items if i["status"] == "upcoming"),
        "ok": sum(1 for i in items if i["status"] == "ok"),
        "info": sum(1 for i in items if i["status"] == "info"),
    }
    return {
        "client_id": client.id,
        "company_name": client.company_name,
        "generated_at": today.isoformat(),
        "items": items,
        "counts": counts,
        "disclaimer": DISCLAIMER,
    }

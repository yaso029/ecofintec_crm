"""Centralized permission matrix for Phase 3 RBAC.

Single source of truth for what each role can do on each resource. Used by:
- FastAPI dependency `require_permission(resource, action)` (auth_service.py)
- `/api/me/permissions` endpoint (api/auth.py)
- Query scoping helpers in api/clients.py, api/services.py, api/tasks.py

Resources are short identifiers ("clients", "leads", "users", etc.). Actions
are typically "read", "create", "update", "delete", with "assign" for routes
that reassign owners.

Service-scoped roles (payroll_specialist, tax_consultant) additionally only
see services of certain types, controlled by SERVICE_TYPE_SCOPE.
"""
from typing import Optional, Set

# ─── Resources & actions ──────────────────────────────────────────────────────

RESOURCES = (
    "clients", "services", "tasks", "documents", "invoices", "leads", "users",
    "partners", "commissions", "hr", "calendar", "ecards",
    "whatsapp", "email", "notifications", "settings",
)

# ─── Permission matrix ────────────────────────────────────────────────────────
# matrix[role][resource] = set of actions (or "*" string for all)

_ALL = "*"  # shorthand for "all actions on this resource"

PERMISSIONS: dict[str, dict[str, object]] = {
    "admin": {r: _ALL for r in RESOURCES},

    "senior_accountant": {
        "clients":      {"read", "create", "update", "assign"},
        "services":     {"read", "create", "update", "assign"},
        "tasks":        {"read", "create", "update", "delete", "assign"},
        "documents":    {"read", "create", "update", "delete"},
        "invoices":     {"read", "create", "update", "delete"},
        "leads":        {"read", "create", "update", "assign", "convert"},
        "partners":     {"read"},
        "commissions":  {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "whatsapp":     {"read"},
        "email":        {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "accountant": {
        "clients":      {"read", "create", "update"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read", "create", "update"},
        "leads":        {"read", "create", "update", "convert"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "auditor": {
        # Read-only across the firm. May update tasks they're assigned (workflow).
        "clients":      {"read"},
        "services":     {"read"},
        "tasks":        {"read", "update"},
        "documents":    {"read"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "partners":     {"read"},
        "commissions":  {"read"},
        "calendar":     {"read"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "payroll_specialist": {
        # Same shape as accountant, but service visibility filtered to "payroll"
        # via SERVICE_TYPE_SCOPE below.
        "clients":      {"read"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "tax_consultant": {
        # Service visibility filtered to vat_filing / corporate_tax / tax_consultation
        "clients":      {"read"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "hr_admin": {
        "hr":           _ALL,
        "ecards":       _ALL,
        "calendar":     {"read", "create", "update"},
        "notifications": {"read"},
        "settings":     {"read"},
    },
}

# Roles that only see services of certain types (and their parent clients).
# None or empty means "all service types".
SERVICE_TYPE_SCOPE: dict[str, Optional[list[str]]] = {
    "payroll_specialist": ["payroll"],
    "tax_consultant":     ["vat_filing", "corporate_tax", "tax_consultation"],
}


# ─── API ──────────────────────────────────────────────────────────────────────

def can(role: str, resource: str, action: str) -> bool:
    """Return True if the role is permitted to perform `action` on `resource`."""
    if not role:
        return False
    role_perms = PERMISSIONS.get(role, {})
    actions = role_perms.get(resource)
    if actions is None:
        return False
    if actions == _ALL:
        return True
    return action in actions


def permissions_for(role: str) -> dict[str, list[str]]:
    """Flat permission map for the frontend: { resource: [actions] }.
    Expands the "*" shorthand into the canonical action set."""
    canonical_actions = ["read", "create", "update", "delete", "assign", "convert"]
    out: dict[str, list[str]] = {}
    for resource, actions in PERMISSIONS.get(role, {}).items():
        if actions == _ALL:
            out[resource] = list(canonical_actions)
        else:
            out[resource] = sorted(actions)
    return out


def service_type_scope(role: str) -> Optional[list[str]]:
    """Return the list of service_types this role can see, or None for all."""
    return SERVICE_TYPE_SCOPE.get(role)


ALL_ROLES = list(PERMISSIONS.keys())

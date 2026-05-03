"""
auth.py
═══════════════════════════════════════════════════════════════
Manages user identity and role resolution against Azure SQL.

Tables (all prefixed with "Navigator"):
  NavigatorAdmins  — pre-seeded by the admin; anyone whose email
                     appears here is treated as ADMIN.
  NavigatorUsers   — auto-populated on first login for anyone
                     whose email is NOT in NavigatorAdmins.

Flow:
  identify_user(email)
    1. Look up email in NavigatorAdmins  → role = "admin"
    2. Look up email in NavigatorUsers   → role = "user"
    3. If not found anywhere             → insert into NavigatorUsers
                                           role = "user"
    Returns: { "email": ..., "role": "admin"|"user", "name": ... }

Permissions (used by the frontend):
  ADMIN  can see: Scenario Review, Scenario Log, Analytics,
                  View Feedback, Tools Change Log, Upload Policy,
                  Register Scenario
  USER   can see: Scenario Library, Suggest a Scenario,
                  Feedback Form, Home
═══════════════════════════════════════════════════════════════
"""

import os
import struct
import pyodbc
from datetime import datetime, timezone


# ── connection string built from .env vars ─────────────────────
def _get_conn() -> pyodbc.Connection:
    server   = os.getenv("AZURE_SQL_SERVER",   "")
    database = os.getenv("AZURE_SQL_DATABASE", "")
    username = os.getenv("AZURE_SQL_USERNAME", "")
    password = os.getenv("AZURE_SQL_PASSWORD", "")

    conn_str = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
        "Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)


# ── create tables if they don't exist ─────────────────────────
def init_navigator_tables() -> None:
    """
    Called once at startup (from main.py lifespan).
    Creates NavigatorAdmins and NavigatorUsers if they don't exist.
    """
    try:
        conn = _get_conn()
        cur  = conn.cursor()

        cur.execute("""
            IF NOT EXISTS (
                SELECT 1 FROM sys.tables WHERE name = 'NavigatorAdmins'
            )
            CREATE TABLE NavigatorAdmins (
                id          INT IDENTITY(1,1) PRIMARY KEY,
                email       NVARCHAR(255) NOT NULL UNIQUE,
                name        NVARCHAR(255) DEFAULT '',
                added_at    DATETIME2     DEFAULT GETUTCDATE()
            );
        """)

        cur.execute("""
            IF NOT EXISTS (
                SELECT 1 FROM sys.tables WHERE name = 'NavigatorUsers'
            )
            CREATE TABLE NavigatorUsers (
                id            INT IDENTITY(1,1) PRIMARY KEY,
                email         NVARCHAR(255) NOT NULL UNIQUE,
                name          NVARCHAR(255) DEFAULT '',
                first_seen_at DATETIME2     DEFAULT GETUTCDATE(),
                last_seen_at  DATETIME2     DEFAULT GETUTCDATE()
            );
        """)

        conn.commit()
        conn.close()
        print("[auth] NavigatorAdmins and NavigatorUsers tables ready.")
    except Exception as e:
        print(f"[auth] WARNING: Could not initialise Azure SQL tables: {e}")


# ── core identify function ─────────────────────────────────────
def identify_user(email: str) -> dict:
    """
    Resolve role for the given email.

    Returns:
        {
            "email": "...",
            "role":  "admin" | "user",
            "name":  "...",         # empty string if not recorded
        }

    Raises:
        Exception — caller should handle and return 500.
    """
    email = email.strip().lower()
    if not email:
        raise ValueError("Email must not be empty.")

    conn = _get_conn()
    cur  = conn.cursor()

    try:
        # 1. Check admin table
        cur.execute(
            "SELECT email, name FROM NavigatorAdmins WHERE LOWER(email) = ?",
            (email,)
        )
        row = cur.fetchone()
        if row:
            return {"email": row[0], "role": "admin", "name": row[1] or ""}

        # 2. Check user table
        cur.execute(
            "SELECT email, name FROM NavigatorUsers WHERE LOWER(email) = ?",
            (email,)
        )
        row = cur.fetchone()
        if row:
            # Update last_seen_at
            cur.execute(
                "UPDATE NavigatorUsers SET last_seen_at = ? WHERE LOWER(email) = ?",
                (datetime.now(timezone.utc), email)
            )
            conn.commit()
            return {"email": row[0], "role": "user", "name": row[1] or ""}

        # 3. New user — insert into NavigatorUsers
        now = datetime.now(timezone.utc)
        cur.execute(
            """
            INSERT INTO NavigatorUsers (email, name, first_seen_at, last_seen_at)
            VALUES (?, '', ?, ?)
            """,
            (email, now, now)
        )
        conn.commit()
        return {"email": email, "role": "user", "name": ""}

    finally:
        conn.close()


# ── admin management helpers ───────────────────────────────────
def list_admins() -> list[dict]:
    """Return all rows in NavigatorAdmins."""
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT id, email, name, added_at FROM NavigatorAdmins ORDER BY added_at DESC")
    rows = cur.fetchall()
    conn.close()
    return [
        {"id": r[0], "email": r[1], "name": r[2], "added_at": str(r[3])}
        for r in rows
    ]


def add_admin(email: str, name: str = "") -> dict:
    """Insert a new admin (or ignore if already exists)."""
    email = email.strip().lower()
    conn  = _get_conn()
    cur   = conn.cursor()
    cur.execute(
        """
        IF NOT EXISTS (SELECT 1 FROM NavigatorAdmins WHERE LOWER(email) = ?)
            INSERT INTO NavigatorAdmins (email, name) VALUES (?, ?)
        """,
        (email, email, name.strip())
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "email": email}


def remove_admin(email: str) -> dict:
    """Remove an admin by email."""
    email = email.strip().lower()
    conn  = _get_conn()
    cur   = conn.cursor()
    cur.execute("DELETE FROM NavigatorAdmins WHERE LOWER(email) = ?", (email,))
    conn.commit()
    conn.close()
    return {"status": "ok", "email": email}


def list_users(page: int = 1, per_page: int = 50) -> dict:
    """Return paginated NavigatorUsers rows."""
    conn   = _get_conn()
    cur    = conn.cursor()
    offset = (page - 1) * per_page
    cur.execute("SELECT COUNT(*) FROM NavigatorUsers")
    total = cur.fetchone()[0]
    cur.execute(
        """
        SELECT id, email, name, first_seen_at, last_seen_at
        FROM NavigatorUsers
        ORDER BY last_seen_at DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """,
        (offset, per_page)
    )
    rows = cur.fetchall()
    conn.close()
    return {
        "total": total,
        "page":  page,
        "items": [
            {
                "id":            r[0],
                "email":         r[1],
                "name":          r[2],
                "first_seen_at": str(r[3]),
                "last_seen_at":  str(r[4]),
            }
            for r in rows
        ],
    }


# ── permission map (used by the frontend) ─────────────────────
PERMISSIONS = {
    "admin": [
        "home",
        "promptlibrary",
        "tools",
        "history",
        "analytics",
        "policies",
        "admin-scenarios",
        "feedback-view",
        "register-scenario",
        "register-tool",
        "suggest-scenario",
        "feedback-form",
        "toggle-menu",
    ],
    "user": [
        "home",
        "promptlibrary",
        "tools",
        "history",
        "suggest-scenario",
        "feedback-form",
    ],
}


def get_permissions(role: str) -> list[str]:
    return PERMISSIONS.get(role, PERMISSIONS["user"])

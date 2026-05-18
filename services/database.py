import json
import os
import uuid
import pyodbc
from datetime import datetime


def _get_conn() -> pyodbc.Connection:
    conn_str = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={os.getenv('AZURE_SQL_SERVER', '')};"
        f"DATABASE={os.getenv('AZURE_SQL_DATABASE', '')};"
        f"UID={os.getenv('AZURE_SQL_USERNAME', '')};"
        f"PWD={os.getenv('AZURE_SQL_PASSWORD', '')};"
        "Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)


class _DictRow:
    """Wraps a pyodbc Row so columns can be accessed by name like row['col']."""
    def __init__(self, row, columns):
        self._data = {col: val for col, val in zip(columns, row)}

    def __getitem__(self, key):
        return self._data[key]

    def __contains__(self, key):
        return key in self._data

    def keys(self):
        return self._data.keys()

    def get(self, key, default=None):
        return self._data.get(key, default)


class _DictCursor:
    """Wraps a pyodbc cursor so fetchone/fetchall return _DictRow objects."""
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql, params=None):
        if params is not None:
            self._cursor.execute(sql, params)
        else:
            self._cursor.execute(sql)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in self._cursor.description]
        return _DictRow(row, cols)

    def fetchall(self):
        if self._cursor.description is None:
            return []
        cols = [d[0] for d in self._cursor.description]
        return [_DictRow(r, cols) for r in self._cursor.fetchall()]

    @property
    def rowcount(self):
        return self._cursor.rowcount


class _AzureConn:
    """
    Mimics the sqlite3 connection interface used throughout the codebase.
    All routes call conn.execute(...) / conn.commit() / conn.close().
    """
    def __init__(self):
        self._conn = _get_conn()
        self._conn.autocommit = False

    def execute(self, sql, params=None):
        cur = self._conn.cursor()
        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return _DictCursor(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()

    def cursor(self):
        return _DictCursor(self._conn.cursor())


def get_db() -> _AzureConn:
    return _AzureConn()


def log_tool_change(tool_name: str, action: str, changed_fields: dict = None, note: str = ""):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO tool_change_log (id, tool_name, action, changed_fields, changed_by, note, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                tool_name,
                action,
                json.dumps(changed_fields or {}),
                "admin",
                note,
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def init_db():
    conn = get_db()

    for sql in [
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='audit_log')
           CREATE TABLE audit_log (
               id NVARCHAR(36) PRIMARY KEY,
               created_at NVARCHAR(50),
               raw_input NVARCHAR(MAX),
               intent NVARCHAR(255),
               industry NVARCHAR(255),
               recommended_tool NVARCHAR(255),
               tool_reason NVARCHAR(MAX),
               tool_confidence NVARCHAR(50),
               policy_flags NVARCHAR(MAX),
               retrieved_policies NVARCHAR(MAX),
               final_prompt NVARCHAR(MAX),
               prompt_version NVARCHAR(50),
               model_used NVARCHAR(255),
               output NVARCHAR(MAX),
               token_estimate INT DEFAULT 0,
               system_version NVARCHAR(50),
               policy_blocked INT DEFAULT 0,
               policy_summary NVARCHAR(MAX) DEFAULT '',
               role NVARCHAR(255) DEFAULT 'general',
               user_email NVARCHAR(255) DEFAULT '',
               row_num INT IDENTITY(1,1) NOT NULL UNIQUE
           )""",
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='feedback')
           CREATE TABLE feedback (
               id NVARCHAR(36) PRIMARY KEY,
               audit_id NVARCHAR(36),
               email NVARCHAR(255) DEFAULT '',
               rating INT,
               comment NVARCHAR(MAX),
               issue_type NVARCHAR(255),
               created_at NVARCHAR(50),
               source NVARCHAR(50) DEFAULT 'form'
           )""",
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='prompt_versions')
           CREATE TABLE prompt_versions (
               id NVARCHAR(36) PRIMARY KEY,
               version NVARCHAR(50) NOT NULL,
               intent NVARCHAR(255),
               industry NVARCHAR(255),
               template NVARCHAR(MAX) NOT NULL,
               change_note NVARCHAR(MAX),
               created_at NVARCHAR(50),
               created_by NVARCHAR(255) DEFAULT 'system'
           )""",
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='registered_tools')
           CREATE TABLE registered_tools (
               id NVARCHAR(36) PRIMARY KEY,
               tool_name NVARCHAR(255) NOT NULL UNIQUE,
               description NVARCHAR(MAX) DEFAULT '',
               category NVARCHAR(255) DEFAULT '',
               url NVARCHAR(500) DEFAULT '',
               icon NVARCHAR(10) DEFAULT '🤖',
               best_for NVARCHAR(MAX) DEFAULT '[]',
               strong_signals NVARCHAR(MAX) DEFAULT '[]',
               weak_signals NVARCHAR(MAX) DEFAULT '[]',
               not_for NVARCHAR(MAX) DEFAULT '[]',
               roles NVARCHAR(MAX) DEFAULT '[]',
               output_type NVARCHAR(255) DEFAULT '',
               is_internal INT DEFAULT 0,
               raw_data NVARCHAR(MAX) DEFAULT '{}',
               created_at NVARCHAR(50),
               updated_at NVARCHAR(50)
           )""",
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='tool_change_log')
           CREATE TABLE tool_change_log (
               id NVARCHAR(36) PRIMARY KEY,
               tool_name NVARCHAR(255) NOT NULL,
               action NVARCHAR(50) NOT NULL,
               changed_fields NVARCHAR(MAX) DEFAULT '{}',
               changed_by NVARCHAR(255) DEFAULT 'admin',
               note NVARCHAR(MAX) DEFAULT '',
               created_at NVARCHAR(50)
           )""",
        """IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='scenario_suggestions')
           CREATE TABLE scenario_suggestions (
               id NVARCHAR(36) PRIMARY KEY,
               title NVARCHAR(500) NOT NULL,
               mega_group NVARCHAR(255) NOT NULL,
               category NVARCHAR(255) DEFAULT '',
               persona NVARCHAR(255) DEFAULT '',
               activate_phase NVARCHAR(255) DEFAULT '',
               scenario NVARCHAR(MAX) NOT NULL,
               submitted_by NVARCHAR(255) DEFAULT '',
               submitted_at NVARCHAR(50) NOT NULL,
               status NVARCHAR(50) DEFAULT 'pending',
               admin_note NVARCHAR(MAX) DEFAULT '',
               reviewed_at NVARCHAR(50) DEFAULT ''
           )""",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass

    row = conn.execute("SELECT COUNT(*) as c FROM prompt_versions").fetchone()
    if row and row["c"] == 0:
        conn.execute(
            "INSERT INTO prompt_versions VALUES (?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()), "1.0", "general", "general",
                "## ROLE\nYou are an expert {industry} professional specializing in {intent} tasks.\n\n"
                "## CONTEXT\nUser Request: {user_input}\nIndustry: {industry} | Task Type: {intent}\n\n"
                "## OBJECTIVE\nProduce a high-quality, professional {intent} that directly addresses the user's need.\n\n"
                "## LIMITATIONS & COMPLIANCE POLICIES\n{policy_block}\n  - No confidential or PII data\n  - Follow {industry} industry standards\n\n"
                "## OUTPUT FORMAT\n1. Executive Summary\n2. Main Content\n3. Key Recommendations\n4. Compliance Notes",
                "Initial CORLO template", datetime.utcnow().isoformat(), "system"
            )
        )
        conn.commit()

    conn.close()

import json
import sqlite3
import uuid
from datetime import datetime

DB_PATH = "./orchestrator.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            raw_input TEXT,
            intent TEXT,
            industry TEXT,
            recommended_tool TEXT,
            tool_reason TEXT,
            tool_confidence TEXT,
            policy_flags TEXT,
            retrieved_policies TEXT,
            final_prompt TEXT,
            prompt_version TEXT,
            model_used TEXT,
            output TEXT,
            token_estimate INTEGER,
            system_version TEXT,
            policy_blocked INTEGER DEFAULT 0,
            policy_summary TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY,
            audit_id TEXT,
            email TEXT DEFAULT '',
            rating INTEGER,
            comment TEXT,
            issue_type TEXT,
            created_at TEXT,
            source TEXT DEFAULT 'form'
        );
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            intent TEXT,
            industry TEXT,
            template TEXT NOT NULL,
            change_note TEXT,
            created_at TEXT,
            created_by TEXT DEFAULT 'system'
        );
        CREATE TABLE IF NOT EXISTS registered_tools (
            id TEXT PRIMARY KEY,
            tool_name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            category TEXT DEFAULT '',
            url TEXT DEFAULT '',
            icon TEXT DEFAULT '🤖',
            best_for TEXT DEFAULT '[]',
            strong_signals TEXT DEFAULT '[]',
            weak_signals TEXT DEFAULT '[]',
            not_for TEXT DEFAULT '[]',
            roles TEXT DEFAULT '[]',
            output_type TEXT DEFAULT '',
            is_internal INTEGER DEFAULT 0,
            raw_data TEXT DEFAULT '{}',
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS tool_change_log (
            id TEXT PRIMARY KEY,
            tool_name TEXT NOT NULL,
            action TEXT NOT NULL,
            changed_fields TEXT DEFAULT '{}',
            changed_by TEXT DEFAULT 'admin',
            note TEXT DEFAULT '',
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS scenario_suggestions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            mega_group TEXT NOT NULL,
            category TEXT DEFAULT '',
            persona TEXT DEFAULT '',
            activate_phase TEXT DEFAULT '',
            scenario TEXT NOT NULL,
            submitted_by TEXT DEFAULT '',
            submitted_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            admin_note TEXT DEFAULT '',
            reviewed_at TEXT DEFAULT ''
        );
    """)
    for col, definition in [("policy_blocked", "INTEGER DEFAULT 0"),
                             ("policy_summary", "TEXT DEFAULT ''"),
                             ("role",           "TEXT DEFAULT 'general'"),
                             ("user_email",     "TEXT DEFAULT ''")]:
        try:
            conn.execute(f"ALTER TABLE audit_log ADD COLUMN {col} {definition}")
            conn.commit()
        except Exception:
            pass
    for col, definition in [("email", "TEXT DEFAULT ''"), ("source", "TEXT DEFAULT 'form'")]:
        try:
            conn.execute(f"ALTER TABLE feedback ADD COLUMN {col} {definition}")
            conn.commit()
        except Exception:
            pass

    count = conn.execute("SELECT COUNT(*) as c FROM prompt_versions").fetchone()["c"]
    if count == 0:
        conn.execute(
            "INSERT INTO prompt_versions VALUES (?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()), "1.0", "general", "general",
                "## ROLE\nYou are an expert {industry} professional specializing in {intent} tasks.\n\n"
                "## CONTEXT\nUser Request: {user_input}\nIndustry: {industry} | Task Type: {intent}\nTarget Tool: {tool}\n\n"
                "## OBJECTIVE\nProduce a high-quality, professional {intent} that directly addresses the user's need.\n\n"
                "## LIMITATIONS & COMPLIANCE POLICIES\n{policy_block}\n  - No confidential or PII data\n  - Follow {industry} industry standards\n\n"
                "## OUTPUT FORMAT\n1. Executive Summary\n2. Main Content\n3. Key Recommendations\n4. Compliance Notes",
                "Initial CORLO template", datetime.utcnow().isoformat(), "system"
            )
        )
    conn.commit()
    conn.close()

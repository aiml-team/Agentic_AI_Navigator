from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from schemas import AuditUpdateRequest
from services.database import get_db

router = APIRouter()


@router.get("/api/audit")
async def get_audit_log(limit: int = 20, user_email: str = ""):
    conn = get_db()
    if user_email.strip():
        rows = conn.execute(
            "SELECT * FROM audit_log WHERE LOWER(user_email) = ? ORDER BY created_at DESC LIMIT ?",
            (user_email.strip().lower(), limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.patch("/api/audit/{audit_id}")
async def update_audit_log(audit_id: str, req: AuditUpdateRequest):
    conn = get_db()
    row = conn.execute("SELECT * FROM audit_log WHERE id = ?", (audit_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Audit log not found")

    current = dict(row)

    new_raw_input    = req.raw_input    if req.raw_input is not None else current.get("raw_input", "")
    new_final_prompt = req.final_prompt if req.final_prompt is not None else current.get("final_prompt", "")
    new_output       = req.output       if req.output is not None else current.get("output", "")

    conn.execute(
        "UPDATE audit_log SET raw_input = ?, final_prompt = ?, output = ? WHERE id = ?",
        (new_raw_input, new_final_prompt, new_output, audit_id),
    )
    conn.commit()

    updated = conn.execute("SELECT * FROM audit_log WHERE id = ?", (audit_id,)).fetchone()
    conn.close()
    return dict(updated)


@router.get("/api/analytics")
async def get_analytics():
    conn = get_db()
    total          = conn.execute("SELECT COUNT(*) as c FROM audit_log").fetchone()["c"]
    intents        = conn.execute("SELECT intent, COUNT(*) as c FROM audit_log GROUP BY intent ORDER BY c DESC").fetchall()
    tools          = conn.execute("SELECT recommended_tool, COUNT(*) as c FROM audit_log GROUP BY recommended_tool ORDER BY c DESC").fetchall()
    industries     = conn.execute("SELECT industry, COUNT(*) as c FROM audit_log GROUP BY industry ORDER BY c DESC LIMIT 5").fetchall()
    avg_rating     = conn.execute("SELECT AVG(rating) as r FROM feedback").fetchone()["r"]
    feedback_count = conn.execute("SELECT COUNT(*) as c FROM feedback").fetchone()["c"]
    issue_types    = conn.execute(
        "SELECT issue_type, COUNT(*) as c FROM feedback WHERE issue_type != '' GROUP BY issue_type ORDER BY c DESC"
    ).fetchall()
    low_rated = conn.execute("""
        SELECT a.intent, a.recommended_tool, f.issue_type, f.comment
        FROM feedback f JOIN audit_log a ON f.audit_id = a.id
        WHERE f.rating <= 2
        ORDER BY f.created_at DESC LIMIT 10
    """).fetchall()
    token_trend = conn.execute(
        "SELECT created_at, token_estimate FROM audit_log ORDER BY created_at DESC LIMIT 10"
    ).fetchall()
    by_user = conn.execute(
        "SELECT user_email, COUNT(*) as c FROM audit_log WHERE user_email != '' AND user_email IS NOT NULL "
        "GROUP BY user_email ORDER BY c DESC LIMIT 20"
    ).fetchall()
    recent_runs = conn.execute(
        "SELECT id, created_at, user_email, raw_input, recommended_tool, intent, policy_blocked "
        "FROM audit_log ORDER BY created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()

    return {
        "total_runs":     total,
        "avg_rating":     round(avg_rating, 1) if avg_rating else None,
        "feedback_count": feedback_count,
        "intents":        [dict(r) for r in intents],
        "tools":          [dict(r) for r in tools],
        "industries":     [dict(r) for r in industries],
        "issue_types":    [dict(r) for r in issue_types],
        "low_rated_runs": [dict(r) for r in low_rated],
        "token_trend":    [dict(r) for r in token_trend],
        "by_user":        [dict(r) for r in by_user],
        "recent_runs":    [dict(r) for r in recent_runs],
    }


def _fill_timeline(rows, since, now, period):
    data = dict(rows)
    result = []
    if period == "day":
        current = since.replace(minute=0, second=0, microsecond=0)
        while current <= now:
            bucket  = current.strftime("%H")
            display = current.strftime("%H:00")
            result.append({"label": display, "count": data.get(bucket, 0)})
            current += timedelta(hours=1)
    else:
        current = since.replace(hour=0, minute=0, second=0, microsecond=0)
        while current <= now:
            bucket  = current.strftime("%Y-%m-%d")
            display = current.strftime("%b %d")
            result.append({"label": display, "count": data.get(bucket, 0)})
            current += timedelta(days=1)
    return result


@router.get("/api/analytics-dashboard")
async def get_analytics_dashboard(period: str = "day", role: str = "all"):
    now = datetime.utcnow()
    if period == "week":
        since      = now - timedelta(weeks=1)
        prev_since = since - timedelta(weeks=1)
        tl_fmt     = "%Y-%m-%d"
    elif period == "month":
        since      = now - timedelta(days=30)
        prev_since = since - timedelta(days=30)
        tl_fmt     = "%Y-%m-%d"
    else:
        since      = now - timedelta(days=1)
        prev_since = since - timedelta(days=1)
        tl_fmt     = "%H"

    since_str      = since.isoformat()
    prev_since_str = prev_since.isoformat()

    conn = get_db()

    role_filter_sql  = ""
    role_filter_args = []
    if role != "all" and role.strip():
        role_filter_sql  = " AND LOWER(role) LIKE ?"
        role_filter_args = [f"%{role.lower()}%"]

    base_args      = [since_str]      + role_filter_args
    prev_base_args = [prev_since_str, since_str] + role_filter_args

    total = conn.execute(
        f"SELECT COUNT(*) as c FROM audit_log WHERE created_at >= ?{role_filter_sql}",
        base_args
    ).fetchone()["c"]

    prev_total = conn.execute(
        f"SELECT COUNT(*) as c FROM audit_log WHERE created_at >= ? AND created_at < ?{role_filter_sql}",
        prev_base_args
    ).fetchone()["c"]

    change_pct = None
    if prev_total and prev_total > 0:
        change_pct = round((total - prev_total) / prev_total * 100)

    by_role_rows = conn.execute(
        "SELECT role, COUNT(*) as count "
        "FROM audit_log "
        "WHERE created_at >= ? "
        "  AND role IS NOT NULL AND TRIM(role) != '' "
        + role_filter_sql +
        " GROUP BY role ORDER BY count DESC LIMIT 15",
        base_args
    ).fetchall()
    by_role = [{"role": r["role"].strip().title() if r["role"].strip().lower() == "general" else r["role"].strip(), "count": r["count"]} for r in by_role_rows]

    by_intent_rows = conn.execute(
        f"SELECT intent, COUNT(*) as count FROM audit_log "
        f"WHERE created_at >= ? AND (intent IS NOT NULL AND intent != ''){role_filter_sql} "
        f"GROUP BY intent ORDER BY count DESC LIMIT 10",
        base_args
    ).fetchall()
    total_intent = sum(r["count"] for r in by_intent_rows) or 1
    by_intent = [
        {"label": r["intent"] or "—", "count": r["count"],
         "total_pct": round(r["count"] / total_intent * 100)}
        for r in by_intent_rows
    ]

    by_tool_rows = conn.execute(
        f"SELECT recommended_tool, COUNT(*) as count FROM audit_log "
        f"WHERE created_at >= ? AND (recommended_tool IS NOT NULL AND recommended_tool != ''){role_filter_sql} "
        f"GROUP BY recommended_tool ORDER BY count DESC LIMIT 10",
        base_args
    ).fetchall()
    total_tool = sum(r["count"] for r in by_tool_rows) or 1
    by_tool = [
        {"label": r["recommended_tool"] or "—", "count": r["count"],
         "total_pct": round(r["count"] / total_tool * 100)}
        for r in by_tool_rows
    ]

    blocked = conn.execute(
        f"SELECT COUNT(*) as c FROM audit_log "
        f"WHERE created_at >= ? AND policy_blocked = 1{role_filter_sql}",
        base_args
    ).fetchone()["c"]

    tl_rows = conn.execute(
        f"SELECT strftime('{tl_fmt}', created_at) as bucket, COUNT(*) as count "
        f"FROM audit_log WHERE created_at >= ?{role_filter_sql} "
        f"GROUP BY bucket ORDER BY bucket ASC",
        base_args
    ).fetchall()
    timeline = _fill_timeline([(r["bucket"], r["count"]) for r in tl_rows], since, now, period)

    conn.close()

    return {
        "period":       period,
        "role_filter":  role,
        "total_runs":   total,
        "change_pct":   change_pct,
        "by_role":      by_role,
        "by_intent":    by_intent,
        "by_tool":      by_tool,
        "blocked_runs": blocked,
        "timeline":     timeline,
    }

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from schemas import AuditUpdateRequest
from services.database import get_db

router = APIRouter()


@router.get("/api/analytics/user-activity")
async def get_user_activity(page: int = 1, per_page: int = 5):
    """
    Returns all users (from NavigatorUsers + NavigatorAdmins) joined with
    their run count from audit_log, sorted by run_count DESC then last_seen DESC.
    Users with zero runs are included with run_count = 0.
    Paginated: default 5 per page with total so frontend can do prev/next.
    """
    conn = get_db()
    offset = (page - 1) * per_page

    total_row = conn.execute("""
        SELECT COUNT(*) AS c FROM (
            SELECT email FROM NavigatorUsers
            UNION
            SELECT email FROM NavigatorAdmins
        ) AS all_users
    """).fetchone()
    total = int(total_row["c"]) if total_row else 0

    rows = conn.execute(f"""
        SELECT
            u.email,
            u.name,
            u.last_seen,
            u.first_seen,
            u.role,
            ISNULL(r.run_count, 0) AS run_count,
            r.last_run
        FROM (
            SELECT email, name, last_seen, first_seen, 'user' AS role
            FROM NavigatorUsers
            UNION ALL
            SELECT email, name, added_at AS last_seen, added_at AS first_seen, 'admin' AS role
            FROM NavigatorAdmins
        ) AS u
        LEFT JOIN (
            SELECT LOWER(user_email) AS email,
                   COUNT(*) AS run_count,
                   MAX(created_at) AS last_run
            FROM audit_log
            WHERE user_email IS NOT NULL AND user_email != ''
            GROUP BY LOWER(user_email)
        ) AS r ON LOWER(u.email) = r.email
        ORDER BY run_count DESC, u.last_seen DESC
        OFFSET {int(offset)} ROWS FETCH NEXT {int(per_page)} ROWS ONLY
    """).fetchall()

    conn.close()

    items = []
    for r in rows:
        last_seen  = r["last_seen"]
        first_seen = r["first_seen"]
        last_run   = r["last_run"]
        items.append({
            "email":      r["email"] or "",
            "name":       r["name"] or "",
            "role":       r["role"] or "user",
            "run_count":  int(r["run_count"]),
            "last_seen":  str(last_seen)[:19].replace("T", " ") if last_seen else "—",
            "first_seen": str(first_seen)[:19].replace("T", " ") if first_seen else "—",
            "last_run":   str(last_run)[:19].replace("T", " ") if last_run else "—",
        })

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    max(1, (total + per_page - 1) // per_page),
        "items":    items,
    }


@router.get("/api/audit")
async def get_audit_log(limit: int = 20, user_email: str = ""):
    conn = get_db()
    if user_email.strip():
        rows = conn.execute(
            f"SELECT TOP {int(limit)} * FROM audit_log WHERE LOWER(user_email) = ? ORDER BY created_at DESC",
            (user_email.strip().lower(),)
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT TOP {int(limit)} * FROM audit_log ORDER BY created_at DESC"
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
    industries     = conn.execute("SELECT TOP 5 industry, COUNT(*) as c FROM audit_log GROUP BY industry ORDER BY c DESC").fetchall()
    avg_rating     = conn.execute("SELECT AVG(CAST(rating AS FLOAT)) as r FROM feedback").fetchone()["r"]
    feedback_count = conn.execute("SELECT COUNT(*) as c FROM feedback").fetchone()["c"]
    issue_types    = conn.execute(
        "SELECT issue_type, COUNT(*) as c FROM feedback WHERE issue_type != '' GROUP BY issue_type ORDER BY c DESC"
    ).fetchall()
    low_rated = conn.execute("""
        SELECT TOP 10 a.intent, a.recommended_tool, f.issue_type, f.comment
        FROM feedback f JOIN audit_log a ON f.audit_id = a.id
        WHERE f.rating <= 2
        ORDER BY f.created_at DESC
    """).fetchall()
    token_trend = conn.execute(
        "SELECT TOP 10 created_at, token_estimate FROM audit_log ORDER BY created_at DESC"
    ).fetchall()
    by_user = conn.execute(
        "SELECT TOP 20 user_email, COUNT(*) as c FROM audit_log WHERE user_email != '' AND user_email IS NOT NULL "
        "GROUP BY user_email ORDER BY c DESC"
    ).fetchall()
    recent_runs = conn.execute(
        "SELECT TOP 20 id, created_at, user_email, raw_input, recommended_tool, intent, policy_blocked "
        "FROM audit_log ORDER BY created_at DESC"
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
        "SELECT TOP 15 role, COUNT(*) as count "
        "FROM audit_log "
        "WHERE created_at >= ? "
        "  AND role IS NOT NULL AND LTRIM(RTRIM(role)) != '' "
        + role_filter_sql +
        " GROUP BY role ORDER BY count DESC",
        base_args
    ).fetchall()
    by_role = [{"role": r["role"].strip().title() if r["role"].strip().lower() == "general" else r["role"].strip(), "count": r["count"]} for r in by_role_rows]

    by_intent_rows = conn.execute(
        f"SELECT TOP 10 intent, COUNT(*) as count FROM audit_log "
        f"WHERE created_at >= ? AND (intent IS NOT NULL AND intent != ''){role_filter_sql} "
        f"GROUP BY intent ORDER BY count DESC",
        base_args
    ).fetchall()
    total_intent = sum(r["count"] for r in by_intent_rows) or 1
    by_intent = [
        {"label": r["intent"] or "—", "count": r["count"],
         "total_pct": round(r["count"] / total_intent * 100)}
        for r in by_intent_rows
    ]

    by_tool_rows = conn.execute(
        f"SELECT TOP 10 recommended_tool, COUNT(*) as count FROM audit_log "
        f"WHERE created_at >= ? AND (recommended_tool IS NOT NULL AND recommended_tool != ''){role_filter_sql} "
        f"GROUP BY recommended_tool ORDER BY count DESC",
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

    tl_fmt_sql = (
        "FORMAT(TRY_CAST(created_at AS DATETIME2), 'HH')"
        if period == "day"
        else "FORMAT(TRY_CAST(created_at AS DATETIME2), 'yyyy-MM-dd')"
    )
    tl_rows = conn.execute(
        f"SELECT {tl_fmt_sql} as bucket, COUNT(*) as count "
        f"FROM audit_log WHERE created_at >= ?{role_filter_sql} "
        f"GROUP BY {tl_fmt_sql} ORDER BY bucket ASC",
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

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_client = None
_redis_checked = False

AUDIT_LIST_TTL = int(os.getenv("REDIS_AUDIT_LIST_TTL", 60))
AUDIT_RECORD_TTL = int(os.getenv("REDIS_AUDIT_RECORD_TTL", 300))


def get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = os.getenv("REDIS_URL", "")
    if not url:
        logger.info("REDIS_URL not set — caching disabled.")
        return None
    try:
        import redis
        kwargs = dict(decode_responses=True, socket_connect_timeout=5, socket_timeout=5)
        if url.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = None
        _redis_client = redis.Redis.from_url(url, **kwargs)
        _redis_client.ping()
        logger.info("Redis connected: %s", url.split("@")[-1])
    except Exception as exc:
        logger.warning("Redis unavailable — caching disabled. Reason: %s", exc)
        _redis_client = None
    return _redis_client


def _key_audit_list(user_email: str, limit: int) -> str:
    safe = user_email.strip().lower() if user_email.strip() else "admin"
    return f"audit:list:{safe}:{limit}"


def _key_audit_record(audit_id: str) -> str:
    return f"audit:record:{audit_id}"


def get_audit_list(user_email: str, limit: int) -> Optional[list]:
    r = get_redis()
    if not r:
        return None
    try:
        raw = r.get(_key_audit_list(user_email, limit))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis get_audit_list error: %s", exc)
        return None


def set_audit_list(user_email: str, limit: int, data: list) -> None:
    r = get_redis()
    if not r:
        return
    try:
        r.setex(_key_audit_list(user_email, limit), AUDIT_LIST_TTL, json.dumps(data, default=str))
    except Exception as exc:
        logger.warning("Redis set_audit_list error: %s", exc)


def get_audit_record(audit_id: str) -> Optional[dict]:
    r = get_redis()
    if not r:
        return None
    try:
        raw = r.get(_key_audit_record(audit_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis get_audit_record error: %s", exc)
        return None


def set_audit_record(audit_id: str, data: dict) -> None:
    r = get_redis()
    if not r:
        return
    try:
        r.setex(_key_audit_record(audit_id), AUDIT_RECORD_TTL, json.dumps(data, default=str))
    except Exception as exc:
        logger.warning("Redis set_audit_record error: %s", exc)


def invalidate_audit_record(audit_id: str) -> None:
    r = get_redis()
    if not r:
        return
    try:
        r.delete(_key_audit_record(audit_id))
    except Exception as exc:
        logger.warning("Redis invalidate_audit_record error: %s", exc)


def invalidate_audit_lists_for_user(user_email: str) -> None:
    r = get_redis()
    if not r:
        return
    try:
        safe = user_email.strip().lower() if user_email.strip() else "admin"
        pattern = f"audit:list:{safe}:*"
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
        admin_keys = r.keys("audit:list:admin:*")
        if admin_keys:
            r.delete(*admin_keys)
    except Exception as exc:
        logger.warning("Redis invalidate_audit_lists_for_user error: %s", exc)

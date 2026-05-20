import json
import os
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from services.database import get_db

router = APIRouter()


def _get_blob_container():
    from azure.storage.blob import BlobServiceClient
    account_name = os.getenv("ACCOUNT_NAME", "")
    account_key  = os.getenv("ACCOUNT_KEY", "")
    container    = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "ai-navigator-feedback")
    conn_str = (
        f"DefaultEndpointsProtocol=https;"
        f"AccountName={account_name};"
        f"AccountKey={account_key};"
        f"EndpointSuffix=core.windows.net"
    )
    client = BlobServiceClient.from_connection_string(conn_str)
    return client.get_container_client(container)


def _content_settings(content_type: str):
    from azure.storage.blob import ContentSettings
    return ContentSettings(content_type=content_type)


@router.post("/api/feedback")
async def submit_feedback(
    email:      str  = Form(""),
    rating:     int  = Form(...),
    comment:    str  = Form(""),
    issue_type: str  = Form(""),
    audit_id:   str  = Form(""),
    source:     str  = Form("form"),
    files:      List[UploadFile] = File(default=[]),
):
    feedback_id  = str(uuid.uuid4())
    created_at   = datetime.utcnow().isoformat()
    folder       = f"feedback/{created_at[:10]}_{feedback_id}"

    metadata = {
        "id":         feedback_id,
        "audit_id":   audit_id,
        "email":      email,
        "rating":     rating,
        "comment":    comment,
        "issue_type": issue_type,
        "source":     source,
        "created_at": created_at,
        "files":      [],
    }

    uploaded_files = []

    try:
        container = _get_blob_container()

        for f in files:
            if not f.filename:
                continue
            raw = await f.read()
            if not raw:
                continue
            safe_name    = f.filename.replace(" ", "_")
            blob_name    = f"{folder}/attachments/{safe_name}"
            content_type = f.content_type or "application/octet-stream"
            container.upload_blob(
                name=blob_name,
                data=raw,
                overwrite=True,
                content_settings=_content_settings(content_type),
            )
            uploaded_files.append(safe_name)

        metadata["files"] = uploaded_files

        meta_blob = f"{folder}/metadata.json"
        container.upload_blob(
            name=meta_blob,
            data=json.dumps(metadata, indent=2).encode("utf-8"),
            overwrite=True,
            content_settings=_content_settings("application/json"),
        )
    except Exception as e:
        raise HTTPException(500, f"Blob upload failed: {str(e)}")

    try:
        db = get_db()
        db.execute(
            """INSERT INTO feedback (id, audit_id, email, rating, comment, issue_type, created_at, source, files)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                feedback_id,
                audit_id or "",
                email or "",
                rating,
                comment or "",
                issue_type or "",
                created_at,
                source or "form",
                json.dumps(uploaded_files),
            ),
        )
        db.commit()
        db.close()
    except Exception as e:
        print(f"[feedback] Azure SQL insert warning: {e}")

    return {"status": "ok", "feedback_id": feedback_id}


@router.get("/api/feedback-list")
async def list_feedback(page: int = 1, per_page: int = 20, rating: int = 0, search: str = ""):
    try:
        container = _get_blob_container()
        blobs = list(container.list_blobs(name_starts_with="feedback/"))
    except Exception as e:
        raise HTTPException(500, f"Blob list failed: {str(e)}")

    meta_blobs = [b for b in blobs if b.name.endswith("/metadata.json")]

    all_feedbacks = []
    for blob in meta_blobs:
        try:
            data = container.download_blob(blob.name).readall()
            entry = json.loads(data)
            all_feedbacks.append(entry)
        except Exception:
            continue

    all_feedbacks.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    ratings_all = [f.get("rating", 0) for f in all_feedbacks if f.get("rating")]
    avg_rating  = round(sum(ratings_all) / len(ratings_all), 1) if ratings_all else None

    from collections import Counter
    dist_counter = Counter(f.get("rating") for f in all_feedbacks if f.get("rating"))
    distribution = [{"rating": r, "count": c} for r, c in sorted(dist_counter.items())]

    filtered = all_feedbacks
    if rating > 0:
        filtered = [f for f in filtered if f.get("rating") == rating]
    if search.strip():
        q = search.strip().lower()
        filtered = [
            f for f in filtered
            if q in (f.get("email") or "").lower()
            or q in (f.get("comment") or "").lower()
            or q in (f.get("issue_type") or "").lower()
        ]

    total = len(filtered)
    offset = (page - 1) * per_page
    page_items = filtered[offset: offset + per_page]

    return {
        "total":        total,
        "page":         page,
        "per_page":     per_page,
        "avg_rating":   avg_rating,
        "distribution": distribution,
        "feedbacks":    page_items,
    }


@router.get("/api/feedback-attachments/{feedback_id}")
async def get_feedback_attachments(feedback_id: str):
    try:
        container  = _get_blob_container()
        prefix     = f"feedback/"
        all_blobs  = list(container.list_blobs(name_starts_with=prefix))
        folder_blob = next(
            (b for b in all_blobs if feedback_id in b.name and b.name.endswith("/metadata.json")),
            None
        )
        if not folder_blob:
            raise HTTPException(404, "Feedback not found")

        folder = folder_blob.name.replace("/metadata.json", "")
        attach_prefix = f"{folder}/attachments/"
        attach_blobs  = [b for b in all_blobs if b.name.startswith(attach_prefix)]

        urls = []
        for blob in attach_blobs:
            from azure.storage.blob import generate_blob_sas, BlobSasPermissions
            sas = generate_blob_sas(
                account_name   = os.getenv("ACCOUNT_NAME", ""),
                container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "ai-navigator-feedback"),
                blob_name      = blob.name,
                account_key    = os.getenv("ACCOUNT_KEY", ""),
                permission     = BlobSasPermissions(read=True),
                expiry         = datetime.utcnow().replace(hour=23, minute=59, second=59),
            )
            account_name = os.getenv("ACCOUNT_NAME", "")
            container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "ai-navigator-feedback")
            url = f"https://{account_name}.blob.core.windows.net/{container_name}/{blob.name}?{sas}"
            urls.append({"name": blob.name.split("/")[-1], "url": url})

        return {"files": urls}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

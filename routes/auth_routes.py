import os
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException, Form
from fastapi.responses import Response
import auth as _auth

router = APIRouter()


@router.post("/api/auth/identify")
async def identify(email: str = Form(...)):
    try:
        result = _auth.identify_user(email)
        result["permissions"] = _auth.get_permissions(result["role"])
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Auth error: {e}")


@router.get("/api/auth/admins")
async def get_admins():
    try:
        return {"admins": _auth.list_admins()}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/auth/admins/add")
async def add_admin(email: str = Form(...), name: str = Form("")):
    try:
        return _auth.add_admin(email, name)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/auth/admins/remove")
async def remove_admin(email: str = Form(...)):
    try:
        return _auth.remove_admin(email)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/api/auth/users")
async def get_users(page: int = 1, per_page: int = 50):
    try:
        return _auth.list_users(page, per_page)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/saml/metadata")
async def saml_metadata():
    cert = Path("saml/sp.crt").read_text()
    cert = cert.replace("-----BEGIN CERTIFICATE-----", "") \
               .replace("-----END CERTIFICATE-----", "") \
               .replace("\n", "").strip()

    base_url = os.getenv(
        "APP_BASE_URL",
        "https://ai-navigator-test-cbeedsgsd8hyfefq.northeurope-01.azurewebsites.net"
    ).rstrip("/")

    xml = f"""<?xml version="1.0"?>
<md:EntityDescriptor
    xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
    xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
    entityID="{base_url}/saml/metadata">
  <md:SPSSODescriptor
      AuthnRequestsSigned="false"
      WantAssertionsSigned="true"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>{cert}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="{base_url}/saml/acs"
        index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>"""
    return Response(content=xml, media_type="application/xml")

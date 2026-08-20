from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import random
import logging
import tempfile
import json
import re
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from apscheduler.schedulers.asyncio import AsyncIOScheduler

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shopkeeper")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
CAP = 10_000_000  # 1 Cr
SOFT_CAP = 8_000_000  # 80 L

TWILIO_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_SMS = os.environ.get('TWILIO_SMS_NUMBER', '')
TWILIO_WA = os.environ.get('TWILIO_WHATSAPP_NUMBER', '')
TWILIO_ENABLED = bool(TWILIO_SID and TWILIO_TOKEN)

twilio_client = None
if TWILIO_ENABLED:
    from twilio.rest import Client as TwilioClient
    twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_dt(s):
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def send_message(to_phone: str, body: str, channel: str = "sms"):
    """Send via Twilio if configured, else mock-log."""
    if twilio_client:
        try:
            if channel == "whatsapp":
                twilio_client.messages.create(body=body, from_=TWILIO_WA, to=f"whatsapp:{to_phone}")
            else:
                twilio_client.messages.create(body=body, from_=TWILIO_SMS, to=to_phone)
            return {"sent": True, "mock": False}
        except Exception as e:
            logger.error(f"Twilio {channel} failed: {e}")
            return {"sent": False, "mock": False, "error": str(e)}
    logger.info(f"[MOCK {channel.upper()}] to {to_phone}: {body}")
    return {"sent": True, "mock": True}


# ---------- Auth helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(sub: str, role: str, days=7):
    return jwt.encode({"sub": sub, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=days)}, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        return jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


async def get_shopkeeper(request: Request) -> dict:
    payload = decode_token(request)
    if payload.get("role") != "shopkeeper":
        raise HTTPException(403, "Shopkeeper access required")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_customer_session(request: Request) -> dict:
    payload = decode_token(request)
    if payload.get("role") != "customer":
        raise HTTPException(403, "Customer access required")
    return payload


# ---------- Models ----------
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    shop_name: str


class LoginIn(BaseModel):
    email: str
    password: str


class CustomerIn(BaseModel):
    name: str
    phone: str
    credit_threshold: float = 10000


class EntryIn(BaseModel):
    customer_id: str
    type: str  # credit | payment
    amount: float
    note: str = ""


class ProductIn(BaseModel):
    name: str
    sku: str = ""
    price: float
    stock: float = 0
    low_stock_threshold: float = 5


class SaleItem(BaseModel):
    product_id: str
    qty: float


class SaleIn(BaseModel):
    items: List[SaleItem]
    customer_id: Optional[str] = None
    mode: str = "cash"  # cash | credit


class StockInItem(BaseModel):
    name: str
    qty: float
    unit_price: float
    product_id: Optional[str] = None


class StockIn(BaseModel):
    items: List[StockInItem]
    supplier_name: str = ""


class SupplierIn(BaseModel):
    name: str
    phone: str = ""
    address: str = ""


class OrderItem(BaseModel):
    product_id: str
    name: str
    qty: float


class OrderIn(BaseModel):
    supplier_id: str
    items: List[OrderItem]


class OtpSendIn(BaseModel):
    phone: str


class OtpVerifyIn(BaseModel):
    phone: str
    otp: str


# ---------- Aging engine ----------
def compute_aging(entries: list, threshold: float):
    credits = sorted([e for e in entries if e["type"] == "credit"], key=lambda e: e["created_at"])
    paid = sum(e["amount"] for e in entries if e["type"] == "payment")
    buckets = {"b0_30": 0, "b31_60": 0, "b60_plus": 0}
    balance = 0
    oldest_days = 0
    now = datetime.now(timezone.utc)
    for c in credits:
        applied = min(paid, c["amount"])
        paid -= applied
        unpaid = c["amount"] - applied
        if unpaid > 0:
            balance += unpaid
            days = (now - parse_dt(c["created_at"])).days
            oldest_days = max(oldest_days, days)
            if days <= 30:
                buckets["b0_30"] += unpaid
            elif days <= 60:
                buckets["b31_60"] += unpaid
            else:
                buckets["b60_plus"] += unpaid
    overdue = balance > 0 and (balance > threshold or oldest_days > 30)
    return {"balance": round(balance, 2), "buckets": buckets, "oldest_days": oldest_days, "overdue": overdue}


async def customer_with_aging(cust: dict):
    entries = await db.ledger_entries.find({"customer_id": cust["id"]}, {"_id": 0}).to_list(5000)
    cust.update(compute_aging(entries, cust.get("credit_threshold", 10000)))
    return cust


# ---------- Auth routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email address")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user = {"id": str(uuid.uuid4()), "name": body.name, "email": email, "shop_name": body.shop_name,
            "role": "shopkeeper", "created_at": now_iso(), "password_hash": hash_password(body.password)}
    await db.users.insert_one(dict(user))
    user.pop("password_hash")
    user.pop("_id", None)
    return {"user": user, "token": make_token(user["id"], "shopkeeper")}


LOCKOUT_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    attempt = await db.login_attempts.find_one({"identifier": email}, {"_id": 0})
    if attempt and attempt["count"] >= LOCKOUT_ATTEMPTS:
        if parse_dt(attempt["last_fail"]) > datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_MINUTES):
            raise HTTPException(429, f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.")
        await db.login_attempts.delete_one({"identifier": email})
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": email}, {"$inc": {"count": 1}, "$set": {"last_fail": now_iso()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": email})
    user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"user": user, "token": make_token(user["id"], "shopkeeper")}


@api.get("/auth/me")
async def me(user=Depends(get_shopkeeper)):
    return user


# ---------- Customer OTP (mock when Twilio not configured) ----------
@api.post("/customer/otp/send")
async def otp_send(body: OtpSendIn):
    cust = await db.customers.find_one({"phone": body.phone}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "No khata found for this phone number")
    existing = await db.otp_codes.find_one({"phone": body.phone}, {"_id": 0})
    if existing and existing.get("sent_at") and parse_dt(existing["sent_at"]) > datetime.now(timezone.utc) - timedelta(seconds=60):
        raise HTTPException(429, "OTP already sent. Please wait 60 seconds before requesting again.")
    code = f"{random.randint(100000, 999999)}"
    await db.otp_codes.update_one({"phone": body.phone}, {"$set": {"code": code, "attempts": 0, "sent_at": now_iso(), "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()}}, upsert=True)
    result = send_message(body.phone, f"Your Shopkeeper's Day OTP is {code}. Valid for 5 minutes.")
    resp = {"status": "sent", "mock": result["mock"]}
    if result["mock"]:
        resp["dev_otp"] = code
    return resp


@api.post("/customer/otp/verify")
async def otp_verify(body: OtpVerifyIn):
    rec = await db.otp_codes.find_one({"phone": body.phone}, {"_id": 0})
    if not rec:
        raise HTTPException(401, "Invalid OTP")
    if rec.get("attempts", 0) >= 5:
        await db.otp_codes.delete_one({"phone": body.phone})
        raise HTTPException(429, "Too many wrong attempts. Request a new OTP.")
    if rec["code"] != body.otp:
        await db.otp_codes.update_one({"phone": body.phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(401, "Invalid OTP")
    if parse_dt(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(401, "OTP expired")
    await db.otp_codes.delete_one({"phone": body.phone})
    return {"token": make_token(body.phone, "customer")}


@api.get("/customer/khata")
async def customer_khata(session=Depends(get_customer_session)):
    phone = session["sub"]
    customers = await db.customers.find({"phone": phone}, {"_id": 0}).to_list(50)
    result = []
    for c in customers:
        shop = await db.users.find_one({"id": c["owner_id"]}, {"_id": 0, "shop_name": 1})
        entries = await db.ledger_entries.find({"customer_id": c["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        aging = compute_aging(entries, c.get("credit_threshold", 10000))
        result.append({"customer": c, "shop_name": (shop or {}).get("shop_name", ""), "entries": entries, **aging})
    return result


# ---------- Khata module ----------
@api.get("/khata/customers")
async def list_customers(user=Depends(get_shopkeeper)):
    custs = await db.customers.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
    return [await customer_with_aging(c) for c in custs]


@api.post("/khata/customers")
async def create_customer(body: CustomerIn, user=Depends(get_shopkeeper)):
    cust = {"id": str(uuid.uuid4()), "owner_id": user["id"], "name": body.name, "phone": body.phone,
            "credit_threshold": body.credit_threshold, "created_at": now_iso()}
    await db.customers.insert_one(dict(cust))
    cust.pop("_id", None)
    return await customer_with_aging(cust)


@api.put("/khata/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(get_shopkeeper)):
    r = await db.customers.update_one({"id": cid, "owner_id": user["id"]}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Customer not found")
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    return await customer_with_aging(cust)


@api.delete("/khata/customers/{cid}")
async def delete_customer(cid: str, user=Depends(get_shopkeeper)):
    await db.customers.delete_one({"id": cid, "owner_id": user["id"]})
    await db.ledger_entries.delete_many({"customer_id": cid})
    await db.sales.delete_many({"customer_id": cid, "owner_id": user["id"]})
    return {"deleted": True}


@api.get("/khata/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_shopkeeper)):
    cust = await db.customers.find_one({"id": cid, "owner_id": user["id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    cust = await customer_with_aging(cust)
    cust["entries"] = await db.ledger_entries.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return cust


@api.post("/khata/entries")
async def create_entry(body: EntryIn, user=Depends(get_shopkeeper)):
    if body.type not in ("credit", "payment"):
        raise HTTPException(400, "type must be credit or payment")
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if body.amount > CAP:
        raise HTTPException(400, f"Transaction blocked: amount exceeds \u20b91,00,00,000 cap")
    cust = await db.customers.find_one({"id": body.customer_id, "owner_id": user["id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    entry = {"id": str(uuid.uuid4()), "owner_id": user["id"], "customer_id": body.customer_id,
             "type": body.type, "amount": body.amount, "note": body.note, "created_at": now_iso()}
    await db.ledger_entries.insert_one(dict(entry))
    if body.type == "credit":
        await db.sales.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"], "customer_id": body.customer_id,
                                   "mode": "credit", "amount": body.amount, "items": [], "created_at": now_iso()})
    entry.pop("_id", None)
    return {"entry": entry, "soft_warning": body.amount >= SOFT_CAP}


@api.get("/khata/aging")
async def aging_summary(user=Depends(get_shopkeeper)):
    custs = await db.customers.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
    total = {"b0_30": 0, "b31_60": 0, "b60_plus": 0}
    overdue_count = 0
    outstanding = 0
    for c in custs:
        c = await customer_with_aging(c)
        for k in total:
            total[k] += c["buckets"][k]
        outstanding += c["balance"]
        if c["overdue"]:
            overdue_count += 1
    return {"buckets": total, "overdue_count": overdue_count, "outstanding": round(outstanding, 2)}


@api.post("/khata/customers/{cid}/remind")
async def send_reminder(cid: str, user=Depends(get_shopkeeper)):
    cust = await db.customers.find_one({"id": cid, "owner_id": user["id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    cust = await customer_with_aging(cust)
    link = "your khata link"
    body = f"Namaste {cust['name']}, you have \u20b9{cust['balance']:.0f} due at {user.get('shop_name', 'the shop')}. Please login with OTP to view your khata: {link}"
    sms = send_message(cust["phone"], body, "sms")
    wa = send_message(cust["phone"], body, "whatsapp")
    notif = {"id": str(uuid.uuid4()), "owner_id": user["id"], "type": "reminder_sent",
             "title": f"Reminder sent to {cust['name']}",
             "message": f"SMS + WhatsApp reminder for \u20b9{cust['balance']:.0f} due" + (" (MOCK - Twilio not configured)" if sms["mock"] else ""),
             "read": False, "created_at": now_iso()}
    await db.notifications.insert_one(dict(notif))
    return {"sms": sms, "whatsapp": wa, "mock": sms["mock"]}


# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(user=Depends(get_shopkeeper)):
    return await db.notifications.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(get_shopkeeper)):
    await db.notifications.update_one({"id": nid, "owner_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Inventory module ----------
@api.get("/inventory/products")
async def list_products(user=Depends(get_shopkeeper)):
    return await db.products.find({"owner_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(2000)


@api.post("/inventory/products")
async def create_product(body: ProductIn, user=Depends(get_shopkeeper)):
    prod = {"id": str(uuid.uuid4()), "owner_id": user["id"], **body.model_dump(), "created_at": now_iso()}
    await db.products.insert_one(dict(prod))
    prod.pop("_id", None)
    return prod


@api.put("/inventory/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(get_shopkeeper)):
    r = await db.products.update_one({"id": pid, "owner_id": user["id"]}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return await db.products.find_one({"id": pid}, {"_id": 0})


@api.delete("/inventory/products/{pid}")
async def delete_product(pid: str, user=Depends(get_shopkeeper)):
    await db.products.delete_one({"id": pid, "owner_id": user["id"]})
    return {"deleted": True}


@api.get("/inventory/low-stock")
async def low_stock(user=Depends(get_shopkeeper)):
    prods = await db.products.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
    return [p for p in prods if p["stock"] <= p.get("low_stock_threshold", 5)]


@api.post("/inventory/ocr")
async def bill_ocr(file: UploadFile = File(...), user=Depends(get_shopkeeper)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
    if (file.content_type or "") not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Only JPEG, PNG or WEBP images are supported")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image too large (max 8MB)")
    if not (content[:3] == b"\xff\xd8\xff" or content[:8] == b"\x89PNG\r\n\x1a\n" or content[:4] == b"RIFF"):
        raise HTTPException(415, "File content is not a valid image")
    suffix = ".jpg" if "jpe" in (file.content_type or "jpg") else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"ocr-{uuid.uuid4()}",
            system_message="You are a bill OCR engine for Indian retail shops. Extract line items from bill/invoice photos. Respond ONLY with valid JSON, no markdown."
        ).with_model("gemini", "gemini-3-flash-preview")
        prompt = ('Extract data from this bill image. Return ONLY JSON in this exact schema: '
                  '{"supplier_name": string, "bill_date": string, "items": [{"name": string, "qty": number, "unit_price": number, "total": number}], "grand_total": number}. '
                  'If a field is unreadable use empty string or 0. Prices in INR numbers only.')
        img = FileContentWithMimeType(file_path=tmp_path, mime_type=file.content_type or "image/jpeg")
        response = await chat.send_message(UserMessage(text=prompt, file_contents=[img]))
        text = re.sub(r'^```(json)?|```$', '', str(response).strip(), flags=re.MULTILINE).strip()
        data = json.loads(text)
        products = await db.products.find({"owner_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)
        for item in data.get("items", []):
            match = next((p for p in products if p["name"].lower() == str(item.get("name", "")).lower()), None)
            item["product_id"] = match["id"] if match else None
        return data
    except json.JSONDecodeError:
        raise HTTPException(422, "Could not parse bill. Try a clearer photo.")
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        raise HTTPException(500, f"OCR failed: {e}")
    finally:
        os.unlink(tmp_path)


@api.post("/inventory/stock-in")
async def stock_in(body: StockIn, user=Depends(get_shopkeeper)):
    total = sum(i.qty * i.unit_price for i in body.items)
    if total > CAP:
        raise HTTPException(400, "Bill blocked: total exceeds \u20b91,00,00,000 cap")
    updated = []
    for item in body.items:
        prod = None
        if item.product_id:
            prod = await db.products.find_one({"id": item.product_id, "owner_id": user["id"]}, {"_id": 0})
        if not prod:
            prod = await db.products.find_one({"owner_id": user["id"], "name": {"$regex": f"^{re.escape(item.name)}$", "$options": "i"}}, {"_id": 0})
        if prod:
            await db.products.update_one({"id": prod["id"]}, {"$inc": {"stock": item.qty}})
            updated.append({"product_id": prod["id"], "name": prod["name"], "qty": item.qty, "action": "updated"})
        else:
            new_prod = {"id": str(uuid.uuid4()), "owner_id": user["id"], "name": item.name, "sku": "",
                        "price": item.unit_price, "stock": item.qty, "low_stock_threshold": 5, "created_at": now_iso()}
            await db.products.insert_one(dict(new_prod))
            updated.append({"product_id": new_prod["id"], "name": item.name, "qty": item.qty, "action": "created"})
    bill = {"id": str(uuid.uuid4()), "owner_id": user["id"], "supplier_name": body.supplier_name,
            "items": [i.model_dump() for i in body.items], "total": total, "created_at": now_iso()}
    await db.bills.insert_one(dict(bill))
    return {"updated": updated, "total": total, "soft_warning": total >= SOFT_CAP}


@api.get("/inventory/bills")
async def list_bills(user=Depends(get_shopkeeper)):
    return await db.bills.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- Sales ----------
@api.post("/sales")
async def record_sale(body: SaleIn, user=Depends(get_shopkeeper)):
    if body.mode == "credit" and not body.customer_id:
        raise HTTPException(400, "customer_id required for credit sale")
    amount = 0
    items = []
    for it in body.items:
        prod = await db.products.find_one({"id": it.product_id, "owner_id": user["id"]}, {"_id": 0})
        if not prod:
            raise HTTPException(404, f"Product {it.product_id} not found")
        if prod["stock"] < it.qty:
            raise HTTPException(400, f"Insufficient stock for {prod['name']}")
        amount += prod["price"] * it.qty
        items.append({"product_id": prod["id"], "name": prod["name"], "qty": it.qty, "price": prod["price"]})
    if amount > CAP:
        raise HTTPException(400, "Sale blocked: exceeds \u20b91,00,00,000 cap")
    for it in items:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": -it["qty"]}})
    sale = {"id": str(uuid.uuid4()), "owner_id": user["id"], "customer_id": body.customer_id,
            "mode": body.mode, "amount": round(amount, 2), "items": items, "created_at": now_iso()}
    await db.sales.insert_one(dict(sale))
    if body.mode == "credit":
        names = ", ".join(f"{i['name']} x{i['qty']:g}" for i in items)
        await db.ledger_entries.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"], "customer_id": body.customer_id,
                                            "type": "credit", "amount": round(amount, 2), "note": f"Sale: {names}", "created_at": now_iso()})
    sale.pop("_id", None)
    return {"sale": sale, "soft_warning": amount >= SOFT_CAP}


# ---------- Suppliers module ----------
@api.get("/suppliers")
async def list_suppliers(user=Depends(get_shopkeeper)):
    return await db.suppliers.find({"owner_id": user["id"]}, {"_id": 0}).to_list(1000)


@api.post("/suppliers")
async def create_supplier(body: SupplierIn, user=Depends(get_shopkeeper)):
    sup = {"id": str(uuid.uuid4()), "owner_id": user["id"], **body.model_dump(), "created_at": now_iso()}
    await db.suppliers.insert_one(dict(sup))
    sup.pop("_id", None)
    return sup


@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: SupplierIn, user=Depends(get_shopkeeper)):
    r = await db.suppliers.update_one({"id": sid, "owner_id": user["id"]}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Supplier not found")
    return await db.suppliers.find_one({"id": sid}, {"_id": 0})


@api.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user=Depends(get_shopkeeper)):
    await db.suppliers.delete_one({"id": sid, "owner_id": user["id"]})
    return {"deleted": True}


@api.get("/suppliers/reorder-suggestions")
async def reorder_suggestions(user=Depends(get_shopkeeper)):
    prods = await db.products.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
    return [{"product_id": p["id"], "name": p["name"], "stock": p["stock"],
             "threshold": p.get("low_stock_threshold", 5),
             "suggested_qty": max(p.get("low_stock_threshold", 5) * 3 - p["stock"], 1)}
            for p in prods if p["stock"] <= p.get("low_stock_threshold", 5)]


@api.get("/suppliers/orders")
async def list_orders(user=Depends(get_shopkeeper)):
    return await db.purchase_orders.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/suppliers/orders")
async def create_order(body: OrderIn, user=Depends(get_shopkeeper)):
    sup = await db.suppliers.find_one({"id": body.supplier_id, "owner_id": user["id"]}, {"_id": 0})
    if not sup:
        raise HTTPException(404, "Supplier not found")
    order = {"id": str(uuid.uuid4()), "owner_id": user["id"], "supplier_id": sup["id"], "supplier_name": sup["name"],
             "items": [i.model_dump() for i in body.items], "status": "draft", "created_at": now_iso()}
    await db.purchase_orders.insert_one(dict(order))
    order.pop("_id", None)
    return order


@api.patch("/suppliers/orders/{oid}/status")
async def update_order_status(oid: str, request: Request, user=Depends(get_shopkeeper)):
    body = await request.json()
    status = body.get("status")
    if status not in ("draft", "sent", "received"):
        raise HTTPException(400, "Invalid status")
    order = await db.purchase_orders.find_one({"id": oid, "owner_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if status == "received" and order["status"] != "received":
        for it in order["items"]:
            await db.products.update_one({"id": it["product_id"], "owner_id": user["id"]}, {"$inc": {"stock": it["qty"]}})
    await db.purchase_orders.update_one({"id": oid}, {"$set": {"status": status}})
    return await db.purchase_orders.find_one({"id": oid}, {"_id": 0})


# ---------- Analytics ----------
@api.get("/analytics/summary")
async def analytics_summary(user=Depends(get_shopkeeper)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    sales = await db.sales.find({"owner_id": user["id"], "created_at": {"$gte": today_start}}, {"_id": 0}).to_list(5000)
    today_sales = sum(s["amount"] for s in sales)
    aging = await aging_summary(user)
    prods = await db.products.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
    low = [p for p in prods if p["stock"] <= p.get("low_stock_threshold", 5)]
    return {"today_sales": round(today_sales, 2), "today_txns": len(sales),
            "outstanding": aging["outstanding"], "overdue_count": aging["overdue_count"],
            "low_stock_count": len(low), "aging_buckets": aging["buckets"]}


@api.get("/analytics/sales")
async def analytics_sales(period: str = "daily", user=Depends(get_shopkeeper)):
    days = {"daily": 7, "weekly": 28, "monthly": 180}.get(period, 7)
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    sales = await db.sales.find({"owner_id": user["id"], "created_at": {"$gte": start}}, {"_id": 0}).to_list(10000)
    buckets = {}
    for s in sales:
        d = parse_dt(s["created_at"])
        if period == "weekly":
            key = (d - timedelta(days=d.weekday())).strftime("%d %b")
        elif period == "monthly":
            key = d.strftime("%b %Y")
        else:
            key = d.strftime("%d %b")
        buckets[key] = buckets.get(key, 0) + s["amount"]
    return [{"label": k, "amount": round(v, 2)} for k, v in buckets.items()]


@api.get("/analytics/top-items")
async def top_items(user=Depends(get_shopkeeper)):
    sales = await db.sales.find({"owner_id": user["id"]}, {"_id": 0}).to_list(10000)
    counts = {}
    for s in sales:
        for it in s.get("items", []):
            counts[it["name"]] = counts.get(it["name"], 0) + it["qty"]
    top = sorted(counts.items(), key=lambda x: -x[1])[:8]
    return [{"name": n, "qty": q} for n, q in top]


# ---------- Cron: overdue detection ----------
async def check_overdue_job():
    async for user in db.users.find({"role": "shopkeeper"}, {"_id": 0, "id": 1, "shop_name": 1}):
        custs = await db.customers.find({"owner_id": user["id"]}, {"_id": 0}).to_list(2000)
        for c in custs:
            c = await customer_with_aging(c)
            if c["overdue"]:
                exists = await db.notifications.find_one({"owner_id": user["id"], "type": "overdue", "customer_id": c["id"], "read": False})
                if not exists:
                    await db.notifications.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"], "type": "overdue",
                                                       "customer_id": c["id"], "title": f"{c['name']} is overdue",
                                                       "message": f"\u20b9{c['balance']:.0f} due for {c['oldest_days']} days",
                                                       "read": False, "created_at": now_iso()})


scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup():
    scheduler.add_job(check_overdue_job, "interval", hours=6, next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30))
    scheduler.start()


@api.post("/khata/run-overdue-check")
async def run_overdue_check(user=Depends(get_shopkeeper)):
    await check_overdue_job()
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

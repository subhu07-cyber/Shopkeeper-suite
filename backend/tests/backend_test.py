"""Backend API tests for The Shopkeeper's Day."""
import uuid

import pytest
import requests

from make_bill import build as build_bill


# ---------- Auth module ----------
class TestAuth:
    def test_login_success(self, api_url, test_credentials):
        r = requests.post(f"{api_url}/auth/login", json=test_credentials, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 10
        assert d["user"]["email"] == test_credentials["email"]
        assert d["user"]["role"] == "shopkeeper"
        assert "password_hash" not in d["user"]
        assert "_id" not in d["user"]

    def test_login_wrong_password(self, api_url, test_credentials):
        r = requests.post(f"{api_url}/auth/login",
                          json={"email": test_credentials["email"], "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_register_new_and_duplicate(self, api_url):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"name": "TEST User", "email": email, "password": "test123456", "shop_name": "TEST Shop"}
        r = requests.post(f"{api_url}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == email.lower()
        assert "token" in d
        # new account token works on /auth/me
        me = requests.get(f"{api_url}/auth/me", headers={"Authorization": f"Bearer {d['token']}"}, timeout=30)
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()
        # duplicate
        r2 = requests.post(f"{api_url}/auth/register", json=payload, timeout=30)
        assert r2.status_code == 400

    def test_me_requires_auth(self, api_url):
        assert requests.get(f"{api_url}/auth/me", timeout=30).status_code == 401
        assert requests.get(f"{api_url}/auth/me", headers={"Authorization": "Bearer junk"}, timeout=30).status_code == 401

    def test_bcrypt_hash_format(self):
        import asyncio, os
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")

        async def go():
            c = AsyncIOMotorClient(env["MONGO_URL"])
            u = await c[env["DB_NAME"]].users.find_one({"role": "shopkeeper"})
            c.close()
            return u

        u = asyncio.get_event_loop().run_until_complete(go()) if False else __import__("asyncio").run(go())
        assert u is not None
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]


# ---------- Khata module: customers, entries, aging, cap ----------
class TestKhata:
    created = []

    def test_list_customers_requires_auth(self, api_url):
        assert requests.get(f"{api_url}/khata/customers", timeout=30).status_code == 401

    def test_create_customer_and_persist(self, client, api_url):
        payload = {"name": "TEST Cust", "phone": f"+9199{uuid.uuid4().int % 100000000:08d}", "credit_threshold": 5000}
        r = client.post(f"{api_url}/khata/customers", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["credit_threshold"] == 5000
        assert d["balance"] == 0
        assert d["buckets"] == {"b0_30": 0, "b31_60": 0, "b60_plus": 0}
        assert "_id" not in d
        TestKhata.created.append(d["id"])
        # GET verify
        g = client.get(f"{api_url}/khata/customers/{d['id']}", timeout=30)
        assert g.status_code == 200
        assert g.json()["phone"] == payload["phone"]
        assert g.json()["entries"] == []

    def test_credit_and_payment_updates_balance(self, client, api_url):
        cid = TestKhata.created[0]
        r = client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "credit", "amount": 1500, "note": "TEST credit"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["entry"]["amount"] == 1500
        assert r.json()["soft_warning"] is False
        g = client.get(f"{api_url}/khata/customers/{cid}", timeout=30).json()
        assert g["balance"] == 1500
        assert g["buckets"]["b0_30"] == 1500
        # payment
        p = client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "payment", "amount": 500}, timeout=30)
        assert p.status_code == 200
        g2 = client.get(f"{api_url}/khata/customers/{cid}", timeout=30).json()
        assert g2["balance"] == 1000
        assert len(g2["entries"]) == 2

    def test_cap_hard_block(self, client, api_url):
        cid = TestKhata.created[0]
        r = client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "credit", "amount": 10000001}, timeout=30)
        assert r.status_code == 400, r.text
        assert "cap" in r.text.lower()

    def test_cap_soft_warning(self, client, api_url):
        payload = {"name": "TEST SoftCap", "phone": f"+9188{uuid.uuid4().int % 100000000:08d}", "credit_threshold": 100000000}
        cid = client.post(f"{api_url}/khata/customers", json=payload, timeout=30).json()["id"]
        TestKhata.created.append(cid)
        r = client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "credit", "amount": 8000000}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["soft_warning"] is True

    def test_invalid_entry_inputs(self, client, api_url):
        cid = TestKhata.created[0]
        assert client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "credit", "amount": -5}, timeout=30).status_code == 400
        assert client.post(f"{api_url}/khata/entries", json={"customer_id": cid, "type": "bogus", "amount": 5}, timeout=30).status_code == 400
        assert client.post(f"{api_url}/khata/entries", json={"customer_id": "nope", "type": "credit", "amount": 5}, timeout=30).status_code == 404

    def test_update_customer_persists(self, client, api_url):
        cid = TestKhata.created[0]
        r = client.put(f"{api_url}/khata/customers/{cid}", json={"name": "TEST Cust Renamed", "phone": "+919000000001", "credit_threshold": 7777}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST Cust Renamed"
        g = client.get(f"{api_url}/khata/customers/{cid}", timeout=30).json()
        assert g["credit_threshold"] == 7777
        assert g["name"] == "TEST Cust Renamed"

    def test_update_missing_customer_404(self, client, api_url):
        r = client.put(f"{api_url}/khata/customers/{uuid.uuid4()}", json={"name": "x", "phone": "y"}, timeout=30)
        assert r.status_code == 404

    def test_aging_summary(self, client, api_url):
        r = client.get(f"{api_url}/khata/aging", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert set(d["buckets"].keys()) == {"b0_30", "b31_60", "b60_plus"}
        assert d["outstanding"] >= 1000
        assert isinstance(d["overdue_count"], int)

    def test_send_reminder_mock_and_notification(self, client, api_url):
        cid = TestKhata.created[0]
        r = client.post(f"{api_url}/khata/customers/{cid}/remind", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mock"] is True
        assert d["sms"]["sent"] is True and d["whatsapp"]["sent"] is True
        notifs = client.get(f"{api_url}/notifications", timeout=30).json()
        assert any("TEST Cust Renamed" in n["title"] for n in notifs), notifs[:3]
        nid = notifs[0]["id"]
        assert client.post(f"{api_url}/notifications/{nid}/read", timeout=30).status_code == 200

    def test_overdue_check_job(self, client, api_url):
        assert client.post(f"{api_url}/khata/run-overdue-check", timeout=60).status_code == 200

    def test_delete_customers_cleanup(self, client, api_url):
        for cid in TestKhata.created:
            r = client.delete(f"{api_url}/khata/customers/{cid}", timeout=30)
            assert r.status_code == 200
            assert client.get(f"{api_url}/khata/customers/{cid}", timeout=30).status_code == 404


# ---------- Inventory module ----------
class TestInventory:
    pid = None

    def test_create_product(self, client, api_url):
        r = client.post(f"{api_url}/inventory/products", json={"name": "TEST Widget", "sku": "TW1", "price": 50, "stock": 20, "low_stock_threshold": 5}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST Widget" and d["price"] == 50 and d["stock"] == 20
        assert "_id" not in d
        TestInventory.pid = d["id"]
        prods = client.get(f"{api_url}/inventory/products", timeout=30).json()
        assert any(p["id"] == d["id"] for p in prods)

    def test_update_product_persists(self, client, api_url):
        r = client.put(f"{api_url}/inventory/products/{TestInventory.pid}",
                       json={"name": "TEST Widget Pro", "sku": "TW1", "price": 60, "stock": 20, "low_stock_threshold": 5}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["price"] == 60
        prods = client.get(f"{api_url}/inventory/products", timeout=30).json()
        assert next(p for p in prods if p["id"] == TestInventory.pid)["name"] == "TEST Widget Pro"

    def test_low_stock_list(self, client, api_url):
        r = client.get(f"{api_url}/inventory/low-stock", timeout=30)
        assert r.status_code == 200
        assert all(p["stock"] <= p.get("low_stock_threshold", 5) for p in r.json())

    def test_cash_sale_decrements_stock(self, client, api_url):
        before = next(p for p in client.get(f"{api_url}/inventory/products", timeout=30).json() if p["id"] == TestInventory.pid)["stock"]
        r = client.post(f"{api_url}/sales", json={"items": [{"product_id": TestInventory.pid, "qty": 2}], "mode": "cash"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["sale"]["amount"] == 120
        after = next(p for p in client.get(f"{api_url}/inventory/products", timeout=30).json() if p["id"] == TestInventory.pid)["stock"]
        assert after == before - 2

    def test_credit_sale_creates_ledger_entry(self, client, api_url):
        cust = client.post(f"{api_url}/khata/customers", json={"name": "TEST SaleCust", "phone": f"+9177{uuid.uuid4().int % 100000000:08d}"}, timeout=30).json()
        r = client.post(f"{api_url}/sales", json={"items": [{"product_id": TestInventory.pid, "qty": 3}], "mode": "credit", "customer_id": cust["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        g = client.get(f"{api_url}/khata/customers/{cust['id']}", timeout=30).json()
        assert g["balance"] == 180, g
        assert g["entries"][0]["type"] == "credit"
        assert "TEST Widget Pro" in g["entries"][0]["note"]
        client.delete(f"{api_url}/khata/customers/{cust['id']}", timeout=30)

    def test_credit_sale_without_customer_400(self, client, api_url):
        r = client.post(f"{api_url}/sales", json={"items": [{"product_id": TestInventory.pid, "qty": 1}], "mode": "credit"}, timeout=30)
        assert r.status_code == 400

    def test_insufficient_stock_400(self, client, api_url):
        r = client.post(f"{api_url}/sales", json={"items": [{"product_id": TestInventory.pid, "qty": 99999}], "mode": "cash"}, timeout=30)
        assert r.status_code == 400
        assert "stock" in r.text.lower()

    def test_sale_unknown_product_404(self, client, api_url):
        r = client.post(f"{api_url}/sales", json={"items": [{"product_id": str(uuid.uuid4()), "qty": 1}], "mode": "cash"}, timeout=30)
        assert r.status_code == 404

    def test_stock_in_updates_and_creates(self, client, api_url):
        before = next(p for p in client.get(f"{api_url}/inventory/products", timeout=30).json() if p["id"] == TestInventory.pid)["stock"]
        new_name = f"TEST NewFromBill {uuid.uuid4().hex[:5]}"
        r = client.post(f"{api_url}/inventory/stock-in", json={"supplier_name": "TEST Supplier",
                        "items": [{"name": "TEST Widget Pro", "qty": 5, "unit_price": 60, "product_id": TestInventory.pid},
                                  {"name": new_name, "qty": 7, "unit_price": 12}]}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        actions = {u["action"] for u in d["updated"]}
        assert actions == {"updated", "created"}, d
        assert d["total"] == 5 * 60 + 7 * 12
        prods = client.get(f"{api_url}/inventory/products", timeout=30).json()
        assert next(p for p in prods if p["id"] == TestInventory.pid)["stock"] == before + 5
        newp = next(p for p in prods if p["name"] == new_name)
        assert newp["stock"] == 7 and newp["price"] == 12
        # bills list
        bills = client.get(f"{api_url}/inventory/bills", timeout=30).json()
        assert any(b["supplier_name"] == "TEST Supplier" for b in bills)
        client.delete(f"{api_url}/inventory/products/{newp['id']}", timeout=30)

    def test_stock_in_cap_block(self, client, api_url):
        r = client.post(f"{api_url}/inventory/stock-in", json={"items": [{"name": "TEST Big", "qty": 1, "unit_price": 10000001}]}, timeout=30)
        assert r.status_code == 400

    def test_delete_product(self, client, api_url):
        assert client.delete(f"{api_url}/inventory/products/{TestInventory.pid}", timeout=30).status_code == 200
        prods = client.get(f"{api_url}/inventory/products", timeout=30).json()
        assert not any(p["id"] == TestInventory.pid for p in prods)


# ---------- Bill OCR (Gemini via emergentintegrations) ----------
class TestOCR:
    def test_ocr_bill_image(self, client, api_url):
        path = build_bill()
        with open(path, "rb") as f:
            r = client.post(f"{api_url}/inventory/ocr", files={"file": ("bill.png", f, "image/png")}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        d = r.json()
        assert "items" in d and len(d["items"]) >= 2, d
        names = " ".join(str(i.get("name", "")).lower() for i in d["items"])
        assert "salt" in names or "atta" in names, d
        for it in d["items"]:
            assert "product_id" in it
            assert it.get("qty") is not None and it.get("unit_price") is not None

    def test_ocr_requires_auth(self, api_url):
        path = build_bill()
        with open(path, "rb") as f:
            r = requests.post(f"{api_url}/inventory/ocr", files={"file": ("bill.png", f, "image/png")}, timeout=60)
        assert r.status_code == 401


# ---------- Suppliers & purchase orders ----------
class TestSuppliers:
    sid = None
    pid = None
    oid = None

    def test_create_supplier(self, client, api_url):
        r = client.post(f"{api_url}/suppliers", json={"name": "TEST Distributors", "phone": "+919000011111", "address": "Test St"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST Distributors"
        TestSuppliers.sid = r.json()["id"]
        assert any(s["id"] == TestSuppliers.sid for s in client.get(f"{api_url}/suppliers", timeout=30).json())

    def test_update_supplier(self, client, api_url):
        r = client.put(f"{api_url}/suppliers/{TestSuppliers.sid}", json={"name": "TEST Distributors 2", "phone": "+919000011111"}, timeout=30)
        assert r.status_code == 200 and r.json()["name"] == "TEST Distributors 2"

    def test_reorder_suggestions(self, client, api_url):
        p = client.post(f"{api_url}/inventory/products", json={"name": "TEST LowItem", "price": 30, "stock": 2, "low_stock_threshold": 5}, timeout=30).json()
        TestSuppliers.pid = p["id"]
        r = client.get(f"{api_url}/suppliers/reorder-suggestions", timeout=30)
        assert r.status_code == 200, r.text
        sug = next((s for s in r.json() if s["product_id"] == p["id"]), None)
        assert sug is not None, r.json()
        assert sug["suggested_qty"] == 13

    def test_po_lifecycle_increments_stock(self, client, api_url):
        r = client.post(f"{api_url}/suppliers/orders", json={"supplier_id": TestSuppliers.sid,
                        "items": [{"product_id": TestSuppliers.pid, "name": "TEST LowItem", "qty": 10}]}, timeout=30)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "draft" and o["supplier_name"] == "TEST Distributors 2"
        TestSuppliers.oid = o["id"]
        s = client.patch(f"{api_url}/suppliers/orders/{o['id']}/status", json={"status": "sent"}, timeout=30)
        assert s.status_code == 200 and s.json()["status"] == "sent"
        rec = client.patch(f"{api_url}/suppliers/orders/{o['id']}/status", json={"status": "received"}, timeout=30)
        assert rec.status_code == 200 and rec.json()["status"] == "received"
        prod = next(p for p in client.get(f"{api_url}/inventory/products", timeout=30).json() if p["id"] == TestSuppliers.pid)
        assert prod["stock"] == 12, prod
        assert any(x["id"] == o["id"] for x in client.get(f"{api_url}/suppliers/orders", timeout=30).json())

    def test_po_invalid_status_and_supplier(self, client, api_url):
        assert client.patch(f"{api_url}/suppliers/orders/{TestSuppliers.oid}/status", json={"status": "bogus"}, timeout=30).status_code == 400
        assert client.post(f"{api_url}/suppliers/orders", json={"supplier_id": str(uuid.uuid4()), "items": []}, timeout=30).status_code == 404

    def test_cleanup(self, client, api_url):
        assert client.delete(f"{api_url}/suppliers/{TestSuppliers.sid}", timeout=30).status_code == 200
        assert client.delete(f"{api_url}/inventory/products/{TestSuppliers.pid}", timeout=30).status_code == 200


# ---------- Analytics ----------
class TestAnalytics:
    def test_summary(self, client, api_url):
        r = client.get(f"{api_url}/analytics/summary", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("today_sales", "today_txns", "outstanding", "overdue_count", "low_stock_count", "aging_buckets"):
            assert k in d, d
        assert isinstance(d["today_txns"], int)

    @pytest.mark.parametrize("period", ["daily", "weekly", "monthly"])
    def test_sales_periods(self, client, api_url, period):
        r = client.get(f"{api_url}/analytics/sales", params={"period": period}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for row in data:
            assert "label" in row and "amount" in row

    def test_top_items(self, client, api_url):
        r = client.get(f"{api_url}/analytics/top-items", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Customer OTP portal (Twilio MOCKED) ----------
class TestCustomerPortal:
    def test_otp_flow_and_khata(self, client, api_url):
        phone = "+919876543210"
        r = requests.post(f"{api_url}/customer/otp/send", json={"phone": phone}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mock"] is True and "dev_otp" in d
        otp = d["dev_otp"]
        bad = requests.post(f"{api_url}/customer/otp/verify", json={"phone": phone, "otp": "000000"}, timeout=30)
        assert bad.status_code == 401
        v = requests.post(f"{api_url}/customer/otp/verify", json={"phone": phone, "otp": otp}, timeout=30)
        assert v.status_code == 200, v.text
        ctoken = v.json()["token"]
        k = requests.get(f"{api_url}/customer/khata", headers={"Authorization": f"Bearer {ctoken}"}, timeout=30)
        assert k.status_code == 200, k.text
        data = k.json()
        assert len(data) >= 1
        rec = data[0]
        assert rec["customer"]["phone"] == phone
        assert "balance" in rec and "buckets" in rec and "entries" in rec
        assert rec["shop_name"]
        # customer token must NOT access shopkeeper APIs
        f = requests.get(f"{api_url}/khata/customers", headers={"Authorization": f"Bearer {ctoken}"}, timeout=30)
        assert f.status_code == 403, f.status_code

    def test_otp_unknown_phone_404(self, api_url):
        r = requests.post(f"{api_url}/customer/otp/send", json={"phone": "+910000000000"}, timeout=30)
        assert r.status_code == 404

    def test_shopkeeper_token_cannot_access_customer_khata(self, client, api_url):
        r = client.get(f"{api_url}/customer/khata", timeout=30)
        assert r.status_code == 403

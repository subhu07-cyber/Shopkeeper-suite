"""Tests for iteration-2 features: /api/analytics/digest and product barcode field."""
import requests
from conftest import API


# ---------- Module: analytics digest ----------
class TestDigest:
    def test_digest_requires_auth(self, anon):
        r = anon.get(f"{API}/analytics/digest", timeout=30)
        assert r.status_code in (401, 403), r.text[:300]

    def test_digest_shape(self, client):
        r = client.get(f"{API}/analytics/digest", timeout=30)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        for k in ["yesterday_sales", "yesterday_txns", "new_dues", "new_dues_count",
                  "reorder_count", "reorder_items"]:
            assert k in d, f"missing {k} in {d}"
        assert isinstance(d["yesterday_sales"], (int, float))
        assert isinstance(d["yesterday_txns"], int)
        assert isinstance(d["new_dues"], (int, float))
        assert isinstance(d["new_dues_count"], int)
        assert isinstance(d["reorder_count"], int)
        assert isinstance(d["reorder_items"], list)
        assert len(d["reorder_items"]) <= 5
        assert "_id" not in str(d)

    def test_digest_seeded_yesterday_sale(self, client):
        d = client.get(f"{API}/analytics/digest", timeout=30).json()
        # seeded: one cash sale of 1240 dated yesterday
        assert d["yesterday_txns"] >= 1, f"expected >=1 yesterday txn, got {d}"
        assert d["yesterday_sales"] >= 1240, f"expected >=1240 yesterday sales, got {d}"

    def test_digest_reorder_matches_products(self, client):
        d = client.get(f"{API}/analytics/digest", timeout=30).json()
        prods = client.get(f"{API}/inventory/products", timeout=30).json()
        low = [p["name"] for p in prods if p["stock"] <= p.get("low_stock_threshold", 5)]
        assert d["reorder_count"] == len(low), f"digest {d['reorder_count']} vs computed {len(low)}"
        assert set(d["reorder_items"]).issubset(set(low))


# ---------- Module: product barcode ----------
class TestProductBarcode:
    created = []

    def test_existing_product_has_barcode(self, client):
        prods = client.get(f"{API}/inventory/products", timeout=30).json()
        parle = [p for p in prods if p["name"] == "Parle-G 100g"]
        assert parle, "Parle-G 100g not found"
        assert parle[0].get("barcode") == "8901719100017", parle[0]

    def test_create_with_barcode_persists(self, client):
        payload = {"name": "TEST_Barcode Item", "sku": "TEST_SKU1", "barcode": "9998887776665",
                   "price": 25.5, "stock": 10, "low_stock_threshold": 3}
        r = client.post(f"{API}/inventory/products", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:500]
        p = r.json()
        assert p["barcode"] == "9998887776665"
        pid = p["id"]
        TestProductBarcode.created.append(pid)
        # verify persistence via GET list
        prods = client.get(f"{API}/inventory/products", timeout=30).json()
        got = [x for x in prods if x["id"] == pid]
        assert got and got[0]["barcode"] == "9998887776665", got

    def test_update_barcode_persists(self, client):
        assert TestProductBarcode.created, "create test must run first"
        pid = TestProductBarcode.created[0]
        r = client.put(f"{API}/inventory/products/{pid}",
                       json={"name": "TEST_Barcode Item", "sku": "TEST_SKU1",
                             "barcode": "1112223334445", "price": 30, "stock": 12,
                             "low_stock_threshold": 3}, timeout=30)
        assert r.status_code == 200, r.text[:500]
        assert r.json()["barcode"] == "1112223334445"
        prods = client.get(f"{API}/inventory/products", timeout=30).json()
        got = [x for x in prods if x["id"] == pid]
        assert got and got[0]["barcode"] == "1112223334445", got

    def test_barcode_optional(self, client):
        r = client.post(f"{API}/inventory/products",
                        json={"name": "TEST_NoBarcode", "price": 5, "stock": 1}, timeout=30)
        assert r.status_code in (200, 201), r.text[:500]
        p = r.json()
        assert p.get("barcode") == ""
        TestProductBarcode.created.append(p["id"])

    def test_zz_cleanup(self, client):
        for pid in TestProductBarcode.created:
            r = client.delete(f"{API}/inventory/products/{pid}", timeout=30)
            assert r.status_code in (200, 204, 404), r.text[:200]
        TestProductBarcode.created.clear()


# ---------- Module: regression basics ----------
class TestRegression:
    def test_summary(self, client):
        r = client.get(f"{API}/analytics/summary", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["today_sales", "today_txns", "outstanding", "overdue_count"]:
            assert k in d, f"missing {k} in {d}"

    def test_customer_crud_and_credit_entry(self, client):
        r = client.post(f"{API}/khata/customers",
                        json={"name": "TEST_Offline Cust", "phone": "+919000000111"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:400]
        cid = r.json()["id"]
        try:
            e = client.post(f"{API}/khata/entries",
                            json={"customer_id": cid, "type": "credit", "amount": 100,
                                  "note": "TEST_regression"}, timeout=30)
            assert e.status_code in (200, 201), e.text[:400]
            det = client.get(f"{API}/khata/customers/{cid}", timeout=30)
            assert det.status_code == 200, det.text[:300]
            body = det.json()
            assert body["balance"] == 100, body
            assert any(x["note"] == "TEST_regression" for x in body["entries"]), body["entries"]
        finally:
            client.delete(f"{API}/khata/customers/{cid}", timeout=30)

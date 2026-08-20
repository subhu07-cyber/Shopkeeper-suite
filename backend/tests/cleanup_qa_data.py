"""Cleanup QA/TEST artifacts created during UI testing (not a test)."""
import os
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE}/api"
tok = requests.post(f"{API}/auth/login", json={"email": "ssjrocks6969@gmail.com", "password": "shop123456"}, timeout=30).json()["token"]
h = {"Authorization": f"Bearer {tok}"}

for p in requests.get(f"{API}/inventory/products", headers=h, timeout=30).json():
    if p["name"].startswith(("QA ", "TEST ")) or p["name"] in ("Aashirvaad Atta 5kg", "Amul Butter 500g", "Parle-G Biscuit"):
        print("del product", p["name"], requests.delete(f"{API}/inventory/products/{p['id']}", headers=h, timeout=30).status_code)

for c in requests.get(f"{API}/khata/customers", headers=h, timeout=30).json():
    if c["name"].startswith(("QA ", "TEST ")):
        print("del customer", c["name"], requests.delete(f"{API}/khata/customers/{c['id']}", headers=h, timeout=30).status_code)

for s in requests.get(f"{API}/suppliers", headers=h, timeout=30).json():
    if s["name"].startswith(("QA ", "TEST ")):
        print("del supplier", s["name"], requests.delete(f"{API}/suppliers/{s['id']}", headers=h, timeout=30).status_code)

print("remaining products:", [p["name"] for p in requests.get(f"{API}/inventory/products", headers=h, timeout=30).json()])
print("remaining customers:", [c["name"] for c in requests.get(f"{API}/khata/customers", headers=h, timeout=30).json()])
print("summary:", requests.get(f"{API}/analytics/summary", headers=h, timeout=30).json())

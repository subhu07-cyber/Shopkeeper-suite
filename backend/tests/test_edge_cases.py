"""Edge-case / security probes: OCR invalid file, brute force, rate limiting."""
import requests


class TestEdgeCases:
    def test_ocr_rejects_non_image(self, client, api_url):
        r = client.post(f"{api_url}/inventory/ocr",
                        files={"file": ("notes.txt", b"this is not an image at all", "text/plain")}, timeout=120)
        print("OCR non-image status:", r.status_code, r.text[:200])
        assert r.status_code in (400, 415, 422), f"expected 4xx validation error, got {r.status_code}"

    def test_login_brute_force_lockout(self, api_url, test_credentials):
        codes = []
        for _ in range(7):
            r = requests.post(f"{api_url}/auth/login",
                              json={"email": test_credentials["email"], "password": "wrong-pass"}, timeout=30)
            codes.append(r.status_code)
        print("login failure codes:", codes)
        # strict lockout per auth playbook: valid creds may also be blocked (429) during the 15-min window
        ok = requests.post(f"{api_url}/auth/login", json=test_credentials, timeout=30)
        assert ok.status_code in (200, 429), "unexpected status for valid credentials after repeated failures"
        assert 429 in codes or 423 in codes, "no rate limit/lockout after 5+ failed logins"

    def test_otp_verify_brute_force(self, api_url):
        requests.post(f"{api_url}/customer/otp/send", json={"phone": "+919876543210"}, timeout=30)
        codes = []
        for i in range(12):
            r = requests.post(f"{api_url}/customer/otp/verify",
                              json={"phone": "+919876543210", "otp": f"{i:06d}"}, timeout=30)
            codes.append(r.status_code)
        print("otp verify codes:", codes)
        assert 429 in codes, "unlimited OTP verify attempts allowed (brute-force risk)"

    def test_weak_password_rejected_on_register(self, api_url):
        r = requests.post(f"{api_url}/auth/register",
                          json={"name": "TEST W", "email": "TEST_weakpw_probe@example.com", "password": "1", "shop_name": "S"}, timeout=30)
        print("weak password register status:", r.status_code)
        assert r.status_code == 422 or r.status_code == 400, "backend accepts 1-char password"

    def test_invalid_email_rejected(self, api_url):
        r = requests.post(f"{api_url}/auth/register",
                          json={"name": "TEST E", "email": "not-an-email", "password": "abcdef12", "shop_name": "S"}, timeout=30)
        print("invalid email register status:", r.status_code)
        assert r.status_code in (400, 422), "backend accepts malformed email"

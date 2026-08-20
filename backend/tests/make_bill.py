"""Generate a synthetic bill image (PNG) for OCR testing."""
from PIL import Image, ImageDraw

W, H = 700, 520


def build(path="/tmp/test_bill.png"):
    img = Image.new("RGB", (W, H), (250, 248, 240))
    d = ImageDraw.Draw(img)
    # header band + borders for real visual features
    d.rectangle([0, 0, W, 60], fill=(30, 60, 110))
    d.text((20, 22), "SHREE TRADERS - WHOLESALE BILL", fill=(255, 255, 255))
    d.text((20, 80), "Date: 12/07/2026        Bill No: ST-4471", fill=(20, 20, 20))
    d.line([15, 105, W - 15, 105], fill=(0, 0, 0), width=2)
    d.text((20, 118), "ITEM                 QTY     RATE     AMOUNT", fill=(0, 0, 0))
    d.line([15, 135, W - 15, 135], fill=(0, 0, 0), width=1)
    rows = [
        ("Tata Salt 1kg", 10, 25, 250),
        ("Aashirvaad Atta 5kg", 4, 260, 1040),
        ("Amul Butter 500g", 6, 285, 1710),
        ("Parle-G Biscuit", 20, 10, 200),
    ]
    y = 155
    for name, qty, rate, amt in rows:
        d.text((20, y), f"{name:<22}{qty:<8}{rate:<9}{amt}", fill=(15, 15, 15))
        y += 34
    d.line([15, y + 5, W - 15, y + 5], fill=(0, 0, 0), width=2)
    d.text((20, y + 20), "GRAND TOTAL:                        3200", fill=(0, 0, 0))
    d.rectangle([15, 15, W - 15, H - 15], outline=(90, 90, 90), width=2)
    d.text((20, y + 60), "Thank you! Goods once sold not returnable.", fill=(80, 80, 80))
    img = img.resize((W * 2, H * 2), Image.LANCZOS)
    img.save(path)
    return path


if __name__ == "__main__":
    print(build())

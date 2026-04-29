"""
Generate OG social preview image for GroundWork PM.
Output: public/og-image.png (1200x630px)

Usage:
    python scripts/generate_og_image.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(BASE_DIR, "Logo", "GroundWorkPM Logo.png")
OUT_PATH = os.path.join(BASE_DIR, "public", "og-image.png")

# ── Brand colours ──────────────────────────────────────────────────────────────
NAVY   = (19, 38, 53)    # #132635
CREAM  = (250, 247, 242) # #FAF7F2
GOLD   = (184, 152, 90)  # #B8985A

# ── Canvas ─────────────────────────────────────────────────────────────────────
W, H = 1200, 630
img = Image.new("RGB", (W, H), NAVY)
draw = ImageDraw.Draw(img)

# ── Subtle gradient overlay (darker at top/bottom edges) ───────────────────────
for y in range(H):
    alpha = int(30 * (1 - abs(y - H / 2) / (H / 2)))
    draw.line([(0, y), (W, y)], fill=tuple(max(0, c - alpha) for c in NAVY))

# ── Decorative gold accent lines ───────────────────────────────────────────────
draw.rectangle([0, H - 4, W, H], fill=GOLD)
draw.rectangle([0, 0, W, 3], fill=(255, 255, 255, 20))

# ── Logo ───────────────────────────────────────────────────────────────────────
try:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo_h = 80
    ratio = logo_h / logo.height
    logo_w = int(logo.width * ratio)
    logo = logo.resize((logo_w, logo_h), Image.LANCZOS)

    # Centre horizontally, position in upper third
    logo_x = (W - logo_w) // 2
    logo_y = 160
    img.paste(logo, (logo_x, logo_y), logo)
    text_start_y = logo_y + logo_h + 36
except Exception as e:
    print(f"Warning: could not load logo ({e}) — skipping logo")
    text_start_y = 200

# ── Typography — try system fonts, fall back to default ───────────────────────
def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf" if not bold else "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arial.ttf"   if not bold else "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

font_heading = load_font(48, bold=True)
font_sub     = load_font(26)
font_url     = load_font(20)

# ── Heading ────────────────────────────────────────────────────────────────────
heading = "Professional Property Management"
bbox = draw.textbbox((0, 0), heading, font=font_heading)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, text_start_y), heading, font=font_heading, fill=CREAM)

# ── Sub-heading ────────────────────────────────────────────────────────────────
sub = "Income · Expenses · Occupancy · Maintenance · Reporting"
bbox2 = draw.textbbox((0, 0), sub, font=font_sub)
tw2 = bbox2[2] - bbox2[0]
draw.text(((W - tw2) // 2, text_start_y + 68), sub, font=font_sub, fill=GOLD)

# ── Domain pill ────────────────────────────────────────────────────────────────
url_text = "groundworkpm.com"
bbox3 = draw.textbbox((0, 0), url_text, font=font_url)
tw3 = bbox3[2] - bbox3[0]
pill_x = (W - tw3) // 2 - 20
pill_y = text_start_y + 140
pill_w = tw3 + 40
pill_h = 36
draw.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + pill_h], radius=18, fill=(255, 255, 255, 0), outline=GOLD, width=1)
draw.text(((W - tw3) // 2, pill_y + 8), url_text, font=font_url, fill=(200, 200, 200))

# ── Save ───────────────────────────────────────────────────────────────────────
img.save(OUT_PATH, "PNG", optimize=True)
print(f"OG image saved: {OUT_PATH}")
print(f"Size: {W}x{H}px")

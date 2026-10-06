# Sample photos for the inspection / guest-stay tutorials and guide shots.
# Run from the repo root: python scripts/record-tutorials/make-photo-fixtures.py (needs Pillow).
# Flat illustrations, clearly not real: the recorder "takes" these on camera
# (local dev has no file storage) — see scripts/record-tutorials/fake-storage.ts.
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join("scripts", "record-tutorials", "fixtures", "photos")
os.makedirs(OUT, exist_ok=True)
W, H = 1200, 900

def font(size):
    for f in ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def base(wall, floor, horizon=600):
    im = Image.new("RGB", (W, H), wall)
    d = ImageDraw.Draw(im)
    d.rectangle([0, horizon, W, H], fill=floor)
    # floor boards / tiles texture
    for x in range(0, W, 90):
        d.line([x, horizon, x - 60, H], fill=tuple(max(0, c - 18) for c in floor), width=2)
    # skirting
    d.rectangle([0, horizon - 14, W, horizon], fill=(240, 236, 228))
    return im, d

def window(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h], fill=(196, 224, 240), outline=(250, 250, 250), width=14)
    d.line([x + w // 2, y, x + w // 2, y + h], fill=(250, 250, 250), width=10)
    d.line([x, y + h // 2, x + w, y + h // 2], fill=(250, 250, 250), width=10)

def light(d, x):
    d.line([x, 0, x, 70], fill=(80, 80, 80), width=4)
    d.ellipse([x - 45, 60, x + 45, 120], fill=(250, 236, 190))

def save(im, name):
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(os.path.join(OUT, name), "JPEG", quality=78)

# Living room
im, d = base((214, 205, 190), (150, 112, 80))
window(d, 760, 140, 300, 300)
light(d, 400)
d.rounded_rectangle([140, 400, 640, 620], 30, fill=(70, 98, 120))
d.rounded_rectangle([110, 360, 670, 470], 30, fill=(86, 116, 140))
d.rectangle([700, 520, 900, 640], fill=(120, 84, 56))
d.ellipse([260, 640, 760, 760], fill=(190, 160, 120))
save(im, "living-room.jpg")

# Kitchen
im, d = base((232, 228, 220), (180, 180, 176), horizon=640)
d.rectangle([60, 120, 1140, 300], fill=(238, 238, 236), outline=(200, 200, 200), width=4)
for x in range(60, 1140, 216):
    d.rectangle([x + 8, 128, x + 208, 292], outline=(205, 205, 205), width=3)
d.rectangle([60, 430, 1140, 470], fill=(70, 70, 74))
d.rectangle([60, 470, 1140, 640], fill=(238, 238, 236))
for x in range(60, 1140, 216):
    d.rectangle([x + 8, 478, x + 208, 632], outline=(205, 205, 205), width=3)
d.rectangle([480, 440, 720, 470], fill=(200, 205, 210))
d.line([600, 360, 600, 440], fill=(160, 165, 170), width=10)
d.line([600, 360, 650, 360], fill=(160, 165, 170), width=10)
save(im, "kitchen.jpg")

# Bathroom (tiles)
im, d = base((236, 240, 242), (200, 205, 210), horizon=700)
for y in range(0, 700, 80):
    for x in range(0, W, 80):
        d.rectangle([x, y, x + 78, y + 78], outline=(210, 216, 220), width=2)
d.rectangle([150, 420, 470, 700], fill=(250, 250, 250), outline=(220, 220, 220), width=4)
d.ellipse([200, 380, 420, 470], fill=(252, 252, 252), outline=(215, 215, 215), width=4)
d.rectangle([700, 380, 1020, 440], fill=(252, 252, 252), outline=(215, 215, 215), width=4)
d.rectangle([800, 440, 920, 700], fill=(245, 245, 245))
d.rectangle([760, 100, 960, 340], fill=(200, 220, 232), outline=(170, 170, 170), width=8)
save(im, "bathroom.jpg")

# Bedroom
im, d = base((206, 214, 222), (140, 104, 74))
window(d, 120, 140, 260, 280)
light(d, 700)
d.rectangle([500, 330, 1080, 470], fill=(110, 80, 60))
d.rectangle([480, 470, 1100, 690], fill=(245, 245, 240))
d.rectangle([480, 560, 1100, 690], fill=(160, 190, 200))
d.rounded_rectangle([530, 420, 760, 500], 20, fill=(255, 255, 255))
d.rounded_rectangle([820, 420, 1050, 500], 20, fill=(255, 255, 255))
save(im, "bedroom.jpg")

# Damage: cracked mirror / chipped sink close-up
im = Image.new("RGB", (W, H), (236, 240, 242))
d = ImageDraw.Draw(im)
d.rectangle([200, 80, 1000, 620], fill=(200, 220, 232), outline=(150, 150, 150), width=16)
random.seed(4)
cx, cy = 640, 300
for _ in range(9):
    x, y = cx, cy
    for _ in range(6):
        nx, ny = x + random.randint(-90, 90), y + random.randint(-80, 80)
        d.line([x, y, nx, ny], fill=(90, 100, 110), width=3)
        x, y = nx, ny
d.rectangle([300, 680, 900, 760], fill=(250, 250, 250), outline=(210, 210, 210), width=4)
save(im, "damage.jpg")

# Scuffed wall
im, d = base((214, 205, 190), (150, 112, 80))
random.seed(7)
for _ in range(40):
    x, y = random.randint(250, 950), random.randint(250, 520)
    d.line([x, y, x + random.randint(20, 90), y + random.randint(-6, 6)], fill=(150, 140, 125), width=random.randint(2, 6))
for x, y in [(420, 330), (700, 300), (560, 420)]:
    d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(110, 100, 90))
save(im, "wall-damage.jpg")

# Sample ID card — clearly marked as not real
im = Image.new("RGB", (W, H), (48, 52, 58))
d = ImageDraw.Draw(im)
d.rounded_rectangle([150, 200, 1050, 740], 40, fill=(236, 242, 236), outline=(160, 180, 160), width=6)
d.rectangle([150, 200, 1050, 300], fill=(60, 120, 90))
d.text((200, 222), "SAMPLE IDENTITY CARD", font=font(54), fill=(255, 255, 255))
d.rounded_rectangle([210, 350, 450, 650], 20, fill=(190, 196, 204))
d.ellipse([270, 390, 390, 510], fill=(150, 156, 166))
d.rounded_rectangle([250, 520, 410, 640], 40, fill=(150, 156, 166))
for i, (k, v) in enumerate([("NAME", "AMINA WANJIRU"), ("ID NO.", "SAMPLE 0000000"), ("NATIONALITY", "KENYAN")]):
    d.text((500, 360 + i * 100), k, font=font(30), fill=(110, 120, 110))
    d.text((500, 396 + i * 100), v, font=font(44), fill=(30, 40, 30))
d.text((420, 680), "NOT A REAL DOCUMENT", font=font(34), fill=(190, 60, 60))
save(im, "id-card.jpg")

print(sorted(os.listdir(OUT)))

# Stock tenant signature (used when a seed or screenshot needs one without drawing it)
import math
sig = Image.new("RGBA", (600, 200), (255, 255, 255, 0))
sd = ImageDraw.Draw(sig)
pts = [(60 + i * 4.6, 110 + 38 * math.sin(i / 6.0) * (1 if i < 60 else 0.6) - (i % 23) * 0.6) for i in range(100)]
sd.line(pts, fill=(20, 30, 60, 255), width=5, joint="curve")
sd.line([(380, 150), (540, 150)], fill=(20, 30, 60, 255), width=3)
sig.save(os.path.join(OUT, "signature.png"))

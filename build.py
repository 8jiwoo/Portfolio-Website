# Turns the flat-colour panorama into the site's textures:
#   pano.webp / pano_4k.webp  recoloured + cel-shaded artwork
#   ids.png                   which clickable object each pixel belongs to
#   emis.png                  R = lamp shades, G = screens, B = window panes
#   meta.js                   where objects / lamps / screens sit on the sphere
# usage: python build.py <source 8192x4096 image> <output dir>
import numpy as np, json, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from masks import make_ids
from objs import OBJ, R, SHADES, LAMPS, SCREENS, FRAME
Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2]
rng = np.random.RandomState(7)
a0 = np.asarray(Image.open(SRC).convert('RGB'))
H, W = a0.shape[:2]
assert (W, H) == (8192, 4096), 'coordinates in objs.py assume 8192x4096'
line = a0.max(2) < 30
lon = (np.arange(W) / W - 0.5) * 2 * np.pi
lat = (0.5 - np.arange(H) / H) * np.pi
out = a0.astype(np.float32)

def rects(rs):
    m = np.zeros((H, W), bool)
    for r in rs: m[r[0][1]:r[2][1], r[0][0]:r[2][0]] = True
    return m
def near(c, tol, sl=(slice(None), slice(None))):
    return (np.abs(a0[sl].astype(np.int16) - np.array(c, np.int16)).max(2) <= tol)
def big(mask, minarea):
    l, n = ndi.label(mask); sz = np.bincount(l.ravel()); return (sz >= minarea)[l] & mask
def smooth_noise(scale, sigma):
    n = ndi.gaussian_filter(rng.rand(H // scale, W // scale).astype(np.float32), sigma, mode='wrap')
    n = (n - n.min()) / (n.max() - n.min())
    return np.asarray(Image.fromarray(n).resize((W, H), Image.BILINEAR))

# ---------- object id mask ----------
ids = make_ids(a0, line)

# ---------- floor: every plank recoloured from one consistent palette ----------
r, g, b = [a0[..., i].astype(np.int16) for i in range(3)]
wood = (r >= 150) & (r <= 200) & (g >= 105) & (g <= 175) & (b >= 75) & (b <= 145) & (r > g) & (g > b) & (r - b >= 40)
del r, g, b
wood[:2180] = False
excl = rects([R(935, 2548, 1525, 3277), R(1690, 2250, 1880, 2640), R(690, 2170, 1560, 2340), R(690, 2170, 1240, 2600),
                R(3240, 2420, 3760, 2960), R(1520, 2165, 1745, 2495), R(3300, 2990, 3700, 3130)])
lab, n = ndi.label(wood)
# furniture made of wood sits wholly inside the exclusion rects and is not plank-coloured
ar = np.maximum(np.bincount(lab.ravel(), minlength=n + 1), 1)
mc = np.stack([np.bincount(lab.ravel(), weights=a0[..., c].ravel(), minlength=n + 1) / ar for c in range(3)], 1)
plankish = (np.abs(mc - (180, 156, 120)).max(1) < 7) | (np.abs(mc - (188, 168, 136)).max(1) < 7)
keep = (np.bincount(lab.ravel(), weights=(~excl).ravel(), minlength=n + 1) > 0) | plankish
wood &= keep[lab]
lab, n = ndi.label(wood)
m = np.arange(n + 1)
for l_, r_ in set(zip(lab[:, 0].tolist(), lab[:, -1].tolist())):   # planks that cross the 0/360 seam are one plank
    if l_ and r_: m[r_] = l_
lab = m[lab]
area = np.bincount(lab.ravel(), minlength=n + 1).astype(np.float64)
mean = np.stack([np.bincount(lab.ravel(), weights=a0[..., c].ravel(), minlength=n + 1) / np.maximum(area, 1) for c in range(3)], 1)
PAL = np.array([(186, 158, 121), (194, 170, 136), (177, 147, 108), (167, 135, 97), (160, 120, 88), (199, 178, 147)], np.float32)
tgt = PAL[rng.choice(len(PAL), n + 1, p=[.30, .20, .20, .15, .07, .08])]
tgt[area > 1.2e6] = PAL[0]
ratio = np.clip(tgt / np.maximum(mean, 1), 0.6, 1.6).astype(np.float32); ratio[0] = 1
labx = np.where(lab > 0, lab, ndi.maximum_filter(lab, 7))
out *= ratio[labx]
floor_core = lab > 0
del labx, lab
print('planks', n)

# ---------- floor plane coordinates (true perspective) for grain + rug pattern ----------
Y0 = 2180
rr = (1 / np.tan(np.maximum(-lat[Y0:], 1e-3))).astype(np.float32)[:, None]
X = rr * np.sin(lon).astype(np.float32)[None, :]; Z = rr * np.cos(lon).astype(np.float32)[None, :]
tex = ndi.gaussian_filter(rng.rand(1024, 1024).astype(np.float32), (2.5, 0.8), mode='wrap')
tv = tex[(X * 90).astype(np.int32) % 1024, (Z * 2600).astype(np.int32) % 1024]   # long along X, thin along Z
lo, hi = np.percentile(tex, [7, 90])
fade = np.broadcast_to(rr < 4.5, tv.shape)
fl = floor_core[Y0:]
o = out[Y0:]
o[fl & (tv > hi) & fade] *= np.array([0.90, 0.88, 0.86], np.float32)
o[fl & (tv < lo) & fade] *= 1.05
# rug
sl = (slice(2600, 3945), slice(2200, 5915))
def rugpart(c, tol, minarea):
    mm = np.zeros((H, W), bool); mm[sl] = big(near(c, tol, sl), minarea); return mm
rug_grey, rug_red, rug_white = rugpart((184, 184, 184), 5, 20000), rugpart((156, 84, 76), 8, 20000), rugpart((216, 216, 216), 5, 20000)
del X, Z, tv, fade

# ---------- pizza ----------
x0, y0, x1, y1 = 3335, 2770, 3700, 2915
ps = ~line[y0:y1, x0:x1]
lab, n = ndi.label(ps)
edge = np.zeros_like(ps); edge[0] = edge[-1] = True; edge[:, 0] = edge[:, -1] = True
enc = big(ps & ~np.isin(lab, np.unique(lab[edge & ps])), 30)
lab, n = ndi.label(enc); sz = np.bincount(lab.ravel())
crust = {lab[2825 - y0, 3365 - x0], lab[2817 - y0, 3668 - x0]} - {0}
col = np.zeros((n + 1, 3), np.float32)
for i in range(1, n + 1):
    col[i] = (212, 150, 84) if i in crust else ((190, 62, 46) if sz[i] < 1500 else (246, 204, 98))
    if ndi.center_of_mass(lab == i)[0] + y0 > 2865: col[i] = (246, 204, 98)
    cy, cx = ndi.center_of_mass(lab == i); print('pizza region', i, sz[i], int(cx) + x0, int(cy) + y0, i in crust)
labx = np.where(lab > 0, lab, ndi.maximum_filter(lab, 5))
sub = out[y0:y1, x0:x1]; mk = labx > 0
sub[mk] = col[labx][mk] * (a0[y0:y1, x0:x1].max(2)[mk] / 204.0).clip(0, 1)[:, None]

# ---------- windows: blue hour sky + skyline ----------
wsl = (slice(1650, 2300), slice(2200, 6350))
c = a0[wsl]
pane = np.zeros((H, W), bool)
pane[wsl] = big((c[..., 2] >= 245) & (c[..., 0] >= 241) & (c[..., 0] < 250) & (c[..., 1] >= 246), 25)     # small on purpose: slivers of glass show between the monitor stands and cables
R0, R1 = 1640, 2310
pane[2000:2330, 5400:6100] |= a0[2000:2330, 5400:6100].min(2) >= 232        # last specks of glass trapped between monitor stands and cables
latd = np.degrees(lat)[R0:R1, None]; lond = np.degrees(lon)[None, :]
n1, n2, n3 = [smooth_noise(sc, sg)[R0:R1] for sc, sg in ((32, 4), (8, 4), (4, 2))]
t = np.clip((16 - latd) / 26, 0, 1)[..., None]
sky = (1 - t) * np.array([5, 9, 26], np.float32) + t * np.array([13, 22, 54], np.float32)
haze = (np.clip((2 - latd) / 10, 0, 1) ** 1.4 * (0.6 + 0.8 * n1))[..., None]          # warm glow low on the horizon
dband = (latd - (4 + 0.17 * (lond - 5))) / 6.5                                         # milky way: a diagonal band of cloud
mw = np.exp(-dband * dband) * np.clip(1.7 * n2 - 0.25, 0, 1.3) * (0.35 + 1.3 * n3)
sky = np.broadcast_to(sky, (R1 - R0, W, 3)).copy()
mw *= 0                                                # plain night sky: no cloud band, stars spread evenly
tints = np.array([(255, 255, 255), (200, 220, 255), (255, 236, 210), (170, 200, 255)], np.float32)
for _ in range(4000):
    sx, sy = rng.randint(2200, 6350), rng.randint(4, R1 - R0 - 4)
    if rng.rand() > 0.3 + mw[sy, sx]: continue
    b = rng.rand() ** 2.5; c = tints[rng.randint(4)] * (0.35 + 0.65 * b)
    sky[sy:sy + 2, sx:sx + 2] += c
    if b > 0.55: sky[sy - 1:sy + 3, sx:sx + 2] += c * .6; sky[sy:sy + 2, sx - 1:sx + 3] += c * .6
    if b > 0.9: sky[sy - 4:sy + 6, sx:sx + 2] += c * .35; sky[sy:sy + 2, sx - 4:sx + 6] += c * .35
panex = ndi.binary_dilation(pane, iterations=3)[R0:R1]
out[R0:R1][panex] = np.clip(sky[panex], 0, 255) * (a0[R0:R1].max(2)[panex] / 246.0).clip(0, 1)[:, None]
del sky, mw, haze, t, n1, n2, n3, panex

# ---------- cel shading: form shadows on objects, cast shadows on walls / floor ----------
d16 = a0.astype(np.int16)
edge = np.zeros((H, W), bool)
e = np.abs(d16[:, 1:] - d16[:, :-1]).max(2) > 14; edge[:, 1:] |= e; edge[:, :-1] |= e
e = np.abs(d16[1:] - d16[:-1]).max(2) > 14; edge[1:] |= e; edge[:-1] |= e
del d16, e
L, nL = ndi.label(~line & ~edge)
m = np.arange(nL + 1)
for l_, r_ in set(zip(L[:, 0].tolist(), L[:, -1].tolist())):
    if l_ and r_: m[r_] = l_
L = m[L]
area = np.bincount(L.ravel(), minlength=nL + 1)
def frac(mask): return np.bincount(L.ravel(), weights=mask.ravel(), minlength=nL + 1) / np.maximum(area, 1) > 0.5
is_wall = frac(near((228, 236, 224), 6)) & (area > 15000)
is_floor = frac(floor_core | rug_grey | rug_red | rug_white) | (frac(near((180, 184, 176), 5)) & (area > 40000))
is_ceil = np.zeros(nL + 1, bool); is_ceil[np.unique(L[300])] = True
is_pane = frac(pane)
is_obj = ~(is_wall | is_floor | is_ceil | is_pane) & (area >= 150)
for v in (is_wall, is_floor, is_ceil, is_pane, is_obj): v[0] = False
Lx = np.where(L > 0, L, ndi.maximum_filter(L, 5))
fringe = (a0.max(2) / 236.0).clip(0, 1)[..., None]            # keeps the anti-aliased edge of the line art when a fill is replaced

# bookshelf: the side panel below the desk gets the same colour as the part above it
lo_, hi_ = L[2500, 5237], L[2121, 5247]
print('shelf side: below', a0[2500, 5237], 'above', a0[2121, 5247])
mk = Lx == lo_
out[mk] = (a0[2121, 5247].astype(np.float32) * (a0.max(2)[mk] / float(a0[2500, 5237].max())).clip(0, 1)[:, None])

# ---------- wallpaper, drawn on the real wall planes so it follows the room's perspective ----------
# the room is a rectangle seen from inside; its four corners sit at these panorama columns
C1, C2, C3, C4 = 1191, 3004, 5043, 7139
low = np.zeros(nL + 1, bool); low[np.unique(L[1900:])] = True          # skips the moulding band under the ceiling
wp = (is_wall & low)[Lx]
if '--wallpaper' not in sys.argv: wp[:] = False                           # wallpaper is off unless asked for
wp[1650:2560, 7440:8115] = False                                        # hallway beyond the arch stays plain
Y0w, Y1w = 1480, 2700
wp = wp[Y0w:Y1w]
la = lat[Y0w:Y1w, None].astype(np.float32); lo = lon[None, :].astype(np.float32)
dx, dy, dz = np.cos(la) * np.sin(lo), np.sin(la) * np.ones_like(lo), np.cos(la) * np.cos(lo)
col = np.arange(W)[None, :]
front, right, left = (col >= C2) & (col < C3), (col >= C3) & (col < C4), (col >= C1) & (col < C2)
eps = 1e-3
tt = np.where(front, 1 / np.maximum(dz, eps), np.where(right, .888 / np.maximum(dx, eps), np.where(left, 1.11 / np.maximum(-dx, eps), .849 / np.maximum(-dz, eps))))
u = np.where(front | ~(right | left), dx * tt, dz * tt); v = dy * tt            # metres-ish along the wall, and height
del dx, dy, dz, tt
u = u + 0.004 * np.sin(v * 31); v = v + 0.004 * np.sin(u * 27)                    # slight hand-drawn wobble
kitchen = np.broadcast_to((col >= 8115) | (col < 1505), u.shape)
# kitchen: white square tiles with thin dark grout
ts = 0.062
tile = np.full(u.shape + (3,), 0, np.float32); tile[:] = (247, 247, 244)
fu, fv = u / ts - np.floor(u / ts), v / ts - np.floor(v / ts)
tile[(fu < .045) | (fv < .045)] = (38, 38, 40)
tile[((fu > .045) & (fu < .09)) | ((fv > .045) & (fv < .09))] = (228, 228, 226)   # soft bevel beside the grout
# everywhere else: cream damask, one motif repeated in a half-drop
TW, TH, SS = 256, 448, 3
def motif(d, cx, cy):
    def ell(x, y, rx, ry, ang=0, fill=255):
        a = np.radians(ang); pts = []
        for k in range(40):
            px, py = rx * np.cos(k * np.pi / 20), ry * np.sin(k * np.pi / 20)
            pts.append(((cx + x + px * np.cos(a) - py * np.sin(a)) * SS, (cy + y + px * np.sin(a) + py * np.cos(a)) * SS))
        d.polygon(pts, fill=fill)
    for sgn in (-1, 1):
        pts = [((cx + sgn * 118 * np.sin(np.pi * k / 60) ** .7) * SS, (cy - 224 + 448 * k / 60) * SS) for k in range(61)]
        d.line(pts, fill=255, width=5 * SS)                                        # ogee frame
        ell(sgn * 30, -84, 13, 30, sgn * 35); ell(sgn * 34, 58, 12, 26, -sgn * 40)
        ell(sgn * 54, 6, 30, 30); ell(sgn * 54, 6, 20, 20, fill=0); ell(sgn * 54, 6, 8, 8)   # scrolls
        ell(sgn * 80, -46, 10, 32, sgn * 18); ell(sgn * 80, 70, 10, 30, -sgn * 18)
        ell(sgn * 22, 112, 6, 6); ell(sgn * 20, -132, 5, 5)
    ell(0, -10, 26, 46); ell(0, -10, 12, 26, fill=0); ell(0, -96, 13, 34); ell(0, 76, 17, 30)
    ell(0, 126, 9, 9); ell(0, -148, 8, 8)
tim = Image.new('L', (TW * SS, TH * SS), 0); dd = ImageDraw.Draw(tim)
for mx, my in ((TW / 2, TH / 2), (0, 0), (TW, 0), (0, TH), (TW, TH)): motif(dd, mx, my)
tim = np.asarray(tim.resize((TW, TH), Image.LANCZOS), np.float32) / 255
ps = 0.105 / TW                                                                      # one repeat is about a third of the camera-to-wall distance
m_ = tim[(np.floor(-v / ps).astype(np.int64)) % TH, (np.floor(u / ps).astype(np.int64)) % TW][..., None]
dam = (1 - m_) * np.array([238, 227, 202], np.float32) + m_ * np.array([220, 200, 164], np.float32)
paper = np.where(kitchen[..., None], tile, dam)
o = out[Y0w:Y1w]
o[wp] = paper[wp] * fringe[Y0w:Y1w][wp]
del u, v, tile, dam, paper, m_, fu, fv, wp

# ---------- hand-painted mottle ----------
out *= (1 + 0.05 * (smooth_noise(4, 4) - .5) + 0.02 * (rng.rand(H, W).astype(np.float32) - .5))[..., None]
res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
res.save(OUT + '/pano.webp', quality=92, method=4)
res.resize((4096, 2048), Image.LANCZOS).save(OUT + '/pano_4k.webp', quality=90, method=4)
res.save(OUT + '/../work_out8k.png') if '--debug' in sys.argv else None

# ---------- masks + metadata ----------
emis = np.zeros((H, W, 3), np.uint8)
emis[..., 0] = ndi.binary_erosion((ids == 6) & rects(SHADES), iterations=6) * 255   # stay inside the outline: no glowing rim
scr = np.zeros((H, W), bool)
for name, (seed, quad) in SCREENS.items(): scr |= L == L[seed[1], seed[0]]
emis[..., 1] = ndi.binary_dilation(scr, iterations=2) * 255
emis[..., 2] = pane * 255
Image.fromarray(emis).resize((4096, 2048), Image.BOX).save(OUT + '/emis.png', optimize=True)
Image.fromarray(ids).save(OUT + '/ids.png', optimize=True)            # single channel, full resolution for crisp outlines
Image.fromarray(ids[::2, ::2]).save(OUT + '/ids_4k.png', optimize=True)
ll = lambda x, y: [round((x / W - 0.5) * 360, 3), round((0.5 - y / H) * 180, 3)]   # yaw, pitch in degrees
meta = {'objects': {name: {'id': oid, 'focus': (ll(*f[:2]) + [f[2]]) if f else None} for oid, (name, _, f) in OBJ.items()},
        'lamps': [ll(x, y) + [s] for x, y, s in LAMPS],
        'screens': {k: [ll(*p) for p in q] for k, (seed, q) in SCREENS.items()}, 'frame': [ll(*p) for p in FRAME]}
open(OUT + '/meta.js', 'w').write('window.META = ' + json.dumps(meta) + ';\n')
print('done')

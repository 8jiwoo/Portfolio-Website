# Builds the "which object is this pixel" mask from the line art.
# Run directly for a fast check:  python masks.py <source 8192x4096> <out ids.png> [-v]
import numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from objs import OBJ, DROP

def big(mask, minarea):
    l, n = ndi.label(mask); sz = np.bincount(l.ravel()); return (sz >= minarea)[l] & mask

def make_ids(a0, line, verbose=False):
    H, W = line.shape
    ids = np.zeros((H, W), np.uint8)
    for oid, (name, pieces, focus) in OBJ.items():
        for poly in pieces:
            kind = poly[0] if isinstance(poly[0], str) else 'flood'
            if kind != 'flood': poly = poly[1]
            xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
            x0, x1, y0, y1 = min(xs) - 2, max(xs) + 3, min(ys) - 2, max(ys) + 3
            im = Image.new('1', (x1 - x0, y1 - y0)); ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in poly], fill=1)
            inside = np.asarray(im); ln = line[y0:y1, x0:x1]; c = a0[y0:y1, x0:x1].astype(np.int16)
            if kind == 'raw': obj = inside
            elif kind == 'rawline': obj = inside & ln                      # solid black bits (knobs, cords) that enclose nothing
            else:
                if kind == 'tint':                                         # picked by colour: blue or tan
                    r, g, b = c[..., 0], c[..., 1], c[..., 2]
                    bg = np.zeros_like(inside)
                    fill = big((((b > r + 25) & (g < b + 15) & (g > r + 15)) | ((r > b + 14) & (r > 120) & (g < r + 6) & (g > b + 4))) & inside, 40)
                else:                                                      # everything the outlines enclose
                    ps = inside & ~ln
                    lab, n = ndi.label(ps)
                    keep = np.ones(n + 1, bool); keep[0] = False; trapped = np.zeros(n + 1, bool)
                    keep[np.unique(lab[ps & ~ndi.binary_erosion(inside)])] = False      # connected to the rect border = background
                    sz = np.bincount(lab.ravel(), minlength=n + 1); keep &= sz >= 40
                    for i in np.nonzero(keep)[0]:                           # background trapped by cords / stands
                        mc = c[lab == i].mean(0)
                        if verbose: print(name, 'region', sz[i], mc.astype(int))
                        if any(np.abs(mc - d).max() < 25 for d in DROP.get(name, [])): keep[i] = False; trapped[i] = True
                    fill = keep[lab]; bg = trapped[lab]
                # take in the object's own black outline, and nothing else: grow only through line pixels
                obj = ndi.binary_dilation(fill, iterations=8, mask=(ln | fill) & inside)
                holes = ndi.binary_fill_holes(obj) & ~obj
                hl, hn = ndi.label(holes); bad = np.zeros(hn + 1, bool); bad[np.unique(hl[bg])] = True; bad[0] = True
                obj |= ~bad[hl]                                             # fill gaps, but not background a cord or stand has trapped
                obj = ndi.binary_dilation(obj, iterations=1) & inside       # the soft anti-aliased edge of the line
            ids[y0:y1, x0:x1][obj] = oid
            if obj.sum() < 60: print('WARNING: nothing found for', name, poly[0], obj.sum())
    return ids

if __name__ == '__main__':
    Image.MAX_IMAGE_PIXELS = None
    a0 = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
    Image.fromarray(make_ids(a0, a0.max(2) < 30, '-v' in sys.argv)).save(sys.argv[2])

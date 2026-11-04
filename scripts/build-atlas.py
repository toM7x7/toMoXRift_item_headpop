"""Cut the 4x2 magenta-keyed icon sheet into a transparent texture atlas.

usage: python scripts/build-atlas.py concepts/sheet-b.png public/head-pop-icons.png

The sheet has white sticker borders on a flat magenta background, so every
edge pixel is a mix of white and magenta. The green channel then gives the
exact coverage: magenta has G≈0 and white has G=255.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

COLS, ROWS, CELL, PAD = 4, 2, 384, 10

def key_out(sheet):
    rgb = sheet.convert('RGB')
    w, h = rgb.size
    # Background colour sampled from the four corners.
    corners = [rgb.getpixel(p) for p in [(4, 4), (w - 5, 4), (4, h - 5), (w - 5, h - 5)]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    px = rgb.load()
    pure = Image.new('L', (w, h), 0)
    pp = pure.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 70:
                pp[x, y] = 255
    band = pure.filter(ImageFilter.MaxFilter(7))  # 3 px around the background
    bp = band.load()
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if pp[x, y]:
                op[x, y] = (255, 255, 255, 0)
            elif bp[x, y] and r > 190 and b > 190:
                a = max(0.0, min(1.0, (g - bg[1]) / (250 - bg[1])))
                op[x, y] = (255, 255, 255, round(a * 255))
            else:
                op[x, y] = (r, g, b, 255)
    return out, bg

def main(src, dst):
    sheet = Image.open(src)
    keyed, bg = key_out(sheet)
    w, h = keyed.size
    cw, ch = w / COLS, h / ROWS
    # A sticker border can cross into the neighbouring cell, so assign each
    # connected shape to the cell holding its centre instead of cutting by grid.
    alpha = np.asarray(keyed.getchannel('A'))
    labels, count = ndimage.label(alpha > 8)
    owner = np.zeros(count + 1, dtype=np.int32) - 1
    for index, sl in enumerate(ndimage.find_objects(labels), start=1):
        ys, xs = sl
        cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
        if (ys.stop - ys.start) * (xs.stop - xs.start) < 40:
            continue  # speck
        owner[index] = int(cy // ch) * COLS + int(cx // cw)
    crops = []
    rgba = np.asarray(keyed).copy()
    for cell in range(COLS * ROWS):
        mask = owner[labels] == cell
        if not mask.any():
            raise SystemExit(f'empty cell {cell}')
        ys, xs = np.nonzero(mask)
        part = rgba.copy()
        part[~mask] = (255, 255, 255, 0)
        crops.append(Image.fromarray(part[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA'))
    largest = max(max(c.size) for c in crops)
    scale = min(1.0, (CELL - 2 * PAD) / largest)
    atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (255, 255, 255, 0))
    report = []
    for i, crop in enumerate(crops):
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        icon = crop.resize(size, Image.LANCZOS) if scale < 1 else crop
        col, row = i % COLS, i // COLS
        x = col * CELL + (CELL - icon.width) // 2
        y = row * CELL + (CELL - icon.height) // 2
        atlas.alpha_composite(icon, (x, y))
        report.append((i + 1, crop.size, icon.size))
    atlas.save(dst, optimize=True)
    print('background', bg, 'scale', round(scale, 3))
    for r in report:
        print('icon', r)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

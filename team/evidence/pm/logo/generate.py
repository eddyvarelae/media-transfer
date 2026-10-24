"""Writes option-1/2/3.svg (1024x1024 macOS icons) for the Media Transfer identity drafts."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TILE, f, pts, DP_W, DP_H

OUT = sys.argv[1]
DP_PATH = 'M58.5 97L14 140H186.5L183 132.5L170 127L160 114L144 119.5L135 97L100 60L76 80.5V86L67 100.5L58.5 97Z'
K = 44.5 / 43   # DP long left slope (dx per dy), ~44 deg

def mountain(x0, base, width, fill):
    """The DP mark, exact path from digital-porters-logo.svg, scaled to `width`, left foot at x0, flat base on `base`."""
    s = width / DP_W
    g4 = lambda v: ('%.4f' % v).rstrip('0').rstrip('.')
    return (f'<path transform="matrix({g4(s)} 0 0 {g4(s)} {g4(x0 - 14 * s)} {g4(base - 140 * s)})" '
            f'd="{DP_PATH}" fill="{fill}"/>'), s

def svg(title, tile_fill, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>{title}</title>
  <defs>
    <filter id="drop" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <clipPath id="tile"><path d="{TILE}"/></clipPath>
  </defs>
  <!-- macOS grid: 824x824 continuous-corner tile (radius 185.4) centred on the 1024 canvas, soft drop shadow; the rest is transparent -->
  <path d="{TILE}" fill="#000000" fill-opacity="0.32" transform="translate(0 12)" filter="url(#drop)"/>
  <path d="{TILE}" fill="{tile_fill}"/>
  <g clip-path="url(#tile)">
{body}
  </g>
</svg>
'''

# ---------------- Option 1: Carried. The DP mark stands on the transfer arrow.
def option1():
    W, t, head, gapR = 500, 64, 96, 20
    H = DP_H * W / DP_W
    span_l, span_r = t * K, W + gapR + head
    x0 = 512 - (span_r - span_l) / 2
    yb = round(500 + (H - (t / 2 + head)) / 2)          # shared edge on a whole pixel: no seam
    m, s = mountain(x0, yb, W, '#FFFFFF')
    hb = x0 + W + gapR; tip = hb + head; ay = yb + t / 2
    arrow = [(x0, yb), (hb, yb), (hb, ay - head), (tip, ay), (hb, ay + head), (hb, yb + t), (x0 - t * K, yb + t)]
    body = f'''    <!-- Digital Porters mark (exact polygon), white on the mark's own navy -->
    {m}
    <!-- Its flat base line becomes the transfer arrow: tail continues the mark's long left slope, head uses the mark's ~45 deg slopes -->
    <path d="{pts(arrow)}" fill="#4F8CFF"/>'''
    return svg('Media Transfer: option 1, Carried', '#182D52', body)

# ---------------- Option 2: Card to drive, in the DP line language.
def option2():
    ink, accent, SW = '#182D52', '#4F8CFF', 48
    h2 = SW / 2
    cw, ch, cham = 248, 288, 72
    dw, dh = 512, 152
    gap, ah = 28, 168
    top = 512 - (ch + gap + ah + gap + dh) / 2
    x, y = 512 - cw / 2, top
    tn = h2 * math.tan(math.radians(22.5))               # keeps the 45 deg chamfer's outer edge where it should be
    card = [(x + h2, y + h2), (x + cw - cham - tn, y + h2), (x + cw - h2, y + cham + tn), (x + cw - h2, y + ch - h2), (x + h2, y + ch - h2)]
    pins = '\n'.join(f'    <rect x="{f(x + SW + 20 + i * 40)}" y="{f(y + SW + 30)}" width="22" height="56" fill="{ink}"/>' for i in range(3))
    mw = cw - 2 * SW - 24
    m, s = mountain(512 - mw / 2, y + ch - SW + 1, mw, ink)
    ay1 = y + ch + gap; ay2 = ay1 + ah
    hd = 58; apex = ay2 - SW / math.sqrt(2)                 # miter tip lands on ay2
    dy = ay2 + gap
    body = f'''    <!-- SD card: 45 deg chamfer (the DP slope), outline at the DP letter-stem ratio (~1/6 of height), square miter corners -->
    <path d="{pts(card)}" fill="none" stroke="{ink}" stroke-width="{SW}" stroke-linejoin="miter"/>
{pins}
    <!-- The media on the card is the Digital Porters mark itself (exact polygon), standing on the card's edge -->
    {m}
    <!-- Transfer arrow, same monoline weight, in the app accent -->
    <path d="M512 {f(ay1)} V{f(apex)} M{f(512 - hd)} {f(apex - hd)} L512 {f(apex)} L{f(512 + hd)} {f(apex - hd)}" fill="none" stroke="{accent}" stroke-width="{SW}" stroke-linecap="butt" stroke-linejoin="miter"/>
    <!-- Drive: same outline, slot line and activity light -->
    <rect x="{f(512 - dw / 2 + h2)}" y="{f(dy + h2)}" width="{f(dw - SW)}" height="{f(dh - SW)}" fill="none" stroke="{ink}" stroke-width="{SW}"/>
    <rect x="{f(512 - dw / 2 + SW + 32)}" y="{f(dy + dh / 2 - 10)}" width="150" height="20" fill="{ink}"/>
    <rect x="{f(512 + dw / 2 - SW - 32 - 44)}" y="{f(dy + dh / 2 - 22)}" width="44" height="44" fill="{accent}"/>'''
    return svg('Media Transfer: option 2, Card to drive', '#F5F9FF', body)

# ---------------- Option 3: Port. A load with the DP summit angle docks into a port.
def option3():
    g = 32                       # gap = the DP rule weight, scaled
    hd = 128                     # half height of the load; 45 deg facets => tip length = hd (DP summit ~93 deg)
    x1, px2, cy = 256, 768, 512
    off = g * (math.sqrt(2) - 1) # makes the gap uniform along flats and facets
    ll = 352
    tipx = x1 + ll
    load = [(x1, cy - hd), (tipx - hd, cy - hd), (tipx, cy), (tipx - hd, cy + hd), (x1, cy + hd)]
    px1 = tipx - hd + off
    nm = hd + g
    ph = 448
    port = [(px1, cy - ph / 2), (px2, cy - ph / 2), (px2, cy + ph / 2), (px1, cy + ph / 2), (px1, cy + nm), (px1 + nm, cy), (px1, cy - nm)]
    body = f'''    <!-- The load: a block whose leading edge is the DP summit (~90 deg, ~45 deg facets like the mark's slopes) -->
    <path d="{pts(load)}" fill="#FFFFFF"/>
    <!-- The port: navy block with the matching notch; the uniform gap is the DP rule weight -->
    <path d="{pts(port)}" fill="#001C36"/>'''
    return svg('Media Transfer: option 3, Port', '#2D7FF9', body)

for n, fn in ((1, option1), (2, option2), (3, option3)):
    open(os.path.join(OUT, f'option-{n}.svg'), 'w').write(fn())

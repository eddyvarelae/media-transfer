"""Shared geometry for the Media Transfer icon drafts."""
import math

# Digital Porters mark, exact polygon from digital-porters-logo.svg (200x200 source). Bbox x 14..186.5, y 60..140.
DP = [(58.5, 97), (14, 140), (186.5, 140), (183, 132.5), (170, 127), (160, 114), (144, 119.5),
      (135, 97), (100, 60), (76, 80.5), (76, 86), (67, 100.5)]
DP_W, DP_H = 172.5, 80.0

# Palette (DP theme tokens + logo navy) and the app's transfer accent
NAVY = '#001C36'; NAVY_LOGO = '#182D52'; NAVY_SOFT = '#0A2A4A'; NAVY_HI = '#144773'; NAVY_DEEP = '#000E1C'
SKY = '#96CAF2'; SKY_SOFT = '#CFE3F8'; SURFACE = '#F5F9FF'; SURFACE_ALT = '#EAF1FA'; WHITE = '#FFFFFF'
DP_ACCENT = '#2D7FF9'; ACCENT = '#4f8cff'

def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s == '-0' else s

def pts(points):
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in points) + ' Z'

def dp_mountain(x0, base_y, width):
    """DP polygon scaled to `width`, left foot at x0, flat base on base_y. Returns (points, scale)."""
    s = width / DP_W
    return [(x0 + (px - 14) * s, base_y - (140 - py) * s) for px, py in DP], s

def squircle(x, y, w, h, r):
    """Continuous-corner rounded rect (Apple-style; PaintCode iOS 7 coefficients)."""
    TL = lambda a, b: (x + a * r, y + b * r)
    TR = lambda a, b: (x + w - a * r, y + b * r)
    BR = lambda a, b: (x + w - a * r, y + h - b * r)
    BL = lambda a, b: (x + a * r, y + h - b * r)
    P = lambda p: f'{f(p[0])} {f(p[1])}'
    c = ['M' + P(TL(1.52866483, 0)), 'L' + P(TR(1.52866471, 0)),
         'C' + ' '.join(map(P, (TR(1.08849323, 0), TR(0.86840689, 0), TR(0.66993427, 0.065496)))),
         'L' + P(TR(0.63149399, 0.074911)),
         'C' + ' '.join(map(P, (TR(0.37282392, 0.16905899), TR(0.16906013, 0.37282401), TR(0.07491176, 0.63149399)))),
         'C' + ' '.join(map(P, (TR(0, 0.86840701), TR(0, 1.08849299), TR(0, 1.52866483)))),
         'L' + P(BR(0, 1.52866471)),
         'C' + ' '.join(map(P, (BR(0, 1.08849323), BR(0, 0.86840689), BR(0.06549569, 0.66993493)))),
         'L' + P(BR(0.07491111, 0.63149399)),
         'C' + ' '.join(map(P, (BR(0.16905883, 0.37282392), BR(0.37282392, 0.16905883), BR(0.63149399, 0.07491111)))),
         'C' + ' '.join(map(P, (BR(0.86840689, 0), BR(1.08849323, 0), BR(1.52866471, 0)))),
         'L' + P(BL(1.52866483, 0)),
         'C' + ' '.join(map(P, (BL(1.08849299, 0), BL(0.86840701, 0), BL(0.66993397, 0.06549569)))),
         'L' + P(BL(0.63149399, 0.07491111)),
         'C' + ' '.join(map(P, (BL(0.37282401, 0.16905883), BL(0.16906001, 0.37282392), BL(0.074911, 0.63149399)))),
         'C' + ' '.join(map(P, (BL(0, 0.86840689), BL(0, 1.08849323), BL(0, 1.52866471)))),
         'L' + P(TL(0, 1.52866483)),
         'C' + ' '.join(map(P, (TL(0, 1.08849299), TL(0, 0.86840701), TL(0.065496, 0.66993397)))),
         'L' + P(TL(0.074911, 0.63149399)),
         'C' + ' '.join(map(P, (TL(0.16906001, 0.37282401), TL(0.37282401, 0.16906001), TL(0.63149399, 0.074911)))),
         'C' + ' '.join(map(P, (TL(0.86840701, 0), TL(1.08849299, 0), TL(1.52866483, 0)))), 'Z']
    return ' '.join(c)

TILE = squircle(100, 100, 824, 824, 185.4)   # macOS grid: 824/1024 body, radius 185.4

def icon(title, desc, tile_fill, body, defs=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>{title}</title>
  <desc>{desc}</desc>
  <defs>
    <filter id="drop" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <clipPath id="tile"><path d="{TILE}"/></clipPath>{defs}
  </defs>
  <!-- macOS tile: 824x824 continuous-corner square on the 1024 grid, soft drop shadow, rest transparent -->
  <path d="{TILE}" fill="#000000" fill-opacity="0.32" transform="translate(0 12)" filter="url(#drop)"/>
  <path d="{TILE}" fill="{tile_fill}"/>
  <g clip-path="url(#tile)">
{body}
  </g>
</svg>
'''

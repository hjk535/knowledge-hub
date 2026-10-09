"""校验航海志配色是否仍达 WCAG AA。"""
def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lum(rgb):
    def f(c):
        c /= 255
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    r, g, b = (f(c) for c in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def ratio(a, b):
    la, lb = lum(hex2rgb(a)), lum(hex2rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

T = {
  '--bg':       '#f3e7cc',
  '--surface':  '#fdf6e4',
  '--text':     '#12263a',
  '--text-2':   '#4a5b69',
  '--muted':    '#556775',
  '--accent':   '#8a5a12',
  '--accent-on':'#fdf6e4',
  '--border':   '#d3c39d',
  '--border-2': '#b8a374',
}
bg, surf = T['--bg'], T['--surface']
checks = [
  ('text / bg',        T['--text'],      bg,    4.5),
  ('text / surface',   T['--text'],      surf,  4.5),
  ('text-2 / bg',      T['--text-2'],    bg,    4.5),
  ('text-2 / surface', T['--text-2'],    surf,  4.5),
  ('muted / bg',       T['--muted'],     bg,    4.5),
  ('muted / surface',  T['--muted'],     surf,  4.5),
  ('accent / bg',      T['--accent'],    bg,    4.5),
  ('accent / surface', T['--accent'],    surf,  4.5),
  ('accent-on/accent', T['--accent-on'], T['--accent'], 4.5),
  ('border / bg',      T['--border'],    bg,    1.4),
  ('border-2 / bg',    T['--border-2'],  bg,    2.0),
]
bad = 0
for name, fg, b, need in checks:
    r = ratio(fg, b)
    ok = r >= need
    if not ok: bad += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {name:20s} {r:5.2f}:1  need {need}")
print(f"\n不达标项: {bad}")

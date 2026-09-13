"""从 globals.css 直接解析 token 并复核 WCAG 对比度。改 token 后跑这个。"""
import math, re, sys

import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CSS = open("src/styles/globals.css").read()

def oklch(s):
    m = re.match(r"oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)", s.strip())
    return tuple(float(x) for x in m.groups()) if m else None

def block(selector):
    # 必须匹配行首的选择器，否则 ".dark" 会命中 @custom-variant 里的 (.dark *)
    i = re.search(r"^" + re.escape(selector) + r"\s*\{", CSS, re.M).start()
    j = CSS.index("{", i); k = CSS.index("}", j)
    out = {}
    for m in re.finditer(r"(--[\w-]+):\s*([^;]+);", CSS[j:k]):
        c = oklch(m.group(2))
        if c: out[m.group(1)] = c
    return out

def lin(L,C,H):
    h=math.radians(H); a=C*math.cos(h); b=C*math.sin(h)
    l_=L+0.3963377774*a+0.2158037573*b; m_=L-0.1055613458*a-0.0638541728*b; s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r= 4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return [max(0.0,min(1.0,v)) for v in (r,g,bb)]
def lum(c):
    r,g,b=lin(*c); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    x,y=lum(a),lum(b); hi,lo=max(x,y),min(x,y); return (hi+0.05)/(lo+0.05)
def hexs(c):
    o=[]
    for v in lin(*c):
        v = 12.92*v if v<=0.0031308 else 1.055*v**(1/2.4)-0.055
        o.append(round(max(0,min(1,v))*255))
    return "#%02x%02x%02x"%tuple(o)

TEXT = ["foreground","muted-foreground","fg-subtle","brand",
        "ok-text","warn-text","crit-text","info-text"]
FAILED = []
for theme, sel in (("light", ":root"), ("dark", ".dark")):
    t = block(sel)
    bgs = [("background", t["--background"]), ("card", t["--card"]), ("muted", t["--muted"])]
    # F8 新增的凹槽表面（工具栏底座 / 代码块）= color-mix(muted 60%, background)。
    # 它是两个已验证表面的混合，理论上一定落在两者之间，但仍然显式纳入闸门。
    # color-mix(in oklab, muted 60%, background) 在 OKLab 里是线性的，直接按分量混合即可
    muted, bg = t["--muted"], t["--background"]
    bgs.append(("canvas", tuple(muted[i] * 0.6 + bg[i] * 0.4 for i in range(3))))
    print(f"\n=== {theme} ===  bg {hexs(t['--background'])}  card {hexs(t['--card'])}  muted {hexs(t['--muted'])}")
    print(f"  {'token':<18}{'hex':<10}{'on bg':>8}{'on card':>9}{'on muted':>10}{'on canvas':>11}   AA(4.5)")
    for name in TEXT:
        key = "--" + name
        if key not in t:
            print(f"  {name:<18}(missing)"); FAILED.append((theme,name)); continue
        c = t[key]
        rs = [cr(c, b[1]) for b in bgs]
        ok = min(rs) >= 4.5
        if not ok: FAILED.append((theme,name))
        print(f"  {name:<18}{hexs(c):<10}{rs[0]:7.2f} {rs[1]:8.2f} {rs[2]:9.2f} {rs[3]:10.2f}   {'PASS' if ok else 'FAIL'}")

# ---- C1：毛玻璃卡片上的文字 ----
# 卡片是 color-mix(in oklab, card 82%, transparent) 叠在渐变上。
# 先取卡片与渐变端点各自的 sRGB，再按 alpha 做合成（浏览器就是这么算的），
# 两端都取一遍，取更差的那个当最坏情况。
def to_srgb255(c):
    out = []
    for v in lin(*c):
        v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        out.append(max(0.0, min(1.0, v)) * 255)
    return out

def blend(fg, bg, alpha):
    return [fg[i] * alpha + bg[i] * (1 - alpha) for i in range(3)]

def rel_lum(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def cr_rgb(a, b):
    x, y = rel_lum(a), rel_lum(b)
    hi, lo = max(x, y), min(x, y)
    return (hi + 0.05) / (lo + 0.05)

GRADIENTS = {
    "light": [
        ("aurora", (0.94, 0.05, 258), (0.94, 0.05, 200)),
        ("dusk", (0.92, 0.06, 275), (0.95, 0.03, 250)),
        ("warm", (0.95, 0.04, 60), (0.95, 0.03, 250)),
    ],
    "dark": [
        ("aurora", (0.2, 0.05, 265), (0.2, 0.04, 230)),
        ("dusk", (0.18, 0.06, 285), (0.19, 0.05, 255)),
        ("warm", (0.2, 0.05, 50), (0.19, 0.05, 265)),
    ],
}
GLASS_ALPHA = {"light": 0.82, "dark": 0.80}

print("\n=== C1 毛玻璃合成后的文字对比度（渐变两端取最坏）===")
for theme, sel in (("light", ":root"), ("dark", ".dark")):
    t = block(sel)
    card_rgb = to_srgb255(t["--card"])
    for name, c1, c2 in GRADIENTS[theme]:
        worst = None
        for stop in (c1, c2):
            comp = blend(card_rgb, to_srgb255(stop), GLASS_ALPHA[theme])
            for key in ("foreground", "muted-foreground", "fg-subtle", "brand"):
                r = cr_rgb(to_srgb255(t["--" + key]), comp)
                if worst is None or r < worst[1]:
                    worst = (key, r)
        ok = worst[1] >= 4.5
        if not ok:
            FAILED.append((f"{theme}/glass-{name}", worst[0]))
        print(f"  {theme:<6}{name:<8} 最差 {worst[0]:<18}{worst[1]:6.2f}:1  {'PASS' if ok else 'FAIL'}")

print()
if FAILED:
    print("✗ 不达标:", ", ".join(f"{t}/{n}" for t,n in FAILED)); sys.exit(1)
print("✓ 所有文字 token 在 background / card / muted / canvas 上均 ≥4.5:1")

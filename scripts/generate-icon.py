#!/usr/bin/env python3
"""
Generate TermDeck icon in all required sizes.
Creates: logo.svg (web), icon.iconset/*.png (macOS), favicon.png

Design: 2x2 grid of terminal panels on a dark background.
Each panel has a distinct theme color with a status dot and text lines.
High contrast so it's readable at 16px in the Dock.
"""

from PIL import Image, ImageDraw
import os
import subprocess

# Colors
BG = (15, 17, 23)           # #0f1117 — app background

# Panel background colors — brighter than before, closer to actual theme backgrounds
PANEL_BG = [
    (26, 27, 38),            # #1a1b26 — Tokyo Night bg
    (30, 30, 46),            # #1e1e2e — Catppuccin Mocha bg
    (40, 42, 54),            # #282a36 — Dracula bg
    (46, 52, 64),            # #2e3440 — Nord bg
]

# Accent colors — the status dots and text, full brightness
ACCENTS = [
    (122, 162, 247),         # #7aa2f7 — blue
    (158, 206, 106),         # #9ece6a — green
    (187, 154, 247),         # #bb9af7 — purple
    (224, 175, 104),         # #e0af68 — amber
]


def rounded_rect(draw, xy, fill, radius):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2*radius, y0 + 2*radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2*radius, y0, x1, y0 + 2*radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2*radius, x0 + 2*radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2*radius, y1 - 2*radius, x1, y1], 0, 90, fill=fill)


def generate_icon(size):
    """Generate icon at a given pixel size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    padding = int(size * 0.10)
    gap = int(size * 0.05)
    corner = int(size * 0.12)
    panel_corner = int(size * 0.06)

    # Outer rounded rect
    rounded_rect(draw, [0, 0, size - 1, size - 1], BG, corner)

    # Panel dimensions
    inner_w = size - 2 * padding
    inner_h = size - 2 * padding
    panel_w = (inner_w - gap) // 2
    panel_h = (inner_h - gap) // 2

    positions = [
        (padding, padding),
        (padding + panel_w + gap, padding),
        (padding, padding + panel_h + gap),
        (padding + panel_w + gap, padding + panel_h + gap),
    ]

    for i, (px, py) in enumerate(positions):
        # Panel background — visible, not too dark
        rounded_rect(draw, [px, py, px + panel_w, py + panel_h],
                     PANEL_BG[i], panel_corner)

        accent = ACCENTS[i]

        # Status dot — bright, prominent
        dot_r = max(int(size * 0.025), 2)
        dot_x = px + int(panel_w * 0.12)
        dot_y = py + int(panel_h * 0.14)
        draw.ellipse([dot_x - dot_r, dot_y - dot_r,
                      dot_x + dot_r, dot_y + dot_r], fill=accent)

        # Text lines — visible but not overpowering
        line_h = max(int(size * 0.018), 1)
        line_x = px + int(panel_w * 0.10)
        line_gap = int(panel_h * 0.17)
        line_y_start = dot_y + int(panel_h * 0.18)

        # Blend accent color at different opacities by mixing with panel bg
        for j, width_pct in enumerate([0.75, 0.55, 0.65]):
            ly = line_y_start + j * line_gap
            lw = int(panel_w * width_pct)
            # Mix accent with panel bg for "faded text" effect
            mix = 0.35 - j * 0.08
            r = int(accent[0] * mix + PANEL_BG[i][0] * (1 - mix))
            g = int(accent[1] * mix + PANEL_BG[i][1] * (1 - mix))
            b = int(accent[2] * mix + PANEL_BG[i][2] * (1 - mix))
            draw.rectangle([line_x, ly, line_x + lw, ly + line_h],
                          fill=(r, g, b))

        # Cursor in top-left panel only
        if i == 0:
            cursor_x = line_x
            cursor_y = line_y_start + 3 * line_gap
            cursor_w = max(int(size * 0.012), 1)
            cursor_h = int(panel_h * 0.14)
            draw.rectangle([cursor_x, cursor_y,
                           cursor_x + cursor_w, cursor_y + cursor_h],
                          fill=accent)

    return img


def generate_svg():
    """Generate SVG logo for web use."""
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="60" fill="#0f1117"/>

  <!-- Top-left: Tokyo Night -->
  <rect x="52" y="52" width="195" height="195" rx="20" fill="#1a1b26"/>
  <circle cx="82" cy="82" r="10" fill="#7aa2f7"/>
  <rect x="76" y="112" width="140" height="7" rx="3.5" fill="#7aa2f7" opacity="0.35"/>
  <rect x="76" y="140" width="100" height="7" rx="3.5" fill="#7aa2f7" opacity="0.27"/>
  <rect x="76" y="168" width="120" height="7" rx="3.5" fill="#7aa2f7" opacity="0.19"/>
  <rect x="76" y="200" width="5" height="28" rx="2" fill="#7aa2f7"/>

  <!-- Top-right: Catppuccin -->
  <rect x="265" y="52" width="195" height="195" rx="20" fill="#1e1e2e"/>
  <circle cx="295" cy="82" r="10" fill="#9ece6a"/>
  <rect x="289" y="112" width="140" height="7" rx="3.5" fill="#9ece6a" opacity="0.35"/>
  <rect x="289" y="140" width="105" height="7" rx="3.5" fill="#9ece6a" opacity="0.27"/>
  <rect x="289" y="168" width="125" height="7" rx="3.5" fill="#9ece6a" opacity="0.19"/>

  <!-- Bottom-left: Dracula -->
  <rect x="52" y="265" width="195" height="195" rx="20" fill="#282a36"/>
  <circle cx="82" cy="295" r="10" fill="#bb9af7"/>
  <rect x="76" y="325" width="130" height="7" rx="3.5" fill="#bb9af7" opacity="0.35"/>
  <rect x="76" y="353" width="95" height="7" rx="3.5" fill="#bb9af7" opacity="0.27"/>
  <rect x="76" y="381" width="145" height="7" rx="3.5" fill="#bb9af7" opacity="0.19"/>

  <!-- Bottom-right: Nord -->
  <rect x="265" y="265" width="195" height="195" rx="20" fill="#2e3440"/>
  <circle cx="295" cy="295" r="10" fill="#e0af68"/>
  <rect x="289" y="325" width="110" height="7" rx="3.5" fill="#e0af68" opacity="0.35"/>
  <rect x="289" y="353" width="140" height="7" rx="3.5" fill="#e0af68" opacity="0.27"/>
  <rect x="289" y="381" width="85" height="7" rx="3.5" fill="#e0af68" opacity="0.19"/>
</svg>'''


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets_dir = os.path.join(base_dir, 'assets')
    os.makedirs(assets_dir, exist_ok=True)

    # Generate SVG logo
    svg_path = os.path.join(assets_dir, 'logo.svg')
    with open(svg_path, 'w') as f:
        f.write(generate_svg())
    print(f'  Created {svg_path}')

    # Generate favicon (32x32)
    favicon = generate_icon(32)
    favicon_path = os.path.join(assets_dir, 'favicon.png')
    favicon.save(favicon_path)
    print(f'  Created {favicon_path}')

    # Generate icon sizes for macOS .iconset
    iconset_dir = os.path.join(assets_dir, 'icon.iconset')
    os.makedirs(iconset_dir, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512]
    for s in sizes:
        img = generate_icon(s)
        img.save(os.path.join(iconset_dir, f'icon_{s}x{s}.png'))
        img2x = generate_icon(s * 2)
        img2x.save(os.path.join(iconset_dir, f'icon_{s}x{s}@2x.png'))

    print(f'  Created iconset at {iconset_dir}')

    # Convert to .icns
    icns_path = os.path.join(assets_dir, 'TermDeck.icns')
    try:
        subprocess.run(['iconutil', '-c', 'icns', iconset_dir, '-o', icns_path],
                      check=True, capture_output=True)
        print(f'  Created {icns_path}')
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f'  Warning: could not create .icns ({e})')

    # High-res for README
    hero = generate_icon(1024)
    hero_path = os.path.join(assets_dir, 'icon-1024.png')
    hero.save(hero_path)
    print(f'  Created {hero_path}')

    print('\n  Done!\n')

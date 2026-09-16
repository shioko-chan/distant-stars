"""Pack registered equirectangular maps. Requires Pillow; run after fetch_solar_assets.py."""
from pathlib import Path
from PIL import Image
import base64, json, struct

root = Path(__file__).resolve().parents[1]
size = (2048, 1024)
height = Image.open(root / 'src/content/earth/nasa-topography.tif').resize(size, Image.Resampling.BILINEAR)
mask = Image.open(root / 'src/content/earth/earth_specular_map.tif').convert('L')
color = Image.open(root / 'public/textures/solar/earth_daymap.jpg').convert('RGB')
data = bytearray()
for h, sea, (r,g,b) in zip(height.getdata(), mask.getdata(), color.getdata()):
    land = sea < 128
    # Vegetation-color proxy only: not surveyed soil or mineral data.
    fertility = max(1, min(15, round(7 + (g-r)*.18 - max(0,r-150)*.07))) if land else 0
    value = round(h * 6400 / 255 / 4) | (int(land) << 11) | (fertility << 12)
    data.extend(struct.pack('<H', value))
(root / 'src/content/earth/grid.json').write_text(json.dumps({'width':size[0], 'height':size[1], 'data':base64.b64encode(data).decode()},separators=(',',':')))

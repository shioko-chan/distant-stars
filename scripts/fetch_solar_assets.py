from pathlib import Path
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor

root = Path(__file__).resolve().parents[1]
textures = ['mercury','venus_surface','earth_daymap','earth_specular_map','mars','jupiter','saturn','uranus','neptune','sun']
def download(name):
    extension = 'tif' if name == 'earth_specular_map' else 'jpg'
    url = f'https://www.solarsystemscope.com/textures/download/2k_{name}.{extension}'
    target = root / 'public' / 'textures' / 'solar' / f'{name}.{extension}'
    if name == 'earth_specular_map': target = root / 'src/content/earth/earth_specular_map.tif'
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists(): return
    with urlopen(Request(url, headers={'User-Agent':'DistantStars asset preparation'}), timeout=45) as response:
        data = response.read()
    if extension == 'jpg' and not data.startswith(bytes([255,216])): raise ValueError(f'Not a JPEG: {name}')
    target.write_bytes(data)
    print(name, len(data), flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    for name, future in [(name, pool.submit(download, name)) for name in textures]:
        try: future.result()
        except Exception as error: print(name, str(error), flush=True)
url = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.tif'
target = root / 'src' / 'content' / 'earth' / 'nasa-topography.tif'
if not target.exists():
    with urlopen(Request(url, headers={'User-Agent':'DistantStars asset preparation'}), timeout=90) as response:
        target.write_bytes(response.read())
    print('NASA elevation', target.stat().st_size, flush=True)

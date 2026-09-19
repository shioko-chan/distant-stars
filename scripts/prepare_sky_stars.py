"""Build the deck's compact bright-star catalogue from CDS I/239/hip_main.dat.

Usage: python3 scripts/prepare_sky_stars.py /path/to/hip_main.dat
Source and fixed-width fields: https://cdsarc.cds.unistra.fr/ftp/I/239/ReadMe
No third-party Python packages are required.
"""
import json
import math
from pathlib import Path
import sys


# ICRS -> Galactic rotation (Hipparcos/Gaia convention).
# ESA Gaia EDR3 documentation, section 4.1.7, equation 4.62:
# https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_cu3ast/sec_cu3ast_intro/ssec_cu3ast_intro_tansforms.html
ROTATION = (
    (-0.0548755604162154, -0.8734370902348850, -0.4838350155487132),
    (0.4941094278755837, -0.4448296299600112, 0.7469822444972189),
    (-0.8676661490190047, -0.1980763734312015, 0.4559837761750669),
)


def read_stars(source):
    stars = []
    for line in source:
        # Stars without a measured magnitude or astrometric position cannot be drawn.
        if not all(line[a:b].strip() for a, b in ((41, 46), (51, 63), (64, 76))):
            continue
        magnitude = float(line[41:46])
        if magnitude > 6.5:
            continue
        ra, dec = math.radians(float(line[51:63])), math.radians(float(line[64:76]))
        direction = [math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)]
        # Hipparcos positions are at J1991.25; use the tabulated proper motion to reach J2000.0.
        east = [-math.sin(ra), math.cos(ra), 0]
        north = [-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec)]
        if line[87:95].strip() and line[96:104].strip():
            mas_to_radians = math.pi / (180 * 3_600_000)
            pm_ra, pm_dec = float(line[87:95]), float(line[96:104])
            direction = [v + 8.75 * mas_to_radians * (pm_ra * e + pm_dec * n)
                         for v, e, n in zip(direction, east, north)]
        norm = math.sqrt(sum(v * v for v in direction))
        galactic = [sum(a * b / norm for a, b in zip(row, direction)) for row in ROTATION]
        # The NASA panorama has l=0 in its centre, increasing to the left.
        # Three's equirectangular lookup uses atan2(z,x), with north along +Y.
        x, y, z = galactic[0], galactic[2], -galactic[1]
        bv = float(line[245:251]) if line[245:251].strip() else None
        stars.append([int(line[8:14]), round(x, 7), round(y, 7), round(z, 7), magnitude, bv])
    return sorted(stars, key=lambda star: star[0])


if __name__ == '__main__':
    with Path(sys.argv[1]).open() as source:
        stars = read_stars(source)
    output = Path(__file__).resolve().parents[1] / 'src/content/skyStars.json'
    output.write_text(json.dumps({'epoch': 'J2000.0', 'columns': ['hip', 'x', 'y', 'z', 'magnitude', 'bv'], 'stars': stars}, separators=(',', ':')) + '\n')
    print(f'{len(stars)} stars; {output.stat().st_size:,} bytes; {output}')

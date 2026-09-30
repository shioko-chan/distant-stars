"""Summarise the same warmed frame window from Unreal CSV captures (milliseconds)."""
import argparse
import csv
import json
import math
import statistics
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('captures', nargs='+', type=Path)
parser.add_argument('--start', type=int, default=300, help='zero-based first frame after warmup')
parser.add_argument('--frames', type=int, default=600)
args = parser.parse_args()
if args.start < 0 or args.frames < 1:
    parser.error('start must be nonnegative and frames must be positive')
csv.field_size_limit(10_000_000)
results = []
for path in args.captures:
    with path.open(newline='') as source:
        rows = list(csv.reader(source))
    # Unreal appends a final header as categories appear during a streaming capture.
    headers = [row for row in rows if row and row[0] == 'EVENTS']
    if not headers:
        raise ValueError(f'{path}: no Unreal CSV header')
    header = max(headers, key=len)
    frame_index = header.index('FrameTime')
    frames = []
    for row in rows:
        try:
            value = float(row[frame_index])
        except (ValueError, IndexError):
            continue
        if math.isfinite(value) and value > 0:
            frames.append(row)
    end = args.start + args.frames
    if len(frames) < end:
        raise ValueError(f'{path}: {len(frames)} frames; need {end}')
    window = frames[args.start:end]
    metrics = {}
    for name in ['FrameTime', 'GameThreadTime', 'RenderThreadTime', 'GPUTime', 'GPU/ShadowDepths']:
        index = header.index(name)
        values = [float(row[index]) for row in window]
        if not all(math.isfinite(v) for v in values):
            raise ValueError(f'{path}: invalid {name} sample')
        metrics[name] = {
            'mean_ms': round(statistics.mean(values), 3),
            'median_ms': round(statistics.median(values), 3),
            'p95_ms': round(sorted(values)[math.ceil(len(values) * .95) - 1], 3),
        }
    results.append({'capture': str(path.resolve()), 'start_frame': args.start, 'frames': len(window),
                    'fps_from_mean_frame_time': round(1000 / statistics.mean(float(row[frame_index]) for row in window), 2),
                    'metrics': metrics})
print(json.dumps(results, ensure_ascii=False, indent=2))

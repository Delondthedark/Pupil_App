# ai-service/models/generate_more_tests.py
# Generate more test CSVs by augmenting existing ones.
# Keeps columns the same; adds small noise; clamps illuminance and depth.

import argparse
from pathlib import Path
import numpy as np
import pandas as pd

def clamp(a, lo, hi):
    return np.minimum(np.maximum(a, lo), hi)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-dir", required=True, help="Folder containing seed test CSVs (recursive)")
    ap.add_argument("--out-dir", required=True, help="Where to write augmented CSVs")
    ap.add_argument("--copies", type=int, default=20, help="How many augmented copies per input file")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--illum-min", type=float, default=45.0)
    ap.add_argument("--illum-max", type=float, default=55.0)
    ap.add_argument("--depth-mean", type=float, default=30.0)
    ap.add_argument("--depth-std", type=float, default=2.0)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    in_dir = Path(args.in_dir).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(in_dir.rglob("*.csv"))
    if not files:
        raise SystemExit(f"No CSVs found under: {in_dir}")

    def col_find(df, names):
        lower_map = {c.lower(): c for c in df.columns}
        for n in names:
            if n.lower() in lower_map:
                return lower_map[n.lower()]
        # fallback partial match
        for c in df.columns:
            cl = c.lower()
            for n in names:
                if n.lower() in cl:
                    return c
        return None

    ill_names = ["Illuminance", "illum", "brightness", "light"]
    dep_names = ["depth", "distance", "z"]

    pupil_names = ["Left Pupil", "Right Pupil", "Pupil", "pupil"]
    gaze_names = ["x-axis", "y-axis", "Left x", "Left y", "Right x", "Right y"]

    written = 0
    for f in files:
        df0 = pd.read_csv(f)

        c_illum = col_find(df0, ill_names)
        c_depth = col_find(df0, dep_names)

        # pick numeric columns to jitter (excluding illum/depth which we control)
        numeric_cols = []
        for c in df0.columns:
            if c_illum and c == c_illum: 
                continue
            if c_depth and c == c_depth:
                continue
            # heuristic: only jitter columns that look like pupil/gaze
            cl = c.lower()
            if any(k.lower() in cl for k in pupil_names) or any(k.lower() in cl for k in gaze_names):
                numeric_cols.append(c)

        for i in range(args.copies):
            df = df0.copy()

            # jitter pupil/gaze-ish cols
            for c in numeric_cols:
                x = pd.to_numeric(df[c], errors="coerce").to_numpy(dtype=float)
                if np.all(np.isnan(x)):
                    continue
                sigma = np.nanstd(x) * 0.05  # 5% of signal std
                if not np.isfinite(sigma) or sigma == 0:
                    sigma = 0.01
                noise = rng.normal(0, sigma, size=len(x))
                x2 = x + noise
                df[c] = x2

            # enforce illuminance 45-55
            if c_illum:
                ill = pd.to_numeric(df[c_illum], errors="coerce").to_numpy(dtype=float)
                if np.all(np.isnan(ill)):
                    ill = rng.uniform(args.illum_min, args.illum_max, size=len(df))
                else:
                    # pull toward middle & clamp
                    ill = ill + rng.normal(0, 1.0, size=len(ill))
                    ill = clamp(ill, args.illum_min, args.illum_max)
                df[c_illum] = ill

            # enforce depth around 30
            if c_depth:
                dep = pd.to_numeric(df[c_depth], errors="coerce").to_numpy(dtype=float)
                target = rng.normal(args.depth_mean, args.depth_std, size=len(df))
                if np.all(np.isnan(dep)):
                    dep2 = target
                else:
                    dep2 = 0.6 * dep + 0.4 * target
                df[c_depth] = dep2

            # output path keeps same relative structure
            rel = f.relative_to(in_dir)
            out_sub = out_dir / rel.parent
            out_sub.mkdir(parents=True, exist_ok=True)
            out_name = f"{f.stem}_aug{i+1:03d}.csv"
            df.to_csv(out_sub / out_name, index=False)
            written += 1

    print(f"✅ Wrote {written} augmented CSVs into: {out_dir}")

if __name__ == "__main__":
    main()


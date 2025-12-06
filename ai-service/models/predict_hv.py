# ai-service/models/predict_hv.py
# Minimal runner: load trained hv model.joblib and predict on test CSV(s)

import argparse, math, json
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

ALIASES = {
    "left_pupil":  ["left pupil", "left_pupil", "lpupil", "l pupil", "leftpupil", "left pupil (mm)"],
    "right_pupil": ["right pupil", "right_pupil", "rpupil", "r pupil", "rightpupil", "right pupil (mm)"],
    "illum":       ["illuminance", "illum", "brightness", "bright", "light"],
    "depth":       ["depth", "distance", "z", "zdepth"],
    "lx":          ["left x-axis", "left_x", "left x", "lx"],
    "ly":          ["left y-axis", "left_y", "left y", "ly"],
    "rx":          ["right x-axis", "right_x", "right x", "rx"],
    "ry":          ["right y-axis", "right_y", "right y", "ry"],
}

def _norm(s: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else " " for ch in s).strip()

def pick_column(df: pd.DataFrame, wanted_key: str):
    cols = list(df.columns)
    norm_cols = {c: _norm(c) for c in cols}
    wanted = [_norm(x) for x in ALIASES[wanted_key]]

    for c, nc in norm_cols.items():
        for w in wanted:
            if nc == w:
                return c
    for c, nc in norm_cols.items():
        for w in wanted:
            if w in nc:
                return c
    return None

def _safe_float_array(series) -> np.ndarray:
    return pd.to_numeric(series, errors="coerce").astype(float).to_numpy()

def _autocorr_lag1(x: np.ndarray) -> float:
    if x.size < 3: return 0.0
    a = x[:-1] - x[:-1].mean()
    b = x[1:] - x[1:].mean()
    denom = math.sqrt(float(a @ a) * float(b @ b))
    return float((a @ b) / denom) if denom > 0 else 0.0

def _slope(x: np.ndarray) -> float:
    if x.size < 2: return 0.0
    t = np.arange(x.size, dtype=float)
    t = t - t.mean()
    y = x - x.mean()
    denom = float(t @ t)
    return float((t @ y) / denom) if denom > 0 else 0.0

def _fft_features(x: np.ndarray, fps: float):
    if x.size < 16:
        return {"fft_peak_hz": 0.0, "fft_peak_ratio": 0.0}
    x = x.astype(float) - float(np.mean(x))
    spec = np.fft.rfft(x)
    pwr = (spec.real**2 + spec.imag**2)

    if pwr.size <= 2:
        return {"fft_peak_hz": 0.0, "fft_peak_ratio": 0.0}

    pwr[0] = 0.0  # ignore DC
    peak_idx = int(np.argmax(pwr))
    freqs = np.fft.rfftfreq(x.size, d=1.0 / float(fps))
    peak_hz = float(freqs[peak_idx])
    total = float(np.sum(pwr)) + 1e-12
    peak_ratio = float(pwr[peak_idx] / total)
    return {"fft_peak_hz": peak_hz, "fft_peak_ratio": peak_ratio}

def summarize_signal(x: np.ndarray, fps: float, prefix: str):
    x = x.astype(float)
    x = x[~np.isnan(x)]
    if x.size == 0:
        return {
            f"{prefix}_mean": 0.0, f"{prefix}_std": 0.0, f"{prefix}_min": 0.0, f"{prefix}_max": 0.0,
            f"{prefix}_range": 0.0, f"{prefix}_p10": 0.0, f"{prefix}_p90": 0.0, f"{prefix}_slope": 0.0,
            f"{prefix}_absdiff_mean": 0.0, f"{prefix}_absdiff_std": 0.0, f"{prefix}_autocorr1": 0.0,
            f"{prefix}_fft_peak_hz": 0.0, f"{prefix}_fft_peak_ratio": 0.0,
        }

    d = np.diff(x)
    feats = {
        f"{prefix}_mean": float(np.mean(x)),
        f"{prefix}_std": float(np.std(x)),
        f"{prefix}_min": float(np.min(x)),
        f"{prefix}_max": float(np.max(x)),
        f"{prefix}_range": float(np.max(x) - np.min(x)),
        f"{prefix}_p10": float(np.percentile(x, 10)),
        f"{prefix}_p90": float(np.percentile(x, 90)),
        f"{prefix}_slope": _slope(x),
        f"{prefix}_absdiff_mean": float(np.mean(np.abs(d))) if d.size else 0.0,
        f"{prefix}_absdiff_std": float(np.std(d)) if d.size else 0.0,
        f"{prefix}_autocorr1": _autocorr_lag1(x),
    }
    feats.update({f"{prefix}_{k}": v for k, v in _fft_features(x, fps).items()})
    return feats

def extract_features(csv_path: Path, fps: float) -> dict:
    df = pd.read_csv(csv_path)

    c_lp = pick_column(df, "left_pupil")
    c_rp = pick_column(df, "right_pupil")
    c_il = pick_column(df, "illum")
    c_dp = pick_column(df, "depth")
    c_lx = pick_column(df, "lx")
    c_ly = pick_column(df, "ly")
    c_rx = pick_column(df, "rx")
    c_ry = pick_column(df, "ry")

    feats = {}
    if c_lp: feats.update(summarize_signal(_safe_float_array(df[c_lp]), fps, "lp"))
    if c_rp: feats.update(summarize_signal(_safe_float_array(df[c_rp]), fps, "rp"))
    if c_il: feats.update(summarize_signal(_safe_float_array(df[c_il]), fps, "illum"))
    if c_dp: feats.update(summarize_signal(_safe_float_array(df[c_dp]), fps, "depth"))
    if c_lx: feats.update(summarize_signal(_safe_float_array(df[c_lx]), fps, "lx"))
    if c_ly: feats.update(summarize_signal(_safe_float_array(df[c_ly]), fps, "ly"))
    if c_rx: feats.update(summarize_signal(_safe_float_array(df[c_rx]), fps, "rx"))
    if c_ry: feats.update(summarize_signal(_safe_float_array(df[c_ry]), fps, "ry"))

    # cross-eye
    if c_lp and c_rp:
        l = _safe_float_array(df[c_lp])
        r = _safe_float_array(df[c_rp])
        mask = ~np.isnan(l) & ~np.isnan(r)
        if mask.sum() > 2:
            diff = l[mask] - r[mask]
            feats.update(summarize_signal(diff, fps, "lr_diff"))
            feats["lr_corr"] = float(np.corrcoef(l[mask], r[mask])[0, 1])
        else:
            feats.update(summarize_signal(np.array([]), fps, "lr_diff"))
            feats["lr_corr"] = 0.0

    return feats

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="Path to model.joblib saved by training")
    ap.add_argument("--csv", help="Single CSV to predict")
    ap.add_argument("--dir", help="Directory of CSV files to predict (recursive)")
    ap.add_argument("--fps", type=float, default=None, help="Override fps; default uses saved bundle fps")
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--json", action="store_true", help="Print JSON lines instead of pretty text")
    args = ap.parse_args()

    bundle = joblib.load(args.model)
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]
    fps = float(args.fps) if args.fps is not None else float(bundle.get("fps", 30.0))

    if not args.csv and not args.dir:
        raise SystemExit("Provide either --csv <file.csv> or --dir <folder>")

    csvs = []
    if args.csv:
        csvs = [Path(args.csv)]
    else:
        csvs = sorted(Path(args.dir).rglob("*.csv"))

    if not csvs:
        raise SystemExit("No CSV files found.")

    for p in csvs:
        feats = extract_features(p, fps=fps)
        X = pd.DataFrame([feats]).reindex(columns=feature_cols, fill_value=0.0)

        probs = model.predict_proba(X)[0]
        classes = list(model.classes_)
        idx = int(np.argmax(probs))
        pred = classes[idx]
        conf = float(probs[idx])

        # top-k
        order = np.argsort(-probs)[: max(1, args.topk)]
        top = [{"label": classes[i], "prob": float(probs[i])} for i in order]

        out = {"file": str(p), "pred": pred, "confidence": conf, "top": top}

        if args.json:
            print(json.dumps(out))
        else:
            print(f"\n{p}")
            print(f"  pred: {pred}  (conf={conf:.3f})")
            for t in top:
                print(f"   - {t['label']}: {t['prob']:.3f}")

if __name__ == "__main__":
    main()

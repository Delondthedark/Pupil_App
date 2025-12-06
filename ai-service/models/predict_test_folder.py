# ai-service/models/predict_test_folder.py
# Walk a folder of CSVs -> predict each -> save results.csv
# True label inference:
#   1) if parent folder name matches a known label, use it
#   2) else if filename starts with "<Label>_" or "<Label>-", use it

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score, balanced_accuracy_score

# ---- Column aliases (matches your dataset) ----
ALIASES = {
    "left_pupil":  ["left pupil (mm)", "left pupil", "left_pupil", "lpupil", "l pupil", "leftpupil"],
    "right_pupil": ["right pupil (mm)", "right pupil", "right_pupil", "rpupil", "r pupil", "rightpupil"],
    "illum":       ["illuminance", "illum", "brightness", "bright", "light"],
    "depth":       ["depth", "distance", "z", "zdepth"],
    "lx":          ["left x-axis", "left_x", "left x", "lx"],
    "ly":          ["left y-axis", "left_y", "left y", "ly"],
    "rx":          ["right x-axis", "right_x", "right x", "rx"],
    "ry":          ["right y-axis", "right_y", "right y", "ry"],
}

def _norm(s: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else " " for ch in str(s)).strip()

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
    if x.size < 3:
        return 0.0
    a = x[:-1] - x[:-1].mean()
    b = x[1:] - x[1:].mean()
    denom = float(np.sqrt((a @ a) * (b @ b)))
    return float((a @ b) / denom) if denom > 0 else 0.0

def _slope(x: np.ndarray) -> float:
    if x.size < 2:
        return 0.0
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

def infer_true_label(p: Path, known_labels: list[str]) -> str | None:
    parent = p.parent.name
    if parent in known_labels:
        return parent

    name = p.stem  # filename without .csv
    for lab in known_labels:
        if name.startswith(lab + "_") or name.startswith(lab + "-") or name.lower().startswith(lab.lower() + "_") or name.lower().startswith(lab.lower() + "-"):
            return lab
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="Path to model.joblib")
    ap.add_argument("--test-dir", required=True, help="Folder containing test CSVs (recursive)")
    ap.add_argument("--out", default="results.csv", help="Output CSV path")
    ap.add_argument("--fps", type=float, default=None, help="Override fps; default uses bundle fps")
    ap.add_argument("--topk", type=int, default=3, help="How many top probs to include")
    ap.add_argument("--jsonl", default="", help="Optional JSONL output path")
    args = ap.parse_args()

    bundle = joblib.load(args.model)
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]
    fps = float(args.fps) if args.fps is not None else float(bundle.get("fps", 30.0))

    known_labels = list(bundle.get("labels", [])) or list(getattr(model, "classes_", []))

    test_dir = Path(args.test_dir).expanduser().resolve()
    csvs = sorted(test_dir.rglob("*.csv"))
    if not csvs:
        raise SystemExit(f"No CSV files found under: {test_dir}")

    rows = []
    jsonl_f = open(args.jsonl, "w", encoding="utf-8") if args.jsonl else None

    for p in csvs:
        feats = extract_features(p, fps=fps)
        X = pd.DataFrame([feats]).reindex(columns=feature_cols, fill_value=0.0)

        probs = model.predict_proba(X)[0]
        classes = list(model.classes_)
        best_i = int(np.argmax(probs))
        pred = classes[best_i]
        conf = float(probs[best_i])

        order = np.argsort(-probs)[: max(1, args.topk)]
        top = [(classes[i], float(probs[i])) for i in order]

        true_label = infer_true_label(p, known_labels)

        row = {
            "file": str(p),
            "true": true_label if true_label is not None else "",
            "pred": pred,
            "confidence": conf,
        }
        for k, (lab, pr) in enumerate(top, start=1):
            row[f"top{k}_label"] = lab
            row[f"top{k}_prob"] = pr

        rows.append(row)

        if jsonl_f:
            jsonl_f.write(json.dumps(row) + "\n")

    if jsonl_f:
        jsonl_f.close()

    df = pd.DataFrame(rows)
    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)

    print(f"\n✅ Wrote: {out_path}")
    print(df[["file", "true", "pred", "confidence"]].head(10).to_string(index=False))

    # If we have true labels, compute metrics
    has_truth = (df["true"].astype(str).str.len() > 0).any()
    if has_truth:
        y_true = df["true"].astype(str).to_numpy()
        y_pred = df["pred"].astype(str).to_numpy()

        acc = accuracy_score(y_true, y_pred)
        bacc = balanced_accuracy_score(y_true, y_pred)
        labs = sorted(list(set(y_true.tolist()) | set(y_pred.tolist())))

        print("\n=== Summary (using inferred true labels) ===")
        print(f"Accuracy:          {acc:.4f}")
        print(f"Balanced accuracy: {bacc:.4f}")
        print("\nConfusion matrix (label order):")
        print(labs)
        print(confusion_matrix(y_true, y_pred, labels=labs))
        print("\nReport:")
        print(classification_report(y_true, y_pred, labels=labs, zero_division=0))

if __name__ == "__main__":
    main()

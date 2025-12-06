# ai-service/csv_api.py
import os, io, math
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Header

import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# -----------------------------
# Config
# -----------------------------
load_dotenv()

MODEL_PATH = os.getenv("HV_MODEL_PATH", "models/artifacts/latest/model.joblib")
API_KEY = os.getenv("HV_API_KEY", "")  # optional: set to require X-API-Key

app = FastAPI(title="HV CSV Detection API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Feature extraction (same as training)
# -----------------------------
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
    norm_cols = {c: _norm(c) for c in df.columns}
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
    denom = float(np.sqrt((a @ a) * (b @ b)))
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
    pwr[0] = 0.0
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

def extract_features_df(df: pd.DataFrame, fps: float) -> dict:
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

# -----------------------------
# Model load
# -----------------------------
@lru_cache(maxsize=1)
def load_bundle():
    p = Path(MODEL_PATH).expanduser().resolve()
    if not p.exists():
        raise RuntimeError(f"Model not found at HV_MODEL_PATH={p}")
    bundle = joblib.load(p)
    return bundle

def require_key(x_api_key: str | None):
    if API_KEY and (x_api_key != API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")

# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health():
    b = load_bundle()
    return {
        "ok": True,
        "model_path": str(Path(MODEL_PATH).expanduser()),
        "labels": list(b.get("labels", getattr(b["model"], "classes_", []))),
        "trained_at": b.get("trained_at", None),
    }

@app.post("/detect_csv")
async def detect_csv(
    file: UploadFile = File(...),
    topk: int = 3,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),   # pass header X-API-Key; FastAPI maps it to x_api_key
):
    require_key(x_api_key)

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(status_code=413, detail="CSV too large (max 5MB)")

    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    bundle = load_bundle()
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]
    fps = float(bundle.get("fps", 30.0))

    feats = extract_features_df(df, fps=fps)
    X = pd.DataFrame([feats]).reindex(columns=feature_cols, fill_value=0.0)

    try:
        probs = model.predict_proba(X)[0]
        classes = list(model.classes_)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model prediction failed: {e}")

    best_i = int(np.argmax(probs))
    pred = classes[best_i]
    conf = float(probs[best_i])

    order = np.argsort(-probs)[: max(1, min(int(topk), len(classes)))]
    top = [{"label": classes[i], "prob": float(probs[i])} for i in order]

    return {
        "filename": file.filename,
        "predicted_label": pred,
        "confidence": conf,
        "top": top,
    }

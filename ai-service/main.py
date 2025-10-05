# ai-service/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional, List
from collections import deque

import cv2
import numpy as np
import mediapipe as mp
import base64
import joblib
import os

# ==============================
# FastAPI App Setup
# ==============================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# Load ML model
# ==============================
class FeatureVector(BaseModel):
    n: int
    L_mean: float
    R_mean: float
    L_std: float
    R_std: float
    asym: float
    corr_L_B: Optional[float] = None
    corr_R_B: Optional[float] = None
    stv: float

MODEL_PATH = os.getenv("ML_MODEL_PATH", os.path.join("models", "pupil_rf_model.joblib"))
pipe = None

try:
    if os.path.exists(MODEL_PATH):
        pipe = joblib.load(MODEL_PATH)
        print(f"✅ Loaded model from {MODEL_PATH}")
    else:
        print(f"⚠️ Model file not found at {MODEL_PATH}")
except Exception as e:
    print(f"⚠️ Could not load model at {MODEL_PATH}: {e}")
    pipe = None

LABEL_MAP = {
    "parkinson": "Parkinson’s",
    "alzheimers": "Alzheimer’s",
    "ptsd": "PTSD",
    "stress": "High Stress",
    "depression": "Depression",
    "adhd": "ADHD",
    "clear": "Clear",
    "review_recommended": "Review Recommended",
}
def normalize_label(label: str) -> str:
    return LABEL_MAP.get(str(label).lower(), str(label).title())

def _norm_key(s: str) -> str:
    # stable key for maps
    return (s or "").strip().lower().replace("’", "'")

# --- Reasons helpers (pure add-on, safe) ---
def derive_reasons(feats: FeatureVector, top_key: str, top_conf: float) -> List[str]:
    """
    Produce short, human-readable reasons from your features.
    Thresholds are conservative & can be tuned later.
    """
    reasons: List[str] = []

    # Asymmetry (mm)
    if isinstance(feats.asym, (int, float)):
        if abs(feats.asym) >= 0.30:
            reasons.append(f"Large L/R asymmetry ({feats.asym:.3f} mm)")
        elif abs(feats.asym) >= 0.10:
            reasons.append(f"Small L/R asymmetry ({feats.asym:.3f} mm)")

    # Short-term variability (stv)
    if isinstance(feats.stv, (int, float)):
        if feats.stv >= 0.40:
            reasons.append(f"High short-term variability (STV={feats.stv:.3f})")
        elif feats.stv >= 0.20:
            reasons.append(f"Moderate short-term variability (STV={feats.stv:.3f})")

    # Brightness coupling correlations
    for side, val in (("L", feats.corr_L_B), ("R", feats.corr_R_B)):
        if isinstance(val, (int, float)):
            if abs(val) >= 0.60:
                reasons.append(f"Strong brightness coupling {side} (|r|={abs(val):.3f})")
            elif abs(val) >= 0.40:
                reasons.append(f"Moderate brightness coupling {side} (|r|={abs(val):.3f})")

    # Confidence tag (optional)
    if isinstance(top_conf, (int, float)):
        if top_conf >= 0.90:
            reasons.append("Very high model confidence")
        elif top_conf >= 0.75:
            reasons.append("High model confidence")

    # Fallback if none triggered
    return reasons or ["Top match among tested classes"]

# ==============================
# MediaPipe (kept as-is)
# ==============================
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

LEFT_EYE = [33, 133, 159, 145]
RIGHT_EYE = [362, 263, 386, 374]
LEFT_IRIS = [468, 469, 470, 471]
RIGHT_IRIS = [473, 474, 475, 476]

def get_eye_center(landmarks, indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in indices]
    return np.mean(pts, axis=0), pts

def get_iris_center(landmarks, indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in indices]
    return np.mean(pts, axis=0)

iris_history = deque(maxlen=20)

def draw_gaze_shift_trail(image, trail):
    for i in range(1, len(trail)):
        pt1 = tuple(map(int, trail[i - 1]))
        pt2 = tuple(map(int, trail[i]))
        cv2.line(image, pt1, pt2, (0, 0, 255), 2)
    return image

# ==============================
# Endpoints
# ==============================
@app.get("/ping")
def ping():
    return {"message": "AI service is alive"}

@app.post("/eye_direction/")
async def eye_direction(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)

    image = cv2.flip(image, 1)
    h, w, _ = image.shape
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    direction = "undetected"
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            left_eye_center, _ = get_eye_center(face_landmarks.landmark, LEFT_EYE, (h, w))
            right_eye_center, _ = get_eye_center(face_landmarks.landmark, RIGHT_EYE, (h, w))
            left_iris_center = get_iris_center(face_landmarks.landmark, LEFT_IRIS, (h, w))
            right_iris_center = get_iris_center(face_landmarks.landmark, RIGHT_IRIS, (h, w))

            avg_vector = ((left_iris_center[0] - left_eye_center[0],
                           left_iris_center[1] - left_eye_center[1]) +
                          (right_iris_center[0] - right_eye_center[0],
                           right_iris_center[1] - right_eye_center[1])) / 2
            dx, dy = avg_vector
            if abs(dx) < 5 and abs(dy) < 5:
                direction = "forward"
            elif abs(dx) > abs(dy):
                direction = "right" if dx > 0 else "left"
            else:
                direction = "down" if dy > 0 else "up"

    _, buffer = cv2.imencode(".jpg", image)
    img_b64 = base64.b64encode(buffer).decode("utf-8")
    return {"annotated_image": f"data:image/jpeg;base64,{img_b64}", "direction": direction}

@app.post("/analyze/")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)
    image = cv2.flip(image, 1)
    _, buffer = cv2.imencode(".jpg", image)
    img_b64 = base64.b64encode(buffer).decode("utf-8")
    return {"annotated_image": f"data:image/jpeg;base64,{img_b64}", "left_pupil_size": None, "right_pupil_size": None}

@app.post("/gaze_shift/")
async def gaze_shift(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)
    _, buffer = cv2.imencode(".jpg", image)
    img_b64 = base64.b64encode(buffer).decode("utf-8")
    return {"annotated_image": f"data:image/jpeg;base64,{img_b64}"}

@app.post("/ml/predict")
def ml_predict(feats: FeatureVector) -> Dict:
    if pipe is None:
        raise HTTPException(status_code=500, detail=f"Model not loaded ({MODEL_PATH})")
    X = np.array([[
        feats.n, feats.L_mean, feats.R_mean,
        feats.L_std, feats.R_std,
        feats.asym,
        feats.corr_L_B or 0.0,
        feats.corr_R_B or 0.0,
        feats.stv,
    ]])
    try:
        proba = pipe.predict_proba(X)[0]
        raw_label = pipe.classes_[np.argmax(proba)]
        label = normalize_label(raw_label)

        # Map of normalized class → probability
        proba_map = { normalize_label(c): float(p) for c, p in zip(pipe.classes_, proba) }

        # Compute reasons for the top condition (ALWAYS provided)
        top_condition = label
        top_conf = float(proba_map.get(top_condition, 0.0))
        reasons = derive_reasons(feats, top_condition, top_conf)

        # Optional: provide per-class scores array with inline reasons for the top one
        scores = []
        for c_raw, p in zip(pipe.classes_, proba):
            c_norm = normalize_label(c_raw)
            if c_norm == top_condition:
                scores.append({"label": c_norm, "score": float(p), "reasons": reasons})
            else:
                scores.append({"label": c_norm, "score": float(p)})

        return {
            "label": label,
            "proba": proba_map,
            "top_condition": top_condition,       # NEW
            "reasons": reasons,                   # NEW (for top condition)
            "explanations": {                     # NEW (map for easy lookup)
                _norm_key(top_condition): reasons
            },
            "scores": scores                      # NEW (array; top includes reasons)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {e}")

@app.get("/ml/health")
def ml_health():
    classes = []
    try:
        if pipe is not None and hasattr(pipe, "classes_"):
            classes = [str(c) for c in pipe.classes_]
    except Exception:
        pass
    return {
        "ok": True,
        "model_loaded": pipe is not None,
        "model_path": MODEL_PATH,
        "exists": os.path.exists(MODEL_PATH),
        "classes": classes,
        "cwd": os.getcwd()
    }

if __name__ == "__main__":
    import uvicorn
    # Keep 0.0.0.0:8000 so Nginx can proxy (you already wired /ai/ -> 127.0.0.1:8000)
    uvicorn.run(app, host="0.0.0.0", port=8000)

# ai-service/models/train_model.py
import argparse, os, glob, re, json
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedKFold, train_test_split, RandomizedSearchCV
from sklearn.metrics import classification_report, confusion_matrix, log_loss
from sklearn.utils import shuffle
import joblib

LABELS = ["parkinson", "alzheimers", "stress", "ptsd"]

# -----------------------------
# Synthetic dataset (improved separation)
# -----------------------------
def synthetic_dataset(n_per_class=600, seed=42):
    rng = np.random.default_rng(seed)
    X, y = [], []

    # Parkinson: low variability, weak corr, mild asym
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.0, 0.08), rng.normal(3.1, 0.08)
        Ls, Rs = rng.normal(0.03, 0.01), rng.normal(0.04, 0.01)
        asym = abs(Lm - Rm)
        corrL = rng.normal(0.05, 0.03)
        corrR = rng.normal(0.10, 0.03)
        stv = rng.normal(0.05, 0.02)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("parkinson")

    # Alzheimer’s: strong asymmetry + moderate var
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(2.9, 0.15), rng.normal(3.6, 0.15)
        Ls, Rs = rng.normal(0.15, 0.04), rng.normal(0.14, 0.04)
        asym = abs(Lm - Rm)
        corrL = rng.normal(0.1, 0.05)
        corrR = rng.normal(0.1, 0.05)
        stv = rng.normal(0.20, 0.05)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("alzheimers")

    # Stress: high variability + strong positive correlation
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.2, 0.12), rng.normal(3.3, 0.12)
        Ls, Rs = rng.normal(0.30, 0.06), rng.normal(0.28, 0.06)
        asym = rng.normal(0.1, 0.05)
        corrL = rng.normal(0.7, 0.1)
        corrR = rng.normal(0.65, 0.1)
        stv = rng.normal(0.35, 0.07)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("stress")

    # PTSD: small asymmetry + strong negative correlation
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.1, 0.1), rng.normal(3.15, 0.1)
        Ls, Rs = rng.normal(0.12, 0.03), rng.normal(0.11, 0.03)
        asym = rng.normal(0.1, 0.04)
        corrL = rng.normal(-0.55, 0.08)
        corrR = rng.normal(-0.50, 0.08)
        stv = rng.normal(0.18, 0.04)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("ptsd")

    return np.array(X, dtype=float), np.array(y)

# -----------------------------
# Train model
# -----------------------------
def train_model(X, y, out_path):
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)

    base_pipe = Pipeline([
        ("scale", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=500,
            random_state=42,
            class_weight="balanced",
            n_jobs=-1
        ))
    ])

    param_dist = {
        "rf__max_depth": [None, 8, 12, 16],
        "rf__min_samples_leaf": [1, 2, 3],
        "rf__max_features": ["sqrt", 0.7, 0.9, None]
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    search = RandomizedSearchCV(base_pipe, param_dist, n_iter=15,
                                scoring="neg_log_loss", cv=cv, random_state=42, n_jobs=-1, verbose=1)
    search.fit(Xtr, ytr)

    best_pipe = search.best_estimator_
    calibrated = CalibratedClassifierCV(best_pipe, cv=3, method="sigmoid")
    calibrated.fit(Xtr, ytr)

    # Evaluate
    y_pred = calibrated.predict(Xte)
    y_proba = calibrated.predict_proba(Xte)
    print("\n=== Validation Report ===")
    print(classification_report(yte, y_pred, digits=3))
    print("Confusion matrix:\n", confusion_matrix(yte, y_pred))

    # Save model + metadata
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    joblib.dump(calibrated, out_path)
    meta = {
        "classes": list(np.unique(y)),
        "counts": {c: int((y == c).sum()) for c in np.unique(y)},
    }
    with open(out_path.replace(".joblib", "_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\n✅ Saved model to {out_path}")

# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    out_file = os.path.join(os.path.dirname(__file__), "pupil_rf_model.joblib")
    X, y = synthetic_dataset()
    print("Class counts:", {c: int((y == c).sum()) for c in np.unique(y)})
    train_model(X, y, out_file)

import argparse, os, json
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedKFold, train_test_split, RandomizedSearchCV
from sklearn.metrics import classification_report, confusion_matrix
import joblib

# Expanded label set
LABELS = ["parkinson", "alzheimers", "stress", "ptsd", "depression", "adhd"]

# 9 features expected by the serving API:
# [n, L_mean, R_mean, L_std, R_std, asym, corr_L_B, corr_R_B, stv]

# -----------------------------
# Synthetic dataset (engineered for separability)
# -----------------------------
def synthetic_dataset(n_per_class=600, seed=42):
    """
    Generates a balanced synthetic dataset across 6 classes.
    NOTE: This is purely synthetic for model plumbing and evaluation.
    """
    rng = np.random.default_rng(seed)
    X, y = [], []

    # Parkinson: low variability, weak corr, mild asym
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.00, 0.08), rng.normal(3.10, 0.08)
        Ls, Rs = rng.normal(0.03, 0.01), rng.normal(0.04, 0.01)
        asym = abs(Lm - Rm)
        corrL = rng.normal(0.05, 0.03)
        corrR = rng.normal(0.10, 0.03)
        stv = rng.normal(0.05, 0.02)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("parkinson")

    # Alzheimer’s: strong asymmetry + moderate variance
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(2.90, 0.15), rng.normal(3.60, 0.15)
        Ls, Rs = rng.normal(0.15, 0.04), rng.normal(0.14, 0.04)
        asym = abs(Lm - Rm)
        corrL = rng.normal(0.10, 0.05)
        corrR = rng.normal(0.10, 0.05)
        stv = rng.normal(0.20, 0.05)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("alzheimers")

    # Stress: high variability + strong positive correlation
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.20, 0.12), rng.normal(3.30, 0.12)
        Ls, Rs = rng.normal(0.30, 0.06), rng.normal(0.28, 0.06)
        asym = rng.normal(0.10, 0.05)
        corrL = rng.normal(0.70, 0.10)
        corrR = rng.normal(0.65, 0.10)
        stv = rng.normal(0.35, 0.07)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("stress")

    # PTSD: small asymmetry + strong negative correlation
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.10, 0.10), rng.normal(3.15, 0.10)
        Ls, Rs = rng.normal(0.12, 0.03), rng.normal(0.11, 0.03)
        asym = rng.normal(0.10, 0.04)
        corrL = rng.normal(-0.55, 0.08)
        corrR = rng.normal(-0.50, 0.08)
        stv = rng.normal(0.18, 0.04)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("ptsd")

    # Depression: slightly smaller means, moderate variance, mild positive corr, mid stv
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(2.85, 0.10), rng.normal(2.95, 0.10)
        Ls, Rs = rng.normal(0.14, 0.03), rng.normal(0.13, 0.03)
        asym = rng.normal(0.08, 0.04)
        corrL = rng.normal(0.20, 0.08)
        corrR = rng.normal(0.18, 0.08)
        stv = rng.normal(0.22, 0.05)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("depression")

    # ADHD: larger variability, near-zero corr, high stv
    for _ in range(n_per_class):
        Lm, Rm = rng.normal(3.25, 0.15), rng.normal(3.28, 0.15)
        Ls, Rs = rng.normal(0.34, 0.07), rng.normal(0.33, 0.07)
        asym = rng.normal(0.09, 0.05)
        corrL = rng.normal(0.05, 0.12)   # around 0 with spread
        corrR = rng.normal(0.00, 0.12)
        stv = rng.normal(0.42, 0.08)
        X.append([300, Lm, Rm, Ls, Rs, asym, corrL, corrR, stv]); y.append("adhd")

    X = np.array(X, dtype=float)
    y = np.array(y)
    return X, y

# -----------------------------
# Train model
# -----------------------------
def train_model(X, y, out_path):
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)

    base_pipe = Pipeline([
        ("scale", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=600,
            random_state=42,
            class_weight="balanced",
            n_jobs=-1
        ))
    ])

    param_dist = {
        "rf__max_depth": [None, 10, 14, 18],
        "rf__min_samples_leaf": [1, 2, 3],
        "rf__max_features": ["sqrt", 0.7, 0.9, None]
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    search = RandomizedSearchCV(
        base_pipe, param_dist, n_iter=18,
        scoring="neg_log_loss", cv=cv, random_state=42, n_jobs=-1, verbose=1
    )
    search.fit(Xtr, ytr)

    best_pipe = search.best_estimator_
    calibrated = CalibratedClassifierCV(best_pipe, cv=3, method="sigmoid")
    calibrated.fit(Xtr, ytr)

    # Evaluate
    y_pred = calibrated.predict(Xte)
    print("\n=== Validation Report ===")
    print(classification_report(yte, y_pred, labels=LABELS, digits=3))
    print("Confusion matrix (rows=true, cols=pred):\n", confusion_matrix(yte, y_pred, labels=LABELS))

    # Save model + metadata
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    joblib.dump(calibrated, out_path)
    meta = {
        "classes": sorted(list(set(y.tolist()))),
        "counts": {c: int((y == c).sum()) for c in sorted(set(y.tolist()))},
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
    print("Class counts:", {c: int((y == c).sum()) for c in sorted(set(y.tolist()))})
    train_model(X, y, out_file)

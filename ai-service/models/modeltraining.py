# ai-service/models/modeltraining.py
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.compose import ColumnTransformer
import joblib
import os

# --- Synthetic training data ---
# Each row is: [n, L_mean, R_mean, L_std, R_std, asym, corr_L_B, corr_R_B, stv]
# Labels: "parkinson", "alzheimers", "stress", "ptsd"
X = []
y = []

rng = np.random.default_rng(42)

# Parkinson: very low variability, weak correlation
for _ in range(50):
    X.append([300, 3.0, 3.1, 0.03, 0.04, 0.2, 0.05, 0.1, 0.05])
    y.append("parkinson")

# Alzheimer’s: strong asymmetry + moderate variability
for _ in range(50):
    X.append([300, 2.8, 3.6, 0.15, 0.14, 0.8, 0.1, 0.05, 0.2])
    y.append("alzheimers")

# Stress: high variability + strong correlation
for _ in range(50):
    X.append([300, 3.2, 3.3, 0.25, 0.22, 0.1, 0.5, 0.45, 0.3])
    y.append("stress")

# PTSD: negative correlation + small asymmetry
for _ in range(50):
    X.append([300, 3.1, 3.15, 0.12, 0.11, 0.1, -0.4, -0.35, 0.2])
    y.append("ptsd")

X = np.array(X)
y = np.array(y)

# --- Features ---
features = ["n", "L_mean", "R_mean", "L_std", "R_std", "asym", "corr_L_B", "corr_R_B", "stv"]

# --- Pipeline ---
preproc = ColumnTransformer([
    ("scale", StandardScaler(), list(range(len(features))))
])

clf = RandomForestClassifier(n_estimators=100, random_state=42)

pipe = Pipeline([
    ("preproc", preproc),
    ("clf", clf)
])

# --- Train ---
pipe.fit(X, y)

# --- Save ---
os.makedirs("ai-service/models", exist_ok=True)
joblib.dump(pipe, "pupil_rf_model.joblib")

print("✅ Model trained and saved at ai-service/models/pupil_rf_model.joblib")

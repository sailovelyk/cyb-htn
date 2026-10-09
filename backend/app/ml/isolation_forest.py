"""
Isolation Forest ML Engine

Primary unsupervised anomaly detection model.

Score normalization methodology:
---------------------------------
Isolation Forest produces a raw anomaly score s in the range [-1, +1].
  - Scores near +1 indicate normal instances.
  - Scores near -1 indicate anomalous instances.
  - The exact boundary depends on the contamination parameter.

We convert to a normalized application-level score (0.0–1.0) as follows:

    normalized = (raw_score - min_score) / (max_score - min_score)
    normalized = 1.0 - normalized   # flip: 1.0 = most anomalous

Where min_score and max_score are the actual observed training score range.
This is stored with the model at training time so inference uses the same scale.

The normalized score is NOT a probability and is NOT called one.
It represents how anomalous the event is relative to the training baseline.
"""
import os
import joblib
import numpy as np
import logging
from typing import Optional, Tuple
from datetime import datetime, timezone
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from app.ml.feature_engineering import features_dataframe, features_to_vector, FEATURE_COLUMNS
from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL_FILE = os.path.join(settings.ML_MODELS_DIR, "isolation_forest.joblib")
SCALER_FILE = os.path.join(settings.ML_MODELS_DIR, "scaler.joblib")
META_FILE = os.path.join(settings.ML_MODELS_DIR, "model_meta.joblib")

# In-memory cache
_model = None
_scaler = None
_meta = None


def _clear_cache():
    global _model, _scaler, _meta
    _model = None
    _scaler = None
    _meta = None


def load_model() -> Tuple[Optional[IsolationForest], Optional[StandardScaler], Optional[dict]]:
    """Load model, scaler, and metadata from disk. Returns (None, None, None) if not found."""
    global _model, _scaler, _meta
    if _model is not None:
        return _model, _scaler, _meta

    if not os.path.exists(MODEL_FILE):
        return None, None, None

    try:
        _model = joblib.load(MODEL_FILE)
        _scaler = joblib.load(SCALER_FILE) if os.path.exists(SCALER_FILE) else None
        _meta = joblib.load(META_FILE) if os.path.exists(META_FILE) else {}
        logger.info(f"Model loaded from {MODEL_FILE}")
        return _model, _scaler, _meta
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return None, None, None


def train_model(records: list, contamination: float = 0.1) -> dict:
    """
    Train an Isolation Forest on a list of normalized log records.

    Steps:
    1. Extract features from records
    2. Scale features with StandardScaler
    3. Train IsolationForest
    4. Compute score range on training data (for normalization)
    5. Persist model, scaler, and metadata

    Args:
        records: List of normalized log record dicts
        contamination: Expected fraction of anomalies (0.01–0.5)

    Returns:
        dict with training metadata
    """
    global _model, _scaler, _meta
    _clear_cache()

    if len(records) < 10:
        raise ValueError(f"Insufficient training data: {len(records)} records (minimum 10 required)")

    logger.info(f"Training model on {len(records)} records, contamination={contamination}")

    # Extract features
    df = features_dataframe(records)
    X = df.values

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train Isolation Forest
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # Compute raw score range on training data for normalization
    raw_scores = model.score_samples(X_scaled)
    score_min = float(raw_scores.min())
    score_max = float(raw_scores.max())

    # Persist
    os.makedirs(settings.ML_MODELS_DIR, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    joblib.dump(scaler, SCALER_FILE)

    meta = {
        "algorithm": "IsolationForest",
        "version": "1.0",
        "feature_names": FEATURE_COLUMNS,
        "training_record_count": len(records),
        "contamination": contamination,
        "n_estimators": 200,
        "score_min": score_min,
        "score_max": score_max,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    }
    joblib.dump(meta, META_FILE)

    # Update cache
    _model = model
    _scaler = scaler
    _meta = meta

    logger.info(f"Model trained. Score range: [{score_min:.4f}, {score_max:.4f}]")
    return meta


def normalize_score(raw_score: float, score_min: float, score_max: float) -> float:
    """
    Normalize raw Isolation Forest output to [0, 1].

    Isolation Forest score_samples() returns values where:
      - Higher (more positive) = more normal
      - Lower (more negative) = more anomalous

    Normalization:
      1. Clip raw score to observed training range
      2. Linear interpolation: (raw - min) / (max - min)  → gives 0..1 where 1=normal
      3. Flip: normalized = 1 - above  → gives 0..1 where 1=most anomalous

    This produces an application-level anomaly score (NOT a calibrated probability).
    """
    if score_max == score_min:
        return 0.5  # degenerate case: no variance

    score_range = score_max - score_min
    clipped = max(score_min, min(score_max, raw_score))
    normalized = (clipped - score_min) / score_range
    anomaly_score = 1.0 - normalized  # flip so 1=most anomalous
    return round(max(0.0, min(1.0, anomaly_score)), 4)


def predict_single(record: dict) -> Optional[dict]:
    """
    Run anomaly detection on a single normalized log record.

    Returns dict with:
      - raw_model_signal: raw Isolation Forest output
      - normalized_anomaly_score: application-level score [0,1]
      - is_anomaly: model's binary classification (-1=anomaly, 1=normal)

    Returns None if model is not loaded.
    """
    model, scaler, meta = load_model()
    if model is None:
        return None

    from app.ml.feature_engineering import extract_features_from_record
    features = extract_features_from_record(record)
    vector = features_to_vector(features)
    X = np.array([vector])

    if scaler is not None:
        X = scaler.transform(X)

    raw_score = float(model.score_samples(X)[0])
    prediction = int(model.predict(X)[0])  # 1=normal, -1=anomaly

    score_min = meta.get("score_min", -0.5)
    score_max = meta.get("score_max", 0.5)
    normalized = normalize_score(raw_score, score_min, score_max)

    return {
        "raw_model_signal": round(raw_score, 6),
        "normalized_anomaly_score": normalized,
        "is_anomaly": prediction == -1,
        "features": features,
    }


def predict_batch(records: list) -> list:
    """
    Run anomaly detection on multiple records efficiently.
    Returns list of prediction dicts (same order as input).
    """
    model, scaler, meta = load_model()
    if model is None:
        return [None] * len(records)

    from app.ml.feature_engineering import extract_features_from_record
    all_features = [extract_features_from_record(r) for r in records]
    vectors = [features_to_vector(f) for f in all_features]
    X = np.array(vectors)

    if scaler is not None:
        X = scaler.transform(X)

    raw_scores = model.score_samples(X)
    predictions = model.predict(X)

    score_min = meta.get("score_min", -0.5)
    score_max = meta.get("score_max", 0.5)

    results = []
    for i, (raw_score, pred) in enumerate(zip(raw_scores, predictions)):
        normalized = normalize_score(float(raw_score), score_min, score_max)
        results.append({
            "raw_model_signal": round(float(raw_score), 6),
            "normalized_anomaly_score": normalized,
            "is_anomaly": int(pred) == -1,
            "features": all_features[i],
        })

    return results


def get_model_status() -> dict:
    """Return current model status without triggering load errors."""
    if not os.path.exists(MODEL_FILE):
        return {"status": "not_trained", "model_file": MODEL_FILE}

    _, _, meta = load_model()
    if meta is None:
        return {"status": "error", "message": "Model file exists but could not be loaded"}

    return {
        "status": "active",
        **meta,
    }

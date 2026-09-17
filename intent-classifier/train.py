"""Train a TF-IDF + LogisticRegression intent classifier (classic ML, not an LLM)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
import pandas as pd

from labels import INTENTS

ROOT = Path(__file__).resolve().parent
DATA_CSV = ROOT / "data" / "train.csv"
MODEL_DIR = ROOT / "models"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train CEP intent classifier")
    parser.add_argument("--csv", type=Path, default=DATA_CSV)
    parser.add_argument("--out", type=Path, default=MODEL_DIR)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"Missing {args.csv}. Run: python prepare_data.py")

    df = pd.read_csv(args.csv)
    df = df.dropna(subset=["text", "intent"])
    df = df[df["intent"].isin(INTENTS)]
    if df.empty:
        raise SystemExit("No usable rows after filtering.")

    x_train, x_test, y_train, y_test = train_test_split(
        df["text"].astype(str),
        df["intent"].astype(str),
        test_size=0.15,
        random_state=args.seed,
        stratify=df["intent"],
    )

    pipe = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 2),
                    min_df=2,
                    max_features=50_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=4000,
                    class_weight="balanced",
                    solver="saga",
                    n_jobs=-1,
                ),
            ),
        ]
    )

    print(f"Training on {len(x_train)} rows, evaluating on {len(x_test)}...")
    pipe.fit(x_train, y_train)
    pred = pipe.predict(x_test)
    report = classification_report(y_test, pred, digits=3)
    print(report)

    args.out.mkdir(parents=True, exist_ok=True)
    model_path = args.out / "intent_clf.joblib"
    meta_path = args.out / "meta.json"
    joblib.dump(pipe, model_path)

    meta = {
        "model": "tfidf_logreg",
        "intents": list(INTENTS),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "report": report,
        "note": "Classic ML classifier — not an LLM.",
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved model -> {model_path}")
    print(f"Saved meta  -> {meta_path}")


if __name__ == "__main__":
    main()

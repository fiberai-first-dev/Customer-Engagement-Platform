"""
CEP Intent Classifier API

Classic ML (TF-IDF + LogisticRegression) — not an LLM.
CEP can POST message text and get intent + confidence.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from labels import INTENTS, INTENT_DESCRIPTIONS

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("INTENT_MODEL_PATH", ROOT / "models" / "intent_clf.joblib"))

IntentLabel = Literal[
    "pre_purchase",
    "order_status",
    "post_purchase_issue",
    "non_customer_noise",
]

PRE_PURCHASE_HINT = re.compile(
    r"\b(size|stock|available|availability|price|discount|cod|colour|color|"
    r"kitne|size chart|in stock|do you have|looking to buy)\b",
    re.I,
)
ORDER_STATUS_HINT = re.compile(
    r"\b(where is my order|track(ing)?|awb|eta|out for delivery|delivery date|"
    r"kab deliver|shipment status)\b",
    re.I,
)
POST_ISSUE_HINT = re.compile(
    r"\b(refund|return|damaged|broken|wrong item|missing item|not working|"
    r"cancel (my )?order|exchange)\b",
    re.I,
)
NOISE_EXACT = {
    "ok",
    "k",
    "kk",
    "hi",
    "hey",
    "hello",
    "thanks",
    "thank you",
    "thx",
    "haan",
    "nahi",
    "yes",
    "no",
    "👍",
}

app = FastAPI(
    title="CEP Intent Classifier",
    description="Classifies support messages into 4 intents. Classic ML — not an LLM.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Model not found at {MODEL_PATH}. Run prepare_data.py then train.py.",
            )
        _model = joblib.load(MODEL_PATH)
    return _model


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Customer message text")
    channel: str | None = Field(
        default=None,
        description="Optional channel hint (ignored by v1 model; reserved for later)",
    )


class ClassifyResponse(BaseModel):
    intent: IntentLabel
    confidence: float
    intents: list[IntentLabel] = list(INTENTS)
    scores: dict[str, float]


class BatchClassifyRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)


@app.get("/health")
def health():
    ready = MODEL_PATH.exists()
    return {
        "ok": True,
        "model_loaded": _model is not None,
        "model_path": str(MODEL_PATH),
        "model_ready": ready,
        "intents": list(INTENTS),
        "engine": "tfidf_logreg",
        "llm": False,
    }


@app.get("/intents")
def list_intents():
    return {
        "intents": [
            {"id": i, "description": INTENT_DESCRIPTIONS[i]} for i in INTENTS
        ]
    }


def _predict_one(text: str) -> ClassifyResponse:
    model = get_model()
    cleaned = " ".join(text.strip().split())
    if len(cleaned) < 1:
        raise HTTPException(status_code=400, detail="Empty text")

    # Very short / empty-ish → noise bias via rules
    if len(cleaned) <= 2 or cleaned.lower() in NOISE_EXACT:
        scores = {i: 0.0 for i in INTENTS}
        scores["non_customer_noise"] = 1.0
        return ClassifyResponse(
            intent="non_customer_noise",
            confidence=1.0,
            scores=scores,
        )

    proba = model.predict_proba([cleaned])[0]
    classes = list(model.classes_)
    scores = {c: float(p) for c, p in zip(classes, proba)}
    for intent in INTENTS:
        scores.setdefault(intent, 0.0)

    # Light rule boost when model is unsure (public data mixes size/exchange language)
    if max(scores.values()) < 0.55:
        if ORDER_STATUS_HINT.search(cleaned):
            scores["order_status"] = max(scores["order_status"], 0.72)
        elif POST_ISSUE_HINT.search(cleaned):
            scores["post_purchase_issue"] = max(scores["post_purchase_issue"], 0.72)
        elif PRE_PURCHASE_HINT.search(cleaned):
            scores["pre_purchase"] = max(scores["pre_purchase"], 0.72)

    best = max(scores.items(), key=lambda kv: kv[1])
    return ClassifyResponse(
        intent=best[0],  # type: ignore[arg-type]
        confidence=round(best[1], 4),
        scores={k: round(v, 4) for k, v in scores.items()},
    )


@app.post("/classify", response_model=ClassifyResponse)
def classify(body: ClassifyRequest):
    return _predict_one(body.text)


@app.post("/classify/batch")
def classify_batch(body: BatchClassifyRequest):
    return {"results": [_predict_one(t) for t in body.texts]}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8091"))
    uvicorn.run("server:app", host=host, port=port, reload=False)

"""Download public ecommerce intent datasets and map to CEP's 4 labels."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from datasets import load_dataset

from labels import (
    BITEXT_TO_INTENT,
    HINGLISH_TO_INTENT,
    NOISE_EXAMPLES,
    PRE_PURCHASE_EXAMPLES,
    ORDER_STATUS_EXAMPLES,
)

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"


def _row(text: str, intent: str, source: str) -> dict[str, str] | None:
    cleaned = " ".join((text or "").strip().split())
    if len(cleaned) < 2:
        return None
    return {"text": cleaned, "intent": intent, "source": source}


def load_bitext(max_per_intent: int) -> list[dict[str, str]]:
    print(f"Downloading Bitext retail ecommerce dataset...")
    ds = load_dataset(
        "bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset",
        split="train",
    )
    buckets: dict[str, list[dict[str, str]]] = {}
    for row in ds:
        raw = (row.get("intent") or "").strip()
        mapped = BITEXT_TO_INTENT.get(raw)
        if not mapped:
            continue
        instruction = (row.get("instruction") or row.get("utterance") or "").strip()
        # Bitext uses instruction as the customer utterance in many rows
        text = instruction or (row.get("response") or "")
        item = _row(str(text), mapped, f"bitext:{raw}")
        if not item:
            continue
        buckets.setdefault(mapped, []).append(item)

    out: list[dict[str, str]] = []
    for intent, items in buckets.items():
        random.shuffle(items)
        kept = items[:max_per_intent]
        print(f"  bitext {intent}: {len(kept)} / {len(items)}")
        out.extend(kept)
    return out


def load_hinglish(max_per_intent: int) -> list[dict[str, str]]:
    print("Downloading Hinglish retail intent dataset...")
    try:
        ds = load_dataset("Hari5115/hinglish-retail-intent-dataset", split="train")
    except Exception as err:  # noqa: BLE001
        print(f"  skipped hinglish ({err})")
        return []

    buckets: dict[str, list[dict[str, str]]] = {}
    for row in ds:
        raw = (row.get("label") or row.get("intent") or "").strip()
        mapped = HINGLISH_TO_INTENT.get(raw)
        if not mapped:
            continue
        text = row.get("text") or row.get("utterance") or ""
        item = _row(str(text), mapped, f"hinglish:{raw}")
        if not item:
            continue
        buckets.setdefault(mapped, []).append(item)

    out: list[dict[str, str]] = []
    for intent, items in buckets.items():
        random.shuffle(items)
        kept = items[:max_per_intent]
        print(f"  hinglish {intent}: {len(kept)} / {len(items)}")
        out.extend(kept)
    return out


def noise_rows(n: int) -> list[dict[str, str]]:
    base = []
    for text in NOISE_EXAMPLES:
        item = _row(text, "non_customer_noise", "synthetic:noise")
        if item:
            base.append(item)
    # light variants
    extras = [
        _row(f"{t}!", "non_customer_noise", "synthetic:noise")
        for t in NOISE_EXAMPLES
        if len(t) > 1
    ]
    extras = [e for e in extras if e]
    pool = base + extras
    random.shuffle(pool)
    return pool[:n]


def synthetic_intent_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for text in PRE_PURCHASE_EXAMPLES:
        item = _row(text, "pre_purchase", "synthetic:pre_purchase")
        if item:
            rows.append(item)
            rows.append(_row(f"{text} please", "pre_purchase", "synthetic:pre_purchase") or item)
    for text in ORDER_STATUS_EXAMPLES:
        item = _row(text, "order_status", "synthetic:order_status")
        if item:
            rows.append(item)
            rows.append(_row(f"{text} urgently", "order_status", "synthetic:order_status") or item)
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "intent", "source"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare CEP intent training CSV")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-per-intent", type=int, default=1200)
    parser.add_argument("--noise", type=int, default=800)
    args = parser.parse_args()
    random.seed(args.seed)

    rows = []
    rows.extend(load_bitext(args.max_per_intent))
    rows.extend(load_hinglish(args.max_per_intent))
    rows.extend(noise_rows(args.noise))
    rows.extend(synthetic_intent_rows())
    random.shuffle(rows)

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["intent"]] = counts.get(r["intent"], 0) + 1

    out = DATA_DIR / "train.csv"
    write_csv(out, rows)
    print(f"\nWrote {len(rows)} rows -> {out}")
    for intent, n in sorted(counts.items()):
        print(f"  {intent}: {n}")


if __name__ == "__main__":
    main()

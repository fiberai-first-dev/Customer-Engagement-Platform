# CEP Intent Classifier
#
# Classic ML (TF-IDF + LogisticRegression). Not an LLM.
# CEP calls this service over HTTP to classify inbound messages.

## Setup

```bash
cd intent-classifier
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

## Train

```bash
python prepare_data.py
python train.py
```

Models are written to `models/intent_clf.joblib`.

## Run server

```bash
python server.py
# → http://127.0.0.1:8091
```

Health: `GET /health`  
Classify: `POST /classify` with `{"text":"where is my order?"}`

Example:

```bash
curl -s http://127.0.0.1:8091/classify -H "Content-Type: application/json" -d "{\"text\":\"Where is my order? Tracking shows stuck\"}"
```

## Labels

| Intent | Meaning |
|---|---|
| `pre_purchase` | Product / stock / price before buying |
| `order_status` | Tracking / ETA / where is my order |
| `post_purchase_issue` | Return / refund / damaged / wrong item |
| `non_customer_noise` | Spam, ok, stickers, empty chatter |

## CEP wiring

Set in `client/platform-api/.env.local`:

```
INTENT_CLASSIFIER_URL=http://127.0.0.1:8091
```

Enable **Intent Classifier** in admin feature flags. Until that flag is on:
- CEP will **not** call this service
- Inbox will **not** show intent filters

## Docker

```bash
# from this folder (uses bundled_model/ baked into the image)
docker compose up -d --build
```

CEP on the same Docker network can use:

```
INTENT_CLASSIFIER_URL=http://intent-classifier:8091
```

After retraining, refresh the bake:

```bash
copy models\intent_clf.joblib bundled_model\
copy models\meta.json bundled_model\
docker compose up -d --build
```

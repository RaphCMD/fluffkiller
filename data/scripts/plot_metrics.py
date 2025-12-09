"""
Evaluate the trained fluff-model and emit a simple loss/accuracy graph.

Run from repo root:
  python data/scripts/plot_metrics.py

Outputs:
  - fluff-model/metrics_eval.json  (train/test loss/acc/f1)
  - fluff-model/metrics.png        (loss + accuracy bar chart)
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer


DATA_PATH = Path("./data/annotated/merged_annotations.json")
MODEL_DIR = Path("./fluff-model")
MAX_LEN = 256
EVAL_BATCH_SIZE = 32


class ArticleDataset(Dataset):
    def __init__(self, records: List[Dict[str, Any]]):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        return (rec["headline"], rec["text"]), int(rec["label"])


def load_data() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    with DATA_PATH.open("r", encoding="utf-8") as f:
        raw_records = json.load(f)

    records = []
    for item in raw_records:
        records.append(
            {
                "headline": item.get("headline", ""),
                "text": item.get("text") or item.get("paragraph") or "",
                "label": int(item["label"]),
            }
        )

    rng = np.random.default_rng(seed=42)
    rng.shuffle(records)

    split_idx = int(0.8 * len(records))
    train_records = records[:split_idx]
    test_records = records[split_idx:]
    return train_records, test_records


def make_collate(tokenizer):
    def collate(batch):
        pairs, labels = zip(*batch)
        headlines, texts = zip(*pairs)
        enc = tokenizer(
            list(headlines),
            list(texts),
            padding=True,
            truncation=True,
            max_length=MAX_LEN,
            return_tensors="pt",
        )
        return enc, torch.tensor(labels, dtype=torch.long)

    return collate


@torch.no_grad()
def evaluate(model, dataloader, device):
    model.eval()
    all_labels, all_preds = [], []
    total_loss = 0.0
    loss_fn = nn.CrossEntropyLoss()

    for enc, labels in dataloader:
        enc = {k: v.to(device) for k, v in enc.items()}
        labels = labels.to(device)
        outputs = model(**enc)
        loss = loss_fn(outputs.logits, labels)
        total_loss += loss.item()

        preds = torch.argmax(outputs.logits, dim=-1)
        all_labels.extend(labels.cpu().numpy())
        all_preds.extend(preds.cpu().numpy())

    avg_loss = total_loss / len(dataloader)
    acc = accuracy_score(all_labels, all_preds)
    f1 = f1_score(all_labels, all_preds, average="weighted")
    return {"loss": avg_loss, "accuracy": acc, "f1": f1}


def main():
    if not MODEL_DIR.exists():
        raise SystemExit("Model directory fluff-model/ not found. Train first, then rerun.")

    train_records, test_records = load_data()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR, num_labels=2)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    collate_fn = make_collate(tokenizer)
    train_loader = DataLoader(
        ArticleDataset(train_records),
        batch_size=EVAL_BATCH_SIZE,
        shuffle=False,
        collate_fn=collate_fn,
    )
    eval_loader = DataLoader(
        ArticleDataset(test_records),
        batch_size=EVAL_BATCH_SIZE,
        shuffle=False,
        collate_fn=collate_fn,
    )

    print("Evaluating on train split...")
    train_metrics = evaluate(model, train_loader, device)
    print("Evaluating on test split...")
    test_metrics = evaluate(model, eval_loader, device)

    metrics = {"train": train_metrics, "test": test_metrics}
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    metrics_path = MODEL_DIR / "metrics_eval.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved metrics to {metrics_path}")

    # Plot
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))

    # Loss
    axes[0].bar(["train", "test"], [train_metrics["loss"], test_metrics["loss"]], color=["#4a90e2", "#e24a4a"])
    axes[0].set_title("Loss")
    axes[0].set_ylabel("Cross-entropy loss")

    # Accuracy
    axes[1].bar(["train", "test"], [train_metrics["accuracy"], test_metrics["accuracy"]], color=["#4a90e2", "#e24a4a"])
    axes[1].set_title("Accuracy")
    axes[1].set_ylim(0, 1)

    plt.tight_layout()
    fig_path = MODEL_DIR / "metrics.png"
    plt.savefig(fig_path, dpi=200)
    print(f"Saved plot to {fig_path}")


if __name__ == "__main__":
    main()

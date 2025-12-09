# MiniLM fine-tuning with a pure PyTorch training loop
# Keeps HF tokenizer/model for compatibility with ONNX export, but all training/eval is manual.

import json
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score
from sklearn.utils.class_weight import compute_class_weight
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup


DATA_PATH = Path("./data/annotated/merged_annotations.json")
OUTPUT_DIR = Path("fluff-model")
MODEL_NAME = "microsoft/MiniLM-L12-H384-uncased"
MAX_LEN = 256
EPOCHS = 10
TRAIN_BATCH_SIZE = 16
EVAL_BATCH_SIZE = 32
LR = 2e-5
WEIGHT_DECAY = 0.01
WARMUP_RATIO = 0.06
LOG_INTERVAL = 50


class ArticleDataset(Dataset):
    def __init__(self, records: List[Dict[str, Any]]):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        return rec["text"], int(rec["label"])


def load_data():
    with DATA_PATH.open("r", encoding="utf-8") as f:
        raw_records = json.load(f)

    # Normalize to explicit fields we care about
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
        texts, labels = zip(*batch)
        enc = tokenizer(
            list(texts),
            padding=True,
            truncation=True,
            max_length=MAX_LEN,
            return_tensors="pt",
        )
        return enc, torch.tensor(labels, dtype=torch.long)

    return collate


def train_one_epoch(model, dataloader, optimizer, scheduler, loss_fn, device):
    model.train()
    total_loss = 0.0
    for step, (enc, labels) in enumerate(dataloader, 1):
        enc = {k: v.to(device) for k, v in enc.items()}
        labels = labels.to(device)

        optimizer.zero_grad()
        outputs = model(**enc)
        loss = loss_fn(outputs.logits, labels)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()

        total_loss += loss.item()

        if step % LOG_INTERVAL == 0:
            print(f"  step {step:5d} | loss {loss.item():.4f}")

    return total_loss / len(dataloader)


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
    train_records, test_records = load_data()

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    model.to(device)

    # Class weights
    y_train = np.array([r["label"] for r in train_records])
    class_weights = compute_class_weight("balanced", classes=np.array([0, 1]), y=y_train)
    weight_tensor = torch.tensor(class_weights, dtype=torch.float, device=device)
    loss_fn = nn.CrossEntropyLoss(weight=weight_tensor)

    # DataLoaders
    collate_fn = make_collate(tokenizer)
    train_loader = DataLoader(
        ArticleDataset(train_records),
        batch_size=TRAIN_BATCH_SIZE,
        shuffle=True,
        collate_fn=collate_fn,
    )
    eval_loader = DataLoader(
        ArticleDataset(test_records),
        batch_size=EVAL_BATCH_SIZE,
        shuffle=False,
        collate_fn=collate_fn,
    )

    total_steps = len(train_loader) * EPOCHS
    warmup_steps = int(WARMUP_RATIO * total_steps)

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    best_metrics = None

    for epoch in range(1, EPOCHS + 1):
        print(f"\nEpoch {epoch}/{EPOCHS}")
        train_loss = train_one_epoch(
            model, train_loader, optimizer, scheduler, loss_fn, device
        )
        metrics = evaluate(model, eval_loader, device)

        print(
            f"  train_loss={train_loss:.4f} | "
            f"eval_loss={metrics['loss']:.4f} | "
            f"acc={metrics['accuracy']:.4f} | "
            f"f1={metrics['f1']:.4f}"
        )

        best_metrics = metrics

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    results_path = OUTPUT_DIR / "eval_results.json"
    serializable = {k: float(v) for k, v in best_metrics.items()}
    with results_path.open("w", encoding="utf-8") as f:
        json.dump(serializable, f, indent=2)

    print(f"\nSaved metrics to {results_path}")
    print("Model + tokenizer saved to ./fluff-model")
    print(
        "Next: Run ONNX export with "
        "`optimum-cli export onnx --model fluff-model --task text-classification`"
    )


if __name__ == "__main__":
    main()

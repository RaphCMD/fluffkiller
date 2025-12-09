fluffkiller uses an encoder-only transformer fine-tuned from `microsoft/MiniLM-L12-H384-uncased` (12-layer MiniLM, 384 hidden size). The exported ONNX for this classifier lives under `models/trainedright/onnx/model.onnx`, and the accompanying tokenizer/config files are in `models/trainedright/`.

Model facts (accurate):
- Architecture: encoder-only transformer (BERT family) with 12 encoder blocks.
- Base checkpoint: `microsoft/MiniLM-L12-H384-uncased` (not `sentence-transformers/all-MiniLM-L6-v2`).
- Hidden size 384, 12 attention heads, vocab size 30,522 (BERT uncased vocab).
- Parameter count: roughly 33M parameters (per hidden size/layer dimensions).


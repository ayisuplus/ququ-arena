"""
AI斗兽场 LoRA 训练入口（HF TRL DPOTrainer 最小脚本）
读同目录 dataset.jsonl（DPO 偏好对）与 train.yaml 里的关键配置。
需要：pip install torch trl peft transformers datasets pyyaml bitsandbytes
"""
import json
import yaml
from pathlib import Path

from datasets import Dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import DPOConfig, DPOTrainer

HERE = Path(__file__).parent
CFG = yaml.safe_load((HERE / "train.yaml").read_text(encoding="utf-8"))

rows = [json.loads(l) for l in (HERE / "dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
# manifest 校验：数据集被改过就拒绝训练（防"练的不是这批"）
manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
import hashlib
actual = hashlib.sha256((HERE / "dataset.jsonl").read_bytes()).hexdigest()[:16]
assert actual == manifest["sha256_16"], f"数据集指纹不符：{actual} ≠ {manifest['sha256_16']}"

ds = Dataset.from_list([{"prompt": r["prompt"], "chosen": r["chosen"], "rejected": r["rejected"]} for r in rows])

model_name = CFG["base_model"]
tok = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, device_map="auto")

peft_cfg = LoraConfig(r=CFG["lora"]["rank"], lora_alpha=CFG["lora"]["alpha"], lora_dropout=CFG["lora"]["dropout"], task_type="CAUSAL_LM")
dpo_cfg = DPOConfig(
    output_dir=str(HERE / "out"),
    per_device_train_batch_size=CFG["optimization"]["micro_batch_size"],
    gradient_accumulation_steps=CFG["optimization"]["gradient_accumulation_steps"],
    num_train_epochs=CFG["optimization"]["max_epochs"],
    gradient_checkpointing=CFG["optimization"]["gradient_checkpointing"],
    max_length=CFG["optimization"]["sequence_length"],
    learning_rate=5e-5,
    bf16=True,
)
trainer = DPOTrainer(model=model, args=dpo_cfg, train_dataset=ds, processing_class=tok, peft_config=peft_cfg)
trainer.train()
trainer.save_model(str(HERE / "out" / "final"))
print("训练完成：out/final —— 部署为端点后回斗兽场复测（release gate）")

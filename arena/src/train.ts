/**
 * 训练包 —— 偏好数据集 → LoRA 训练包（闭环第二段：数据 → 可执行训练）
 *
 * 工程立场（诚实边界）：
 * - 本模块只产出"拿来就能训"的包：dataset.jsonl + manifest（sha256 防篡改）
 *   + train.yaml（QLoRA 配置，schema 对齐 cerebellum 的 qlora-24gb 契约）
 *   + train.py（HF TRL DPOTrainer 最小脚本）+ run.sh
 *   + dataset-draft.json（cerebellum dataset-draft schema 兼容记录——两项目互通）
 * - 不假装有 GPU：--launch 仅在本机存在 python+torch 时尝试启动；否则明确
 *   报告"包已就绪，到有卡的机器执行 run.sh"。绝不在无卡环境伪造训练。
 * - 训出的模型以服务形式（Ollama/OpenAI 兼容端点）回到斗兽场再战——闭环。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export interface TrainBundleOptions {
  baseModel?: string;
  epochs?: number;
  rank?: number;
}

const TRAIN_YAML = (opts: Required<TrainBundleOptions>) => `# AI斗兽场 LoRA 训练配置（DPO 偏好优化）
# schema 对齐 cerebellum training/qlora-24gb 契约
base_model: ${opts.baseModel}
data:
  path: dataset.jsonl          # DPO 偏好对（prompt/chosen/rejected）
  manifest: manifest.json      # sha256 + 条数，加载前校验防篡改
quantization:
  bits: 4
  quant_type: nf4
  double_quant: true
  compute_dtype: bfloat16
lora:
  rank: ${opts.rank}
  alpha: ${opts.rank * 2}
  dropout: 0.05
optimization:
  micro_batch_size: 2
  gradient_accumulation_steps: 16
  gradient_checkpointing: true
  sequence_length: 2048
  optimizer: paged_adamw_8bit
  max_epochs: ${opts.epochs}
hardware:
  gpus: 1
  minimum_vram_gb: 24
export:
  target: safetensors
  include_dataset_manifest_hash: true
release_gates:
  require_task_success_uplift: true   # 训完必须回斗兽场复测证明提升
  max_gate_violation_delta: 0
  require_human_approval: true
`;

const TRAIN_PY = `"""
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
`;

const RUN_SH = `#!/bin/sh
# AI斗兽场 LoRA 训练启动（需 python3 + torch + trl/peft/transformers/datasets/pyyaml/bitsandbytes）
set -e
cd "$(dirname "$0")"
python train.py
`;

/** cerebellum schemas/dataset-draft.schema.json 兼容记录：四必填字段，additionalProperties:false 不多一字 */
const datasetDraft = (fullSha: string) =>
  JSON.stringify(
    {
      kind: 'ququ-arena-preference-dpo',
      build_id: randomUUID(),
      manifest_hash: fullSha,
      updated_at: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n';

export interface BundleResult {
  dir: string;
  pairs: number;
  sha: string;
  files: string[];
}

export async function writeTrainBundle(
  datasetFile: string,
  outDir: string,
  opts: TrainBundleOptions = {},
): Promise<BundleResult> {
  const full: Required<TrainBundleOptions> = {
    baseModel: opts.baseModel ?? 'Qwen/Qwen2.5-1.5B-Instruct',
    epochs: opts.epochs ?? 3,
    rank: opts.rank ?? 32,
  };
  const raw = await readFile(datasetFile, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error(`数据集是空的：${datasetFile}——先 distill 一场有分差的战绩`);
  for (const [i, l] of lines.entries()) {
    const j = JSON.parse(l);
    if (j.prompt === undefined || j.chosen === undefined || j.rejected === undefined) {
      throw new Error(
        `第 ${i + 1} 行缺 prompt/chosen/rejected——这不是 DPO 数据集（SFT 格式请用 --format dpo 重新 distill；缺 rejected 的行会在训练机上报 KeyError，打包侧先拦）`,
      );
    }
  }
  const sha = createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
  const shaFull = createHash('sha256').update(raw, 'utf8').digest('hex');
  await mkdir(outDir, { recursive: true });
  const manifest = {
    kind: 'ququ-arena-train-bundle/1',
    dataset: 'dataset.jsonl',
    pairs: lines.length,
    sha256_16: sha,
    source: path.basename(datasetFile),
    createdAt: new Date().toISOString(),
    note: '闭环：benchmark→偏好数据→LoRA→部署回斗兽场复测',
  };
  await writeFile(path.join(outDir, 'dataset.jsonl'), raw, 'utf8');
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await writeFile(path.join(outDir, 'train.yaml'), TRAIN_YAML(full), 'utf8');
  await writeFile(path.join(outDir, 'train.py'), TRAIN_PY, 'utf8');
  await writeFile(path.join(outDir, 'run.sh'), RUN_SH, { encoding: 'utf8', mode: 0o755 });
  await writeFile(path.join(outDir, 'dataset-draft.json'), datasetDraft(shaFull), 'utf8');
  return {
    dir: outDir,
    pairs: lines.length,
    sha,
    files: ['dataset.jsonl', 'manifest.json', 'train.yaml', 'train.py', 'run.sh', 'dataset-draft.json'],
  };
}

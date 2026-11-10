#!/bin/sh
# AI斗兽场 LoRA 训练启动（需 python3 + torch + trl/peft/transformers/datasets/pyyaml/bitsandbytes）
set -e
cd "$(dirname "$0")"
python train.py

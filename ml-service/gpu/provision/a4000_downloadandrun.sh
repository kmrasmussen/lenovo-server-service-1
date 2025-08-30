#!/bin/bash
set -e  # Exit on any error

git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
sudo DEBIAN_FRONTEND=noninteractive apt update
sudo DEBIAN_FRONTEND=noninteractive apt install -y nvidia-cuda-toolkit

# Download the binary
wget https://github.com/kmrasmussen/delayed-streams-modeling/releases/download/moshi/moshi-server
chmod +x moshi-server

mv moshi-server delayed-streams-modeling/
cd delayed-streams-modeling
./moshi-server worker --config configs/config-stt-en_fr-hf.toml

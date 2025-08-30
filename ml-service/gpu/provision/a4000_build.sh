git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
cd delayed-streams-modeling
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt install -y pkg-config libssl-dev nvidia-cuda-toolkit cmake
source ~/.cargo/env
moshi-server worker --config configs/config-stt-en_fr-hf.toml

#!/bin/bash
echo "Creating directory" >> /home/ubuntu/setuplog.txt
mkdir /home/ubuntu/ran_downloadandrundotsh
echo "Changing to home directory" >> /home/ubuntu/setuplog.txt
cd /home/ubuntu
set -e  # Exit on any error
echo "Cloning repository" >> /home/ubuntu/setuplog.txt
git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
echo "Updating packages" >> /home/ubuntu/setuplog.txt
sudo DEBIAN_FRONTEND=noninteractive apt update
echo "Installing CUDA toolkit" >> /home/ubuntu/setuplog.txt
sudo DEBIAN_FRONTEND=noninteractive apt install -y nvidia-cuda-toolkit
echo "Downloading moshi-server binary" >> /home/ubuntu/setuplog.txt
# Download the binary
wget https://github.com/kmrasmussen/delayed-streams-modeling/releases/download/moshi/moshi-server
echo "Making binary executable" >> /home/ubuntu/setuplog.txt
chmod +x moshi-server
echo "Moving binary to project directory" >> /home/ubuntu/setuplog.txt
mv moshi-server delayed-streams-modeling/
echo "Changing to project directory" >> /home/ubuntu/setuplog.txt
cd delayed-streams-modeling
echo "Starting moshi-server" >> /home/ubuntu/setuplog.txt
./moshi-server worker --config configs/config-stt-en_fr-hf.toml

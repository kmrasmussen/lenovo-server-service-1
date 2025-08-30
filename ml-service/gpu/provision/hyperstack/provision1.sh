echo "$HYPERSTACK_API_KEY"
curl -X POST "https://infrahub-api.nexgencloud.com/v1/core/virtual-machines" \
  -H "accept: application/json"\
  -H "api_key: $HYPERSTACK_API_KEY"\
  -H "content-type: application/json" \
  -d '{
    "name": "vm-from-api-6",
    "environment_name": "myenv",
    "image_name": "Ubuntu Server 22.04 LTS R535 CUDA 12.2",
    "flavor_name": "n3-RTX-A4000x1",
    "key_name": "mykey",
    "count": 1,
    "assign_floating_ip": true,
    "user_data": "#cloud-config\nruncmd:\n  - echo "Starting setup" > /home/ubuntu/setup.log\n  - cd /home/ubuntu\n  - echo "Cloning repo" >> /home/ubuntu/setup.log\n  - git clone https://github.com/kyutai-labs/delayed-streams-modeling.git\n  - echo "Updating packages" >> /home/ubuntu/setup.log\n  - DEBIAN_FRONTEND=noninteractive apt update\n  - echo "Installing CUDA" >> /home/ubuntu/setup.log\n  - DEBIAN_FRONTEND=noninteractive apt install -y nvidia-cuda-toolkit\n  - echo "Downloading binary" >> /home/ubuntu/setup.log\n  - wget https://github.com/kmrasmussen/delayed-streams-modeling/releases/download/moshi/moshi-server\n  - chmod +x moshi-server\n  - mv moshi-server delayed-streams-modeling/\n  - echo "Starting server" >> /home/ubuntu/setup.log\n  - cd delayed-streams-modeling && ./moshi-server worker --config configs/config-stt-en_fr-hf.toml" 
  }'

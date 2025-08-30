echo "$HYPERSTACK_API_KEY"
curl -X POST "https://infrahub-api.nexgencloud.com/v1/core/virtual-machines" \
  -H "accept: application/json"\
  -H "api_key: $HYPERSTACK_API_KEY"\
  -H "content-type: application/json" \
  -d '{
    "name": "vm-from-api-8",
    "environment_name": "myenv",
    "image_name": "Ubuntu Server 22.04 LTS R535 CUDA 12.2",
    "flavor_name": "n3-RTX-A4000x1",
    "key_name": "mykey",
    "count": 1,
    "assign_floating_ip": true,
    "user_data": "#cloud-config\nruncmd:\n  - wget https://raw.githubusercontent.com/kmrasmussen/lenovo-server-service-1/refs/heads/gpus/ml-service/gpu/provision/a4000_downloadandrun.sh\n  - chmod +x a4000_downloadandrun.sh\n  - ./a4000_downloadandrun.sh",
    "security_rules": [
      {
        "direction": "ingress",
        "protocol": "tcp",
        "ethertype": "IPv4",
        "remote_ip_prefix": "0.0.0.0/0",
        "port_range_min": 5000,
        "port_range_max": 5000
      },
      {
        "direction": "ingress",
        "protocol": "tcp",
        "ethertype": "IPv4",
        "remote_ip_prefix": "0.0.0.0/0",
        "port_range_min": 8080,
        "port_range_max": 8080
      }
    ]
  }'

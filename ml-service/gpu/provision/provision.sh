echo $PRIMEINTELLECT_API_KEY
curl --request POST \
  --url https://api.primeintellect.ai/api/v1/pods/ \
  --header "Authorization: Bearer $PRIMEINTELLECT_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
  "pod": {
    "name": "my_a10_pod",
    "cloudId": "gpu_1x_a10",
    "gpuType": "A10_24GB",
    "socket": "PCIe",
    "gpuCount": 1,
    "image": "ubuntu_22_cuda_12",
    "security": "secure_cloud",
  },
  "provider": {
    "type": "lambdalabs"
  }
}'

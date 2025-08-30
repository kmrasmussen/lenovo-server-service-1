echo $PRIMEINTELLECT_API_KEY
curl --request GET \
  --url 'https://api.primeintellect.ai/api/v1/availability/?gpu_type=V100_16GB' \
  --header "Authorization: Bearer $PRIMEINTELLECT_API_KEY"

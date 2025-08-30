echo "$PRIMEINTELLECT_API_KEY"
curl --request GET \
  --url https://api.primeintellect.ai/api/v1/pods/ \
  --header "Authorization: Bearer $PRIMEINTELLECT_API_KEY"

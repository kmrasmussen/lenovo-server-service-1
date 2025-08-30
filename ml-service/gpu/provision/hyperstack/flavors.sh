echo "key $HYPERSTACK_API_KEY"
curl -X GET "https://infrahub-api.nexgencloud.com/v1/core/flavors" \
  -H "accept: application/json"\
  -H "api_key: $HYPERSTACK_API_KEY"

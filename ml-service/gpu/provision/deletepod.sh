POD_ID="17ebde8a1fcc48ca9713dc2ee10a77ca"
echo $POD_ID
curl --request DELETE \
  --url "https://api.primeintellect.ai/api/v1/pods/$POD_ID" \
  --header "Authorization: Bearer $PRIMEINTELLECT_API_KEY"

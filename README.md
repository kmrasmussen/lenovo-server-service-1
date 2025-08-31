# dev

To start development run
```
docker compose -f docker-compose.dev.yml up --build
```
The nextjs app will run on port 8000, but for login-with-google the auth urls need to match.
This is controlled in the .env variable NEXTAUTH_URL, and the callback urls are set in Google CLoud https://console.cloud.google.com/apis/credentials?project=my-next-project-1 under OAuth 2.0 Client IDs 

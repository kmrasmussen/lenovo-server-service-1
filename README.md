# dev

To start development run
```
docker compose -f docker-compose.dev.yml up --build
```
The nextjs app will run on port 8000, but for login-with-google the auth urls need to match.
This is controlled in the .env variable NEXTAUTH_URL, and the callback urls are set in Google CLoud https://console.cloud.google.com/apis/credentials?project=my-next-project-1 under OAuth 2.0 Client IDs 

## spinning up realtime
ml-service will be running on port 9052, if you are having cloudflare tunnel you would go to
`https://thinkpad-9052.intercebd.com/docs`
Log in to the Swagger with the bearer token HYPERSTACK_ADMIN_TOKEN from the env file.

When the GPU is spinning up the setup script will be served through thinkpad-9052.intercebd.com, see hyperstack.py 

to ssh into a gpu, first go to hyperstack.com and enable ssh on the virtual machine, then do stuff like
`ssh -i ~/.ssh/hyperstack1 ubuntu@149.36.0.170`
Use HYPERSTACK_ADMIN_TOKEN from .env file for auth.
https://console.hyperstack.cloud/virtual-machines
## what is happening at gpu setup
at setup the gpu machine will fetch a bash script files served dynamically, see it in ml-service swagger and execute it.
it will setup a cloudflare tunnel for safe websockets
and clone kyutai/delayed-streams-modeling, install necessary cuda dependencies and download moshi server binary already built, served from kmrasmussen/delayed-streams-modeling. 

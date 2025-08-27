from fastapi import FastAPI

app = FastAPI()

@app.get('/')
def root():
    return {'message': 'hi from lenovo-server-service-1'}

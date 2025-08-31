from fastapi import FastAPI, UploadFile, File
import io
from PIL import Image
import torch
from transformers import AutoProcessor, AutoTokenizer, SiglipModel
from fastapi.middleware.cors import CORSMiddleware
import logging
import realtime
import hyperstack
import siglip
app = FastAPI()

app.include_router(realtime.router, prefix='/realtime')
app.include_router(hyperstack.router, prefix='/hyperstack')
app.include_router(siglip.router, prefix='/siglip')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


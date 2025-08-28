from fastapi import FastAPI, UploadFile, File
import io
from PIL import Image
import torch
from transformers import AutoProcessor, AutoTokenizer, SiglipModel
from fastapi.middleware.cors import CORSMiddleware
import logging

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

def l2_norms(vecs):
  norms = (vecs ** 2).sum(axis=-1).sqrt()
  return norms
def l2_normalize(vecs):
  norms = l2_norms(vecs)
  normalized = vecs.T / norms
  return normalized.T

device = torch.device('cuda' if torch.cuda.is_available() else "cpu")

logger.info('loading models on start')
model = SiglipModel.from_pretrained("nielsr/siglip-base-patch16-224").to(device)
processor = AutoProcessor.from_pretrained("nielsr/siglip-base-patch16-224")
tokenizer = AutoTokenizer.from_pretrained("nielsr/siglip-base-patch16-224")
logger.info('loaded models')

@app.post('/embed')
async def embed(file: UploadFile = File(...)):
    logger.info('/embed received request')
    img_bytes = await file.read()
    pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    
    with torch.no_grad():
        img_processed = processor(images=[pil_img], return_tensors="pt").to(device)
        img_features = model.get_image_features(**img_processed)

    img_features_normed = l2_normalize(img_features)
    img_features_normed_list = img_features_normed[0].tolist()
    logger.info('/embed sucessfully created embedding')
    return {'message': 'this is the embed endpoint', 'image_embedding': img_features_normed_list }

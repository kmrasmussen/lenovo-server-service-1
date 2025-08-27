'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

const Camera = () => {
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('got position', position);
      }
    );
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        console.log('got videostream');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          console.log('succeeded in srcObject = stream');
        }
      } catch(error) {
        console.log('error accessing camera', error);
      }
    }
    initCamera();
  }, [])

  const getLocation = (): Promise<{lat: number, long: number}> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('got position', position);
          resolve({ lat: position.coords.latitude,
            long: position.coords.longitude
          });
        },
        (error) => {
          console.log('error getting location', error);
          reject(error);
          }
      );
    });
  };

  const takePicture = async () => {
    const location = await getLocation();

    console.log('taking picture1')
    if (!videoRef.current || !canvasRef.current) return;
    console.log('taking picture2')
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        console.log('taking picture3');
        return; 
      }
      console.log('capture photo blob', blob);
      try {
        const formData = new FormData();
        formData.append('image', blob, 'snapshot.png');
        formData.append('lat', location.lat.toString());
        formData.append('long', location.long.toString());

        const response = await fetch('/api/snapshot',
          {
            method: 'POST',
            body: formData
          });
        const result = await response.json()
        console.log('uploaded snapshot', result);
        setSimilarImages(result.similarImagesUrls);
      } catch(error) {
        console.log('error submitting snapshot', error)
      }
    }, "image/png");
  }

  return (<div>
    <video ref={videoRef} autoPlay playsInline muted />
    <Button onClick={takePicture}>Take picture</Button>
    <canvas className='hidden' ref={canvasRef} />
    <div><ul>{
      similarImages.map((imgUrl, i) => (<li key={i}><Image src={imgUrl} alt="picture you took" /></li>))
      }</ul></div>
  </div>);
}

export default Camera;

'use client';
import { PictureDto } from '@/app/types/db';
import { useState, useEffect } from 'react';
import Image from 'next/image';

const PicturesPage = () => {
  const [picturesList, setPicturesList] = useState<PictureDto[]>([]);

  useEffect(() => {
    fetchPicturesList();
  }, []);

  const fetchPicturesList = () => {
    fetch('/api/snapshot', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('dump list fetch data', data);
      setPicturesList(data.picsWithUrls) 
    })
    .catch((error) => console.log('error fetching dump list', error));
  }

  return (<div className="h-full flex flex-col w-full">
    {picturesList.map((pic) => {
      return (<div key={pic.id}><Image
        src={pic.signedUrl}
        width={0}
        height={0}
        style={{ width: 'auto', height: 'auto' }} 
        alt="description"
        unoptimized /></div>);
    })}
  </div>);
}

export default PicturesPage;

'use client';
import { PictureDto } from '@/app/types/db';
import { useState, useEffect } from 'react';

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
    .catch((error) => console.log('error fetching dump list'));
  }

  return (<div className="h-full flex flex-col w-full">
    {picturesList.map((pic) => {
      return (<div key={pic.id}><img src={pic.signedUrl} /></div>);
    })}
  </div>);
}

export default PicturesPage;

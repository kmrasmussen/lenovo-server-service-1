import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { PicturesRow, PictureDto } from '@/app/types/db';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

if (!process.env.AWS_REGION || !process.env.AWS_S3_ACCESS_KEY || !process.env.AWS_S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
  throw new Error('Missing required AWS environment variables');
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY
  },
});

const getEmbedding = async (imageBuffer: Buffer, imageFileName: string) => {
  const embedForm = new FormData();
  embedForm.append('file', new Blob([new Uint8Array(imageBuffer)]), imageFileName);
  const embedResponse = await fetch(
    'http://localhost:8000/embed',
    {
      method: 'POST',
      body: embedForm
    }
  );

  if (!embedResponse.ok) {
    throw new Error(`embed server error ${embedResponse.status}`)
  }
  
  const embedResult = await embedResponse.json()

  return embedResult;
}

const getSignedUrlFromS3Key = async (s3key: string) => {
  const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3key
  });

  const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
    expiresIn: 3600
  });
  console.log('made url', signedUrl);
  return signedUrl;
}

const POST = async (req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }
  console.log('got session', session);
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;
    
    const locationLat = formData.get('lat');
    const locationLong = formData.get('long');
    console.log('snapshot got locations', locationLat, locationLong);
    if (!imageFile) {
      return NextResponse.json({ success: false, message: "no audio file" }, { status: 400 });
    }

    console.log('got image file', imageFile.name, imageFile.size);

    const userId = parseInt(session.user.id);

    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
 
    const imageEmbeddingResponse = await getEmbedding(imageBuffer, imageFile.name);
    const imageEmbedding = imageEmbeddingResponse.image_embedding;
    
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const s3Key = `images/${userId}/${uuidv4()}.${fileExtension}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: imageFile.type,
      Metadata: {
        originalName: imageFile.name,
        userId: userId.toString(),
        uploadedAt: new Date().toISOString(),
      }
    });

    const uploadResult = await s3Client.send(uploadCommand);
    console.log('s3 upload successful', uploadResult);
    
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key
    });

    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 3600
    });

    const insertionResult = await sql`
      INSERT INTO pictures (user_id, s3key)
      VALUES (${userId}, ${s3Key})
      RETURNING id, s3key
    `
    
    const pictureId = insertionResult[0].id;

    const locationInsertionResult = await sql`
      INSERT INTO picture_location (picture_id, lat, lon)
      VALUES (${pictureId}, ${locationLat}, ${locationLong})
      RETURNING id, lat, lon
    `;

    const similarImages = await sql`
      SELECT p.*, pse.siglip_embedding <=> ${JSON.stringify(imageEmbedding)} as distance
      FROM pictures p
      JOIN picture_siglip_embeddings pse ON p.id = pse.picture_id
      WHERE p.user_id = ${userId}
      ORDER BY distance
      LIMIT 10
    `;

    const similarImagesUrls = await Promise.all(similarImages.map(
      async (elem) => {
        const url = await getSignedUrlFromS3Key(elem.s3key)
        return url;
      }
    ));

    const embeddingInsertionResult = await sql`
      INSERT INTO picture_siglip_embeddings (picture_id, siglip_embedding)
      VALUES (${pictureId}, ${JSON.stringify(imageEmbedding)})
      RETURNING id, picture_id
    `;


    return NextResponse.json({ 
      success: true,
      captionResponse: 'disabled',
      signedUrl: signedUrl,
      insertionResult: insertionResult,
      locationInsertionResult: locationInsertionResult,
      imageEmbedding: imageEmbedding,
      embeddingInsertionResult: embeddingInsertionResult,
      similarImages: similarImages,
      similarImagesUrls: similarImagesUrls,
    });
  } catch(error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};

const GET = async () => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }

  try {
    const userId = parseInt(session.user.id);

    const result = await sql`
      SELECT * FROM pictures 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    ` as PicturesRow[];
    
    const picsWithUrls: PictureDto[] = await Promise.all(
      result.map(async (row) => {
        const getObjectCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME!,
            Key: row.s3key
        });

        const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
          expiresIn: 3600
        });

        return {
          id: row.id,
          created_at: row.created_at,
          signedUrl
        };
      })
    );

    return NextResponse.json({ success: true, dbResult: result, picsWithUrls: picsWithUrls });
  } catch(error) {
    console.log('error in snapshot get', error);
    return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
}
export { POST, GET };

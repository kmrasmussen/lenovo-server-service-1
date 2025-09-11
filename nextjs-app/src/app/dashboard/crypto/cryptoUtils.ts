export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface SerializedKeyPair {
  publicKey: string;
  privateKey: string;
}

// Generate new key pair
export const generateKeyPair = async (): Promise<KeyPair> => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['sign', 'verify']
  );
  
  return keyPair as KeyPair;
};

// Serialize keys for storage
export const serializeKeyPair = async (keyPair: KeyPair): Promise<SerializedKeyPair> => {
  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  
  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))),
  };
};

// Deserialize keys from storage
export const deserializeKeyPair = async (serialized: SerializedKeyPair): Promise<KeyPair> => {
  const publicKeyBuffer = Uint8Array.from(atob(serialized.publicKey), c => c.charCodeAt(0));
  const privateKeyBuffer = Uint8Array.from(atob(serialized.privateKey), c => c.charCodeAt(0));

  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['verify']
  );

  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['sign']
  );

  return { publicKey, privateKey };
};

// Sign a document (string)
export const signDocument = async (document: string, privateKey: CryptoKey): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(document);
  
  const signature = await window.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    data
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

// Verify a signature
export const verifySignature = async (
  document: string, 
  signature: string, 
  publicKey: CryptoKey
): Promise<boolean> => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(document);
    const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    
    return await window.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signatureBuffer,
      data
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
};

// Export public key as string (for sharing)
export const exportPublicKey = async (publicKey: CryptoKey): Promise<string> => {
  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
};

// Import public key from string (for verification)
export const importPublicKey = async (publicKeyString: string): Promise<CryptoKey> => {
  const publicKeyBuffer = Uint8Array.from(atob(publicKeyString), c => c.charCodeAt(0));
  
  return await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['verify']
  );
};

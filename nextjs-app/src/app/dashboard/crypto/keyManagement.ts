import { useState, useEffect, useCallback } from 'react';
import {
  KeyPair,
  SerializedKeyPair,
  generateKeyPair,
  serializeKeyPair,
  deserializeKeyPair,
  signDocument,
  verifySignature,
  exportPublicKey,
  importPublicKey,
} from './cryptoUtils';

const STORAGE_KEY = 'crypto-keypair';

export const useKeyManagement = () => {
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Save keys to localStorage
  const saveKeysToStorage = useCallback(async (keyPair: KeyPair) => {
    try {
      const serialized = await serializeKeyPair(keyPair);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.error('Failed to save keys to storage:', error);
      setError('Failed to save keys to storage');
      throw error;
    }
  }, []);

  // Load keys from localStorage
  const loadKeysFromStorage = useCallback(async (): Promise<KeyPair | null> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      
      const serialized: SerializedKeyPair = JSON.parse(stored);
      return await deserializeKeyPair(serialized);
    } catch (error) {
      console.error('Failed to load keys from storage:', error);
      localStorage.removeItem(STORAGE_KEY);
      setError('Failed to load keys from storage');
      return null;
    }
  }, []);

  // Initialize keys on mount
  useEffect(() => {
    const initializeKeys = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Try to load existing keys
        let keys = await loadKeysFromStorage();
        
        // Generate new keys if none exist
        if (!keys) {
          keys = await generateKeyPair();
          await saveKeysToStorage(keys);
        }
        
        setKeyPair(keys);
      } catch (error) {
        console.error('Failed to initialize keys:', error);
        setError('Failed to initialize cryptographic keys');
      } finally {
        setIsLoading(false);
      }
    };

    initializeKeys();
  }, [loadKeysFromStorage, saveKeysToStorage]);

  // Sign a document
  const sign = useCallback(async (document: string): Promise<string> => {
    if (!keyPair) {
      throw new Error('No key pair available');
    }
    
    try {
      return await signDocument(document, keyPair.privateKey);
    } catch (error) {
      console.error('Signing failed:', error);
      setError('Failed to sign document');
      throw error;
    }
  }, [keyPair]);

  // Verify a signature with current or external public key
  const verify = useCallback(async (
    document: string, 
    signature: string, 
    externalPublicKey?: string
  ): Promise<boolean> => {
    if (!keyPair && !externalPublicKey) {
      throw new Error('No public key available for verification');
    }
    
    try {
      let publicKeyToUse = keyPair?.publicKey;
      
      if (externalPublicKey) {
        publicKeyToUse = await importPublicKey(externalPublicKey);
      }
      
      if (!publicKeyToUse) {
        throw new Error('No public key available');
      }
      
      return await verifySignature(document, signature, publicKeyToUse);
    } catch (error) {
      console.error('Verification failed:', error);
      setError('Failed to verify signature');
      throw error;
    }
  }, [keyPair]);

  // Export current public key
  const getPublicKey = useCallback(async (): Promise<string> => {
    if (!keyPair) {
      throw new Error('No key pair available');
    }
    
    try {
      return await exportPublicKey(keyPair.publicKey);
    } catch (error) {
      console.error('Public key export failed:', error);
      setError('Failed to export public key');
      throw error;
    }
  }, [keyPair]);

  // Delete keys from state and storage
  const deleteKeys = useCallback(() => {
    setKeyPair(null);
    localStorage.removeItem(STORAGE_KEY);
    setError(null);
  }, []);

  // Regenerate keys
  const regenerateKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newKeyPair = await generateKeyPair();
      await saveKeysToStorage(newKeyPair);
      setKeyPair(newKeyPair);
    } catch (error) {
      console.error('Key regeneration failed:', error);
      setError('Failed to regenerate keys');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [saveKeysToStorage]);

  // Check if keys are available
  const hasKeys = Boolean(keyPair);

  // Clear any errors
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    keyPair,
    isLoading,
    error,
    hasKeys,
    
    // Actions
    sign,
    verify,
    getPublicKey,
    deleteKeys,
    regenerateKeys,
    clearError,
    
    // Utility functions (exposed for advanced use cases)
    importPublicKey,
  };
};

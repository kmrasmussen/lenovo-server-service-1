import { Message } from '@/app/types/chatCompletions';

const calculateMessagesHash = async (messages: Message[]): Promise<string> => {
  const normalizedMessages = messages.map(msg => {
    const normalized: Record<string, unknown> = {};
    
    for (const key in msg) {
      if (msg.hasOwnProperty(key)) {
        normalized[key] = msg[key as keyof Message];
      }
    }
    
    return normalized;
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(normalizedMessages));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export { calculateMessagesHash };

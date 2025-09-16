import { Message, Event } from '@/app/types/chatCompletions';

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

const calculateMessageHash = async (message: Message): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(message));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
export const calculateEventHash = async (prevEventHash: string | null, event: Event): Promise<string> => {
  const eventJson = JSON.stringify(event);
  let prehash;
  if (prevEventHash == null) {
    prehash = `|${eventJson}`;
  } else {
    prehash = `${prevEventHash}|${eventJson}`;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(prehash);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
;
export { calculateMessagesHash, calculateMessageHash };

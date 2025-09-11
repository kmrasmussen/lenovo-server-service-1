// lib/redis.ts
import { createClient } from 'redis';

if (!process.env.REDIS_URL) {
 throw new Error('REDIS_URL environment variable is required');
}

export const redis = createClient({
 url: process.env.REDIS_URL
});

redis.on('error', (err) => console.log('Redis Client Error', err));

if (!redis.isOpen) {
 redis.connect();
}

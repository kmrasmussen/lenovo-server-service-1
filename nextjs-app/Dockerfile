FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app

# Accept build arguments
ARG DATABASE_URL
ARG AUTH_GOOGLE_ID
ARG AUTH_GOOGLE_SECRET
ARG GOOGLE_GEOCODING_API
ARG MOONDREAM_API_KEY
ARG OPENAI_API_KEY
ARG AWS_S3_SECRET_ACCESS_KEY
ARG AWS_S3_ACCESS_KEY
ARG AWS_REGION
ARG S3_BUCKET_NAME
ARG NEXTAUTH_URL
ARG AUTH_SECRET
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG VAPID_PRIVATE_KEY
ARG OPENROUTER_API_KEY 

# Set environment variables for build
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_GOOGLE_ID=$AUTH_GOOGLE_ID
ENV AUTH_GOOGLE_SECRET=$AUTH_GOOGLE_SECRET
ENV GOOGLE_GEOCODING_API=$GOOGLE_GEOCODING_API
ENV MOONDREAM_API_KEY=$MOONDREAM_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV AWS_S3_SECRET_ACCESS_KEY=$AWS_S3_SECRET_ACCESS_KEY
ENV AWS_S3_ACCESS_KEY=$AWS_S3_ACCESS_KEY
ENV AWS_REGION=$AWS_REGION
ENV S3_BUCKET_NAME=$S3_BUCKET_NAME
ENV AUTH_SECRET=$AUTH_SECRET
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . ./

RUN corepack enable pnpm && pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8000
ENV PORT 8000
CMD ["node", "server.js"]

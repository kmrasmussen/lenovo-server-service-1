FROM node:18-alpine
# Install Rust and wasm-pack
RUN apk add --no-cache curl build-base
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install wasm-pack

WORKDIR /workspace

# Copy the Rust source for WASM
COPY shared/ ./shared/
COPY frontend-wasm/ ./frontend-wasm/
COPY Cargo.toml Cargo.lock ./

# Build the WASM
WORKDIR /workspace/frontend-wasm
RUN wasm-pack build --target web --out-dir pkg

# Now build the Next.js app
WORKDIR /workspace/frontend-wasm/next
COPY frontend-wasm/next/package*.json ./
RUN npm install -g pnpm && pnpm install
COPY frontend-wasm/next/ ./
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]

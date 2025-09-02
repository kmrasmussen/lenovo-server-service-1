# Stage 1: Build
FROM rustlang/rust:nightly as builder

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y pkg-config libssl-dev

# Copy source
COPY . .

# Build release binary
RUN cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim

# Install runtime dependencies (e.g. SSL)
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/websocket-server /app/websocket-server

# Expose port
EXPOSE 7845 

# Run
CMD ["./websocket-server"]

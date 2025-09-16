FROM rustlang/rust:nightly
WORKDIR /workspace
COPY . .
RUN cargo build --release
EXPOSE 8005
CMD ["./target/release/backend-ws"]

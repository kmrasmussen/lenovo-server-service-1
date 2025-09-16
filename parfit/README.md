# intelliverse

# The structure is
  backend
    .git
    ★ src
       ★ main.rs
     ★ .gitignore
     ★ Cargo.toml
  frontend-wasm
    .git
    pkg
    ★ src
       ★ lib.rs
     ★ .gitignore
     ★ Cargo.toml
     ★ index.html
  shared
    .git
    ★ src
       ★ lib.rs
     ★ .gitignore
     ★ Cargo.toml
  target
   Cargo.lock
   Cargo.toml
  󰂺 README.md

# Running backend
cargo watch -c -x 'run --bin backend-ws'

if it says      Running `target/debug/backend-ws`
starting parfit server

thread 'main' panicked at backend-ws/src/main.rs:54:60:
called `Result::unwrap()` on an `Err` value: Os { code: 98, kind: AddrInUse, message: "Address already in use" }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
[Finished running. Exit status: 101]

then find pid of process running on port 8005 lsof -i :8005 and kill it with kill <pid>

# Running frontend
cd frontend-wasm
wasm-pack build --target web
python3 -m http.server 8544

or to watch
cargo watch -c -s "wasm-pack build --target web"

# Next frontend
To make the rust frontend wasm build into the next use
cargo watch -c -s "wasm-pack build --target web --out-dir next/public/pkg"

and run the next frontend using
cd next
pnpm run dev

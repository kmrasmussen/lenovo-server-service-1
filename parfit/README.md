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
cargo watch -c -x 'run --bin backend'

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

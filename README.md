# PoE2 Arbitrage (Tauri)

## Prereqs

- Node (Corepack enabled)
- pnpm
- Rust toolchain

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Dev

```bash
pnpm install
pnpm run tauri dev
```

Notes
- Scans are manual-only (press `Scan`) to reduce rate-limit risk.

## Build

```bash
pnpm run tauri build
```

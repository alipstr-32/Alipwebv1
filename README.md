# ALIP ENCRYPTOR

Local-first web toolkit for file encryption, decryption, and source-code
obfuscation. Everything runs in the browser — no file is ever uploaded to
a server.

## Features

- **Encrypt File** — AES-256-GCM, any file type, password-based, output as `.alipenc`
- **Decrypt File** — restores the original file and verifies integrity via the GCM auth tag
- **Code Obfuscator** — real obfuscation for JavaScript; genuine minification for HTML/CSS/JSON; honest "not supported" for Python/PHP/Java/C/C++ (see FAQ in-app for why)
- **Batch Processor** — run one operation across many files, download results as a ZIP
- **History** — optional, local-only (localStorage), metadata only, never passwords or content

## Quick start

### Desktop / any OS with Node.js
```bash
cd alip-encryptor
npm install
npm start
# open http://localhost:8080
```

### HP Android via Termux
```bash
pkg update && pkg upgrade
pkg install nodejs git
git clone <repo-url> alip-encryptor
cd alip-encryptor
npm install
npx http-server . -p 8080
# open http://localhost:8080 in Chrome Android
```

### Zero-dependency option
Everything here is static HTML/CSS/JS — you can also just open `index.html`
directly in a browser. The only reason to run a local server at all is that
some browsers restrict certain APIs on the `file://` origin.

> **Important:** the Web Crypto API (which does the actual encryption) only
> works in a *secure context* — `https://` or `localhost`. It will not work
> if you deploy the site over plain `http://`.

## Deployment

Static site, deploys anywhere:
- **Netlify / Vercel / Cloudflare Pages** — connect the repo, no build step, publish directory = project root
- **GitHub Pages** — push to a repo, enable Pages
- **Any web server** — copy the folder to the web root, serve over HTTPS

## How the encryption works

1. You choose a file and a password.
2. A random 16-byte salt and 12-byte nonce (IV) are generated with the browser's CSPRNG.
3. PBKDF2-SHA256 (250,000 iterations) derives a 256-bit key from your password + salt.
4. The file is encrypted with AES-256-GCM, which authenticates the ciphertext —
   decrypting with the wrong password fails cleanly instead of returning garbage.
5. The salt, nonce, iteration count, and original filename are stored alongside
   the ciphertext in the `.alipenc` container so decryption can reproduce the
   same key later. **The password itself is never stored anywhere.**

If you lose the password, the file cannot be recovered. There is no backdoor.

## Code obfuscation — what's real and what isn't

| Language | What happens |
|---|---|
| JavaScript | Real obfuscation (identifier renaming, string-array encoding, optional control-flow flattening) via the `javascript-obfuscator` engine |
| HTML / CSS | Genuine minification (comments + whitespace stripped) — markup/styles have no identifiers to obfuscate |
| JSON | Minification + structural validation |
| Python / PHP / Java / C / C++ | **Not supported** in this browser-only build. These need a real per-language parser or compiler toolchain. The app tells you this directly instead of producing fake or broken output. |

## Testing checklist

- **Encrypt:** TXT, PDF, PNG, ZIP, JS, and arbitrary binary files; correct and incorrect passwords; empty files; large files near your device's memory limit
- **Decrypt:** round-trip every file type above; compare SHA-256 hash of original vs. decrypted output
- **Obfuscator:** verify JS output still runs correctly; confirm HTML/CSS/JSON minify without breaking; confirm unsupported languages show a clear message
- **Download:** single-file downloads, "Download All" ZIP, on both Chrome Android and desktop browsers
- **UI:** every button, progress bar, Cancel/Reset, error states, and small-screen (mobile) layout

## Security notes

- Uses the browser's native Web Crypto API — no custom/home-grown cryptography.
- Random values (salt, nonce) come from `crypto.getRandomValues`, a CSPRNG.
- Passwords are never written to disk, localStorage, or any log.
- File processing happens in memory; very large files are limited by your
  device's available RAM, since this build does not implement streaming
  encryption.
- Obfuscation is **not** encryption and provides no confidentiality guarantee
  — it only raises the effort needed to read the code.

## License

MIT

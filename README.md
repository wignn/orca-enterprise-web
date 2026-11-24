# ORCA Enterprise Website

```sh
bun install
bun run dev --port 3000
```

To serve the installer locally, copy `../src-tauri/target/release/bundle/nsis/ORCA Enterprise_1.0.1_x64-setup.exe` into `public/downloads/` with the same filename. Binaries are excluded from Git.

For production, upload the installer to HTTPS storage/release hosting and set `ORCA_WINDOWS_DOWNLOAD_URL` as shown in `.env.example`, or keep the file in `public/downloads/` if your host supports ~121 MiB assets. Ensure the file host sends `Content-Disposition: attachment`. `/downloads/windows` redirects to that URL or serves the local file, returning HTTP 503 if neither is available.

`bun run build` builds the production bundle; `bun run start` runs it. When releasing a new desktop build, update the installer filename in the route handler, version metadata, and download URL.

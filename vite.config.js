import { defineConfig } from 'vite';

// Polling is needed when the repo lives on a Windows drive under WSL (/mnt/c), where inotify doesn't fire.
export default defineConfig({
  server: { watch: { usePolling: true, interval: 300 } },
});

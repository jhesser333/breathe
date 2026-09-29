import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// Audio loops in public/audio are discovered at build time, so adding a new
// group (e.g. slider_2a.wav / slider_2b.wav) needs no code change.
function listAudioFiles() {
  try {
    return fs.readdirSync('public/audio').filter((f) => f.toLowerCase().endsWith('.wav'))
  } catch {
    return []
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __AUDIO_FILES__: JSON.stringify(listAudioFiles()),
  },
})

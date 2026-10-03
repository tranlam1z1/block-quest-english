import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { teacherApi } from './server/teacherApi.ts';

// Cấu hình Vite: React + PWA (cài như ứng dụng, chơi offline được sau lần mở đầu tiên)
export default defineConfig({
  // Three.js khá nặng (~900KB) nhưng đã được tách riêng và cache bởi PWA
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    react(),
    // API khu vực giáo viên: nội dung tùy chỉnh, mã PIN, thống kê (lưu ở thư mục data/)
    teacherApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'images/words/*.svg'],
      manifest: {
        name: 'Block Quest English',
        short_name: 'Block Quest',
        description: 'Game phiêu lưu học tiếng Anh cho học sinh tiểu học',
        lang: 'vi',
        theme_color: '#22c55e',
        background_color: '#bae6fd',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // API luôn gọi thẳng máy chủ, không trả trang index.html thay thế
        navigateFallbackDenylist: [/^\/api\//],
        // Lưu font Google (chữ + emoji) để chơi offline
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});

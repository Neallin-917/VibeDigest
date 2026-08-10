import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Vitest runs outside Next's server-component module graph. Keep
            // the server-only guard in production while making it a no-op here.
            'server-only': path.resolve(__dirname, './src/test/server-only.ts'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.ts',
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['e2e/**/*', 'node_modules/**/*'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['e2e/**/*'],
            thresholds: {
                statements: 65,
                branches: 55,
                functions: 70,
                lines: 65
            }
        },
    },
})

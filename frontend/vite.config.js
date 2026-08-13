import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Full Supabase cutover, 2026-08-13 -- this used to require VITE_FIREBASE_* keys at
  // production build time (Firebase was the live backend then). Firebase is fully removed
  // from the frontend now; Supabase's equivalent required keys are checked instead.
  const requiredSupabaseKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missingSupabaseKeys = requiredSupabaseKeys.filter((key) => !env[key]);
  if (mode === 'production' && missingSupabaseKeys.length) {
    throw new Error(`Missing Supabase production configuration: ${missingSupabaseKeys.join(', ')}`);
  }

  return {
    logLevel: 'error',
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});

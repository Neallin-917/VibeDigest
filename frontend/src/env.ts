import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    ANALYZE: z.string().optional(),
    NEXT_DIST_DIR: z.string().optional(),
    AI_SDK_DEBUG: z.string().optional(),
    BACKEND_API_URL: z.string().url(),
    BACKEND_ORIGIN_URL: z.string().url().optional(),
    
    // LLM Configuration
    MODEL_ALIAS_SMART: z.string().optional(),
    MODEL_ALIAS_FAST: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENROUTER_BASE_URL: z.string().url().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    
    // Legacy/Alternative URL vars
    FRONTEND_URL: z.string().url().optional(),
  },
  client: {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    
    // API
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    
    // App URL
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
    
    // Third Party
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_GA_ID: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
    NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),
    
    // Testing
    NEXT_PUBLIC_E2E_MOCK: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    ANALYZE: process.env.ANALYZE,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR,
    AI_SDK_DEBUG: process.env.AI_SDK_DEBUG,
    BACKEND_API_URL: process.env.BACKEND_API_URL,
    BACKEND_ORIGIN_URL: process.env.BACKEND_ORIGIN_URL,
    
    MODEL_ALIAS_SMART: process.env.MODEL_ALIAS_SMART,
    MODEL_ALIAS_FAST: process.env.MODEL_ALIAS_FAST,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    
    FRONTEND_URL: process.env.FRONTEND_URL,
    
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    NEXT_PUBLIC_BING_SITE_VERIFICATION: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
    NEXT_PUBLIC_E2E_MOCK: process.env.NEXT_PUBLIC_E2E_MOCK,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

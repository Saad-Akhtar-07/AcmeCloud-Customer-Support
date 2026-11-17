const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const webhookUrl = import.meta.env.VITE_N8N_SUPPORT_WEBHOOK_URL?.trim();

const missing = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
  !webhookUrl && 'VITE_N8N_SUPPORT_WEBHOOK_URL',
].filter(Boolean) as string[];

export const appConfig = {
  supabaseUrl,
  supabaseAnonKey,
  webhookUrl,
  missing,
  isReady: missing.length === 0,
} as const;

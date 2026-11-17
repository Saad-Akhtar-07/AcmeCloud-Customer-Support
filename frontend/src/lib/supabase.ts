import { createClient } from '@supabase/supabase-js';
import { appConfig } from './config';

export const supabase = appConfig.isReady
  ? createClient(appConfig.supabaseUrl!, appConfig.supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'acmecloud-support-auth',
      },
    })
  : null;

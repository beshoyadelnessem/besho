import { createSupabaseApi } from './supabase.js';
import { createDemoApi } from './demo.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Without a configured Supabase project the app runs as a self-contained demo.
export const api = url && key ? createSupabaseApi(url, key) : createDemoApi();

// Configuração do Supabase — usada pelo site público e pelo painel admin.
// A chave "anon" é pública por design (protegida pelas políticas de RLS no banco).
const SUPABASE_URL = 'https://wuatujstuzaseqlfhmqq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1YXR1anN0dXphc2VxbGZobXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NDA0MzYsImV4cCI6MjEwMjExNjQzNn0.ahb2a9_JPcRy4Ku_f2GQLvYc0VKZSslLR8i5t23uUJw';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

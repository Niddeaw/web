// ไฟล์ config.js
const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co'; // ใส่ URL ของคุณ
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6'; // ใส่ Anon Key ของคุณ

// สร้างตัวแปร db ไว้ให้ทุกไฟล์เรียกใช้งาน
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
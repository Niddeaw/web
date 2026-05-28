// ไฟล์ config.js
// School Project
const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co'; // ใส่ URL ของคุณ
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6'; // ใส่ Anon Key ของคุณ

// WRK Project
// const SUPABASE_URL = 'https://cdbhqzjzjkgammwlmjpz.supabase.co'; // ใส่ URL ของคุณ
// const SUPABASE_KEY = 'sb_publishable_braUoAytmLB5Qr9Xw3FrfQ_QsPDQY7f'; // ใส่ Anon Key ของคุณ

// สร้างตัวแปร db ไว้ให้ทุกไฟล์เรียกใช้งาน
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// Global Sticky Footer (แสดงทุกหน้าอัตโนมัติ)
// ==========================================
function injectGlobalFooter() {
    // 1. เช็คก่อนว่ามี Footer อยู่แล้วหรือยัง (ป้องกันการสร้างซ้ำ)
    if (document.getElementById('wrk-global-footer')) return;

    // 2. สร้างแท็ก Footer พร้อมใส่ Tailwind CSS ให้เกาะติดด้านล่าง (Fixed)
    const footer = document.createElement('footer');
    footer.id = 'wrk-global-footer';
    footer.className = 'fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md border-t border-gray-200 py-2.5 z-[100] text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]';
    
    // 3. ใส่ข้อความตามที่คุณครูต้องการ (ตกแต่งให้ดูพรีเมียมขึ้นเล็กน้อย)
    footer.innerHTML = `
        <p class="text-[11px] md:text-xs text-gray-500 font-medium">
            &copy; 2026 ออกแบบและพัฒนาโดย : <span class="text-blue-600 font-bold">นายจิรศักดิ์ จิรสาโรช</span> <span class="hidden sm:inline">|</span><br class="sm:hidden"> <i class="fa-solid fa-phone text-gray-400 mx-1"></i> 080-6393969
        </p>
    `;
    
    // 4. นำไปแปะไว้ใน body
    document.body.appendChild(footer);
    
    // 5. ดันเนื้อหาของ body ขึ้นเล็กน้อย เพื่อไม่ให้โดน Footer บัง (padding-bottom)
    document.body.style.paddingBottom = '45px';
}

// รอให้หน้าเว็บโหลดโครงสร้าง HTML เสร็จก่อน แล้วค่อยแทรก Footer เข้าไป
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalFooter);
} else {
    injectGlobalFooter();
}
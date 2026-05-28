// ไฟล์ config.js
// School Project
const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6';

// สร้างตัวแปร db ไว้ให้ทุกไฟล์เรียกใช้งาน
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// Global Footer (แสดงทุกหน้าอัตโนมัติ)
// ==========================================
function injectGlobalFooter() {
    // ป้องกันการสร้างซ้ำ
    if (document.getElementById('wrk-global-footer')) return;

    // สร้าง Footer แบบธรรมดา (ไม่ Fixed)
    const footer = document.createElement('footer');
    footer.id = 'wrk-global-footer';
    footer.className = 'w-full bg-white/80 backdrop-blur-md border-t border-gray-200 py-2.5 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]';
    
    footer.innerHTML = `
        <p class="text-[11px] md:text-xs text-gray-500 font-medium">
            &copy; 2026 ออกแบบและพัฒนาโดย : <span class="text-blue-600 font-bold">นายจิรศักดิ์ จิรสาโรช</span> <span class="hidden sm:inline">|</span><br class="sm:hidden"> <i class="fa-solid fa-phone text-gray-400 mx-1"></i> 080-6393969
        </p>
    `;
    
    document.body.appendChild(footer);
    
    // ไม่ต้องปรับ padding-bottom เพราะ Footer อยู่ใน flow ปกติ
    // ไม่มี element ใดถูกบังอีกต่อไป
}

// รอให้หน้าเว็บโหลดโครงสร้าง HTML เสร็จก่อน แล้วค่อยแทรก Footer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalFooter);
} else {
    injectGlobalFooter();
}
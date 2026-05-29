// ไฟล์ config.js
// School Project
const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co'; // ใส่ URL ของคุณ
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6'; // ใส่ Anon Key ของคุณ

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
    // 💡 แก้ไข: ปรับ z-[100] ลงมาเป็น z-40 เพื่อไม่ให้บัง Modal (เพราะหน้าต่าง Modal ปกติใช้ z-50 ขึ้นไป)
    footer.className = 'fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md border-t border-gray-200 py-2.5 z-40 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]';
    
    // 3. ใส่ข้อความตามที่คุณครูต้องการ
    footer.innerHTML = `
        <p class="text-[11px] md:text-xs text-gray-500 font-medium leading-relaxed">
            &copy; 2026 ออกแบบและพัฒนาโดย : <span class="text-blue-600 font-bold">นายจิรศักดิ์ จิรสาโรช</span> <span class="hidden sm:inline">|</span><br class="sm:hidden"> <i class="fa-solid fa-phone text-gray-400 mx-1"></i> 080-6393969
        </p>
    `;
    
    // 4. นำไปแปะไว้ใน body
    document.body.appendChild(footer);
    
    // 5. 💡 แก้ไข: สร้าง Style แทรกเข้าไปเพื่อดันเนื้อหา (Padding-Bottom) แบบ Responsive
    // - มือถือ (2 บรรทัด) เผื่อไว้ 75px
    // - PC (1 บรรทัด) เผื่อไว้ 50px
    const style = document.createElement('style');
    style.innerHTML = `
        body, main, #main-content {
            padding-bottom: 75px !important;
        }
        /* ถ้าเป็นคอนเทนเนอร์ที่บังคับ Scroll ในตัว (เช่น layout แบบ h-screen) */
        .overflow-y-auto {
            padding-bottom: 75px !important;
        }
        @media (min-width: 640px) {
            body, main, #main-content, .overflow-y-auto {
                padding-bottom: 50px !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// รอให้หน้าเว็บโหลดโครงสร้าง HTML เสร็จก่อน แล้วค่อยแทรก Footer เข้าไป
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalFooter);
} else {
    injectGlobalFooter();
}

// ฟังก์ชันส่วนกลางสำหรับบันทึก Log การเข้าใช้งาน
async function logUserAction(action, module) {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;

        await db.from('core_access_logs').insert([{
            user_id: session.user.id,
            action: action,
            module: module,
            user_agent: navigator.userAgent
        }]);
    } catch (error) {
        console.error("Failed to save log:", error);
    }
}
// ไฟล์ config.js
// School Project
const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6';

// สร้างตัวแปร db ไว้ให้ทุกไฟล์เรียกใช้งาน
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// Global Sticky Footer (แสดงทุกหน้าอัตโนมัติ)
// ==========================================
function injectGlobalFooter() {
    // 1. ป้องกันการสร้างซ้ำ
    if (document.getElementById('wrk-global-footer')) return;

    // 2. สร้าง Footer แบบ Fixed
    const footer = document.createElement('footer');
    footer.id = 'wrk-global-footer';
    footer.className = 'fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md border-t border-gray-200 py-2.5 z-[100] text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]';
    
    footer.innerHTML = `
        <p class="text-[11px] md:text-xs text-gray-500 font-medium">
            &copy; 2026 ออกแบบและพัฒนาโดย : <span class="text-blue-600 font-bold">นายจิรศักดิ์ จิรสาโรช</span> <span class="hidden sm:inline">|</span><br class="sm:hidden"> <i class="fa-solid fa-phone text-gray-400 mx-1"></i> 080-6393969
        </p>
    `;
    
    document.body.appendChild(footer);
    
    // 3. ฟังก์ชันปรับ padding-bottom ให้เท่ากับความสูงของ Footer
    function adjustPadding() {
        if (!footer) return;
        const footerHeight = footer.offsetHeight;
        document.body.style.paddingBottom = footerHeight + 'px';
    }
    
    // 4. เรียกตอนแรก และตรวจจับทุกครั้งที่ขนาด Footer เปลี่ยน
    adjustPadding();
    window.addEventListener('resize', adjustPadding);
    
    // 5. ใช้ ResizeObserver สำหรับกรณีที่เนื้อหา Footer เปลี่ยนแบบไม่ต้อง resize (เช่น โหลดฟอนต์ช้า)
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(adjustPadding);
        resizeObserver.observe(footer);
    }
}

// รอให้ DOM พร้อมแล้วจึงแทรก Footer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalFooter);
} else {
    injectGlobalFooter();
}
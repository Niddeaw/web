// ==========================================
// config.js — ไฟล์ตั้งค่าส่วนกลางของระบบ WRK
// ==========================================

const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6';

// สร้างตัวแปร db ไว้ให้ทุกไฟล์เรียกใช้งาน
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ระบบสิทธิ์และบทบาท (Role & Permission) — มาตรฐานกลาง
// ==========================================

/**
 * WRK_ROLES — กำหนดบทบาทและสิทธิ์ของระบบ
 * แก้ไขตรงนี้เพียงที่เดียวเมื่อต้องการเพิ่ม/ลด Role
 */
const WRK_ROLES = {
    // ✅ Role ที่สามารถเข้าใช้งานระบบต่างๆ ได้ (ทุกโมดูล)
    ALLOWED: ['super_admin', 'admin', 'director', 'deputy', 'teacher', 'staff'],

    // ✅ Role ที่มีสิทธิ์ระดับ Admin (เห็นทุกห้อง, จัดการระบบ, ตั้งค่า)
    ADMIN: ['super_admin', 'admin', 'director', 'deputy'],

    // ✅ Role ที่เป็นครู (มีห้องที่ปรึกษา)
    TEACHER: ['teacher', 'staff'],

    // ✅ Role ที่มีสิทธิ์จัดการโมดูลเฉพาะ (module_admin)
    // ใช้ร่วมกับตาราง core_module_admins
};

// ==========================================
// ฟังก์ชันตรวจสอบสิทธิ์ (ใช้ร่วมกันทุกโมดูล)
// ==========================================

/**
 * ตรวจสอบว่า Role ที่กำหนดอยู่ในกลุ่มที่อนุญาตให้เข้าใช้งานหรือไม่
 * @param {string} role - ชื่อบทบาท (จาก core_personnel.role)
 * @returns {boolean}
 */
function isAllowedRole(role) {
    return WRK_ROLES.ALLOWED.includes(role);
}

/**
 * ตรวจสอบว่าเป็นผู้ดูแลระบบ (Admin) หรือไม่
 * @param {string} role - ชื่อบทบาท
 * @param {boolean} isAdminMode - สถานะโหมดแอดมิน (true/false)
 * @returns {boolean}
 */
function isAdminUser(role, isAdminMode) {
    return WRK_ROLES.ADMIN.includes(role) || isAdminMode === true;
}

/**
 * ตรวจสอบว่าเป็นครู (Teacher) หรือไม่
 * @param {string} role - ชื่อบทบาท
 * @param {boolean} hasClassrooms - มีห้องที่ปรึกษาหรือไม่
 * @returns {boolean}
 */
function isTeacherUser(role, hasClassrooms) {
    return WRK_ROLES.TEACHER.includes(role) || hasClassrooms === true;
}

/**
 * ตรวจสอบสิทธิ์ Admin และแสดง SweetAlert ถ้าไม่มีสิทธิ์
 * @param {string} role - ชื่อบทบาท
 * @param {boolean} isAdminMode - สถานะโหมดแอดมิน
 * @param {string} customMessage - ข้อความที่ต้องการแสดง (optional)
 * @returns {boolean} - true ถ้ามีสิทธิ์, false ถ้าไม่มี
 */
function requireAdmin(role, isAdminMode, customMessage = null) {
    if (!isAdminUser(role, isAdminMode)) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์',
            text: customMessage || 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้',
            confirmButtonText: 'ตกลง'
        });
        return false;
    }
    return true;
}

/**
 * ตรวจสอบสิทธิ์การเข้าถึงโมดูล (สำหรับกรณีที่ต้องการละเอียดขึ้น)
 * @param {string} role - ชื่อบทบาท
 * @param {string} moduleId - รหัสโมดูล (เช่น 'scholarship', 'sdq', 'eq', 'mit')
 * @param {string} userId - ID ของผู้ใช้ (สำหรับตรวจสอบ module_admin)
 * @returns {Promise<boolean>}
 */
async function hasModuleAccess(role, moduleId, userId) {
    // 1. ถ้าเป็น Admin หรือ Super Admin → เข้าได้ทุกโมดูล
    if (WRK_ROLES.ADMIN.includes(role)) return true;

    // 2. ถ้าเป็น Teacher → ต้องมีสิทธิ์ในโมดูลนั้น (ตรวจสอบจาก core_module_admins)
    if (WRK_ROLES.TEACHER.includes(role)) {
        const { data, error } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', moduleId)
            .maybeSingle();

        if (error) {
            console.error('Error checking module access:', error);
            return false;
        }
        return !!data;
    }

    // 3. Role อื่น (staff, etc.) → ไม่มีสิทธิ์
    return false;
}

// ==========================================
// ฟังก์ชันอัปเดต UI ตามสิทธิ์ (ใช้ร่วมกัน)
// ==========================================

/**
 * อัปเดตการแสดงผลปุ่ม/UI ตามสิทธิ์ของผู้ใช้
 * @param {string} role - ชื่อบทบาท
 * @param {boolean} isAdminMode - สถานะโหมดแอดมิน
 * @param {Object} elements -  object { buttonId: 'elementId', ... }
 */
function applyVisibilityByRole(role, isAdminMode, elements = {}) {
    const isAdmin = isAdminUser(role, isAdminMode);

    // ปุ่มตั้งค่าระบบ
    const btnSettings = document.getElementById(elements.settingsBtn || 'btn-settings');
    if (btnSettings) btnSettings.classList.toggle('hidden', !isAdmin);

    // ปุ่มสลับโหมด
    const btnToggle = document.getElementById(elements.toggleBtn || 'btnToggleMode');
    if (btnToggle) {
        if (isAdmin) {
            btnToggle.classList.remove('hidden');
            btnToggle.classList.add('flex');
        } else {
            btnToggle.classList.add('hidden');
            btnToggle.classList.remove('flex');
        }
    }

    // ปุ่มจัดการผู้ดูแลระบบ (Admin Manager)
    const btnAdminManager = document.getElementById(elements.adminManagerBtn || 'adminManagerBtn');
    if (btnAdminManager) {
        if (isAdmin) {
            btnAdminManager.classList.remove('hidden');
        } else {
            btnAdminManager.classList.add('hidden');
        }
    }

    // ปุ่มนำเข้า / ส่งออก — ให้ครูใช้ได้ (ไม่ซ่อน)
    // (ถ้าต้องการซ่อนเฉพาะ Admin ให้ใช้ isAdmin ควบคุม)
}

/**
 * อัปเดตข้อความปุ่มสลับโหมด (Toggle Mode)
 * @param {string} role - ชื่อบทบาท
 * @param {boolean} isAdminMode - สถานะโหมดแอดมิน
 * @param {string} btnId - ID ของปุ่ม (default: 'btnToggleMode')
 */
function updateToggleModeUI(role, isAdminMode, btnId = 'btnToggleMode') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (btn.classList.contains('hidden')) return;

    if (isAdminMode) {
        btn.innerHTML = '<i class="fa-solid fa-chalkboard-user mr-1"></i> โหมดครู';
        btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 transition-all';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-user-shield mr-1"></i> โหมดแอดมิน';
        btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100 transition-all';
    }
}

// ==========================================
// ฟังก์ชันสำหรับใช้ใน window.load (ช่วยให้โค้ดสั้นลง)
// ==========================================

/**
 * ตรวจสอบ Session และ Role (ใช้ใน window.load ของแต่ละโมดูล)
 * @param {string} moduleName - ชื่อโมดูล (สำหรับ log)
 * @param {string[]} allowedRoles - override role ที่อนุญาต (optional)
 * @returns {Promise<Object|null>} - { user, personnel, isAdmin, isTeacher, isAdminMode }
 */
async function checkSessionAndRole(moduleName = 'system', allowedRoles = null) {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }

    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) {
        Swal.fire('ไม่พบข้อมูล', 'กรุณาติดต่อผู้ดูแลระบบ', 'error').then(() => {
            window.location.href = 'index.html';
        });
        return null;
    }

    const role = personnel.role;
    const allowed = allowedRoles || WRK_ROLES.ALLOWED;

    if (!allowed.includes(role)) {
        await Swal.fire({
            icon: 'warning',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: `บทบาท "${role}" ไม่มีสิทธิ์ใช้งานระบบ ${moduleName}`,
            confirmButtonText: 'กลับหน้าหลัก'
        });
        window.location.href = 'index.html';
        return null;
    }

    const isAdmin = WRK_ROLES.ADMIN.includes(role);
    const isTeacher = WRK_ROLES.TEACHER.includes(role);

    // ตรวจสอบ module_admin เฉพาะกรณีที่ role เป็น teacher และต้องการสิทธิ์เพิ่ม
    // (แต่ละโมดูลจะจัดการเอง)

    return {
        user,
        personnel,
        role,
        isAdmin,
        isTeacher,
        isAdminMode: isAdmin // เริ่มต้นโหมด Admin ถ้ามีสิทธิ์
    };
}

// ==========================================
// Global Sticky Footer (แสดงทุกหน้าอัตโนมัติ)
// ==========================================
function injectGlobalFooter() {
    if (document.getElementById('wrk-global-footer')) return;

    const footer = document.createElement('footer');
    footer.id = 'wrk-global-footer';
    footer.className = 'fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md border-t border-gray-200 py-2.5 z-40 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]';

    footer.innerHTML = `
        <p class="text-[11px] md:text-xs text-gray-500 font-medium leading-relaxed">
            &copy; 2026 ออกแบบและพัฒนาโดย : <span class="text-blue-600 font-bold">นายจิรศักดิ์ จิรสาโรช</span> <span class="hidden sm:inline">|</span><br class="sm:hidden"> <i class="fa-solid fa-phone text-gray-400 mx-1"></i> 080-6393969
        </p>
    `;

    document.body.appendChild(footer);

    const style = document.createElement('style');
    style.innerHTML = `
        body, main, #main-content {
            padding-bottom: 75px !important;
        }
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalFooter);
} else {
    injectGlobalFooter();
}

// ==========================================
// Global Helpdesk Button (ปุ่มลอยแจ้งปัญหา)
// ==========================================
function injectHelpdeskButton() {
    if (document.getElementById('wrk-helpdesk-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'wrk-helpdesk-fab';
    fab.className = 'fixed bottom-16 right-6 z-[100]';

    fab.innerHTML = `
        <button onclick="window.location.href='helpdesk_user.html'"
                title="แจ้งปัญหา / ติดต่อแอดมิน"
                class="bg-blue-600/90 backdrop-blur-sm hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-[0_8px_16px_rgba(37,99,235,0.3)] hover:shadow-[0_12px_20px_rgba(37,99,235,0.4)] transition-all duration-300 hover:scale-105 group relative border border-blue-400/30">
            <i class="fa-solid fa-headset text-2xl"></i>
        </button>
    `;

    document.body.appendChild(fab);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHelpdeskButton);
} else {
    injectHelpdeskButton();
}

// ==========================================
// ฟังก์ชัน Log การเข้าใช้งาน
// ==========================================
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

// ==========================================
// ประกาศตัวแปรและฟังก์ชันให้เป็น Global
// ==========================================
window.WRK_ROLES = WRK_ROLES;
window.isAllowedRole = isAllowedRole;
window.isAdminUser = isAdminUser;
window.isTeacherUser = isTeacherUser;
window.requireAdmin = requireAdmin;
window.hasModuleAccess = hasModuleAccess;
window.applyVisibilityByRole = applyVisibilityByRole;
window.updateToggleModeUI = updateToggleModeUI;
window.checkSessionAndRole = checkSessionAndRole;
window.logUserAction = logUserAction;
window.db = db;
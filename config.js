// ==========================================
// config.js — ไฟล์ตั้งค่าส่วนกลางของระบบ WRK
// ==========================================

const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6';

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

    // ✅ Role ที่มีสิทธิ์จัดการตั้งค่าระบบ (Settings) — เฉพาะ super_admin และ admin
    SETTINGS: ['super_admin', 'admin'],
};

// ==========================================
// ฟังก์ชันตรวจสอบสิทธิ์ (ใช้ร่วมกันทุกโมดูล)
// ==========================================

function isAllowedRole(role) {
    return WRK_ROLES.ALLOWED.includes(role);
}

function isAdminUser(role, isAdminMode) {
    return WRK_ROLES.ADMIN.includes(role) || isAdminMode === true;
}

function isTeacherUser(role, hasClassrooms) {
    return WRK_ROLES.TEACHER.includes(role) || hasClassrooms === true;
}

// ✅ ฟังก์ชันใหม่สำหรับสิทธิ์ตั้งค่าระบบ
function canManageSettings(role) {
    return WRK_ROLES.SETTINGS.includes(role);
}

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

async function hasModuleAccess(role, moduleId, userId) {
    if (WRK_ROLES.ADMIN.includes(role)) return true;
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
    return false;
}

// ==========================================
// ฟังก์ชันอัปเดต UI ตามสิทธิ์ (ใช้ร่วมกัน)
// ==========================================

function applyVisibilityByRole(role, isAdminMode, elements = {}) {
    const isAdmin = isAdminUser(role, isAdminMode);
    const hasSettings = canManageSettings(role);

    const btnSettings = document.getElementById(elements.settingsBtn || 'btn-settings');
    if (btnSettings) {
        btnSettings.classList.toggle('hidden', !hasSettings);
    }

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

    const btnAdminManager = document.getElementById(elements.adminManagerBtn || 'adminManagerBtn');
    if (btnAdminManager) {
        btnAdminManager.classList.toggle('hidden', !isAdmin);
    }
}

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

async function checkSessionAndRole(moduleName = 'system', allowedRoles = null) {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }

    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) {
        Swal.fire('ไม่พบข้อมูล', 'กรุณาติดต่อผู้ดูแลระบบ', 'error').then(() => {
            window.location.href = 'login.html';
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
        window.location.href = 'login.html';
        return null;
    }

    const isAdmin = WRK_ROLES.ADMIN.includes(role);
    const isTeacher = WRK_ROLES.TEACHER.includes(role);

    return {
        user,
        personnel,
        role,
        isAdmin,
        isTeacher,
        isAdminMode: isAdmin
    };
}

// ==========================================
// Global Sticky Footer
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
// Global Helpdesk Button
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
window.canManageSettings = canManageSettings;
window.requireAdmin = requireAdmin;
window.hasModuleAccess = hasModuleAccess;
window.applyVisibilityByRole = applyVisibilityByRole;
window.updateToggleModeUI = updateToggleModeUI;
window.checkSessionAndRole = checkSessionAndRole;
window.logUserAction = logUserAction;
window.db = db;
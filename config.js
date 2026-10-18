// ==========================================
// config.js — ไฟล์ตั้งค่าส่วนกลางของระบบ WRK
// 🚀 v2.1 OPTIMIZED — ใช้ getSession() แทน getUser()
// ==========================================

const SUPABASE_URL = 'https://scyyqsxbxokripljamzl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvxGXPU6HqN6cIY9qWgrKA_gNzeAmf6';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ระบบสิทธิ์และบทบาท (Role & Permission) — มาตรฐานกลาง
// ==========================================
const WRK_ROLES = {
    ALLOWED: ['super_admin', 'admin', 'director', 'deputy', 'teacher', 'staff', 'office'],
    ADMIN: ['super_admin', 'admin', 'director', 'deputy'],
    TEACHER: ['teacher', 'staff'],
    OFFICE: ['office'],
    SETTINGS: ['super_admin', 'admin'],
};

// ==========================================
// ✅ Role catalog — ใช้ใน UI (Sidebar Editor)
// ==========================================
const WRK_ROLE_CATALOG = [
    { value: 'super_admin', label: 'Super Admin',      color: '#9333ea', icon: 'fa-crown' },
    { value: 'admin',       label: 'Admin',            color: '#2563eb', icon: 'fa-user-shield' },
    { value: 'director',    label: 'ผู้อำนวยการ',        color: '#0891b2', icon: 'fa-user-tie' },
    { value: 'deputy',      label: 'รองผู้อำนวยการ',    color: '#06b6d4', icon: 'fa-user-tie' },
    { value: 'teacher',     label: 'ครูผู้สอน',           color: '#e11d48', icon: 'fa-chalkboard-user' },
    { value: 'staff',       label: 'เจ้าหน้าที่',           color: '#f59e0b', icon: 'fa-user' },
    { value: 'office',      label: 'เจ้าหน้าที่สำนักงาน', color: '#10b981', icon: 'fa-briefcase' }
];

// ==========================================
// ฟังก์ชันตรวจสอบสิทธิ์
// ==========================================
function isAllowedRole(role) { return WRK_ROLES.ALLOWED.includes(role); }
function isAdminUser(role, isAdminMode) { return WRK_ROLES.ADMIN.includes(role) || isAdminMode === true; }
function isTeacherUser(role, hasClassrooms) { return WRK_ROLES.TEACHER.includes(role) || hasClassrooms === true; }
function isOfficeUser(role) { return WRK_ROLES.OFFICE.includes(role); }
function canManageSettings(role) { return WRK_ROLES.SETTINGS.includes(role); }
function requiresModulePermission(role) {
    return WRK_ROLES.TEACHER.includes(role) || WRK_ROLES.OFFICE.includes(role);
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
    if (WRK_ROLES.TEACHER.includes(role) || WRK_ROLES.OFFICE.includes(role)) {
        const { data, error } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', moduleId)
            .maybeSingle();
        if (error) { console.error('Error checking module access:', error); return false; }
        return !!data;
    }
    return false;
}

// ==========================================
// ฟังก์ชันอัปเดต UI ตามสิทธิ์
// ==========================================
function applyVisibilityByRole(role, isAdminMode, elements = {}) {
    const isAdmin = isAdminUser(role, isAdminMode);
    const hasSettings = canManageSettings(role);

    const btnSettings = document.getElementById(elements.settingsBtn || 'btn-settings');
    if (btnSettings) btnSettings.classList.toggle('hidden', !hasSettings);

    const btnToggle = document.getElementById(elements.toggleBtn || 'btnToggleMode');
    if (btnToggle) {
        if (isAdmin) { btnToggle.classList.remove('hidden'); btnToggle.classList.add('flex'); }
        else { btnToggle.classList.add('hidden'); btnToggle.classList.remove('flex'); }
    }

    const btnAdminManager = document.getElementById(elements.adminManagerBtn || 'adminManagerBtn');
    if (btnAdminManager) btnAdminManager.classList.toggle('hidden', !isAdmin);
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
// 🚀 Auth Cache (5 นาที) — เพื่อลดการ query ซ้ำ
// ==========================================
const _AUTH_PERSONNEL_CACHE_KEY = 'wrk_auth_personnel_cache';
const _AUTH_PERSONNEL_TTL = 5 * 60 * 1000;

function _readPersonnelCache(userId) {
    try {
        const raw = sessionStorage.getItem(_AUTH_PERSONNEL_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.userId !== userId) return null;
        if (!parsed.ts || Date.now() - parsed.ts > _AUTH_PERSONNEL_TTL) return null;
        return parsed.data;
    } catch (e) { return null; }
}

function _writePersonnelCache(userId, data) {
    try {
        sessionStorage.setItem(_AUTH_PERSONNEL_CACHE_KEY, JSON.stringify({
            userId, ts: Date.now(), data
        }));
    } catch (e) { }
}

function clearAuthPersonnelCache() {
    try { sessionStorage.removeItem(_AUTH_PERSONNEL_CACHE_KEY); } catch (e) { }
}

// ==========================================
// 🔒 Module Guard — ตรวจว่าหน้าปัจจุบันเป็นของโมดูลที่ปิดอยู่หรือไม่
//    จับคู่จากชื่อไฟล์หน้าเว็บ กับ core_system_modules.url
//    คืนชื่อโมดูล (ถ้าปิดอยู่) หรือ null (ถ้าเปิด/ไม่ใช่หน้าโมดูล/โหลดไม่ได้)
// ==========================================
function _pageBasename(u) {
    if (!u) return '';
    try {
        let p = String(u).trim().split('#')[0].split('?')[0];
        p = p.replace(/^https?:\/\/[^/]+/i, '');
        const seg = p.split('/').filter(Boolean).pop() || '';
        return seg.toLowerCase();
    } catch (e) { return ''; }
}

async function _isCurrentPageModuleDisabled() {
    try {
        const page = _pageBasename(window.location.pathname);
        if (!page || page === 'index.html' || page === 'login.html') return null;

        const { data, error } = await db
            .from('core_system_modules')
            .select('module_name, url, is_active');
        if (error || !data) return null;                 // โหลดไม่ได้ → ปล่อยผ่าน (fail-open)

        const matches = data.filter(m => _pageBasename(m.url) === page);
        if (matches.length === 0) return null;           // ไม่ใช่หน้าโมดูล
        if (matches.some(m => m.is_active !== false)) return null;  // มีอย่างน้อย 1 โมดูลที่ยังเปิด
        return matches[0].module_name || page;
    } catch (e) {
        console.warn('module guard error:', e);
        return null;
    }
}

// ==========================================
// 🚀 checkSessionAndRole — ตรวจสอบ session และ role
//    ✅ v2.1: ใช้ getSession() แทน getUser() (เร็วกว่า 20-100 เท่า)
//    ✅ v2.1: ลด select('*') → เลือกเฉพาะคอลัมน์ที่ใช้
//    ✅ v2.1: Cache personnel 5 นาที
// ==========================================
async function checkSessionAndRole(moduleName = 'system', allowedRoles = null) {
    const t0 = performance.now();

    // ✅ 1) ใช้ getSession() อ่านจาก localStorage — ไม่ต้อง round-trip
    let user;
    try {
        const { data: { session } } = await db.auth.getSession();
        user = session?.user || null;
    } catch (e) {
        console.warn('getSession error:', e);
        user = null;
    }

    if (!user) {
        window.location.href = 'login.html';
        return null;
    }

    // ✅ 2) ลอง cache personnel ก่อน
    let personnel = _readPersonnelCache(user.id);

    if (!personnel) {
        // ✅ เลือกเฉพาะคอลัมน์ที่ใช้ (ลด payload)
        const { data, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, role, email, avatar_url, position, department')
            .eq('id', user.id)
            .single();

        if (error || !data) {
            await Swal.fire('ไม่พบข้อมูล', 'กรุณาติดต่อผู้ดูแลระบบ', 'error');
            window.location.href = 'login.html';
            return null;
        }
        personnel = data;
        _writePersonnelCache(user.id, personnel);
    }

    const role = personnel.role;
    const allowed = allowedRoles || WRK_ROLES.ALLOWED;

    if (!allowed.includes(role)) {
        await Swal.fire({
            icon: 'warning',
            title: 'ไม่มีสิทธิ์เข้าใช้งาน',
            text: `บทบาท "${role}" ไม่มีสิทธิ์ใช้งานระบบ ${moduleName}`,
            confirmButtonText: 'ตกลง',
            allowOutsideClick: false,
            allowEscapeKey: false
        });
        window.location.href = 'index.html';
        return null;
    }

    const isAdmin   = WRK_ROLES.ADMIN.includes(role);
    const isTeacher = WRK_ROLES.TEACHER.includes(role);
    const isOffice  = WRK_ROLES.OFFICE.includes(role);

    // ✅ บล็อกการเข้าหน้าโมดูลที่ถูกปิดใช้งาน (เข้าผ่าน URL ตรง/บุ๊กมาร์ก)
    if (role !== 'super_admin') {
        const blocked = await _isCurrentPageModuleDisabled();
        if (blocked) {
            await Swal.fire({
                icon: 'info',
                title: 'ระบบปิดใช้งานชั่วคราว',
                text: `ระบบ "${blocked}" ปิดปรับปรุงชั่วคราว`,
                confirmButtonText: 'กลับหน้าหลัก',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            window.location.href = 'index.html';
            return null;
        }
    }

    // ✅ เก็บ role ไว้ใช้ทั้งระบบ (Sidebar filter, UI)
    window.currentUserRole = role;

    console.log(`⚡ [checkSessionAndRole] ${moduleName}: ${Math.round(performance.now() - t0)} ms`);

    return {
        user,
        personnel,
        role,
        isAdmin,
        isTeacher,
        isOffice,
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
        body, main, #main-content { padding-bottom: 75px !important; }
        .overflow-y-auto { padding-bottom: 75px !important; }
        @media (min-width: 640px) {
            body, main, #main-content, .overflow-y-auto { padding-bottom: 50px !important; }
        }
    `;
    document.head.appendChild(style);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectGlobalFooter);
else injectGlobalFooter();

// ==========================================
// Global Helpdesk Button
// ==========================================
function injectHelpdeskButton() {
    if (document.getElementById('wrk-helpdesk-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'wrk-helpdesk-fab';
    fab.className = 'fixed bottom-16 right-6 z-[100]';
    fab.innerHTML = `
        <button onclick="window.location.href='helpdesk_user.html'" title="แจ้งปัญหา / ติดต่อแอดมิน"
            class="bg-blue-600/90 backdrop-blur-sm hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-[0_8px_16px_rgba(37,99,235,0.3)] hover:shadow-[0_12px_20px_rgba(37,99,235,0.4)] transition-all duration-300 hover:scale-105 group relative border border-blue-400/30">
            <i class="fa-solid fa-headset text-2xl"></i>
        </button>
    `;
    document.body.appendChild(fab);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectHelpdeskButton);
else injectHelpdeskButton();

// ==========================================
// Log การเข้าใช้งาน
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
    } catch (error) { console.error("Failed to save log:", error); }
}

// ==========================================
// Exports
// ==========================================
window.WRK_ROLES             = WRK_ROLES;
window.WRK_ROLE_CATALOG      = WRK_ROLE_CATALOG;
window.isAllowedRole         = isAllowedRole;
window.isAdminUser           = isAdminUser;
window.isTeacherUser         = isTeacherUser;
window.isOfficeUser          = isOfficeUser;
window.canManageSettings     = canManageSettings;
window.requiresModulePermission = requiresModulePermission;
window.requireAdmin          = requireAdmin;
window.hasModuleAccess       = hasModuleAccess;
window.applyVisibilityByRole = applyVisibilityByRole;
window.updateToggleModeUI    = updateToggleModeUI;
window.checkSessionAndRole   = checkSessionAndRole;
window.logUserAction         = logUserAction;
window.db                    = db;
window.clearAuthPersonnelCache = clearAuthPersonnelCache;

// ✅ Global logout alias
window.logout = function () {
    if (typeof handleLogout === 'function') return handleLogout();
    Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try { localStorage.removeItem('activeMode'); } catch (e) {}
            clearAuthPersonnelCache();
            await db.auth.signOut();
            window.location.replace('login.html');
        }
    });
};

console.log('✅ config.js loaded (v2.1 OPTIMIZED — getSession + cache)');
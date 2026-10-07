// =======================================================
// _template.js — Logic เฉพาะโมดูล
// =======================================================

// =======================================================
// State
// =======================================================
let currentUser = null;
let currentProfile = null;
let currentViewRole = 'teacher';
let isReadOnly = false;

// =======================================================
// Init
// =======================================================
window.addEventListener('load', async () => {
    try {
        // 1) Auth
        const result = await checkSessionAndRole(MODULE_NAME, WRK_ROLES.ALLOWED);
        if (!result) return;

        currentUser = result.personnel;
        currentProfile = result.personnel;
        currentViewRole = result.isAdmin ? 'admin' : 'teacher';

        // 2) ตั้งค่า UI มาตรฐาน
        setUserDisplayName(currentProfile);
        updateUserRoleLabel(result.role);
        renderUserAvatar(currentProfile);

        // 3) Role-based UI
        applyRoleUI(result.role);

        // 4) โหลดข้อมูลโมดูล
        await loadModuleData();

        // 5) Log
        if (typeof logUserAction === 'function') {
            await logUserAction(`เข้าสู่ระบบ ${MODULE_NAME}`, MODULE_KEY);
        }

        console.log('✅ Module initialized:', MODULE_NAME);
    } catch (err) {
        console.error('❌ Init error:', err);
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        restoreSidebarCollapse();
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
    }
});

// =======================================================
// Role UI
// =======================================================
function applyRoleUI(role) {
    const isAdmin = isAdminUser(role, false);

    const btnAdmin = document.getElementById('btnAdminMode');
    if (btnAdmin) {
        btnAdmin.classList.toggle('hidden', !isAdmin);
        btnAdmin.classList.toggle('flex', isAdmin);
    }

    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) {
        const canSettings = typeof canManageSettings === 'function'
            ? canManageSettings(role)
            : isAdmin;
        btnSettings.classList.toggle('hidden', !canSettings);
        btnSettings.classList.toggle('flex', canSettings);
    }
}

// =======================================================
// Tab Switching
// =======================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('tab-' + tabId);
    if (target) target.classList.remove('hidden');

    // Set active nav
    const navMap = { 'section1': 'nav-1', 'section2': 'nav-2' };
    if (navMap[tabId]) setActiveNavItem(navMap[tabId]);

    const titles = {
        'section1': MODULE_NAME + ' — ส่วนที่ 1',
        'section2': MODULE_NAME + ' — ส่วนที่ 2'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || MODULE_NAME;

    if (window.innerWidth < 761 && typeof toggleSidebar === 'function') {
        toggleSidebar(false);
    }
}

// =======================================================
// Mode Toggle
// =======================================================
function toggleRoleView() {
    if (!isAdminUser(currentUser?.role, false)) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }

    currentViewRole = (currentViewRole === 'admin') ? 'teacher' : 'admin';
    localStorage.setItem('module_admin_mode', currentViewRole === 'admin' ? 'true' : 'false');

    if (typeof updateToggleModeUI === 'function') {
        updateToggleModeUI(currentUser.role, currentViewRole === 'admin', 'btnAdminMode');
    }

    loadModuleData();

    Swal.fire({
        toast: true, position: 'top-end', icon: 'info',
        title: currentViewRole === 'admin' ? 'เปลี่ยนเป็นโหมดแอดมิน' : 'เปลี่ยนเป็นโหมดครู',
        showConfirmButton: false, timer: 1500
    });
}

// =======================================================
// Load Module Data
// =======================================================
async function loadModuleData() {
    // TODO: โหลดข้อมูลเฉพาะโมดูล
    console.log('📦 Loading module data... (role:', currentViewRole, ')');
}

// =======================================================
// Settings
// =======================================================
function openSettings() {
    if (typeof canManageSettings === 'function' && !canManageSettings(currentUser?.role)) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }
    Swal.fire('ตั้งค่าระบบ', 'ยังไม่พัฒนา', 'info');
}

// =======================================================
// Expose globals
// =======================================================
window.switchTab = switchTab;
window.toggleRoleView = toggleRoleView;
window.openSettings = openSettings;

console.log('✅ _template.js loaded');
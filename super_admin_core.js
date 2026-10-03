// ==========================================
// super_admin_core.js (เวอร์ชันปรับให้ใช้ dashboard_ui.js)
// ==========================================

// ตัวแปร global
var globalPersonnelList = [];
var currentEditClassId = null;
var currentModuleAdminUserId = null;
var currentEditServiceId = null;
var currentEditPersonnelId = null;
var tsGradeModal = null;
var tsDiscModal = null;
var _schoolInfoId = null;

// ==========================================
// Toast
// ==========================================
function showToast(icon, title, timer = 2000) {
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer }).fire({ icon, title });
}

// ==========================================
// ตรวจสอบสิทธิ์ — ใช้ฟังก์ชันกลางจาก dashboard_ui.js
// ==========================================
async function checkAuth() {
    const result = await checkSessionAndRole('super_admin', ['super_admin']);
    if (!result) return;

    const userInfo = result.personnel;
    if (userInfo) {
        setUserDisplayName(userInfo);
        updateUserRoleLabel(userInfo.role);
        renderUserAvatar(userInfo);
    }

    // Today chip
    const todayChip = document.getElementById('todayChip');
    if (todayChip) {
        todayChip.textContent = new Date().toLocaleDateString('th-TH', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
}

// ==========================================
// requireAdmin
// ==========================================
function requireAdmin() {
    if (typeof window.requireAdmin === 'function') {
        return window.requireAdmin('super_admin', true, 'เฉพาะ Super Admin เท่านั้นที่สามารถดำเนินการนี้ได้');
    }
    return true;
}

// ==========================================
// switchMenu — ปรับให้ใช้ class .active ของ dashboard.css
// ==========================================
function switchMenu(menuId) {
    // ปิด sidebar บน mobile
    if (window.innerWidth < 761) toggleSidebar(false);

    // ซ่อนทุกเมนู content
    ['menu-school', 'menu-personnel', 'menu-students', 'menu-student-portal', 'menu-calendar']
        .forEach(id => document.getElementById(id)?.classList.add('hidden'));

    // Reset active ของ sidebar buttons
    ['btn-menu-school', 'btn-menu-personnel', 'btn-menu-students', 'btn-menu-student-portal', 'btn-menu-calendar']
        .forEach(id => document.getElementById(id)?.classList.remove('active'));

    // แสดงเมนูที่เลือก
    document.getElementById(menuId)?.classList.remove('hidden');
    document.getElementById('btn-' + menuId)?.classList.add('active');

    // ชื่อหัวข้อใน topbar
    const titles = {
        'menu-school': 'ภาพรวมระบบ (Dashboard)',
        'menu-personnel': 'จัดการบุคลากรและข้าราชการครู',
        'menu-students': 'จัดการห้องเรียนและรายชื่อนักเรียน',
        'menu-student-portal': 'ตั้งค่าระบบสำหรับนักเรียน (Student Portal)',
        'menu-calendar': 'จัดการปฏิทินกิจกรรม'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[menuId] || menuId;

    // โหลดข้อมูลตามเมนู
    if (menuId === 'menu-school') {
        if (typeof loadSchoolInfo === 'function') loadSchoolInfo();
        if (typeof loadMicroServices === 'function') loadMicroServices();
    }
    if (menuId === 'menu-personnel') {
        if (typeof loadPersonnel === 'function') loadPersonnel();
    }
    if (menuId === 'menu-students') {
        if (typeof loadClassrooms === 'function') loadClassrooms();
    }
    if (menuId === 'menu-student-portal') {
        if (typeof loadStudentModules === 'function') loadStudentModules();
        if (typeof loadGasAvatarSettings === 'function') loadGasAvatarSettings();
    }
    if (menuId === 'menu-calendar') {
        if (typeof loadCalendarAdminUI === 'function') {
            loadCalendarAdminUI();
        } else {
            console.warn('loadCalendarAdminUI not found.');
        }
    }
}

// ==========================================
// อัปเดต badge นร. ไม่มีห้อง
// ==========================================
async function updateUnassignedBadge() {
    try {
        const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
        if (!sInfo) return;

        const { data: allStudents, error: allErr } = await db.from('core_students').select('id');
        if (allErr) throw allErr;

        const { data: enrolledData, error: enrErr } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms!inner(academic_year)')
            .eq('core_classrooms.academic_year', sInfo.current_academic_year);
        if (enrErr) throw enrErr;

        const enrolledIds = new Set((enrolledData || []).map(e => e.student_id));
        const unassignedCount = (allStudents || []).filter(s => !enrolledIds.has(s.id)).length;

        const badge = document.getElementById('unassigned_badge');
        if (!badge) return;
        if (unassignedCount > 0) {
            badge.textContent = unassignedCount;
            badge.classList.remove('hidden');
            badge.classList.add('inline-block');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('inline-block');
        }
    } catch (e) {
        console.warn("Badge error:", e);
    }
}

// ==========================================
// onload
// ==========================================
window.onload = async () => {
    await checkAuth();
    await updateUnassignedBadge();

    if (typeof applyVisibilityByRole === 'function') {
        applyVisibilityByRole('super_admin', true, { settingsBtn: 'admin-settings-btn' });
    }

    switchMenu('menu-school');
};
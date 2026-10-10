// ==========================================
// super_admin_core.js (เวอร์ชันปรับให้ใช้ dashboard_ui.js)
// ✅ FIX: ลบ requireAdmin() ที่ทับซ้อนกับ config.js
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
    if (!result) return false;

    const userInfo = result.personnel;
    if (userInfo) {
        setUserDisplayName(userInfo);
        updateUserRoleLabel(userInfo.role);
        renderUserAvatar(userInfo);
    }

    const todayChip = document.getElementById('todayChip');
    if (todayChip) {
        todayChip.textContent = new Date().toLocaleDateString('th-TH', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    return true;
}

window.onload = async () => {
    try {
        const ok = await checkAuth();
        if (!ok) {
            // unauthorized — redirect กำลังจะเกิด แสดงหน้าให้เห็นก่อน (กันขาว)
            document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
            return;
        }

        await updateUnassignedBadge();
        if (typeof applyVisibilityByRole === 'function') {
            applyVisibilityByRole('super_admin', true, { settingsBtn: 'admin-settings-btn' });
        }
        switchMenu('menu-school');
    } catch (err) {
        console.error('❌ super_admin init error:', err);
    } finally {
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    }
};

// ❌ ลบแล้ว: requireAdmin() ที่เคยทับซ้อนกับ config.js (ทำให้ infinite recursion)
//    ถ้าต้องการเรียกใช้ ให้เรียก window.requireAdmin(...) จาก config.js โดยตรง

// ==========================================
// switchMenu — ปรับให้รองรับเมนู sidebar
// ==========================================
function switchMenu(menuId) {
    if (window.innerWidth < 761) toggleSidebar(false);

    const allMenus = ['menu-school', 'menu-personnel', 'menu-students',
        'menu-student-portal', 'menu-calendar', 'menu-sidebar'];
    allMenus.forEach(id => document.getElementById(id)?.classList.add('hidden'));

    const allBtns = ['btn-menu-school', 'btn-menu-personnel', 'btn-menu-students',
        'btn-menu-student-portal', 'btn-menu-calendar', 'btn-menu-sidebar'];
    allBtns.forEach(id => document.getElementById(id)?.classList.remove('active'));

    document.getElementById(menuId)?.classList.remove('hidden');
    document.getElementById('btn-' + menuId)?.classList.add('active');

    const titles = {
        'menu-school': 'ภาพรวมระบบ (Dashboard)',
        'menu-personnel': 'จัดการบุคลากรและข้าราชการครู',
        'menu-students': 'จัดการห้องเรียนและรายชื่อนักเรียน',
        'menu-student-portal': 'ตั้งค่าระบบสำหรับนักเรียน (Student Portal)',
        'menu-calendar': 'จัดการปฏิทินกิจกรรม',
        'menu-sidebar': 'จัดการ Sidebar (เมนูนำทาง)'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[menuId] || menuId;

    if (menuId === 'menu-school') {
        if (typeof loadSchoolInfo === 'function') loadSchoolInfo();
        if (typeof loadMicroServices === 'function') loadMicroServices();
        if (typeof loadAcademicTerms === 'function') loadAcademicTerms();  // ✅ เพิ่ม
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
        if (typeof loadCalendarAdminUI === 'function') loadCalendarAdminUI();
    }
    if (menuId === 'menu-sidebar') {
        if (typeof loadSidebarProfiles === 'function') {
            loadSidebarProfiles();
        } else {
            console.error('❌ loadSidebarProfiles not found — ตรวจสอบว่าโหลด super_admin_sidebar.js แล้ว');
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
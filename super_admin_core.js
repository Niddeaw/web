// ==========================================
// super_admin_core.js
// ส่วนกลาง: การตรวจสอบสิทธิ์, utilities, theme, sidebar
// ==========================================

// ตัวแปร global ที่ใช้ร่วมกัน
var globalPersonnelList = [];
var currentEditClassId = null;
var currentModuleAdminUserId = null;
var currentEditServiceId = null;
var currentEditPersonnelId = null;
var isSidebarCollapsed = false;

// สำหรับ Tom Select ใน modal ต่างๆ (ใช้ใน personnel)
var tsGradeModal = null;
var tsDiscModal = null;
var _schoolInfoId = null;

// ==========================================
// Helper: แสดง Toast notification
// ==========================================
function showToast(icon, title, timer = 2000) {
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer }).fire({ icon, title });
}

// ==========================================
// ระบบตรวจสอบสิทธิ์
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        const { data: profile } = await db.from('core_personnel').select('role, first_name, last_name').eq('id', session.user.id).single();
        if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
            window.location.replace('index.html');
            return;
        }
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } else {
        window.location.replace('index.html');
    }
}

function logout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
        .then(async (result) => {
            if (result.isConfirmed) {
                await db.auth.signOut();
                window.location.replace('index.html');
            }
        });
}

// ==========================================
// ระบบจัดการเมนู (รองรับปฏิทินแล้ว)
// ==========================================
function switchMenu(menuId) {
    if (window.innerWidth < 768) closeMobileSidebar();
    // ซ่อนทุกเมนู
    document.getElementById('menu-school').classList.add('hidden');
    document.getElementById('menu-personnel').classList.add('hidden');
    document.getElementById('menu-students').classList.add('hidden');
    document.getElementById('menu-student-portal').classList.add('hidden');
    document.getElementById('menu-calendar')?.classList.add('hidden');   // ✅ เพิ่มบรรทัดนี้

    // เปลี่ยนสถานะปุ่มเมนู
    const btns = ['btn-menu-school', 'btn-menu-personnel', 'btn-menu-students', 'btn-menu-student-portal', 'btn-menu-calendar'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 font-medium transition-all";
    });

    // แสดงเมนูที่เลือก และเปลี่ยนปุ่มให้ active
    document.getElementById(menuId).classList.remove('hidden');
    const activeBtn = document.getElementById('btn-' + menuId);
    if (activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold transition-all";

    // ตั้งชื่อหัวข้อ
    const titles = {
        'menu-school': '<i class="fa-solid fa-gear text-gray-500 mr-2"></i>ข้อมูลโรงเรียนและการตั้งค่าระบบ',
        'menu-personnel': '<i class="fa-solid fa-address-book text-gray-500 mr-2"></i>จัดการบุคลากรและข้าราชการครู',
        'menu-students': '<i class="fa-solid fa-users-rectangle text-gray-500 mr-2"></i>จัดการห้องเรียนและรายชื่อนักเรียน',
        'menu-student-portal': '<i class="fa-solid fa-graduation-cap text-gray-500 mr-2"></i>ตั้งค่าระบบสำหรับนักเรียน (Student Portal)',
        'menu-calendar': '<i class="fa-regular fa-calendar-days mr-2"></i>จัดการปฏิทินกิจกรรม'
    };
    document.getElementById('pageTitle').innerHTML = titles[menuId];

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
        if (typeof loadCalendarAdminUI === 'function') loadCalendarAdminUI();
    }
}

// ==========================================
// ระบบจัดการ Sidebar (ย่อ-ขยาย + Mobile Drawer)
// ==========================================
function toggleSidebar() {
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const isOpen = sidebar.classList.contains('mobile-sidebar-open');

        if (isOpen) {
            closeMobileSidebar();
        } else {
            sidebar.classList.add('mobile-sidebar-open');
            overlay.classList.remove('hidden');
            document.querySelectorAll('.sidebar-text').forEach(t => t.classList.remove('hidden'));
        }
    } else {
        // Desktop: ย่อ/ขยาย
        const sidebar = document.getElementById('sidebar');
        const texts = document.querySelectorAll('.sidebar-text');
        isSidebarCollapsed = !isSidebarCollapsed;
        if (isSidebarCollapsed) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-20');
            texts.forEach(t => t.classList.add('hidden'));
        } else {
            sidebar.classList.remove('w-20');
            sidebar.classList.add('w-64');
            texts.forEach(t => t.classList.remove('hidden'));
        }
    }
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-sidebar-open');
    document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ==========================================
// Helper: Escape HTML
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==========================================
// อัปเดต badge นักเรียนไม่มีห้อง
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
// เริ่มต้นเมื่อโหลดหน้า
// ==========================================
window.onload = async () => {
    await checkAuth();
    await updateUnassignedBadge();
    // โหลดข้อมูลภาพรวมระบบ (เมนูแรก)
    switchMenu('menu-school');
};
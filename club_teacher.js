// ==========================================
// System Module: Club Management (Unified Teacher/Admin)
// ==========================================
const MODULE_ID = 'club_system';

let currentUser = null;
let userRole = 'teacher';
let isModuleAdmin = false;
let currentMode = 'teacher'; // 'teacher' | 'admin'

let currentSchoolInfo = null;
let myClubInfo = null;
let teacherApplicantsData = [];
let allClubsData = [];
let allStudentsReportData = [];
let allTeachers = [];
let allCategories = [];
let categoryMap = {};

// ✅ [FIX #2] Map สำหรับเก็บข้อความนักเรียนอย่างปลอดภัย แทนการฝังใน onclick
const studentMessageStore = {};

document.addEventListener('DOMContentLoaded', async () => {
    await initSystem();
});

// ==========================================
// 1. Initialization & RBAC
// ==========================================
async function initSystem() {
    Swal.fire({ title: 'ตรวจสอบข้อมูลส่วนกลาง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: { session }, error: sessionErr } = await db.auth.getSession();
        if (sessionErr || !session) throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน');

        const userId = session.user.id;
        const { data: profile, error: profileErr } = await db.from('core_personnel').select('*').eq('id', userId).single();
        if (profileErr || !profile) throw new Error('ไม่พบข้อมูลบุคลากรในระบบ');

        currentUser = profile;
        userRole = profile.role;
        $('#user-display').text(`${profile.prefix || ''}${profile.first_name} ${profile.last_name}`);

        if (userRole === 'super_admin') {
            isModuleAdmin = true;
        } else {
            const { data: moduleAuth } = await db.from('core_module_admins').select('id').eq('user_id', userId).eq('module_id', MODULE_ID).maybeSingle();
            if (moduleAuth) isModuleAdmin = true;
        }

        if (isModuleAdmin) {
            document.getElementById('btnAdminMode').classList.remove('hidden');
            document.getElementById('admin-settings-btn').classList.remove('hidden');
            document.getElementById('btnAdminMode').classList.add('flex');
            document.getElementById('admin-settings-btn').classList.add('flex');
            await loadAllTeachers();
        }

        await fetchSchoolInfo();
        await loadCategories();
        await loadMyClub();

        Swal.close();
    } catch (err) {
        Swal.fire('Error', err.message, 'error').then(() => window.location.href = 'index.html');
    }
}

async function fetchSchoolInfo() {
    const { data, error } = await db.from('core_school_info').select('current_academic_year, current_semester').eq('id', 1).single();
    if (error) throw new Error('ดึงข้อมูลปีการศึกษาล้มเหลว');
    currentSchoolInfo = data;
    $('#term-info').text(`ปีการศึกษา ${data.current_academic_year} / เทอม ${data.current_semester}`);
}

async function loadCategories() {
    const { data } = await db.from('club_categories').select('*').order('name');
    allCategories = data || [];
}

async function loadAllTeachers() {
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name, department, avatar_url').order('first_name');
    allTeachers = data || [];
}

// ==========================================
// 2. Role Switcher
// ==========================================
window.toggleRoleView = () => {
    const teacherView = document.getElementById('teacher-view');
    const adminView = document.getElementById('admin-view');
    const btnIcon = document.getElementById('mode-icon');
    const btnText = document.getElementById('mode-text');
    const btnToggle = document.getElementById('btnAdminMode');

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    if (currentMode === 'teacher') {
        currentMode = 'admin';
        teacherView.classList.replace('block', 'hidden');
        adminView.classList.replace('hidden', 'block');
        btnIcon.className = 'fa-solid fa-chalkboard-user sm:mr-1';
        btnText.innerText = 'โหมดครูผู้สอน';
        btnToggle.classList.replace('bg-purple-50', 'bg-blue-50');
        btnToggle.classList.replace('text-purple-600', 'text-blue-600');
        btnToggle.classList.replace('border-purple-200', 'border-blue-200');
        loadAdminClubs();
        Toast.fire({ icon: 'success', title: 'สลับเป็นโหมด ผู้ดูแลระบบ' });
    } else {
        currentMode = 'teacher';
        adminView.classList.replace('block', 'hidden');
        teacherView.classList.replace('hidden', 'block');
        btnIcon.className = 'fa-solid fa-user-shield sm:mr-1';
        btnText.innerText = 'โหมดแอดมิน';
        btnToggle.classList.replace('bg-blue-50', 'bg-purple-50');
        btnToggle.classList.replace('text-blue-600', 'text-purple-600');
        btnToggle.classList.replace('border-blue-200', 'border-purple-200');
        loadMyClub();
        Toast.fire({ icon: 'success', title: 'สลับเป็นโหมด ครูผู้สอน' });
    }
};

// ==========================================
// Admin Tab Switcher
// ==========================================
window.switchAdminTab = (tabId) => {
    document.getElementById('admin-tab-clubs').classList.replace('block', 'hidden');
    document.getElementById('admin-tab-students').classList.replace('block', 'hidden');
    document.getElementById('btn-admin-tab-clubs').className = "px-5 py-2.5 rounded-t-xl bg-transparent text-slate-500 hover:bg-slate-200 font-bold transition-colors";
    document.getElementById('btn-admin-tab-students').className = "px-5 py-2.5 rounded-t-xl bg-transparent text-slate-500 hover:bg-slate-200 font-bold transition-colors";
    document.getElementById(tabId).classList.replace('hidden', 'block');
    document.getElementById(`btn-${tabId}`).className = "px-5 py-2.5 rounded-t-xl bg-purple-600 text-white font-bold transition-colors shadow-sm";
    if (tabId === 'admin-tab-students') loadAllStudentsReport();
};

// ==========================================
// 3. Teacher Module
// ==========================================
async function loadMyClub() {
    const { data: club } = await db.from('club_lists')
        .select(`*, club_categories(name)`)
        .eq('teacher_id', currentUser.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .maybeSingle();

    if (club) {
        myClubInfo = club;
        document.getElementById('no-club-display').classList.add('hidden');
        document.getElementById('my-club-display').classList.remove('hidden');
        $('#my-club-name').text(club.club_name);
        $('#my-club-category').text(club.club_categories?.name || '-');
        $('#max-capacity').text(club.max_capacity);

        const btnLock = document.getElementById('btn-lock-club');
        btnLock.classList.remove('hidden');

        if (club.is_locked) {
            btnLock.className = "px-4 py-2 rounded-lg font-bold shadow-md transition-colors bg-slate-500 text-white hover:bg-slate-600";
            btnLock.innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i> ปลดล็อคชุมนุม';
            btnLock.onclick = unlockMyClub;
        } else {
            btnLock.className = "px-4 py-2 rounded-lg font-bold shadow-md transition-colors bg-emerald-600 text-white hover:bg-emerald-700";
            btnLock.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> ยืนยันปิดรับสมัคร';
            btnLock.onclick = lockClub;
        }

        await loadTeacherApplicants();
    } else {
        myClubInfo = null;
        document.getElementById('no-club-display').classList.remove('hidden');
        document.getElementById('my-club-display').classList.add('hidden');
        document.getElementById('btn-lock-club').classList.add('hidden');
        if ($.fn.DataTable.isDataTable('#teacherStudentsTable')) {
            $('#teacherStudentsTable').DataTable().destroy();
        }
    }
}

// ✅ [FIX #1] เพิ่ม await loadMyClub() ก่อนแสดง Toast ทั้งสองฟังก์ชัน
window.lockClub = async () => {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันปิดรับสมัคร?',
        html: '<span class="text-red-500 text-sm">นักเรียนที่สถานะค้างอยู่ (รอพิจารณา) จะถูกปรับเป็น "ไม่อนุมัติ" อัตโนมัติ</span>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
        await db.from('club_registrations')
            .update({ status: 'rejected', rejection_reason: 'ปิดรับสมัคร' })
            .eq('club_id', myClubInfo.id)
            .eq('status', 'pending');
        await db.from('club_lists').update({ is_locked: true }).eq('id', myClubInfo.id);
        await loadMyClub(); // ✅ รอให้ข้อมูลรีเฟรชก่อน
        Swal.fire({ icon: 'success', title: 'ล็อคชุมนุมเรียบร้อย', timer: 1500, showConfirmButton: false });
    }
};

window.unlockMyClub = async () => {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันปลดล็อค?',
        text: 'การปลดล็อคจะทำให้นักเรียนกลับมาเลือกชุมนุมนี้ได้อีกครั้ง (นักเรียนที่ถูกปฏิเสธไปแล้วจะต้องกดสมัครเข้ามาใหม่)',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังปลดล็อค...', didOpen: () => Swal.showLoading() });
        await db.from('club_lists').update({ is_locked: false }).eq('id', myClubInfo.id);
        await loadMyClub(); // ✅ รอให้ข้อมูลรีเฟรชก่อน
        Swal.fire({ icon: 'success', title: 'ปลดล็อคชุมนุมเรียบร้อย', timer: 1500, showConfirmButton: false });
    }
};

// ✅ [FIX #4] เพิ่ม filter academic_year / semester ใน loadTeacherApplicants
// ✅ [FIX #2] เก็บข้อความลง studentMessageStore แทนการฝังใน onclick
async function loadTeacherApplicants() {
    if (!myClubInfo) return;

    const { data: members, error } = await db.from('club_registrations')
        .select(`
            id, status, is_confirmed, rejection_reason, student_message,
            core_students(
                student_id_card, prefix, first_name, last_name,
                student_enrollments(
                    student_number,
                    core_classrooms(grade_level, room_number, academic_year, semester)
                )
            )
        `)
        .eq('club_id', myClubInfo.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)  // ✅ เพิ่ม
        .eq('semester', currentSchoolInfo.current_semester);            // ✅ เพิ่ม

    if (error) return;

    // ✅ ล้าง store เก่าก่อนทุกครั้ง
    Object.keys(studentMessageStore).forEach(k => delete studentMessageStore[k]);

    teacherApplicantsData = members.map(m => {
        const stu = m.core_students;
        const currentEnr = stu.student_enrollments?.find(e =>
            e.core_classrooms.academic_year === currentSchoolInfo.current_academic_year &&
            e.core_classrooms.semester === currentSchoolInfo.current_semester
        );

        // ✅ เก็บข้อความลง Map โดยใช้ registration id เป็น key
        if (m.student_message) {
            studentMessageStore[m.id] = {
                msg: m.student_message,
                name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`
            };
        }

        return {
            id: m.id,
            stu_id: stu.student_id_card,
            full_name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`,
            classroom: currentEnr ? `ม.${currentEnr.core_classrooms.grade_level}/${currentEnr.core_classrooms.room_number}` : 'ไม่ระบุ',
            grade: currentEnr ? parseInt(currentEnr.core_classrooms.grade_level) : 99,
            room: currentEnr ? parseInt(currentEnr.core_classrooms.room_number) : 99,
            number: currentEnr ? parseInt(currentEnr.student_number) : 999,
            number_text: currentEnr?.student_number || '-',
            status: m.status,
            reason: m.rejection_reason,
            message: m.student_message
        };
    });

    teacherApplicantsData.sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        if (a.room !== b.room) return a.room - b.room;
        return a.number - b.number;
    });

    $('#enrolled-count').text(teacherApplicantsData.filter(m => m.status !== 'rejected').length);

    if ($.fn.DataTable.isDataTable('#teacherStudentsTable')) {
        $('#teacherStudentsTable').DataTable().destroy();
    }

    document.getElementById('tb-teacher-students').innerHTML = teacherApplicantsData.map(m => {
        let stBadge = m.status === 'approved'
            ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติ</span>'
            : (m.status === 'rejected'
                ? `<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700" title="${m.reason || ''}">ไม่อนุมัติ</span>`
                : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-700">รอพิจารณา</span>');

        let actionButtons = [];

        // ✅ [FIX #2] ใช้ data attribute แทน onclick inline — ปลอดภัยจาก XSS และอักขระพิเศษ
        if (m.message) {
            actionButtons.push(
                `<button data-msg-id="${m.id}"
                         class="msg-btn bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white px-2 py-1 rounded shadow-sm mr-1 border border-indigo-100"
                         title="อ่านข้อความจากนักเรียน">
                    <i class="fa-solid fa-envelope"></i>
                 </button>`
            );
        }

        if (!myClubInfo.is_locked && m.status === 'pending') {
            actionButtons.push(
                `<button data-action="approve" data-id="${m.id}"
                         class="action-btn bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-2 py-1 rounded shadow-sm mr-1">
                    <i class="fa-solid fa-check"></i> รับ
                 </button>`,
                `<button data-action="reject" data-id="${m.id}"
                         class="action-btn bg-red-50 text-red-600 hover:bg-red-500 hover:text-white px-2 py-1 rounded shadow-sm">
                    <i class="fa-solid fa-times"></i> ปฏิเสธ
                 </button>`
            );
        } else if (!myClubInfo.is_locked && m.status === 'approved') {
            actionButtons.push(
                `<button data-action="pending" data-id="${m.id}"
                         class="action-btn text-xs text-amber-600 underline hover:text-amber-800 ml-1">
                    ยกเลิกการรับ
                 </button>`
            );
        }

        const acts = actionButtons.length > 0 ? actionButtons.join('') : '-';
        const classDisplay = m.classroom !== 'ไม่ระบุ' ? `${m.classroom} (เลขที่ ${m.number_text})` : 'ไม่ระบุ';

        return `<tr class="hover:bg-blue-50/50">
            <td class="py-3 px-4 font-mono text-blue-700">${m.stu_id}</td>
            <td class="py-3 px-4">${m.full_name}</td>
            <td class="py-3 px-4">${classDisplay}</td>
            <td class="py-3 px-4 text-center">${stBadge}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap">${acts}</td>
        </tr>`;
    }).join('');

    // ✅ [FIX #2] Bind event ด้วย jQuery หลัง render ตาราง — ปลอดภัยและไม่ต้องกังวลอักขระพิเศษ
    $('#tb-teacher-students')
        .off('click', '.msg-btn')
        .on('click', '.msg-btn', function () {
            const entry = studentMessageStore[$(this).data('msg-id')];
            if (entry) viewStudentMessage(entry.msg, entry.name);
        });

    $('#tb-teacher-students')
        .off('click', '.action-btn')
        .on('click', '.action-btn', function () {
            const action = $(this).data('action');
            const id = $(this).data('id');
            if (action === 'approve') updateStatus(id, 'approved');
            else if (action === 'pending') updateStatus(id, 'pending');
            else if (action === 'reject') promptReject(id);
        });

    $('#teacherStudentsTable').DataTable({
        responsive: true,
        scrollX: true,
        order: [],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

// ✅ [FIX #2] viewStudentMessage — escape HTML อย่างปลอดภัย, ใช้ whitespace-pre-wrap แทน <br>
window.viewStudentMessage = (msg, studentName) => {
    const safeMsg = $('<div>').text(msg).html();       // escape ทุกอักขระอันตราย
    const safeName = $('<div>').text(studentName).html();
    Swal.fire({
        title: 'จดหมายถึงคุณครู 💌',
        html: `
            <div class="text-sm text-slate-500 mb-2">จาก: <b>${safeName}</b></div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 text-sm text-left leading-relaxed shadow-inner whitespace-pre-wrap">${safeMsg}</div>
        `,
        icon: 'info',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
};

// ✅ [FIX #3] updateStatus — ตรวจโควตาจาก DB โดยตรง ไม่ใช้ local array ที่อาจ stale
window.updateStatus = async (id, status, reason = null) => {
    if (status === 'approved') {
        // ✅ นับจาก DB จริง ไม่ใช่ local array
        const { count, error: countErr } = await db
            .from('club_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', myClubInfo.id)
            .eq('status', 'approved');

        if (!countErr && count >= myClubInfo.max_capacity) {
            return Swal.fire({
                title: 'โควตาเต็มแล้ว!',
                html: `ชุมนุมนี้อนุมัตินักเรียนครบ <b>${myClubInfo.max_capacity}</b> คนตามเป้าแล้ว<br><br>
                       <span class="text-sm text-red-500">* หากต้องการรับนักเรียนคนนี้ กรุณากด "ยกเลิกการรับ" คนเก่าออกก่อนครับ</span>`,
                icon: 'error',
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'ตกลง'
            });
        }
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    const payload = { status };
    if (status === 'approved') {
        payload.rejection_reason = null; // ✅ เคลียร์เหตุผลปฏิเสธเดิมออก
    } else if (reason) {
        payload.rejection_reason = reason;
    }

    await db.from('club_registrations').update(payload).eq('id', id);
    await loadTeacherApplicants();
    Swal.close();
};

window.promptReject = async (id) => {
    const { value: reason } = await Swal.fire({
        title: 'ปฏิเสธนักเรียน',
        input: 'text',
        inputPlaceholder: 'ระบุเหตุผล (เช่น เต็ม, เกรดไม่ถึง)',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ปฏิเสธ',
        inputValidator: (v) => !v && 'กรุณาระบุเหตุผล'
    });
    if (reason) updateStatus(id, 'rejected', reason);
};

// ✅ [FIX #7] เพิ่มคอลัมน์ student_message ในการ export
window.exportTeacherExcel = () => {
    if (teacherApplicantsData.length === 0) {
        return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ Export', 'info');
    }
    const ws = XLSX.utils.json_to_sheet(teacherApplicantsData.map(m => ({
        'รหัสนักเรียน': m.stu_id,
        'ชื่อ-สกุล': m.full_name,
        'ชั้นเรียน': m.classroom,
        'สถานะ': m.status === 'approved' ? 'อนุมัติ' : (m.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอ'),
        'หมายเหตุการปฏิเสธ': m.reason || '',
        'ข้อความจากนักเรียน': m.message || '' // ✅ เพิ่มคอลัมน์นี้
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายชื่อชุมนุม_${myClubInfo.club_name}.xlsx`);
};

// ==========================================
// 4. Admin Module
// ==========================================

// ✅ [FIX #5] ลบ loadAdminClubs ตัวแรก (ซ้ำและไม่สมบูรณ์) เหลือเพียงตัวเดียวด้านล่าง

// 🌟 1. ฟังก์ชันดูรายชื่อนักเรียน (ปรับปรุงเพิ่มระบบ Checkbox สำหรับ Super Admin)
window.viewClubStudents = async (clubId, clubName) => {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: members, error } = await db.from('club_registrations')
            .select(`
                id, status, rejection_reason,
                core_students!inner(
                    student_id_card, prefix, first_name, last_name,
                    student_enrollments(
                        core_classrooms!inner(grade_level, room_number, academic_year, semester)
                    )
                )
            `)
            .eq('club_id', clubId);

        if (error) throw error;

        if (!members || members.length === 0) {
            Swal.fire({ icon: 'info', title: `ชุมนุม : ${clubName}`, text: 'ยังไม่มีนักเรียนสมัคร', confirmButtonText: 'ปิด' });
            return;
        }

        // 🌟 ตรวจสอบสิทธิ์ว่าเป็น Super Admin หรือไม่
        const isSuperAdmin = userRole === 'super_admin';

        const rows = members.map(m => {
            const stu = m.core_students;
            const currentEnr = stu.student_enrollments?.find(e =>
                e.core_classrooms &&
                e.core_classrooms.academic_year === currentSchoolInfo.current_academic_year &&
                e.core_classrooms.semester === currentSchoolInfo.current_semester
            );
            const classroom = currentEnr ? `ม.${currentEnr.core_classrooms.grade_level}/${currentEnr.core_classrooms.room_number}` : 'ไม่ระบุ';
            const statusText = m.status === 'approved' ? 'อนุมัติ' : m.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอตรวจ';
            const statusColor = m.status === 'approved' ? 'text-green-600' : m.status === 'rejected' ? 'text-red-600' : 'text-yellow-600';
            
            return {
                reg_id: m.id, // เก็บ ID การสมัครไว้ใช้ตอนลบ
                id_card: stu.student_id_card,
                full_name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`,
                classroom,
                status: statusText,
                statusColor,
                raw_status: m.status // ค่าสถานะดิบ
            };
        });

        let html = `
        <div class="text-left">
            <p class="font-bold mb-2 text-lg">📋 นักเรียนในชุมนุม <span class="text-purple-600">${clubName}</span> (${rows.length} คน)</p>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="w-full text-sm border-collapse" id="admin-club-students-table">
                    <thead class="bg-gray-100 sticky top-0 shadow-sm z-10">
                        <tr>
                            ${isSuperAdmin ? `<th class="py-2 px-3 border-b text-center w-12"><input type="checkbox" title="เลือก/ยกเลิกทั้งหมด" onclick="toggleAllRejected(this)" class="w-4 h-4 cursor-pointer accent-red-500"></th>` : ''}
                            <th class="py-2 px-3 border-b text-left">เลขประจำตัว</th>
                            <th class="py-2 px-3 border-b text-left">ชื่อ-สกุล</th>
                            <th class="py-2 px-3 border-b text-left">ชั้น</th>
                            <th class="py-2 px-3 border-b text-left">สถานะของครู</th>
                        </tr>
                    </thead>
                    <tbody>`;

        rows.forEach(r => {
            html += `
                <tr class="border-t hover:bg-gray-50">
                    ${isSuperAdmin ? `
                        <td class="py-2 px-3 text-center border-r border-slate-100 bg-slate-50/50">
                            ${r.raw_status === 'rejected' ? `<input type="checkbox" class="reject-checkbox w-4 h-4 cursor-pointer accent-red-600" value="${r.reg_id}">` : `<span class="text-slate-300">-</span>`}
                        </td>
                    ` : ''}
                    <td class="py-2 px-3 font-mono text-gray-700">${r.id_card}</td>
                    <td class="py-2 px-3 font-medium">${r.full_name}</td>
                    <td class="py-2 px-3">${r.classroom}</td>
                    <td class="py-2 px-3 font-bold ${r.statusColor}">${r.status}</td>
                </tr>`;
        });

        html += `</tbody></table></div>`;

        // 🌟 แทรกปุ่ม "ล้างสถานะ" (แสดงเฉพาะ Super Admin)
        if (isSuperAdmin) {
            html += `
            <div class="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
                <div class="text-xs text-red-600">
                    <b>โหมด Super Admin:</b><br>ติ๊กเลือกนักเรียนที่ "ไม่อนุมัติ" เพื่อล้างค่าให้กลับไปเลือกชุมนุมใหม่ได้
                </div>
                <button onclick="clearSelectedRejections('${clubId}', '${clubName}')" class="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-sm whitespace-nowrap ml-2">
                    <i class="fa-solid fa-eraser mr-1"></i> ล้างสถานะที่เลือก
                </button>
            </div>
            `;
        }

        html += `</div>`;

        Swal.fire({ title: 'รายชื่อนักเรียน', html: html, width: '850px', confirmButtonText: 'ปิด', customClass: { popup: 'text-sm rounded-xl' } });
    } catch (err) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    }
};

// 🌟 2. ฟังก์ชันช่วย: กดเลือก/ยกเลิกเลือกทั้งหมด
window.toggleAllRejected = (source) => {
    const checkboxes = document.querySelectorAll('.reject-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
};

// 🌟 3. ฟังก์ชันประมวลผลการล้างสถานะที่เลือก
window.clearSelectedRejections = async (clubId, clubName) => {
    // กวาดหา Checkbox ที่ถูกติ๊กเลือกไว้
    const selectedIds = Array.from(document.querySelectorAll('.reject-checkbox:checked')).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
        return Swal.fire({ icon: 'warning', title: 'ยังไม่ได้เลือกนักเรียน', text: 'กรุณาติ๊กหน้ารายชื่อนักเรียนที่ต้องการล้างสถานะก่อนครับ' });
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการล้างสถานะ?',
        html: `ระบบจะลบประวัติ "ไม่อนุมัติ" จำนวน <b>${selectedIds.length}</b> รายการ<br><br><span class="text-sm text-red-600 font-bold">*นักเรียนกลุ่มนี้จะเหมือนยังไม่เคยสมัคร และสามารถไปกดเลือกชุมนุมอื่นใหม่ได้ทันที</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยันล้างสถานะ',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
        
        try {
            // สั่งลบข้อมูลออกจากตาราง club_registrations ด้วย .in()
            const { error } = await db.from('club_registrations').delete().in('id', selectedIds);
            if (error) throw error;
            
            Swal.fire({ icon: 'success', title: 'ล้างสถานะสำเร็จ', timer: 1500, showConfirmButton: false });
            
            // รีเฟรชตารางของแอดมิน เพื่ออัปเดตยอดคงเหลือ
            await loadAdminClubs();
            
            // เปิดหน้าต่าง Modal เดิมขึ้นมาใหม่เพื่อดูผลลัพธ์ (หน่วงเวลาเล็กน้อยให้ Swal เก่าปิดเสร็จก่อน)
            setTimeout(() => {
                viewClubStudents(clubId, clubName);
            }, 1500);

        } catch (error) {
            console.error("Error clearing status:", error);
            Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        }
    }
};

window.toggleLockAdminClub = async (id, isCurrentlyLocked, name) => {
    const actionText = isCurrentlyLocked ? 'ปลดล็อค' : 'ล็อค';
    const { isConfirmed } = await Swal.fire({
        title: `ยืนยันการ${actionText}?`,
        text: `คุณต้องการ${actionText}ชุมนุม ${name} ใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: isCurrentlyLocked ? '#f59e0b' : '#10b981',
        confirmButtonText: `ยืนยัน${actionText}`
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
        if (!isCurrentlyLocked) {
            await db.from('club_registrations')
                .update({ status: 'rejected', rejection_reason: 'แอดมินปิดรับสมัคร' })
                .eq('club_id', id)
                .eq('status', 'pending');
        }
        await db.from('club_lists').update({ is_locked: !isCurrentlyLocked }).eq('id', id);
        await loadAdminClubs();
        Swal.fire('สำเร็จ', `${actionText}ชุมนุมเรียบร้อยแล้ว`, 'success');
    }
};

// ✅ [FIX #6] ลบ getDisplayAvatar ออก เพราะไม่ถูกใช้งานจริง ใช้ getDirectImageUrl แทนทั้งหมด

function getDirectImageUrl(url) {
    if (!url) return null;
    if (url.includes('drive.google.com')) {
        const match = url.match(/id=([^&]+)/) || url.match(/\/d\/([^\/]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/uc?export=view&id=${match[1]}`;
        }
    }
    return url;
}

// ✅ viewTeacherImage — convert URL ภายในเสมอ ป้องกัน raw Google Drive URL
window.viewTeacherImage = (url, name) => {
    if (!url) return;
    const directUrl = getDirectImageUrl(url);
    Swal.fire({
        title: name || 'ครูที่ปรึกษา',
        imageUrl: directUrl,
        imageAlt: 'Teacher Profile',
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0d9488',
        customClass: { image: 'rounded-2xl object-cover max-h-[60vh] shadow-lg border-4 border-white' }
    });
};

function updateTeacherAvatarPreview(teacherId) {
    const container = document.getElementById('teacher-avatar-preview-container');
    const img = document.getElementById('teacher-avatar-img');
    const urlInput = document.getElementById('ac_teacher_avatar_url');
    if (!teacherId || !container) return;

    const teacher = allTeachers.find(t => t.id === teacherId);
    if (teacher) {
        container.style.display = 'block';
        if (urlInput) urlInput.value = teacher.avatar_url || '';
        if (teacher.avatar_url) {
            img.src = getDirectImageUrl(teacher.avatar_url);
            img.style.display = 'block';
        } else {
            img.src = '';
            img.style.display = 'none';
        }
    } else {
        container.style.display = 'none';
    }
}

window.refreshTeacherAvatar = async () => {
    const teacherId = document.getElementById('ac_teacher').value;
    if (!teacherId) {
        Swal.fire({ icon: 'info', title: 'กรุณาเลือกครูก่อน', timer: 1500, showConfirmButton: false });
        return;
    }
    const { data, error } = await db.from('core_personnel').select('avatar_url').eq('id', teacherId).single();
    if (error) {
        Swal.fire('Error', 'ไม่สามารถดึงข้อมูลครู', 'error');
        return;
    }
    const urlInput = document.getElementById('ac_teacher_avatar_url');
    if (urlInput) urlInput.value = data.avatar_url || '';
    const img = document.getElementById('teacher-avatar-img');
    if (data.avatar_url) {
        img.src = getDirectImageUrl(data.avatar_url);
        img.style.display = 'block';
    } else {
        img.src = '';
        img.style.display = 'none';
    }
    const teacher = allTeachers.find(t => t.id === teacherId);
    if (teacher) teacher.avatar_url = data.avatar_url;
    Swal.fire({ icon: 'success', title: 'ดึงข้อมูลรูปครูสำเร็จ', timer: 1000, showConfirmButton: false });
};

window.clearTeacherAvatar = () => {
    const urlInput = document.getElementById('ac_teacher_avatar_url');
    if (urlInput) urlInput.value = '';
    const img = document.getElementById('teacher-avatar-img');
    if (img) { img.src = ''; img.style.display = 'none'; }
};

function initAdminTomSelect() {
    const tsEl = document.getElementById('ac_teacher');
    if (tsEl.tomselect) tsEl.tomselect.destroy();
    tsEl.innerHTML = '<option value="">-- ค้นหาชื่อครู... --</option>' +
        allTeachers.map(t => `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}</option>`).join('');
    const teacherTS = new TomSelect(tsEl, { placeholder: 'ค้นหาชื่อครู...', allowEmptyOption: true });
    teacherTS.on('change', (value) => { updateTeacherAvatarPreview(value); });

    const tsCat = document.getElementById('ac_category');
    if (tsCat.tomselect) tsCat.tomselect.destroy();

    categoryMap = {};
    let catOptions = [];
    allCategories.forEach(c => {
        categoryMap[c.name] = c.id;
        catOptions.push({ value: c.name, text: c.name });
    });

    new TomSelect(tsCat, {
        options: catOptions,
        create: true,
        valueField: 'value',
        labelField: 'text',
        searchField: 'text',
        placeholder: 'เลือก หรือ พิมพ์หมวดหมู่ใหม่ที่นี่...',
        render: {
            option_create: (data, escape) =>
                `<div class="create text-blue-600 font-bold p-2 bg-blue-50">
                    <i class="fa-solid fa-plus-circle mr-1"></i> เพิ่มหมวดหมู่: <strong>${escape(data.input)}</strong>&hellip;
                 </div>`
        }
    });
}

window.openAdminClubModal = () => {
    document.getElementById('adminClubForm').reset();
    document.getElementById('ac_id').value = '';
    document.getElementById('ac_capacity').value = 20;
    initAdminTomSelect();
    updateTeacherAvatarPreview('');
    document.getElementById('adminClubModal').classList.remove('hidden');
    document.getElementById('adminClubModal').classList.add('flex');
};

window.editAdminClub = (id, name, catName, tId, grades, cap, loc, desc) => {
    document.getElementById('ac_id').value = id;
    document.getElementById('ac_name').value = name;
    document.getElementById('ac_capacity').value = cap;
    document.getElementById('ac_location').value = loc;
    document.getElementById('ac_desc').value = desc;
    initAdminTomSelect();
    document.getElementById('ac_category').tomselect.setValue(catName);
    document.getElementById('ac_teacher').tomselect.setValue(tId);
    const gradesSelect = document.getElementById('ac_grades');
    if (gradesSelect) gradesSelect.value = grades;
    updateTeacherAvatarPreview(tId);
    document.getElementById('adminClubModal').classList.remove('hidden');
    document.getElementById('adminClubModal').classList.add('flex');
};

window.closeAdminClubModal = () => {
    document.getElementById('adminClubModal').classList.add('hidden');
    document.getElementById('adminClubModal').classList.remove('flex');
};

window.saveClubByAdmin = async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    let catName = document.getElementById('ac_category').value.trim();
    let catId = categoryMap[catName];

    if (!catId && catName) {
        const { data: newCat, error: catErr } = await db.from('club_categories').insert([{ name: catName }]).select().single();
        if (catErr) return Swal.fire('Error', 'สร้างหมวดหมู่ใหม่ล้มเหลว', 'error');
        catId = newCat.id;
        categoryMap[catName] = catId;
        allCategories.push(newCat);
    }

    const payload = {
        club_name: document.getElementById('ac_name').value.trim(),
        category_id: catId,
        teacher_id: document.getElementById('ac_teacher').value,
        target_grades: document.getElementById('ac_grades').value.trim(),
        location: document.getElementById('ac_location').value.trim(),
        max_capacity: parseInt(document.getElementById('ac_capacity').value),
        description: document.getElementById('ac_desc').value.trim(),
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester
    };

    if (!payload.teacher_id) return Swal.fire('เตือน', 'กรุณาเลือกครู', 'warning');
    if (!payload.target_grades) return Swal.fire('เตือน', 'กรุณาเลือกระดับชั้น', 'warning');

    const urlInput = document.getElementById('ac_teacher_avatar_url');
    if (urlInput) {
        const avatarUrl = urlInput.value.trim();
        if (avatarUrl) {
            await db.from('core_personnel').update({ avatar_url: avatarUrl }).eq('id', payload.teacher_id);
        }
    }

    const id = document.getElementById('ac_id').value;
    const query = id
        ? db.from('club_lists').update(payload).eq('id', id)
        : db.from('club_lists').insert([payload]);
    const { error } = await query;

    if (error) {
        if (error.code === '23505') Swal.fire('ข้อผิดพลาด', 'ครูท่านนี้เปิดชุมนุมในเทอมนี้ไปแล้ว', 'error');
        else Swal.fire('Error', error.message, 'error');
    } else {
        closeAdminClubModal();
        await loadAdminClubs();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    }
};

window.deleteAdminClub = async (id, name) => {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        html: `ลบ <b>${name}</b> ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        await db.from('club_lists').delete().eq('id', id);
        await loadAdminClubs();
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
    }
};

// ==========================================
// Admin: Students Tracker
// ==========================================
// --- Admin: Students Tracker (All School) ---
async function loadAllStudentsReport() {
    Swal.fire({ title: 'กำลังดึงข้อมูลทั้งโรงเรียน...', didOpen: () => Swal.showLoading() });
    try {
        const { data: enrolls } = await db.from('student_enrollments')
            .select(`student_id, student_number, core_classrooms!inner(grade_level, room_number), core_students(student_id_card, prefix, first_name, last_name)`)
            .eq('core_classrooms.academic_year', currentSchoolInfo.current_academic_year)
            .eq('core_classrooms.semester', currentSchoolInfo.current_semester);
        
        // 🌟 แก้ไข: ดึงข้อมูล core_personnel เพื่อเอาชื่อครูมาด้วย
        const { data: mems } = await db.from('club_registrations')
            .select(`student_id, status, club_lists(club_name, core_personnel(prefix, first_name, last_name))`)
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester);

        const memMap = {};
        if (mems) mems.forEach(m => memMap[m.student_id] = m);

        allStudentsReportData = enrolls.map(e => {
            const stu = e.core_students;
            const club = memMap[e.student_id];
            
            // 🌟 ดึงชื่อครู ถ้าไม่มีให้ใส่ '-'
            const teacher = club?.club_lists?.core_personnel;
            const teacherName = teacher ? `${teacher.prefix||''}${teacher.first_name} ${teacher.last_name}` : '-';

            return {
                id_card: stu.student_id_card,
                full_name: `${stu.prefix||''}${stu.first_name} ${stu.last_name}`,
                classroom: `ม.${e.core_classrooms.grade_level}/${e.core_classrooms.room_number}`,
                grade: parseInt(e.core_classrooms.grade_level),
                room: parseInt(e.core_classrooms.room_number),
                number: parseInt(e.student_number) || 999,
                number_text: e.student_number || '-',
                club_name: club ? club.club_lists?.club_name : '-',
                status: club ? club.status : 'not_applied',
                teacher_name: teacherName // 🌟 เก็บค่าชื่อครูแทนคอมเมนต์
            };
        });

        // 🌟 เรียงลำดับ: ชั้น -> ห้อง -> เลขที่
        allStudentsReportData.sort((a, b) => {
            if (a.grade !== b.grade) return a.grade - b.grade;
            if (a.room !== b.room) return a.room - b.room;
            return a.number - b.number;
        });

        if ($.fn.DataTable.isDataTable('#adminAllStudentsTable')) $('#adminAllStudentsTable').DataTable().destroy();
        
        document.getElementById('tb-admin-all-students').innerHTML = allStudentsReportData.map(s => {
            let badge = s.status === 'not_applied' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-500">ยังไม่เลือก</span>' : (s.status === 'approved' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติ</span>' : (s.status === 'rejected' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-red-100 text-red-700">ไม่อนุมัติ</span>' : '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">รอตรวจ</span>'));
            
            // 🌟 แสดงผลชื่อครูในคอลัมน์สุดท้าย
            return `<tr class="hover:bg-purple-50">
                <td class="py-3 px-4 font-mono">${s.id_card}</td>
                <td class="py-3 px-4">${s.full_name}</td>
                <td class="py-3 px-4">${s.classroom} (เลขที่ ${s.number_text})</td>
                <td class="py-3 px-4 font-bold text-purple-700">${s.club_name}</td>
                <td class="py-3 px-4 text-center">${badge}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${s.teacher_name}</td>
            </tr>`;
        }).join('');

        $('#adminAllStudentsTable').DataTable({ 
            responsive: true, 
            autoWidth: false, // 🌟 ทำให้ตารางยืดหดพอดีจอ ไม่ต้อง scroll แนวนอน
            order: [], // 🌟 ปิดออโต้เพื่อเรียงตามที่เราเขียนไว้
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
        });
        Swal.close();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
}

// 🌟 อัปเดตฟังก์ชันโหลดไฟล์ Excel (ส่งออกชื่อครูแทน)
window.exportAllStudentsExcel = () => {
    if (allStudentsReportData.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(allStudentsReportData.map(s => {
        let statusTh = 'ยังไม่เลือก';
        if (s.status === 'approved') statusTh = 'อนุมัติแล้ว';
        else if (s.status === 'rejected') statusTh = 'ไม่อนุมัติ';
        else if (s.status === 'pending') statusTh = 'รอพิจารณา';

        return { 
            'เลขประจำตัว': s.id_card, 
            'ชื่อสกุล': s.full_name, 
            'ระดับชั้น': s.classroom,
            'เลขที่': s.number_text,
            'ชุมนุม': s.club_name, 
            'สถานะ': statusTh, 
            'ครูที่ปรึกษา': s.teacher_name // 🌟 ส่งออกชื่อครูลง Excel
        };
    }));
    
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายงานนักเรียนสมัครชุมนุม_เทอม${currentSchoolInfo.current_semester}_${currentSchoolInfo.current_academic_year}.xlsx`);
};

// ==========================================
// Admin: Module Settings
// ==========================================
window.openAdminSettings = () => {
    document.getElementById('moduleAdminModal').classList.remove('hidden');
    document.getElementById('moduleAdminModal').classList.add('flex');
    loadModuleAdmins();
};

window.closeAdminSettings = () => {
    document.getElementById('moduleAdminModal').classList.add('hidden');
    document.getElementById('moduleAdminModal').classList.remove('flex');
};

async function loadModuleAdmins() {
    const sel = document.getElementById('select_new_admin');
    if (sel.tomselect) sel.tomselect.destroy();
    sel.innerHTML = '<option value="">-- พิมพ์ค้นหาชื่อครูเพื่อเพิ่มแอดมิน --</option>' +
        allTeachers.map(t => `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}</option>`).join('');
    new TomSelect(sel, { placeholder: 'ค้นหาชื่อครู...', allowEmptyOption: true });

    const { data } = await db.from('core_module_admins')
        .select(`id, core_personnel(prefix, first_name, last_name)`)
        .eq('module_id', MODULE_ID);

    document.getElementById('tb-module-admins').innerHTML = (data || []).map(m => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 font-bold text-indigo-800">
                <i class="fa-solid fa-user-shield text-indigo-400 mr-2"></i>
                ${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}
            </td>
            <td class="py-3 px-4 text-center">
                <button onclick="removeModuleAdmin('${m.id}')" class="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded transition">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

window.addModuleAdmin = async () => {
    const uid = document.getElementById('select_new_admin').value;
    if (!uid) return Swal.fire('เตือน', 'กรุณาเลือกครู', 'warning');
    await db.from('core_module_admins').insert({ user_id: uid, module_id: MODULE_ID });
    loadModuleAdmins();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'สำเร็จ', timer: 1500, showConfirmButton: false });
};

window.removeModuleAdmin = async (id) => {
    await db.from('core_module_admins').delete().eq('id', id);
    loadModuleAdmins();
};

// ==========================================
// 5. Excel Import/Export
// ==========================================
window.downloadClubTemplate = () => {
    const ws_data = [[
        'ชื่อชุมนุม', 'ชื่อหมวดหมู่', 'ครูผู้รับผิดชอบ (ชื่อ-สกุล)',
        'ระดับชั้นที่รับ (เป้าหมาย)', 'จำนวนที่รับ (คน)', 'สถานที่จัดกิจกรรม', 'รายละเอียด'
    ]];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clubs");
    XLSX.writeFile(wb, "ต้นแบบนำเข้าชุมนุม.xlsx");
};

window.importClubsFromExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            Swal.fire({ title: 'กำลังประมวลผลไฟล์ Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length < 2) {
                Swal.fire('ข้อผิดพลาด', 'ไฟล์ Excel ไม่มีข้อมูล (ต้องมีอย่างน้อย 2 แถว)', 'error');
                return;
            }

            const headers = rows[0].map(h => (h || '').toString().trim());
            const requiredColumns = {
                club_name: 'ชื่อชุมนุม',
                category: 'ชื่อหมวดหมู่',
                teacher: 'ครูผู้รับผิดชอบ (ชื่อ-สกุล)',
                target_grades: 'ระดับชั้นที่รับ (เป้าหมาย)',
                max_capacity: 'จำนวนที่รับ (คน)',
                location: 'สถานที่จัดกิจกรรม',
                description: 'รายละเอียด'
            };

            const headerIndices = {};
            for (let [key, colName] of Object.entries(requiredColumns)) {
                const idx = headers.indexOf(colName);
                if (idx === -1) {
                    return Swal.fire('รูปแบบไฟล์ไม่ถูกต้อง', `ไม่พบคอลัมน์: "${colName}"\nกรุณาโหลดเทมเพลตใหม่`, 'error');
                }
                headerIndices[key] = idx;
            }

            const teacherMap = {};
            allTeachers.forEach(t => {
                const fullName = `${t.prefix || ''}${t.first_name} ${t.last_name}`.trim();
                teacherMap[fullName] = t.id;
                teacherMap[`${t.first_name} ${t.last_name}`.trim()] = t.id;
            });

            const categoryMapByName = {};
            allCategories.forEach(c => categoryMapByName[c.name] = c.id);

            const { data: existingClubs } = await db.from('club_lists')
                .select('teacher_id')
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .eq('semester', currentSchoolInfo.current_semester);

            const teachersWithClub = new Set((existingClubs || []).map(c => c.teacher_id));

            const errors = [];
            let successCount = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const clubName = (row[headerIndices.club_name] || '').toString().trim();
                if (!clubName) { errors.push(`แถว ${i + 1}: ไม่ได้ระบุชื่อชุมนุม`); continue; }

                const categoryName = (row[headerIndices.category] || '').toString().trim();
                const teacherFullName = (row[headerIndices.teacher] || '').toString().trim();
                const targetGrades = (row[headerIndices.target_grades] || '').toString().trim();
                const maxCapacity = parseInt(row[headerIndices.max_capacity]) || 20;
                const location = (row[headerIndices.location] || '').toString().trim();
                const description = (row[headerIndices.description] || '').toString().trim();

                const teacherId = teacherMap[teacherFullName];
                if (!teacherId) { errors.push(`แถว ${i + 1}: ไม่พบครู "${teacherFullName}" ในระบบ`); continue; }
                if (teachersWithClub.has(teacherId)) { errors.push(`แถว ${i + 1}: ครู "${teacherFullName}" มีชุมนุมในเทอมนี้แล้ว (ข้าม)`); continue; }

                let categoryId = categoryMapByName[categoryName];
                if (!categoryId && categoryName) {
                    try {
                        const { data: newCat, error: catErr } = await db.from('club_categories').insert([{ name: categoryName }]).select().single();
                        if (catErr) throw new Error('สร้างหมวดหมู่ล้มเหลว');
                        categoryId = newCat.id;
                        allCategories.push(newCat);
                        categoryMapByName[categoryName] = newCat.id;
                    } catch {
                        errors.push(`แถว ${i + 1}: ไม่สามารถเพิ่มหมวดหมู่ใหม่ได้`);
                        continue;
                    }
                }

                const { error: insertErr } = await db.from('club_lists').insert([{
                    club_name: clubName,
                    category_id: categoryId,
                    teacher_id: teacherId,
                    target_grades: targetGrades,
                    max_capacity: maxCapacity,
                    location: location,
                    description: description,
                    academic_year: currentSchoolInfo.current_academic_year,
                    semester: currentSchoolInfo.current_semester
                }]);

                if (insertErr) {
                    errors.push(`แถว ${i + 1}: บันทึกข้อมูลล้มเหลว`);
                } else {
                    teachersWithClub.add(teacherId);
                    successCount++;
                }
            }

            let html = `<div class="text-left">
                <p class="font-bold text-green-600 text-lg mb-2">✅ นำเข้าสำเร็จ: ${successCount} รายการ</p>`;

            if (errors.length > 0) {
                html += `<p class="font-bold mb-2 text-red-600 text-lg">⚠️ ไม่สามารถนำเข้าได้ ${errors.length} รายการ</p>
                <div style="max-height: 250px; overflow-y: auto; border: 1px solid #fecaca; border-radius: 8px;">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-red-50 sticky top-0">
                        <tr>
                            <th class="py-2 px-3 border-b text-left">แถว</th>
                            <th class="py-2 px-3 border-b text-left">สาเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>`;
                errors.forEach(err => {
                    const match = err.match(/^แถว\s*(\d+):?\s*(.*)$/);
                    const rowNum = match ? match[1] : '';
                    const reason = match ? match[2] : err;
                    html += `<tr class="border-t hover:bg-red-50/50">
                        <td class="py-2 px-3 font-mono text-gray-700">${rowNum}</td>
                        <td class="py-2 px-3 text-gray-600">${reason}</td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            html += `</div>`;

            Swal.fire({
                icon: successCount > 0 ? 'success' : 'error',
                title: 'ผลการนำเข้า',
                html: html,
                width: '800px',
                confirmButtonText: 'ตกลง',
                customClass: { popup: 'text-sm rounded-xl' }
            });

            document.getElementById('excelUploadClubs').value = '';
            await loadAdminClubs();

        } catch (err) {
            Swal.fire('Error', err.message, 'error');
            document.getElementById('excelUploadClubs').value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

window.exportClubsToExcel = () => {
    if (allClubsData.length === 0) {
        return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลชุมนุมในภาคเรียนนี้ให้ส่งออก', 'info');
    }
    const exportData = allClubsData.map(c => {
        const tName = c.core_personnel
            ? `${c.core_personnel.prefix || ''}${c.core_personnel.first_name} ${c.core_personnel.last_name}`
            : 'ไม่ระบุ';
        return {
            'ชื่อกิจกรรมชุมนุม': c.club_name,
            'หมวดหมู่/กลุ่มสาระฯ': c.club_categories?.name || '-',
            'ครูผู้รับผิดชอบ': tName,
            'ระดับชั้นที่รับ (เป้าหมาย)': c.target_grades,
            'จำนวนที่รับ (คน)': c.max_capacity,
            'สถานที่จัดกิจกรรม': c.location || '-',
            'สถานะระบบ': c.is_locked ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่',
            'รายละเอียดเพิ่มเติม': c.description || '-'
        };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อชุมนุมทั้งหมด");
    XLSX.writeFile(wb, `รายชื่อชุมนุมทั้งหมด_เทอม${currentSchoolInfo.current_semester}_ปี${currentSchoolInfo.current_academic_year}.xlsx`);
};

window.importClubMembersExcel = (clubId, clubName) => {
    Swal.fire({
        title: `นำเข้าสมาชิก: ${clubName}`,
        html: `
            <div class="text-left text-sm">
                <p class="mb-2 text-slate-600">กรุณาเลือกไฟล์ Excel (.xlsx) ที่เลขประจำตัวนักเรียนอยู่ <b>คอลัมน์ A (คอลัมน์แรก)</b></p>
                <input type="file" id="excel-import-file" accept=".xlsx"
                       class="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-emerald-50 file:text-emerald-700">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'นำเข้าข้อมูล',
        confirmButtonColor: '#10b981',
        preConfirm: () => {
            const file = document.getElementById('excel-import-file').files[0];
            if (!file) return Swal.showValidationMessage('กรุณาเลือกไฟล์ก่อนครับ');
            return file;
        }
    }).then((result) => {
        if (result.isConfirmed) processExcelImport(result.value, clubId);
    });
};

async function processExcelImport(file, clubId) {
    Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length <= 1) throw new Error('ไฟล์ว่างเปล่า หรือไม่มีข้อมูลในแถวที่ 2 เป็นต้นไป');

        let successCount = 0;
        let errorLogs = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const sid = row[0] ? row[0].toString().trim() : null;
            if (!sid) continue;

            const { data: std } = await db.from('core_students')
                .select('id')
                .eq('student_id_card', sid)
                .maybeSingle();

            if (!std) {
                errorLogs.push(`แถวที่ ${i + 1}: ไม่พบนักเรียนเลขที่ ${sid}`);
                continue;
            }

            // ✅ ลบเฉพาะใน academic_year/semester ปัจจุบัน ไม่กระทบข้อมูลปีอื่น
            await db.from('club_registrations')
                .delete()
                .eq('student_id', std.id)
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .eq('semester', currentSchoolInfo.current_semester);

            const { error: insErr } = await db.from('club_registrations').insert({
                club_id: clubId,
                student_id: std.id,
                status: 'approved',
                is_confirmed: true,
                academic_year: currentSchoolInfo.current_academic_year,
                semester: currentSchoolInfo.current_semester
            });

            if (insErr) errorLogs.push(`แถวที่ ${i + 1}: ${insErr.message}`);
            else successCount++;
        }

        Swal.fire({
            icon: successCount > 0 ? 'success' : 'warning',
            title: 'สรุปการนำเข้า',
            html: `สำเร็จ: <b>${successCount}</b> คน<br>
                   ${errorLogs.length > 0
                    ? `<div class="text-xs text-red-500 mt-2">ข้อผิดพลาด: ${errorLogs.length} รายการ</div>`
                    : ''}`
        });

        if (currentMode === 'admin') loadAdminClubs();

    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ [FIX #5] loadAdminClubs — เหลือฉบับเดียว สมบูรณ์
// ==========================================
// 🌟 ฟังก์ชันโหลดตารางจัดการชุมนุม (ของแอดมิน)
async function loadAdminClubs() {
    // 🌟 เพิ่ม club_registrations(id, status) ใน Select เพื่อนำมานับยอดผู้สมัคร
    const { data, error } = await db.from('club_lists')
        .select(`*, core_personnel(prefix, first_name, last_name, avatar_url), club_categories(name), club_registrations(id, status)`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);

    if (error) return;
    allClubsData = data || [];

    if ($.fn.DataTable.isDataTable('#adminClubsTable')) $('#adminClubsTable').DataTable().destroy();
    document.getElementById('tb-admin-clubs').innerHTML = allClubsData.map(c => {
        const tName = c.core_personnel ? `${c.core_personnel.prefix || ''}${c.core_personnel.first_name} ${c.core_personnel.last_name}` : 'ไม่ระบุ';
        
        // แปลงลิงก์รูป
        const avatarUrl = getDirectImageUrl(c.core_personnel?.avatar_url);
        
        const tHtml = avatarUrl 
            ? `<div class="flex items-center gap-3">
                 <img src="${avatarUrl}" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(tName)}&background=random';" onclick="viewTeacherImage('${avatarUrl}', '${tName}')" class="w-10 h-10 rounded-xl object-cover cursor-pointer hover:scale-105 transition-all border border-slate-200" title="คลิกเพื่อดูรูปใหญ่" />
                 <span class="font-medium">${tName}</span>
               </div>`
            : `<div class="flex items-center gap-3">
                 <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold">${tName.substring(0, 1)}</div>
                 <span class="font-medium">${tName}</span>
               </div>`;

        const stBadge = c.is_locked ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">ปิดแล้ว</span>' : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">เปิดรับ</span>';

        const safeClubName = c.club_name.replace(/'/g, "\\'");
        const safeDesc = (c.description || '').replace(/'/g, "\\'");
        const safeCatName = (c.club_categories?.name || '').replace(/'/g, "\\'");

        // 🌟 นับยอดผู้สมัคร (คัดกรองเฉพาะคนที่ไม่โดนปฏิเสธ)
        const appliedCount = c.club_registrations ? c.club_registrations.filter(r => r.status !== 'rejected').length : 0;
        
        // 🌟 สร้าง UI ยอดสมัคร ถ้าคนสมัครเกินโควตาให้เป็นตัวสีแดงเตือนแอดมิน
        const capacityHtml = appliedCount > c.max_capacity 
            ? `<span class="text-red-600 font-bold bg-red-50 px-2 py-1 rounded-lg">${appliedCount} / ${c.max_capacity}</span>`
            : `<span class="text-slate-700 font-bold">${appliedCount} / ${c.max_capacity}</span>`;

        return `<tr class="hover:bg-purple-50/50">
            <td class="py-3 px-4 font-bold text-purple-700">${c.club_name}</td>
            <td class="py-3 px-4">${c.club_categories?.name || '-'}</td>
            <td class="py-3 px-4">${tHtml}</td>
            <td class="py-3 px-4 text-center">${c.target_grades}</td>
            <td class="py-3 px-4 text-center">${capacityHtml}</td> <td class="py-3 px-4 text-center">${stBadge}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
                <button onclick="viewClubStudents('${c.id}', '${safeClubName}')" class="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white text-sm font-bold w-8 h-8 rounded-lg transition-colors mr-1" title="ดูรายชื่อนักเรียน">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button onclick="importClubMembersExcel('${c.id}', '${safeClubName}')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white text-sm font-bold w-8 h-8 rounded-lg transition-colors mr-1" title="นำเข้ารายชื่อนักเรียนจาก Excel">
                    <i class="fa-solid fa-file-excel"></i>
                </button>
                <button onclick="toggleLockAdminClub('${c.id}', ${c.is_locked}, '${safeClubName}')" 
                        class="${c.is_locked ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white'} text-sm font-bold w-8 h-8 rounded-lg transition-colors mr-1" 
                        title="${c.is_locked ? 'ปลดล็อคชุมนุม' : 'ล็อคชุมนุม'}">
                    <i class="fa-solid ${c.is_locked ? 'fa-lock-open' : 'fa-lock'}"></i>
                </button>
                <button onclick="editAdminClub('${c.id}', '${safeClubName}', '${safeCatName}', '${c.teacher_id}', '${c.target_grades}', '${c.max_capacity}', '${c.location}', '${safeDesc}')" class="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white text-sm font-bold w-8 h-8 rounded-lg transition-colors mr-1" title="แก้ไข">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteAdminClub('${c.id}', '${safeClubName}')" class="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-sm font-bold w-8 h-8 rounded-lg transition-colors" title="ลบ">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    $('#adminClubsTable').DataTable({
        responsive: true,
        autoWidth: false,
        scrollX: false,
        order: [[1, 'asc']], // เรียงตามคอลัมน์หมวดหมู่
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}
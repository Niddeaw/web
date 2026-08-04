// ==========================================
// System Module: Club Management (Unified Teacher/Admin)
// ปรับปรุง: ใช้ฟังก์ชันตรวจสอบสิทธิ์จาก config.js มาตรฐานกลาง
// แก้ไข: เพิ่ม logUserAction ในทุก CRUD และเปลี่ยน logout ให้เป็นมาตรฐาน
// ==========================================
const MODULE_ID = 'club_system';

let currentUser = null;
let userRole = 'teacher';
let isModuleAdmin = false;
let currentMode = 'teacher'; // 'teacher' | 'admin'
let isAdminMode = false;

let currentSchoolInfo = null;
let myClubInfo = null;
let teacherApplicantsData = [];
let allClubsData = [];
let allStudentsReportData = [];
let allTeachers = [];
let allCategories = [];
let categoryMap = {};

// Map สำหรับเก็บข้อความนักเรียนอย่างปลอดภัย
const studentMessageStore = {};

document.addEventListener('DOMContentLoaded', async () => {
    await initSystem();
});

// ==========================================
// Helper: ตรวจสอบว่าผู้ใช้มีสิทธิ์เป็น Admin (หลัก หรือ โมดูล)
// ==========================================
function hasAdminAccess() {
    return isAdminUser(userRole, isAdminMode) || isModuleAdmin;
}

// ==========================================
// 1. Initialization & RBAC (ใช้ config.js)
// ==========================================
async function initSystem() {
    Swal.fire({ title: 'ตรวจสอบข้อมูลส่วนกลาง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ✅ ใช้ checkSessionAndRole จาก config.js
        const result = await checkSessionAndRole('ระบบชุมนุม (ครู)', ['super_admin', 'admin', 'teacher', 'staff']);
        if (!result) return;

        const { user, personnel, role, isAdmin, isTeacher } = result;
        currentUser = personnel;
        userRole = role;
        isAdminMode = isAdmin;
        $('#user-display').text(`${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}`);

        // ✅ ตรวจสอบ Module Admin ด้วย hasModuleAccess
        isModuleAdmin = await hasModuleAccess(role, MODULE_ID, user.id);

        // ✅ Unhide ปุ่มก่อน เพื่อให้ updateToggleModeUI (config.js) ทำงานได้
        //    (config.js จะ return กลางคันถ้าปุ่มยัง hidden อยู่)
        if (isAdminMode || isModuleAdmin) {
            document.getElementById('btnAdminMode')?.classList.remove('hidden');
            document.getElementById('btnAdminMode')?.classList.add('flex');
            document.getElementById('admin-settings-btn')?.classList.remove('hidden');
            await loadAllTeachers();
        }

        // ✅ อัปเดตปุ่มสลับโหมด (ต้องเรียกหลัง unhide เท่านั้น)
        updateToggleModeUI(role, isAdminMode, 'btnAdminMode');

        // ✅ ใช้ applyVisibilityByRole จาก config.js (เรียกหลังสุด ห้ามซ่อนปุ่มที่เพิ่ง unhide)
        //    ส่ง isAdminMode แทน role-based เพื่อให้ Module Admin ไม่ถูกซ่อนปุ่ม toggle
        applyVisibilityByRole(role, isAdminMode || isModuleAdmin, {
            settingsBtn: 'admin-settings-btn',
            toggleBtn: 'btnAdminMode',
            adminManagerBtn: null
        });

        await fetchSchoolInfo();
        await loadCategories();
        await loadMyClub();

        // ✅ บันทึก Log การเข้าใช้งาน
        await logUserAction('เข้าสู่ระบบจัดการชุมนุม (ครู)', 'club');

        Swal.close();
    } catch (err) {
        console.error('Init error:', err);
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
// 2. Role Switcher (ใช้ config.js)
// ==========================================
window.toggleRoleView = () => {
    // ✅ ตรวจสอบสิทธิ์: Admin หลัก หรือ Module Admin เท่านั้นที่สลับได้
    if (!isAdminUser(userRole, isAdminMode) && !isModuleAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถสลับโหมดได้', 'error');
        return;
    }

    const teacherView = document.getElementById('teacher-view');
    const adminView = document.getElementById('admin-view');

    if (!teacherView || !adminView) {
        console.warn('Cannot toggle role: Missing teacher-view or admin-view');
        return;
    }

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true
    });

    if (currentMode === 'teacher') {
        currentMode = 'admin';
        isAdminMode = true;

        teacherView.classList.replace('block', 'hidden');
        adminView.classList.replace('hidden', 'block');

        loadAdminClubs();
        loadClubDashboardStats();

        Toast.fire({ icon: 'success', title: 'สลับเป็นโหมด ผู้ดูแลระบบ' });
    } else {
        currentMode = 'teacher';
        isAdminMode = false;

        adminView.classList.replace('block', 'hidden');
        teacherView.classList.replace('hidden', 'block');

        loadMyClub();

        Toast.fire({ icon: 'success', title: 'สลับเป็นโหมด ครูผู้สอน' });
    }

    // ✅ trueAdminAccess = สิทธิ์จริงของผู้ใช้ (ไม่ขึ้นกับโหมดที่กำลังดูอยู่)
    //    ใช้ค่านี้แทน isAdminMode เพื่อไม่ให้ปุ่มหายหลังสลับกลับโหมดครู
    const trueAdminAccess = WRK_ROLES.ADMIN.includes(userRole) || isModuleAdmin;

    updateToggleModeUI(userRole, isAdminMode, 'btnAdminMode');
    applyVisibilityByRole(userRole, trueAdminAccess, {
        settingsBtn: 'admin-settings-btn',
        toggleBtn: 'btnAdminMode'
    });
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
// 3. Teacher Module (รองรับหลายชุมนุม)
// ==========================================
let myClubs = [];

async function loadMyClub() {
    const { data: clubs } = await db.from('club_lists')
        .select(`*, club_categories(name)`)
        .eq('teacher_id', currentUser.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .order('club_name');

    if (clubs && clubs.length > 0) {
        myClubs = clubs;
        let indexToSelect = 0;
        if (myClubInfo) {
            const foundIndex = myClubs.findIndex(c => c.id === myClubInfo.id);
            if (foundIndex !== -1) indexToSelect = foundIndex;
        }
        renderTeacherClub(indexToSelect);
    } else {
        myClubInfo = null;
        myClubs = [];
        document.getElementById('no-club-display').classList.remove('hidden');
        document.getElementById('my-club-display').classList.add('hidden');
        document.getElementById('btn-lock-club').classList.add('hidden');
        if ($.fn.DataTable.isDataTable('#teacherStudentsTable')) {
            $('#teacherStudentsTable').DataTable().destroy();
        }
    }
}

window.renderTeacherClub = async (index) => {
    myClubInfo = myClubs[index];

    document.getElementById('no-club-display').classList.add('hidden');
    document.getElementById('my-club-display').classList.remove('hidden');

    if (myClubs.length > 1) {
        const options = myClubs.map((c, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${c.club_name}</option>`).join('');
        document.getElementById('my-club-name').innerHTML = `<select onchange="renderTeacherClub(parseInt(this.value))" class="font-black text-indigo-900 border-b-2 border-indigo-300 outline-none bg-transparent cursor-pointer hover:border-indigo-500 transition-colors py-1 max-w-full w-full sm:w-auto truncate focus:ring-0">${options}</select>`;
    } else {
        document.getElementById('my-club-name').innerHTML = myClubInfo.club_name;
    }

    $('#my-club-category').text(myClubInfo.club_categories?.name || '-');
    $('#max-capacity').text(myClubInfo.max_capacity);

    const btnLock = document.getElementById('btn-lock-club');
    btnLock.classList.remove('hidden');

    if (myClubInfo.is_locked) {
        btnLock.className = "w-full sm:w-auto px-6 py-4 rounded-xl font-bold shadow-md transition-colors bg-slate-500 text-white hover:bg-slate-600";
        btnLock.innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i> ปลดล็อคชุมนุม';
        btnLock.onclick = unlockMyClub;
    } else {
        btnLock.className = "w-full sm:w-auto px-6 py-4 rounded-xl font-bold shadow-md transition-colors bg-emerald-600 text-white hover:bg-emerald-700";
        btnLock.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> ยืนยันปิดรับสมัคร';
        btnLock.onclick = lockClub;
    }

    await loadTeacherApplicants();
};

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
        await logUserAction(`ล็อคชุมนุม "${myClubInfo.club_name}"`, 'club');
        await loadMyClub();
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
        await logUserAction(`ปลดล็อคชุมนุม "${myClubInfo.club_name}"`, 'club');
        await loadMyClub();
        Swal.fire({ icon: 'success', title: 'ปลดล็อคชุมนุมเรียบร้อย', timer: 1500, showConfirmButton: false });
    }
};

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
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);

    if (error) return;

    Object.keys(studentMessageStore).forEach(k => delete studentMessageStore[k]);

    teacherApplicantsData = members.map(m => {
        const stu = m.core_students;
        const currentEnr = stu.student_enrollments?.find(e =>
            e.core_classrooms.academic_year === currentSchoolInfo.current_academic_year &&
            e.core_classrooms.semester === currentSchoolInfo.current_semester
        );

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
        pageLength: 50,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

window.viewStudentMessage = (msg, studentName) => {
    const safeMsg = $('<div>').text(msg).html();
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

window.updateStatus = async (id, status, reason = null) => {
    if (status === 'approved') {
        const { count, error: countErr } = await db
            .from('club_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', myClubInfo.id)
            .eq('status', 'approved')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester);

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
        payload.rejection_reason = null;
    } else if (reason) {
        payload.rejection_reason = reason;
    }

    await db.from('club_registrations').update(payload).eq('id', id);
    await logUserAction(`เปลี่ยนสถานะนักเรียน ID ${id} เป็น ${status}`, 'club');
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
        'ข้อความจากนักเรียน': m.message || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายชื่อชุมนุม_${myClubInfo.club_name}.xlsx`);
};

// ==========================================
// 4. Admin Module
// ==========================================
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

window.viewClubStudents = async (clubId, clubName) => {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: members, error } = await db.from('club_registrations')
            .select(`
                id, student_id, club_id, status, rejection_reason,
                core_students!inner(
                    student_id_card, prefix, first_name, last_name,
                    student_enrollments(
                        core_classrooms!inner(grade_level, room_number, academic_year, semester)
                    )
                )
            `)
            .eq('club_id', clubId)
            .eq('academic_year', currentSchoolInfo.current_academic_year);

        if (error) throw error;

        if (!members || members.length === 0) {
            Swal.fire({ icon: 'info', title: `ชุมนุม : ${clubName}`, text: 'ยังไม่มีนักเรียนสมัคร', confirmButtonText: 'ปิด' });
            return;
        }

        const hasAdminAccess = isAdminUser(userRole, isAdminMode);

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
                reg_id: m.id,
                student_id: m.student_id,
                club_id: m.club_id,
                id_card: stu.student_id_card,
                full_name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`,
                classroom,
                status: statusText,
                statusColor,
                raw_status: m.status
            };
        });

        let html = `
        <div class="text-left">
            <p class="font-bold mb-2 text-lg">📋 นักเรียนในชุมนุม <span class="text-purple-600">${clubName}</span> (${rows.length} คน)</p>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="w-full text-sm border-collapse" id="admin-club-students-table">
                    <thead class="bg-gray-100 sticky top-0 shadow-sm z-10">
                        <tr>
                            ${hasAdminAccess ? `<th class="py-2 px-3 border-b text-center w-12">#</th>` : ''}
                            <th class="py-2 px-3 border-b text-left">เลขประจำตัว</th>
                            <th class="py-2 px-3 border-b text-left">ชื่อ-สกุล</th>
                            <th class="py-2 px-3 border-b text-left">ชั้น</th>
                            <th class="py-2 px-3 border-b text-left">สถานะของครู</th>
                            ${hasAdminAccess ? `<th class="py-2 px-3 border-b text-center">จัดการ</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>`;

        rows.forEach(r => {
            const safeFullName = r.full_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            
            html += `
                <tr class="border-t hover:bg-gray-50">
                    ${hasAdminAccess ? `<td class="py-2 px-3 text-center border-r border-slate-100 bg-slate-50/50">-</td>` : ''}
                    <td class="py-2 px-3 font-mono text-gray-700">${r.id_card}</td>
                    <td class="py-2 px-3 font-medium">${r.full_name}</td>
                    <td class="py-2 px-3">${r.classroom}</td>
                    <td class="py-2 px-3 font-bold ${r.statusColor}">${r.status}</td>
                    ${hasAdminAccess ? `
                        <td class="py-2 px-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <button onclick="saSetStatus('${r.reg_id}', 'approved')" class="w-7 h-7 flex items-center justify-center rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors shadow-sm" title="อนุมัติทันที"><i class="fa-solid fa-check"></i></button>
                                <button onclick="saSetStatus('${r.reg_id}', 'rejected')" class="w-7 h-7 flex items-center justify-center rounded bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors shadow-sm" title="ไม่อนุมัติ"><i class="fa-solid fa-xmark"></i></button>
                                <button onclick="saManageClub('${r.reg_id}', '${r.student_id}', '${r.club_id}', '${r.raw_status}', '${safeFullName}')" class="w-7 h-7 flex items-center justify-center rounded bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors shadow-sm" title="ย้ายชุมนุม / แก้ไข"><i class="fa-solid fa-right-left text-xs"></i></button>
                                <button onclick="removeStudentFromClub('${r.reg_id}', '${safeFullName}', '${clubId}', '${clubName}')" class="w-7 h-7 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-slate-500 hover:text-white transition-colors shadow-sm" title="ลบออกจากชุมนุม"><i class="fa-solid fa-trash text-xs"></i></button>
                            </div>
                        </td>
                    ` : ''}
                </tr>`;
        });

        html += `</tbody> </table> </div> </div>`;

        Swal.fire({
            title: 'รายชื่อนักเรียน',
            html: html,
            width: '900px',
            confirmButtonText: 'ปิด',
            customClass: { popup: 'text-sm rounded-xl' }
        });
    } catch (err) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    }
};

window.removeStudentFromClub = async (regId, studentName, clubId, clubName) => {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        html: `ต้องการลบ <b>${studentName}</b> ออกจากชุมนุม <b>${clubName}</b> ใช่หรือไม่?<br>
               <span class="text-red-500 text-sm">การลบนี้จะทำให้นักเรียนสามารถไปสมัครชุมนุมอื่นได้อีกครั้ง</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยันลบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบข้อมูล...', didOpen: () => Swal.showLoading() });

        try {
            const { error } = await db.from('club_registrations').delete().eq('id', regId);
            if (error) throw error;

            await logUserAction(`ลบนักเรียน "${studentName}" ออกจากชุมนุม "${clubName}"`, 'club');

            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
            Swal.close();
            setTimeout(() => {
                viewClubStudents(clubId, clubName);
            }, 500);
        } catch (error) {
            console.error("Error removing student:", error);
            Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        }
    }
};

// ==========================================
// Admin: Load Clubs
// ==========================================
async function loadAdminClubs() {
    if (!isAdminUser(userRole, isAdminMode)) return;

    const { data: clubs, error } = await db.from('club_lists')
        .select(`*, core_personnel(prefix, first_name, last_name, avatar_url), club_categories(name)`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);

    if (error) return;
    allClubsData = clubs || [];

    const { data: regs } = await db.from('club_registrations')
        .select('club_id, status')
        .eq('academic_year', currentSchoolInfo.current_academic_year);

    const countMap = {};
    (regs || []).forEach(r => {
        if (r.status !== 'rejected') {
            countMap[r.club_id] = (countMap[r.club_id] || 0) + 1;
        }
    });

    if ($.fn.DataTable.isDataTable('#adminClubsTable')) $('#adminClubsTable').DataTable().destroy();
    
    document.getElementById('tb-admin-clubs').innerHTML = allClubsData.map(c => {
        const tName = c.core_personnel ? `${c.core_personnel.prefix || ''}${c.core_personnel.first_name} ${c.core_personnel.last_name}` : 'ไม่ระบุ';
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

        const appliedCount = countMap[c.id] || 0;

        const capacityHtml = appliedCount > c.max_capacity
            ? `<span class="text-red-600 font-bold bg-red-50 px-2 py-1 rounded-lg">${appliedCount} / ${c.max_capacity}</span>`
            : `<span class="text-slate-700 font-bold">${appliedCount} / ${c.max_capacity}</span>`;

        return `<tr class="hover:bg-purple-50/50">
            <td class="py-3 px-4 font-bold text-purple-700">${c.club_name}</td>
            <td class="py-3 px-4">${c.club_categories?.name || '-'}</td>
            <td class="py-3 px-4">${tHtml}</td>
            <td class="py-3 px-4 text-center">${c.target_grades}</td>
            <td class="py-3 px-4 text-center">${capacityHtml}</td>
            <td class="py-3 px-4 text-center">${stBadge}</td>
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
        order: [[1, 'asc']],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

// ==========================================
// Admin: Dashboard Stats
// ==========================================
let unassignedStudentsData = [];
let pendingStudentsData = [];

async function loadClubDashboardStats() {
    try {
        const { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
            .select(`
                student_id, student_number,
                core_classrooms!inner(grade_level, room_number, adviser_id_1, adviser_id_2),
                core_students(student_id_card, prefix, first_name, last_name)
            `)
            .eq('core_classrooms.academic_year', currentSchoolInfo.current_academic_year)
            .eq('core_classrooms.semester', currentSchoolInfo.current_semester);

        if (enrollErr) throw enrollErr;

        const { data: regs, error: regErr } = await db.from('club_registrations')
            .select(`
                student_id, status,
                club_lists(
                    club_name, 
                    core_personnel(prefix, first_name, last_name)
                ) 
            `)
            .eq('academic_year', currentSchoolInfo.current_academic_year);

        if (regErr) throw regErr;

        const registeredStudentIds = new Set();
        const pendingMap = new Map();
        let approvedCount = 0;

        (regs || []).forEach(r => {
            registeredStudentIds.add(r.student_id);
            if (r.status === 'approved') {
                approvedCount++;
            } else if (r.status === 'pending') {
                const club = r.club_lists;
                const teacher = club?.core_personnel;
                const teacherName = teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : 'ไม่ระบุ';

                pendingMap.set(r.student_id, {
                    club_name: club?.club_name || 'ไม่ระบุข้อมูล',
                    teacher_name: teacherName
                });
            }
        });

        unassignedStudentsData = (enrolls || []).filter(e => !registeredStudentIds.has(e.student_id));

        pendingStudentsData = (enrolls || [])
            .filter(e => pendingMap.has(e.student_id))
            .map(e => ({
                ...e,
                requested_club: pendingMap.get(e.student_id).club_name,
                requested_club_teacher: pendingMap.get(e.student_id).teacher_name
            }));

        const totalStudents = enrolls ? enrolls.length : 0;
        document.getElementById('dash-total-students').innerHTML = `${totalStudents} <span class="text-sm font-medium text-slate-500">คน</span>`;
        document.getElementById('dash-approved').innerHTML = `${approvedCount} <span class="text-sm font-medium text-slate-500">คน</span>`;
        document.getElementById('dash-pending').innerHTML = `${pendingStudentsData.length} <span class="text-sm font-medium text-slate-500">คน</span>`;
        document.getElementById('dash-unassigned').innerHTML = `${unassignedStudentsData.length} <span class="text-sm font-medium text-slate-500">คน</span>`;

    } catch (err) {
        console.error('Error loading dashboard stats:', err);
    }
}

// ==========================================
// Admin: Load All Students Report (ทั้งปี)
// ==========================================
async function loadAllStudentsReport() {
    if (!isAdminUser(userRole, isAdminMode)) return;

    Swal.fire({ title: 'กำลังดึงข้อมูลทั้งโรงเรียน...', didOpen: () => Swal.showLoading() });
    try {
        const { data: enrolls } = await db.from('student_enrollments')
            .select(`student_id, student_number, core_classrooms!inner(grade_level, room_number), core_students(student_id_card, prefix, first_name, last_name)`)
            .eq('core_classrooms.academic_year', currentSchoolInfo.current_academic_year);

        const { data: mems } = await db.from('club_registrations')
            .select(`id, student_id, club_id, status, club_lists(club_name, core_personnel(prefix, first_name, last_name))`)
            .eq('academic_year', currentSchoolInfo.current_academic_year);

        const memMap = {};
        if (mems) mems.forEach(m => memMap[m.student_id] = m);

        allStudentsReportData = enrolls.map(e => {
            const stu = e.core_students;
            const club = memMap[e.student_id];
            const teacher = club?.club_lists?.core_personnel;
            const teacherName = teacher ? `${teacher.prefix||''}${teacher.first_name} ${teacher.last_name}` : '-';

            return {
                reg_id: club?.id || null,             
                student_id: e.student_id,             
                club_id: club?.club_id || null,       
                id_card: stu.student_id_card,
                full_name: `${stu.prefix||''}${stu.first_name} ${stu.last_name}`,
                classroom: `ม.${e.core_classrooms.grade_level}/${e.core_classrooms.room_number}`,
                grade: parseInt(e.core_classrooms.grade_level),
                room: parseInt(e.core_classrooms.room_number),
                number: parseInt(e.student_number) || 999,
                number_text: e.student_number || '-',
                club_name: club ? club.club_lists?.club_name : '-',
                status: club ? club.status : 'not_applied',
                teacher_name: teacherName
            };
        });

        allStudentsReportData.sort((a, b) => {
            if (a.grade !== b.grade) return a.grade - b.grade;
            if (a.room !== b.room) return a.room - b.room;
            return a.number - b.number;
        });

        if ($.fn.DataTable.isDataTable('#adminAllStudentsTable')) $('#adminAllStudentsTable').DataTable().destroy();
        
        document.getElementById('tb-admin-all-students').innerHTML = allStudentsReportData.map(s => {
            let badge = s.status === 'not_applied' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-500">ยังไม่เลือก</span>' : (s.status === 'approved' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติ</span>' : (s.status === 'rejected' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-red-100 text-red-700">ไม่อนุมัติ</span>' : '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">รอตรวจ</span>'));
            
            let actionHtml = '<span class="text-slate-300">-</span>';
            if (isAdminUser(userRole, isAdminMode)) { 
                if (s.reg_id) {
                    actionHtml = `
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="saSetStatus('${s.reg_id}', 'approved')" class="w-7 h-7 flex items-center justify-center rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors shadow-sm" title="อนุมัติทันที"><i class="fa-solid fa-check"></i></button>
                        <button onclick="saSetStatus('${s.reg_id}', 'rejected')" class="w-7 h-7 flex items-center justify-center rounded bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors shadow-sm" title="ไม่อนุมัติ"><i class="fa-solid fa-xmark"></i></button>
                        <button onclick="saManageClub('${s.reg_id}', '${s.student_id}', '${s.club_id}', '${s.status}', '${s.full_name}')" class="w-7 h-7 flex items-center justify-center rounded bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors shadow-sm" title="ย้ายชุมนุม / แก้ไข"><i class="fa-solid fa-right-left text-xs"></i></button>
                        <button onclick="saDeleteReg('${s.reg_id}')" class="w-7 h-7 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-slate-500 hover:text-white transition-colors shadow-sm" title="ลบทิ้ง (กลับไปสถานะยังไม่เลือก)"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>`;
                } else {
                    actionHtml = `
                    <div class="flex items-center justify-center">
                        <button onclick="saManageClub('null', '${s.student_id}', 'null', 'approved', '${s.full_name}')" class="px-2 py-1 text-xs font-bold flex items-center justify-center rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white transition-colors shadow-sm whitespace-nowrap"><i class="fa-solid fa-plus mr-1"></i> จับใส่ชุมนุม</button>
                    </div>`;
                }
            }

            return `<tr class="hover:bg-purple-50">
                <td class="py-3 px-4 font-mono">${s.id_card}</td>
                <td class="py-3 px-4">${s.full_name}</td>
                <td class="py-3 px-4">${s.classroom} (เลขที่ ${s.number_text})</td>
                <td class="py-3 px-4 font-bold text-purple-700">${s.club_name}</td>
                <td class="py-3 px-4 text-center">${badge}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${s.teacher_name}</td>
                <td class="py-3 px-4 text-center">${actionHtml}</td>
            </tr>`;
        }).join('');

        $('#adminAllStudentsTable').DataTable({ 
            responsive: true, 
            autoWidth: false, 
            order: [], 
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
        });
        Swal.close();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
}

// ==========================================
// Super Admin Quick Actions
// ==========================================
window.saSetStatus = async (regId, status) => {
    if (!isAdminUser(userRole, isAdminMode)) return;

    const statusText = status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    const { isConfirmed } = await Swal.fire({
        title: `ยืนยัน${statusText}?`,
        text: `คุณต้องการ${statusText}การสมัครนี้ใช่หรือไม่`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: status === 'approved' ? '#10b981' : '#ef4444',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('club_registrations').update({
            status,
            rejection_reason: status === 'rejected' ? 'Super Admin ยกเลิกสิทธิ์' : null
        }).eq('id', regId);

        if (error) return Swal.fire('Error', error.message, 'error');
        
        await logUserAction(`Super Admin เปลี่ยนสถานะเป็น ${status} (ID: ${regId})`, 'club');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1000, showConfirmButton: false });

        await loadAllStudentsReport();
        if (typeof loadClubDashboardStats === 'function') loadClubDashboardStats();
    }
};

window.saDeleteReg = async (regId) => {
    if (!isAdminUser(userRole, isAdminMode)) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบข้อมูล?',
        text: 'ประวัติการเลือกชุมนุมของเด็กจะหายไป และกลับไปสถานะ "ยังไม่เลือกชุมนุม"',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบทิ้ง',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('club_registrations').delete().eq('id', regId);

        if (error) return Swal.fire('Error', error.message, 'error');
        
        await logUserAction(`Super Admin ลบประวัติการสมัคร (ID: ${regId})`, 'club');
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false });

        await loadAllStudentsReport();
        if (typeof loadClubDashboardStats === 'function') loadClubDashboardStats();
    }
};

window.saManageClub = async (regId, studentId, currentClubId, currentStatus, studentName) => {
    if (!isAdminUser(userRole, isAdminMode)) return;

    try {
        Swal.fire({ title: 'กำลังโหลดข้อมูลชุมนุม...', didOpen: () => Swal.showLoading() });

        const { data: clubs } = await db.from('club_lists')
            .select('id, club_name, max_capacity')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('club_name');

        let clubOptions = '<option value="">-- พิมพ์เพื่อค้นหาชุมนุม... --</option>';
        clubs.forEach(c => {
            const selected = (c.id === currentClubId) ? 'selected' : '';
            clubOptions += `<option value="${c.id}" ${selected}>${c.club_name} (โควตา ${c.max_capacity} คน)</option>`;
        });

        let statusOptions = `
            <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>รอพิจารณา</option>
            <option value="approved" ${currentStatus === 'approved' ? 'selected' : ''}>อนุมัติ (รับเข้าชุมนุมทันที)</option>
            <option value="rejected" ${currentStatus === 'rejected' ? 'selected' : ''}>ไม่อนุมัติ</option>
        `;

        const { value: formValues, isConfirmed } = await Swal.fire({
            title: 'ย้าย / จัดการชุมนุม',
            html: `
                <div class="text-left text-sm space-y-4 mt-2" style="min-height: 250px;"> <div class="p-3 bg-indigo-50 text-indigo-800 rounded-lg border border-indigo-100 font-medium">
                        <span class="font-bold text-indigo-600">นักเรียน:</span> ${studentName}
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">เลือกชุมนุมเป้าหมาย</label>
                        <select id="swal-club" class="w-full font-medium" placeholder="พิมพ์ค้นหาชุมนุม...">${clubOptions}</select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">สถานะเมื่อย้ายเสร็จ</label>
                        <select id="swal-status" class="w-full border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-medium">${statusOptions}</select>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'บันทึกข้อมูล',
            cancelButtonText: 'ยกเลิก',
            didOpen: () => {
                new TomSelect("#swal-club", {
                    create: false,
                    sortField: { field: "text", direction: "asc" },
                    maxOptions: null
                });
            },
            preConfirm: () => {
                const clubId = document.getElementById('swal-club').value;
                if (!clubId) {
                    Swal.showValidationMessage('กรุณาเลือกชุมนุมเป้าหมาย');
                    return false;
                }
                return { clubId, status: document.getElementById('swal-status').value };
            }
        });

        if (isConfirmed && formValues) {
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', didOpen: () => Swal.showLoading() });
            
            if (regId && regId !== 'null') {
                const { error } = await db.from('club_registrations').update({
                    club_id: formValues.clubId,
                    status: formValues.status,
                    rejection_reason: formValues.status === 'rejected' ? 'Super/Module Admin ย้ายชุมนุม' : null
                }).eq('id', regId);
                if (error) throw error;
            } else {
                const { error } = await db.from('club_registrations').insert({
                    student_id: studentId,
                    club_id: formValues.clubId,
                    status: formValues.status,
                    academic_year: currentSchoolInfo.current_academic_year,
                    semester: currentSchoolInfo.current_semester,
                    rejection_reason: formValues.status === 'rejected' ? 'Super/Module Admin ปฏิเสธ' : null
                });
                if (error) throw error;
            }
            
            await logUserAction(`ย้ายนักเรียน "${studentName}" ไปชุมนุมใหม่`, 'club');
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
            
            await loadAllStudentsReport();
            if (typeof loadClubDashboardStats === 'function') loadClubDashboardStats();
        }
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

window.toggleLockAdminClub = async (id, isCurrentlyLocked, name) => {
    if (!isAdminUser(userRole, isAdminMode)) return;

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
        await logUserAction(`${actionText}ชุมนุม "${name}"`, 'club');
        await loadAdminClubs();
        Swal.fire('สำเร็จ', `${actionText}ชุมนุมเรียบร้อยแล้ว`, 'success');
    }
};

// ==========================================
// Admin: Export Functions
// ==========================================
window.exportAllStudentsExcel = () => {
    if (!isAdminUser(userRole, isAdminMode)) return;
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
            'ครูที่ปรึกษา': s.teacher_name
        };
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายงานนักเรียนสมัครชุมนุม_ปี${currentSchoolInfo.current_academic_year}.xlsx`);
};

// ==========================================
// Excel Import/Export Functions
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
    if (!isAdminUser(userRole, isAdminMode)) return;

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
    if (!isAdminUser(userRole, isAdminMode)) return;
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
    if (!isAdminUser(userRole, isAdminMode)) return;

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
    if (!isAdminUser(userRole, isAdminMode)) return;

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

            await db.from('club_registrations')
                .delete()
                .eq('student_id', std.id)
                .eq('academic_year', currentSchoolInfo.current_academic_year);

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

        await logUserAction(`นำเข้าสมาชิก ${successCount} คน เข้าชุมนุม ID ${clubId}`, 'club');

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
// Admin: Modals (Club & Settings) - ใช้ requireAdmin
// ==========================================
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
    if (!requireAdmin(userRole, isAdminMode)) return;
    document.getElementById('admin-club-form').reset();
    document.getElementById('ac_id').value = '';
    document.getElementById('ac_capacity').value = 20;
    initAdminTomSelect();
    updateTeacherAvatarPreview('');
    document.getElementById('admin-club-modal').classList.remove('hidden');
    document.getElementById('admin-club-modal').classList.add('flex');
};

window.editAdminClub = (id, name, catName, tId, grades, cap, loc, desc) => {
    if (!requireAdmin(userRole, isAdminMode)) return;
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
    document.getElementById('admin-club-modal').classList.remove('hidden');
    document.getElementById('admin-club-modal').classList.add('flex');
};

window.closeAdminClubModal = () => {
    document.getElementById('admin-club-modal').classList.add('hidden');
    document.getElementById('admin-club-modal').classList.remove('flex');
};

window.saveAdminClub = async (e) => {
    if (e) e.preventDefault();
    if (!requireAdmin(userRole, isAdminMode)) return;
    
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
        target_grades: document.getElementById('ac_target').value.trim(),
        location: document.getElementById('ac_location').value.trim(),
        max_capacity: parseInt(document.getElementById('ac_capacity').value),
        description: document.getElementById('ac_desc').value.trim(),
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester
    };

    if (!payload.teacher_id) return Swal.fire('เตือน', 'กรุณาเลือกครู', 'warning');

    const id = document.getElementById('ac_id').value;
    const query = id
        ? db.from('club_lists').update(payload).eq('id', id)
        : db.from('club_lists').insert([payload]);
    const { error } = await query;

    if (error) {
        if (error.code === '23505') Swal.fire('ข้อผิดพลาด', 'ครูท่านนี้เปิดชุมนุมในเทอมนี้ไปแล้ว', 'error');
        else Swal.fire('Error', error.message, 'error');
    } else {
        await logUserAction(`${id ? 'แก้ไข' : 'เพิ่ม'}ชุมนุม "${payload.club_name}"`, 'club');
        closeAdminClubModal();
        await loadAdminClubs();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    }
};

window.deleteAdminClub = async (id, name) => {
    if (!requireAdmin(userRole, isAdminMode)) return;
    
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
        await logUserAction(`ลบชุมนุม "${name}"`, 'club');
        await loadAdminClubs();
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
    }
};

// ==========================================
// Admin: Module Settings (ใช้ requireAdmin)
// ==========================================
window.openAdminSettings = () => {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถตั้งค่าระบบได้')) return;
    document.getElementById('admin-settings-modal').classList.remove('hidden');
    document.getElementById('admin-settings-modal').classList.add('flex');
    loadModuleAdmins();
};

window.closeAdminSettings = () => {
    document.getElementById('admin-settings-modal').classList.add('hidden');
    document.getElementById('admin-settings-modal').classList.remove('flex');
};

async function loadModuleAdmins() {
    const sel = document.getElementById('sel-add-module-admin');
    if (sel.tomselect) sel.tomselect.destroy();
    
    sel.innerHTML = '<option value="">-- พิมพ์ค้นหาชื่อครูเพื่อเพิ่มแอดมิน --</option>' +
        allTeachers.map(t => `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}</option>`).join('');
    new TomSelect(sel, { placeholder: 'ค้นหาชื่อครู...', allowEmptyOption: true });

    const { data: admins, error: adminErr } = await db
        .from('core_module_admins')
        .select('id, user_id')
        .eq('module_id', MODULE_ID);

    if (adminErr) {
        console.error('Error loading module admins:', adminErr);
        document.getElementById('tb-module-admins').innerHTML = `
            <tr><td colspan="2" class="py-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>
        `;
        return;
    }

    if (!admins || admins.length === 0) {
        document.getElementById('tb-module-admins').innerHTML = `
            <tr><td colspan="2" class="py-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบย่อย</td></tr>
        `;
        return;
    }

    const userIds = admins.map(a => a.user_id);
    const { data: personnel, error: personErr } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name')
        .in('id', userIds);

    if (personErr) {
        console.error('Error loading personnel:', personErr);
        document.getElementById('tb-module-admins').innerHTML = `
            <tr><td colspan="2" class="py-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูลบุคลากร</td></tr>
        `;
        return;
    }

    const personMap = {};
    personnel.forEach(p => personMap[p.id] = p);

    document.getElementById('tb-module-admins').innerHTML = admins.map(m => {
        const p = personMap[m.user_id];
        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 font-bold text-indigo-800">
                    <i class="fa-solid fa-user-shield text-indigo-400 mr-2"></i>
                    ${p ? `${p.prefix || ''}${p.first_name} ${p.last_name}` : 'ไม่พบข้อมูล'}
                </td>
                <td class="py-3 px-4 text-center">
                    <button onclick="removeModuleAdmin('${m.id}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
                        <i class="fa-solid fa-xmark mr-1"></i> ลบสิทธิ์
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.addModuleAdmin = async () => {
    if (!requireAdmin(userRole, isAdminMode)) return;
    
    const uid = document.getElementById('sel-add-module-admin').value;
    if (!uid) return Swal.fire('เตือน', 'กรุณาเลือกครู', 'warning');
    
    const { data: existing, error: checkErr } = await db
        .from('core_module_admins')
        .select('id')
        .eq('user_id', uid)
        .eq('module_id', MODULE_ID)
        .maybeSingle();
    
    if (existing) {
        return Swal.fire('แจ้งเตือน', 'ครูท่านนี้เป็นผู้ดูแลระบบย่อยอยู่แล้ว', 'info');
    }
    
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    
    try {
        const { error } = await db.from('core_module_admins').insert({
            user_id: uid,
            module_id: MODULE_ID
        });
        
        if (error) throw error;
        
        await logUserAction(`แต่งตั้ง Module Admin (ID: ${uid})`, 'club');
        await loadModuleAdmins();
        
        const sel = document.getElementById('sel-add-module-admin');
        if (sel.tomselect) sel.tomselect.clear();
        else sel.value = '';
        
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('Add module admin error:', err);
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};

window.removeModuleAdmin = async (id) => {
    if (!requireAdmin(userRole, isAdminMode)) return;
    
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบสิทธิ์?',
        text: 'ครูท่านนี้จะไม่สามารถเข้าถึงระบบจัดการชุมนุมในโหมดแอดมินได้อีก',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ยืนยันลบสิทธิ์',
        cancelButtonText: 'ยกเลิก'
    });
    
    if (!isConfirmed) return;
    
    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
    
    try {
        const { error } = await db.from('core_module_admins').delete().eq('id', id);
        if (error) throw error;
        
        await logUserAction(`ลบ Module Admin (ID: ${id})`, 'club');
        await loadModuleAdmins();
        
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ลบสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('Remove module admin error:', err);
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// Dashboard Modals (Unassigned & Pending)
// ==========================================
window.exportDashboardToExcel = (dataType) => {
    if (!isAdminUser(userRole, isAdminMode)) return;
    
    let rawData = dataType === 'unassigned' ? [...unassignedStudentsData] : [...pendingStudentsData];
    let fileName = dataType === 'unassigned' ? 'รายชื่อนักเรียนตกหล่น_ยังไม่เลือกชุมนุม.xlsx' : 'รายชื่อนักเรียน_รอพิจารณาอนุมัติชุมนุม.xlsx';

    if (rawData.length === 0) {
        return Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูลให้ส่งออก', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    }

    rawData.sort((a, b) => {
        const gradeA = parseInt(a.core_classrooms?.grade_level) || 0;
        const gradeB = parseInt(b.core_classrooms?.grade_level) || 0;
        if (gradeA !== gradeB) return gradeA - gradeB;

        const roomA = parseInt(a.core_classrooms?.room_number) || 0;
        const roomB = parseInt(b.core_classrooms?.room_number) || 0;
        if (roomA !== roomB) return roomA - roomB;

        const idA = a.core_students?.student_id_card || '';
        const idB = b.core_students?.student_id_card || '';
        return idA.localeCompare(idB);
    });

    const excelData = rawData.map((e, index) => {
        const stu = e.core_students;
        const cls = e.core_classrooms;
        const adv1 = allTeachers.find(t => t.id === cls.adviser_id_1);
        const adv2 = allTeachers.find(t => t.id === cls.adviser_id_2);

        let row = {
            'ลำดับ': index + 1,
            'ชั้น': `ม.${cls.grade_level}/${cls.room_number}`,
            'เลขประจำตัว': stu.student_id_card || '-',
            'คำนำหน้า': stu.prefix || '',
            'ชื่อ': stu.first_name,
            'นามสกุล': stu.last_name,
            'ครูที่ปรึกษา 1': adv1 ? `${adv1.prefix || ''}${adv1.first_name} ${adv1.last_name}` : '-',
            'ครูที่ปรึกษา 2': adv2 ? `${adv2.prefix || ''}${adv2.first_name} ${adv2.last_name}` : '-'
        };

        if (dataType === 'pending') {
            row['ชุมนุมที่เลือก (รอพิจารณา)'] = e.requested_club;
            row['ครูประจำชุมนุม'] = e.requested_club_teacher;
        }
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อนักเรียน");
    XLSX.writeFile(wb, fileName);
};

window.showUnassignedStudentsModal = () => {
    if (!isAdminUser(userRole, isAdminMode)) return;
    
    if (unassignedStudentsData.length === 0) {
        return Swal.fire({ icon: 'success', title: 'ยอดเยี่ยม!', text: 'นักเรียนทุกคนเลือกชุมนุมครบถ้วน' });
    }

    let tbodyHtml = '';
    unassignedStudentsData.forEach(e => {
        const stu = e.core_students;
        const cls = e.core_classrooms;
        const adv1 = allTeachers.find(t => t.id === cls.adviser_id_1);
        const adv2 = allTeachers.find(t => t.id === cls.adviser_id_2);

        const adv1Name = adv1 ? `${adv1.prefix || ''}${adv1.first_name} ${adv1.last_name}` : '-';
        const adv2Name = adv2 ? `${adv2.prefix || ''}${adv2.first_name} ${adv2.last_name}` : '-';

        tbodyHtml += `
            <tr class="border-b hover:bg-rose-50 transition-colors">
                <td class="py-2 px-3 font-bold text-center">ม.${cls.grade_level}/${cls.room_number}</td>
                <td class="py-2 px-3 font-mono text-slate-600 text-center">${stu.student_id_card || '-'}</td>
                <td class="py-2 px-3 text-rose-700 font-medium">${stu.prefix || ''}${stu.first_name} ${stu.last_name}</td>
                <td class="py-2 px-3 text-slate-600 text-xs">${adv1Name}</td>
                <td class="py-2 px-3 text-slate-600 text-xs">${adv2Name}</td>
            </tr>`;
    });

    const tableHtml = `
        <div class="text-left">
            <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-4 bg-rose-50 p-3 rounded-xl border border-rose-200">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-triangle-exclamation text-rose-500 text-2xl"></i>
                    <div>
                        <p class="font-bold text-rose-800">นักเรียนตกหล่น จำนวน ${unassignedStudentsData.length} คน</p>
                        <p class="text-xs text-rose-600">กรุณาแจ้งครูที่ปรึกษาติดตาม</p>
                    </div>
                </div>
                <button onclick="exportDashboardToExcel('unassigned')" class="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2">
                    <i class="fa-solid fa-file-excel"></i> Export Excel
                </button>
            </div>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
                <table id="dt-unassigned" class="w-full text-left text-sm display nowrap">
                    <thead class="bg-slate-100 text-slate-700">
                        <tr>
                            <th class="py-3 px-3 text-center">ห้อง</th>
                            <th class="py-3 px-3 text-center">รหัสนักเรียน</th>
                            <th class="py-3 px-3">ชื่อ-สกุล</th>
                            <th class="py-3 px-3">ครูที่ปรึกษา (1)</th>
                            <th class="py-3 px-3">ครูที่ปรึกษา (2)</th>
                        </tr>
                    </thead>
                    <tbody>${tbodyHtml}</tbody>
                </table>
            </div>
        </div>`;

    Swal.fire({
        title: 'รายชื่อนักเรียนที่ยังไม่เลือกชุมนุม',
        html: tableHtml,
        width: '1000px',
        showCloseButton: true,
        showConfirmButton: false,
        didOpen: () => {
            $('#dt-unassigned').DataTable({
                responsive: true,
                autoWidth: false,
                pageLength: 10,
                language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
            });
        }
    });
};

window.showPendingStudentsModal = () => {
    if (!isAdminUser(userRole, isAdminMode)) return;
    
    if (pendingStudentsData.length === 0) {
        return Swal.fire({ icon: 'success', title: 'ไม่มีค้าง!', text: 'ไม่มีรายการนักเรียนที่รอการพิจารณาครับ' });
    }

    let tbodyHtml = '';
    pendingStudentsData.forEach(e => {
        const stu = e.core_students;
        const cls = e.core_classrooms;
        tbodyHtml += `
            <tr class="border-b hover:bg-amber-50 transition-colors">
                <td class="py-2 px-3 font-bold text-center">ม.${cls.grade_level}/${cls.room_number}</td>
                <td class="py-2 px-3 font-mono text-slate-600 text-center">${stu.student_id_card || '-'}</td>
                <td class="py-2 px-3 text-slate-800 font-medium">${stu.prefix || ''}${stu.first_name} ${stu.last_name}</td>
                <td class="py-2 px-3"><span class="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-xs font-bold">${e.requested_club}</span></td>
                <td class="py-2 px-3 text-slate-600 text-xs">${e.requested_club_teacher}</td>
            </tr>`;
    });

    const tableHtml = `
        <div class="text-left">
            <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-clock-rotate-left text-amber-500 text-2xl"></i>
                    <div>
                        <p class="font-bold text-amber-800">รอพิจารณาอนุมัติ จำนวน ${pendingStudentsData.length} คน</p>
                        <p class="text-xs text-amber-600">รอดำเนินการจากครูที่ปรึกษาชุมนุม</p>
                    </div>
                </div>
                <button onclick="exportDashboardToExcel('pending')" class="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center justify-center gap-2">
                    <i class="fa-solid fa-file-excel"></i> Export Excel
                </button>
            </div>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
                <table id="dt-pending" class="w-full text-left text-sm display nowrap">
                    <thead class="bg-slate-100 text-slate-700">
                        <tr>
                            <th class="py-3 px-3 text-center">ห้อง</th>
                            <th class="py-3 px-3 text-center">รหัสนักเรียน</th>
                            <th class="py-3 px-3">ชื่อ-สกุล</th>
                            <th class="py-3 px-3">ชุมนุมที่เลือก</th>
                            <th class="py-3 px-3">ครูประจำชุมนุม</th>
                        </tr>
                    </thead>
                    <tbody>${tbodyHtml}</tbody>
                </table>
            </div>
        </div>`;

    Swal.fire({
        title: 'นักเรียนที่รออนุมัติเข้าชุมนุม',
        html: tableHtml,
        width: '1100px',
        showCloseButton: true,
        showConfirmButton: false,
        didOpen: () => {
            $('#dt-pending').DataTable({
                responsive: true,
                autoWidth: false,
                pageLength: 10,
                language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
            });
        }
    });
};

// ==========================================
// Logout (มาตรฐานกลาง)
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
}

// ประกาศฟังก์ชัน global
window.logout = logout;
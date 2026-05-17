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
let categoryMap = {}; // ตัวแปรแมปชื่อกับ ID หมวดหมู่

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
// 2. Role Switcher (สลับโหมด พร้อม Toast Alert)
// ==========================================
window.toggleRoleView = () => {
    const teacherView = document.getElementById('teacher-view');
    const adminView = document.getElementById('admin-view');
    const btnIcon = document.getElementById('mode-icon');
    const btnText = document.getElementById('mode-text');
    const btnToggle = document.getElementById('btnAdminMode');

    // 🌟 สร้าง Config สำหรับ Toast Alert
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    if (currentMode === 'teacher') {
        // สลับไปโหมดแอดมิน
        currentMode = 'admin';
        teacherView.classList.replace('block', 'hidden');
        adminView.classList.replace('hidden', 'block');
        btnIcon.className = 'fa-solid fa-chalkboard-user sm:mr-1';
        btnText.innerText = 'โหมดครูผู้สอน';
        
        btnToggle.classList.replace('bg-purple-50', 'bg-blue-50');
        btnToggle.classList.replace('text-purple-600', 'text-blue-600');
        btnToggle.classList.replace('border-purple-200', 'border-blue-200');
        
        loadAdminClubs();
        
        // 🌟 แสดง Toast แอดมิน
        Toast.fire({
            icon: 'success',
            title: 'สลับเป็นโหมด ผู้ดูแลระบบ'
        });
        
    } else {
        // สลับไปโหมดครู
        currentMode = 'teacher';
        adminView.classList.replace('block', 'hidden');
        teacherView.classList.replace('hidden', 'block');
        btnIcon.className = 'fa-solid fa-user-shield sm:mr-1';
        btnText.innerText = 'โหมดแอดมิน';
        
        btnToggle.classList.replace('bg-blue-50', 'bg-purple-50');
        btnToggle.classList.replace('text-blue-600', 'text-purple-600');
        btnToggle.classList.replace('border-blue-200', 'border-purple-200');
        
        loadMyClub();
        
        // 🌟 แสดง Toast ครู
        Toast.fire({
            icon: 'success',
            title: 'สลับเป็นโหมด ครูผู้สอน'
        });
    }
};

// ==========================================
// แก้ไข Error: ซ่อมฟังก์ชันสลับแท็บของแอดมิน
// ==========================================
window.switchAdminTab = (tabId) => {
    // ซ่อนทุกแท็บก่อน
    document.getElementById('admin-tab-clubs').classList.replace('block', 'hidden');
    document.getElementById('admin-tab-students').classList.replace('block', 'hidden');

    // รีเซ็ตสีปุ่ม
    document.getElementById('btn-admin-tab-clubs').className = "px-5 py-2.5 rounded-t-xl bg-transparent text-slate-500 hover:bg-slate-200 font-bold transition-colors";
    document.getElementById('btn-admin-tab-students').className = "px-5 py-2.5 rounded-t-xl bg-transparent text-slate-500 hover:bg-slate-200 font-bold transition-colors";

    // แสดงแท็บที่เลือก และเปลี่ยนสีปุ่มให้แอคทีฟ
    document.getElementById(tabId).classList.replace('hidden', 'block');
    document.getElementById(`btn-${tabId}`).className = "px-5 py-2.5 rounded-t-xl bg-purple-600 text-white font-bold transition-colors shadow-sm";

    // ถ้ากดแท็บนักเรียน ให้โหลดข้อมูล
    if (tabId === 'admin-tab-students') {
        loadAllStudentsReport();
    }
};

// ==========================================
// 3. Teacher Module: จัดการชุมนุมตัวเอง
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
        
        // 🌟 แก้ไข: ทำให้ปุ่มสลับสถานะ ล็อค <-> ปลดล็อค ได้
        if (club.is_locked) {
            btnLock.className = "px-4 py-2 rounded-lg font-bold shadow-md transition-colors bg-slate-500 text-white hover:bg-slate-600";
            btnLock.innerHTML = '<i class="fa-solid fa-lock-open mr-1"></i> ปลดล็อคชุมนุม';
            btnLock.onclick = unlockMyClub; // โยงไปฟังก์ชันปลดล็อค
        } else {
            btnLock.className = "px-4 py-2 rounded-lg font-bold shadow-md transition-colors bg-emerald-600 text-white hover:bg-emerald-700";
            btnLock.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> ยืนยันปิดรับสมัคร';
            btnLock.onclick = lockClub; // โยงไปฟังก์ชันล็อค
        }
        await loadTeacherApplicants();
    } else {
        myClubInfo = null;
        document.getElementById('no-club-display').classList.remove('hidden');
        document.getElementById('my-club-display').classList.add('hidden');
        document.getElementById('btn-lock-club').classList.add('hidden');
        if ($.fn.DataTable.isDataTable('#teacherStudentsTable')) $('#teacherStudentsTable').DataTable().clear().draw();
    }
}

// ฟังก์ชันล็อคชุมนุม (ของครู)
window.lockClub = async () => {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันปิดรับสมัคร?', html: '<span class="text-red-500 text-sm">นักเรียนที่สถานะค้างอยู่ (รอพิจารณา) จะถูกปรับเป็น "ไม่อนุมัติ" อัตโนมัติ</span>', icon: 'warning', showCancelButton: true, confirmButtonColor: '#10b981' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
        await db.from('club_registrations').update({ status: 'rejected', rejection_reason: 'ปิดรับสมัคร' }).eq('club_id', myClubInfo.id).eq('status', 'pending');
        await db.from('club_lists').update({ is_locked: true }).eq('id', myClubInfo.id);
        loadMyClub();
        Swal.fire({ icon: 'success', title: 'ล็อคชุมนุมเรียบร้อย', timer: 1500, showConfirmButton: false });
    }
};

// 🌟 เพิ่มฟังก์ชันปลดล็อคชุมนุม (ของครู)
window.unlockMyClub = async () => {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันปลดล็อค?',
        text: 'การปลดล็อคจะทำให้นักเรียนกลับมาเลือกชุมนุมนี้ได้อีกครั้ง (นักเรียนที่ถูกปฏิเสธไปแล้วจะต้องกดสมัครเข้ามาใหม่)',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b' // สีเหลืองส้ม
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังปลดล็อค...', didOpen: () => Swal.showLoading() });
        await db.from('club_lists').update({ is_locked: false }).eq('id', myClubInfo.id);
        loadMyClub();
        Swal.fire({ icon: 'success', title: 'ปลดล็อคชุมนุมเรียบร้อย', timer: 1500, showConfirmButton: false });
    }
};

async function loadTeacherApplicants() {
    if (!myClubInfo) return;
    const { data: members, error } = await db.from('club_registrations')
        .select(`id, status, is_confirmed, rejection_reason, core_students ( student_id_card, prefix, first_name, last_name, student_enrollments ( core_classrooms (grade_level, room_number, academic_year, semester) ) )`)
        .eq('club_id', myClubInfo.id);

    if (error) return;

    teacherApplicantsData = members.map(m => {
        const stu = m.core_students;
        const currentEnr = stu.student_enrollments?.find(e => e.core_classrooms.academic_year === currentSchoolInfo.current_academic_year && e.core_classrooms.semester === currentSchoolInfo.current_semester);
        return {
            id: m.id,
            stu_id: stu.student_id_card,
            full_name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`,
            classroom: currentEnr ? `ม.${currentEnr.core_classrooms.grade_level}/${currentEnr.core_classrooms.room_number}` : 'ไม่ระบุ',
            status: m.status,
            reason: m.rejection_reason
        };
    });

    $('#enrolled-count').text(teacherApplicantsData.filter(m => m.status !== 'rejected').length);

    if ($.fn.DataTable.isDataTable('#teacherStudentsTable')) $('#teacherStudentsTable').DataTable().destroy();

    document.getElementById('tb-teacher-students').innerHTML = teacherApplicantsData.map(m => {
        let stBadge = m.status === 'approved' ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติ</span>'
            : (m.status === 'rejected' ? `<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700" title="${m.reason || ''}">ไม่อนุมัติ</span>`
                : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-700">รอพิจารณา</span>');

        let acts = '-';
        if (!myClubInfo.is_locked && m.status === 'pending') {
            acts = `<button onclick="updateStatus('${m.id}', 'approved')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-2 py-1 rounded shadow-sm mr-1"><i class="fa-solid fa-check"></i> รับ</button>
                    <button onclick="promptReject('${m.id}')" class="bg-red-50 text-red-600 hover:bg-red-500 hover:text-white px-2 py-1 rounded shadow-sm"><i class="fa-solid fa-times"></i> ปฏิเสธ</button>`;
        } else if (!myClubInfo.is_locked && m.status === 'approved') {
            acts = `<button onclick="updateStatus('${m.id}', 'pending')" class="text-xs text-amber-600 underline hover:text-amber-800">ยกเลิกการรับ</button>`;
        }

        return `<tr class="hover:bg-blue-50/50"><td class="py-3 px-4 font-mono text-blue-700">${m.stu_id}</td><td class="py-3 px-4">${m.full_name}</td><td class="py-3 px-4">${m.classroom}</td><td class="py-3 px-4 text-center">${stBadge}</td><td class="py-3 px-4 text-center">${acts}</td></tr>`;
    }).join('');

    $('#teacherStudentsTable').DataTable({ responsive: true, scrollX: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' } });
}

window.updateStatus = async (id, status, reason = null) => {
    // 🌟 1. ดักจับ: ถ้าครูจะกด "อนุมัติ" ให้เช็คยอดก่อน
    if (status === 'approved') {
        // นับยอดนักเรียนที่สถานะเป็น 'approved' ในชุมนุมนี้
        const currentApprovedCount = teacherApplicantsData.filter(m => m.status === 'approved').length;
        
        // ถ้ายอดคนที่อนุมัติไปแล้ว มากกว่าหรือเท่ากับ โควตาที่รับได้ ให้บล็อกทันที
        if (currentApprovedCount >= myClubInfo.max_capacity) {
            return Swal.fire({
                title: 'โควตาเต็มแล้ว!',
                html: `ชุมนุมนี้อนุมัตินักเรียนครบ <b>${myClubInfo.max_capacity}</b> คนตามเป้าแล้ว<br><br><span class="text-sm text-red-500">* หากต้องการรับนักเรียนคนนี้ กรุณากด "ยกเลิกการรับ" คนเก่าออกก่อนครับ</span>`,
                icon: 'error',
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'ตกลง'
            });
        }
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    
    const payload = { status };
    
    // 🌟 2. เคลียร์เหตุผลปฏิเสธทิ้ง หากครูเปลี่ยนใจกลับมารับนักเรียน
    if (status === 'approved') {
        payload.rejection_reason = null; 
    } else if (reason) {
        payload.rejection_reason = reason;
    }

    await db.from('club_registrations').update(payload).eq('id', id);
    
    // รีเฟรชตารางใหม่
    await loadTeacherApplicants();
    Swal.close();
};

window.promptReject = async (id) => {
    const { value: reason } = await Swal.fire({
        title: 'ปฏิเสธนักเรียน', input: 'text', inputPlaceholder: 'ระบุเหตุผล (เช่น เต็ม, เกรดไม่ถึง)',
        showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ปฏิเสธ',
        inputValidator: (v) => !v && 'กรุณาระบุเหตุผล'
    });
    if (reason) updateStatus(id, 'rejected', reason);
};

window.exportTeacherExcel = () => {
    if (teacherApplicantsData.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ Export', 'info');
    const ws = XLSX.utils.json_to_sheet(teacherApplicantsData.map(m => ({ 'รหัสนักเรียน': m.stu_id, 'ชื่อ-สกุล': m.full_name, 'ชั้นเรียน': m.classroom, 'สถานะ': m.status === 'approved' ? 'อนุมัติ' : (m.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอ'), 'หมายเหตุ': m.reason || '' })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายชื่อชุมนุม_${myClubInfo.club_name}.xlsx`);
};

// ==========================================
// 4. Admin Module: จัดการส่วนกลาง
// ==========================================

async function loadAdminClubs() {
    const { data, error } = await db.from('club_lists')
        .select(`*, core_personnel(prefix, first_name, last_name), club_categories(name)`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);

    if (error) return;
    allClubsData = data || [];

    if ($.fn.DataTable.isDataTable('#adminClubsTable')) $('#adminClubsTable').DataTable().destroy();
    document.getElementById('tb-admin-clubs').innerHTML = allClubsData.map(c => {
        const tName = c.core_personnel ? `${c.core_personnel.prefix || ''}${c.core_personnel.first_name} ${c.core_personnel.last_name}` : 'ไม่ระบุ';
        const stBadge = c.is_locked ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">ปิดแล้ว</span>' : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">เปิดรับ</span>';

        const safeClubName = c.club_name.replace(/'/g, "\\'");
        const safeDesc = (c.description || '').replace(/'/g, "\\'");
        const safeCatName = (c.club_categories?.name || '').replace(/'/g, "\\'");

        return `<tr class="hover:bg-purple-50/50">
            <td class="py-3 px-4 font-bold text-purple-700">${c.club_name}</td>
            <td class="py-3 px-4">${c.club_categories?.name || '-'}</td>
            <td class="py-3 px-4">${tName}</td>
            <td class="py-3 px-4">${c.target_grades}</td>
            <td class="py-3 px-4 text-center">${c.max_capacity}</td>
            <td class="py-3 px-4 text-center">${stBadge}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
                <button onclick="viewClubStudents('${c.id}', '${safeClubName}')" class="text-blue-600 hover:text-blue-800 text-sm font-bold px-2 rounded" title="ดูรายชื่อนักเรียน">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button onclick="toggleLockAdminClub('${c.id}', ${c.is_locked}, '${safeClubName}')" 
                        class="${c.is_locked ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white'} text-sm font-bold w-8 h-8 rounded-lg transition-colors mr-1" 
                        title="${c.is_locked ? 'ปลดล็อคชุมนุม' : 'ล็อคชุมนุม'}">
                    <i class="fa-solid ${c.is_locked ? 'fa-lock-open' : 'fa-lock'}"></i>
                </button>
                <button onclick="editAdminClub('${c.id}', '${safeClubName}', '${safeCatName}', '${c.teacher_id}', '${c.target_grades}', '${c.max_capacity}', '${c.location}', '${safeDesc}')" class="text-yellow-600 hover:text-yellow-800 text-sm font-bold px-2 rounded">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteAdminClub('${c.id}', '${safeClubName}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 rounded">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
    
    $('#adminClubsTable').DataTable({
        responsive: true,
        scrollX: true,
        order: [[1, 'asc']], // เรียงตามคอลัมน์ที่ 1 (หมวดหมู่) จากน้อยไปมาก
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

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
                id_card: stu.student_id_card,
                full_name: `${stu.prefix || ''}${stu.first_name} ${stu.last_name}`,
                classroom,
                status: statusText,
                statusColor
            };
        });

        let html = `
        <div class="text-left">
            <p class="font-bold mb-2 text-lg">📋 นักเรียนในชุมนุม <span class="text-purple-600">${clubName}</span> (${rows.length} คน)</p>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-gray-100 sticky top-0">
                        <tr>
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
                    <td class="py-2 px-3 font-mono text-gray-700">${r.id_card}</td>
                    <td class="py-2 px-3 font-medium">${r.full_name}</td>
                    <td class="py-2 px-3">${r.classroom}</td>
                    <td class="py-2 px-3 font-bold ${r.statusColor}">${r.status}</td>
                </tr>`;
        });

        html += `</tbody></table></div></div>`;

        Swal.fire({ title: 'รายชื่อนักเรียน', html: html, width: '850px', confirmButtonText: 'ปิด', customClass: { popup: 'text-sm rounded-xl' }});
    } catch (err) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    }
};

// 🌟 เพิ่มฟังก์ชันเปิด-ปิดล็อค สำหรับแอดมิน
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
        
        // ถ้าแอดมินกดล็อค ให้เด้งเด็กที่ค้างอยู่ออกด้วย
        if (!isCurrentlyLocked) {
           await db.from('club_registrations').update({ status: 'rejected', rejection_reason: 'แอดมินปิดรับสมัคร' }).eq('club_id', id).eq('status', 'pending');
        }
        
        // อัปเดตสถานะล็อค
        await db.from('club_lists').update({ is_locked: !isCurrentlyLocked }).eq('id', id);
        
        await loadAdminClubs();
        Swal.fire('สำเร็จ', `${actionText}ชุมนุมเรียบร้อยแล้ว`, 'success');
    }
};

function updateTeacherAvatarPreview(teacherId) {
    const container = document.getElementById('teacher-avatar-preview-container');
    const img = document.getElementById('teacher-avatar-img');
    const urlInput = document.getElementById('ac_teacher_avatar_url');

    if (!teacherId || !container) return;

    const teacher = allTeachers.find(t => t.id === teacherId);
    if (teacher) {
        container.style.display = 'block';
        if(urlInput) urlInput.value = teacher.avatar_url || '';
        if (teacher.avatar_url) {
            img.src = teacher.avatar_url;
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
    if(urlInput) urlInput.value = data.avatar_url || '';
    const img = document.getElementById('teacher-avatar-img');
    if (data.avatar_url) {
        img.src = data.avatar_url;
        img.style.display = 'block';
    } else {
        img.src = '';
        img.style.display = 'none';
    }

    const teacher = allTeachers.find(t => t.id === teacherId);
    if (teacher) {
        teacher.avatar_url = data.avatar_url;
    }
    Swal.fire({ icon: 'success', title: 'ดึงข้อมูลรูปครูสำเร็จ', timer: 1000, showConfirmButton: false });
};

window.clearTeacherAvatar = () => {
    const urlInput = document.getElementById('ac_teacher_avatar_url');
    if(urlInput) urlInput.value = '';
    const img = document.getElementById('teacher-avatar-img');
    if(img) {
        img.src = '';
        img.style.display = 'none';
    }
};

function initAdminTomSelect() {
    const tsEl = document.getElementById('ac_teacher');
    if (tsEl.tomselect) tsEl.tomselect.destroy();
    tsEl.innerHTML = '<option value="">-- ค้นหาชื่อครู... --</option>' + allTeachers.map(t => `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}</option>`).join('');
    const teacherTS = new TomSelect(tsEl, { placeholder: 'ค้นหาชื่อครู...', allowEmptyOption: true });

    teacherTS.on('change', (value) => { updateTeacherAvatarPreview(value); });

    const tsCat = document.getElementById('ac_category');
    if (tsCat.tomselect) tsCat.tomselect.destroy();
    
    categoryMap = {}; 
    let catOptions = [];
    allCategories.forEach(c => { categoryMap[c.name] = c.id; catOptions.push({value: c.name, text: c.name}); });

    new TomSelect(tsCat, {
        options: catOptions,
        create: true,
        valueField: 'value',
        labelField: 'text',
        searchField: 'text',
        placeholder: 'เลือก หรือ พิมพ์หมวดหมู่ใหม่ที่นี่...',
        render: {
            option_create: function(data, escape) {
                return '<div class="create text-blue-600 font-bold p-2 bg-blue-50"> <i class="fa-solid fa-plus-circle mr-1"></i> เพิ่มหมวดหมู่: <strong>' + escape(data.input) + '</strong>&hellip;</div>';
            }
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
    if(gradesSelect) gradesSelect.value = grades;
    
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
    const query = id ? db.from('club_lists').update(payload).eq('id', id) : db.from('club_lists').insert([payload]);
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
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', html: `ลบ <b>${name}</b> ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        await db.from('club_lists').delete().eq('id', id);
        await loadAdminClubs();
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
    }
};

// --- Admin: Students Tracker (All School) ---
async function loadAllStudentsReport() {
    Swal.fire({ title: 'กำลังดึงข้อมูลทั้งโรงเรียน...', didOpen: () => Swal.showLoading() });
    try {
        const { data: enrolls } = await db.from('student_enrollments')
            .select(`student_id, core_classrooms!inner(grade_level, room_number), core_students(student_id_card, prefix, first_name, last_name)`)
            .eq('core_classrooms.academic_year', currentSchoolInfo.current_academic_year)
            .eq('core_classrooms.semester', currentSchoolInfo.current_semester);
        
        const { data: mems } = await db.from('club_registrations')
            .select(`student_id, status, rejection_reason, club_lists(club_name)`)
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester);

        const memMap = {};
        if (mems) mems.forEach(m => memMap[m.student_id] = m);

        allStudentsReportData = enrolls.map(e => {
            const stu = e.core_students;
            const club = memMap[e.student_id];
            return {
                id_card: stu.student_id_card,
                full_name: `${stu.prefix||''}${stu.first_name} ${stu.last_name}`,
                classroom: `ม.${e.core_classrooms.grade_level}/${e.core_classrooms.room_number}`,
                club_name: club ? club.club_lists?.club_name : '-',
                status: club ? club.status : 'not_applied',
                comment: club ? club.rejection_reason||'-' : '-'
            };
        });

        if ($.fn.DataTable.isDataTable('#adminAllStudentsTable')) $('#adminAllStudentsTable').DataTable().destroy();
        document.getElementById('tb-admin-all-students').innerHTML = allStudentsReportData.map(s => {
            let badge = s.status === 'not_applied' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-500">ยังไม่เลือก</span>' : (s.status === 'approved' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติ</span>' : (s.status === 'rejected' ? '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-red-100 text-red-700">ไม่อนุมัติ</span>' : '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700">รอตรวจ</span>'));
            return `<tr class="hover:bg-purple-50"><td class="py-3 px-4 font-mono">${s.id_card}</td><td class="py-3 px-4">${s.full_name}</td><td class="py-3 px-4">${s.classroom}</td><td class="py-3 px-4 font-bold text-purple-700">${s.club_name}</td><td class="py-3 px-4 text-center">${badge}</td><td class="py-3 px-4 text-xs text-red-500">${s.comment}</td></tr>`;
        }).join('');

        $('#adminAllStudentsTable').DataTable({ 
            responsive: true, 
            scrollX: true,
            order: [[2, 'asc']], // เรียงตามคอลัมน์ระดับชั้นจากน้อยไปมาก 
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }});
        Swal.close();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
}

window.exportAllStudentsExcel = () => {
    if (allStudentsReportData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(allStudentsReportData.map(s => ({'เลขประจำตัว':s.id_card, 'ชื่อสกุล':s.full_name, 'ห้อง':s.classroom, 'ชุมนุม':s.club_name, 'สถานะ':s.status, 'หมายเหตุ':s.comment})));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `รายงานนักเรียนสมัครชุมนุม_เทอม${currentSchoolInfo.current_semester}_${currentSchoolInfo.current_academic_year}.xlsx`);
};

// --- Admin: Settings (Module Admins) ---
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
    if(sel.tomselect) sel.tomselect.destroy();
    
    sel.innerHTML = '<option value="">-- พิมพ์ค้นหาชื่อครูเพื่อเพิ่มแอดมิน --</option>' + allTeachers.map(t => `<option value="${t.id}">${t.prefix||''}${t.first_name} ${t.last_name}</option>`).join('');
    new TomSelect(sel, { placeholder: 'ค้นหาชื่อครู...', allowEmptyOption: true });

    const { data } = await db.from('core_module_admins').select(`id, core_personnel(prefix, first_name, last_name)`).eq('module_id', MODULE_ID);
    document.getElementById('tb-module-admins').innerHTML = (data||[]).map(m => `
        <tr class="hover:bg-slate-50"><td class="py-3 px-4 font-bold text-indigo-800"><i class="fa-solid fa-user-shield text-indigo-400 mr-2"></i>${m.core_personnel.prefix||''}${m.core_personnel.first_name} ${m.core_personnel.last_name}</td>
        <td class="py-3 px-4 text-center"><button onclick="removeModuleAdmin('${m.id}')" class="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded transition"><i class="fa-solid fa-xmark"></i></button></td></tr>
    `).join('');
}

window.addModuleAdmin = async () => {
    const uid = document.getElementById('select_new_admin').value;
    if (!uid) return Swal.fire('เตือน', 'กรุณาเลือกครู', 'warning');
    await db.from('core_module_admins').insert({ user_id: uid, module_id: MODULE_ID });
    loadModuleAdmins(); Swal.fire({toast:true, position:'top-end', icon:'success', title:'สำเร็จ', timer:1500, showConfirmButton:false});
};

window.removeModuleAdmin = async (id) => {
    await db.from('core_module_admins').delete().eq('id', id);
    loadModuleAdmins();
};

// ==========================================
// 5. Excel Import (Full Version)
// ==========================================

window.downloadClubTemplate = () => {
    const ws_data = [
        [
            'ชื่อชุมนุม',
            'ชื่อหมวดหมู่',
            'ครูผู้รับผิดชอบ (ชื่อ-สกุล)',
            'ระดับชั้นที่รับ (เป้าหมาย)',
            'จำนวนที่รับ (คน)',
            'สถานที่จัดกิจกรรม',
            'รายละเอียด'
        ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // กำหนดความกว้างคอลัมน์ให้พอดี
    ws['!cols'] = [
        { wch: 25 }, // ชื่อชุมนุม
        { wch: 20 }, // หมวดหมู่
        { wch: 25 }, // ครู
        { wch: 18 }, // ระดับชั้น
        { wch: 15 }, // จำนวนที่รับ
        { wch: 25 }, // สถานที่
        { wch: 30 }  // รายละเอียด
    ];
    
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
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
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

            // เตรียมข้อมูล Dictionary เพื่อการจับคู่ที่รวดเร็ว
            const teacherMap = {};
            allTeachers.forEach(t => {
                const fullName = `${t.prefix || ''}${t.first_name} ${t.last_name}`.trim();
                teacherMap[fullName] = t.id;
                // เผื่อกรอกแบบไม่มีคำนำหน้า
                const nameWithoutPrefix = `${t.first_name} ${t.last_name}`.trim();
                teacherMap[nameWithoutPrefix] = t.id;
            });

            const categoryMapByName = {};
            allCategories.forEach(c => categoryMapByName[c.name] = c.id);

            // เช็คว่ามีครูคนไหนเปิดชุมนุมไปแล้วบ้าง
            const { data: existingClubs } = await db.from('club_lists')
                .select('teacher_id')
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .eq('semester', currentSchoolInfo.current_semester);
                
            const teachersWithClub = new Set((existingClubs || []).map(c => c.teacher_id));

            const errors = [];
            let successCount = 0;

            // เริ่มตรวจสอบและเพิ่มข้อมูลทีละแถว
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue; // ข้ามแถวว่าง

                const clubName = (row[headerIndices.club_name] || '').toString().trim();
                if (!clubName) {
                    errors.push(`แถว ${i + 1}: ไม่ได้ระบุชื่อชุมนุม`);
                    continue;
                }

                const categoryName = (row[headerIndices.category] || '').toString().trim();
                const teacherFullName = (row[headerIndices.teacher] || '').toString().trim();
                const targetGrades = (row[headerIndices.target_grades] || '').toString().trim();
                const maxCapacity = parseInt(row[headerIndices.max_capacity]) || 20;
                const location = (row[headerIndices.location] || '').toString().trim();
                const description = (row[headerIndices.description] || '').toString().trim();

                // 🔍 ตรวจสอบว่าครูมีในระบบหรือไม่
                const teacherId = teacherMap[teacherFullName];
                if (!teacherId) {
                    errors.push(`แถว ${i + 1}: ไม่พบครู "${teacherFullName}" ในระบบ`);
                    continue;
                }

                // 🔍 ตรวจสอบว่าครูมีชุมนุมอยู่แล้วหรือไม่
                if (teachersWithClub.has(teacherId)) {
                    errors.push(`แถว ${i + 1}: ครู "${teacherFullName}" มีชุมนุมในเทอมนี้แล้ว (ข้าม)`);
                    continue;
                }

                // จัดการหมวดหมู่ชุมนุม (ถ้ายังไม่มีให้สร้างใหม่เลย)
                let categoryId = categoryMapByName[categoryName];
                if (!categoryId && categoryName) {
                    try {
                        const { data: newCat, error: catErr } = await db.from('club_categories')
                            .insert([{ name: categoryName }])
                            .select()
                            .single();
                        if (catErr) throw new Error('สร้างหมวดหมู่ล้มเหลว');
                        
                        categoryId = newCat.id;
                        allCategories.push(newCat);
                        categoryMapByName[categoryName] = newCat.id;
                    } catch (e) {
                        errors.push(`แถว ${i + 1}: ไม่สามารถเพิ่มหมวดหมู่ใหม่ได้`);
                        continue;
                    }
                }

                // บันทึกข้อมูลลงฐานข้อมูล
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
                    teachersWithClub.add(teacherId); // ป้องกันการเพิ่มซ้ำในลูป
                    successCount++;
                }
            }

            // --- สรุปผลลัพธ์การนำเข้า ---
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

            document.getElementById('excelUploadClubs').value = ''; // เคลียร์ช่อง input
            await loadAdminClubs(); // รีเฟรชตาราง

        } catch (err) {
            Swal.fire('Error', err.message, 'error');
            document.getElementById('excelUploadClubs').value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

// 🌟 ฟังก์ชันส่งออกรายชื่อชุมนุมทั้งหมดประจำเทอม (สำหรับแอดมิน)
window.exportClubsToExcel = () => {
    if (allClubsData.length === 0) {
        return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลชุมนุมในภาคเรียนนี้ให้ส่งออก', 'info');
    }

    // แปลงข้อมูลให้เป็นภาษาไทยและจัดเรียงคอลัมน์ให้สวยงาม
    const exportData = allClubsData.map(c => {
        const tName = c.core_personnel ? `${c.core_personnel.prefix || ''}${c.core_personnel.first_name} ${c.core_personnel.last_name}` : 'ไม่ระบุ';
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

    // สั่งสร้างไฟล์ Excel ด้วย SheetJS (XLSX)
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // กำหนดความกว้างของคอลัมน์ให้อ่านง่าย
    ws['!cols'] = [
        { wch: 25 }, // ชื่อชุมนุม
        { wch: 20 }, // หมวดหมู่
        { wch: 25 }, // ครู
        { wch: 22 }, // ระดับชั้น
        { wch: 15 }, // จำนวนที่รับ
        { wch: 20 }, // สถานที่
        { wch: 18 }, // สถานะ
        { wch: 30 }  // รายละเอียด
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อชุมนุมทั้งหมด");
    
    // ตั้งชื่อไฟล์ตามปีการศึกษาและเทอมปัจจุบันโดยอัตโนมัติ
    const fileName = `รายชื่อชุมนุมทั้งหมด_เทอม${currentSchoolInfo.current_semester}_ปี${currentSchoolInfo.current_academic_year}.xlsx`;
    XLSX.writeFile(wb, fileName);
};
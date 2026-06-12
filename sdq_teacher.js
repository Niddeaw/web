// sdq_teacher.js — Unified Teacher + Admin (v5)
// รองรับการประเมินแบบ step (ทีละข้อ) สำหรับครู พร้อมแสดงชื่อนักเรียน

let userInfo = null;
let currentSchoolInfo = null;
let systemDataList = [];
let tableInstance = null;

let isTeacher = false;
let isAdmin = false;
let isCurrentAdminMode = false; // false=teacher, true=admin
let myClassIds = [];

// =================== ตัวแปรสำหรับฟอร์มประเมินครู (step) ===================
let teacherQuestions = [];
let teacherAnswers = {};
let currentTeacherQIndex = 0;
let currentTeacherEnrollment = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==========================================
// 🚀 เริ่มต้น
// ==========================================
$(document).ready(async function () {
    try {
        await fetchCoreInfo();
        const authorized = await checkAuthAndRoles();
        if (authorized) {
            setupUI();
            await loadData();
            document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        }
    } catch (err) {
        console.error("System Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// 1. ดึงข้อมูลโรงเรียน
// ==========================================
async function fetchCoreInfo() {
    const { data, error } = await db.from('core_school_info').select('*').single();
    if (error) throw error;
    currentSchoolInfo = data;
}

// ==========================================
// 2. ตรวจสอบสิทธิ์
// ==========================================
async function checkAuthAndRoles() {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) { window.location.href = 'login.html'; return false; }

    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) { window.location.href = 'index.html'; return false; }

    userInfo = personnel;
    $('#user-display').text(`${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}`);

    if (['admin', 'super_admin'].includes(personnel.role)) isAdmin = true;
    if (!isAdmin) {
        const { data: modAdmin } = await db.from('core_module_admins').select('id').eq('user_id', user.id).eq('module_id', 'sdq').maybeSingle();
        if (modAdmin) isAdmin = true;
    }

    const { data: classrooms } = await db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .or(`adviser_id_1.eq.${user.id},adviser_id_2.eq.${user.id}`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);
    if (classrooms && classrooms.length > 0) {
        isTeacher = true;
        myClassIds = classrooms.map(c => c.id);
    }

    if (!isAdmin && !isTeacher) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์ในระบบนี้', 'error');
        window.location.href = 'index.html';
        return false;
    }
    isCurrentAdminMode = !isTeacher;
    return true;
}

function setupUI() {
    if (isAdmin && isTeacher) {
        $('#roleSwitchContainer').html(`
            <button id="btnToggleMode" onclick="toggleTeacherAdminMode()"
                class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all">
            </button>
        `);
    }
    if (isAdmin) $('#adminManagerBtn').removeClass('hidden');
    updateToggleModeUI();
}

// ========== Toggle Mode ==========
function updateToggleModeUI() {
    const btn = document.getElementById('btnToggleMode');
    const badge = document.getElementById('pageBadge');
    if (isCurrentAdminMode) {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i><span class="hidden sm:inline">โหมดแอดมิน</span>';
            btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-all';
        }
        if (badge) badge.textContent = 'Admin View — เลือกดูทีละห้อง';
    } else {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i><span class="hidden sm:inline">โหมดครู</span>';
            btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 transition-all';
        }
        if (badge) badge.textContent = 'Teacher View — เฉพาะห้องโฮมรูม';
    }
}

async function toggleTeacherAdminMode() {
    isCurrentAdminMode = !isCurrentAdminMode;
    updateToggleModeUI();
    if (!isCurrentAdminMode) {
        $('#adminFilters').addClass('hidden');
        if (classroomTomSelect) classroomTomSelect.clear(true);
    }
    Swal.fire({
        toast: true, position: 'top-end', icon: 'info',
        title: isCurrentAdminMode
            ? '<i class="fas fa-user-shield mr-1"></i> เปลี่ยนเป็นโหมดแอดมิน'
            : '<i class="fas fa-chalkboard-user mr-1"></i> เปลี่ยนเป็นโหมดครู',
        showConfirmButton: false, timer: 2000
    });
    await loadData();
}

// ==========================================
// 4. โหลดข้อมูล
// ==========================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    systemDataList = [];

    if (!isCurrentAdminMode) {
        $('#mode-subtitle').text('Teacher Dashboard').removeClass('text-rose-500').addClass('text-slate-500');
        $('#table-title').html('<i class="fa-solid fa-users mr-2 text-indigo-500"></i> รายชื่อนักเรียนประจำชั้น');
        $('#adminFilters').addClass('hidden');
    } else {
        $('#mode-subtitle').text('Admin Dashboard').removeClass('text-slate-500').addClass('text-rose-500');
        $('#table-title').html('<i class="fa-solid fa-globe mr-2 text-indigo-500"></i> นักเรียนทั้งหมดทุกระดับชั้น');
        $('#adminFilters').removeClass('hidden');
    }

    try {
        let classIds = [];
        if (!isCurrentAdminMode) {
            classIds = myClassIds;
        } else {
            // ✅ Admin: โหลดเฉพาะรายชื่อห้องเรียนของปีการศึกษา + ภาคเรียนปัจจุบัน
            const { data: allClassrooms, error: cErr } = await db.from('core_classrooms')
                .select('id, grade_level, room_number')
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .eq('semester', currentSchoolInfo.current_semester)
                .order('grade_level').order('room_number');
            if (cErr) throw cErr;
            setupClassroomSelector(allClassrooms || []);
            systemDataList = [];
            updateDashboard([]);
            showSelectPrompt();
            Swal.close();
            return;
        }

        // โหมดครู: โหลดนักเรียนในห้องที่ปรึกษา
        const { data, error } = await db.from('student_enrollments')
            .select(`
                id, student_number, classroom_id,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (id, grade_level, room_number),
                sdq_assessments (
                    id, total_difficulty_score, assessor_type,
                    score_emotional, score_conduct, score_hyper, score_peer, score_prosocial,
                    created_at, academic_year, semester, q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,
                    q11,q12,q13,q14,q15,q16,q17,q18,q19,q20,q21,q22,q23,q24,q25
                )
            `)
            .in('classroom_id', classIds)
            .order('student_number', { ascending: true });

        if (error) throw error;

        const curYear = currentSchoolInfo.current_academic_year;
        const curSem = currentSchoolInfo.current_semester;
        systemDataList = (data || []).map(item => ({
            ...item,
            sdq_assessments: (item.sdq_assessments || []).filter(a => a.academic_year === curYear && a.semester === curSem)
        }));

        updateDashboard(systemDataList);
        renderTable(systemDataList);
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้: ' + err.message, 'error');
    }
}

// ==========================================
// Admin: Tom Select เลือกห้องเรียนก่อนโหลด
// ==========================================
let classroomTomSelect = null;

function setupClassroomSelector(classrooms) {
    const select = document.getElementById('classroomPicker');
    if (!select) return;

    // ✅ Destroy ก่อนเสมอ เพื่อ reset state ให้สะอาด
    if (classroomTomSelect) {
        classroomTomSelect.destroy();
        classroomTomSelect = null;
    }
    select.innerHTML = '';

    // ✅ Flat list ไม่มี optgroup — เรียงตาม grade แล้ว room
    //    (optgroup ทำให้ TomSelect scroll ไม่ถึงห้องท้าย)
    const sorted = [...classrooms].sort((a, b) =>
        a.grade_level !== b.grade_level
            ? a.grade_level - b.grade_level
            : a.room_number - b.room_number
    );

    // placeholder option (ค่าว่าง)
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    select.appendChild(blank);

    sorted.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `ม.${c.grade_level}/${c.room_number}`;
        select.appendChild(opt);
    });

    // ✅ Init TomSelect — maxOptions:null แสดงทุกห้องโดยไม่จำกัด
    classroomTomSelect = new TomSelect('#classroomPicker', {
        placeholder: 'พิมพ์หรือเลือกชั้น/ห้อง...',
        allowEmptyOption: true,
        maxOptions: null,
        onChange(val) {
            if (val) {
                loadClassroomStudents(val);
            } else {
                systemDataList = [];
                updateDashboard([]);
                showSelectPrompt();
            }
        }
    });

    $('#adminFilters').removeClass('hidden');
}

function showSelectPrompt() {
    if (tableInstance) { tableInstance.destroy(); tableInstance = null; }
    const thead = $('#dynamicThead');
    const tbody = $('#mainTable tbody');
    thead.empty();
    tbody.html(`
        <tr>
            <td colspan="9" class="p-16 text-center">
                <div class="flex flex-col items-center gap-3 text-slate-400">
                    <i class="fa-solid fa-school text-5xl"></i>
                    <p class="text-lg font-bold">กรุณาเลือกห้องเรียนที่ต้องการดู</p>
                    <p class="text-sm">ใช้ตัวเลือกด้านบนเพื่อโหลดข้อมูลนักเรียน</p>
                </div>
            </td>
        </tr>
    `);
}

async function loadClassroomStudents(classroomId) {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await db.from('student_enrollments')
            .select(`
                id, student_number, classroom_id,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (id, grade_level, room_number),
                sdq_assessments (
                    id, total_difficulty_score, assessor_type,
                    score_emotional, score_conduct, score_hyper, score_peer, score_prosocial,
                    created_at, academic_year, semester, q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,
                    q11,q12,q13,q14,q15,q16,q17,q18,q19,q20,q21,q22,q23,q24,q25
                )
            `)
            .eq('classroom_id', classroomId)
            .order('student_number', { ascending: true });

        if (error) throw error;

        const curYear = currentSchoolInfo.current_academic_year;
        const curSem = currentSchoolInfo.current_semester;
        systemDataList = (data || []).map(item => ({
            ...item,
            sdq_assessments: (item.sdq_assessments || []).filter(
                a => a.academic_year === curYear && a.semester === curSem
            )
        }));

        // อัปเดตหัวตาราง: แสดงชั้น/ห้องที่เลือก
        const firstRoom = systemDataList[0]?.core_classrooms;
        const roomLabel = firstRoom ? `ม.${firstRoom.grade_level}/${firstRoom.room_number}` : '';
        if (roomLabel) {
            $('#table-title').html(`<i class="fa-solid fa-door-open mr-2 text-rose-500"></i> นักเรียนห้อง ${roomLabel}`);
        }

        updateDashboard(systemDataList);
        renderTable(systemDataList);
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }
}

function updateDashboard(data) {
    let stats = { total: data.length, assessed: 0, normal: 0, risk: 0, problem: 0 };
    data.forEach(item => {
        const main = (item.sdq_assessments || []).find(x => x.assessor_type === 'teacher') ||
            (item.sdq_assessments || []).find(x => x.assessor_type === 'parent') ||
            (item.sdq_assessments || []).find(x => x.assessor_type === 'student');
        if (main) {
            stats.assessed++;
            const s = main.total_difficulty_score;
            if (s <= 15) stats.normal++;
            else if (s <= 18) stats.risk++;
            else stats.problem++;
        }
    });
    $('#stat-total').text(stats.total);
    $('#stat-assessed').text(stats.assessed);
    $('#stat-normal').text(stats.normal);
    $('#stat-risk').text(stats.risk);
    $('#stat-problem').text(stats.problem);
}

// ==========================================
// 6. Render Table
// ==========================================
function renderTable(data) {
    if (tableInstance) { tableInstance.destroy(); tableInstance = null; }
    const tbody = $('#mainTable tbody');
    const thead = $('#dynamicThead');
    tbody.empty();

    if (!isCurrentAdminMode) {
        thead.html(`<tr><th class="p-4">ห้อง</th><th class="p-4">เลขที่</th><th class="p-4">ชื่อ-สกุล</th><th class="p-4 text-center">นร.</th><th class="p-4 text-center">ผปค.</th><th class="p-4 text-center">ครู</th><th class="p-4 text-center">คะแนน(ครู)</th><th class="p-4 text-center">จัดการ</th></tr>`);
    } else {
        thead.html(`<tr><th class="p-4">ชั้น/ห้อง</th><th class="p-4">เลขที่</th><th class="p-4">ชื่อ-สกุล</th><th class="p-4 text-center">นร.</th><th class="p-4 text-center">ผปค.</th><th class="p-4 text-center">ครู</th><th class="p-4 text-center">คะแนนรวม</th><th class="p-4 text-center">สถานะ</th><th class="p-4 text-center">จัดการ</th></tr>`);
    }

    const colSpan = !isCurrentAdminMode ? 8 : 9;
    if (!data || data.length === 0) {
        tbody.append(`<tr><td colspan="${colSpan}" class="p-8 text-center text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>`);
        tableInstance = $('#mainTable').DataTable({ language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }, pageLength: 50, destroy: true });
        return;
    }

    const doneBadge = `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-200"><i class="fas fa-check"></i> ทำแล้ว</span>`;
    const pendBadge = `<span class="px-2 py-1 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold border border-slate-200">ยังไม่ทำ</span>`;

    data.forEach(item => {
        const student = item.core_students;
        if (!student) return;
        const room = item.core_classrooms;
        const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
        const asmts = item.sdq_assessments || [];
        const teaEval = asmts.find(a => a.assessor_type === 'teacher');
        const parEval = asmts.find(a => a.assessor_type === 'parent');
        const stdEval = asmts.find(a => a.assessor_type === 'student');
        const mainEval = teaEval || parEval || stdEval;
        const stdName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

        if (!isCurrentAdminMode) {
            const actionBtn = teaEval
                ? `<div class="flex gap-2 justify-center">
                    <button onclick="viewSDQ('${item.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button>
                    <button onclick="startTeacherAssessment('${item.id}')" class="text-amber-600 hover:text-amber-800" title="แก้ไขการประเมิน"><i class="fas fa-edit"></i></button>
                   </div>`
                : `<button onclick="startTeacherAssessment('${item.id}')" class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"><i class="fas fa-edit mr-1"></i> ประเมิน</button>`;
            tbody.append(`<tr><td class="p-3 text-center">${roomTxt}</td><td class="p-3 text-center">${item.student_number}</td><td class="p-3 font-bold">${stdName}</td><td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td><td class="p-3 text-center font-black">${teaEval ? teaEval.total_difficulty_score : '-'}</td><td class="p-3 text-center">${actionBtn}</td></tr>`);
        } else {
            let scoreTxt = '-', resultBadge = '<span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs">ยังไม่ประเมิน</span>';
            if (mainEval) {
                scoreTxt = `<span class="font-black text-indigo-600">${mainEval.total_difficulty_score}</span>`;
                const sc = mainEval.total_difficulty_score;
                if (sc <= 15) resultBadge = '<span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">ปกติ</span>';
                else if (sc <= 18) resultBadge = '<span class="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded-lg">เสี่ยง</span>';
                else resultBadge = '<span class="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">มีปัญหา</span>';
            }
            const actionBtn = `<div class="flex gap-2 justify-center"><button onclick="viewSDQ('${item.id}')" class="text-blue-600"><i class="fas fa-eye"></i></button><button onclick="printStudentSDQ('${item.id}')" class="text-purple-600"><i class="fas fa-print"></i></button><button onclick="deleteAllAssessments('${item.id}')" class="text-rose-500"><i class="fas fa-trash"></i></button></div>`;
            tbody.append(`<tr><td class="p-3 text-center">${roomTxt}</td><td class="p-3 text-center">${item.student_number}</td><td class="p-3 font-bold">${stdName}</td><td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${scoreTxt}</td><td class="p-3 text-center">${resultBadge}</td><td class="p-3 text-center">${actionBtn}</td></tr>`);
        }
    });

    tableInstance = $('#mainTable').DataTable({ language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }, pageLength: 50, destroy: true });
}

// DataTable filter: ลบ grade/room filter ออก เพราะ admin เลือกห้องจาก TomSelect แล้ว
$.fn.dataTable.ext.search = [];

// ==========================================
// 7. View SDQ (แสดงผลรวม)
// ==========================================
function viewSDQ(enrollmentId) {
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) return Swal.fire('ไม่พบข้อมูล');
    const student = enrollment.core_students;
    const asmts = enrollment.sdq_assessments || [];
    const teaEval = asmts.find(a => a.assessor_type === 'teacher');
    const parEval = asmts.find(a => a.assessor_type === 'parent');
    const stdEval = asmts.find(a => a.assessor_type === 'student');
    const stdName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const room = enrollment.core_classrooms;
    const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '';

    function row(label, ev) {
        if (!ev) return `<tr><td class="py-2 px-3 font-bold">${label}</td><td colspan="6" class="text-center text-slate-400">ยังไม่ประเมิน</td></tr>`;
        const sc = ev.total_difficulty_score;
        const color = sc <= 15 ? 'emerald' : sc <= 18 ? 'amber' : 'rose';
        return `<tr><td class="py-2 px-3 font-bold">${label}</td><td class="text-center">${ev.score_emotional}</td><td class="text-center">${ev.score_conduct}</td><td class="text-center">${ev.score_hyper}</td><td class="text-center">${ev.score_peer}</td><td class="text-center">${ev.score_prosocial}</td><td class="text-center font-black text-${color}-600">${sc}</td></tr>`;
    }
    Swal.fire({
        title: `📋 ผลประเมิน SDQ`,
        html: `<p class="font-bold text-indigo-600">${stdName}</p><p class="text-slate-500 text-sm mb-2">${roomTxt}</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-100"><tr><th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th></tr></thead><tbody>${row('🧑 นักเรียน', stdEval)}${row('👨‍👩‍👧 ผู้ปกครอง', parEval)}${row('👩‍🏫 ครู', teaEval)}</tbody></table></div>`,
        width: '650px', showConfirmButton: isCurrentAdminMode, confirmButtonText: '<i class="fas fa-print"></i> พิมพ์', showCancelButton: true, cancelButtonText: 'ปิด'
    }).then(res => { if (res.isConfirmed) printStudentSDQ(enrollmentId); });
}

// ==========================================
// 8. ลบการประเมินทั้งหมด (admin)
// ==========================================
async function deleteAllAssessments(enrollmentId) {
    const confirm = await Swal.fire({ title: 'ยืนยันลบทั้งหมด?', text: 'จะลบทุกผู้ประเมิน', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ' });
    if (confirm.isConfirmed) {
        const { error } = await db.from('sdq_assessments').delete().eq('enrollment_id', enrollmentId);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            Swal.fire('สำเร็จ', '', 'success');
            // Admin mode: reload ห้องที่เลือกอยู่ (ไม่ reset Tom Select)
            if (isCurrentAdminMode && classroomTomSelect) {
                const selectedId = classroomTomSelect.getValue();
                if (selectedId) { loadClassroomStudents(selectedId); return; }
            }
            loadData();
        }
    }
}

// ==========================================
// 9. พิมพ์รายงานรายบุคคล (พร้อมโลโก้และเลขประจำตัวนักเรียน)
// ==========================================
async function printStudentSDQ(enrollmentId) {
    try {
        Swal.fire({ title: 'กำลังเตรียมเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const enrollment = systemDataList.find(e => e.id === enrollmentId);
        if (!enrollment) throw new Error('ไม่พบข้อมูลการลงทะเบียน');

        const student = enrollment.core_students;
        if (!student || !student.id) throw new Error('ไม่พบข้อมูลนักเรียน');

        const asmts = enrollment.sdq_assessments || [];
        const tea = asmts.find(a => a.assessor_type === 'teacher');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const std = asmts.find(a => a.assessor_type === 'student');

        const name = `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim() || 'ไม่ระบุชื่อ';
        const studentIdCard = student.student_id_card || '-';
        const room = enrollment.core_classrooms;
        const roomTxt = (room && room.grade_level && room.room_number) ? `ม.${room.grade_level}/${room.room_number}` : 'ไม่ระบุห้อง';
        const school = currentSchoolInfo?.school_name || 'โรงเรียน';
        
        // ใช้โลโก้ที่กำหนด (สามารถเปลี่ยน URL ได้ตามต้องการ)
        const logoUrl = 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';

        let advisors = { advisor1: '-', advisor2: '-' };
        if (room && room.id) {
            try { advisors = await getAdvisorNames(room.id); } catch(e) {}
        }

        const getCategoryStatus = (score, cat) => {
            const s = (typeof score === 'number' && !isNaN(score)) ? score : 0;
            if (cat === 'emotional') return s <= 4 ? { text: 'ปกติ', color: '#10b981' } : (s === 5 ? { text: 'เสี่ยง', color: '#f59e0b' } : { text: 'มีปัญหา', color: '#ef4444' });
            if (cat === 'conduct') return s <= 3 ? { text: 'ปกติ', color: '#10b981' } : (s === 4 ? { text: 'เสี่ยง', color: '#f59e0b' } : { text: 'มีปัญหา', color: '#ef4444' });
            if (cat === 'hyper') return s <= 5 ? { text: 'ปกติ', color: '#10b981' } : (s === 6 ? { text: 'เสี่ยง', color: '#f59e0b' } : { text: 'มีปัญหา', color: '#ef4444' });
            if (cat === 'peer') return s <= 3 ? { text: 'ปกติ', color: '#10b981' } : (s === 4 ? { text: 'เสี่ยง', color: '#f59e0b' } : { text: 'มีปัญหา', color: '#ef4444' });
            if (cat === 'prosocial') return s >= 4 ? { text: 'มีจุดแข็ง', color: '#10b981' } : { text: 'ไม่มีจุดแข็ง', color: '#f59e0b' };
            return { text: '-', color: '#94a3b8' };
        };
        const getTotalStatus = (s) => (s <= 16) ? { text: 'ปกติ', color: '#10b981' } : { text: 'เสี่ยง/มีปัญหา', color: '#ef4444' };

        const buildRow = (assess, label) => {
            if (!assess) return `<tr><td style="padding:8px;">${label}</td><td colspan="8" style="text-align:center;">ยังไม่ประเมิน</td></tr>`;
            const e = assess.score_emotional ?? 0, c = assess.score_conduct ?? 0, h = assess.score_hyper ?? 0, p = assess.score_peer ?? 0, ps = assess.score_prosocial ?? 0, total = assess.total_difficulty_score ?? (e+c+h+p);
            return `
            <tr>
                <td style="padding:8px;">${label}</td>
                <td style="text-align:center;">${e}<br><span style="font-size:9px;color:${getCategoryStatus(e,'emotional').color}">${getCategoryStatus(e,'emotional').text}</span></td>
                <td style="text-align:center;">${c}<br><span style="font-size:9px;color:${getCategoryStatus(c,'conduct').color}">${getCategoryStatus(c,'conduct').text}</span></td>
                <td style="text-align:center;">${h}<br><span style="font-size:9px;color:${getCategoryStatus(h,'hyper').color}">${getCategoryStatus(h,'hyper').text}</span></td>
                <td style="text-align:center;">${p}<br><span style="font-size:9px;color:${getCategoryStatus(p,'peer').color}">${getCategoryStatus(p,'peer').text}</span></td>
                <td style="text-align:center;">${ps}<br><span style="font-size:9px;color:${getCategoryStatus(ps,'prosocial').color}">${getCategoryStatus(ps,'prosocial').text}</span></td>
                <td style="text-align:center;font-weight:bold;">${total}</td>
                <td style="text-align:center;color:${getTotalStatus(total).color};">${getTotalStatus(total).text}</td>
            </tr>`;
        };

        const logoHtml = `<div style="text-align:center; margin-bottom:5px;"><img src="${logoUrl}" style="max-height:60px; max-width:120px; object-fit:contain;"></div>`;

        const htmlContent = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SDQ Report - ${name}</title>
            <style>
                body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; }
                .header { text-align: center; margin-bottom: 10px; }
                .school-name { font-size: 16px; font-weight: bold; color: #4f46e5; }
                .report-title { font-size: 13px; }
                .student-info { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px; }
                .student-name { font-size: 18px; font-weight: 900; margin: 4px 0; }
                .details { font-size: 12px; color: #64748b; margin-top: 2px; }
                .advisor { font-size: 11px; color: #475569; margin-top: 2px; }
                .section-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
                table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 11px; }
                th, td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
                th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
                .criteria { margin-top: 16px; padding: 10px; background: #f1f5f9; border-radius: 8px; font-size: 10px; color: #1e293b; }
                .criteria-title { font-weight: bold; font-size: 11px; margin-bottom: 4px; }
                .footer { text-align: center; margin-top: 8px; color: #94a3b8; font-size: 9px; }
                @media print {
                    body { margin: 0; padding: 0; }
                    .container { margin: 0; max-width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${logoHtml}
                <div class="header">
                    <div class="school-name">${escapeHtml(school)}</div>
                    <div class="report-title">รายงานผลการประเมิน SDQ (ครู)</div>
                </div>
                <div class="student-info">
                    <div class="student-name">${escapeHtml(name)}</div>
                    <div class="details">${escapeHtml(roomTxt)} | ภาคเรียนที่ ${currentSchoolInfo?.current_semester} ปีการศึกษา ${currentSchoolInfo?.current_academic_year}</div>
                    <div class="details">เลขประจำตัวนักเรียน: ${escapeHtml(studentIdCard)}</div>
                    <div class="advisor">ครูที่ปรึกษา: ${escapeHtml(advisors.advisor1)}${advisors.advisor2 !== '-' ? `, ${escapeHtml(advisors.advisor2)}` : ''}</div>
                </div>
                <div class="section-title">คะแนนและสถานะรายด้าน</div>
                <table>
                    <thead><tr><th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th><th>สรุป</th></tr></thead>
                    <tbody>
                        ${buildRow(std, 'นักเรียน')}
                        ${buildRow(par, 'ผู้ปกครอง')}
                        ${buildRow(tea, 'ครู')}
                    </tbody>
                </table>
                <div class="criteria">
                    <div class="criteria-title">เกณฑ์การแปลผล (อ้างอิง HAPPY HOME CLINIC)</div>
                    <div>อารมณ์: 0-4=ปกติ, 5=เสี่ยง, 6-10=มีปัญหา &nbsp;|&nbsp; ประพฤติ: 0-3=ปกติ, 4=เสี่ยง, 5-10=มีปัญหา</div>
                    <div>ไม่อยู่นิ่ง: 0-5=ปกติ, 6=เสี่ยง, 7-10=มีปัญหา &nbsp;|&nbsp; เพื่อน: 0-3=ปกติ, 4=เสี่ยง, 5-10=มีปัญหา</div>
                    <div>สังคม: 4-10=มีจุดแข็ง, 0-3=ไม่มีจุดแข็ง &nbsp;|&nbsp; คะแนนรวม: 0-16=ปกติ, 17-40=เสี่ยง/มีปัญหา</div>
                </div>
                <div class="footer">พิมพ์ ${new Date().toLocaleDateString('th-TH')} | ระบบ SDQ</div>
            </div>
            <script>
                window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };
            <\/script>
        </body>
        </html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 10. พิมพ์สรุปภาพรวม (พร้อมโลโก้)
// ==========================================
// ==========================================
// 10. พิมพ์สรุปภาพรวม (ปรับลดระยะห่าง และการ์ดให้พอดีกับ 10 รายการต่อหน้า)
// ==========================================
async function printSummaryPDF() {
    if (systemDataList.length === 0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');

    const school = currentSchoolInfo?.school_name || 'โรงเรียน';
    const modeTitle = isCurrentAdminMode ? 'ภาพรวมห้องที่เลือก' : 'ห้องที่ปรึกษา';
    const logoUrl = 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    let advisorNames = { advisor1: '-', advisor2: '-' };

    if (!isCurrentAdminMode && myClassIds.length > 0) {
        const firstRoomId = myClassIds[0];
        advisorNames = await getAdvisorNames(firstRoomId);
    } else if (isCurrentAdminMode && classroomTomSelect && classroomTomSelect.getValue()) {
        const roomId = classroomTomSelect.getValue();
        if (roomId) advisorNames = await getAdvisorNames(roomId);
    }

    const getTotalStatus = (score) => {
        if (score <= 16) return { text: 'ปกติ', color: '#10b981' };
        return { text: 'เสี่ยง/มีปัญหา', color: '#ef4444' };
    };

    let normal = 0, problem = 0, none = 0;
    systemDataList.forEach(item => {
        const asmts = item.sdq_assessments || [];
        const tea = asmts.find(a => a.assessor_type === 'teacher');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const std = asmts.find(a => a.assessor_type === 'student');
        const main = tea || par || std;
        if (main) {
            const score = main.total_difficulty_score;
            if (score <= 16) normal++;
            else problem++;
        } else { none++; }
    });

    const buildTableRows = (startIndex, endIndex) => {
        let rows = '';
        for (let i = startIndex; i < endIndex; i++) {
            const item = systemDataList[i];
            const s = item.core_students;
            const room = item.core_classrooms;
            const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
            const asmts = item.sdq_assessments || [];
            const tea = asmts.find(a => a.assessor_type === 'teacher');
            const par = asmts.find(a => a.assessor_type === 'parent');
            const std = asmts.find(a => a.assessor_type === 'student');
            const main = tea || par || std;
            let score = '-', status = 'ยังไม่ประเมิน', color = '#94a3b8';
            if (main) {
                score = main.total_difficulty_score;
                const st = getTotalStatus(score);
                status = st.text; color = st.color;
            }
            rows += `<tr style="background:${(i - startIndex) % 2 === 0 ? '#f8fafc' : 'white'};">
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${i + 1}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${roomTxt}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-size:12px;">${s ? `${s.prefix || ''}${s.first_name} ${s.last_name}` : '-'}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${tea ? '✓' : '-'}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${par ? '✓' : '-'}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${std ? '✓' : '-'}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-size:12px;">${score}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-size:12px;color:${color};">${status}</td>
            </tr>`;
        }
        return rows;
    };

    const ITEMS_PER_PAGE = 15;
    const totalPages = Math.ceil(systemDataList.length / ITEMS_PER_PAGE);
    const divs = [];

    for (let page = 0; page < totalPages; page++) {
        const start = page * ITEMS_PER_PAGE;
        const end = Math.min(start + ITEMS_PER_PAGE, systemDataList.length);
        const div = document.createElement('div');
        div.style.cssText = 'font-family:"Sarabun",sans-serif;padding:10px;max-width:1100px;margin:0 auto;background:white;font-size:14px;line-height:1.2;';
        if (page < totalPages - 1) div.style.pageBreakAfter = 'always';

        div.innerHTML = `
            <div style="text-align:center; margin-bottom:8px;">
                <div style="margin-bottom:3px; text-align:center;">
                    <img src="${logoUrl}" style="max-height:45px; max-width:90px; object-fit:contain; display:inline-block;">
                </div>
                <div style="font-size:16px;font-weight:bold;color:#4f46e5;">${escapeHtml(school)}</div>
                <div style="font-size:14px;font-weight:bold;">สรุปผลการประเมิน SDQ — ${escapeHtml(modeTitle)}</div>
                <div style="font-size:12px;color:#64748b;">ภาคเรียนที่ ${currentSchoolInfo?.current_semester} ปีการศึกษา ${currentSchoolInfo?.current_academic_year}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">ครูที่ปรึกษา: ${escapeHtml(advisorNames.advisor1)} ${advisorNames.advisor2 !== '-' ? `, ${escapeHtml(advisorNames.advisor2)}` : ''}</div>
            </div>
            ${page === 0 ? `
            <div style="display:flex;gap:12px;margin-bottom:12px;justify-content:center;flex-wrap:wrap;">
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:3px 15px;text-align:center;">
                    <div style="font-size:12px;font-weight:bold;">ปกติ</div>
                    <div style="font-size:24px;font-weight:900;color:#10b981;">${normal}</div>
                    <div style="font-size:9px;">(0-16 คะแนน)</div>
                </div>
                <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:3px 15px;text-align:center;">
                    <div style="font-size:12px;font-weight:bold;">เสี่ยง/มีปัญหา</div>
                    <div style="font-size:24px;font-weight:900;color:#ef4444;">${problem}</div>
                    <div style="font-size:9px;">(17-40 คะแนน)</div>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:3px 15px;text-align:center;">
                    <div style="font-size:12px;font-weight:bold;">ยังไม่ประเมิน</div>
                    <div style="font-size:24px;font-weight:900;color:#94a3b8;">${none}</div>
                </div>
            </div>
            ` : ''}
            <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px;">
                <thead><tr style="background:#e0e7ff;">
                    <th style="padding:6px 4px;text-align:center;">#</th>
                    <th style="padding:6px 4px;text-align:center;">ห้อง</th>
                    <th style="padding:6px 4px;text-align:left;">ชื่อ-สกุล</th>
                    <th style="padding:6px 4px;text-align:center;">ครู</th>
                    <th style="padding:6px 4px;text-align:center;">ผปค.</th>
                    <th style="padding:6px 4px;text-align:center;">นร.</th>
                    <th style="padding:6px 4px;text-align:center;">คะแนนรวม</th>
                    <th style="padding:6px 4px;text-align:center;">สถานะ</th>
                </tr></thead>
                <tbody>${buildTableRows(start, end)}</tbody>
            </table>
            <div style="margin-top:10px;padding:6px;background:#f1f5f9;border-radius:6px;font-size:10px;color:#1e293b;">
                <div style="font-weight:bold;margin-bottom:2px;">📌 เกณฑ์การแปลผลคะแนนรวม (อ้างอิง HAPPY HOME CLINIC)</div>
                <div>▪ 0-16 คะแนน : ปกติ</div>
                <div>▪ 17-40 คะแนน : เสี่ยง / มีปัญหา</div>
                <div style="margin-top:3px;">หมายเหตุ: คะแนนที่ใช้เป็นคะแนนรวมจากผู้ประเมินหลัก (ครู > ผู้ปกครอง > นักเรียน)</div>
            </div>
            <div style="text-align:center;margin-top:8px;color:#94a3b8;font-size:9px;">หน้าที่ ${page+1} / ${totalPages} | พิมพ์ ${new Date().toLocaleDateString('th-TH')}</div>
        `;
        divs.push(div);
        document.body.appendChild(div);
    }

    await new Promise(r => setTimeout(r, 100));
    const combinedDiv = document.createElement('div');
    divs.forEach(d => combinedDiv.appendChild(d.cloneNode(true)));

    await html2pdf().set({
        margin: [0.2, 0.2, 0.2, 0.2],
        filename: `SDQ_Summary_${currentSchoolInfo?.current_academic_year}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    }).from(combinedDiv).save();

    divs.forEach(d => d.remove());
}

// ดึงชื่อครูที่ปรึกษาของห้อง (adviser_id_1, adviser_id_2)
async function getAdvisorNames(classroomId) {
    if (!classroomId) {
        console.warn('getAdvisorNames: no classroomId provided');
        return { advisor1: '-', advisor2: '-' };
    }
    try {
        // ดึงรหัสครูที่ปรึกษาจากห้องเรียน
        const { data: classroom, error: classError } = await db
            .from('core_classrooms')
            .select('adviser_id_1, adviser_id_2')
            .eq('id', classroomId)
            .maybeSingle();  // ใช้ maybeSingle ป้องกัน error

        if (classError || !classroom) {
            console.error('ไม่พบข้อมูลห้องเรียน:', classError);
            return { advisor1: '-', advisor2: '-' };
        }

        // ฟังก์ชันย่อยสำหรับดึงชื่อครู
        const getTeacherName = async (teacherId) => {
            if (!teacherId) return '-';
            const { data: teacher, error: tError } = await db
                .from('core_personnel')
                .select('prefix, first_name, last_name')
                .eq('id', teacherId)
                .maybeSingle();
            if (tError || !teacher) return '-';
            return `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`;
        };

        const advisor1 = await getTeacherName(classroom.adviser_id_1);
        const advisor2 = await getTeacherName(classroom.adviser_id_2);

        return { advisor1, advisor2 };
    } catch (err) {
        console.error('getAdvisorNames error:', err);
        return { advisor1: '-', advisor2: '-' };
    }
}
// ==========================================
// 11. Export Excel
// ==========================================
function exportExcel() {
    if (!systemDataList.length) return Swal.fire('ไม่มีข้อมูล');
    const data = systemDataList.map(item => {
        const s = item.core_students;
        const room = item.core_classrooms;
        const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
        const asmts = item.sdq_assessments || [];
        const tea = asmts.find(a => a.assessor_type === 'teacher');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const std = asmts.find(a => a.assessor_type === 'student');
        if (!isCurrentAdminMode) {
            return { 'ห้อง': roomTxt, 'เลขที่': item.student_number, 'ชื่อ-สกุล': `${s.prefix || ''}${s.first_name} ${s.last_name}`, 'นร.': std ? 'แล้ว' : 'ยัง', 'ผปค.': par ? 'แล้ว' : 'ยัง', 'ครู': tea ? 'แล้ว' : 'ยัง', 'คะแนนครู': tea?.total_difficulty_score || '-' };
        } else {
            const main = tea || par || std;
            return { 'ชั้น/ห้อง': roomTxt, 'เลขที่': item.student_number, 'รหัส': s?.student_id_card, 'ชื่อ': `${s.prefix || ''}${s.first_name} ${s.last_name}`, 'คะแนนนร.': std?.total_difficulty_score || '-', 'คะแนนผปค.': par?.total_difficulty_score || '-', 'คะแนนครู': tea?.total_difficulty_score || '-', 'อารมณ์': main?.score_emotional || '-', 'ประพฤติ': main?.score_conduct || '-', 'สมาธิสั้น': main?.score_hyper || '-', 'เพื่อน': main?.score_peer || '-', 'สังคม': main?.score_prosocial || '-' };
        }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SDQ_Report');
    XLSX.writeFile(wb, `SDQ_${isCurrentAdminMode ? 'admin' : 'teacher'}_${currentSchoolInfo?.current_academic_year}.xlsx`);
}

// ==========================================
// 12. ฟังก์ชันประเมินครู (step)
// ==========================================
function loadTeacherQuestions() {
    if (teacherQuestions.length) return;
    teacherQuestions = [
        { id: 1, text: "ห่วงใยความรู้สึกคนอื่น", cat: "prosocial", reverse: false },
        { id: 2, text: "อยู่นิ่งไม่ได้ นั่งไม่ติดที่", cat: "hyper", reverse: false },
        { id: 3, text: "มักจะบ่นว่าปวดหัว ปวดท้อง หรือไม่สบาย", cat: "emotional", reverse: false },
        { id: 4, text: "เต็มใจแบ่งปันสิ่งของให้เพื่อน", cat: "prosocial", reverse: false },
        { id: 5, text: "มักจะอาละวาด หรือโมโหร้าย", cat: "conduct", reverse: false },
        { id: 6, text: "ค่อนข้างแยกตัว ชอบเล่นคนเดียว", cat: "peer", reverse: false },
        { id: 7, text: "เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ", cat: "conduct", reverse: true },
        { id: 8, text: "กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ", cat: "emotional", reverse: false },
        { id: 9, text: "เป็นที่พึ่งได้เวลาคนอื่นเสียใจ", cat: "prosocial", reverse: false },
        { id: 10, text: "ยุกยิก กระสับกระส่าย", cat: "hyper", reverse: false },
        { id: 11, text: "มีเพื่อนสนิทอย่างน้อยหนึ่งคน", cat: "peer", reverse: true },
        { id: 12, text: "มักจะมีเรื่องทะเลาะวิวาทกับเด็กคนอื่น", cat: "conduct", reverse: false },
        { id: 13, text: "ดูไม่มีความสุข ร้องไห้บ่อย", cat: "emotional", reverse: false },
        { id: 14, text: "เป็นที่ชื่นชอบของเพื่อนๆ", cat: "peer", reverse: true },
        { id: 15, text: "วอกแวกง่าย ขาดสมาธิ", cat: "hyper", reverse: false },
        { id: 16, text: "ขี้กลัว ไม่กล้าแสดงออก", cat: "emotional", reverse: false },
        { id: 17, text: "ใจดีกับเด็กที่เล็กกว่า", cat: "prosocial", reverse: false },
        { id: 18, text: "มักจะถูกเด็กคนอื่นแกล้งหรือรังแก", cat: "peer", reverse: false },
        { id: 19, text: "มักจะโกหกหรือขี้โกง", cat: "conduct", reverse: false },
        { id: 20, text: "อาสาช่วยเหลือคนอื่นเสมอ", cat: "prosocial", reverse: false },
        { id: 21, text: "คิดก่อนทำ", cat: "hyper", reverse: true },
        { id: 22, text: "แอบเอาของคนอื่น", cat: "conduct", reverse: false },
        { id: 23, text: "เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน", cat: "peer", reverse: false },
        { id: 24, text: "ขี้ขลาด", cat: "emotional", reverse: false },
        { id: 25, text: "ทำงานจนเสร็จ มีความตั้งใจ", cat: "hyper", reverse: true }
    ];
}

async function startTeacherAssessment(enrollmentId) {
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) { Swal.fire('ไม่พบข้อมูลนักเรียน'); return; }
    const student = enrollment.core_students;
    const room = enrollment.core_classrooms;
    const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const roomText = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
    currentTeacherEnrollment = enrollment;

    loadTeacherQuestions();
    // ตรวจสอบการประเมินเดิม
    const existingAssess = (enrollment.sdq_assessments || []).find(a => a.assessor_type === 'teacher');
    if (existingAssess) {
        const confirm = await Swal.fire({
            title: 'พบการประเมินเดิม',
            text: `นักเรียน ${studentName} (${roomText}) มีการประเมินโดยครูแล้ว คุณต้องการแก้ไขหรือทำใหม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'แก้ไขข้อมูลเดิม',
            cancelButtonText: 'ทำใหม่ (ลบข้อมูลเดิม)',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#ef4444'
        });
        if (confirm.isConfirmed) {
            // โหลดคำตอบเดิม
            teacherAnswers = {};
            for (let i = 1; i <= 25; i++) {
                const val = existingAssess[`q${i}`];
                if (val !== undefined && val !== null) teacherAnswers[i] = val;
            }
        } else {
            // ลบการประเมินเดิม
            const { error } = await db.from('sdq_assessments').delete().eq('id', existingAssess.id);
            if (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลเดิมได้', 'error'); return; }
            teacherAnswers = {};
        }
    } else {
        teacherAnswers = {};
    }
    currentTeacherQIndex = 0;
    // แสดงข้อมูลในฟอร์ม
    $('#teacherAssessStudentName').text(studentName);
    $('#teacherAssessRoomInfo').text(roomText);
    renderTeacherQuestion();
    $('#teacherStepForm').removeClass('hidden').css('display', 'flex');
}

function renderTeacherQuestion() {
    const q = teacherQuestions[currentTeacherQIndex];
    $('#teacherQuestionText').text(`${q.id}. ${q.text}`);
    const percent = Math.round(((currentTeacherQIndex) / 25) * 100);
    $('#teacherProgressBar').css('width', `${percent}%`);
    $('#teacherProgressText').text(`ข้อที่ ${currentTeacherQIndex + 1} / 25`);
    $('#teacherPercentText').text(`${percent}%`);
    $('input[name="teacherChoice"]').prop('checked', false);
    if (teacherAnswers[q.id] !== undefined) {
        $(`input[name="teacherChoice"][value="${teacherAnswers[q.id]}"]`).prop('checked', true);
        $('#teacherBtnNext').removeClass('hidden');
    } else {
        $('#teacherBtnNext').addClass('hidden');
    }
    $('#teacherBtnPrev').toggleClass('hidden', currentTeacherQIndex === 0);
    if (currentTeacherQIndex === 24 && teacherAnswers[q.id] !== undefined) {
        $('#teacherBtnSubmit').removeClass('hidden');
        $('#teacherBtnNext').addClass('hidden');
    } else {
        $('#teacherBtnSubmit').addClass('hidden');
    }
}

function teacherSelectAnswer(val) {
    const q = teacherQuestions[currentTeacherQIndex];
    teacherAnswers[q.id] = parseInt(val);
    $('#teacherBtnNext').removeClass('hidden');
    if (currentTeacherQIndex === 24) {
        $('#teacherBtnSubmit').removeClass('hidden');
        $('#teacherBtnNext').addClass('hidden');
    } else {
        setTimeout(() => teacherNavQuestion(1), 300);
    }
}

function teacherNavQuestion(step) {
    currentTeacherQIndex += step;
    renderTeacherQuestion();
}

function closeTeacherStepForm() {
    $('#teacherStepForm').addClass('hidden').css('display', 'none');
}

async function submitTeacherAssessment() {
    if (Object.keys(teacherAnswers).length < 25) {
        Swal.fire('แจ้งเตือน', 'กรุณาตอบคำถามให้ครบทุกข้อ', 'warning');
        return;
    }
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let scores = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
    teacherQuestions.forEach(q => {
        let val = teacherAnswers[q.id] || 0;
        if (q.reverse) val = val === 0 ? 2 : (val === 2 ? 0 : 1);
        scores[q.cat] += val;
    });
    const totalScore = scores.emotional + scores.conduct + scores.hyper + scores.peer;
    const payload = {
        student_id: currentTeacherEnrollment.core_students?.id,
        enrollment_id: currentTeacherEnrollment.id,
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        assessor_type: 'teacher',
        score_emotional: scores.emotional,
        score_conduct: scores.conduct,
        score_hyper: scores.hyper,
        score_peer: scores.peer,
        score_prosocial: scores.prosocial,
        total_difficulty_score: totalScore,
        created_at: new Date().toISOString()
    };
    for (let i = 1; i <= 25; i++) payload[`q${i}`] = teacherAnswers[i] || 0;
    const { error } = await db.from('sdq_assessments').upsert(payload, { onConflict: 'enrollment_id, assessor_type' });
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire('บันทึกสำเร็จ!', '', 'success');
        closeTeacherStepForm();
        await loadData();
    }
}

// ==========================================
// 13. Logout
// ==========================================
function logout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก' })
        .then(async r => { if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'login.html'; } });
}

// ==========================================
// 14. จัดการแอดมิน (ย่อเพื่อความกระชับ แต่ใช้ได้จริง)
// ==========================================
async function openAdminManager() { document.getElementById('adminManagerModal').classList.remove('hidden'); await Promise.all([loadPersonnelOptions(), loadCurrentAdmins()]); }
function closeAdminManager() { document.getElementById('adminManagerModal').classList.add('hidden'); }

async function loadPersonnelOptions() {
    try {
        const { data: currentAdmins } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', 'sdq');

        const adminUserIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];

        const { data: personnel, error } = await db
            .from('core_personnel')
            .select(`id, prefix, first_name, last_name, position, department`)
            .order('first_name', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';

        if (select.tomselect) {
            select.tomselect.destroy();
        }

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- เลือกบุคลากร --';
        select.appendChild(emptyOption);

        if (personnel) {
            personnel.forEach(p => {
                if (adminUserIds.includes(p.id)) return;

                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department ? ` [${p.department}]` : '';
                const pos = p.position ? ` - ${p.position}` : '';

                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${fullName}${pos}${dept}`;
                select.appendChild(option);
            });
        }

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body',
            render: {
                option: function (data, escape) {
                    return `<div>${escape(data.text)}</div>`;
                },
                no_results: function () {
                    return '<div class="no-results">ไม่พบบุคลากร</div>';
                }
            }
        });

    } catch (err) {
        console.error('Load personnel error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: moduleAdmins, error: adminError } = await db
            .from('core_module_admins')
            .select(`
                id,
                user_id,
                created_at,
                core_personnel!inner (
                    id,
                    prefix,
                    first_name,
                    last_name,
                    position,
                    department
                )
            `)
            .eq('module_id', 'sdq');

        if (adminError) throw adminError;

        const { data: superAdmins, error: superError } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');

        if (superError) throw superError;

        const adminListDiv = document.getElementById('adminList');

        let html = '';
        let totalCount = 0;

        if (superAdmins && superAdmins.length > 0) {
            superAdmins.forEach(admin => {
                const fullName = `${admin.prefix || ''}${admin.first_name} ${admin.last_name}`;
                const dept = admin.department || '';
                const pos = admin.position || '';

                html += `
                    <div class="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
                                <i class="fa-solid fa-crown text-amber-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-full font-bold">
                                    <i class="fa-solid fa-star mr-1"></i>Super Admin
                                </span>
                            </div>
                        </div>
                        <span class="text-xs text-slate-400">ถาวร</span>
                    </div>
                `;
                totalCount++;
            });
        }

        if (moduleAdmins && moduleAdmins.length > 0) {
            moduleAdmins.forEach(admin => {
                const p = admin.core_personnel;
                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department || '';
                const pos = p.position || '';
                const createdDate = admin.created_at
                    ? new Date(admin.created_at).toLocaleDateString('th-TH')
                    : 'ไม่ระบุ';

                html += `
                    <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                <i class="fa-solid fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs rounded-full font-medium">
                                    <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${createdDate}
                                </span>
                            </div>
                        </div>
                        <button onclick="removeSDQAdmin('${admin.id}', '${fullName}')" 
                                class="px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-sm font-bold transition-colors">
                            <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                        </button>
                    </div>
                `;
                totalCount++;
            });
        }

        if (html === '') {
            html = `
                <div class="text-center text-slate-400 py-8">
                    <i class="fa-solid fa-user-slash text-3xl mb-2"></i>
                    <p>ยังไม่มีผู้ดูแลระบบ SDQ</p>
                </div>
            `;
        }

        adminListDiv.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${totalCount} คน)`;
    } catch (err) {
        console.error('Load admins error:', err);
        document.getElementById('adminList').innerHTML = `
            <div class="text-center text-rose-400 py-8">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                <p>ไม่สามารถโหลดข้อมูลได้</p>
                <p class="text-xs mt-1">${err.message}</p>
            </div>
        `;
    }
}

async function addSDQAdmin() {
    const select = document.getElementById('personnelSelect');
    const personnelId = select.tomselect ? select.tomselect.getValue() : select.value;

    if (!personnelId || personnelId === '') {
        return Swal.fire('กรุณาเลือก', 'กรุณาเลือกครู/บุคลากรก่อน', 'warning');
    }

    try {
        const { data: personnel, error: personnelError } = await db
            .from('core_personnel')
            .select('id, email, prefix, first_name, last_name')
            .eq('id', personnelId)
            .single();

        if (personnelError || !personnel) {
            return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');
        }

        const userId = personnel.id;

        const { data: existing, error: existingError } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', 'sdq')
            .maybeSingle();

        if (existingError) {
            console.error('Check existing error:', existingError);
            return Swal.fire('ข้อผิดพลาด', 'ไม่สามารถตรวจสอบข้อมูลได้', 'error');
        }

        if (existing) {
            return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล SDQ อยู่แล้ว', 'info');
        }

        const { error: insertError } = await db
            .from('core_module_admins')
            .insert({
                user_id: userId,
                module_id: 'sdq',
                created_at: new Date().toISOString()
            });

        if (insertError) throw insertError;

        Swal.fire({
            icon: 'success',
            title: 'แต่งตั้งสำเร็จ!',
            text: `${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name} มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        if (select.tomselect) {
            select.tomselect.clear();
        }

        await loadCurrentAdmins();
        await loadPersonnelOptions();

    } catch (err) {
        console.error('Add admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มผู้ดูแลได้: ' + err.message, 'error');
    }
}

async function removeSDQAdmin(adminId, adminName) {
    const result = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `คุณต้องการถอดถอน <strong>${adminName}</strong> จากการเป็นผู้ดูแลระบบ SDQ ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ถอดถอน'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await db
            .from('core_module_admins')
            .delete()
            .eq('id', adminId);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'ถอดถอนสำเร็จ!',
            text: `${adminName} ไม่มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error('Remove admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถถอดถอนได้: ' + err.message, 'error');
    }
}
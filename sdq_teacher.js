// =======================================================
// sdq_teacher.js — ระบบ SDQ สำหรับครู (ฉบับมาตรฐาน WRK)
// =======================================================

// ---------- State ----------
let currentSchoolInfo = null;
let systemDataList = [];
let tableInstance = null;

let isTeacher        = false;
let isAdmin          = false;
let isModuleAdmin    = false;
let isCurrentAdminMode = false;
let isReadOnly       = false;
let myClassIds       = [];

let currentUser    = null;
let currentProfile = null;

// Teacher assessment form
let teacherQuestions = [];
let teacherAnswers = {};
let currentTeacherQIndex = 0;
let currentTeacherEnrollment = null;
let classroomTomSelect = null;

// ---------- Utils ----------
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m]));
}

const SDQ_THRESHOLD = { NORMAL_MAX: 15, RISK_MAX: 18 };
function getSDQStatus(score) {
    if (score == null || isNaN(score)) return { text: 'ยังไม่ประเมิน', color: '#94a3b8', key: 'none' };
    if (score <= SDQ_THRESHOLD.NORMAL_MAX) return { text: 'ปกติ',   color: '#10b981', key: 'normal' };
    if (score <= SDQ_THRESHOLD.RISK_MAX)   return { text: 'เสี่ยง',  color: '#f59e0b', key: 'risk' };
    return                                        { text: 'มีปัญหา', color: '#ef4444', key: 'problem' };
}

// =======================================================
// 🚀 Init
// =======================================================
window.addEventListener('load', async () => {
    try {
        // 1) Auth
        const ALLOWED = ['super_admin', 'admin', 'director', 'deputy', 'teacher'];
        const result = await checkSessionAndRole(MODULE_NAME, ALLOWED);

        if (!result) {
            document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
            return;
        }

        // Block staff/office (defensive — checkSessionAndRole already filtered)
        if (result.role === 'staff' || result.role === 'office') {
            await Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: `บทบาท "${result.role}" ไม่มีสิทธิ์ใช้งานระบบนี้`
            });
            window.location.href = 'index.html';
            return;
        }

        currentUser    = result.personnel;
        currentProfile = result.personnel;
        window.currentUser    = result.user;
        window.currentProfile = result.personnel;
        window.currentUserRole = result.role;

        // 2) UI มาตรฐาน
        setUserDisplayName(currentProfile);
        updateUserRoleLabel(result.role);
        renderUserAvatar(currentProfile);

        // 3) ดึงข้อมูลโรงเรียน
        const { data: school } = await db.from('core_school_info').select('*').single();
        currentSchoolInfo = school;

        // 4) ตรวจสอบสิทธิ์เชิงลึก (module admin / ห้องที่ปรึกษา / read-only)
        await resolveRoleFlags();

        // 5) UI ตามบทบาท
        applyRoleUI(result.role);

        // 6) โหลดข้อมูล
        await loadData();

        // 7) Log
        if (typeof logUserAction === 'function') {
            await logUserAction(`เข้าสู่ระบบ SDQ (ครู)`, MODULE_KEY);
        }

        console.log('✅ SDQ Teacher initialized');
    } catch (err) {
        console.error('❌ Init error:', err);
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        restoreSidebarCollapse();
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
        if (typeof refreshNavButtons === 'function') refreshNavButtons();
    }
});

// =======================================================
// Role flags
// =======================================================
async function resolveRoleFlags() {
    isModuleAdmin = await hasModuleAccess(currentProfile.role, 'sdq', currentProfile.id);
    isAdmin = isAdminUser(currentProfile.role, false) || isModuleAdmin;

    // Read-only head roles
    let isDisciplineHead = false, isGradeHead = false;

    const { data: discHead } = await db.from('core_discipline_heads')
        .select('id')
        .eq('personnel_id', currentProfile.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .maybeSingle();
    if (discHead) isDisciplineHead = true;

    const { data: gradeHead } = await db.from('behavior_grade_heads')
        .select('grade_level')
        .eq('teacher_id', currentProfile.id)
        .maybeSingle();
    if (gradeHead) isGradeHead = true;

    isReadOnly = (isDisciplineHead || isGradeHead) && !isAdmin;

    // ห้องที่ปรึกษา
    const { data: classrooms } = await db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .or(`adviser_id_1.eq.${currentProfile.id},adviser_id_2.eq.${currentProfile.id}`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);

    if (classrooms && classrooms.length > 0) {
        isTeacher = true;
        myClassIds = classrooms.map(c => c.id);
    }

    // ถ้าไม่ใช่ admin และไม่มีห้อง → เข้าไม่ได้
    if (!isAdmin && !isTeacher && !isDisciplineHead && !isGradeHead) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์ในระบบนี้', 'error');
        window.location.href = 'index.html';
        return;
    }

    // โหมดเริ่มต้น
    if (isAdmin && !isTeacher && !isReadOnly) {
        isCurrentAdminMode = true;
    } else {
        isCurrentAdminMode = false;
    }
}

// =======================================================
// Role UI
// =======================================================
function applyRoleUI(role) {
    const isAdminRole = isAdminUser(role, false) || isModuleAdmin;

    // ปุ่มสลับโหมด
    const btnAdmin = document.getElementById('btnAdminMode');
    if (btnAdmin) {
        const canToggle = isAdminRole;
        btnAdmin.classList.toggle('hidden', !canToggle);
        btnAdmin.classList.toggle('flex', canToggle);
        if (canToggle && typeof updateToggleModeUI === 'function') {
            updateToggleModeUI(role, isCurrentAdminMode, 'btnAdminMode');
        }
    }

    // ปุ่ม/เมนูจัดการแอดมิน
    const adminManagerBtn = document.getElementById('nav-sdq-admin-manager');
    if (adminManagerBtn) {
        adminManagerBtn.classList.toggle('hidden', !isAdminRole);
    }

    updateBadgeAndSubtitle();
}

function updateBadgeAndSubtitle() {
    const badge    = document.getElementById('pageBadge');
    const subtitle = document.getElementById('mode-subtitle');
    const title    = document.getElementById('table-title');

    if (isCurrentAdminMode && isAdmin) {
        if (badge)    badge.textContent = 'Admin View — เลือกดูทีละห้อง';
        if (subtitle) { subtitle.textContent = 'Admin Dashboard'; subtitle.className = 'text-[10px] text-rose-500 font-bold uppercase tracking-widest'; }
        if (title)    title.innerHTML = '<i class="fa-solid fa-globe mr-2 text-indigo-500"></i> นักเรียนทั้งหมดทุกระดับชั้น';
        $('#adminFilters').removeClass('hidden');
    } else {
        let modeText = 'Teacher Dashboard';
        if (isReadOnly) modeText = 'อ่านอย่างเดียว (หัวหน้ากลุ่ม/ปกครอง)';
        if (badge)    badge.textContent = isReadOnly ? 'View Only — ไม่สามารถประเมินได้' : 'Teacher View — เฉพาะห้องโฮมรูม';
        if (subtitle) { subtitle.textContent = modeText; subtitle.className = 'text-[10px] text-slate-500 font-bold uppercase tracking-widest'; }
        if (title)    title.innerHTML = '<i class="fa-solid fa-users mr-2 text-indigo-500"></i> รายชื่อนักเรียนประจำชั้น';
        $('#adminFilters').addClass('hidden');
    }
}

// =======================================================
// Toggle Admin / Teacher mode
// =======================================================
async function toggleTeacherAdminMode() {
    if (!isAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถสลับโหมดได้', 'error');
        return;
    }
    isCurrentAdminMode = !isCurrentAdminMode;
    window.updateToggleModeUI?.(currentProfile.role, isCurrentAdminMode, 'btnAdminMode');
    updateBadgeAndSubtitle();

    if (!isCurrentAdminMode && classroomTomSelect) {
        classroomTomSelect.clear(true);
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

// =======================================================
// Load data
// =======================================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    systemDataList = [];

    try {
        if (!isCurrentAdminMode) {
            // โหมดครู — โหลดห้องที่ปรึกษา
            if (myClassIds.length === 0) {
                Swal.close();
                showSelectPrompt('ไม่พบห้องที่ปรึกษาในปีการศึกษานี้');
                return;
            }

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
                .in('classroom_id', myClassIds)
                .order('student_number', { ascending: true });

            if (error) throw error;
            systemDataList = filterAssessmentsByTerm(data || []);

        } else {
            // โหมดแอดมิน — โหลดรายชื่อห้องทั้งหมดสำหรับ selector
            const { data: allClassrooms, error: cErr } = await db.from('core_classrooms')
                .select('id, grade_level, room_number')
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .eq('semester', currentSchoolInfo.current_semester)
                .order('grade_level').order('room_number');
            if (cErr) throw cErr;
            setupClassroomSelector(allClassrooms || []);
            systemDataList = [];
            updateDashboard([]);
            showSelectPrompt('กรุณาเลือกห้องเรียนที่ต้องการดู');
            Swal.close();
            return;
        }

        updateDashboard(systemDataList);
        renderTable(systemDataList);
        Swal.close();
    } catch (err) {
        console.error('loadData error:', err);
        Swal.close();
        Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้: ' + err.message, 'error');
    }
}

function filterAssessmentsByTerm(data) {
    const y = currentSchoolInfo.current_academic_year;
    const s = currentSchoolInfo.current_semester;
    return data.map(item => ({
        ...item,
        sdq_assessments: (item.sdq_assessments || []).filter(a => a.academic_year === y && a.semester === s)
    }));
}

// =======================================================
// Admin classroom selector (TomSelect)
// =======================================================
function setupClassroomSelector(classrooms) {
    const select = document.getElementById('classroomPicker');
    if (!select) return;

    if (classroomTomSelect) {
        classroomTomSelect.destroy();
        classroomTomSelect = null;
    }
    select.innerHTML = '';

    const sorted = [...classrooms].sort((a, b) =>
        a.grade_level !== b.grade_level
            ? a.grade_level - b.grade_level
            : a.room_number - b.room_number
    );

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

    classroomTomSelect = new TomSelect('#classroomPicker', {
        placeholder: 'พิมพ์หรือเลือกชั้น/ห้อง...',
        allowEmptyOption: true,
        maxOptions: null,
        onChange(val) {
            if (val) loadClassroomStudents(val);
            else { systemDataList = []; updateDashboard([]); showSelectPrompt('กรุณาเลือกห้องเรียนที่ต้องการดู'); }
        }
    });

    $('#adminFilters').removeClass('hidden');
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
        systemDataList = filterAssessmentsByTerm(data || []);

        const firstRoom = systemDataList[0]?.core_classrooms;
        const roomLabel = firstRoom ? `ม.${firstRoom.grade_level}/${firstRoom.room_number}` : '';
        if (roomLabel) {
            $('#table-title').html(`<i class="fa-solid fa-door-open mr-2 text-rose-500"></i> นักเรียนห้อง ${roomLabel}`);
        }

        updateDashboard(systemDataList);
        renderTable(systemDataList);
        Swal.close();
    } catch (err) {
        console.error('loadClassroomStudents error:', err);
        Swal.close();
        Swal.fire('Error', 'โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }
}

// =======================================================
// Dashboard / Table
// =======================================================
function updateDashboard(data) {
    const stats = { total: data.length, assessed: 0, normal: 0, risk: 0, problem: 0 };
    data.forEach(item => {
        const main = (item.sdq_assessments || []).find(a => a.assessor_type === 'teacher') ||
                     (item.sdq_assessments || []).find(a => a.assessor_type === 'parent') ||
                     (item.sdq_assessments || []).find(a => a.assessor_type === 'student');
        if (main) {
            stats.assessed++;
            const st = getSDQStatus(main.total_difficulty_score);
            if (st.key === 'normal') stats.normal++;
            else if (st.key === 'risk') stats.risk++;
            else if (st.key === 'problem') stats.problem++;
        }
    });
    $('#stat-total').text(stats.total);
    $('#stat-assessed').text(stats.assessed);
    $('#stat-normal').text(stats.normal);
    $('#stat-risk').text(stats.risk);
    $('#stat-problem').text(stats.problem);
}

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
            let actionBtn;
            if (isReadOnly) {
                actionBtn = `<div class="flex gap-2 justify-center"><button onclick="viewSDQ('${item.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button></div>`;
            } else if (teaEval) {
                actionBtn = `<div class="flex gap-2 justify-center">
                    <button onclick="viewSDQ('${item.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button>
                    <button onclick="startTeacherAssessment('${item.id}')" class="text-amber-600 hover:text-amber-800" title="แก้ไขการประเมิน"><i class="fas fa-edit"></i></button>
                </div>`;
            } else {
                actionBtn = `<button onclick="startTeacherAssessment('${item.id}')" class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"><i class="fas fa-edit mr-1"></i> ประเมิน</button>`;
            }
            tbody.append(`<tr>
                <td class="p-3 text-center">${roomTxt}</td>
                <td class="p-3 text-center">${item.student_number}</td>
                <td class="p-3 font-bold">${stdName}</td>
                <td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center font-black">${teaEval ? teaEval.total_difficulty_score : '-'}</td>
                <td class="p-3 text-center">${actionBtn}</td>
            </tr>`);
        } else {
            let scoreTxt = '-', resultBadge = '<span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs">ยังไม่ประเมิน</span>';
            if (mainEval) {
                scoreTxt = `<span class="font-black text-indigo-600">${mainEval.total_difficulty_score}</span>`;
                const st = getSDQStatus(mainEval.total_difficulty_score);
                const colorMap = { normal: 'emerald', risk: 'amber', problem: 'rose' };
                const c = colorMap[st.key] || 'slate';
                resultBadge = `<span class="text-xs font-bold text-${c}-600 bg-${c}-50 px-2 py-1 rounded-lg">${st.text}</span>`;
            }
            let actionBtn = `<div class="flex gap-2 justify-center">
                <button onclick="viewSDQ('${item.id}')" class="text-blue-600"><i class="fas fa-eye"></i></button>
                <button onclick="printStudentSDQ('${item.id}')" class="text-purple-600"><i class="fas fa-print"></i></button>`;
            if (!isReadOnly) {
                actionBtn += `<button onclick="deleteAllAssessments('${item.id}')" class="text-rose-500"><i class="fas fa-trash"></i></button>`;
            }
            actionBtn += `</div>`;
            tbody.append(`<tr>
                <td class="p-3 text-center">${roomTxt}</td>
                <td class="p-3 text-center">${item.student_number}</td>
                <td class="p-3 font-bold">${stdName}</td>
                <td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td>
                <td class="p-3 text-center">${scoreTxt}</td>
                <td class="p-3 text-center">${resultBadge}</td>
                <td class="p-3 text-center">${actionBtn}</td>
            </tr>`);
        }
    });

    tableInstance = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        pageLength: 50, destroy: true
    });
}

function showSelectPrompt(msg = 'กรุณาเลือกห้องเรียน') {
    if (tableInstance) { tableInstance.destroy(); tableInstance = null; }
    $('#dynamicThead').empty();
    $('#mainTable tbody').html(`
        <tr><td colspan="9" class="p-16 text-center">
            <div class="flex flex-col items-center gap-3 text-slate-400">
                <i class="fa-solid fa-school text-5xl"></i>
                <p class="text-lg font-bold">${msg}</p>
            </div>
        </td></tr>
    `);
}

// =======================================================
// Assessment form (25 questions)
// =======================================================
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
    if (isReadOnly) {
        Swal.fire('ไม่สามารถประเมินได้', 'คุณอยู่ในโหมดอ่านอย่างเดียว', 'warning');
        return;
    }
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) { Swal.fire('ไม่พบข้อมูลนักเรียน'); return; }

    const student = enrollment.core_students;
    const room = enrollment.core_classrooms;
    const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const roomText = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
    currentTeacherEnrollment = enrollment;

    loadTeacherQuestions();
    const existing = (enrollment.sdq_assessments || []).find(a => a.assessor_type === 'teacher');

    if (existing) {
        const confirm = await Swal.fire({
            title: 'พบการประเมินเดิม',
            text: `นักเรียน ${studentName} (${roomText}) มีการประเมินแล้ว ต้องการแก้ไขหรือทำใหม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'แก้ไขข้อมูลเดิม',
            cancelButtonText: 'ทำใหม่ (ลบข้อมูลเดิม)',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#ef4444'
        });
        if (confirm.isConfirmed) {
            teacherAnswers = {};
            for (let i = 1; i <= 25; i++) {
                const v = existing[`q${i}`];
                if (v !== undefined && v !== null) teacherAnswers[i] = v;
            }
        } else {
            const { error } = await db.from('sdq_assessments').delete().eq('id', existing.id);
            if (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลเดิมได้', 'error'); return; }
            teacherAnswers = {};
        }
    } else {
        teacherAnswers = {};
    }

    currentTeacherQIndex = 0;
    $('#teacherAssessStudentName').text(studentName);
    $('#teacherAssessRoomInfo').text(roomText);
    renderTeacherQuestion();
    $('#teacherStepForm').removeClass('hidden').css('display', 'flex');
}

function renderTeacherQuestion() {
    const q = teacherQuestions[currentTeacherQIndex];
    $('#teacherQuestionText').text(`${q.id}. ${q.text}`);
    const percent = Math.round((currentTeacherQIndex / 25) * 100);
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
    if (isReadOnly) {
        Swal.fire('ไม่สามารถบันทึกได้', 'คุณอยู่ในโหมดอ่านอย่างเดียว', 'warning');
        return;
    }
    if (Object.keys(teacherAnswers).length < 25) {
        Swal.fire('แจ้งเตือน', 'กรุณาตอบคำถามให้ครบทุกข้อ', 'warning');
        return;
    }
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const scores = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
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

    const { error } = await db.from('sdq_assessments')
        .upsert(payload, { onConflict: 'enrollment_id, assessor_type' });

    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        if (typeof logUserAction === 'function') {
            await logUserAction(`บันทึกการประเมิน SDQ (ครู)`, 'sdq');
        }
        Swal.fire('บันทึกสำเร็จ!', '', 'success');
        closeTeacherStepForm();
        await loadData();
    }
}

// =======================================================
// View / Print / Delete
// =======================================================
function viewSDQ(enrollmentId) {
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) return Swal.fire('ไม่พบข้อมูล');
    const student = enrollment.core_students;
    const asmts = enrollment.sdq_assessments || [];
    const tea = asmts.find(a => a.assessor_type === 'teacher');
    const par = asmts.find(a => a.assessor_type === 'parent');
    const std = asmts.find(a => a.assessor_type === 'student');
    const stdName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const room = enrollment.core_classrooms;
    const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '';

    function row(label, ev) {
        if (!ev) return `<tr><td class="py-2 px-3 font-bold">${label}</td><td colspan="6" class="text-center text-slate-400">ยังไม่ประเมิน</td></tr>`;
        const st = getSDQStatus(ev.total_difficulty_score);
        return `<tr>
            <td class="py-2 px-3 font-bold">${label}</td>
            <td class="text-center">${ev.score_emotional}</td>
            <td class="text-center">${ev.score_conduct}</td>
            <td class="text-center">${ev.score_hyper}</td>
            <td class="text-center">${ev.score_peer}</td>
            <td class="text-center">${ev.score_prosocial}</td>
            <td class="text-center font-black" style="color:${st.color}">${ev.total_difficulty_score}</td>
        </tr>`;
    }

    Swal.fire({
        title: `📋 ผลประเมิน SDQ`,
        html: `<p class="font-bold text-indigo-600">${stdName}</p>
               <p class="text-slate-500 text-sm mb-2">${roomTxt}</p>
               <div class="overflow-x-auto"><table class="w-full text-sm">
                 <thead class="bg-slate-100"><tr>
                   <th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th>
                 </tr></thead>
                 <tbody>${row('🧑 นักเรียน', std)}${row('👨‍👩‍👧 ผู้ปกครอง', par)}${row('👩‍🏫 ครู', tea)}</tbody>
               </table></div>`,
        width: '650px',
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-print"></i> พิมพ์',
        showCancelButton: true,
        cancelButtonText: 'ปิด'
    }).then(res => { if (res.isConfirmed) printStudentSDQ(enrollmentId); });
}

async function deleteAllAssessments(enrollmentId) {
    if (!requireAdmin(currentProfile?.role, isAdmin, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบได้')) return;

    const confirm = await Swal.fire({
        title: 'ยืนยันลบทั้งหมด?',
        text: 'จะลบทุกผู้ประเมินของนักเรียนคนนี้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ลบ'
    });
    if (!confirm.isConfirmed) return;

    const { error } = await db.from('sdq_assessments').delete().eq('enrollment_id', enrollmentId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    if (typeof logUserAction === 'function') {
        await logUserAction(`ลบการประเมิน SDQ`, 'sdq');
    }
    Swal.fire('สำเร็จ', '', 'success');

    if (isCurrentAdminMode && classroomTomSelect) {
        const id = classroomTomSelect.getValue();
        if (id) { loadClassroomStudents(id); return; }
    }
    loadData();
}

// =======================================================
// Print individual report (PDF)
// =======================================================
async function getAdvisorNames(classroomId) {
    if (!classroomId) return { advisor1: '-', advisor2: '-' };
    try {
        const { data: classroom } = await db.from('core_classrooms')
            .select('adviser_id_1, adviser_id_2').eq('id', classroomId).maybeSingle();
        if (!classroom) return { advisor1: '-', advisor2: '-' };

        const getName = async (id) => {
            if (!id) return '-';
            const { data: t } = await db.from('core_personnel')
                .select('prefix, first_name, last_name').eq('id', id).maybeSingle();
            return t ? `${t.prefix || ''}${t.first_name} ${t.last_name}` : '-';
        };
        return { advisor1: await getName(classroom.adviser_id_1), advisor2: await getName(classroom.adviser_id_2) };
    } catch { return { advisor1: '-', advisor2: '-' }; }
}

async function printStudentSDQ(enrollmentId) {
    try {
        Swal.fire({ title: 'กำลังเตรียมเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const enrollment = systemDataList.find(e => e.id === enrollmentId);
        if (!enrollment) throw new Error('ไม่พบข้อมูลการลงทะเบียน');

        const student = enrollment.core_students;
        const asmts = enrollment.sdq_assessments || [];
        const tea = asmts.find(a => a.assessor_type === 'teacher');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const std = asmts.find(a => a.assessor_type === 'student');

        const name = `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();
        const room = enrollment.core_classrooms;
        const roomTxt = (room && room.grade_level) ? `ม.${room.grade_level}/${room.room_number}` : 'ไม่ระบุห้อง';
        const school = currentSchoolInfo?.school_name || 'โรงเรียน';
        const logoUrl = 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';

        let advisors = { advisor1: '-', advisor2: '-' };
        if (room?.id) advisors = await getAdvisorNames(room.id);

        const getTotalStatus = (s) => {
            const st = getSDQStatus(s);
            return { text: st.text, color: st.color };
        };

        const buildRow = (assess, label) => {
            if (!assess) return `<tr><td style="padding:8px;">${label}</td><td colspan="8" style="text-align:center;">ยังไม่ประเมิน</td></tr>`;
            const e = assess.score_emotional ?? 0, c = assess.score_conduct ?? 0,
                  h = assess.score_hyper ?? 0, p = assess.score_peer ?? 0,
                  ps = assess.score_prosocial ?? 0, total = assess.total_difficulty_score ?? (e+c+h+p);
            const st = getTotalStatus(total);
            return `<tr>
                <td style="padding:8px;">${label}</td>
                <td style="text-align:center;">${e}</td>
                <td style="text-align:center;">${c}</td>
                <td style="text-align:center;">${h}</td>
                <td style="text-align:center;">${p}</td>
                <td style="text-align:center;">${ps}</td>
                <td style="text-align:center;font-weight:bold;">${total}</td>
                <td style="text-align:center;color:${st.color};">${st.text}</td>
            </tr>`;
        };

        const htmlContent = `<!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>SDQ Report - ${name}</title>
        <style>
            body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 800px; margin: 0 auto; background: white; }
            .header { text-align: center; margin-bottom: 10px; }
            .school-name { font-size: 16px; font-weight: bold; color: #4f46e5; }
            .report-title { font-size: 13px; }
            .student-info { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px; }
            .student-name { font-size: 18px; font-weight: 900; margin: 4px 0; }
            .details { font-size: 12px; color: #64748b; }
            .advisor { font-size: 11px; color: #475569; }
            .section-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 11px; }
            th, td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
            th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
            .criteria { margin-top: 16px; padding: 10px; background: #f1f5f9; border-radius: 8px; font-size: 10px; }
            .criteria-title { font-weight: bold; font-size: 11px; margin-bottom: 4px; }
            .footer { text-align: center; margin-top: 8px; color: #94a3b8; font-size: 9px; }
        </style></head>
        <body><div class="container">
            <div style="text-align:center;margin-bottom:5px;"><img src="${logoUrl}" style="max-height:60px;"></div>
            <div class="header">
                <div class="school-name">${escapeHtml(school)}</div>
                <div class="report-title">รายงานผลการประเมิน SDQ (ครู)</div>
            </div>
            <div class="student-info">
                <div class="student-name">${escapeHtml(name)}</div>
                <div class="details">${escapeHtml(roomTxt)} | ภาคเรียนที่ ${currentSchoolInfo?.current_semester} ปีการศึกษา ${currentSchoolInfo?.current_academic_year}</div>
                <div class="advisor">ครูที่ปรึกษา: ${escapeHtml(advisors.advisor1)}${advisors.advisor2 !== '-' ? `, ${escapeHtml(advisors.advisor2)}` : ''}</div>
            </div>
            <div class="section-title">คะแนนและสถานะรายด้าน</div>
            <table>
                <thead><tr><th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th><th>สรุป</th></tr></thead>
                <tbody>${buildRow(std, 'นักเรียน')}${buildRow(par, 'ผู้ปกครอง')}${buildRow(tea, 'ครู')}</tbody>
            </table>
            <div class="criteria">
                <div class="criteria-title">เกณฑ์การแปลผล</div>
                <div>คะแนนรวม: 0-15=ปกติ, 16-18=เสี่ยง, 19-40=มีปัญหา</div>
            </div>
            <div class="footer">พิมพ์ ${new Date().toLocaleDateString('th-TH')} | ระบบ SDQ</div>
        </div>
        <script>window.onload=function(){window.print();setTimeout(()=>window.close(),500);};<\/script>
        </body></html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function printSummaryPDF() {
    if (systemDataList.length === 0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');
    // ... (ใช้โค้ด printSummaryPDF เดิมของ sdq_teacher.js ได้เลย) ...
    Swal.fire('กำลังพัฒนา', 'ฟังก์ชันพิมพ์สรุปจะมาในเวอร์ชันถัดไป', 'info');
}

// =======================================================
// Export Excel
// =======================================================
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
            return {
                'ห้อง': roomTxt, 'เลขที่': item.student_number,
                'ชื่อ-สกุล': `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                'นร.': std ? 'แล้ว' : 'ยัง', 'ผปค.': par ? 'แล้ว' : 'ยัง', 'ครู': tea ? 'แล้ว' : 'ยัง',
                'คะแนนครู': tea?.total_difficulty_score || '-'
            };
        } else {
            const main = tea || par || std;
            return {
                'ชั้น/ห้อง': roomTxt, 'เลขที่': item.student_number, 'รหัส': s?.student_id_card,
                'ชื่อ': `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                'คะแนนนร.': std?.total_difficulty_score || '-',
                'คะแนนผปค.': par?.total_difficulty_score || '-',
                'คะแนนครู': tea?.total_difficulty_score || '-',
                'อารมณ์': main?.score_emotional || '-', 'ประพฤติ': main?.score_conduct || '-',
                'สมาธิสั้น': main?.score_hyper || '-', 'เพื่อน': main?.score_peer || '-',
                'สังคม': main?.score_prosocial || '-'
            };
        }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SDQ_Report');
    XLSX.writeFile(wb, `SDQ_${isCurrentAdminMode ? 'admin' : 'teacher'}_${currentSchoolInfo?.current_academic_year}.xlsx`);
}

// =======================================================
// Admin Manager (add/remove SDQ admins)
// =======================================================
async function openAdminManager() {
    if (!requireAdmin(currentProfile?.role, isAdmin, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    document.getElementById('adminManagerModal').classList.remove('hidden');
    await Promise.all([loadPersonnelOptions(), loadCurrentAdmins()]);
}

function closeAdminManager() {
    document.getElementById('adminManagerModal').classList.add('hidden');
}

async function loadPersonnelOptions() {
    try {
        const { data: currentAdmins } = await db.from('core_module_admins')
            .select('user_id').eq('module_id', 'sdq');
        const adminUserIds = (currentAdmins || []).map(a => a.user_id);

        const { data: personnel, error } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .order('first_name');
        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';
        if (select.tomselect) select.tomselect.destroy();

        const empty = document.createElement('option');
        empty.value = ''; empty.textContent = '-- เลือกบุคลากร --';
        select.appendChild(empty);

        (personnel || []).forEach(p => {
            if (adminUserIds.includes(p.id)) return;
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = `${p.prefix || ''}${p.first_name} ${p.last_name}${p.position ? ` - ${p.position}` : ''}${p.department ? ` [${p.department}]` : ''}`;
            select.appendChild(o);
        });

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body'
        });
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: raw, error } = await db.from('core_module_admins')
            .select('id, user_id, created_at').eq('module_id', 'sdq');
        if (error) throw error;

        let moduleAdmins = [];
        if (raw && raw.length > 0) {
            const ids = raw.map(a => a.user_id);
            const { data: plist } = await db.from('core_personnel')
                .select('id, prefix, first_name, last_name, position, department').in('id', ids);
            const map = {}; (plist || []).forEach(p => map[p.id] = p);
            moduleAdmins = raw.map(a => ({ ...a, core_personnel: map[a.user_id] })).filter(a => a.core_personnel);
        }

        const { data: supers } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');

        const div = document.getElementById('adminList');
        let html = '', count = 0;

        (supers || []).forEach(a => {
            html += `
                <div class="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <i class="fa-solid fa-crown text-amber-600"></i>
                        </div>
                        <div>
                            <div class="font-bold text-slate-800">${a.prefix || ''}${a.first_name} ${a.last_name}</div>
                            <div class="text-xs text-slate-500">${a.position || ''}${a.department ? ' · ' + a.department : ''}</div>
                            <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">
                                <i class="fa-solid fa-star mr-1"></i>Super Admin
                            </span>
                        </div>
                    </div>
                    <span class="text-xs text-slate-400">ถาวร</span>
                </div>`;
            count++;
        });

        moduleAdmins.forEach(a => {
            const p = a.core_personnel;
            const created = a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH') : 'ไม่ระบุ';
            html += `
                <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <i class="fa-solid fa-user-shield text-indigo-600"></i>
                        </div>
                        <div>
                            <div class="font-bold text-slate-800">${p.prefix || ''}${p.first_name} ${p.last_name}</div>
                            <div class="text-xs text-slate-500">${p.position || ''}${p.department ? ' · ' + p.department : ''}</div>
                            <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                                <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${created}
                            </span>
                        </div>
                    </div>
                    <button onclick="removeSDQAdmin('${a.id}', '${p.prefix || ''}${p.first_name} ${p.last_name}')"
                            class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold">
                        <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                    </button>
                </div>`;
            count++;
        });

        if (html === '') {
            html = `<div class="text-center text-slate-400 py-8">
                <i class="fa-solid fa-user-slash text-3xl mb-2"></i>
                <p>ยังไม่มีผู้ดูแลระบบ SDQ</p>
            </div>`;
        }

        div.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${count} คน)`;
    } catch (err) {
        console.error(err);
        document.getElementById('adminList').innerHTML = `<div class="text-center text-rose-400 py-8"><p>ไม่สามารถโหลดข้อมูลได้</p></div>`;
    }
}

async function addSDQAdmin() {
    if (!requireAdmin(currentProfile?.role, isAdmin, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const select = document.getElementById('personnelSelect');
    const personnelId = select.tomselect ? select.tomselect.getValue() : select.value;
    if (!personnelId) return Swal.fire('กรุณาเลือก', 'กรุณาเลือกครู/บุคลากรก่อน', 'warning');

    try {
        const { data: p } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name').eq('id', personnelId).single();
        if (!p) return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');

        const { data: existing } = await db.from('core_module_admins')
            .select('id').eq('user_id', personnelId).eq('module_id', 'sdq').maybeSingle();
        if (existing) return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล SDQ อยู่แล้ว', 'info');

        const { error } = await db.from('core_module_admins')
            .insert({ user_id: personnelId, module_id: 'sdq', created_at: new Date().toISOString() });
        if (error) throw error;

        if (typeof logUserAction === 'function') {
            await logUserAction(`แต่งตั้ง SDQ admin`, 'sdq');
        }

        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ!', timer: 2000, showConfirmButton: false });
        if (select.tomselect) select.tomselect.clear();
        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function removeSDQAdmin(adminId, name) {
    if (!requireAdmin(currentProfile?.role, isAdmin, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    const r = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `ถอดถอน <strong>${name}</strong> ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ถอดถอน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!r.isConfirmed) return;

    const { error } = await db.from('core_module_admins').delete().eq('id', adminId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ!', timer: 2000, showConfirmButton: false });
    await loadCurrentAdmins();
    await loadPersonnelOptions();
}

// =======================================================
// Refresh nav buttons (role-based show/hide)
// =======================================================
function refreshNavButtons() {
    const btnAdminManager = document.getElementById('nav-sdq-admin-manager');
    if (btnAdminManager) {
        const isAdminRole = isAdminUser(window.currentUserRole, false) || isModuleAdmin;
        btnAdminManager.classList.toggle('hidden', !isAdminRole);
    }
}

// =======================================================
// Expose globals
// =======================================================
window.toggleTeacherAdminMode = toggleTeacherAdminMode;
window.startTeacherAssessment = startTeacherAssessment;
window.closeTeacherStepForm = closeTeacherStepForm;
window.submitTeacherAssessment = submitTeacherAssessment;
window.teacherNavQuestion = teacherNavQuestion;
window.teacherSelectAnswer = teacherSelectAnswer;
window.viewSDQ = viewSDQ;
window.deleteAllAssessments = deleteAllAssessments;
window.printStudentSDQ = printStudentSDQ;
window.printSummaryPDF = printSummaryPDF;
window.exportExcel = exportExcel;
window.openAdminManager = openAdminManager;
window.closeAdminManager = closeAdminManager;
window.addSDQAdmin = addSDQAdmin;
window.removeSDQAdmin = removeSDQAdmin;
window.refreshNavButtons = refreshNavButtons;

console.log('✅ sdq_teacher.js loaded (standard template)');
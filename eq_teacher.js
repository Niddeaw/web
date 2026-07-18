/**
 * eq_teacher.js — Admin/Teacher Dashboard สำหรับ EQ 9 ด้าน (ดี/เก่ง/สุข)
 * ปรับปรุงการตรวจสอบสิทธิ์ให้เป็นมาตรฐานเดียวกับ config.js (ระบบชุมนุม)
 * รองรับการจัดการแอดมินโมดูล (Module Admin) โดยใช้ core_module_admins
 * 
 * แก้ไขล่าสุด: ใช้ checkSessionAndRole, hasModuleAccess, applyVisibilityByRole
 * เพิ่มระบบจัดการ Module Admin เหมือน SDQ
 * เพิ่ม logUserAction ในทุก CRUD
 */

const MODULE_ID = 'eq';

// ==========================================
// ตัวแปร Global
// ==========================================
let currentUser = null;
let currentProfile = null;
let currentUserRole = null;
let isAdminMode = false;
let isModuleAdmin = false;
let schoolInfo = null;
let eqTable = null;
let allResults = [];
let allClassrooms = [];
let importMode = 'excel';
let currentUserId = null;
let adviserMap = {};
let goodSkillHappyChart = null; // เก็บ instance Chart.js
let currentSelectedClassroomId = null;

// Fallback สำหรับ EQ_NORM
if (typeof EQ_NORM === 'undefined') {
    window.EQ_NORM = {
        good: { min: 48, max: 58 },
        skill: { min: 45, max: 57 },
        happy: { min: 40, max: 55 },
        total: { min: 140, max: 170 },
        self_control: { min: 13, max: 17 },
        empathy: { min: 16, max: 20 },
        responsibility: { min: 16, max: 22 },
        motivation: { min: 14, max: 20 },
        problem_solving: { min: 13, max: 19 },
        relationship: { min: 14, max: 20 },
        self_esteem: { min: 9, max: 13 },
        life_satisfaction: { min: 16, max: 22 },
        peace_of_mind: { min: 15, max: 21 }
    };
}

// ==========================================
// INIT
// ==========================================
window.addEventListener('load', async () => {
    try {
        // ✅ ใช้ checkSessionAndRole จาก config.js
        const result = await checkSessionAndRole('ระบบประเมิน EQ', ['super_admin', 'admin', 'director', 'deputy', 'teacher']);
        if (!result) return;

        currentUser = result.user;
        currentProfile = result.personnel;
        currentUserId = currentUser.id;
        currentUserRole = currentProfile.role;

        const isAdminByRole = isAdminUser(currentUserRole, false);
        isModuleAdmin = await hasModuleAccess(currentUserRole, MODULE_ID, currentUserId);
        isAdminMode = isAdminByRole || isModuleAdmin;

        // ✅ แสดงชื่อผู้ใช้
        document.getElementById('user-display').textContent =
            `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;

        // ✅ ใช้ applyVisibilityByRole และ updateToggleModeUI
        applyVisibilityByRole(currentUserRole, isAdminMode, {
            settingsBtn: 'btn-settings',
            toggleBtn: 'btnToggleMode',
            adminManagerBtn: 'btnAdminManager'
        });
        updateToggleModeUI(currentUserRole, isAdminMode, 'btnToggleMode');

        // ✅ ปุ่ม Admin Manager (เฉพาะผู้มีสิทธิ์)
        const btnAdminManager = document.getElementById('btnAdminManager');
        if (btnAdminManager) {
            const hasSettings = canManageSettings(currentUserRole);
            btnAdminManager.classList.toggle('hidden', !hasSettings);
            btnAdminManager.classList.toggle('flex', hasSettings);
        }

        // ✅ โหลดข้อมูลโรงเรียน
        const { data: si } = await db.from('core_school_info').select('*').single();
        schoolInfo = si;

        if (si) {
            const { data: s } = await db.from('eq_settings')
                .select('*').eq('academic_year', si.current_academic_year).eq('semester', si.current_semester).maybeSingle();
            if (s) {
                document.getElementById('set-delay').value = s.delay_seconds;
                document.getElementById('set-active').checked = s.is_active;
            }
        }

        // ✅ ควบคุมการแสดงโหมด Admin/Teacher
        const adminFilter = document.getElementById('adminFilterSection');
        const teacherBar = document.getElementById('teacherActionBar');
        if (isAdminMode) {
            adminFilter.classList.remove('hidden');
            teacherBar.classList.add('hidden');
        } else {
            adminFilter.classList.add('hidden');
            teacherBar.classList.remove('hidden');
        }

        // ✅ บันทึก Log การเข้าใช้งาน
        await logUserAction('เข้าสู่ระบบประเมิน EQ', 'eq');

        await loadClassrooms();
        await loadStats();

    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// TOGGLE MODE
// ==========================================
async function toggleMode() {
    if (!canManageSettings(currentUserRole) && !isModuleAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่สามารถสลับโหมดได้', 'warning');
        return;
    }
    isAdminMode = !isAdminMode;
    
    // ✅ อัปเดต UI ด้วยฟังก์ชันกลาง
    applyVisibilityByRole(currentUserRole, isAdminMode, {
        settingsBtn: 'btn-settings',
        toggleBtn: 'btnToggleMode',
        adminManagerBtn: 'btnAdminManager'
    });
    updateToggleModeUI(currentUserRole, isAdminMode, 'btnToggleMode');

    const adminFilter = document.getElementById('adminFilterSection');
    const teacherBar = document.getElementById('teacherActionBar');
    if (isAdminMode) {
        adminFilter.classList.remove('hidden');
        teacherBar.classList.add('hidden');
    } else {
        adminFilter.classList.add('hidden');
        teacherBar.classList.remove('hidden');
    }

    if (eqTable) { eqTable.destroy(); eqTable = null; }
    document.getElementById('eq-tbody').innerHTML = '';
    await loadClassrooms();
    await loadStats();
    
    await logUserAction(`สลับโหมดเป็น ${isAdminMode ? 'Admin' : 'Teacher'}`, 'eq');
}

// ==========================================
// LOGOUT (มาตรฐานกลาง)
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

// ==========================================
// CLASSROOMS
// ==========================================
async function loadClassrooms() {
    let q = db.from('core_classrooms')
        .select('id, grade_level, room_number, core_personnel_1:core_personnel!adviser_id_1(prefix, first_name, last_name), core_personnel_2:core_personnel!adviser_id_2(prefix, first_name, last_name)')
        .eq('academic_year', schoolInfo?.current_academic_year)
        .eq('semester', schoolInfo?.current_semester)
        .order('grade_level').order('room_number');

    if (!isAdminMode) {
        q = q.or(`adviser_id_1.eq.${currentUserId},adviser_id_2.eq.${currentUserId}`);
    }

    const { data } = await q;
    allClassrooms = data || [];
    adviserMap = {};
    allClassrooms.forEach(c => {
        const names = [];
        if (c.core_personnel_1) names.push(`${c.core_personnel_1.prefix || ''}${c.core_personnel_1.first_name} ${c.core_personnel_1.last_name}`);
        if (c.core_personnel_2) names.push(`${c.core_personnel_2.prefix || ''}${c.core_personnel_2.first_name} ${c.core_personnel_2.last_name}`);
        adviserMap[c.id] = names.length > 0 ? names.join(' / ') : null;
    });

    if (isAdminMode) {
        const sel = document.getElementById('sel-classroom');
        if (sel.tomselect) sel.tomselect.destroy();
        sel.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>' +
            allClassrooms.map(r => `<option value="${r.id}">ม.${r.grade_level}/${r.room_number}</option>`).join('');
        new TomSelect('#sel-classroom', {
            placeholder: 'พิมพ์หรือเลือกห้องเรียน...',
            allowEmptyOption: true,
            maxOptions: null,
            dropdownParent: 'body',
            onChange(value) {
                const div = document.getElementById('adviserDisplay');
                const nameEl = document.getElementById('adviserNames');
                if (value && adviserMap[value]) {
                    nameEl.textContent = adviserMap[value];
                    div.classList.remove('hidden');
                } else {
                    div.classList.add('hidden');
                }
                currentSelectedClassroomId = value || null;
                if (value) {
                    loadResults(value);
                    loadStats(value);
                } else {
                    loadResults();
                    loadStats();
                }
            }
        });
        document.getElementById('adminFilterSection').classList.remove('hidden');
        document.getElementById('teacherActionBar').classList.add('hidden');
        await loadStats();
    } else {
        document.getElementById('adminFilterSection').classList.add('hidden');
        document.getElementById('teacherActionBar').classList.remove('hidden');
        if (allClassrooms.length > 0) {
            await loadResults(allClassrooms[0].id);
            currentSelectedClassroomId = allClassrooms[0].id;
            await loadStats(allClassrooms[0].id);
        } else {
            currentSelectedClassroomId = null;
            Swal.fire('แจ้งเตือน', 'ไม่พบห้องเรียนที่ปรึกษาในภาคเรียนนี้', 'info');
            await loadStats();
        }
    }
}

// ==========================================
// STATS
// ==========================================
async function loadStats(forceClassroomId = null) {
    const academicYear = String(schoolInfo?.current_academic_year);
    const semester = String(schoolInfo?.current_semester);

    let eqQuery = db.from('eq_assessments')
        .select('student_id, classroom_id, level_total')
        .eq('academic_year', academicYear)
        .eq('semester', semester);

    if (forceClassroomId) {
        eqQuery = eqQuery.eq('classroom_id', forceClassroomId);
    } else if (!isAdminMode) {
        const roomIds = allClassrooms.map(r => r.id);
        if (roomIds.length === 0) {
            renderStatsCards(0, 0, 0, 0, 0);
            renderGoodSkillHappyStats();
            return;
        }
        eqQuery = eqQuery.in('classroom_id', roomIds);
    }

    const { data: eqs } = await eqQuery;

    let totalStudents = 0;
    if (forceClassroomId) {
        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id')
            .eq('classroom_id', forceClassroomId);
        totalStudents = (enrolls || []).length;
    } else if (!isAdminMode) {
        const roomIds = allClassrooms.map(r => r.id);
        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id')
            .in('classroom_id', roomIds);
        totalStudents = (enrolls || []).length;
    } else {
        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id');
        totalStudents = (enrolls || []).length;
    }

    const assessed = eqs?.length || 0;
    const high = eqs?.filter(e => e.level_total === 'สูงกว่าเกณฑ์').length || 0;
    const mid = eqs?.filter(e => e.level_total === 'เกณฑ์ปกติ').length || 0;
    const low = eqs?.filter(e => e.level_total === 'ต่ำกว่าเกณฑ์').length || 0;

    renderStatsCards(totalStudents, assessed, high, mid, low);
    renderGoodSkillHappyStats();
}

function renderStatsCards(totalStudents, assessed, high, mid, low) {
    const notAssessed = totalStudents - assessed;
    const pct = totalStudents > 0 ? Math.round(assessed / totalStudents * 100) : 0;

    document.getElementById('stat-cards').innerHTML = [
        { icon: 'fa-users', label: 'นักเรียนทั้งหมด', val: totalStudents, color: 'slate' },
        { icon: 'fa-check-circle', label: 'ประเมินแล้ว', val: `${assessed} (${pct}%)`, color: 'indigo' },
        { icon: 'fa-arrow-up', label: 'สูงกว่าเกณฑ์', val: high, color: 'green' },
        { icon: 'fa-equals', label: 'เกณฑ์ปกติ', val: mid, color: 'blue' },
        { icon: 'fa-arrow-down', label: 'ต่ำกว่าเกณฑ์', val: low, color: 'rose' },
        { icon: 'fa-clock', label: 'ยังไม่ประเมิน', val: notAssessed, color: 'amber' },
    ].map(s => `
        <div class="glass rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div class="h-11 w-11 bg-${s.color}-100 text-${s.color}-600 rounded-xl flex items-center justify-center">
                <i class="fas ${s.icon}"></i>
            </div>
            <div>
                <p class="text-slate-400 text-[10px] font-bold uppercase">${s.label}</p>
                <h3 class="text-2xl font-bold text-slate-800">${s.val}</h3>
            </div>
        </div>
    `).join('');
}

// ==========================================
// LOAD RESULTS
// ==========================================
async function loadResults(forceClassroomId = null) {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const sel = document.getElementById('sel-classroom');
        const classroomId = forceClassroomId || (isAdminMode && sel ? (sel.tomselect ? sel.tomselect.getValue() : sel.value) : null);

        let roomIds = [];
        if (classroomId) {
            roomIds = [classroomId];
        } else if (isAdminMode) {
            roomIds = allClassrooms.map(r => r.id);
        } else {
            roomIds = allClassrooms.map(r => r.id);
        }

        if (roomIds.length === 0) {
            Swal.close();
            allResults = [];
            renderTable([]);
            return;
        }

        let eqMap = {};
        const { data: eqs, error: eqsErr } = await db.from('eq_assessments')
            .select('*')
            .eq('academic_year', schoolInfo?.current_academic_year)
            .eq('semester', schoolInfo?.current_semester)
            .in('classroom_id', roomIds);

        if (eqsErr) console.error('loadResults eq error:', eqsErr);

        (eqs || []).forEach(e => {
            eqMap[e.student_id] = e;
        });

        let { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
            .in('classroom_id', roomIds)
            .order('student_number');

        if (enrollErr) {
            console.warn('❌ Query enrolls failed, retrying fallback...', enrollErr);
            const fallback = await db.from('student_enrollments')
                .select('student_id, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
                .in('classroom_id', roomIds);

            enrolls = fallback.data;
            if (fallback.error) {
                console.error('❌ Fallback query also failed:', fallback.error);
                throw fallback.error;
            }
        }

        Swal.close();
        allResults = (enrolls || []).map(e => ({ ...e, eq: eqMap[e.student_id] || null }));

        if (allResults.length === 0) {
            console.warn('⚠️ No students found for roomIds:', roomIds);
            Swal.fire({
                icon: 'info',
                title: 'ไม่พบรายชื่อนักเรียน',
                text: 'ยังไม่มีการนำเข้านักเรียนในห้องเรียนนี้',
                timer: 2000,
                showConfirmButton: false
            });
        }

        renderTable(allResults);
        renderGoodSkillHappyStats();

    } catch (error) {
        Swal.close();
        console.error('❌ Error in loadResults:', error);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้ (โปรดกด F12 เพื่อดู Console ว่าตารางขาดคอลัมน์ใด)', 'error');
        allResults = [];
        renderTable([]);
    }
}

// ==========================================
// RENDER TABLE
// ==========================================
function renderTable(rows) {
    if (eqTable) { eqTable.destroy(); eqTable = null; }
    const tbody = document.getElementById('eq-tbody');
    if (!tbody) return;

    const getLevelBadge = (level) => {
        if (!level) return '<span class="text-slate-300">-</span>';
        let cls = '';
        if (['โดดเด่น', 'สูง', 'สูงกว่าเกณฑ์'].includes(level)) {
            cls = 'bg-green-100 text-green-700';
        } else if (['ปานกลาง', 'เกณฑ์ปกติ'].includes(level)) {
            cls = 'bg-blue-100 text-blue-700';
        } else if (['ควรพัฒนา', 'ต่ำ', 'ต่ำกว่าเกณฑ์'].includes(level)) {
            cls = 'bg-amber-100 text-amber-700';
        } else {
            cls = 'bg-slate-100 text-slate-600';
        }
        return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${level}</span>`;
    };

    let html = '';
    for (const r of rows) {
        const cls = r.core_classrooms;
        const std = r.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const eq = r.eq;

        if (!eq) {
            html += `<tr>
                <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
                <td class="text-center">${r.student_number}</td>
                <td class="font-semibold text-slate-700">${fullName}</td>
                <td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td><td class="text-center">-</td>
                <td class="text-center text-slate-400">ยังไม่ประเมิน</td>
                <td class="text-center"><button onclick='openEditForStudent("${r.student_id}")' class="bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded text-xs">ประเมิน</button></td>
            </tr>`;
            continue;
        }

        const goodScore = (eq.score_self_control || 0) + (eq.score_empathy || 0) + (eq.score_responsibility || 0);
        const skillScore = (eq.score_motivation || 0) + (eq.score_problem_solving || 0) + (eq.score_relationship || 0);
        const happyScore = (eq.score_self_esteem || 0) + (eq.score_life_satisfaction || 0) + (eq.score_peace_of_mind || 0);
        const totalScore = goodScore + skillScore + happyScore;

        const actions = `<div class="flex gap-1 justify-center">
            <button onclick='openViewResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100" title="ดูผลการประเมิน"><i class="fas fa-eye text-xs"></i></button>
            <button onclick='openEditForStudent("${r.student_id}")' class="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>
            <button onclick='printStudentPdf("${r.student_id}")' class="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="PDF"><i class="fas fa-print text-xs"></i></button>
            <button onclick='deleteResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="ลบ"><i class="fas fa-trash text-xs"></i></button>
        </div>`;

        html += `<tr>
            <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
            <td class="text-center font-bold text-slate-400">${r.student_number}</td>
            <td class="font-semibold text-slate-700">${fullName}</td>
            <td class="text-center">${goodScore} / 72</td>
            <td class="text-center">${skillScore} / 72</td>
            <td class="text-center">${happyScore} / 64</td>
            <td class="text-center font-bold">${totalScore} / 208</td>
            <td class="text-center">${getLevelBadge(eq.level_total)}</td>
            <td class="text-center">${actions}</td>
        </tr>`;
    }

    tbody.innerHTML = html;
    eqTable = new DataTable('#eq-table', {
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        responsive: true,
        scrollX: true,
        pageLength: 50,
        columnDefs: [{ orderable: false, targets: [8] }]
    });
}

// ==========================================
// ฟังก์ชันอัปเดตการ์ดและ Chart (ดี/เก่ง/สุข)
// ==========================================
function renderGoodSkillHappyStats() {
    let goodCount = 0, skillCount = 0, happyCount = 0;
    allResults.forEach(r => {
        const eq = r.eq;
        if (!eq) return;
        if (eq.level_good !== 'ต่ำกว่าเกณฑ์') goodCount++;
        if (eq.level_skill !== 'ต่ำกว่าเกณฑ์') skillCount++;
        if (eq.level_happy !== 'ต่ำกว่าเกณฑ์') happyCount++;
    });

    document.getElementById('stat-good-count').textContent = goodCount;
    document.getElementById('stat-skill-count').textContent = skillCount;
    document.getElementById('stat-happy-count').textContent = happyCount;

    renderGoodSkillHappyChart(goodCount, skillCount, happyCount);
}

function renderGoodSkillHappyChart(good, skill, happy) {
    const ctx = document.getElementById('chartGoodSkillHappy');
    if (!ctx) return;

    if (goodSkillHappyChart) {
        goodSkillHappyChart.destroy();
        goodSkillHappyChart = null;
    }

    goodSkillHappyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ดี', 'เก่ง', 'สุข'],
            datasets: [{
                label: 'จำนวนนักเรียน',
                data: [good, skill, happy],
                backgroundColor: ['#6366f1', '#8b5cf6', '#14b8a6'],
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                }
            }
        }
    });
}

// ==========================================
// VIEW RESULT
// ==========================================
function closeViewModal() {
    document.getElementById('view-result-modal').classList.add('hidden');
    document.getElementById('view-result-modal').classList.remove('flex');
}

async function openViewResult(studentId) {
    let row = allResults.find(r => r.student_id === studentId);

    if (!row) {
        Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
            .eq('student_id', studentId)
            .single();

        const { data: eq } = await db.from('eq_assessments')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', schoolInfo?.current_academic_year)
            .eq('semester', schoolInfo?.current_semester)
            .single();

        if (!enroll) {
            Swal.close();
            Swal.fire('ไม่พบข้อมูล', 'ไม่สามารถดึงข้อมูลนักเรียนคนนี้ได้', 'error');
            return;
        }
        row = { ...enroll, eq: eq || null };
        Swal.close();
    }

    const std = row.core_students;
    const cls = row.core_classrooms;
    const eq = row.eq;
    const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    const room = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';

    document.getElementById('vr-name').textContent = fullName;
    document.getElementById('vr-room').textContent = room;

    if (!eq) {
        document.getElementById('vr-body').innerHTML = '<p class="text-center text-slate-400 py-8">ยังไม่มีข้อมูลการประเมิน</p>';
        document.getElementById('view-result-modal').classList.remove('hidden');
        document.getElementById('view-result-modal').classList.add('flex');
        return;
    }

    const levelObj = (score, norm) => {
        if (score < norm.min) return { label: 'ต่ำกว่าเกณฑ์', cls: 'bg-red-100 text-red-700' };
        if (score <= norm.max) return { label: 'เกณฑ์ปกติ', cls: 'bg-blue-100 text-blue-700' };
        return { label: 'สูงกว่าเกณฑ์', cls: 'bg-green-100 text-green-700' };
    };
    const badge = (score, norm) => {
        const l = levelObj(score, norm);
        return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${l.cls}">${l.label}</span>`;
    };
    const bar = (score, max, norm) => {
        const pct = Math.round((score / max) * 100);
        const color = score < norm.min ? 'bg-red-400' : score <= norm.max ? 'bg-blue-400' : 'bg-green-400';
        return `<div class="w-full bg-slate-100 rounded-full h-2 mt-1"><div class="${color} h-2 rounded-full" style="width:${pct}%"></div></div>`;
    };

    const totalScore = eq.score_total || 0;
    const totalLvl = levelObj(totalScore, EQ_NORM.total);

    const subDims = [
        { label: '1.1 ควบคุมตนเอง', score: eq.score_self_control, max: 24, norm: EQ_NORM.self_control },
        { label: '1.2 เห็นใจผู้อื่น', score: eq.score_empathy, max: 24, norm: EQ_NORM.empathy },
        { label: '1.3 รับผิดชอบ', score: eq.score_responsibility, max: 24, norm: EQ_NORM.responsibility },
        { label: '2.1 มีแรงจูงใจ', score: eq.score_motivation, max: 24, norm: EQ_NORM.motivation },
        { label: '2.2 ตัดสินใจ/แก้ปัญหา', score: eq.score_problem_solving, max: 24, norm: EQ_NORM.problem_solving },
        { label: '2.3 สัมพันธภาพ', score: eq.score_relationship, max: 24, norm: EQ_NORM.relationship },
        { label: '3.1 ภูมิใจตนเอง', score: eq.score_self_esteem, max: 16, norm: EQ_NORM.self_esteem },
        { label: '3.2 พอใจชีวิต', score: eq.score_life_satisfaction, max: 24, norm: EQ_NORM.life_satisfaction },
        { label: '3.3 สุขสงบทางใจ', score: eq.score_peace_of_mind, max: 24, norm: EQ_NORM.peace_of_mind },
    ];

    const groups = [
        { label: 'ด้านดี', score: eq.score_good, max: 72, norm: EQ_NORM.good, color: 'indigo', dims: subDims.slice(0, 3) },
        { label: 'ด้านเก่ง', score: eq.score_skill, max: 72, norm: EQ_NORM.skill, color: 'purple', dims: subDims.slice(3, 6) },
        { label: 'ด้านสุข', score: eq.score_happy, max: 64, norm: EQ_NORM.happy, color: 'teal', dims: subDims.slice(6, 9) },
    ];

    const groupsHtml = groups.map(g => `
        <div class="border border-slate-200 rounded-2xl overflow-hidden">
            <div class="bg-${g.color}-50 px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-${g.color}-700">${g.label}</span>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-slate-700">${g.score || 0}/${g.max}</span>
                    ${badge(g.score || 0, g.norm)}
                </div>
            </div>
            <div class="divide-y divide-slate-100">
                ${g.dims.map(d => `
                <div class="px-4 py-2.5">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-slate-600">${d.label}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-700">${d.score || 0}/${d.max}</span>
                            ${badge(d.score || 0, d.norm)}
                        </div>
                    </div>
                    ${bar(d.score || 0, d.max, d.norm)}
                </div>`).join('')}
            </div>
        </div>
    `).join('');

    document.getElementById('vr-body').innerHTML = `
        <div class="flex justify-center mb-5">
            <div class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl ${totalLvl.cls}">
                <i class="fas fa-star"></i>
                <span class="font-black text-2xl">${totalScore}</span>
                <span class="text-sm opacity-80">/ 208 คะแนน</span>
                <span class="font-bold">&nbsp;·&nbsp;${totalLvl.label}</span>
            </div>
        </div>
        <div class="space-y-3">${groupsHtml}</div>
        ${eq.note ? `<div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800"><i class="fas fa-note-sticky mr-1"></i><strong>หมายเหตุ:</strong> ${eq.note}</div>` : ''}
    `;

    document.getElementById('view-result-modal').classList.remove('hidden');
    document.getElementById('view-result-modal').classList.add('flex');
}

// ==========================================
// EDIT (CRUD) - ใช้ requireAdmin
// ==========================================

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

async function openEditForStudent(studentId) {
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขผลการประเมินได้')) {
        return;
    }

    let row = allResults.find(r => r.student_id === studentId);
    if (!row) {
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name)')
            .eq('student_id', studentId)
            .single();
        if (!enroll) {
            Swal.fire('ไม่พบข้อมูลนักเรียน', '', 'error');
            return;
        }
        row = { ...enroll, eq: null, core_students: enroll.core_students };
    }
    const std = row.core_students;
    const eq = row.eq || {};
    document.getElementById('edit-student-id').value = studentId;
    document.getElementById('edit-student-name').textContent = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    document.getElementById('edit-self-control').value = eq.score_self_control || 0;
    document.getElementById('edit-empathy').value = eq.score_empathy || 0;
    document.getElementById('edit-responsibility').value = eq.score_responsibility || 0;
    document.getElementById('edit-motivation').value = eq.score_motivation || 0;
    document.getElementById('edit-problem-solving').value = eq.score_problem_solving || 0;
    document.getElementById('edit-relationship').value = eq.score_relationship || 0;
    document.getElementById('edit-self-esteem').value = eq.score_self_esteem || 0;
    document.getElementById('edit-life-satisfaction').value = eq.score_life_satisfaction || 0;
    document.getElementById('edit-peace-of-mind').value = eq.score_peace_of_mind || 0;
    document.getElementById('edit-note').value = eq.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-modal').classList.add('flex');
}

async function saveEdit() {
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขผลการประเมินได้')) {
        return;
    }

    const studentId = document.getElementById('edit-student-id').value;
    const { data: enroll, error: enrollErr } = await db.from('student_enrollments')
        .select('classroom_id')
        .eq('student_id', studentId)
        .single();
    if (enrollErr || !enroll) {
        Swal.fire('ไม่พบข้อมูลการลงทะเบียนเรียนของนักเรียน', '', 'error');
        return;
    }
    const classroomId = enroll.classroom_id;

    const scores = {
        self_control: parseInt(document.getElementById('edit-self-control').value) || 0,
        empathy: parseInt(document.getElementById('edit-empathy').value) || 0,
        responsibility: parseInt(document.getElementById('edit-responsibility').value) || 0,
        motivation: parseInt(document.getElementById('edit-motivation').value) || 0,
        problem_solving: parseInt(document.getElementById('edit-problem-solving').value) || 0,
        relationship: parseInt(document.getElementById('edit-relationship').value) || 0,
        self_esteem: parseInt(document.getElementById('edit-self-esteem').value) || 0,
        life_satisfaction: parseInt(document.getElementById('edit-life-satisfaction').value) || 0,
        peace_of_mind: parseInt(document.getElementById('edit-peace-of-mind').value) || 0
    };
    const note = document.getElementById('edit-note').value;
    const goodScore = scores.self_control + scores.empathy + scores.responsibility;
    const skillScore = scores.motivation + scores.problem_solving + scores.relationship;
    const happyScore = scores.self_esteem + scores.life_satisfaction + scores.peace_of_mind;
    const total = goodScore + skillScore + happyScore;

    const getLevel = (score, norm) => {
        if (score < norm.min) return 'ต่ำกว่าเกณฑ์';
        if (score <= norm.max) return 'เกณฑ์ปกติ';
        return 'สูงกว่าเกณฑ์';
    };

    const payload = {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        answers: {},
        ...scores,
        score_good: goodScore,
        score_skill: skillScore,
        score_happy: happyScore,
        score_total: total,
        level_good: getLevel(goodScore, EQ_NORM.good),
        level_skill: getLevel(skillScore, EQ_NORM.skill),
        level_happy: getLevel(happyScore, EQ_NORM.happy),
        level_total: getLevel(total, EQ_NORM.total),
        level_self_control: getLevel(scores.self_control, EQ_NORM.self_control),
        level_empathy: getLevel(scores.empathy, EQ_NORM.empathy),
        level_responsibility: getLevel(scores.responsibility, EQ_NORM.responsibility),
        level_motivation: getLevel(scores.motivation, EQ_NORM.motivation),
        level_problem_solving: getLevel(scores.problem_solving, EQ_NORM.problem_solving),
        level_relationship: getLevel(scores.relationship, EQ_NORM.relationship),
        level_self_esteem: getLevel(scores.self_esteem, EQ_NORM.self_esteem),
        level_life_satisfaction: getLevel(scores.life_satisfaction, EQ_NORM.life_satisfaction),
        level_peace_of_mind: getLevel(scores.peace_of_mind, EQ_NORM.peace_of_mind),
        note: note,
        recorder_id: currentUser.id,
        completed_at: new Date().toISOString()
    };

    const { error } = await db.from('eq_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
    if (error) {
        Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
        return;
    }
    
    // ✅ บันทึก Log
    await logUserAction(`แก้ไขผลประเมิน EQ ของนักเรียน ID ${studentId}`, 'eq');
    
    Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false });
    closeEditModal();
    loadResults();
    loadStats();
}

async function deleteResult(studentId) {
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบผลการประเมินได้')) {
        return;
    }
    
    const r = await Swal.fire({
        title: 'ลบผลการประเมิน?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ'
    });
    if (!r.isConfirmed) return;
    
    await db.from('eq_assessments').delete()
        .eq('student_id', studentId)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);
    
    // ✅ บันทึก Log
    await logUserAction(`ลบผลประเมิน EQ ของนักเรียน ID ${studentId}`, 'eq');
    
    Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1400, showConfirmButton: false });
    loadResults();
    loadStats();
}

// ==========================================
// EXPORT EXCEL (ครูและ Admin ใช้ได้)
// ==========================================
function exportExcel() {
    if (!allResults.length) return Swal.fire('ไม่มีข้อมูล', '', 'info');
    const rows = allResults.map(r => {
        const std = r.core_students;
        const cls = r.core_classrooms;
        const eq = r.eq;
        if (!eq) return null;
        return {
            'ห้องเรียน': cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
            'เลขที่': r.student_number,
            'ชื่อ-สกุล': `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`,
            '1.1 ควบคุมตนเอง': eq.score_self_control,
            '1.2 เห็นใจผู้อื่น': eq.score_empathy,
            '1.3 รับผิดชอบ': eq.score_responsibility,
            '2.1 มีแรงจูงใจ': eq.score_motivation,
            '2.2 ตัดสินใจและแก้ปัญหา': eq.score_problem_solving,
            '2.3 สัมพันธภาพ': eq.score_relationship,
            '3.1 ภูมิใจตนเอง': eq.score_self_esteem,
            '3.2 พอใจชีวิต': eq.score_life_satisfaction,
            '3.3 สุขสงบทางใจ': eq.score_peace_of_mind,
            'รวม (208)': eq.score_total,
            'ระดับรวม': eq.level_total,
        };
    }).filter(r => r);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EQ_9dim');
    XLSX.writeFile(wb, `EQ_${isAdminMode ? 'admin' : 'teacher'}_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.xlsx`);
    
    // ✅ บันทึก Log
    logUserAction(`ส่งออก Excel EQ (${isAdminMode ? 'Admin' : 'Teacher'})`, 'eq');
}

// ==========================================
// PRINT STUDENT PDF
// ==========================================
async function printStudentPdf(studentId) {
    Swal.fire({ title: 'กำลังเตรียมเอกสาร PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (!studentId) throw new Error('ไม่พบรหัสนักเรียน');

        const { data: assessment, error } = await db.from('eq_assessments')
            .select('*, core_students!student_id(prefix, first_name, last_name, avatar_students_url, student_id_card), core_classrooms!classroom_id(grade_level, room_number)')
            .eq('student_id', studentId)
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester)
            .single();
        if (error || !assessment) throw new Error('ไม่พบข้อมูลการประเมิน');

        let adviser1 = '-', adviser2 = '-';
        if (assessment.classroom_id) {
            const { data: cls } = await db.from('core_classrooms')
                .select(`
                    adviser1:core_personnel!adviser_id_1(prefix, first_name, last_name),
                    adviser2:core_personnel!adviser_id_2(prefix, first_name, last_name)
                `)
                .eq('id', assessment.classroom_id)
                .single();
            if (cls) {
                if (cls.adviser1) adviser1 = `${cls.adviser1.prefix || ''}${cls.adviser1.first_name} ${cls.adviser1.last_name}`;
                if (cls.adviser2) adviser2 = `${cls.adviser2.prefix || ''}${cls.adviser2.first_name} ${cls.adviser2.last_name}`;
            }
        }

        const studentIdCard = assessment.core_students.student_id_card || '-';

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;
        const fullName = `${assessment.core_students.prefix || ''}${assessment.core_students.first_name} ${assessment.core_students.last_name}`;
        const avatarUrl = assessment.core_students.avatar_students_url || null;
        const room = assessment.core_classrooms
            ? `ม.${assessment.core_classrooms.grade_level}/${assessment.core_classrooms.room_number}`
            : '-';

        Swal.close();
        generateStudentPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl, room, studentIdCard);
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function generateStudentPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl, room, studentNumber) {
    const subDims = [
        { label: '1.1 ควบคุมตนเอง', score: assessment.score_self_control, max: 24, level: assessment.level_self_control, group: 'ดี' },
        { label: '1.2 เห็นใจผู้อื่น', score: assessment.score_empathy, max: 24, level: assessment.level_empathy, group: 'ดี' },
        { label: '1.3 รับผิดชอบ', score: assessment.score_responsibility, max: 24, level: assessment.level_responsibility, group: 'ดี' },
        { label: '2.1 มีแรงจูงใจ', score: assessment.score_motivation, max: 24, level: assessment.level_motivation, group: 'เก่ง' },
        { label: '2.2 ตัดสินใจและแก้ปัญหา', score: assessment.score_problem_solving, max: 24, level: assessment.level_problem_solving, group: 'เก่ง' },
        { label: '2.3 สัมพันธภาพ', score: assessment.score_relationship, max: 24, level: assessment.level_relationship, group: 'เก่ง' },
        { label: '3.1 ภูมิใจตนเอง', score: assessment.score_self_esteem, max: 16, level: assessment.level_self_esteem, group: 'สุข' },
        { label: '3.2 พอใจชีวิต', score: assessment.score_life_satisfaction, max: 24, level: assessment.level_life_satisfaction, group: 'สุข' },
        { label: '3.3 สุขสงบทางใจ', score: assessment.score_peace_of_mind, max: 24, level: assessment.level_peace_of_mind, group: 'สุข' }
    ];

    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" style="width:90px; height:90px; border-radius:10px; object-fit:cover; border:2px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:90px; height:90px; border-radius:10px; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:36px; color:#94a3b8;">👤</div>`;

    const totalColor = assessment.level_total === 'สูงกว่าเกณฑ์' ? '#15803d'
        : (assessment.level_total === 'เกณฑ์ปกติ' ? '#1d4ed8' : '#b91c1c');
    const totalBg = assessment.level_total === 'สูงกว่าเกณฑ์' ? '#dcfce7'
        : (assessment.level_total === 'เกณฑ์ปกติ' ? '#dbeafe' : '#fee2e2');

    const assessedDate = new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    const html = buildEQPdfHtml({ assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl, room, studentNumber, subDims, totalColor, totalBg, assessedDate });
    const imgUrls = [logoUrl, avatarUrl].filter(Boolean);
    if (imgUrls.length === 0) {
        generateStudentPdfNow(html, fullName);
    } else {
        let loaded = 0;
        imgUrls.forEach(url => {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                if (loaded === imgUrls.length) generateStudentPdfNow(html, fullName);
            };
            img.src = url;
        });
    }
}

function generateStudentPdfNow(html, fullName) {
    html2pdf().set({
        margin: [0.5, 0.5, 1.2, 0.5],
        filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    }).from(html, 'string').save();
}

// ==========================================
// IMPORT - ใช้ requireAdmin
// ==========================================
function openImportModal() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้')) {
        return;
    }
    document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

function setImportMode(mode) {
    importMode = mode;
    document.getElementById('import-excel-section').classList.toggle('hidden', mode !== 'excel');
    document.getElementById('import-sheets-section').classList.toggle('hidden', mode !== 'sheets');
    document.getElementById('tab-excel').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'excel' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
    document.getElementById('tab-sheets').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'sheets' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
}

async function handleFileImport(input) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้')) {
        input.value = '';
        return;
    }
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        await processImportRows(rows);
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

async function handleSheetsImport() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้')) {
        return;
    }
    const url = document.getElementById('sheets-url').value.trim();
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return Swal.fire('URL ไม่ถูกต้อง', '', 'error');
    Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading() });
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
        const res = await fetch(csvUrl);
        const text = await res.text();
        const rows = text.trim().split('\n').slice(1).map(line => {
            const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
            return {
                'รหัสนักเรียน': cols[0],
                'ควบคุมตนเอง': parseInt(cols[1]),
                'เห็นใจผู้อื่น': parseInt(cols[2]),
                'รับผิดชอบ': parseInt(cols[3]),
                'มีแรงจูงใจ': parseInt(cols[4]),
                'ตัดสินใจแก้ปัญหา': parseInt(cols[5]),
                'สัมพันธภาพ': parseInt(cols[6]),
                'ภูมิใจตนเอง': parseInt(cols[7]),
                'พอใจชีวิต': parseInt(cols[8]),
                'สุขสงบทางใจ': parseInt(cols[9])
            };
        });
        Swal.close();
        await processImportRows(rows);
    } catch (err) { Swal.close(); Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function processImportRows(rows) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้')) {
        return;
    }
    const dataRows = rows.filter(r => r['รหัสนักเรียน']);
    if (!dataRows.length) return Swal.fire('ไม่พบข้อมูล', '', 'warning');
    Swal.fire({ title: `พบ ${dataRows.length} รายการ`, text: 'กำลังนำเข้า...', didOpen: () => Swal.showLoading() });
    const { data: stds } = await db.from('core_students').select('id, student_id_card, classroom_id');
    const stdMap = Object.fromEntries((stds || []).map(s => [String(s.student_id_card).trim(), s]));

    let allowedClassroomIds = null;
    const selectedId = document.getElementById('sel-classroom')?.value;
    if (selectedId) {
        allowedClassroomIds = [selectedId];
    } else if (!isAdminMode) {
        allowedClassroomIds = allClassrooms.map(c => c.id);
    }

    const getLevel = (score, norm) => score < norm.min ? 'ต่ำกว่าเกณฑ์' : (score <= norm.max ? 'เกณฑ์ปกติ' : 'สูงกว่าเกณฑ์');
    let success = 0, fail = 0;
    for (const row of dataRows) {
        const std = stdMap[String(row['รหัสนักเรียน']).trim()];
        if (!std) { fail++; continue; }
        if (allowedClassroomIds && !allowedClassroomIds.includes(std.classroom_id)) {
            fail++;
            continue;
        }
        const scores = {
            self_control: row['ควบคุมตนเอง'] || 0,
            empathy: row['เห็นใจผู้อื่น'] || 0,
            responsibility: row['รับผิดชอบ'] || 0,
            motivation: row['มีแรงจูงใจ'] || 0,
            problem_solving: row['ตัดสินใจแก้ปัญหา'] || 0,
            relationship: row['สัมพันธภาพ'] || 0,
            self_esteem: row['ภูมิใจตนเอง'] || 0,
            life_satisfaction: row['พอใจชีวิต'] || 0,
            peace_of_mind: row['สุขสงบทางใจ'] || 0
        };
        const goodScore = scores.self_control + scores.empathy + scores.responsibility;
        const skillScore = scores.motivation + scores.problem_solving + scores.relationship;
        const happyScore = scores.self_esteem + scores.life_satisfaction + scores.peace_of_mind;
        const total = goodScore + skillScore + happyScore;
        const payload = {
            student_id: std.id,
            classroom_id: std.classroom_id,
            academic_year: schoolInfo.current_academic_year,
            semester: schoolInfo.current_semester,
            answers: {},
            recorder_id: currentUser.id,
            ...scores,
            score_good: goodScore,
            score_skill: skillScore,
            score_happy: happyScore,
            score_total: total,
            level_good: getLevel(goodScore, EQ_NORM.good),
            level_skill: getLevel(skillScore, EQ_NORM.skill),
            level_happy: getLevel(happyScore, EQ_NORM.happy),
            level_total: getLevel(total, EQ_NORM.total),
            level_self_control: getLevel(scores.self_control, EQ_NORM.self_control),
            level_empathy: getLevel(scores.empathy, EQ_NORM.empathy),
            level_responsibility: getLevel(scores.responsibility, EQ_NORM.responsibility),
            level_motivation: getLevel(scores.motivation, EQ_NORM.motivation),
            level_problem_solving: getLevel(scores.problem_solving, EQ_NORM.problem_solving),
            level_relationship: getLevel(scores.relationship, EQ_NORM.relationship),
            level_self_esteem: getLevel(scores.self_esteem, EQ_NORM.self_esteem),
            level_life_satisfaction: getLevel(scores.life_satisfaction, EQ_NORM.life_satisfaction),
            level_peace_of_mind: getLevel(scores.peace_of_mind, EQ_NORM.peace_of_mind)
        };
        const { error } = await db.from('eq_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
        if (error) fail++;
        else success++;
    }
    Swal.close();
    closeImportModal();
    
    // ✅ บันทึก Log
    await logUserAction(`นำเข้าข้อมูล EQ: ${success} รายการสำเร็จ, ${fail} รายการล้มเหลว`, 'eq');
    
    Swal.fire({ icon: success > 0 ? 'success' : 'error', title: 'นำเข้าเสร็จ', html: `สำเร็จ ${success} รายการ<br>ล้มเหลว ${fail} รายการ` });
    loadResults();
    loadStats();
}

// ==========================================
// SETTINGS (ใช้ requireAdmin)
// ==========================================
let allPersonnel = [];

function openSettings() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) {
        return;
    }
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (currentUserRole === 'super_admin') {
        document.getElementById('user-management-section').classList.remove('hidden');
        loadPersonnelForSettings();
    } else {
        document.getElementById('user-management-section').classList.add('hidden');
    }
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
}

async function saveSettings() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) {
        return;
    }
    const delay = parseInt(document.getElementById('set-delay').value) || 0;
    const active = document.getElementById('set-active').checked;
    const { error } = await db.from('eq_settings').upsert({
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        delay_seconds: delay,
        is_active: active
    }, { onConflict: 'academic_year,semester' });
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        // ✅ บันทึก Log
        await logUserAction(`บันทึกการตั้งค่า EQ (delay=${delay}s, active=${active})`, 'eq');
        Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1400, showConfirmButton: false });
        closeSettings();
    }
}

async function loadPersonnelForSettings() {
    if (!requireAdmin(currentUserRole, isAdminMode)) return;
    if (currentUserRole !== 'super_admin') return;
    const { data, error } = await db.from('core_personnel')
        .select('id, first_name, last_name, email, role, prefix')
        .order('first_name');
    if (error) {
        console.error(error);
        return;
    }
    allPersonnel = data || [];
    filterUsersForSettings();
}

function filterUsersForSettings() {
    const searchTerm = document.getElementById('user-search-settings')?.value.toLowerCase() || '';
    const filtered = allPersonnel.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm) ||
        (u.email || '').toLowerCase().includes(searchTerm)
    );
    renderUserTableForSettings(filtered);
}

function renderUserTableForSettings(users) {
    const tbody = document.getElementById('user-list-settings-tbody');
    if (!tbody) return;
    tbody.innerHTML = users.map(user => {
        const roleDisplay = user.role === 'super_admin' ? 'Super Admin' : (user.role === 'admin' ? 'Admin' : 'ครู');
        const roleClass = user.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
            (user.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600');
        return `<tr>
            <td class="px-2 py-1">${user.prefix || ''}${user.first_name} ${user.last_name}</td>
            <td class="px-2 py-1">${user.email || '-'}</td>
            <td class="px-2 py-1"><span class="px-2 py-0.5 rounded-full text-xs ${roleClass}">${roleDisplay}</span></td>
            <td class="px-2 py-1">-</td>
            <td class="px-2 py-1">-</td>
        </tr>`;
    }).join('');
    const searchInput = document.getElementById('user-search-settings');
    if (searchInput && !searchInput._listener) {
        searchInput.addEventListener('input', filterUsersForSettings);
        searchInput._listener = true;
    }
}

// ==========================================
// MODULE ADMIN MANAGEMENT (ใช้ core_module_admins)
// ==========================================
function openAdminManager() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการแอดมินโมดูลได้')) {
        return;
    }
    document.getElementById('adminManagerModal').classList.remove('hidden');
    loadPersonnelOptions();
    loadCurrentAdmins();
}

function closeAdminManager() {
    document.getElementById('adminManagerModal').classList.add('hidden');
}

async function loadPersonnelOptions() {
    try {
        const { data: currentAdmins } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', MODULE_ID);

        const adminUserIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];

        const { data: personnel, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .order('first_name', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';

        if (select.tomselect) select.tomselect.destroy();

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- เลือกบุคลากร --';
        select.appendChild(emptyOption);

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

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body'
        });
    } catch (err) {
        console.error('Load personnel error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: moduleAdminsRaw, error: adminError } = await db
            .from('core_module_admins')
            .select('id, user_id, created_at')
            .eq('module_id', MODULE_ID);

        if (adminError) throw adminError;

        let moduleAdmins = [];
        if (moduleAdminsRaw && moduleAdminsRaw.length > 0) {
            const userIds = moduleAdminsRaw.map(a => a.user_id);
            const { data: personnelList, error: pErr } = await db
                .from('core_personnel')
                .select('id, prefix, first_name, last_name, position, department')
                .in('id', userIds);
            if (pErr) throw pErr;

            const personnelMap = {};
            (personnelList || []).forEach(p => { personnelMap[p.id] = p; });
            moduleAdmins = moduleAdminsRaw
                .map(a => ({ ...a, core_personnel: personnelMap[a.user_id] || null }))
                .filter(a => a.core_personnel);
        }

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
                    <div class="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                <i class="fa-solid fa-crown text-amber-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">
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
                    <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                <i class="fa-solid fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                                    <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${createdDate}
                                </span>
                            </div>
                        </div>
                        <button onclick="removeModuleAdmin('${admin.id}', '${fullName}')" 
                                class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold transition-colors">
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
                    <p>ยังไม่มีผู้ดูแลระบบ ${MODULE_ID.toUpperCase()}</p>
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

async function addModuleAdmin() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แต่งตั้งผู้ดูแลโมดูลได้')) {
        return;
    }

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
            .eq('module_id', MODULE_ID)
            .maybeSingle();

        if (existing) {
            return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล EQ อยู่แล้ว', 'info');
        }

        const { error: insertError } = await db
            .from('core_module_admins')
            .insert({
                user_id: userId,
                module_id: MODULE_ID,
                created_at: new Date().toISOString()
            });

        if (insertError) throw insertError;

        // ✅ บันทึก Log
        await logUserAction(`แต่งตั้ง Module Admin EQ: ${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}`, 'eq');

        Swal.fire({
            icon: 'success',
            title: 'แต่งตั้งสำเร็จ!',
            text: `${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name} มีสิทธิ์จัดการระบบ EQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        if (select.tomselect) select.tomselect.clear();
        await loadCurrentAdmins();
        await loadPersonnelOptions();

    } catch (err) {
        console.error('Add admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มผู้ดูแลได้: ' + err.message, 'error');
    }
}

async function removeModuleAdmin(adminId, adminName) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอดถอนผู้ดูแลโมดูลได้')) {
        return;
    }

    const result = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `คุณต้องการถอดถอน <strong>${adminName}</strong> จากการเป็นผู้ดูแลระบบ EQ ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ถอดถอน',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await db
            .from('core_module_admins')
            .delete()
            .eq('id', adminId);

        if (error) throw error;

        // ✅ บันทึก Log
        await logUserAction(`ถอดถอน Module Admin EQ: ${adminName}`, 'eq');

        Swal.fire({
            icon: 'success',
            title: 'ถอดถอนสำเร็จ!',
            text: `${adminName} ไม่มีสิทธิ์จัดการระบบ EQ แล้ว`,
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

// ==========================================
// ฟังก์ชันเสริม buildEQPdfHtml (สำหรับ PDF)
// ==========================================
function buildEQPdfHtml(opts) {
    const { assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl, room, studentNumber, subDims, totalColor, totalBg, assessedDate } = opts;
    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" style="width:90px; height:90px; border-radius:10px; object-fit:cover; border:2px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:90px; height:90px; border-radius:10px; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:36px; color:#94a3b8;">👤</div>`;

    let subRows = '';
    subDims.forEach(d => {
        const percent = (d.score / d.max) * 100;
        const barColor = d.level === 'สูงกว่าเกณฑ์' ? '#10b981' : (d.level === 'เกณฑ์ปกติ' ? '#3b82f6' : '#ef4444');
        subRows += `<div class="bar-item">
            <div class="bar-label">
                <span><b>${d.label}</b> (${d.score}/${d.max})</span>
                <span>${Math.round(percent)}%</span>
            </div>
            <div class="bar-bg"><div class="bar-fill" style="width:${percent}%; background:${barColor};"></div></div>
        </div>`;
    });

    const tableRows = ['ดี', 'เก่ง', 'สุข'].map(groupName => {
        const items = subDims.filter(d => d.group === groupName);
        const groupScore = items.reduce((s, i) => s + i.score, 0);
        const groupMax = items.reduce((s, i) => s + i.max, 0);
        const groupLevel = groupName === 'ดี' ? assessment.level_good
            : (groupName === 'เก่ง' ? assessment.level_skill : assessment.level_happy);
        const details = items.map(it =>
            `<div class="sub-item"><strong>${it.label}</strong> ${it.score}/${it.max} (${it.level})</div>`
        ).join('');
        return `<tr>
            <td style="font-weight:bold">ด้าน${groupName}</td>
            <td style="text-align:center">${groupScore}/${groupMax}</td>
            <td style="text-align:center">${groupLevel}</td>
            <td>${details}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>EQ Report</title>
<style>
    @page { margin: 0.5cm 0.5cm 1.2cm 0.5cm; }
    body { font-family: 'Sarabun', 'Anuphan', sans-serif; font-size: 13px; color: #1e293b; background: white; margin: 0; padding: 0; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #312e81; padding-bottom: 8px; margin-bottom: 15px; }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .logo { height: 50px; width: auto; }
    .school-title { margin: 0; color: #312e81; font-size: 18px; font-weight: bold; }
    .school-sub { margin: 2px 0 0; font-size: 11px; color: #475569; }
    .info-area { text-align: right; font-size: 12px; }
    .two-col { display: flex; gap: 12px; margin-bottom: 15px; }
    .col-left { flex: 1.1; background: #f8fafc; border-radius: 10px; padding: 14px; display: flex; align-items: flex-start; gap: 14px; }
    .col-right { flex: 0.9; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .student-info p { margin: 5px 0; font-size: 13px; }
    .student-info .name { font-size: 15px; font-weight: bold; color: #1e293b; margin-bottom: 8px; }
    .label { font-size: 11px; color: #64748b; }
    .total-score { font-size: 48px; font-weight: 900; line-height: 1; }
    .total-out { font-size: 14px; color: #64748b; margin-top: 2px; }
    .total-label { font-size: 15px; font-weight: bold; margin-top: 8px; }
    .group-summary { margin-top: 10px; font-size: 11px; color: #475569; }
    .chart-title { font-size: 16px; font-weight: bold; margin: 10px 0 8px; }
    .bar-item { margin-bottom: 10px; }
    .bar-label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
    .bar-bg { background: #e2e8f0; border-radius: 20px; height: 10px; width: 100%; }
    .bar-fill { height: 10px; border-radius: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #312e81; color: white; }
    .sub-item { margin-bottom: 5px; }
    .footer { font-size: 8px; text-align: center; color: #94a3b8; margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 6px; page-break-inside: avoid; }
    table { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="header">
    <div class="logo-area">
        <img class="logo" src="${logoUrl}" crossorigin="anonymous">
        <div>
            <div class="school-title">${schoolName}</div>
            <div class="school-sub">รายงานผลการประเมินความฉลาดทางอารมณ์ (EQ)</div>
        </div>
    </div>
    <div class="info-area">
        <div><b>ภาคเรียนที่ ${semester}</b> ปีการศึกษา ${academicYear}</div>
        <div>ครูที่ปรึกษา: ${adviser1}${adviser2 !== '-' ? ' / ' + adviser2 : ''}</div>
    </div>
</div>
<div class="two-col">
    <div class="col-left">
        <div style="flex-shrink:0;">${avatarHtml}</div>
        <div class="student-info">
            <p class="name">${fullName}</p>
            <p><span class="label">เลขประจำตัว</span>&nbsp;&nbsp;${studentNumber}</p>
            <p><span class="label">ชั้น</span>&nbsp;&nbsp;${room}</p>
            <p><span class="label">วันที่ประเมิน</span>&nbsp;&nbsp;${assessedDate}</p>
        </div>
    </div>
    <div class="col-right" style="background:${totalBg};">
        <div class="label" style="font-size:12px; margin-bottom:4px;">คะแนนรวม EQ</div>
        <div class="total-score" style="color:${totalColor};">${assessment.score_total}</div>
        <div class="total-out">/ 208 คะแนน</div>
        <div class="total-label" style="color:${totalColor};">ระดับรวม: ${assessment.level_total}</div>
        <div class="group-summary">
            ดี ${assessment.score_good}/72 &nbsp;|&nbsp;
            เก่ง ${assessment.score_skill}/72 &nbsp;|&nbsp;
            สุข ${assessment.score_happy}/64
        </div>
    </div>
</div>
<div class="chart-title">📊 กราฟแสดงคะแนนรายด้านย่อย</div>
${subRows}
<table>
    <thead>
        <tr><th>ด้าน</th><th>คะแนนรวม</th><th>ระดับ</th><th>รายละเอียดด้านย่อย (คะแนน)</th></tr>
    </thead>
    <tbody>
        ${tableRows}
    </tbody>
</table>
<div class="footer">ระบบ WRK School Management System | EQ แบบประเมินกรมสุขภาพจิต (อายุ 12–17 ปี)</div>
</body></html>`;
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.toggleMode = toggleMode;
window.logout = logout;
window.openViewResult = openViewResult;
window.closeViewModal = closeViewModal;
window.openEditForStudent = openEditForStudent;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteResult = deleteResult;
window.exportExcel = exportExcel;
window.printStudentPdf = printStudentPdf;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.setImportMode = setImportMode;
window.handleFileImport = handleFileImport;
window.handleSheetsImport = handleSheetsImport;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.openAdminManager = openAdminManager;
window.closeAdminManager = closeAdminManager;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
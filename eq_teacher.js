/**
 * eq_teacher.js — Admin/Teacher Dashboard สำหรับ EQ 9 ด้าน (ดี/เก่ง/สุข)
 * รองรับ: กรองห้อง, สถิติ, แก้ไข, ลบ, ส่งออก Excel, นำเข้า, พิมพ์ PDF, จัดการผู้ใช้
 */

let currentUser = null;
let schoolInfo = null;
let eqTable = null;
let allResults = [];
let allClassrooms = [];
let importMode = 'excel';
let currentUserRole = 'admin';
let isAdminMode = true;
let currentUserId = null;
let adviserMap = {};

// Fallback สำหรับ EQ_NORM (เผื่อไม่มีใน eq_data.js)
if (typeof EQ_NORM === 'undefined') {
    window.EQ_NORM = {
        good: { min:48, max:58 },
        skill: { min:45, max:57 },
        happy: { min:40, max:55 },
        total: { min:140, max:170 },
        self_control: { min:13, max:17 },
        empathy: { min:16, max:20 },
        responsibility: { min:16, max:22 },
        motivation: { min:14, max:20 },
        problem_solving: { min:13, max:19 },
        relationship: { min:14, max:20 },
        self_esteem: { min:9, max:13 },
        life_satisfaction: { min:16, max:22 },
        peace_of_mind: { min:15, max:21 }
    };
}

/* ── INIT ─────────────────────────────────────────── */
window.addEventListener('load', async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }

    const { data: p } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!p || (p.role !== 'admin' && p.role !== 'super_admin')) {
        Swal.fire('ไม่มีสิทธิ์', '', 'warning').then(() => window.location.href = 'index.html');
        return;
    }
    currentUser = p;
    currentUserId = p.id;
    currentUserRole = p.role;
    document.getElementById('user-display').textContent = `${p.prefix || ''}${p.first_name} ${p.last_name}`;

    if (p.role === 'super_admin') document.getElementById('btn-settings').classList.remove('hidden');
    if (['admin', 'super_admin'].includes(p.role)) document.getElementById('btnToggleMode').classList.remove('hidden');

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

    isAdminMode = false;
    updateToggleModeUI();
    await loadClassrooms();
    await loadStats();
});

/* ── CLASSROOMS ─────────────────────────────────────── */
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
            onChange(value) {
                const div = document.getElementById('adviserDisplay');
                const nameEl = document.getElementById('adviserNames');
                if (value && adviserMap[value]) {
                    nameEl.textContent = adviserMap[value];
                    div.classList.remove('hidden');
                } else {
                    div.classList.add('hidden');
                }
                if (value) loadResults();
            }
        });
        document.getElementById('adminFilterSection').classList.remove('hidden');
        document.getElementById('teacherActionBar').classList.add('hidden');
    } else {
        document.getElementById('adminFilterSection').classList.add('hidden');
        document.getElementById('teacherActionBar').classList.remove('hidden');
        if (allClassrooms.length > 0) await loadResults(allClassrooms[0].id);
        else Swal.fire('แจ้งเตือน', 'ไม่พบห้องเรียนที่ปรึกษาในภาคเรียนนี้', 'info');
    }
}

/* ── STATS (ใช้เกณฑ์ใหม่) ───────────────────────────── */
async function loadStats() {
    const { data: eqs } = await db.from('eq_assessments')
        .select('level_total')
        .eq('academic_year', schoolInfo?.current_academic_year)
        .eq('semester', schoolInfo?.current_semester);

    const total = eqs?.length || 0;
    const high = eqs?.filter(e => e.level_total === 'สูงกว่าเกณฑ์').length || 0;
    const mid = eqs?.filter(e => e.level_total === 'เกณฑ์ปกติ').length || 0;
    const low = eqs?.filter(e => e.level_total === 'ต่ำกว่าเกณฑ์').length || 0;

    const { data: allStd } = await db.from('core_students').select('id');
    const stdTotal = allStd?.length || 0;
    const pct = stdTotal > 0 ? Math.round(total / stdTotal * 100) : 0;

    document.getElementById('stat-cards').innerHTML = [
        { icon: 'fa-users', label: 'นักเรียนทั้งหมด', val: stdTotal, color: 'slate' },
        { icon: 'fa-check-circle', label: 'ประเมินแล้ว', val: `${total} (${pct}%)`, color: 'indigo' },
        { icon: 'fa-arrow-up', label: 'สูงกว่าเกณฑ์', val: high, color: 'green' },
        { icon: 'fa-equals', label: 'เกณฑ์ปกติ', val: mid, color: 'blue' },
        { icon: 'fa-arrow-down', label: 'ต่ำกว่าเกณฑ์', val: low, color: 'rose' },
        { icon: 'fa-clock', label: 'ยังไม่ประเมิน', val: stdTotal - total, color: 'amber' },
    ].map(s => `
        <div class="glass rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div class="h-11 w-11 bg-${s.color}-100 text-${s.color}-600 rounded-xl flex items-center justify-center">
                <i class="fas ${s.icon}"></i>
            </div>
            <div><p class="text-slate-400 text-[10px] font-bold uppercase">${s.label}</p><h3 class="text-2xl font-bold text-slate-800">${s.val}</h3></div>
        </div>
    `).join('');
}

/* ── LOAD RESULTS (ดึงข้อมูล 9 ด้าน) ─────────────────── */
async function loadResults(forceClassroomId = null) {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const classroomId = forceClassroomId || (isAdminMode ? document.getElementById('sel-classroom')?.tomselect?.getValue() || document.getElementById('sel-classroom').value : null);
    let roomIds = [];
    if (classroomId) roomIds = [classroomId];
    else if (isAdminMode) { Swal.close(); return; }
    else roomIds = allClassrooms.map(r => r.id);

    let eqMap = {};
    if (roomIds.length > 0) {
        const { data: eqs } = await db.from('eq_assessments')
            .select('*')
            .eq('academic_year', schoolInfo?.current_academic_year)
            .eq('semester', schoolInfo?.current_semester)
            .in('classroom_id', roomIds);
        (eqs || []).forEach(e => { eqMap[e.student_id] = e; });
    }

    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
        .in('classroom_id', roomIds.length ? roomIds : ['none'])
        .order('student_number');

    Swal.close();
    allResults = (enrolls || []).map(e => ({ ...e, eq: eqMap[e.student_id] || null }));
    renderTable(allResults);
}

/* ── RENDER TABLE (แสดง ดี/เก่ง/สุข) ─────────────────── */
function renderTable(rows) {
    if (eqTable) { eqTable.destroy(); eqTable = null; }
    const tbody = document.getElementById('eq-tbody');
    if (!tbody) return;
    
    let html = '';
    for (const r of rows) {
        const cls = r.core_classrooms;
        const std = r.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const eq = r.eq;
        
        if (!eq) {
            // กรณีไม่เคยประเมิน
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
        
        // มีข้อมูลแล้ว
        const goodScore = (eq.score_self_control||0)+(eq.score_empathy||0)+(eq.score_responsibility||0);
        const skillScore = (eq.score_motivation||0)+(eq.score_problem_solving||0)+(eq.score_relationship||0);
        const happyScore = (eq.score_self_esteem||0)+(eq.score_life_satisfaction||0)+(eq.score_peace_of_mind||0);
        const totalScore = goodScore + skillScore + happyScore;
        
        const levelBadge = (level) => {
            if (!level) return '<span class="text-slate-300">-</span>';
            const cls = level === 'สูงกว่าเกณฑ์' ? 'bg-green-100 text-green-700' : level === 'เกณฑ์ปกติ' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';
            return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${level}</span>`;
        };
        
        const actions = `<div class="flex gap-1 justify-center">
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
            <td class="text-center">${levelBadge(eq.level_total)}</td>
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

/* ── EDIT (CRUD 9 ด้าน) ────────────────────────────── */
async function openEditForStudent(studentId) {
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

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

async function saveEdit() {
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
    Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false });
    closeEditModal();
    loadResults();
    loadStats();
}

async function deleteResult(studentId) {
    const r = await Swal.fire({ title: 'ลบผลการประเมิน?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบ' });
    if (!r.isConfirmed) return;
    await db.from('eq_assessments').delete()
        .eq('student_id', studentId)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);
    Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1400, showConfirmButton: false });
    loadResults(); loadStats();
}

/* ── EXPORT EXCEL (9 ด้าน) ─────────────────────────── */
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
    ws['!cols'] = [{wch:12},{wch:8},{wch:25},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EQ_9dim');
    XLSX.writeFile(wb, `EQ_Admin_${new Date().toLocaleDateString('th-TH').replace(/\//g,'-')}.xlsx`);
}

/* ── PRINT PDF (รายบุคคล พร้อมกราฟ, รายละเอียดครบ, และรูปนักเรียน) ────────── */
async function printStudentPdf(studentId) {
    Swal.fire({ title: 'กำลังเตรียมเอกสาร PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        // ดึงข้อมูลการประเมิน พร้อมรูปนักเรียนและข้อมูลห้อง
        const { data: assessment, error } = await db.from('eq_assessments')
            .select('*, core_students!student_id(prefix, first_name, last_name, avatar_students_url), core_classrooms!classroom_id(grade_level, room_number)')
            .eq('student_id', studentId)
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester)
            .single();
        if (error || !assessment) throw new Error('ไม่พบข้อมูลการประเมิน');

        // ดึงข้อมูลครูที่ปรึกษา
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

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนเทพศาลาประชาสรรค์';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;
        const fullName = `${assessment.core_students.prefix || ''}${assessment.core_students.first_name} ${assessment.core_students.last_name}`;
        const avatarUrl = assessment.core_students.avatar_students_url || null;

        Swal.close();
        generateStudentPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function generateStudentPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
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

    // สร้าง HTML รูป หรือ placeholder
    const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:60px; height:60px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:24px; color:#94a3b8;"><i class="fas fa-user"></i></div>`;

    const html = `<!DOCTYPE html>
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
        .student-card { background: #f8fafc; border-radius: 8px; padding: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; }
        .student-details { flex: 1; }
        .student-avatar { flex-shrink: 0; }
        .total-card { text-align: center; background: #fef9e3; border-radius: 12px; padding: 12px; margin-bottom: 20px; }
        .total-score { font-size: 28px; font-weight: 900; margin: 0; }
        .total-level { font-size: 14px; font-weight: bold; margin-top: 5px; }
        .chart-title { font-size: 16px; font-weight: bold; margin: 15px 0 10px; }
        .bar-item { margin-bottom: 10px; }
        .bar-label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
        .bar-bg { background: #e2e8f0; border-radius: 20px; height: 10px; width: 100%; }
        .bar-fill { height: 10px; border-radius: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #312e81; color: white; }
        .sub-item { margin-bottom: 5px; }
        .footer { font-size: 9px; text-align: center; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        body { margin: 0; padding: 0; }
        .footer { margin-top: 15px; padding-top: 6px; font-size: 8px; page-break-inside: avoid; }
        table { page-break-inside: avoid; }
    </style>
    </head>
    <body>
    <div class="header">
        <div class="logo-area"><img class="logo" src="${logoUrl}" crossorigin="anonymous"><div><div class="school-title">${schoolName}</div><div class="school-sub">รายงานผลการประเมินความฉลาดทางอารมณ์ (EQ)</div></div></div>
        <div class="info-area"><div><b>ภาคเรียนที่ ${semester}</b> ปีการศึกษา ${academicYear}</div><div>ครูที่ปรึกษา: ${adviser1} ${adviser2 !== '-' ? ' / ' + adviser2 : ''}</div></div>
    </div>
    <div class="student-card">
        <div class="student-avatar">${avatarHtml}</div>
        <div class="student-details"><b>ชื่อ-สกุล:</b> ${fullName}<br><span style="font-size:12px;color:#64748b">วันที่ประเมิน: ${new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH')}</span></div>
    </div>
    <div class="total-card"><div class="total-score" style="color:${assessment.level_total === 'สูงกว่าเกณฑ์' ? '#15803d' : (assessment.level_total === 'เกณฑ์ปกติ' ? '#1d4ed8' : '#b91c1c')}">${assessment.score_total} <span style="font-size:14px;font-weight:normal;">/ 208 คะแนน</span></div><div class="total-level">ระดับรวม: ${assessment.level_total}</div></div>
    <div class="chart-title">📊 กราฟแสดงคะแนนรายด้านย่อย</div>
    ${subDims.map(d => {
        const percent = (d.score / d.max) * 100;
        const barColor = d.level === 'สูงกว่าเกณฑ์' ? '#10b981' : (d.level === 'เกณฑ์ปกติ' ? '#3b82f6' : '#ef4444');
        return `<div class="bar-item"><div class="bar-label"><span><b>${d.label}</b> (${d.score}/${d.max})</span><span>${Math.round(percent)}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${percent}%; background:${barColor};"></div></div></div>`;
    }).join('')}
    
    <table>
        <thead><tr><th>ด้าน</th><th>คะแนนรวม</th><th>ระดับ</th><th>รายละเอียดด้านย่อย (คะแนน)</th></tr></thead>
        <tbody>
            ${['ดี', 'เก่ง', 'สุข'].map(groupName => {
                const items = subDims.filter(d => d.group === groupName);
                const groupScore = items.reduce((s, i) => s + i.score, 0);
                const groupMax = items.reduce((s, i) => s + i.max, 0);
                const groupLevel = (groupName === 'ดี' ? assessment.level_good : (groupName === 'เก่ง' ? assessment.level_skill : assessment.level_happy));
                const details = items.map(it => `<div class="sub-item"><strong>${it.label}</strong> ${it.score}/${it.max} (${it.level})</div>`).join('');
                return `<tr><td style="font-weight:bold">ด้าน${groupName}</td><td style="text-align:center">${groupScore}/${groupMax}</td><td style="text-align:center">${groupLevel}</td><td>${details}</td></tr>`;
            }).join('')}
        </tbody>
    </table>
    <div class="footer">ระบบ WRK School Management System | EQ แบบประเมินกรมสุขภาพจิต (อายุ 12-17 ปี)</div>
    </body></html>`;

    const element = document.createElement('div');
    element.innerHTML = html;

    // รอให้โลโก้และรูปโหลดเสร็จ
    const images = element.querySelectorAll('img');
    if (images.length === 0) {
        generateStudentPdfNow(element, fullName);
    } else {
        let loaded = 0;
        images.forEach(img => {
            if (img.complete) {
                loaded++;
                if (loaded === images.length) generateStudentPdfNow(element, fullName);
            } else {
                img.addEventListener('load', () => {
                    loaded++;
                    if (loaded === images.length) generateStudentPdfNow(element, fullName);
                });
                img.addEventListener('error', () => {
                    loaded++;
                    if (loaded === images.length) generateStudentPdfNow(element, fullName);
                });
            }
        });
    }
}

function generateStudentPdfNow(element, fullName) {
    html2pdf().set({
        margin: [0.5, 0.5, 1.2, 0.5],
        filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}

/* ── IMPORT (9 ด้าน) ───────────────────────────────── */
function openImportModal() { document.getElementById('import-modal').classList.remove('hidden'); }
function closeImportModal() { document.getElementById('import-modal').classList.add('hidden'); }
function setImportMode(mode) {
    importMode = mode;
    document.getElementById('import-excel-section').classList.toggle('hidden', mode !== 'excel');
    document.getElementById('import-sheets-section').classList.toggle('hidden', mode !== 'sheets');
    document.getElementById('tab-excel').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode==='excel'?'bg-amber-500 text-white':'bg-slate-100'}`;
    document.getElementById('tab-sheets').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode==='sheets'?'bg-amber-500 text-white':'bg-slate-100'}`;
}
async function handleFileImport(input) {
    const file = input.files[0]; if (!file) return;
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
                'ควบคุมตนเอง': parseInt(cols[1]), 'เห็นใจผู้อื่น': parseInt(cols[2]), 'รับผิดชอบ': parseInt(cols[3]),
                'มีแรงจูงใจ': parseInt(cols[4]), 'ตัดสินใจแก้ปัญหา': parseInt(cols[5]), 'สัมพันธภาพ': parseInt(cols[6]),
                'ภูมิใจตนเอง': parseInt(cols[7]), 'พอใจชีวิต': parseInt(cols[8]), 'สุขสงบทางใจ': parseInt(cols[9])
            };
        });
        Swal.close();
        await processImportRows(rows);
    } catch (err) { Swal.close(); Swal.fire('ผิดพลาด', err.message, 'error'); }
}
async function processImportRows(rows) {
    const dataRows = rows.filter(r => r['รหัสนักเรียน']);
    if (!dataRows.length) return Swal.fire('ไม่พบข้อมูล', '', 'warning');
    Swal.fire({ title: `พบ ${dataRows.length} รายการ`, text: 'กำลังนำเข้า...', didOpen: () => Swal.showLoading() });
    const { data: stds } = await db.from('core_students').select('id, student_id_card, classroom_id');
    const stdMap = Object.fromEntries((stds || []).map(s => [String(s.student_id_card).trim(), s]));

    const getLevel = (score, norm) => score < norm.min ? 'ต่ำกว่าเกณฑ์' : (score <= norm.max ? 'เกณฑ์ปกติ' : 'สูงกว่าเกณฑ์');
    let success = 0, fail = 0;
    for (const row of dataRows) {
        const std = stdMap[String(row['รหัสนักเรียน']).trim()];
        if (!std) { fail++; continue; }
        const scores = {
            self_control: row['ควบคุมตนเอง'] || 0, empathy: row['เห็นใจผู้อื่น'] || 0, responsibility: row['รับผิดชอบ'] || 0,
            motivation: row['มีแรงจูงใจ'] || 0, problem_solving: row['ตัดสินใจแก้ปัญหา'] || 0, relationship: row['สัมพันธภาพ'] || 0,
            self_esteem: row['ภูมิใจตนเอง'] || 0, life_satisfaction: row['พอใจชีวิต'] || 0, peace_of_mind: row['สุขสงบทางใจ'] || 0
        };
        const goodScore = scores.self_control + scores.empathy + scores.responsibility;
        const skillScore = scores.motivation + scores.problem_solving + scores.relationship;
        const happyScore = scores.self_esteem + scores.life_satisfaction + scores.peace_of_mind;
        const total = goodScore + skillScore + happyScore;
        const payload = {
            student_id: std.id, classroom_id: std.classroom_id,
            academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester,
            answers: {}, recorder_id: currentUser.id,
            ...scores, score_good: goodScore, score_skill: skillScore, score_happy: happyScore, score_total: total,
            level_good: getLevel(goodScore, EQ_NORM.good), level_skill: getLevel(skillScore, EQ_NORM.skill),
            level_happy: getLevel(happyScore, EQ_NORM.happy), level_total: getLevel(total, EQ_NORM.total),
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
        if (error) fail++; else success++;
    }
    Swal.close(); closeImportModal();
    Swal.fire({ icon: success>0?'success':'error', title: 'นำเข้าเสร็จ', html: `สำเร็จ ${success} รายการ<br>ล้มเหลว ${fail} รายการ` });
    loadResults(); loadStats();
}

/* ── TOGGLE MODE ───────────────────────────────────── */
function updateToggleModeUI() {
    const btn = document.getElementById('btnToggleMode');
    if (btn) btn.innerHTML = isAdminMode ? '<i class="fa-solid fa-toggle-on text-emerald-500"></i> โหมด: ผู้ดูแลระบบ' : '<i class="fa-solid fa-toggle-off"></i> โหมด: ครูที่ปรึกษา';
}
async function toggleMode() {
    isAdminMode = !isAdminMode;
    updateToggleModeUI();
    if (eqTable) { eqTable.destroy(); eqTable = null; }
    document.getElementById('eq-tbody').innerHTML = '';
    await loadClassrooms();
    await loadStats();
}

/* ── SETTINGS & USER MGMT ─────────────────────────── */
let allPersonnel = [];

function openSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if (currentUserRole === 'super_admin') {
        const userMgmtSection = document.getElementById('user-management-section');
        userMgmtSection.classList.remove('hidden');
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
        Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1400, showConfirmButton: false });
        closeSettings();
    }
}

async function loadPersonnelForSettings() {
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
        const canEdit = currentUserRole === 'super_admin' && user.role !== 'super_admin';
        const roleDisplay = user.role === 'super_admin' ? 'Super Admin' : (user.role === 'admin' ? 'Admin' : 'ครู');
        const roleClass = user.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 
                          (user.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600');
        return `<td>
            <td class="px-2 py-1">${user.prefix || ''}${user.first_name} ${user.last_name}</td>
            <td class="px-2 py-1">${user.email || '-'}</td>
            <td class="px-2 py-1"><span class="px-2 py-0.5 rounded-full text-xs ${roleClass}">${roleDisplay}</span></td>
            <td class="px-2 py-1">
                ${canEdit ? `<select id="role-select-${user.id}" class="border rounded px-1 text-xs">
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>ครู</option>
                </select>` : '-'}
            </td>
            <td class="px-2 py-1">
                ${canEdit ? `<button onclick="updateUserRoleFromSettings('${user.id}')" class="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs">บันทึก</button>` : ''}
            </td>
        </tr>`;
    }).join('');
    
    const searchInput = document.getElementById('user-search-settings');
    if (searchInput && !searchInput._listener) {
        searchInput.addEventListener('input', filterUsersForSettings);
        searchInput._listener = true;
    }
}

async function updateUserRoleFromSettings(userId) {
    const select = document.getElementById(`role-select-${userId}`);
    if (!select) return;
    const newRole = select.value;
    const { error } = await db.from('core_personnel').update({ role: newRole }).eq('id', userId);
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({ icon: 'success', title: 'อัปเดตบทบาทแล้ว', timer: 1200, showConfirmButton: false });
        await loadPersonnelForSettings();
    }
}

async function refreshUserList() {
    if (currentUserRole !== 'super_admin') return;
    await loadPersonnelForSettings();
}

/* ── LOGOUT ───────────────────────────────────────── */
async function handleLogout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก' });
    if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'index.html'; }
}
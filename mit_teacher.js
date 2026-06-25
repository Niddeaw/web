/**
 * mit_teacher.js — ส่วนที่ 1 (ตัวแปร, init, loadClassrooms, loadStats)
 */
let currentUser = null;
let schoolInfo = null;
let miTable = null;
let allResults = [];
let allClassrooms = [];
let importMode = 'excel';
let currentUserRole = 'admin';
let isAdminMode = true;
let currentUserId = null;
let adviserMap = {};

if (typeof MI_NORM === 'undefined') {
    window.MI_NORM = {
        linguistic: { min: 10, max: 18 },
        logical_mathematical: { min: 10, max: 18 },
        visual_spatial: { min: 10, max: 18 },
        bodily_kinesthetic: { min: 10, max: 18 },
        musical: { min: 10, max: 18 },
        interpersonal: { min: 10, max: 18 },
        intrapersonal: { min: 10, max: 18 },
        naturalist: { min: 10, max: 18 },
        total: { min: 80, max: 144 }
    };
}

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
    // if (['admin', 'super_admin'].includes(p.role)) document.getElementById('btnToggleMode').classList.remove('hidden');
    if (p.role === 'admin' || p.role === 'super_admin') {
        document.getElementById('btnToggleMode').classList.remove('hidden');
    }

    const { data: si } = await db.from('core_school_info').select('*').single();
    schoolInfo = si;

    if (si) {
        const { data: s } = await db.from('mi_settings')
            .select('*').eq('academic_year', String(si.current_academic_year)).eq('semester', String(si.current_semester)).maybeSingle();
        if (s) {
            document.getElementById('set-delay').value = s.delay_seconds;
            document.getElementById('set-active').checked = s.is_active;
        }
    }

    // แทนที่บรรทัด isAdminMode = false; ด้วย:
    // isAdminMode = (p.role === 'admin' || p.role === 'super_admin');
    isAdminMode = false;
    updateToggleModeUI();
    await loadClassrooms();
    await loadStats();
});

async function loadClassrooms() {
    let q = db.from('core_classrooms')
        .select('id, grade_level, room_number, core_personnel_1:core_personnel!adviser_id_1(prefix, first_name, last_name), core_personnel_2:core_personnel!adviser_id_2(prefix, first_name, last_name)')
        .eq('academic_year', String(schoolInfo?.current_academic_year))
        .eq('semester', String(schoolInfo?.current_semester))
        .order('grade_level').order('room_number');

    // ถ้าเป็นโหมดครูให้กรองเฉพาะห้องที่ปรึกษา
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
        // ---- โหมดผู้ดูแลระบบ ----
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

        // ✅ โหลดข้อมูลและสถิติทันที (ไม่ต้องรอเลือกห้อง)
        await loadResults();

    } else {
        // ---- โหมดครูที่ปรึกษา ----
        document.getElementById('adminFilterSection').classList.add('hidden');
        document.getElementById('teacherActionBar').classList.remove('hidden');

        if (allClassrooms.length > 0) {
            // ✅ ถ้ามีห้องที่ปรึกษา ให้โหลดห้องแรก และอัปเดตสถิติ
            await loadResults(allClassrooms[0].id);
        } else {
            // ✅ ถ้าไม่มีห้องที่ปรึกษา ให้แจ้งเตือน และรีเซ็ตสถิติเป็น 0
            Swal.fire('แจ้งเตือน', 'ไม่พบห้องเรียนที่ปรึกษาในภาคเรียนนี้', 'info');

        }
    }
}

async function loadStats() {
    const academicYear = String(schoolInfo?.current_academic_year);
    const semester = String(schoolInfo?.current_semester);

    console.log('🔍 loadStats called | isAdminMode:', isAdminMode);
    console.log('🔍 allClassrooms:', allClassrooms);

    // 1. ดึงข้อมูล assessment ทั้งหมด
    const { data: mis, error: misErr } = await db.from('mi_assessments')
        .select('student_id, classroom_id, score_linguistic, score_logical_mathematical, score_visual_spatial, score_bodily_kinesthetic, score_musical, score_interpersonal, score_intrapersonal, score_naturalist')
        .eq('academic_year', academicYear)
        .eq('semester', semester);

    if (misErr) console.error('loadStats error:', misErr);
    console.log('📊 mis count (all):', mis?.length);
    console.log('📊 mis sample (first 3):', mis?.slice(0,3));

    // 2. หารายชื่อนักเรียนที่อยู่ในห้องที่ครูเห็น
    let visibleStudentIds = [];
    if (!isAdminMode) {
        const roomIds = allClassrooms.map(r => r.id);
        console.log('🏫 Teacher mode | roomIds:', roomIds);

        if (roomIds.length === 0) {
            console.warn('⚠️ No classrooms found for teacher');
            const emptyDimStats = MI_DIMENSIONS.map(d => ({
                key: d.key,
                label: d.label,
                count: 0,
                icon: getDimIcon(d.key)
            }));
            renderStatsCards(0, 0, 0, emptyDimStats);
            return;
        }

        const { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
            .select('student_id')
            .in('classroom_id', roomIds);
        if (enrollErr) console.error('enrollErr:', enrollErr);
        visibleStudentIds = (enrolls || []).map(e => e.student_id);
        console.log('👨‍🎓 visibleStudentIds from enrolls:', visibleStudentIds);
        console.log('👨‍🎓 visibleStudentIds count:', visibleStudentIds.length);
    } else {
        const { data: allStd } = await db.from('core_students').select('id');
        visibleStudentIds = (allStd || []).map(s => s.id);
        console.log('👨‍🎓 Admin mode | total students:', visibleStudentIds.length);
    }

    const totalStudents = visibleStudentIds.length;

    // 3. กรองเฉพาะ assessment ที่อยู่ในกลุ่มที่เห็น
    const filteredAssessments = (mis || []).filter(m => visibleStudentIds.includes(m.student_id));
    console.log('✅ filteredAssessments count:', filteredAssessments.length);
    console.log('✅ filteredAssessments sample:', filteredAssessments.slice(0,3));

    const assessedCount = filteredAssessments.length;
    const notAssessedCount = totalStudents - assessedCount;
    console.log(`📊 assessedCount: ${assessedCount}, notAssessedCount: ${notAssessedCount}`);

    // 4. นับ topCount
    const dimKeys = MI_DIMENSIONS.map(d => d.key);
    const topCount = {};
    dimKeys.forEach(key => { topCount[key] = 0; });

    filteredAssessments.forEach(m => {
        let maxScore = -1;
        let topKey = null;
        dimKeys.forEach(key => {
            const s = m[`score_${key}`] || 0;
            if (s > maxScore) { maxScore = s; topKey = key; }
        });
        if (topKey) {
            topCount[topKey]++;
            console.log(`   🔝 student ${m.student_id} topKey: ${topKey} (${maxScore})`);
        } else {
            console.warn(`   ⚠️ student ${m.student_id} has no score > 0?`, m);
        }
    });

    console.log('🏆 topCount:', topCount);

    const dimStats = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        count: topCount[d.key] || 0,
        icon: getDimIcon(d.key)
    }));

    console.log('📦 dimStats:', dimStats);

    renderStatsCards(totalStudents, assessedCount, notAssessedCount, dimStats);
    console.log('✅ renderStatsCards called');
}

function getDimIcon(key) {
    const map = {
        linguistic: 'fa-language',
        logical_mathematical: 'fa-calculator',
        visual_spatial: 'fa-cubes',
        bodily_kinesthetic: 'fa-running',
        musical: 'fa-music',
        interpersonal: 'fa-users',
        intrapersonal: 'fa-user-astronaut',
        naturalist: 'fa-leaf'
    };
    return map[key] || 'fa-brain';
}

// ฟังก์ชัน render การ์ด
function renderStatsCards(total, assessed, notAssessed, dimStats) {
    const container = document.getElementById('stat-cards');
    if (!container) return;

    // ---- แถวที่ 1: การ์ดหลัก 3 ใบ (นักเรียนทั้งหมด, สำรวจแล้ว, ยังไม่สำรวจ) ----
    const mainCards = [
        { label: 'นักเรียนทั้งหมด', value: total, icon: 'fa-users', color: 'blue' },
        { label: 'สำรวจแล้ว', value: assessed, icon: 'fa-check-circle', color: 'green' },
        { label: 'ยังไม่สำรวจ', value: notAssessed, icon: 'fa-clock', color: 'amber' }
    ];

    let html = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">`;
    mainCards.forEach(card => {
        html += `
            <div class="glass rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div class="absolute -right-4 -bottom-4 text-7xl opacity-10 text-${card.color}-500">
                    <i class="fas ${card.icon}"></i>
                </div>
                <div class="relative z-10">
                    <p class="text-slate-400 text-sm font-bold uppercase tracking-wider">${card.label}</p>
                    <p class="text-4xl font-black text-slate-800 mt-1">${card.value}</p>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    // ---- แถวที่ 2: การ์ด 8 ด้าน (responsive: 2 คอลัมน์มือถือ, 4 คอลัมน์เดสก์ท็อป) ----
    html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">`;
    const colors = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'emerald'];
    dimStats.forEach((d, idx) => {
        const color = colors[idx % colors.length];
        html += `
            <div class="glass rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div class="h-10 w-10 bg-${color}-100 text-${color}-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas ${d.icon} text-lg"></i>
                </div>
                <div>
                    <p class="text-xs text-slate-400 font-bold uppercase leading-tight">${d.label}</p>
                    <p class="text-xl font-bold text-slate-800">${d.count}</p>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    container.innerHTML = html;
}

/**
 * mit_teacher.js — ส่วนที่ 2 (loadResults, renderTable, view/edit/delete, export)
 */

async function loadResults(forceClassroomId = null) {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const classroomId = forceClassroomId || (isAdminMode ? document.getElementById('sel-classroom')?.tomselect?.getValue() || document.getElementById('sel-classroom').value : null);
    let roomIds = [];
    if (classroomId) roomIds = [classroomId];
    else if (isAdminMode) { Swal.close(); return; }
    else roomIds = allClassrooms.map(r => r.id);

    let miMap = {};
    if (roomIds.length > 0) {
        const { data: mis, error: misErr } = await db.from('mi_assessments')
            .select('*')
            .eq('academic_year', String(schoolInfo?.current_academic_year))
            .eq('semester', String(schoolInfo?.current_semester))
            .in('classroom_id', roomIds);
        if (misErr) console.error('loadResults error:', misErr);
        (mis || []).forEach(e => { miMap[e.student_id] = e; });
    }

    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
        .in('classroom_id', roomIds.length ? roomIds : ['none'])
        .order('student_number');

    Swal.close();
    allResults = (enrolls || []).map(e => ({ ...e, mi: miMap[e.student_id] || null }));
    renderTable(allResults);
}

function renderTable(rows) {
    console.log('🔍 renderTable called with rows:', rows);
    console.log('🔍 rows length:', rows.length);

    if (miTable) { miTable.destroy(); miTable = null; }
    const tbody = document.getElementById('mi-tbody');
    if (!tbody) {
        console.error('❌ tbody not found');
        return;
    }

    // Helper กำหนดสไตล์ badge ตามระดับ
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
        const mi = r.mi;

        console.log(`👤 ${fullName} | mi:`, mi); // ดูว่ามี assessment หรือไม่

        // กรณีไม่มีข้อมูลการประเมิน
        if (!mi) {
            html += `<tr>
                <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
                <td class="text-center">${r.student_number}</td>
                <td class="font-semibold text-slate-700">${fullName}</td>
                ${MI_DIMENSIONS.map(() => '<td class="text-center">-</td>').join('')}
                <td class="text-center">-</td>
                <td class="text-center text-slate-400">ยังไม่ประเมิน</td>
                <td class="text-center"><button onclick='openEditForStudent("${r.student_id}")' class="bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded text-xs">ประเมิน</button></td>
            </tr>`;
            continue;
        }

        // มีข้อมูลการประเมิน
        const dimKeys = MI_DIMENSIONS.map(d => d.key);
        const dimScores = dimKeys.map(key => mi[`score_${key}`] || 0);
        const totalScore = dimScores.reduce((a, b) => a + b, 0);

        console.log(`✅ ${fullName} มี assessment, totalScore = ${totalScore}`);

        // ปุ่มจัดการ
        const actions = `<div class="flex gap-1 justify-center">
            <button onclick='openViewResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100" title="ดูผล"><i class="fas fa-eye text-xs"></i></button>
            <button onclick='openEditForStudent("${r.student_id}")' class="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>
            <button onclick='printStudentPdf("${r.student_id}")' class="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="PDF"><i class="fas fa-print text-xs"></i></button>
            <button onclick='deleteResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="ลบ"><i class="fas fa-trash text-xs"></i></button>
        </div>`;

        html += `<tr>
            <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
            <td class="text-center font-bold text-slate-400">${r.student_number}</td>
            <td class="font-semibold text-slate-700">${fullName}</td>
            ${dimScores.map(s => `<td class="text-center">${s}/25</td>`).join('')}
            <td class="text-center font-bold">${totalScore} / 200</td>
            <td class="text-center">${getLevelBadge(mi.level_total)}</td>
            <td class="text-center">${actions}</td>
        </tr>`;
    }

    console.log('📄 HTML generated, length:', html.length);
    tbody.innerHTML = html;

    // รีสร้าง DataTable
    try {
        miTable = new DataTable('#mi-table', {
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            responsive: true,
            scrollX: true,
            pageLength: 50,
            columnDefs: [
                { responsivePriority: 1, targets: -1 },
                { orderable: false, targets: [12] }
            ]
        });
        console.log('✅ DataTable initialized successfully');
    } catch (err) {
        console.error('❌ DataTable initialization error:', err);
    }
}

function closeViewModal() {
    document.getElementById('view-result-modal').classList.add('hidden');
    document.getElementById('view-result-modal').classList.remove('flex');
}

async function openViewResult(studentId) {
    const row = allResults.find(r => r.student_id === studentId);
    if (!row) return;
    const std = row.core_students;
    const cls = row.core_classrooms;
    const mi = row.mi;
    const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    const room = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';

    document.getElementById('vr-name').textContent = fullName;
    document.getElementById('vr-room').textContent = room;

    if (!mi) {
        document.getElementById('vr-body').innerHTML = '<p class="text-center text-slate-400 py-8">ยังไม่มีข้อมูลการประเมิน</p>';
        document.getElementById('view-result-modal').classList.remove('hidden');
        document.getElementById('view-result-modal').classList.add('flex');
        return;
    }

    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: mi[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: mi[`level_${d.key}`] || ''
    }));

    const totalScore = mi.score_total || 0;
    const totalLvl = mi.level_total || '';

    // Helper กำหนดสไตล์ตามระดับ (ใช้ฟังก์ชันเดียวกันกับ renderTable)
    const getLevelStyle = (level) => {
        if (!level) return { badge: 'bg-slate-100 text-slate-600', bar: '#94a3b8', bg: 'bg-slate-500' };
        if (['โดดเด่น', 'สูง', 'สูงกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-green-100 text-green-700', bar: '#10b981', bg: 'bg-green-500' };
        } else if (['ปานกลาง', 'เกณฑ์ปกติ'].includes(level)) {
            return { badge: 'bg-blue-100 text-blue-700', bar: '#3b82f6', bg: 'bg-blue-500' };
        } else if (['ควรพัฒนา', 'ต่ำ', 'ต่ำกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-amber-100 text-amber-700', bar: '#f59e0b', bg: 'bg-amber-500' };
        } else {
            return { badge: 'bg-slate-100 text-slate-600', bar: '#94a3b8', bg: 'bg-slate-500' };
        }
    };

    const totalStyle = getLevelStyle(totalLvl);

    const badge = (level) => {
        const style = getLevelStyle(level);
        return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}">${level}</span>`;
    };
    const bar = (score, max, level) => {
        const pct = Math.round((score / max) * 100);
        const style = getLevelStyle(level);
        return `<div class="w-full bg-slate-100 rounded-full h-2 mt-1"><div class="h-2 rounded-full" style="width:${pct}%; background:${style.bar};"></div></div>`;
    };

    const dimsHtml = dims.map(d => `
        <div class="flex justify-between items-center border-b border-slate-100 py-2">
            <span class="text-sm">${d.label}</span>
            <div class="flex items-center gap-2">
                <span class="font-bold text-sm">${d.score}/${d.max}</span>
                ${badge(d.level)}
            </div>
            ${bar(d.score, d.max, d.level)}
        </div>
    `).join('');

    document.getElementById('vr-body').innerHTML = `
        <div class="flex justify-center mb-5">
            <div class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl ${totalStyle.bg} text-white">
                <i class="fas fa-star"></i>
                <span class="font-black text-2xl">${totalScore}</span>
                <span class="text-sm opacity-80">/ 200 คะแนน</span>
                <span class="font-bold">&nbsp;·&nbsp;${totalLvl}</span>
            </div>
        </div>
        <div class="space-y-1">${dimsHtml}</div>
        ${mi.note ? `<div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800"><i class="fas fa-note-sticky mr-1"></i><strong>หมายเหตุ:</strong> ${mi.note}</div>` : ''}
    `;
    document.getElementById('view-result-modal').classList.remove('hidden');
    document.getElementById('view-result-modal').classList.add('flex');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

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
        row = { ...enroll, mi: null, core_students: enroll.core_students };
    }
    const std = row.core_students;
    const mi = row.mi || {};
    document.getElementById('edit-student-id').value = studentId;
    document.getElementById('edit-student-name').textContent = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    document.getElementById('edit-linguistic').value = mi.score_linguistic || 0;
    document.getElementById('edit-logical-mathematical').value = mi.score_logical_mathematical || 0;
    document.getElementById('edit-visual-spatial').value = mi.score_visual_spatial || 0;
    document.getElementById('edit-bodily-kinesthetic').value = mi.score_bodily_kinesthetic || 0;
    document.getElementById('edit-musical').value = mi.score_musical || 0;
    document.getElementById('edit-interpersonal').value = mi.score_interpersonal || 0;
    document.getElementById('edit-intrapersonal').value = mi.score_intrapersonal || 0;
    document.getElementById('edit-naturalist').value = mi.score_naturalist || 0;
    document.getElementById('edit-note').value = mi.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-modal').classList.add('flex');
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
        linguistic: parseInt(document.getElementById('edit-linguistic').value) || 0,
        logical_mathematical: parseInt(document.getElementById('edit-logical-mathematical').value) || 0,
        visual_spatial: parseInt(document.getElementById('edit-visual-spatial').value) || 0,
        bodily_kinesthetic: parseInt(document.getElementById('edit-bodily-kinesthetic').value) || 0,
        musical: parseInt(document.getElementById('edit-musical').value) || 0,
        interpersonal: parseInt(document.getElementById('edit-interpersonal').value) || 0,
        intrapersonal: parseInt(document.getElementById('edit-intrapersonal').value) || 0,
        naturalist: parseInt(document.getElementById('edit-naturalist').value) || 0
    };
    const note = document.getElementById('edit-note').value;
    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    const getLevel = (score, norm) => {
        if (score < norm.min) return 'ควรพัฒนา';   // หรือ 'ต่ำ'
        if (score <= norm.max) return 'ปานกลาง';
        return 'โดดเด่น';                           // หรือ 'สูง'
    };

    const payload = {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        answers: {},
        // BUG FIX #3+4: ต้องใส่ prefix score_ ให้ตรงกับ column ใน DB
        // ห้ามใช้ ...scores โดยตรง เพราะ key จะเป็น linguistic, logical_mathematical ฯลฯ
        // แต่ column DB ชื่อ score_linguistic, score_logical_mathematical ฯลฯ
        score_linguistic: scores.linguistic,
        score_logical_mathematical: scores.logical_mathematical,
        score_visual_spatial: scores.visual_spatial,
        score_bodily_kinesthetic: scores.bodily_kinesthetic,
        score_musical: scores.musical,
        score_interpersonal: scores.interpersonal,
        score_intrapersonal: scores.intrapersonal,
        score_naturalist: scores.naturalist,
        score_total: total,
        level_linguistic: getLevel(scores.linguistic, MI_NORM.linguistic),
        level_logical_mathematical: getLevel(scores.logical_mathematical, MI_NORM.logical_mathematical),
        level_visual_spatial: getLevel(scores.visual_spatial, MI_NORM.visual_spatial),
        level_bodily_kinesthetic: getLevel(scores.bodily_kinesthetic, MI_NORM.bodily_kinesthetic),
        level_musical: getLevel(scores.musical, MI_NORM.musical),
        level_interpersonal: getLevel(scores.interpersonal, MI_NORM.interpersonal),
        level_intrapersonal: getLevel(scores.intrapersonal, MI_NORM.intrapersonal),
        level_naturalist: getLevel(scores.naturalist, MI_NORM.naturalist),
        level_total: getLevel(total, MI_NORM.total),
        note: note,
        recorder_id: currentUser.id,
        completed_at: new Date().toISOString()
    };

    const { error } = await db.from('mi_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
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
    await db.from('mi_assessments').delete()
        .eq('student_id', studentId)
        .eq('academic_year', String(schoolInfo.current_academic_year))
        .eq('semester', String(schoolInfo.current_semester));
    Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1400, showConfirmButton: false });
    loadResults(); loadStats();
}

function exportExcel() {
    if (!allResults.length) return Swal.fire('ไม่มีข้อมูล', '', 'info');
    const rows = allResults.map(r => {
        const std = r.core_students;
        const cls = r.core_classrooms;
        const mi = r.mi;
        if (!mi) return null;
        const dimKeys = MI_DIMENSIONS.map(d => d.key);
        const row = {
            'ห้องเรียน': cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
            'เลขที่': r.student_number,
            'ชื่อ-สกุล': `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`
        };
        dimKeys.forEach(key => {
            const dim = MI_DIMENSIONS.find(d => d.key === key);
            row[dim.label] = mi[`score_${key}`] || 0;
        });
        row['รวม (200)'] = mi.score_total;
        row['ระดับรวม'] = mi.level_total;
        return row;
    }).filter(r => r);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 25 }, ...MI_DIMENSIONS.map(() => ({ wch: 12 })), { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MI_8dim');
    XLSX.writeFile(wb, `MI_Admin_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.xlsx`);
}

/**
 * mit_teacher.js — ส่วนที่ 3 (PDF, import, toggle, settings, logout)
 */
async function printStudentPdf(studentId) {
    Swal.fire({ title: 'กำลังเตรียมเอกสาร PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (!studentId) throw new Error('ไม่พบรหัสนักเรียน');

        // 1. ดึงข้อมูลการประเมิน
        const { data: assessment, error: assessErr } = await db.from('mi_assessments')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', String(schoolInfo.current_academic_year))
            .eq('semester', String(schoolInfo.current_semester))
            .single();

        if (assessErr || !assessment) {
            console.error('❌ Assessment not found:', assessErr);
            throw new Error('ไม่พบข้อมูลการประเมิน');
        }

        // 2. ดึงข้อมูลนักเรียนแยก
        const { data: student, error: stdErr } = await db.from('core_students')
            .select('prefix, first_name, last_name, avatar_students_url')
            .eq('id', studentId)
            .single();

        if (stdErr) {
            console.warn('⚠️ Student data not found:', stdErr);
            // ใช้ค่า default ถ้าไม่มีข้อมูล
            assessment.core_students = {
                prefix: '',
                first_name: 'ไม่พบชื่อ',
                last_name: '',
                avatar_students_url: null
            };
        } else {
            assessment.core_students = student;
        }

        // 3. ดึงข้อมูลห้องเรียน (ถ้ามี)
        if (assessment.classroom_id) {
            const { data: cls, error: clsErr } = await db.from('core_classrooms')
                .select('grade_level, room_number')
                .eq('id', assessment.classroom_id)
                .single();

            if (!clsErr && cls) {
                assessment.core_classrooms = cls;
            } else {
                assessment.core_classrooms = null;
            }
        } else {
            assessment.core_classrooms = null;
        }

        // 4. ดึงข้อมูลครูที่ปรึกษา (ใช้ syntax แบบเดิม หรือแยก query ก็ได้)
        let adviser1 = '-', adviser2 = '-';
        if (assessment.classroom_id) {
            // ลองใช้แบบ embed ถ้าไม่ได้ให้แยก query
            try {
                const { data: cls, error: clsErr } = await db.from('core_classrooms')
                    .select(`
                        adviser1:core_personnel!adviser_id_1(prefix, first_name, last_name),
                        adviser2:core_personnel!adviser_id_2(prefix, first_name, last_name)
                    `)
                    .eq('id', assessment.classroom_id)
                    .single();

                if (!clsErr && cls) {
                    if (cls.adviser1) adviser1 = `${cls.adviser1.prefix || ''}${cls.adviser1.first_name} ${cls.adviser1.last_name}`;
                    if (cls.adviser2) adviser2 = `${cls.adviser2.prefix || ''}${cls.adviser2.first_name} ${cls.adviser2.last_name}`;
                }
            } catch (err) {
                console.warn('⚠️ Adviser data not found:', err);
                // ถ้า embed ไม่ได้ ให้ลองแยก query ดึง personnel
                // ... (optional)
            }
        }

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;

        const std = assessment.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const avatarUrl = std?.avatar_students_url || null;

        Swal.close();
        generateStudentPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        console.error('❌ printStudentPdf catch:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่พบข้อมูลการประเมิน', 'error');
    }
}

function generateStudentPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    // Helper กำหนดสไตล์ตามระดับ (เหมือนที่ใช้ใน renderTable)
    const getLevelStyle = (level) => {
        if (!level) return { badge: 'bg-slate-100 text-slate-700', bg: '#94a3b8', color: '#94a3b8' };
        if (['โดดเด่น', 'สูง', 'สูงกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-green-100 text-green-700', bg: '#10b981', color: '#15803d' };
        } else if (['ปานกลาง', 'เกณฑ์ปกติ'].includes(level)) {
            return { badge: 'bg-blue-100 text-blue-700', bg: '#3b82f6', color: '#1d4ed8' };
        } else if (['ควรพัฒนา', 'ต่ำ', 'ต่ำกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-amber-100 text-amber-700', bg: '#f59e0b', color: '#b45309' };
        } else {
            return { badge: 'bg-slate-100 text-slate-700', bg: '#94a3b8', color: '#475569' };
        }
    };

    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: assessment[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: assessment[`level_${d.key}`] || ''
    }));

    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:60px; height:60px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:24px; color:#94a3b8;"><i class="fas fa-user"></i></div>`;

    // ใช้ getLevelStyle สำหรับระดับรวม
    const totalStyle = getLevelStyle(assessment.level_total);

    const html = `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>MI Report</title>
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
        .footer { font-size: 9px; text-align: center; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        body { margin: 0; padding: 0; }
        .footer { margin-top: 15px; padding-top: 6px; font-size: 8px; page-break-inside: avoid; }
        table { page-break-inside: avoid; }
    </style>
    </head>
    <body>
    <div class="header">
        <div class="logo-area"><img class="logo" src="${logoUrl}" crossorigin="anonymous"><div><div class="school-title">${schoolName}</div><div class="school-sub">รายงานผลการประเมินพหุปัญญา (MIT)</div></div></div>
        <div class="info-area"><div><b>ภาคเรียนที่ ${semester}</b> ปีการศึกษา ${academicYear}</div><div>ครูที่ปรึกษา: ${adviser1} ${adviser2 !== '-' ? ' / ' + adviser2 : ''}</div></div>
    </div>
    <div class="student-card">
        <div class="student-avatar">${avatarHtml}</div>
        <div class="student-details"><b>ชื่อ-สกุล:</b> ${fullName}<br><span style="font-size:12px;color:#64748b">วันที่ประเมิน: ${new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH')}</span></div>
    </div>
    <div class="total-card">
        <div class="total-score" style="color:${totalStyle.color}">${assessment.score_total} <span style="font-size:14px;font-weight:normal;">/ 200 คะแนน</span></div>
        <div class="total-level">ระดับรวม: ${assessment.level_total}</div>
    </div>
    <div class="chart-title">📊 กราฟแสดงคะแนนรายด้าน (8 ด้าน)</div>
    ${dims.map(d => {
        const percent = (d.score / d.max) * 100;
        const style = getLevelStyle(d.level);
        return `<div class="bar-item"><div class="bar-label"><span><b>${d.label}</b> (${d.score}/${d.max})</span><span>${Math.round(percent)}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${percent}%; background:${style.bg};"></div></div></div>`;
    }).join('')}
    
    <table>
        <thead><tr><th>ด้าน</th><th>คะแนน</th><th>ระดับ</th></tr></thead>
        <tbody>
            ${dims.map(d => `<tr><td>${d.label}</td><td style="text-align:center">${d.score}/${d.max}</td><td style="text-align:center">${d.level}</td></tr>`).join('')}
        </tbody>
    </table>
    <div class="footer">ระบบ WRK School Management System | แบบประเมินพหุปัญญา 8 ด้าน</div>
    </body></html>`;

    const element = document.createElement('div');
    element.innerHTML = html;

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
        filename: `MI_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}

function openImportModal() { document.getElementById('import-modal').classList.remove('hidden'); }
function closeImportModal() { document.getElementById('import-modal').classList.add('hidden'); }
function setImportMode(mode) {
    importMode = mode;
    document.getElementById('import-excel-section').classList.toggle('hidden', mode !== 'excel');
    document.getElementById('import-sheets-section').classList.toggle('hidden', mode !== 'sheets');
    document.getElementById('tab-excel').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'excel' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
    document.getElementById('tab-sheets').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'sheets' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
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
                'ภาษา': parseInt(cols[1]), 'ตรรกศาสตร์': parseInt(cols[2]),
                'มิติสัมพันธ์': parseInt(cols[3]), 'ร่างกาย': parseInt(cols[4]),
                'ดนตรี': parseInt(cols[5]), 'มนุษยสัมพันธ์': parseInt(cols[6]),
                'เข้าใจตนเอง': parseInt(cols[7]), 'ธรรมชาติ': parseInt(cols[8])
            };
        });
        Swal.close();
        await processImportRows(rows);
    } catch (err) { Swal.close(); Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function processImportRows(rows) {
    const dimMap = {
        'ภาษา': 'linguistic',
        'ตรรกศาสตร์': 'logical_mathematical',
        'มิติสัมพันธ์': 'visual_spatial',
        'ร่างกาย': 'bodily_kinesthetic',
        'ดนตรี': 'musical',
        'มนุษยสัมพันธ์': 'interpersonal',
        'เข้าใจตนเอง': 'intrapersonal',
        'ธรรมชาติ': 'naturalist'
    };
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
        const scores = {};
        for (const [thai, key] of Object.entries(dimMap)) {
            scores[key] = parseInt(row[thai]) || 0;
        }
        const total = Object.values(scores).reduce((a, b) => a + b, 0);
        const payload = {
            student_id: std.id, classroom_id: std.classroom_id,
            academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester,
            answers: {}, recorder_id: currentUser.id,
            // BUG FIX #3: ต้องระบุ score_ prefix ให้ครบ ห้าม spread ...scores โดยตรง
            score_linguistic: scores.linguistic,
            score_logical_mathematical: scores.logical_mathematical,
            score_visual_spatial: scores.visual_spatial,
            score_bodily_kinesthetic: scores.bodily_kinesthetic,
            score_musical: scores.musical,
            score_interpersonal: scores.interpersonal,
            score_intrapersonal: scores.intrapersonal,
            score_naturalist: scores.naturalist,
            score_total: total,
            level_linguistic: getLevel(scores.linguistic, MI_NORM.linguistic),
            level_logical_mathematical: getLevel(scores.logical_mathematical, MI_NORM.logical_mathematical),
            level_visual_spatial: getLevel(scores.visual_spatial, MI_NORM.visual_spatial),
            level_bodily_kinesthetic: getLevel(scores.bodily_kinesthetic, MI_NORM.bodily_kinesthetic),
            level_musical: getLevel(scores.musical, MI_NORM.musical),
            level_interpersonal: getLevel(scores.interpersonal, MI_NORM.interpersonal),
            level_intrapersonal: getLevel(scores.intrapersonal, MI_NORM.intrapersonal),
            level_naturalist: getLevel(scores.naturalist, MI_NORM.naturalist),
            level_total: getLevel(total, MI_NORM.total)
        };
        const { error } = await db.from('mi_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
        if (error) fail++; else success++;
    }
    Swal.close(); closeImportModal();
    Swal.fire({ icon: success > 0 ? 'success' : 'error', title: 'นำเข้าเสร็จ', html: `สำเร็จ ${success} รายการ<br>ล้มเหลว ${fail} รายการ` });
    loadResults(); loadStats();
}

function updateToggleModeUI() {
    const btn = document.getElementById('btnToggleMode');
    if (btn) btn.innerHTML = isAdminMode ? '<i class="fa-solid fa-toggle-on text-emerald-500"></i> โหมด: ผู้ดูแลระบบ' : '<i class="fa-solid fa-toggle-off"></i> โหมด: ครูที่ปรึกษา';
}

async function toggleMode() {
    isAdminMode = !isAdminMode;
    updateToggleModeUI();
    if (miTable) { miTable.destroy(); miTable = null; }
    document.getElementById('mi-tbody').innerHTML = '';
    await loadClassrooms();
    await loadStats(); // ✅ เพิ่มบรรทัดนี้
}

function openSettings() {
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
    const delay = parseInt(document.getElementById('set-delay').value) || 0;
    const active = document.getElementById('set-active').checked;
    const { error } = await db.from('mi_settings').upsert({
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

let allPersonnel = [];
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
        return `<tr>
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
async function handleLogout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก' });
    if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'index.html'; }
}
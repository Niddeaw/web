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

// ฟังก์ชัน buildMIPdfHtml - Layout ตามที่กำหนด
function buildMIPdfHtml(opts) {
    console.log('✅ buildMIPdfHtml - แก้ไขกราฟเรดาร์หาย + ปรับช่องว่างตารางไม่ให้ทับกัน');

    var assessment   = opts.assessment || {};
    var schoolName   = opts.schoolName || '';
    var academicYear = opts.academicYear || '';
    var semester     = opts.semester || '';
    var adviser1     = opts.adviser1 || '';
    var adviser2     = opts.adviser2 || '';
    var logoUrl      = opts.logoUrl || '';
    var fullName     = opts.fullName || '';
    var avatarUrl    = opts.avatarUrl || '';
    var dims         = opts.dims || [];
    
    // ดักจับ Key
    var studentIdCard = opts.studentIdCard || opts.studentCode || opts.student_id || '-';
    var studentNumber = opts.studentNumber || '-';
    var gradeLevel    = opts.gradeLevel || '-';
    var roomNumber    = opts.roomNumber || '-';
    var docTitle      = opts.docTitle || 'รายงานผลการประเมินพหุปัญญา (MIT)';

    var scoreTotal = assessment.score_total !== undefined ? assessment.score_total : (assessment.total_score || '-');
    var totalLevel = assessment.level_total || '-';
    
    var isHigh = ['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(totalLevel) >= 0;
    var isMid  = ['เกณฑ์ปกติ','ปานกลาง'].indexOf(totalLevel) >= 0;
    var totalColor  = isHigh ? '#15803d' : (isMid ? '#1d4ed8' : '#b91c1c');
    var totalBg     = isHigh ? '#dcfce7'  : (isMid ? '#dbeafe'  : '#fee2e2');
    var totalBorder = isHigh ? '#16a34a'  : (isMid ? '#2563eb'  : '#dc2626');

    function getLvlColor(lv) {
        if (['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(lv) >= 0) return '#10b981';
        if (['เกณฑ์ปกติ','ปานกลาง'].indexOf(lv) >= 0) return '#3b82f6';
        return '#ef4444';
    }
    function getLvlClass(lv) {
        if (['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(lv) >= 0) return 'lh';
        if (['เกณฑ์ปกติ','ปานกลาง'].indexOf(lv) >= 0) return 'lm';
        return 'll';
    }

    var avatarHtml = avatarUrl
        ? '<img src="' + avatarUrl + '" width="70" height="90" style="object-fit:cover;" crossorigin="anonymous">'
        : '<div style="width:70px;height:90px;text-align:center;line-height:90px;font-size:30px;color:#94a3b8;background:#e2e8f0;">&#128100;</div>';

    var DC = ['#6366f1','#0ea5e9','#8b5cf6','#ec4899','#f59e0b','#10b981','#14b8a6','#f97316'];

    // ---- PIE SVG ----
    var pieTot = 0;
    for (var i=0;i<dims.length;i++) pieTot += dims[i].score;
    if (pieTot===0) pieTot=1;
    var slices='', sa=-Math.PI/2;
    var pcx=60,pcy=60,pr=48;
    for (var i=0;i<dims.length;i++){
        var ang=(dims[i].score/pieTot)*2*Math.PI;
        if(ang<0.001){sa+=ang;continue;}
        var ea=sa+ang;
        var x1=pcx+pr*Math.cos(sa), y1=pcy+pr*Math.sin(sa);
        var x2=pcx+pr*Math.cos(ea), y2=pcy+pr*Math.sin(ea);
        var la=ang>Math.PI?1:0;
        slices+='<path d="M'+pcx+','+pcy+' L'+x1.toFixed(1)+','+y1.toFixed(1)+
            ' A'+pr+','+pr+' 0 '+la+',1 '+x2.toFixed(1)+','+y2.toFixed(1)+
            ' Z" fill="'+DC[i]+'" stroke="white" stroke-width="1.5"/>';
        sa=ea;
    }
    var piesvg='<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">'+slices+'</svg>';

    // ---- LEGEND ----
    var legend='';
    for(var i=0;i<dims.length;i++){
        legend+='<div style="margin-bottom:3px;font-size:11px;color:#374151;">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+DC[i]+';margin-right:5px;vertical-align:middle;"></span>' +
            '<span style="vertical-align:middle;">'+dims[i].label+' ('+dims[i].score+'/'+dims[i].max+')</span></div>';
    }

    // ---- RADAR SVG (แก้พื้นที่ viewBox และสีเพื่อให้แสดงผลได้ใน PDF ทุกตัว) ----
    var rcx=80,rcy=80,rr=50,n=dims.length;
    var grid='',axes='',lbs='',dts='',rpts=[];
    for(var i=0;i<n;i++){
        var ang=(2*Math.PI*i/n)-Math.PI/2;
        var pct=dims[i].max>0?dims[i].score/dims[i].max:0;
        rpts.push((rcx+rr*pct*Math.cos(ang)).toFixed(1)+','+(rcy+rr*pct*Math.sin(ang)).toFixed(1));
        var ex=rcx+rr*Math.cos(ang), ey=rcy+rr*Math.sin(ang);
        axes+='<line x1="'+rcx+'" y1="'+rcy+'" x2="'+ex.toFixed(1)+'" y2="'+ey.toFixed(1)+'" stroke="#d1d5db" stroke-width="1"/>';
        var lx=rcx+(rr+15)*Math.cos(ang), ly=rcy+(rr+15)*Math.sin(ang);
        var sl=dims[i].label.length>3?dims[i].label.substring(0,3):dims[i].label;
        lbs+='<text x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="middle" dominant-baseline="middle" font-size="8.5" fill="#374151" font-family="Sarabun,sans-serif">'+sl+'</text>';
        var dx=rcx+rr*pct*Math.cos(ang), dy=rcy+rr*pct*Math.sin(ang);
        dts+='<circle cx="'+dx.toFixed(1)+'" cy="'+dy.toFixed(1)+'" r="2.5" fill="'+DC[i]+'" stroke="white" stroke-width="1"/>';
    }
    var fracs=[0.25,0.5,0.75,1];
    for(var f=0;f<4;f++){
        var gp=[];
        for(var i=0;i<n;i++){
            var ang=(2*Math.PI*i/n)-Math.PI/2;
            gp.push((rcx+rr*fracs[f]*Math.cos(ang)).toFixed(1)+','+(rcy+rr*fracs[f]*Math.sin(ang)).toFixed(1));
        }
        grid+='<polygon points="'+gp.join(' ')+'" fill="none" stroke="#e5e7eb" stroke-width="1"/>';
    }
    // เปลี่ยนจากโค้ดสี #6366f115 เป็นสีทึบ #e0e7ff เพื่อไม่ให้กราฟหาย
    var radarsvg='<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">'+
        grid+axes+
        '<polygon points="'+rpts.join(' ')+'" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>'+
        dts+lbs+'</svg>';

    // ---- BAR CHART ----
    var bars='';
    for(var i=0;i<dims.length;i++){
        var pct=dims[i].max>0?(dims[i].score/dims[i].max*100):0;
        var barColor = getLvlColor(dims[i].level);
        bars+='<div style="margin-bottom:5px;">' +
            '<div style="font-size:11px;margin-bottom:2px;">' +
            '<span style="font-weight:600;float:left;">'+dims[i].label+'</span>' +
            '<span style="float:right;">'+dims[i].score+'/'+dims[i].max+' ('+Math.round(pct)+'%)</span>' +
            '<div style="clear:both;"></div>' +
            '</div>' +
            '<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%;">' +
            '<div style="width:'+pct.toFixed(1)+'%;background:'+barColor+';height:8px;border-radius:4px;"></div>' +
            '</div></div>';
    }

    // ---- TABLE ROWS ----
    var trows='';
    for(var i=0;i<dims.length;i++){
        var pct=dims[i].max>0?Math.round(dims[i].score/dims[i].max*100):0;
        trows+='<tr><td style="text-align:left;">'+dims[i].label+'</td><td>'+dims[i].score+'</td><td>'+dims[i].max+'</td><td>'+pct+'%</td><td class="'+getLvlClass(dims[i].level)+'">'+dims[i].level+'</td></tr>';
    }
    var totPct=Math.round((assessment.score_total||0)/200*100);
    trows+='<tr style="background:#f1f5f9;font-weight:700;"><td style="text-align:left; padding: 6px;"><b>รวม</b></td><td><b>'+scoreTotal+'</b></td><td><b>200</b></td><td><b>'+totPct+'%</b></td><td class="'+getLvlClass(totalLevel)+'"><b>'+totalLevel+'</b></td></tr>';

    var dateStr=new Date(assessment.completed_at||new Date()).toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
    var printDate=new Date().toLocaleDateString('th-TH');
    var advLine=adviser1+(adviser2&&adviser2!=='-'?' / '+adviser2:'');
    var gradeDisp=gradeLevel&&gradeLevel!=='-'?'ม.'+gradeLevel:'';

    // ---- CSS สำหรับ A4 1 หน้า (เพิ่ม line-height กันบรรทัดทับกัน) ----
    var css=
        '* {box-sizing:border-box;margin:0;padding:0;}' +
        'html,body {width:210mm;height:297mm;background:white;}' +
        'body {font-family:Sarabun,Anuphan,sans-serif;font-size:12px;color:#1e293b;padding:8mm 12mm;}' +
        '.box {background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:10px;}' + 
        '.stitle2 {font-size:14px;font-weight:700;color:#312e81;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px;}' +
        'table.data-table {width:100%;border-collapse:collapse;font-size:12px;}' +
        'table.data-table th, table.data-table td {border:1px solid #cbd5e1;padding:5px;text-align:center;line-height:1.4;vertical-align:middle;}' +
        'table.data-table th {background:#312e81;color:white;font-weight:600;}' +
        '.lh {color:#15803d;font-weight:700;}' +
        '.lm {color:#1d4ed8;font-weight:700;}' +
        '.ll {color:#b91c1c;font-weight:700;}' +
        '.footer {font-size:10px;text-align:center;color:#94a3b8;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;}';

    // ---- HTML ----
    var html=
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+css+'</style></head><body>' +

        // ===== HEADER =====
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid #312e81; margin-bottom:10px; padding-bottom:8px;">' +
            '<tr>' +
                '<td width="60%" valign="middle">' +
                    '<table cellpadding="0" cellspacing="0">' +
                        '<tr>' +
                            '<td width="70" valign="middle"><img src="'+logoUrl+'" width="60" crossorigin="anonymous"></td>' +
                            '<td valign="middle">' +
                                '<div style="color:#312e81;font-size:20px;font-weight:900;line-height:1.2;">'+schoolName+'</div>' +
                                '<div style="font-size:14px;color:#475569;">'+docTitle+'</div>' +
                            '</td>' +
                        '</tr>' +
                    '</table>' +
                '</td>' +
                '<td width="40%" align="right" valign="bottom" style="font-size:14px;line-height:1.6;">' +
                    '<div><b>ภาคเรียนที่ '+semester+'</b> ปีการศึกษา '+academicYear+'</div>' +
                    '<div>ครูที่ปรึกษา: '+advLine+'</div>' +
                    '<div>วันที่ประเมิน: '+dateStr+'</div>' +
                '</td>' +
            '</tr>' +
        '</table>' +

        // ===== ROW 1: ข้อมูลนักเรียน (ซ้าย) + ผลการประเมินรวม (ขวา) (ลดความสูงกล่องเพื่อให้หน้ากระดาษพอ) =====
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">' +
            '<tr>' +
                '<td width="50%" valign="top" style="padding-right:5px;">' +
                    '<div class="box" style="height:110px;">' +
                        '<table width="100%" cellpadding="0" cellspacing="0">' +
                            '<tr>' +
                                '<td width="80" valign="top">' +
                                    '<div style="width:70px;height:90px;border-radius:4px;overflow:hidden;border:1px solid #cbd5e1;background:#f8fafc;text-align:center;">'+avatarHtml+'</div>' +
                                '</td>' +
                                '<td valign="top" style="line-height:1.5; padding-left:5px;">' +
                                    '<div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:5px;">'+fullName+'</div>' +
                                    '<div><span style="font-size:12px;color:#64748b;">เลขประจำตัว: </span><span style="font-size:14px;font-weight:700;color:#312e81;">'+studentIdCard+'</span></div>' +
                                    '<div><span style="font-size:12px;color:#64748b;">ชั้น: </span><span style="font-size:13px;font-weight:700;color:#312e81;">'+gradeDisp+'</span> &nbsp;&nbsp; <span style="font-size:12px;color:#64748b;">ห้อง: </span><span style="font-size:13px;font-weight:700;color:#312e81;">'+roomNumber+'</span></div>' +
                                    '<div><span style="font-size:12px;color:#64748b;">เลขที่: </span><span style="font-size:13px;font-weight:700;color:#312e81;">'+studentNumber+'</span></div>' +
                                '</td>' +
                            '</tr>' +
                        '</table>' +
                    '</div>' +
                '</td>' +
                '<td width="50%" valign="top" style="padding-left:5px;">' +
                    '<div class="box" style="text-align:center; height:110px;">' +
                        '<div style="font-size:14px;font-weight:700;color:#312e81;margin-bottom:8px;">🏆 ผลการประเมินรวม</div>' +
                        '<div style="background:'+totalBg+';border:2px solid '+totalBorder+';border-radius:6px;padding:10px 25px;display:inline-block;">' +
                            '<div style="font-size:32px;font-weight:900;color:'+totalColor+';line-height:1;">'+scoreTotal+' <span style="font-size:14px;font-weight:500;color:'+totalColor+';">/ 200</span></div>' +
                            '<div style="font-size:14px;font-weight:700;color:'+totalColor+';margin-top:5px;">ระดับ: '+totalLevel+'</div>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
            '</tr>' +
        '</table>' +

        // ===== ROW 2: กราฟวงกลม (ซ้าย) + กราฟเรดาร์ (ขวา) =====
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">' +
            '<tr>' +
                '<td width="50%" valign="top" style="padding-right:5px;">' +
                    '<div class="box" style="text-align:center; height:170px;">' +
                        '<div class="stitle2">🥧 สัดส่วนคะแนนรายด้าน</div>' +
                        '<table width="100%" cellpadding="0" cellspacing="0">' +
                            '<tr>' +
                                '<td width="50%" align="right" valign="middle" style="padding-right:10px;">'+piesvg+'</td>' +
                                '<td width="50%" align="left" valign="middle">'+legend+'</td>' +
                            '</tr>' +
                        '</table>' +
                    '</div>' +
                '</td>' +
                '<td width="50%" valign="top" style="padding-left:5px;">' +
                    '<div class="box" style="text-align:center; height:170px;">' +
                        '<div class="stitle2">🕸️ กราฟเรดาร์พหุปัญญา</div>' +
                        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle">'+radarsvg+'</td></tr></table>' +
                    '</div>' +
                '</td>' +
            '</tr>' +
        '</table>' +

        // ===== ROW 3: กราฟแท่ง (เต็มความกว้าง) =====
        '<div class="box" style="margin-bottom:10px;">' +
            '<div class="stitle2">📊 กราฟแสดงคะแนนรายด้าน 8 ด้าน</div>' +
            bars +
        '</div>' +

        // ===== ROW 4: ตารางสรุปผล =====
        '<div class="box">' +
            '<div class="stitle2">📋 ตารางสรุปผลการประเมิน 8 ด้าน</div>' +
            '<table class="data-table">' +
                '<thead><tr><th style="width:30%;text-align:left;">ด้าน</th><th>คะแนน</th><th>เต็ม</th><th>%</th><th>ระดับ</th></tr></thead>' +
                '<tbody>'+trows+'</tbody>' +
            '</table>' +
        '</div>' +

        // ===== FOOTER =====
        '<div class="footer">ระบบ WRK School Management System | แบบประเมินพหุปัญญา 8 ด้าน | พิมพ์วันที่ '+printDate+'</div>' +

        '</body></html>';

    return html;
}

function generateStudentPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: assessment[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: assessment[`level_${d.key}`] || ''
    }));

    // ดึงข้อมูล classroom จาก assessment
    const cls = assessment.core_classrooms;
    const std = assessment.core_students;
    const studentIdCard = std?.student_id_card || '';
    const gradeLevel = cls?.grade_level || '';
    const roomNumber = cls?.room_number || '';

    // ดึง student_number จาก allResults ถ้ามี
    const resultRow = allResults.find(r => r.student_id === assessment.student_id);
    const studentNumber = resultRow?.student_number || '';

    const html = buildMIPdfHtml({
        assessment, schoolName, academicYear, semester,
        adviser1, adviser2, logoUrl, fullName, avatarUrl,
        dims,
        studentIdCard, studentNumber, gradeLevel, roomNumber,
        docTitle: 'รายงานผลการประเมินพหุปัญญา (MIT)'
    });

    generateStudentPdfFromHtml(html, fullName);
}

function generateStudentPdfFromHtml(html, fullName) {
    // สร้าง iframe ซ่อนไว้ เพื่อให้ browser render HTML เต็มรูปแบบรวมถึง <style>
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    var iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(html);
    iDoc.close();

    // รอให้รูปภาพโหลดครบก่อน
    var iWin = iframe.contentWindow;
    var imgs = iDoc.querySelectorAll('img');
    var total = imgs.length;

    function runPdf() {
        var bodyEl = iDoc.body;
        html2pdf().set({
            margin: [0.45, 0.45, 0.7, 0.45],
            filename: 'MI_' + fullName + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                windowWidth: 794,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
        }).from(bodyEl).save().then(function() {
            document.body.removeChild(iframe);
        });
    }

    if (total === 0) {
        setTimeout(runPdf, 300);
    } else {
        var loaded = 0;
        imgs.forEach(function(img) {
            if (img.complete) {
                loaded++;
                if (loaded === total) setTimeout(runPdf, 300);
            } else {
                img.addEventListener('load', function() { loaded++; if (loaded === total) setTimeout(runPdf, 300); });
                img.addEventListener('error', function() { loaded++; if (loaded === total) setTimeout(runPdf, 300); });
            }
        });
    }
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
// =======================================================
// sdq_admin.js — แดชบอร์ด SDQ สำหรับผู้ดูแลระบบ (มาตรฐาน WRK)
// =======================================================

// ---------- State ----------
let currentSchoolInfo = null;
let adminEnrollmentList = [];
let tableInstance = null;
let currentProfile = null;

let overviewChartInstance = null;
let gradeChartInstance = null;
let scoreByGradeChartInstance = null;

// ---------- Threshold (มาตรฐานเดียวกับ teacher) ----------
const SDQ_THRESHOLD = { NORMAL_MAX: 15, RISK_MAX: 18 };
function getSDQStatus(score) {
    if (score == null || isNaN(score)) return { text: 'ยังไม่ประเมิน', color: '#94a3b8', key: 'none' };
    if (score <= SDQ_THRESHOLD.NORMAL_MAX) return { text: 'ปกติ',   color: '#10b981', key: 'normal' };
    if (score <= SDQ_THRESHOLD.RISK_MAX)   return { text: 'เสี่ยง',  color: '#f59e0b', key: 'risk' };
    return                                        { text: 'มีปัญหา', color: '#ef4444', key: 'problem' };
}

// =======================================================
// 🚀 Init (standard flow)
// =======================================================
window.addEventListener('load', async () => {
    try {
        const ALLOWED = ['super_admin', 'admin'];
        const result = await checkSessionAndRole(MODULE_NAME, ALLOWED);

        if (!result) {
            document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
            return;
        }

        currentProfile = result.personnel;
        window.currentUser     = result.user;
        window.currentProfile  = result.personnel;
        window.currentUserRole = result.role;

        // UI มาตรฐาน
        setUserDisplayName(currentProfile);
        updateUserRoleLabel(result.role);
        renderUserAvatar(currentProfile);

        // ดึงข้อมูลโรงเรียน
        const { data: school } = await db.from('core_school_info').select('*').single();
        currentSchoolInfo = school;

        // โหลดข้อมูล + render
        await loadAdminData();

        if (typeof logUserAction === 'function') {
            await logUserAction(`เข้าสู่ระบบ SDQ (Admin)`, MODULE_KEY);
        }

        console.log('✅ SDQ Admin initialized');
    } catch (err) {
        console.error('❌ Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        restoreSidebarCollapse();
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
        if (typeof refreshNavButtons === 'function') refreshNavButtons();
    }
});

// =======================================================
// Load data
// =======================================================
async function loadAdminData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: enrollments, error } = await db.from('student_enrollments')
            .select(`
                id, student_number,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (grade_level, room_number),
                sdq_assessments (
                    id, total_difficulty_score, assessor_type,
                    score_emotional, score_conduct, score_hyper, score_peer, score_prosocial,
                    created_at, academic_year, semester
                )
            `)
            .order('student_number', { ascending: true });

        if (error) throw error;
        adminEnrollmentList = enrollments || [];

        populateClassroomFiltersFromEnrollments();
        renderAdminDashboard();
        buildAdminStudentTable();
        setupFilters();
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
    }
}

function populateClassroomFiltersFromEnrollments() {
    const grades = new Set();
    adminEnrollmentList.forEach(e => {
        const room = e.core_classrooms;
        if (room && room.grade_level) grades.add(room.grade_level);
    });

    let opts = '<option value="">ทั้งหมด</option>';
    [...grades].sort((a,b)=>a-b).forEach(g => opts += `<option value="${g}">ม.${g}</option>`);
    $('#filterGrade').html(opts);

    $('#filterGrade').off('change.filterRoom').on('change.filterRoom', function () {
        populateRoomFilterByGrade($(this).val());
    });
    populateRoomFilterByGrade('');
}

function populateRoomFilterByGrade(selectedGrade) {
    const rooms = new Set();
    adminEnrollmentList.forEach(e => {
        const room = e.core_classrooms;
        if (!room) return;
        if (selectedGrade && String(room.grade_level) !== String(selectedGrade)) return;
        if (room.room_number) rooms.add(room.room_number);
    });

    let opts = '<option value="">ทั้งหมด</option>';
    [...rooms].sort((a,b)=>a-b).forEach(r => opts += `<option value="${r}">ห้อง ${r}</option>`);
    $('#filterRoom').html(opts);
}

// =======================================================
// Dashboard + Charts
// =======================================================
function renderAdminDashboard() {
    let total = adminEnrollmentList.length;
    let normal = 0, risk = 0, problem = 0;

    adminEnrollmentList.forEach(enr => {
        const asmts = enr.sdq_assessments || [];
        const primary = asmts.find(a => a.assessor_type === 'teacher') ||
                        asmts.find(a => a.assessor_type === 'parent')  ||
                        asmts.find(a => a.assessor_type === 'student');
        if (primary) {
            const st = getSDQStatus(primary.total_difficulty_score);
            if (st.key === 'normal') normal++;
            else if (st.key === 'risk') risk++;
            else if (st.key === 'problem') problem++;
        }
    });

    $('#allCount').text(total);
    $('#normalCount').text(normal);
    $('#riskCount').text(risk);
    $('#probCount').text(problem);

    renderOverviewChart(normal, risk, problem, total);
    populateGradeFilter();
    renderGradeChart('all');
    renderScoreByGradeChart();
}

function renderOverviewChart(normal, risk, problem, total) {
    const ctx = document.getElementById('overviewChart');
    if (!ctx) return;
    if (overviewChartInstance) overviewChartInstance.destroy();
    const notAssessed = total - (normal + risk + problem);

    overviewChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['ปกติ', 'เสี่ยง', 'มีปัญหา', 'ยังไม่ประเมิน'],
            datasets: [{ data: [normal, risk, problem, notAssessed], backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#cbd5e1'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function populateGradeFilter() {
    const grades = new Set();
    adminEnrollmentList.forEach(e => {
        const room = e.core_classrooms;
        if (room?.grade_level) grades.add(room.grade_level);
    });
    let opts = '<option value="all">ทุกชั้น</option>';
    [...grades].sort((a,b)=>a-b).forEach(g => opts += `<option value="${g}">ม.${g}</option>`);
    $('#chartGradeFilter').html(opts);
    $('#chartGradeFilter').off('change').on('change', function() {
        renderGradeChart($(this).val());
    });
}

function renderGradeChart(selectedGrade = 'all') {
    const ctx = document.getElementById('gradeChart');
    if (!ctx) return;
    if (gradeChartInstance) gradeChartInstance.destroy();

    let filtered = adminEnrollmentList;
    if (selectedGrade !== 'all') {
        filtered = adminEnrollmentList.filter(e => e.core_classrooms?.grade_level == selectedGrade);
    }

    let normal = 0, risk = 0, problem = 0;
    filtered.forEach(e => {
        const asmts = e.sdq_assessments || [];
        const primary = asmts.find(a => a.assessor_type === 'teacher') ||
                        asmts.find(a => a.assessor_type === 'parent')  ||
                        asmts.find(a => a.assessor_type === 'student');
        if (primary) {
            const st = getSDQStatus(primary.total_difficulty_score);
            if (st.key === 'normal') normal++;
            else if (st.key === 'risk') risk++;
            else if (st.key === 'problem') problem++;
        }
    });

    gradeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ปกติ', 'เสี่ยง', 'มีปัญหา'],
            datasets: [{
                label: `จำนวนนักเรียน (${selectedGrade === 'all' ? 'ทุกชั้น' : 'ม.'+selectedGrade})`,
                data: [normal, risk, problem],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderScoreByGradeChart() {
    const ctx = document.getElementById('scoreByGradeChart');
    if (!ctx) return;
    if (scoreByGradeChartInstance) scoreByGradeChartInstance.destroy();

    const map = {};
    adminEnrollmentList.forEach(e => {
        const room = e.core_classrooms;
        if (!room?.grade_level) return;
        const g = room.grade_level;
        if (!map[g]) map[g] = { emotional: [], conduct: [], hyper: [], peer: [], prosocial: [] };
        const a = (e.sdq_assessments || []).find(x => ['teacher','parent','student'].includes(x.assessor_type));
        if (a) {
            map[g].emotional.push(a.score_emotional || 0);
            map[g].conduct.push(a.score_conduct || 0);
            map[g].hyper.push(a.score_hyper || 0);
            map[g].peer.push(a.score_peer || 0);
            map[g].prosocial.push(a.score_prosocial || 0);
        }
    });

    const grades = Object.keys(map).sort((a,b)=>a-b);
    const avg = arr => arr.length ? Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1)) : 0;

    const datasets = ['emotional','conduct','hyper','peer','prosocial'].map(key => ({
        label: { emotional:'ด้านอารมณ์', conduct:'ความประพฤติ', hyper:'ไม่อยู่นิ่ง', peer:'เพื่อน', prosocial:'สังคม' }[key],
        data: grades.map(g => avg(map[g][key])),
        borderColor: { emotional:'#6366f1', conduct:'#ef4444', hyper:'#f59e0b', peer:'#10b981', prosocial:'#8b5cf6' }[key],
        tension: 0.3
    }));

    scoreByGradeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: grades.map(g=>'ม.'+g), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// =======================================================
// Table
// =======================================================
function buildAdminStudentTable() {
    if (tableInstance) tableInstance.destroy();
    const tbody = $('#adminTable tbody');
    tbody.empty();

    if (!adminEnrollmentList.length) {
        tbody.append('<tr><td colspan="8" class="p-8 text-center text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>');
        tableInstance = $('#adminTable').DataTable();
        return;
    }

    adminEnrollmentList.forEach(enr => {
        const student = enr.core_students;
        if (!student) return;
        const asmts = enr.sdq_assessments || [];
        const std = asmts.find(a => a.assessor_type === 'student');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const tea = asmts.find(a => a.assessor_type === 'teacher');

        function badge(assess, label) {
            if (!assess) return '<span class="px-2 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px]">ยังไม่มี</span>';
            const st = getSDQStatus(assess.total_difficulty_score);
            const cm = { normal: 'bg-emerald-100 text-emerald-700', risk: 'bg-amber-100 text-amber-700', problem: 'bg-rose-100 text-rose-700' };
            return `<span class="px-2 py-1 rounded-full text-[10px] font-bold ${cm[st.key] || 'bg-slate-100'} cursor-pointer hover:shadow-md" onclick="viewSDQ('${assess.id}')" title="ดูรายละเอียด">${label} (${assess.total_difficulty_score})</span>`;
        }

        const room = enr.core_classrooms;
        tbody.append(`
            <tr class="border-b hover:bg-slate-50">
                <td class="p-3 text-center">${room ? `ม.${room.grade_level}/${room.room_number}` : ''}</td>
                <td class="p-3 text-center">${enr.student_number}</td>
                <td class="p-3 text-slate-500">${student.student_id_card}</td>
                <td class="p-3 font-bold text-slate-700">${student.prefix || ''}${student.first_name} ${student.last_name}</td>
                <td class="p-3 text-center">${badge(std, 'นร.')}</td>
                <td class="p-3 text-center">${badge(par, 'ผปค.')}</td>
                <td class="p-3 text-center">${badge(tea, 'ครู')}</td>
                <td class="p-3 text-center">
                    <div class="flex gap-1 justify-center">
                        <button onclick="printStudentSDQ('${enr.id}')" class="text-purple-600 hover:text-purple-800" title="พิมพ์รายงาน"><i class="fas fa-print"></i></button>
                        <button onclick="deleteAllAssessments('${enr.id}')" class="text-rose-500 hover:text-rose-700" title="ลบทั้งหมด"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `);
    });

    tableInstance = $('#adminTable').DataTable({
        responsive: true,
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4 gap-4"lf>rt<"flex flex-col md:flex-row justify-between items-center mt-4 gap-4"ip>',
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
    $('.dataTables_filter input').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 w-full md:w-64');
    $('.dataTables_length select').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500');
}

function setupFilters() {
    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        const g = $('#filterGrade').val();
        const r = $('#filterRoom').val();
        const cls = data[0];
        const mg = g === '' || cls.startsWith('ม.' + g + '/');
        const mr = r === '' || cls.endsWith('/' + r);
        return mg && mr;
    });
    $('#filterGrade, #filterRoom').on('change', function() { if (tableInstance) tableInstance.draw(); });
}

// =======================================================
// View / Delete (assessment only)
// =======================================================
function viewSDQ(sdqId) {
    let found = null, enrId = null, studentName = '', roomInfo = null;
    for (const enr of adminEnrollmentList) {
        const a = (enr.sdq_assessments || []).find(x => x.id === sdqId);
        if (a) {
            found = a; enrId = enr.id;
            const s = enr.core_students;
            studentName = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
            roomInfo = enr.core_classrooms;
            break;
        }
    }
    if (!found) return Swal.fire('ไม่พบข้อมูล');

    const st = getSDQStatus(found.total_difficulty_score);
    const label = found.assessor_type === 'student' ? 'นักเรียน' : found.assessor_type === 'parent' ? 'ผู้ปกครอง' : 'ครู';
    const roomTxt = roomInfo ? `ม.${roomInfo.grade_level}/${roomInfo.room_number}` : '';

    Swal.fire({
        title: '📋 ผลการประเมิน SDQ',
        html: `<div class="text-left space-y-3">
            <div class="text-center">
                <p class="text-lg font-bold text-indigo-600">${studentName}</p>
                <p class="text-sm text-slate-500">${roomTxt} | ผู้ประเมิน: ${label}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="flex justify-between p-3 bg-slate-50 rounded-xl"><span>😢 อารมณ์</span><span class="font-bold text-indigo-600">${found.score_emotional}</span></div>
                <div class="flex justify-between p-3 bg-slate-50 rounded-xl"><span>😠 ประพฤติ</span><span class="font-bold text-indigo-600">${found.score_conduct}</span></div>
                <div class="flex justify-between p-3 bg-slate-50 rounded-xl"><span>⚡ ไม่อยู่นิ่ง</span><span class="font-bold text-indigo-600">${found.score_hyper}</span></div>
                <div class="flex justify-between p-3 bg-slate-50 rounded-xl"><span>🤝 เพื่อน</span><span class="font-bold text-indigo-600">${found.score_peer}</span></div>
                <div class="flex justify-between p-3 bg-emerald-50 rounded-xl col-span-2"><span>🌟 สังคม</span><span class="font-bold text-emerald-700">${found.score_prosocial}</span></div>
            </div>
            <div class="text-center mt-3">
                <div class="text-3xl font-black text-indigo-600">${found.total_difficulty_score}<span class="text-base font-normal text-slate-400"> / 40</span></div>
                <div class="inline-block mt-2 px-4 py-1 rounded-full text-sm font-bold" style="background:${st.color}20; color:${st.color}">สถานะ: ${st.text}</div>
            </div>
        </div>`,
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-print mr-1"></i> พิมพ์',
        showCancelButton: true,
        cancelButtonText: 'ปิด'
    }).then(r => { if (r.isConfirmed && enrId) printStudentSDQ(enrId); });
}

async function deleteAllAssessments(enrollmentId) {
    if (!requireAdmin(window.currentUserRole, true, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    const c = await Swal.fire({
        title: 'ลบการประเมินทั้งหมด?', text: 'การประเมินทุกผู้ประเมินของนักเรียนคนนี้จะถูกลบ',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก', confirmButtonText: 'ลบทั้งหมด'
    });
    if (!c.isConfirmed) return;

    const { error } = await db.from('sdq_assessments').delete().eq('enrollment_id', enrollmentId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    if (typeof logUserAction === 'function') await logUserAction(`ลบการประเมิน SDQ`, 'sdq');
    Swal.fire('สำเร็จ', '', 'success');
    loadAdminData();
}

// =======================================================
// Excel export / import
// =======================================================
function exportData() {
    if (!adminEnrollmentList.length) return Swal.fire('ไม่มีข้อมูล', '', 'warning');

    const rows = adminEnrollmentList.map(enr => {
        const s = enr.core_students;
        const asmts = enr.sdq_assessments || [];
        const std = asmts.find(a => a.assessor_type === 'student');
        const par = asmts.find(a => a.assessor_type === 'parent');
        const tea = asmts.find(a => a.assessor_type === 'teacher');
        const room = enr.core_classrooms;
        return {
            'EnrollmentID': enr.id,
            'ชั้น/ห้อง': room ? `ม.${room.grade_level}/${room.room_number}` : '',
            'เลขที่': enr.student_number,
            'รหัสนักเรียน': s.student_id_card,
            'ชื่อ-สกุล': `${s.prefix||''}${s.first_name} ${s.last_name}`,
            'คะแนนรวม (นร.)': std?.total_difficulty_score ?? '-',
            'คะแนนรวม (ผปค.)': par?.total_difficulty_score ?? '-',
            'คะแนนรวม (ครู)': tea?.total_difficulty_score ?? '-',
            'อารมณ์ (นร.)': std?.score_emotional ?? '-',
            'ความประพฤติ (นร.)': std?.score_conduct ?? '-',
            'สมาธิสั้น (นร.)': std?.score_hyper ?? '-',
            'เพื่อน (นร.)': std?.score_peer ?? '-',
            'สังคม (นร.)': std?.score_prosocial ?? '-',
            'อารมณ์ (ผปค.)': par?.score_emotional ?? '-',
            'ความประพฤติ (ผปค.)': par?.score_conduct ?? '-',
            'สมาธิสั้น (ผปค.)': par?.score_hyper ?? '-',
            'เพื่อน (ผปค.)': par?.score_peer ?? '-',
            'สังคม (ผปค.)': par?.score_prosocial ?? '-',
            'อารมณ์ (ครู)': tea?.score_emotional ?? '-',
            'ความประพฤติ (ครู)': tea?.score_conduct ?? '-',
            'สมาธิสั้น (ครู)': tea?.score_hyper ?? '-',
            'เพื่อน (ครู)': tea?.score_peer ?? '-',
            'สังคม (ครู)': tea?.score_prosocial ?? '-'
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SDQ_All');
    XLSX.writeFile(wb, `SDQ_Report_${currentSchoolInfo?.current_academic_year || ''}.xlsx`);
}

async function importExcel(file) {
    if (!file) return;
    Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const data = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (!rows.length) { Swal.close(); return Swal.fire('ไม่มีข้อมูล', '', 'warning'); }

        const assessorMap = { 'นร.': 'student', 'ผปค.': 'parent', 'ครู': 'teacher' };
        const num = v => { const n = parseInt(v); return isNaN(n) ? 0 : n; };
        let success = 0, skipped = 0, failed = 0;

        for (const row of rows) {
            const enrId = row['EnrollmentID'];
            const sid = String(row['รหัสนักเรียน'] || '').trim();
            let enr = null;
            if (enrId) enr = adminEnrollmentList.find(e => e.id === enrId);
            else if (sid) enr = adminEnrollmentList.find(e => String(e.core_students?.student_id_card || '').trim() === sid);
            if (!enr) { skipped++; continue; }

            for (const [label, type] of Object.entries(assessorMap)) {
                const rawTotal = row[`คะแนนรวม (${label})`];
                if (rawTotal === undefined || rawTotal === '' || rawTotal === '-') continue;

                const payload = {
                    enrollment_id: enr.id,
                    student_id: enr.core_students?.id,
                    academic_year: currentSchoolInfo.current_academic_year,
                    semester: currentSchoolInfo.current_semester,
                    assessor_type: type,
                    score_emotional: num(row[`อารมณ์ (${label})`]),
                    score_conduct:   num(row[`ความประพฤติ (${label})`]),
                    score_hyper:     num(row[`สมาธิสั้น (${label})`]),
                    score_peer:      num(row[`เพื่อน (${label})`]),
                    score_prosocial: num(row[`สังคม (${label})`]),
                    total_difficulty_score: num(rawTotal),
                    created_at: new Date().toISOString()
                };

                const { error } = await db.from('sdq_assessments')
                    .upsert(payload, { onConflict: 'enrollment_id, assessor_type' });
                if (error) failed++; else success++;
            }
        }

        Swal.close();
        await Swal.fire({
            icon: 'success',
            title: 'นำเข้าเสร็จสิ้น',
            html: `สำเร็จ: <b>${success}</b> รายการ<br>ข้าม: <b>${skipped}</b> แถว<br>ล้มเหลว: <b>${failed}</b> รายการ`
        });
        await loadAdminData();
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// =======================================================
// Print Summary PDF
// =======================================================
async function printSummaryPDF() {
    const fg = $('#filterGrade').val();
    const fr = $('#filterRoom').val();

    let dataSource = adminEnrollmentList;
    if (fg || fr) {
        dataSource = adminEnrollmentList.filter(e => {
            const r = e.core_classrooms;
            if (!r) return false;
            if (fg && String(r.grade_level) !== String(fg)) return false;
            if (fr && String(r.room_number) !== String(fr)) return false;
            return true;
        });
    }
    if (!dataSource.length) return Swal.fire('ไม่มีข้อมูล', 'ลองตรวจสอบตัวกรอง', 'warning');

    Swal.fire({ title: 'กำลังเตรียมเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const school = currentSchoolInfo?.school_name || 'โรงเรียน';
    const logoUrl = 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    const modeTitle = (fg || fr)
        ? `ตัวกรอง: ${fg ? 'ม.' + fg : 'ทุกชั้น'}${fr ? ' / ห้อง ' + fr : ''}`
        : 'ทุกชั้น / ทุกห้อง';

    let normal = 0, risk = 0, problem = 0, none = 0;
    dataSource.forEach(item => {
        const a = (item.sdq_assessments || []);
        const main = a.find(x => x.assessor_type === 'teacher') || a.find(x => x.assessor_type === 'parent') || a.find(x => x.assessor_type === 'student');
        if (!main) { none++; return; }
        const st = getSDQStatus(main.total_difficulty_score);
        if (st.key === 'normal') normal++;
        else if (st.key === 'risk') risk++;
        else problem++;
    });

    const buildRows = (s, e) => {
        let out = '';
        for (let i = s; i < e; i++) {
            const item = dataSource[i];
            const st = item.core_students;
            const room = item.core_classrooms;
            const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
            const a = item.sdq_assessments || [];
            const tea = a.find(x => x.assessor_type === 'teacher');
            const par = a.find(x => x.assessor_type === 'parent');
            const std = a.find(x => x.assessor_type === 'student');
            const main = tea || par || std;
            let score = '-', status = 'ยังไม่ประเมิน', color = '#94a3b8';
            if (main) {
                score = main.total_difficulty_score;
                const s = getSDQStatus(score);
                status = s.text; color = s.color;
            }
            out += `<tr style="background:${(i-s)%2===0?'#f8fafc':'white'}">
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${i+1}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${roomTxt}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;font-size:12px">${st ? `${st.prefix||''}${st.first_name} ${st.last_name}` : '-'}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${tea?'✓':'-'}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${par?'✓':'-'}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${std?'✓':'-'}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-size:12px">${score}</td>
                <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-size:12px;color:${color}">${status}</td>
            </tr>`;
        }
        return out;
    };

    const PER = 15;
    const pages = Math.ceil(dataSource.length / PER);
    const divs = [];

    for (let p = 0; p < pages; p++) {
        const s = p * PER, e = Math.min(s + PER, dataSource.length);
        const div = document.createElement('div');
        div.style.cssText = 'font-family:"Sarabun",sans-serif;padding:10px;max-width:1100px;margin:0 auto;background:white;font-size:14px;line-height:1.2;';
        if (p < pages - 1) div.style.pageBreakAfter = 'always';

        div.innerHTML = `
            <div style="text-align:center;margin-bottom:8px">
                <img src="${logoUrl}" style="max-height:45px;display:inline-block;">
                <div style="font-size:16px;font-weight:bold;color:#4f46e5">${escapeHtml(school)}</div>
                <div style="font-size:14px;font-weight:bold">สรุปผลการประเมิน SDQ — ${modeTitle}</div>
                <div style="font-size:12px;color:#64748b">ภาคเรียนที่ ${currentSchoolInfo?.current_semester} ปีการศึกษา ${currentSchoolInfo?.current_academic_year}</div>
            </div>
            ${p === 0 ? `
            <div style="display:flex;gap:12px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:3px 15px;text-align:center">
                    <div style="font-size:12px;font-weight:bold">ปกติ</div>
                    <div style="font-size:24px;font-weight:900;color:#10b981">${normal}</div>
                </div>
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:3px 15px;text-align:center">
                    <div style="font-size:12px;font-weight:bold">เสี่ยง</div>
                    <div style="font-size:24px;font-weight:900;color:#f59e0b">${risk}</div>
                </div>
                <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:3px 15px;text-align:center">
                    <div style="font-size:12px;font-weight:bold">มีปัญหา</div>
                    <div style="font-size:24px;font-weight:900;color:#ef4444">${problem}</div>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:3px 15px;text-align:center">
                    <div style="font-size:12px;font-weight:bold">ยังไม่ประเมิน</div>
                    <div style="font-size:24px;font-weight:900;color:#94a3b8">${none}</div>
                </div>
            </div>` : ''}
            <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
                <thead><tr style="background:#e0e7ff">
                    <th style="padding:6px;text-align:center">#</th>
                    <th style="padding:6px;text-align:center">ห้อง</th>
                    <th style="padding:6px;text-align:left">ชื่อ-สกุล</th>
                    <th style="padding:6px;text-align:center">ครู</th>
                    <th style="padding:6px;text-align:center">ผปค.</th>
                    <th style="padding:6px;text-align:center">นร.</th>
                    <th style="padding:6px;text-align:center">คะแนนรวม</th>
                    <th style="padding:6px;text-align:center">สถานะ</th>
                </tr></thead>
                <tbody>${buildRows(s, e)}</tbody>
            </table>
            <div style="text-align:center;margin-top:8px;color:#94a3b8;font-size:9px">หน้า ${p+1} / ${pages} | พิมพ์ ${new Date().toLocaleDateString('th-TH')}</div>
        `;
        divs.push(div);
        document.body.appendChild(div);
    }

    await new Promise(r => setTimeout(r, 150));
    const combined = document.createElement('div');
    divs.forEach(d => combined.appendChild(d.cloneNode(true)));

    await html2pdf().set({
        margin: [0.2, 0.2, 0.2, 0.2],
        filename: `SDQ_Summary_${currentSchoolInfo?.current_academic_year}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    }).from(combined).save();

    divs.forEach(d => d.remove());
    Swal.close();
}

async function printStudentSDQ(enrollmentId) {
    // (คัดลอก printStudentSDQ จาก sdq_teacher.js ได้เลย — ใช้ logic เดียวกัน)
    const enr = adminEnrollmentList.find(e => e.id === enrollmentId);
    if (!enr) return Swal.fire('ไม่พบข้อมูล', '', 'error');
    Swal.fire('กำลังพัฒนา', 'ฟังก์ชันพิมพ์รายงานรายบุคคลจะมาในเวอร์ชันถัดไป', 'info');
}

// =======================================================
// Admin manager (add/remove) — เหมือน teacher
// =======================================================
async function openAdminManager() {
    document.getElementById('adminManagerModal').classList.remove('hidden');
    await Promise.all([loadPersonnelOptions(), loadCurrentAdmins()]);
}
function closeAdminManager() { document.getElementById('adminManagerModal').classList.add('hidden'); }

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
            o.textContent = `${p.prefix || ''}${p.first_name} ${p.last_name}${p.position ? ' - ' + p.position : ''}`;
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
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: raw, error } = await db.from('core_module_admins')
            .select('id, user_id, created_at').eq('module_id', 'sdq');
        if (error) throw error;

        let admins = [];
        if (raw?.length) {
            const { data: plist } = await db.from('core_personnel')
                .select('id, prefix, first_name, last_name, position, department')
                .in('id', raw.map(a => a.user_id));
            const map = {}; (plist || []).forEach(p => map[p.id] = p);
            admins = raw.map(a => ({ ...a, p: map[a.user_id] })).filter(a => a.p);
        }

        const { data: supers } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');

        const div = document.getElementById('adminList');
        let html = '', count = 0;

        (supers || []).forEach(a => {
            html += `<div class="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center"><i class="fa-solid fa-crown text-amber-600"></i></div>
                    <div>
                        <div class="font-bold">${a.prefix||''}${a.first_name} ${a.last_name}</div>
                        <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold"><i class="fa-solid fa-star mr-1"></i>Super Admin</span>
                    </div>
                </div>
                <span class="text-xs text-slate-400">ถาวร</span>
            </div>`;
            count++;
        });

        admins.forEach(a => {
            const p = a.p;
            const dt = a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH') : 'ไม่ระบุ';
            html += `<div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"><i class="fa-solid fa-user-shield text-indigo-600"></i></div>
                    <div>
                        <div class="font-bold">${p.prefix||''}${p.first_name} ${p.last_name}</div>
                        <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium"><i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${dt}</span>
                    </div>
                </div>
                <button onclick="removeSDQAdmin('${a.id}', '${p.prefix||''}${p.first_name} ${p.last_name}')"
                        class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold">
                    <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                </button>
            </div>`;
            count++;
        });

        if (!html) html = `<div class="text-center text-slate-400 py-8"><i class="fa-solid fa-user-slash text-3xl mb-2"></i><p>ยังไม่มีผู้ดูแลระบบ SDQ</p></div>`;

        div.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${count} คน)`;
    } catch (err) {
        console.error(err);
        document.getElementById('adminList').innerHTML = `<div class="text-center text-rose-400 py-8"><p>โหลดข้อมูลไม่ได้</p></div>`;
    }
}

async function addSDQAdmin() {
    const select = document.getElementById('personnelSelect');
    const pid = select.tomselect ? select.tomselect.getValue() : select.value;
    if (!pid) return Swal.fire('กรุณาเลือก', '', 'warning');

    const { data: p } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name').eq('id', pid).single();
    if (!p) return Swal.fire('ผิดพลาด', 'ไม่พบบุคลากร', 'error');

    const { data: ex } = await db.from('core_module_admins')
        .select('id').eq('user_id', pid).eq('module_id', 'sdq').maybeSingle();
    if (ex) return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นแอดมิน SDQ อยู่แล้ว', 'info');

    const { error } = await db.from('core_module_admins')
        .insert({ user_id: pid, module_id: 'sdq', created_at: new Date().toISOString() });
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 2000, showConfirmButton: false });
    if (select.tomselect) select.tomselect.clear();
    await loadCurrentAdmins();
    await loadPersonnelOptions();
}

async function removeSDQAdmin(id, name) {
    const r = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `ถอดถอน <b>${name}</b> ใช่หรือไม่?`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#ef4444', confirmButtonText: 'ถอดถอน', cancelButtonText: 'ยกเลิก'
    });
    if (!r.isConfirmed) return;
    const { error } = await db.from('core_module_admins').delete().eq('id', id);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ', timer: 2000, showConfirmButton: false });
    await loadCurrentAdmins();
    await loadPersonnelOptions();
}

function refreshNavButtons() {
    const btn = document.getElementById('nav-sdq-admin-manager');
    if (btn) {
        const isAdminRole = isAdminUser(window.currentUserRole, false);
        btn.classList.toggle('hidden', !isAdminRole);
    }
}

// =======================================================
// Expose globals
// =======================================================
window.openAdminManager = openAdminManager;
window.closeAdminManager = closeAdminManager;
window.addSDQAdmin = addSDQAdmin;
window.removeSDQAdmin = removeSDQAdmin;
window.exportData = exportData;
window.importExcel = importExcel;
window.printSummaryPDF = printSummaryPDF;
window.printStudentSDQ = printStudentSDQ;
window.viewSDQ = viewSDQ;
window.deleteAllAssessments = deleteAllAssessments;
window.refreshNavButtons = refreshNavButtons;

console.log('✅ sdq_admin.js loaded (standard template)');
// behavior_dashboard.js — ระบบงานปกครอง: หน้า Dashboard
// แยกฟังก์ชันเกี่ยวกับภาพรวม (การ์ด, กราฟ, Recent Logs, Logs Modal)

let currentUser = null;
let schoolInfo = null;
let schoolStats = [];
let positiveChart = null;
let severityChart = null;
let _logsType = 'negative', _logsTab = 'day', _weekOffset = 0, _monthOffset = 0, _logsRawData = [];

// ============================================================
// เริ่มต้น
// ============================================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    console.time('⏱️ Dashboard โหลด');

    try {
        await checkAuth();
        await loadSchoolInfo();
        await loadSchoolStats(false);
        await loadDashboard();
        await initCharts();
        await renderPositiveChartForGrade('all');
        await renderSeverityChartForGrade('all');
        await loadRecentLogs();

        document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('th-TH', { 
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });

        console.timeEnd('⏱️ Dashboard โหลด');
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ============================================================
// Authentication
// ============================================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.replace('login.html'); return; }

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;

    const isAdmin = window.isAdminUser(profile.role, false);
    const hasSettings = window.canManageSettings(profile.role);

    // ✅ เพิ่มการตรวจสอบหัวหน้างานปกครองและหัวหน้าระดับ
    let isDisciplineHead = false;
    let managedGrades = [];
    const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
    if (sInfo?.current_academic_year) {
        const { data: discHead } = await db.from('core_discipline_heads')
            .select('id').eq('personnel_id', session.user.id).eq('academic_year', sInfo.current_academic_year).maybeSingle();
        isDisciplineHead = !!discHead;
    }
    const { data: gradeHeads } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', session.user.id);
    managedGrades = gradeHeads ? gradeHeads.map(g => g.grade_level) : [];

    // ✅ ควบคุมปุ่ม "จัดการนักเรียน"
    const hasAdminAccess = isAdmin || isDisciplineHead || managedGrades.length > 0;
    if (hasAdminAccess) {
        $('#btnGoToAdmin').removeClass('hidden').addClass('flex');
    } else {
        $('#btnGoToAdmin').addClass('hidden').removeClass('flex');
    }

    // แสดงปุ่มตั้งค่าเฉพาะผู้มี canManageSettings
    if (hasSettings) {
        $('#btn_settings').removeClass('hidden').addClass('flex');
    }

    // แสดงชื่อผู้ใช้
    $('#user_display').html(`<i class="fas fa-user-tie mr-2 text-blue-500"></i>ครู${profile.first_name} ${profile.last_name}`);

    // Role Label
    let roleLabel = '';
    if (profile.role === 'super_admin') {
        roleLabel = '<i class="fas fa-crown text-amber-500 mr-1"></i> Superuser';
    } else if (profile.role === 'admin') {
        roleLabel = '<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> Admin';
    } else if (isAdmin) {
        roleLabel = '<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> ผู้ดูแลระบบ';
    } else {
        roleLabel = '👀 ดูภาพรวม';
    }
    $('#role_label').html(roleLabel);

    // ปีการศึกษา
    if (sInfo) {
        $('#schoolYearBadge').text(`ปีการศึกษา ${sInfo.current_academic_year}`);
    }
}

async function logout() {
    await db.auth.signOut();
    window.location.replace('login.html');
}

// ============================================================
// โหลดข้อมูลพื้นฐาน
// ============================================================
async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    schoolInfo = data || {};
}

// ============================================================
// โหลดข้อมูลสถิติ (ใช้ Cache)
// ============================================================
let schoolStatsCache = null;
let cacheTimestamp = null;
const CACHE_EXPIRY = 5 * 60 * 1000;

async function loadSchoolStats(forceRefresh = false) {
    if (!forceRefresh && schoolStatsCache && cacheTimestamp) {
        const now = Date.now();
        if (now - cacheTimestamp < CACHE_EXPIRY) {
            console.log('✅ ใช้ข้อมูลจาก cache (', Math.round((now - cacheTimestamp) / 1000), 'วินาทีที่แล้ว)');
            schoolStats = schoolStatsCache;
            return;
        }
    }

    console.time('⏱️ loadSchoolStats (Dashboard)');
    try {
        const { data, error } = await db
            .from('behavior_student_summary')
            .select('*')
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true })
            .order('student_number', { ascending: true });

        if (error) throw error;

        schoolStats = (data || []).map(row => ({
            id: row.student_id,
            sid: row.student_id_card,
            prefix: row.prefix || '',
            firstName: row.first_name || '',
            lastName: row.last_name || '',
            fullName: row.full_name || '',
            student_number: row.student_number || 0,
            grade_level: row.grade_level || 0,
            room_number: row.room_number || '',
            roomDisplay: row.room_display || '-',
            score: row.total_score || 100,
            pos: row.pos_score || 0,
            neg: row.neg_score || 0,
            severityLevel: row.severity_level || 'sev_light',
            sevLight: row.severity_level === 'sev_light' ? 1 : 0,
            sevMedium: row.severity_level === 'sev_medium' ? 1 : 0,
            sevHeavy: row.severity_level === 'sev_heavy' ? 1 : 0,
            sevVeryHeavy: row.severity_level === 'sev_very_heavy' ? 1 : 0,
            avatar: row.avatar_students_url || null
        }));

        schoolStatsCache = schoolStats;
        cacheTimestamp = Date.now();
        console.timeEnd('⏱️ loadSchoolStats (Dashboard)');
        console.log(`✅ โหลดนักเรียน ${schoolStats.length} คน`);
    } catch (err) {
        console.error('Dashboard load error:', err);
        schoolStats = [];
    }
}

// ============================================================
// Dashboard Stats (การ์ด)
// ============================================================
function loadDashboard() {
    updateDashboardStats();
}

function updateDashboardStats() {
    const stats = getDashboardStatsFromCache();
    if (stats) {
        $('#stat_positive').text(stats.positive);
        $('#stat_negative').text(stats.negative);
        $('#stat_high').text(stats.high);
        $('#stat_low').text(stats.low);
        $('#stat_sev_light').text(stats.sevLight);
        $('#stat_sev_medium').text(stats.sevMedium);
        $('#stat_sev_heavy').text(stats.sevHeavy);
        $('#stat_sev_very_heavy').text(stats.sevVeryHeavy);
    }
}

function getDashboardStatsFromCache() {
    if (!schoolStats || schoolStats.length === 0) return null;
    return {
        positive: schoolStats.filter(s => s.pos > 0).length,
        negative: schoolStats.filter(s => s.neg > 0).length,
        high: schoolStats.filter(s => s.score > 100).length,
        low: schoolStats.filter(s => s.score < 50).length,
        sevLight: schoolStats.filter(s => s.severityLevel === 'sev_light').length,
        sevMedium: schoolStats.filter(s => s.severityLevel === 'sev_medium').length,
        sevHeavy: schoolStats.filter(s => s.severityLevel === 'sev_heavy').length,
        sevVeryHeavy: schoolStats.filter(s => s.severityLevel === 'sev_very_heavy').length
    };
}

async function refreshDashboard() {
    await loadSchoolStats(true);
    updateDashboardStats();
    renderPositiveChartForGrade('all');
    renderSeverityChartForGrade('all');
    loadRecentLogs();
    Swal.fire({ icon: 'success', title: 'รีเฟรชข้อมูลเรียบร้อย', timer: 1500, showConfirmButton: false });
}

// ============================================================
// Recent Logs
// ============================================================
async function loadRecentLogs() {
    const cols = 'id, student_id, score_change, created_at, behavior_criteria(title), recorder:core_personnel!recorder_id(prefix, first_name, last_name), student:core_students!student_id(student_id_card, first_name, last_name, student_enrollments(student_number, core_classrooms(grade_level, room_number)))';
    try {
        const [posRes, negRes] = await Promise.all([
            db.from('behavior_logs').select(cols).gt('score_change', 0).order('created_at', { ascending: false }).limit(10),
            db.from('behavior_logs').select(cols).lt('score_change', 0).order('created_at', { ascending: false }).limit(10)
        ]);
        renderRecentTable('recent_positive_body', posRes.data || [], 'positive');
        renderRecentTable('recent_negative_body', negRes.data || [], 'negative');
    } catch (err) {
        console.error('loadRecentLogs error:', err);
    }
}

function renderRecentTable(tbodyId, logs, type) {
    if (!logs.length) {
        $('#' + tbodyId).html('<tr><td colspan="7" class="py-6 text-center text-slate-300">ยังไม่มีรายการ</td></tr>');
        return;
    }
    const isPos = type === 'positive';
    let html = '';
    logs.forEach(function (log) {
        const date = new Date(log.created_at).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const student = log.student || {};
        const enroll = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments;
        const classroom = enroll?.core_classrooms || {};
        const room = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
        const sid = student.student_id_card || '-';
        const fullName = ((student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-';
        const criteria = log.behavior_criteria?.title || '-';
        const scoreVal = (isPos ? '+' : '') + log.score_change;
        const scoreClass = isPos ? 'text-green-600 font-black' : 'text-red-600 font-black';
        const rec = log.recorder ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name : '-';
        html += `<tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition" onclick="closeLogsModal(); setTimeout(()=>viewHistory('${log.student_id}'), 300)" title="ดูประวัติ ${fullName}">
            <td class="py-2 pr-2 text-slate-400 whitespace-nowrap">${date}</td>
            <td class="py-2 pr-2 whitespace-nowrap">${room}</td>
            <td class="py-2 pr-2 text-slate-500">${sid}</td>
            <td class="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">${fullName}</td>
            <td class="py-2 pr-2 text-slate-500 max-w-[120px] truncate" title="${criteria}">${criteria}</td>
            <td class="py-2 pr-2 text-center ${scoreClass}">${scoreVal}</td>
            <td class="py-2 text-slate-400 whitespace-nowrap">${rec}</td>
         </tr>`;
    });
    $('#' + tbodyId).html(html);
}

// ============================================================
// Charts
// ============================================================
function initCharts() {
    const posCtx = document.getElementById('positiveChart');
    if (posCtx && !positiveChart) {
        positiveChart = new Chart(posCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'],
                datasets: [{
                    label: 'จำนวนครั้งทำความดี',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: '#22c55e',
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.raw} ครั้ง` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const sevCtx = document.getElementById('severityChart');
    if (sevCtx && !severityChart) {
        severityChart = new Chart(sevCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['กลุ่ม 1\n(90+ คะแนน)', 'กลุ่ม 2\n(60-89 คะแนน)', 'กลุ่ม 3\n(30-59 คะแนน)', 'กลุ่ม 4\n(<30 คะแนน)'],
                datasets: [{
                    label: 'จำนวนนักเรียน (คน)',
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#fbbf24', '#f97316', '#ef4444', '#7c3aed'],
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.raw} คน`,
                            title: ctx => ctx[0].label.replace('\n', ' ')
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderPositiveChartForGrade(grade) {
    document.querySelectorAll('.pos-grade-btn').forEach(btn => {
        const active = btn.dataset.posGrade === String(grade);
        btn.classList.remove('bg-blue-600', 'text-white', 'bg-slate-100');
        btn.classList.add(active ? 'bg-blue-600' : 'bg-slate-100');
        if (active) btn.classList.add('text-white');
        else btn.classList.remove('text-white');
    });
    let targetGrades = (grade === 'all') ? [1, 2, 3, 4, 5, 6] : [parseInt(grade)];
    const data = [0, 0, 0, 0, 0, 0];
    for (let g of targetGrades) {
        const studentsInGrade = schoolStats.filter(s => s.grade_level === g);
        const totalPos = studentsInGrade.reduce((sum, s) => sum + (s.pos || 0), 0);
        data[g - 1] = totalPos;
    }
    if (positiveChart) {
        positiveChart.data.datasets[0].data = data;
        positiveChart.data.datasets[0].label = (grade === 'all') ? 'จำนวนครั้งทำความดีทั้งโรงเรียน' : `จำนวนครั้งทำความดี ม.${grade}`;
        positiveChart.update();
    }
}

function renderSeverityChartForGrade(grade) {
    document.querySelectorAll('.sev-grade-btn').forEach(btn => {
        const active = btn.dataset.sevGrade === String(grade);
        btn.classList.remove('bg-blue-600', 'text-white', 'bg-slate-100');
        btn.classList.add(active ? 'bg-blue-600' : 'bg-slate-100');
        if (active) btn.classList.add('text-white');
        else btn.classList.remove('text-white');
    });
    const src = (grade === 'all') ? schoolStats : schoolStats.filter(s => s.grade_level === parseInt(grade));
    if (severityChart) {
        severityChart.data.datasets[0].data = [
            src.filter(s => s.severityLevel === 'sev_light').length,
            src.filter(s => s.severityLevel === 'sev_medium').length,
            src.filter(s => s.severityLevel === 'sev_heavy').length,
            src.filter(s => s.severityLevel === 'sev_very_heavy').length
        ];
        severityChart.data.datasets[0].label = (grade === 'all') ? 'จำนวนนักเรียนทั้งโรงเรียน (คน)' : `จำนวนนักเรียน ม.${grade} (คน)`;
        severityChart.update();
    }
}

// ============================================================
// View History (สำหรับ recent logs)
// ============================================================
function viewHistory(studentId) {
    window.open(`student_history.html?id=${studentId}`, '_blank');
}

// ============================================================
// Logs Modal
// ============================================================
function openLogsModal(type) {
    _logsType = type;
    _weekOffset = 0;
    _monthOffset = 0;
    const isPos = type === 'positive';
    $('#logsModalIcon').html(isPos ? '<i class="fas fa-star text-green-600"></i>' : '<i class="fas fa-exclamation-triangle text-red-600"></i>')
        .removeClass('bg-green-100 bg-red-100').addClass(isPos ? 'bg-green-100' : 'bg-red-100');
    $('#logsModalTitle').text(isPos ? 'บันทึกทำความดี' : 'บันทึกผิดระเบียบ');
    $('#logsCountBadge').removeClass('bg-green-100 text-green-700 bg-red-100 text-red-700')
        .addClass(isPos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700');
    const today = new Date().toISOString().slice(0, 10);
    $('#logsPickerDay').val(today);
    setLogsTab('day');
    $('#logsModal').removeClass('hidden').addClass('flex');
}

function closeLogsModal() {
    $('#logsModal').addClass('hidden').removeClass('flex');
}

function setLogsTab(tab) {
    _logsTab = tab;
    _weekOffset = 0;
    _monthOffset = 0;
    ['day', 'week', 'month'].forEach(t => {
        $('#logsTab' + t.charAt(0).toUpperCase() + t.slice(1)).toggleClass('active', t === tab);
    });
    $('#filterDay').toggleClass('hidden', tab !== 'day').toggleClass('flex', tab === 'day');
    $('#filterWeek').toggleClass('hidden', tab !== 'week').toggleClass('flex', tab === 'week');
    $('#filterMonth').toggleClass('hidden', tab !== 'month').toggleClass('flex', tab === 'month');
    if (tab === 'week') updateWeekLabel();
    if (tab === 'month') updateMonthLabel();
    fetchLogsData();
}

function getWeekRange(offset) {
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + offset * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: mon, end: sun };
}

function updateWeekLabel() {
    const { start, end } = getWeekRange(_weekOffset);
    const fmt = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    const label = _weekOffset === 0 ? 'สัปดาห์นี้' : (_weekOffset === -1 ? 'สัปดาห์ที่แล้ว' : '');
    $('#logsWeekLabel').text((label ? label + '  ' : '') + fmt(start) + ' – ' + fmt(end));
}

function shiftWeek(dir) {
    _weekOffset += dir;
    updateWeekLabel();
    fetchLogsData();
}

function getMonthRange(offset) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + offset;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start, end };
}

function updateMonthLabel() {
    const { start } = getMonthRange(_monthOffset);
    const label = start.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const rel = _monthOffset === 0 ? ' (เดือนนี้)' : (_monthOffset === -1 ? ' (เดือนที่แล้ว)' : '');
    $('#logsMonthLabel').text(label + rel);
}

function shiftMonth(dir) {
    _monthOffset += dir;
    updateMonthLabel();
    fetchLogsData();
}

async function fetchLogsData() {
    $('#logsLoading').removeClass('hidden').addClass('flex');
    $('#logsEmpty').removeClass('flex').addClass('hidden');
    $('#logsTableWrap').addClass('hidden');
    $('#logsCountBadge').addClass('hidden');
    $('#logsModalSub').text('กำลังโหลด...');
    let dateStart, dateEnd;
    const pad = n => String(n).padStart(2, '0');
    const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (_logsTab === 'day') {
        const val = $('#logsPickerDay').val();
        if (!val) { showLogsEmpty(); return; }
        dateStart = val + 'T00:00:00';
        dateEnd = val + 'T23:59:59';
    } else if (_logsTab === 'week') {
        const { start, end } = getWeekRange(_weekOffset);
        dateStart = toISO(start) + 'T00:00:00';
        dateEnd = toISO(end) + 'T23:59:59';
    } else {
        const { start, end } = getMonthRange(_monthOffset);
        dateStart = toISO(start) + 'T00:00:00';
        dateEnd = toISO(end) + 'T23:59:59';
    }
    const cols = 'id, student_id, score_change, created_at, behavior_criteria(title), recorder:core_personnel!recorder_id(prefix, first_name, last_name), student:core_students!student_id(student_id_card, first_name, last_name, student_enrollments(student_number, core_classrooms(grade_level, room_number)))';
    try {
        let query = db.from('behavior_logs').select(cols).gte('created_at', dateStart).lte('created_at', dateEnd).order('created_at', { ascending: false });
        if (_logsType === 'positive') query = query.gt('score_change', 0);
        else query = query.lt('score_change', 0);
        const { data, error } = await query;
        $('#logsLoading').addClass('hidden').removeClass('flex');
        if (error) throw error;
        if (!data || data.length === 0) { showLogsEmpty(); return; }
        const subMap = { day: 'วันที่ ' + (dateStart.slice(0, 10)), week: $('#logsWeekLabel').text(), month: $('#logsMonthLabel').text() };
        $('#logsModalSub').text(subMap[_logsTab]);
        $('#logsCountBadge').text(data.length + ' รายการ').removeClass('hidden');
        renderLogsModalTable(data);
    } catch (err) {
        $('#logsLoading').addClass('hidden').removeClass('flex');
        console.error(err);
        showLogsEmpty();
    }
}

function showLogsEmpty() {
    $('#logsLoading').addClass('hidden').removeClass('flex');
    $('#logsTableWrap').addClass('hidden');
    $('#logsCountBadge').addClass('hidden');
    $('#logsExportBtn').addClass('hidden').removeClass('flex');
    $('#logsEmpty').removeClass('hidden').addClass('flex');
    $('#logsModalSub').text('ไม่พบข้อมูล');
}

function renderLogsModalTable(logs) {
    _logsRawData = logs;
    const isPos = _logsType === 'positive';
    let html = '';
    logs.forEach(function (log) {
        const date = new Date(log.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        const student = log.student || {};
        const enroll = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments;
        const classroom = enroll?.core_classrooms || {};
        const room = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
        const sid = student.student_id_card || '-';
        const fullName = ((student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-';
        const criteria = log.behavior_criteria?.title || '-';
        const scoreVal = (isPos ? '+' : '') + log.score_change;
        const scoreClass = isPos ? 'bg-green-100 text-green-700 font-black px-2 py-0.5 rounded-lg' : 'bg-red-100 text-red-700 font-black px-2 py-0.5 rounded-lg';
        const rec = log.recorder ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name : '-';
        html += `<tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition" onclick="closeLogsModal(); setTimeout(()=>viewHistory('${log.student_id}'), 300)" title="ดูประวัติ ${fullName}">
            <td class="py-3 px-4 text-slate-400 whitespace-nowrap text-xs">${date}</td>
            <td class="py-3 px-4 whitespace-nowrap font-medium text-slate-600 text-xs">${room}</td>
            <td class="py-3 px-4 text-slate-500 text-xs">${sid}</td>
            <td class="py-3 px-4 font-bold text-blue-800 whitespace-nowrap">${fullName}</td>
            <td class="py-3 px-4 text-slate-500 truncate text-xs" title="${criteria}">${criteria}</td>
            <td class="py-3 px-4 text-center"><span class="${scoreClass}">${scoreVal}</span></td>
            <td class="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">${rec}</td>
        </tr>`;
    });
    $('#logsTableBody').html(html);
    $('#logsTableWrap').removeClass('hidden').addClass('flex').css('flex-direction', 'column');
    $('#logsExportBtn').removeClass('hidden').addClass('flex');
}

function exportLogsModal() {
    if (!_logsRawData.length) return;
    const isPos = _logsType === 'positive';
    const typeLabel = isPos ? 'ทำความดี' : 'ผิดระเบียบ';
    const pad = n => String(n).padStart(2, '0');
    let periodLabel = '';
    if (_logsTab === 'day') {
        periodLabel = $('#logsPickerDay').val() || 'รายวัน';
    } else if (_logsTab === 'week') {
        const { start, end } = getWeekRange(_weekOffset);
        const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        periodLabel = `สัปดาห์_${fmt(start)}-${fmt(end)}`;
    } else {
        periodLabel = $('#logsMonthLabel').text().replace(/\s*\(.*\)/, '').trim();
    }
    const fileName = `บันทึก${typeLabel}_${periodLabel}.xlsx`;
    const sheetName = `${typeLabel} (${periodLabel})`.slice(0, 31);
    const exportData = _logsRawData.map(log => {
        const student = log.student || {};
        const enroll = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments;
        const classroom = enroll?.core_classrooms || {};
        const room = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
        const rec = log.recorder ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name : '-';
        const dateStr = new Date(log.created_at).toLocaleString('th-TH');
        return {
            'วันที่/เวลา': dateStr,
            'ชั้นเรียน': room,
            'เลขประจำตัว': student.student_id_card || '-',
            'ชื่อ-สกุล': ((student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-',
            'รายการ': log.behavior_criteria?.title || '-',
            'คะแนน': log.score_change,
            'ผู้บันทึก': rec
        };
    });
    _writeExcel(exportData, fileName, sheetName);
}

function _writeExcel(exportData, fileName, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const cols = Object.keys(exportData[0] || {}).map(key => ({ wch: Math.max(key.length * 2, 12) }));
    worksheet['!cols'] = cols;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(workbook, fileName);
    Swal.close();
}
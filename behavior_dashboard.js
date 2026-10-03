// ==========================================================================
// behavior_dashboard.js — ระบบงานปกครอง: หน้า Dashboard (Lazy Load)
// ==========================================================================

let currentUser = null;
let actualRole = '';
let isAdminMode = false;
let isDisciplineHead = false;
let managedGrades = [];
let schoolInfo = null;

// ── Lazy Load State ──
let dashboardCounts = [];          // 6 rows aggregate (ใช้กับการ์ด + charts)
let schoolStats = [];              // 3,099 rows — lazy โหลด
let schoolStatsLoaded = false;     // flag: โหลดรายชื่อแล้วหรือยัง
let schoolStatsLoading = null;     // Promise ของการโหลด (กัน concurrent)

let positiveChart = null;
let severityChart = null;
let _logsType = 'negative', _logsTab = 'day', _weekOffset = 0, _monthOffset = 0, _logsRawData = [];

// ── Filtered Students Modal State ──
let _filteredStudentsTable = null;
let _currentFilterType = null;
let _currentFilterData = [];

// ============================================================
// Init (Optimized + Lazy Load)
// ============================================================
$(document).ready(async function () {
    const t0 = performance.now();
    console.time('⏱️ Dashboard โหลด');

    try {
        // ─── 1. Session ───
        const session = await checkSessionAndRole('ระบบงานปกครอง (Dashboard)');
        if (!session) return;

        const { user, personnel, role, isAdmin, isAdminMode: sessionMode } = session;
        currentUser = personnel;
        actualRole = role;
        isAdminMode = sessionMode;

        // ─── 2. โชว์ UI ทันที ───
        setUserDisplayName(personnel);
        updateUserRoleLabel(role);
        renderUserAvatar(personnel);
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

        // ─── 3. โหลดข้อมูลเบา ๆ พร้อมกัน ───
        const [sInfo] = await Promise.all([
            loadPermissionsAndNav(session, user),
            loadSchoolInfo(),
            loadDashboardCounts()          // ✅ เบา ๆ 6 rows
        ]);

        if (sInfo) $('#schoolYearBadge').text(`(ปี ${sInfo.current_academic_year})`);

        // ─── 4. Render การ์ด + Charts ───
        updateDashboardStats();
        initCharts();
        renderPositiveChartForGrade('all');
        renderSeverityChartForGrade('all');

        // ─── 5. Recent logs (fire-and-forget) ───
        loadRecentLogs();

        // ─── 6. Escape key ───
        $(document).on('keydown', function (e) {
            if (e.key === 'Escape') {
                if (!$('#filteredStudentsModal').hasClass('hidden')) {
                    closeFilteredStudentsModal();
                } else if (!$('#logsModal').hasClass('hidden')) {
                    closeLogsModal();
                }
            }
        });

        // ─── 7. Log (fire-and-forget) ───
        logUserAction('เข้าสู่หน้า Dashboard งานปกครอง', 'behavior');

        document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        console.timeEnd('⏱️ Dashboard โหลด');
        console.log(`⚡ รวมเวลา: ${Math.round(performance.now() - t0)} ms`);

    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ============================================================
// โหลดสิทธิ์ + Sidebar
// ============================================================
async function loadPermissionsAndNav(session, user) {
    const { role, isAdmin } = session;

    const [sInfoRes, discHeadRes, gradeHeadsRes, adviserRoomRes] = await Promise.all([
        db.from('core_school_info').select('current_academic_year').single(),
        db.from('core_discipline_heads').select('id').eq('personnel_id', user.id).limit(1).maybeSingle(),
        db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', user.id),
        db.from('core_classrooms').select('id')
            .or(`adviser_id_1.eq.${user.id},adviser_id_2.eq.${user.id}`)
            .limit(1).maybeSingle()
    ]);

    const sInfo = sInfoRes.data;
    isDisciplineHead = !!discHeadRes.data;
    managedGrades = gradeHeadsRes.data ? gradeHeadsRes.data.map(g => g.grade_level) : [];
    const hasClassroom = !!adviserRoomRes.data;

    if (!isAdmin) {
        const hasAccess = await hasModuleAccess(role, 'behavior', user.id);
        const hasSpecialAccess = isDisciplineHead || managedGrades.length > 0 || hasClassroom;
        if (!hasAccess && !hasSpecialAccess) {
            await Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้งานระบบงานปกครอง',
                confirmButtonText: 'กลับหน้าหลัก'
            });
            window.location.href = 'index.html';
            throw new Error('No permission');
        }
    }

    const hasAdminAccess = isAdmin || isDisciplineHead || managedGrades.length > 0;
    if (hasAdminAccess) {
        $('#navDashboard').removeClass('hidden').addClass('active');
        $('#navAdmin').removeClass('hidden');
        $('#btnModeAdmin').removeClass('hidden').addClass('flex');
    }
    if (hasClassroom) {
        $('#navTeacher').removeClass('hidden');
        $('#btnModeTeacher').removeClass('hidden').addClass('flex');
    }
    if (canManageSettings(role) || isDisciplineHead) {
        $('#navSettings').removeClass('hidden');
    }

    return sInfo;
}

// ============================================================
// Logout
// ============================================================
async function logout() {
    if (typeof handleLogout === 'function') return handleLogout();
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

// ============================================================
// โหลดข้อมูลโรงเรียน
// ============================================================
async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    schoolInfo = data || {};
}

// ============================================================
// ⚡ โหลด Dashboard Counts (เบา ๆ — 6 rows)
// ============================================================
async function loadDashboardCounts() {
    const t0 = performance.now();
    try {
        const { data, error } = await db.from('behavior_dashboard_stats').select('*');
        if (error) throw error;

        dashboardCounts = data || [];
        console.log(`✅ โหลด counts ${dashboardCounts.length} grades ใน ${Math.round(performance.now() - t0)} ms`);
        return dashboardCounts;
    } catch (err) {
        console.error('loadDashboardCounts error:', err);
        dashboardCounts = [];
        return [];
    }
}

// ============================================================
// ⚡ Lazy: โหลดรายชื่อ (3,099 rows) — เฉพาะเมื่อจำเป็น
// ============================================================
async function ensureSchoolStats() {
    if (schoolStatsLoaded && schoolStats.length > 0) {
        console.log('✅ ใช้ schoolStats ที่โหลดไว้แล้ว');
        return schoolStats;
    }

    // ถ้ากำลังโหลดอยู่ → รอ Promise เดิม
    if (schoolStatsLoading) {
        console.log('⏳ รอ schoolStats ที่กำลังโหลด...');
        return schoolStatsLoading;
    }

    // เริ่มโหลดครั้งแรก
    schoolStatsLoading = (async () => {
        const t0 = performance.now();
        Swal.fire({
            title: 'กำลังโหลดรายชื่อ...',
            html: `<p class="text-sm text-slate-500">รอสักครู่ ระบบกำลังดึงข้อมูลนักเรียนทั้งโรงเรียน</p>`,
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });

        try {
            const { data, error } = await db
                .from('behavior_student_summary')
                .select('student_id, student_id_card, prefix, first_name, last_name, full_name, student_number, grade_level, room_number, room_display, total_score, pos_score, neg_score, severity_level, avatar_students_url')
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

            schoolStatsLoaded = true;
            Swal.close();
            console.log(`✅ Lazy load ${schoolStats.length} คน ใน ${Math.round(performance.now() - t0)} ms`);
            return schoolStats;

        } catch (err) {
            console.error('ensureSchoolStats error:', err);
            Swal.close();
            schoolStats = [];
            return [];
        } finally {
            schoolStatsLoading = null;
        }
    })();

    return schoolStatsLoading;
}

// ============================================================
// Dashboard Stats — ใช้ค่าจาก dashboardCounts (ไม่ต้องใช้ schoolStats)
// ============================================================
function loadDashboard() { updateDashboardStats(); }

function updateDashboardStats() {
    if (!dashboardCounts || dashboardCounts.length === 0) return;

    let positive = 0, negative = 0, high = 0, low = 0;
    let sevLight = 0, sevMedium = 0, sevHeavy = 0, sevVeryHeavy = 0;

    dashboardCounts.forEach(g => {
        positive += Number(g.positive_count) || 0;
        negative += Number(g.negative_count) || 0;
        high += Number(g.high_count) || 0;
        low += Number(g.low_count) || 0;
        sevLight += Number(g.sev_light_count) || 0;
        sevMedium += Number(g.sev_medium_count) || 0;
        sevHeavy += Number(g.sev_heavy_count) || 0;
        sevVeryHeavy += Number(g.sev_very_heavy_count) || 0;
    });

    $('#stat_positive').text(positive.toLocaleString());
    $('#stat_negative').text(negative.toLocaleString());
    $('#stat_high').text(high.toLocaleString());
    $('#stat_low').text(low.toLocaleString());
    $('#stat_sev_light').text(sevLight.toLocaleString());
    $('#stat_sev_medium').text(sevMedium.toLocaleString());
    $('#stat_sev_heavy').text(sevHeavy.toLocaleString());
    $('#stat_sev_very_heavy').text(sevVeryHeavy.toLocaleString());
}

async function refreshDashboard() {
    Swal.fire({ title: 'กำลังรีเฟรช...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // ✅ Reset lazy flag เพื่อให้โหลดใหม่ครั้งถัดไป
    schoolStatsLoaded = false;
    schoolStats = [];

    await loadDashboardCounts();
    updateDashboardStats();
    renderPositiveChartForGrade('all');
    renderSeverityChartForGrade('all');

    loadRecentLogs();

    logUserAction('รีเฟรช Dashboard', 'behavior');

    Swal.fire({ icon: 'success', title: 'รีเฟรชข้อมูลเรียบร้อย', timer: 1500, showConfirmButton: false });
}

// ============================================================
// Charts — ใช้ค่าจาก dashboardCounts โดยตรง (ไม่ต้อง lazy load)
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
                    tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toLocaleString()} ครั้ง` } }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, callback: (v) => Number(v).toLocaleString() },
                        grid: { color: '#f1f5f9' }
                    },
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
                            label: ctx => ` ${ctx.raw.toLocaleString()} คน`,
                            title: ctx => ctx[0].label.replace('\n', ' ')
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, callback: (v) => Number(v).toLocaleString() },
                        grid: { color: '#f1f5f9' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderPositiveChartForGrade(grade) {
    const sel = document.getElementById('posGradeSelect');
    if (sel) sel.value = String(grade);

    const data = [0, 0, 0, 0, 0, 0];
    const countsMap = {};
    dashboardCounts.forEach(g => { countsMap[g.grade_level] = g; });

    if (grade === 'all') {
        for (let g = 1; g <= 6; g++) {
            const row = countsMap[g];
            data[g - 1] = row ? Number(row.total_pos_score) || 0 : 0;
        }
    } else {
        const row = countsMap[parseInt(grade)];
        data[parseInt(grade) - 1] = row ? Number(row.total_pos_score) || 0 : 0;
    }

    if (positiveChart) {
        positiveChart.data.datasets[0].data = data;
        positiveChart.data.datasets[0].label = (grade === 'all') ? 'จำนวนครั้งทำความดีทั้งโรงเรียน' : `จำนวนครั้งทำความดี ม.${grade}`;
        positiveChart.update();
    }
}

function renderSeverityChartForGrade(grade) {
    const sel = document.getElementById('sevGradeSelect');
    if (sel) sel.value = String(grade);

    let sevLight = 0, sevMedium = 0, sevHeavy = 0, sevVeryHeavy = 0;

    if (grade === 'all') {
        dashboardCounts.forEach(g => {
            sevLight += Number(g.sev_light_count) || 0;
            sevMedium += Number(g.sev_medium_count) || 0;
            sevHeavy += Number(g.sev_heavy_count) || 0;
            sevVeryHeavy += Number(g.sev_very_heavy_count) || 0;
        });
    } else {
        const row = dashboardCounts.find(g => g.grade_level === parseInt(grade));
        if (row) {
            sevLight = Number(row.sev_light_count) || 0;
            sevMedium = Number(row.sev_medium_count) || 0;
            sevHeavy = Number(row.sev_heavy_count) || 0;
            sevVeryHeavy = Number(row.sev_very_heavy_count) || 0;
        }
    }

    if (severityChart) {
        severityChart.data.datasets[0].data = [sevLight, sevMedium, sevHeavy, sevVeryHeavy];
        severityChart.data.datasets[0].label = (grade === 'all') ? 'จำนวนนักเรียนทั้งโรงเรียน (คน)' : `จำนวนนักเรียน ม.${grade} (คน)`;
        severityChart.update();
    }
}

// ============================================================
// Recent Logs
// ============================================================
async function loadRecentLogs() {
    const cols = 'id, student_id, score_change, created_at, behavior_criteria(title), recorder:core_personnel!recorder_id(prefix, first_name, last_name), student:core_students!student_id(student_id_card, first_name, last_name, avatar_students_url, student_enrollments(student_number, core_classrooms(grade_level, room_number)))';
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
        $('#' + tbodyId).html('<tr><td colspan="8" class="py-6 text-center text-slate-300">ยังไม่มีรายการ</td></tr>');
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
        const av = renderStudentAvatar(student, { size: 28, name: fullName });

        html += `<tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition"
                     onclick="viewHistory('${log.student_id}')" title="ดูประวัติ ${fullName}">
            <td class="py-2 pr-2">${av}</td>
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
// View History
// ============================================================
function viewHistory(studentId) {
    window.open(`behavior_history.html?id=${studentId}`, '_blank');
}

// ============================================================
// 🎯 Filtered Students Modal — Lazy Load
// ============================================================
function getFilterConfig(type) {
    const configs = {
        positive:        { title: 'นักเรียนทำความดี',              icon: 'fa-star',                  bgClass: 'bg-green-100',  textClass: 'text-green-700'  },
        negative:        { title: 'นักเรียนผิดระเบียบ',            icon: 'fa-exclamation-triangle',  bgClass: 'bg-red-100',    textClass: 'text-red-700'    },
        high:            { title: 'นักเรียนคะแนน > 100',           icon: 'fa-arrow-up',              bgClass: 'bg-blue-100',   textClass: 'text-blue-700'   },
        low:             { title: 'นักเรียนคะแนน < 50 (เสี่ยง)',    icon: 'fa-arrow-down',            bgClass: 'bg-orange-100', textClass: 'text-orange-700' },
        sev_light:       { title: '⭐ กลุ่ม 1 (90+ คะแนน)',         icon: 'fa-star',                  bgClass: 'bg-amber-100',  textClass: 'text-amber-700'  },
        sev_medium:      { title: '🔶 กลุ่ม 2 (60-89 คะแนน)',      icon: 'fa-circle',                bgClass: 'bg-orange-100', textClass: 'text-orange-700' },
        sev_heavy:       { title: '🔴 กลุ่ม 3 (30-59 คะแนน)',      icon: 'fa-triangle-exclamation',  bgClass: 'bg-red-100',    textClass: 'text-red-700'    },
        sev_very_heavy:  { title: '🚨 กลุ่ม 4 (ต่ำกว่า 30 คะแนน)', icon: 'fa-skull',                 bgClass: 'bg-violet-100', textClass: 'text-violet-700' }
    };
    return configs[type] || { title: 'รายชื่อนักเรียน', icon: 'fa-users', bgClass: 'bg-slate-100', textClass: 'text-slate-700' };
}

function filterStudentsByType(stats, type) {
    switch (type) {
        case 'positive':        return stats.filter(s => s.pos > 0);
        case 'negative':        return stats.filter(s => s.neg > 0);
        case 'high':            return stats.filter(s => s.score > 100);
        case 'low':             return stats.filter(s => s.score < 50);
        case 'sev_light':       return stats.filter(s => s.severityLevel === 'sev_light');
        case 'sev_medium':      return stats.filter(s => s.severityLevel === 'sev_medium');
        case 'sev_heavy':       return stats.filter(s => s.severityLevel === 'sev_heavy');
        case 'sev_very_heavy':  return stats.filter(s => s.severityLevel === 'sev_very_heavy');
        default:                return stats;
    }
}

async function openFilteredStudentsModal(type) {
    const config = getFilterConfig(type);

    // เปิด Modal ทันที (แสดง loading ก่อน)
    $('#filteredStudentsModalIcon')
        .html(`<i class="fas ${config.icon}"></i>`)
        .removeClass('bg-green-100 bg-red-100 bg-blue-100 bg-orange-100 bg-amber-100 bg-violet-100 bg-slate-100')
        .addClass(config.bgClass);
    $('#filteredStudentsTitle')
        .text(config.title)
        .removeClass('text-green-700 text-red-700 text-blue-700 text-orange-700 text-amber-700 text-violet-700 text-slate-700')
        .addClass(config.textClass);
    $('#filteredStudentsSub').html('กำลังโหลดข้อมูล...');
    $('#filteredStudentsSearch').val('');
    $('#filteredStudentsBody').html('<tr><td colspan="7" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin text-3xl mb-2 block text-blue-400"></i>กำลังโหลดรายชื่อ...</td></tr>');
    $('#filteredStudentsModal').removeClass('hidden').addClass('flex');

    // ⚡ Lazy load ถ้ายังไม่มีข้อมูล
    await ensureSchoolStats();

    _currentFilterType = type;
    _currentFilterData = filterStudentsByType(schoolStats, type);

    $('#filteredStudentsSub').html(
        `พบนักเรียน <span class="font-bold text-slate-600">${_currentFilterData.length.toLocaleString()}</span> คน · จากทั้งหมด ${schoolStats.length.toLocaleString()} คน`
    );

    renderFilteredStudentsTable();
    logUserAction(`เปิดดูรายชื่อ: ${config.title}`, 'behavior');
}

function closeFilteredStudentsModal() {
    $('#filteredStudentsModal').addClass('hidden').removeClass('flex');
    if (_filteredStudentsTable) {
        try { _filteredStudentsTable.destroy(); } catch (e) {}
        _filteredStudentsTable = null;
    }
    _currentFilterType = null;
    _currentFilterData = [];
}

function renderFilteredStudentsTable() {
    const tbody = document.getElementById('filteredStudentsBody');
    if (!tbody) return;

    if ($.fn.DataTable.isDataTable('#filteredStudentsTable')) {
        try { $('#filteredStudentsTable').DataTable().destroy(); } catch (e) {}
    }

    const sorted = [..._currentFilterData].sort((a, b) =>
        (a.grade_level || 0) - (b.grade_level || 0) ||
        (a.room_number || 0) - (b.room_number || 0) ||
        (a.student_number || 0) - (b.student_number || 0)
    );

    let html = '';
    if (sorted.length === 0) {
        html = '<tr><td colspan="7" class="text-center py-12 text-slate-400 font-bold"><i class="fas fa-inbox text-4xl mb-2 block text-slate-300"></i>ไม่พบนักเรียนตามเงื่อนไข</td></tr>';
    } else {
        sorted.forEach(s => {
            const scoreClass = s.score < 50 ? 'bg-red-100 text-red-600'
                : (s.score >= 100 ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-600');

            const avatarHtml = renderStudentAvatar(
                { avatar_students_url: s.avatar, first_name: s.firstName, last_name: s.lastName },
                { size: 32, name: s.fullName }
            );

            html += `
                <tr class="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition"
                    onclick="viewHistory('${s.id}')" title="ดูประวัติ">
                    <td class="py-3 px-3">${avatarHtml}</td>
                    <td class="py-3 px-3 text-center font-medium text-slate-600 whitespace-nowrap">${s.roomDisplay}</td>
                    <td class="py-3 px-3 text-center font-bold text-slate-600">${s.student_number || '-'}</td>
                    <td class="py-3 px-3 text-slate-500 whitespace-nowrap">${s.sid}</td>
                    <td class="py-3 px-3 font-bold text-blue-800">${s.fullName}</td>
                    <td class="py-3 px-3 text-center">
                        <span class="px-3 py-1 rounded-lg text-sm font-black ${scoreClass}">${s.score}</span>
                    </td>
                    <td class="py-3 px-3 text-center">
                        <button onclick="event.stopPropagation(); viewHistory('${s.id}')"
                                class="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 transition shadow-sm">
                            <i class="fas fa-eye mr-1"></i> ประวัติ
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;

    _filteredStudentsTable = $('#filteredStudentsTable').DataTable({
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[1, 'asc'], [2, 'asc']],
        columnDefs: [
            { orderable: false, targets: [0, 6] },
            { responsivePriority: 1, targets: 4 },
            { responsivePriority: 2, targets: 5 },
            { responsivePriority: 3, targets: 6 }
        ]
    });
}

function searchFilteredStudents() {
    if (!_filteredStudentsTable) return;
    const val = $('#filteredStudentsSearch').val() || '';
    _filteredStudentsTable.search(val).draw();
}

async function exportFilteredStudents() {
    // ⚡ Lazy load ถ้ายังไม่มีข้อมูล
    await ensureSchoolStats();

    if (!_currentFilterData || _currentFilterData.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบนักเรียนในกลุ่มนี้', 'warning');
        return;
    }

    const config = getFilterConfig(_currentFilterType);
    const sorted = [..._currentFilterData].sort((a, b) =>
        (a.grade_level || 0) - (b.grade_level || 0) ||
        (a.room_number || 0) - (b.room_number || 0) ||
        (a.student_number || 0) - (b.student_number || 0)
    );

    const exportData = sorted.map(s => ({
        'ชั้นเรียน': s.roomDisplay,
        'เลขที่': s.student_number || '-',
        'เลขประจำตัว': s.sid,
        'ชื่อ-นามสกุล': s.fullName,
        'คะแนนปัจจุบัน': s.score,
        'คะแนนทำดี (รวม)': s.pos,
        'คะแนนผิดระเบียบ (รวม)': s.neg
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = Object.keys(exportData[0] || {}).map(k => ({ wch: Math.max(k.length * 2, 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อ');

    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const safeTitle = config.title.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    XLSX.writeFile(wb, `${safeTitle}_${dateStr}.xlsx`);

    logUserAction(`ส่งออกรายชื่อ: ${config.title}`, 'behavior');
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', timer: 1500, showConfirmButton: false });
}

function goToAdminWithFilter() {
    const type = _currentFilterType;
    closeFilteredStudentsModal();
    setTimeout(() => {
        window.location.href = `behavior_admin.html?filter=${type}`;
    }, 200);
}

// ============================================================
// Logs Modal (ไม่เปลี่ยน)
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

    const cols = 'id, student_id, score_change, created_at, behavior_criteria(title), recorder:core_personnel!recorder_id(prefix, first_name, last_name), student:core_students!student_id(student_id_card, first_name, last_name, avatar_students_url, student_enrollments(student_number, core_classrooms(grade_level, room_number)))';
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
        const av = renderStudentAvatar(student, { size: 30, name: fullName });

        html += `<tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition"
                     onclick="closeLogsModal(); setTimeout(()=>viewHistory('${log.student_id}'), 300)" title="ดูประวัติ ${fullName}">
            <td class="py-3 px-2 text-center">${av}</td>
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
    logUserAction(`ส่งออก Logs ${fileName}`, 'behavior');
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

// ============================================================
// Expose global
// ============================================================
window.openLogsModal = openLogsModal;
window.closeLogsModal = closeLogsModal;
window.setLogsTab = setLogsTab;
window.shiftWeek = shiftWeek;
window.shiftMonth = shiftMonth;
window.exportLogsModal = exportLogsModal;
window.viewHistory = viewHistory;
window.refreshDashboard = refreshDashboard;
window.renderPositiveChartForGrade = renderPositiveChartForGrade;
window.renderSeverityChartForGrade = renderSeverityChartForGrade;
window.logout = logout;

window.openFilteredStudentsModal = openFilteredStudentsModal;
window.closeFilteredStudentsModal = closeFilteredStudentsModal;
window.searchFilteredStudents = searchFilteredStudents;
window.exportFilteredStudents = exportFilteredStudents;
window.goToAdminWithFilter = goToAdminWithFilter;

console.log('✅ behavior_dashboard.js loaded (Lazy Load mode)');
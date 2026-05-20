/**
 * WRK System - Morning Attendance (ปรับปรุงแก้ไข)
 * 1. เพิ่มการบันทึก "มา" อัตโนมัติย้อนหลัง เมื่อเลือกวันที่ผ่านมาแล้ว และยังมีนักเรียนที่ไม่ได้บันทึก
 * 2. เพิ่มตัวกรองระดับชั้นและช่องค้นหาห้องเรียนใน Grade Overview
 */
let currentUser = null;
let currentSchoolInfo = null;
let actualUserRole = '';
let attendanceData = {};
let adviser1Name = '.......................................';
let adviser2Name = '.......................................';
let termStartDate = null;
let termEndDate = null;
let holidayList = [];
let moduleSettings = { check_only_weekdays: true, lock_future_dates: true, enforce_term_start: true, end_date: null };
let missingDatesList = [];
let checkedDatesList = [];
let currentManagedGrades = [];
let currentDashboardStudents = [];
let isDashboardSaved = false;
let currentViewRole = 'teacher';
let attendanceChartInstance = null;

const statusStyles = {
    'มา': { active: 'active-มา', inactive: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100 hover:shadow-md' },
    'ขาด': { active: 'active-ขาด', inactive: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:shadow-md' },
    'สาย': { active: 'active-สาย', inactive: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 hover:shadow-md' },
    'ลา': { active: 'active-ลา', inactive: 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100 hover:shadow-md' },
    'ป่วย': { active: 'active-ป่วย', inactive: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:shadow-md' }
};

function formatThaiDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatThaiDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ==================== AUTH & INIT ====================
$(document).ready(async () => {
    try {
        const today = new Date();
        $('#check-date').val(new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
        await checkAuth();
        $('#check-date').on('change', () => loadStudentList($('#classroom-select').val()));
    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถเริ่มระบบได้', 'error');
    }
});

function queryTimeout(promise, label = '', ms = 10000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Query [${label}] timed out after ${ms}ms`)), ms))
    ]);
}

async function checkAuth() {
    try {
        const { data: { user }, error: authError } = await queryTimeout(
            db.auth.getUser(), 'auth.getUser'
        );
        if (authError || !user) { window.location.href = 'index.html'; return; }

        const { data: personnel } = await queryTimeout(
            db.from('core_personnel').select('*').eq('id', user.id).single(),
            'core_personnel'
        );
        if (!personnel) return;
        currentUser = personnel;
        actualUserRole = personnel.role;

        let userDisplayText = `<i class="fas fa-user-tie mr-1"></i> ครู${personnel.first_name} ${personnel.last_name}`;

        const { data: schoolInfo } = await queryTimeout(
            db.from('core_school_info').select('*').single(),
            'core_school_info'
        );
        if (!schoolInfo) {
            Swal.fire('ข้อมูลโรงเรียนไม่สมบูรณ์', 'กรุณาตั้งค่าข้อมูลโรงเรียนในระบบส่วนกลาง', 'warning');
            return;
        }
        currentSchoolInfo = schoolInfo;
        termStartDate = schoolInfo.term_start_date;

        const { data: settings } = await queryTimeout(
            db.from('module_attendance_settings')
                .select('*')
                .eq('academic_year', schoolInfo.current_academic_year)
                .eq('semester', schoolInfo.current_semester)
                .maybeSingle(),
            'module_attendance_settings'
        );
        if (settings) {
            moduleSettings = {
                check_only_weekdays: settings.check_only_weekdays !== false,
                lock_future_dates: settings.lock_future_dates !== false,
                enforce_term_start: settings.enforce_term_start !== false,
                end_date: settings.end_date
            };
            termEndDate = settings.end_date;
        }

        const { data: holidays } = await queryTimeout(
            db.from('module_attendance_holidays').select('*'),
            'module_attendance_holidays'
        );
        holidayList = holidays || [];
        applyDateConstraints();

        let managedGrades = [];
        let isDisciplineHead = false;

        if (actualUserRole !== 'super_admin' && actualUserRole !== 'admin') {
            const { data: gradeHeads } = await queryTimeout(
                db.from('core_grade_heads')
                    .select('grade_level')
                    .eq('personnel_id', user.id)
                    .eq('academic_year', schoolInfo.current_academic_year),
                'core_grade_heads'
            );
            if (gradeHeads && gradeHeads.length > 0) {
                managedGrades = gradeHeads.map(h => h.grade_level);
            }

            const { data: discHead } = await queryTimeout(
                db.from('core_discipline_heads')
                    .select('id')
                    .eq('personnel_id', user.id)
                    .eq('academic_year', schoolInfo.current_academic_year)
                    .maybeSingle(),
                'core_discipline_heads'
            );
            isDisciplineHead = !!discHead;
        }

        if (actualUserRole === 'super_admin' || actualUserRole === 'admin' || isDisciplineHead) {
            currentManagedGrades = ['1', '2', '3', '4', '5', '6'];
        } else if (managedGrades.length > 0) {
            currentManagedGrades = managedGrades;
        } else {
            currentManagedGrades = [];
        }
        $('#btn-grade-overview').toggleClass('hidden', currentManagedGrades.length === 0);

        if (actualUserRole === 'super_admin') {
            userDisplayText += `<span class="block text-[10px] text-rose-600 font-black mt-1 uppercase tracking-wider"><i class="fas fa-crown mr-1"></i> ผู้ดูแลระบบสูงสุด</span>`;
        } else if (isDisciplineHead) {
            userDisplayText += `<span class="block text-[10px] text-emerald-600 font-black mt-1 uppercase tracking-wider"><i class="fas fa-shield-alt mr-1"></i> หัวหน้างานปกครอง</span>`;
        } else if (managedGrades.length > 0) {
            userDisplayText += `<span class="block text-[10px] text-indigo-600 font-black mt-1 uppercase tracking-wider">หัวหน้าระดับ: ม.${managedGrades.join(', ')}</span>`;
        }
        $('#user-display').html(userDisplayText);

        const toggleBtn = document.getElementById('btnAdminMode');
        if (actualUserRole === 'admin' || actualUserRole === 'super_admin') {
            currentViewRole = 'admin';
            $('#admin-settings-btn').removeClass('hidden').addClass('flex');
            if (actualUserRole === 'super_admin') {
                $('#super-admin-section').removeClass('hidden');
            }
            if (toggleBtn) {
                toggleBtn.classList.remove('hidden');
                toggleBtn.classList.add('flex');
                updateToggleButtonUI();
            }
        } else {
            currentViewRole = 'teacher';
            if (toggleBtn) toggleBtn.classList.add('hidden');
            $('#admin-settings-btn').addClass('hidden').removeClass('flex');
        }

        const { data: allClassrooms, error: classError } = await queryTimeout(
            db.from('core_classrooms')
                .select('*')
                .eq('academic_year', schoolInfo.current_academic_year)
                .eq('semester', schoolInfo.current_semester)
                .order('grade_level', { ascending: true })
                .order('room_number', { ascending: true }),
            'core_classrooms'
        );
        if (classError) throw classError;
        window.globalClassroomsList = allClassrooms;

        const isAdviser = allClassrooms.some(cls => cls.adviser_id_1 === user.id || cls.adviser_id_2 === user.id);
        const btnStatsReport = document.getElementById('btn-stats-report');
        if (btnStatsReport) btnStatsReport.classList.toggle('hidden', !isAdviser && actualUserRole !== 'admin' && actualUserRole !== 'super_admin');

        let classrooms = [];
        if (actualUserRole === 'admin' || actualUserRole === 'super_admin') {
            classrooms = allClassrooms;
        } else if (isDisciplineHead) {
            classrooms = [];
        } else {
            classrooms = allClassrooms.filter(cls =>
                cls.adviser_id_1 === user.id || cls.adviser_id_2 === user.id
            );
        }

        const selectEl = document.getElementById('classroom-select');
        if (window.classroomTomSelect) window.classroomTomSelect.destroy();
        selectEl.innerHTML = '';

        if (classrooms.length === 0) {
            selectEl.innerHTML = '<option value="">ไม่มีสิทธิ์เช็คชื่อ</option>';
            $('#student-list').html('<tr><td colspan="3" class="text-center py-16 text-slate-500 font-bold">คุณไม่มีสิทธิ์บันทึกการเช็คชื่อในห้องเรียนใด ๆ</td></tr>');
            updateStatsClear();
            currentDashboardStudents = [];
            renderDashboardSummary();
            return;
        }

        classrooms.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls.id;
            option.text = `ชั้น ${cls.grade_level}/${cls.room_number}`;
            selectEl.appendChild(option);
        });

        window.classroomTomSelect = new TomSelect(selectEl, {
            placeholder: '-- เลือกห้องเรียน --',
            searchField: ['text'],
        });

        window.classroomTomSelect.on('change', val => { if (val) loadStudentList(val); });
        loadStudentList(classrooms[0].id);

    } catch (err) {
        console.error('❌ checkAuth error:', err);
        Swal.fire({
            icon: 'error',
            title: 'ระบบขัดข้อง',
            text: err.message || 'เกิดข้อผิดพลาดระหว่างโหลดข้อมูล กรุณาลองใหม่',
            footer: 'หากพบปัญหาต่อเนื่อง ให้ตรวจสอบ Console (F12)'
        });
        $('#user-display').html('<span class="text-rose-600 font-bold">โหลดข้อมูลล้มเหลว</span>');
    }
}

function updateToggleButtonUI() {
    const btn = document.getElementById('btnAdminMode');
    if (!btn) return;
    if (currentViewRole === 'admin') {
        btn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
        btn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
        btn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm';
    }
}

function renderDashboardSummary() {
    const container = document.getElementById('dashboard-summary-container');
    if (!container || !currentDashboardStudents.length) { container.innerHTML = ''; return; }

    const rawDate = $('#check-date').val() || '';
    const thaiDateText = rawDate ? new Date(rawDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'วันนี้';

    let stats = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    let issueStudents = { 'ขาด': [], 'สาย': [], 'ลา': [], 'ป่วย': [] };
    currentDashboardStudents.forEach(student => {
        const sid = student.id || student.student_id;
        const status = attendanceData[sid];
        if (status && stats[status] !== undefined) {
            stats[status]++;
            if (status !== 'มา') {
                const sData = student.core_students || student;
                issueStudents[status].push({
                    code: sData.student_id_card || sData.student_number || '-',
                    name: `${sData.prefix || ''}${sData.first_name} ${sData.last_name}`,
                    listNum: student.student_number ? `เลขที่ ${student.student_number}` : ''
                });
            }
        }
    });

    const genList = (title, icon, colorClass, bgClass, borderClass, list) => {
        if (!list.length) return '';
        list.sort((a, b) => parseInt(a.listNum.replace('เลขที่ ', '')) - parseInt(b.listNum.replace('เลขที่ ', '')));
        const items = list.map(s => `
            <li class="flex justify-between items-center py-1.5 border-b border-white/50 last:border-0">
                <div class="flex items-center gap-2"><span class="text-[11px] font-bold bg-white/60 px-1.5 py-0.5 rounded text-slate-600 shadow-sm">${s.listNum}</span><span class="text-sm font-bold text-slate-700">${s.name}</span></div>
                <span class="text-[10px] font-mono bg-white/40 px-1.5 py-0.5 rounded text-slate-500">${s.code}</span>
            </li>`).join('');
        return `<div class="${bgClass} p-4 rounded-2xl border ${borderClass} shadow-sm"><h4 class="font-black text-sm ${colorClass} mb-2.5 flex items-center border-b border-white pb-2"><i class="${icon} w-5"></i> ${title} (${list.length} คน)</h4><ul class="space-y-1">${items}</ul></div>`;
    };

    const htmlLists = genList('ขาดเรียน', 'fas fa-user-times', 'text-rose-700', 'bg-rose-50', 'border-rose-100', issueStudents['ขาด']) +
        genList('มาสาย', 'fas fa-clock', 'text-orange-700', 'bg-orange-50', 'border-orange-100', issueStudents['สาย']) +
        genList('ลากิจ', 'fas fa-envelope-open-text', 'text-yellow-700', 'bg-yellow-50', 'border-yellow-100', issueStudents['ลา']) +
        genList('ลาป่วย', 'fas fa-procedures', 'text-blue-700', 'bg-blue-50', 'border-blue-100', issueStudents['ป่วย']);

    const cardClass = isDashboardSaved
        ? 'from-emerald-50/80 to-white border-emerald-200'
        : 'from-amber-50/80 to-white border-amber-200';
    const iconEl = isDashboardSaved
        ? '<div class="absolute -top-4 -right-4 p-4 text-emerald-500/10 text-8xl"><i class="fas fa-check-circle"></i></div>'
        : '<div class="absolute -top-4 -right-4 p-4 text-amber-500/10 text-8xl"><i class="fas fa-exclamation-circle"></i></div>';
    const headerContent = isDashboardSaved
        ? `<div class="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl shadow-lg shadow-emerald-200"><i class="fas fa-check"></i></div>
           <div><h3 class="text-xl font-black text-emerald-800 tracking-tight">บันทึกการเช็คชื่อเรียบร้อยแล้ว</h3><p class="text-xs text-emerald-600 font-bold tracking-widest uppercase">ข้อมูลประจำวันที่ ${thaiDateText} อัปเดตเข้าระบบแล้ว</p></div>`
        : `<div class="w-14 h-14 rounded-2xl bg-amber-400 text-white flex items-center justify-center text-3xl shadow-lg shadow-amber-200 flex-shrink-0"><i class="fas fa-clipboard-list"></i></div>
           <div><h3 class="text-xl font-black text-amber-900 tracking-tight">ยังไม่ได้บันทึกการเช็คชื่อ!</h3><p class="text-sm text-amber-700 font-medium mt-0.5">ประจำวันที่ <b class="text-amber-900">${thaiDateText}</b> กรุณาตรวจสอบและบันทึก</p></div>`;

    let bottomContent = '';
    if (htmlLists) {
        bottomContent = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${htmlLists}</div>`;
    } else {
        if (isDashboardSaved && Object.keys(attendanceData).length > 0) {
            bottomContent = `<div class="text-center py-4 bg-white/60 rounded-2xl text-emerald-600 font-bold border border-emerald-100 shadow-sm">
                <i class="fas fa-award text-yellow-400 text-xl mr-2 mb-1"></i><br>ยอดเยี่ยม! นักเรียนมาเรียนครบ 100%
            </div>`;
        } else {
            bottomContent = `<div class="text-center py-4 bg-white/60 rounded-2xl text-amber-600 font-bold border border-amber-100 shadow-sm">
                <i class="fas fa-clipboard-check text-2xl mb-1"></i><br>ยังไม่ได้บันทึกการเช็คชื่อในวันนี้ กรุณาเลือกสถานะนักเรียน
            </div>`;
        }
    }

    container.innerHTML = `<div class="glass-panel p-6 rounded-3xl shadow-sm border bg-gradient-to-br ${cardClass} relative overflow-hidden">${iconEl}
        <div class="relative z-10"><div class="flex items-center gap-4 mb-6">${headerContent}</div>
        <div class="grid grid-cols-5 gap-3 mb-5">
            ${['มา', 'ขาด', 'สาย', 'ลา', 'ป่วย'].map((s, i) => `<div class="bg-white p-3 rounded-2xl text-center shadow-sm border border-slate-100"><div class="text-xs text-slate-400 font-bold mb-1">${s}</div><div class="text-2xl font-black ${['text-emerald-500', 'text-rose-500', 'text-orange-500', 'text-yellow-500', 'text-blue-500'][i]}">${stats[s]}</div></div>`).join('')}
        </div>
        ${bottomContent}
        </div></div>`;
}


// ==================== DATA LOADING ====================
/**
 * โหลดและแสดงรายชื่อครูที่ปรึกษาจาก adviser_id_1 และ adviser_id_2
 * @param {string} classroomId - UUID ของห้องเรียน
 */
async function loadHomeroomAdvisors(classroomId) {
    const container = document.getElementById('homeroom-advisor-container');
    const nameElement = document.getElementById('homeroom-advisor-names');
    
    if (!container || !nameElement) return;

    // แสดง UI โหลดข้อมูล
    container.classList.remove('hidden');
    nameElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-blue-400 mr-2"></i> กำลังโหลดข้อมูล...';

    try {
        // 1. ดึงข้อมูลห้องเรียนจาก Array ที่โหลดไว้แล้วใน checkAuth()
        const classroom = window.globalClassroomsList.find(cls => cls.id === classroomId);
        
        if (!classroom) {
             nameElement.innerHTML = '<span class="text-slate-400 font-normal italic">ไม่พบข้อมูลห้องเรียน</span>';
             return;
        }

        // 2. รวบรวม ID ของครูที่ปรึกษาที่มี
        const adviserIds = [];
        if (classroom.adviser_id_1) adviserIds.push(classroom.adviser_id_1);
        if (classroom.adviser_id_2) adviserIds.push(classroom.adviser_id_2);

        if (adviserIds.length === 0) {
            nameElement.innerHTML = '<span class="text-slate-400 font-normal italic">ยังไม่ระบุครูที่ปรึกษา</span>';
            return;
        }

        // 3. Query หาชื่อ-สกุล จากตาราง core_personnel
        const { data: personnel, error } = await db
            .from('core_personnel')
            .select('first_name, last_name')
            .in('id', adviserIds);

        if (error) throw error;

        // 4. นำชื่อมาเรียงต่อกันและแสดงผล
        if (personnel && personnel.length > 0) {
            const advisorNames = personnel.map(p => `ครู${p.first_name} ${p.last_name}`).join(' และ ');
            nameElement.innerHTML = advisorNames;
        } else {
            nameElement.innerHTML = '<span class="text-slate-400 font-normal italic">ไม่พบข้อมูลในระบบ</span>';
        }
        
    } catch (err) {
        console.error("Error loading homeroom advisors:", err);
        nameElement.innerHTML = '<span class="text-rose-500 font-normal text-sm"><i class="fa-solid fa-triangle-exclamation"></i> ไม่สามารถดึงข้อมูลได้</span>';
    }
}

let promptedFillMap = {};

async function loadStudentList(classroomId) {
    if (!classroomId) return;
    // 🟢 แทรกโค้ดตรงนี้: ให้โหลดชื่อครูที่ปรึกษาทุกครั้งที่เปลี่ยนห้องเรียน
    loadHomeroomAdvisors(classroomId);

    promptedFillMap = {};
    adviser1Name = '.......................................';
    adviser2Name = '.......................................';
    const { data: room } = await db.from('core_classrooms').select('*').eq('id', classroomId).single();
    if (room) {
        await Promise.all([room.adviser_id_1, room.adviser_id_2].map(async (id, i) => {
            if (!id) return;
            const { data: p } = await db.from('core_personnel').select('prefix, first_name, last_name').eq('id', id).single();
            if (p) {
                const full = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                if (i === 0) adviser1Name = full; else adviser2Name = full;
            }
        }));
    }

    const checkDate = $('#check-date').val();
    await loadClassroomOverview(classroomId);
    if (!checkDate) return;

    const d = new Date(checkDate + 'T00:00:00');
    const day = d.getDay();
    if (moduleSettings.check_only_weekdays && (day === 0 || day === 6)) {
        $('#student-list').html(`<tr><td colspan="3" class="text-center py-16 text-rose-500 font-bold bg-rose-50/50">ปิดระบบเช็คชื่อ (วันหยุดเสาร์-อาทิตย์)</td></tr>`);
        updateStatsClear(); currentDashboardStudents = []; renderDashboardSummary(); return;
    }

    const holiday = holidayList.find(h => h.holiday_date === checkDate);
    if (holiday) {
        const holidayDesc = holiday.description;
        $('#student-list').html('<tr><td colspan="3" class="text-center py-10"><i class="fas fa-spinner fa-spin mr-2 text-blue-500"></i> กำลังบันทึกการมาเรียนอัตโนมัติ (วันหยุด)...</td></tr>');

        try {
            const { data: enrollments, error: enrollErr } = await db.from('student_enrollments')
                .select(`student_id, student_number, core_students(prefix, first_name, last_name, student_id_card)`)
                .eq('classroom_id', classroomId)
                .order('student_number', { ascending: true });
            if (enrollErr) throw enrollErr;

            if (!enrollments || enrollments.length === 0) {
                $('#student-list').html(`<tr><td colspan="3" class="text-center py-16 text-indigo-600 font-bold bg-indigo-50/50">วันหยุด: ${holidayDesc} (ไม่มีนักเรียนในห้อง)</td></tr>`);
                updateStatsClear(); currentDashboardStudents = []; renderDashboardSummary();
                return;
            }

            const upsertData = enrollments.map(s => ({
                student_id: s.student_id,
                classroom_id: classroomId,
                check_date: checkDate,
                status: 'มา',
                teacher_id: currentUser.id
            }));

            const { error: upsertErr } = await db.from('homeroom_attendance')
                .upsert(upsertData, { onConflict: 'student_id,check_date' });
            if (upsertErr) throw upsertErr;

            attendanceData = {};
            enrollments.forEach(s => { attendanceData[s.student_id] = 'มา'; });
            currentDashboardStudents = enrollments;
            isDashboardSaved = true;

            renderTable(enrollments);
            updateStats();
            renderDashboardSummary();
            await loadClassroomOverview(classroomId);

            Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000 })
                .fire({ icon: 'success', title: `บันทึก "มา" อัตโนมัติสำหรับวันหยุด ${holidayDesc} เรียบร้อย` });
        } catch (err) {
            console.error('Holiday auto-mark error:', err);
            $('#student-list').html(`<tr><td colspan="3" class="text-center py-16 text-rose-600 font-bold bg-rose-50/50">เกิดข้อผิดพลาดในการบันทึกอัตโนมัติ: ${err.message}</td></tr>`);
            updateStatsClear(); currentDashboardStudents = []; renderDashboardSummary();
        }
        return;
    }

    $('#student-list').html('<tr><td colspan="3" class="text-center py-10"><i class="fas fa-spinner fa-spin mr-2 text-blue-500"></i> กำลังดึงข้อมูล...</td></tr>');
    const [{ data: enrollments }, { data: attendance }] = await Promise.all([
        db.from('student_enrollments').select(`student_id, student_number, core_students(prefix, first_name, last_name, student_id_card)`).eq('classroom_id', classroomId).order('student_number', { ascending: true }),
        db.from('homeroom_attendance').select('student_id, status').eq('classroom_id', classroomId).eq('check_date', checkDate)
    ]);

    attendanceData = {};
    attendance?.forEach(r => { attendanceData[r.student_id] = r.status; });
    currentDashboardStudents = enrollments || [];
    isDashboardSaved = attendance && attendance.length > 0;

    renderTable(enrollments);
    updateStats();

    const todayStr = new Date().toISOString().split('T')[0];
    if (checkDate < todayStr) {
        const uncheckedStudents = currentDashboardStudents.filter(s => !attendanceData[s.student_id || s.id]);
        if (uncheckedStudents.length > 0) {
            await fillRemainingAsPresent(classroomId, checkDate, true);
        } else {
            isDashboardSaved = true;
        }
    } else {
        const total = currentDashboardStudents.length;
        const checked = Object.keys(attendanceData).length;
        if (checked < total && !promptedFillMap[`${classroomId}_${checkDate}`]) {
            promptedFillMap[`${classroomId}_${checkDate}`] = true;
            const { isConfirmed } = await Swal.fire({
                title: 'เช็คชื่อยังไม่ครบทุกคน',
                html: `<p>ยังมีนักเรียนอีก <b>${total - checked}</b> คน ที่ยังไม่ได้บันทึกสถานะ</p><p>ต้องการบันทึกที่เหลือเป็น <b>“มา”</b> อัตโนมัติหรือไม่?</p>`,
                icon: 'question', showCancelButton: true, confirmButtonText: 'บันทึกที่เหลือเป็น “มา”', cancelButtonText: 'ภายหลัง'
            });
            if (isConfirmed) await fillRemainingAsPresent(classroomId, checkDate, false);
            else isDashboardSaved = false;
        } else {
            isDashboardSaved = (checked === total);
        }
    }
    renderDashboardSummary();
}

function updateStats() {
    const vals = Object.values(attendanceData);
    $('#stat-present').text(vals.filter(v => v === 'มา').length);
    $('#stat-absent').text(vals.filter(v => v !== 'มา' && v !== '').length);
}
function updateStatsClear() { 
    $('#stat-present').text('0'); 
    $('#stat-absent').text('0'); 
}

async function fillRemainingAsPresent(classroomId, checkDate, silent = false) {
    const uncheckedStudents = currentDashboardStudents.filter(s => !attendanceData[s.student_id || s.id]);
    if (uncheckedStudents.length === 0) return;

    const upsertData = uncheckedStudents.map(s => ({
        student_id: s.student_id || s.id,
        classroom_id: classroomId,
        check_date: checkDate,
        status: 'มา',
        teacher_id: currentUser.id
    }));

    const { error } = await db.from('homeroom_attendance').upsert(upsertData, { onConflict: 'student_id,check_date' });
    if (!error) {
        uncheckedStudents.forEach(s => { attendanceData[s.student_id || s.id] = 'มา'; });
        uncheckedStudents.forEach(s => {
            const row = $(`tr[data-student-id="${s.student_id || s.id}"]`);
            row.find('button').each(function () {
                const btnStatus = $(this).text().trim();
                $(this).removeClass().addClass('status-btn px-3 py-2 rounded-xl border text-[11px] font-black transition-all')
                    .addClass(btnStatus === 'มา' ? statusStyles['มา'].active : statusStyles[btnStatus].inactive);
            });
        });
        updateStats();
        isDashboardSaved = true;
        if (!silent) {
            renderDashboardSummary();
            Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
                .fire({ icon: 'success', title: `บันทึกที่เหลือเป็น "มา" เรียบร้อย` });
        } else {
            renderDashboardSummary();
        }
    }
}

// ✅ ส่วนที่เพิ่มเติม: loadClassroomOverview (จำเป็น)
async function loadClassroomOverview(classroomId) {
    if (!termStartDate) return;
    const { data: checked } = await db.from('homeroom_attendance').select('check_date').eq('classroom_id', classroomId);
    checkedDatesList = [...new Set(checked?.map(d => d.check_date) || [])].sort();
    $('#days-checked-count').text(checkedDatesList.length);

    const endDate = (termEndDate && new Date() > new Date(termEndDate)) ? new Date(termEndDate) : new Date();
    missingDatesList = [];
    for (let d = new Date(termStartDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        const dow = d.getDay();
        if ((!moduleSettings.check_only_weekdays || (dow !== 0 && dow !== 6)) && !holidayList.some(h => h.holiday_date === ds) && !checkedDatesList.includes(ds)) {
            missingDatesList.push(ds);
        }
    }
    $('#missing-days-count').text(missingDatesList.length);
}

function showCheckedDates() {
    if (!checkedDatesList.length) return Swal.fire('ข้อมูล', 'ยังไม่มีการเช็คชื่อ', 'info');
    Swal.fire({ title: 'วันที่เช็คแล้ว', html: checkedDatesList.map(formatThaiDateFull).join('<br>'), icon: 'info' });
}
function showMissingDates() {
    if (!missingDatesList.length) return Swal.fire('ยอดเยี่ยม!', 'เช็คชื่อครบทุกวันแล้ว', 'success');
    Swal.fire({ title: 'วันที่ยังไม่ได้เช็ค', html: missingDatesList.map(formatThaiDateFull).join('<br>'), icon: 'warning' });
}

// ==================== ATTENDANCE UPDATE ====================
async function updateAttendance(studentId, status) {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();
    if (!studentId || !classroomId || !currentUser) return;

    const { error } = await db.from('homeroom_attendance').upsert({
        student_id: studentId, classroom_id: classroomId, check_date: checkDate,
        status: status, teacher_id: currentUser.id
    }, { onConflict: 'student_id,check_date' });
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    attendanceData[studentId] = status;
    updateStats();

    const row = $(`tr[data-student-id="${studentId}"]`);
    row.find('button').each(function () {
        const btnStatus = $(this).text().trim();
        $(this).removeClass().addClass('status-btn px-3 py-2 rounded-xl border text-[11px] font-black transition-all')
            .addClass(status === btnStatus ? statusStyles[btnStatus].active : statusStyles[btnStatus].inactive);
    });

    loadClassroomOverview(classroomId);

    const todayStr = new Date().toISOString().split('T')[0];
    if (checkDate < todayStr) {
        const unchecked = currentDashboardStudents.filter(s => !attendanceData[s.student_id || s.id]);
        if (unchecked.length > 0) {
            await fillRemainingAsPresent(classroomId, checkDate, true);
        } else {
            isDashboardSaved = true;
            renderDashboardSummary();
        }
    } else {
        const total = currentDashboardStudents.length;
        const checked = Object.keys(attendanceData).length;
        const prompKey = `${classroomId}_${checkDate}`;
        if (checked < total && !promptedFillMap[prompKey]) {
            promptedFillMap[prompKey] = true;
            const { isConfirmed } = await Swal.fire({
                title: 'เช็คชื่อยังไม่ครบทุกคน',
                html: `<p>ยังมีนักเรียนอีก <b>${total - checked}</b> คน ที่ยังไม่ได้บันทึกสถานะ</p><p>ต้องการบันทึกที่เหลือเป็น <b>“มา”</b> อัตโนมัติหรือไม่?</p>`,
                icon: 'question', showCancelButton: true, confirmButtonText: 'บันทึกที่เหลือเป็น “มา”', cancelButtonText: 'ภายหลัง'
            });
            if (isConfirmed) await fillRemainingAsPresent(classroomId, checkDate, false);
            else { isDashboardSaved = false; renderDashboardSummary(); }
        } else {
            isDashboardSaved = (checked === total);
            renderDashboardSummary();
        }
    }

    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1000 })
        .fire({ icon: 'success', title: `บันทึก "${status}" เรียบร้อย` });
}

// ==================== RENDER & BULK & CLEAR ====================
function renderTable(enrollments) {
    const tbody = $('#student-list').empty();
    if (!enrollments?.length) return;
    enrollments.forEach(item => {
        const std = item.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const current = attendanceData[item.student_id] || '';
        const btns = ['มา', 'ขาด', 'สาย', 'ลา', 'ป่วย'].map(s => {
            const cls = current === s ? statusStyles[s].active : statusStyles[s].inactive;
            return `<button onclick="updateAttendance('${item.student_id}','${s}')" class="status-btn px-3 py-2 rounded-xl border text-[11px] font-black transition-all ${cls}">${s}</button>`;
        }).join('');
        tbody.append(`<tr data-student-id="${item.student_id}" data-student-code="${std?.student_id_card || '-'}" class="hover:bg-blue-50/50 transition-colors border-b border-slate-50">
            <td class="px-6 py-4 font-bold text-slate-400 text-center">${item.student_number}</td>
            <td class="px-6 py-4"><div class="font-bold text-blue-700 cursor-pointer hover:text-blue-900" onclick="openStudentHistory('${item.student_id}', '${fullName}', '${item.student_number}')">${fullName} <i class="fas fa-search text-[10px] ml-1 opacity-50"></i></div></td>
            <td class="px-6 py-4"><div class="flex justify-center gap-1 sm:gap-2">${btns}</div></td></tr>`);
    });
}

async function markAllAs(status) {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();
    const ids = [...$('#student-list tr[data-student-id]')].map(el => el.dataset.studentId);
    if (!ids.length) return Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายชื่อนักเรียน', 'warning');

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยัน', text: `บันทึก "${status}" ทุกคน (${ids.length} คน)?`, icon: 'question', showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('homeroom_attendance').upsert(
        ids.map(id => ({ student_id: id, classroom_id: classroomId, check_date: checkDate, status, teacher_id: currentUser.id })),
        { onConflict: 'student_id,check_date' }
    );
    Swal.close();
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else { Swal.fire('สำเร็จ', `บันทึก "${status}" ทุกคนแล้ว`, 'success'); loadStudentList(classroomId); }
}

async function clearDailyData() {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();
    if (!Object.keys(attendanceData).length) return Swal.fire('ไม่มีข้อมูล', `ไม่มีข้อมูลวันที่ ${checkDate}`, 'info');

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันล้าง?', text: `ลบข้อมูลวันที่ ${checkDate} ทั้งหมด?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    Swal.fire({ title: 'กำลังล้าง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('homeroom_attendance').delete().eq('classroom_id', classroomId).eq('check_date', checkDate);
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else { Swal.fire('สำเร็จ', 'ล้างข้อมูลของวันนี้แล้ว', 'success'); loadStudentList(classroomId); }
}

async function clearAttendanceData() {
    const isAdmin = actualUserRole === 'super_admin' || actualUserRole === 'admin';
    let classroomOptions = [];
    if (isAdmin) {
        Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { data, error } = await db.from('core_classrooms')
            .select('id, grade_level, room_number, semester, academic_year')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });
        Swal.close();
        if (error || !data) return Swal.fire('ผิดพลาด', 'โหลดห้องเรียนไม่ได้', 'error');
        classroomOptions = data.map(r => ({
            id: r.id,
            label: `ม.${r.grade_level}/${r.room_number} (${r.semester}/${r.academic_year})`
        }));
    } else {
        $('#classroom-select option').each(function () {
            if ($(this).val()) classroomOptions.push({ id: $(this).val(), label: $(this).text() });
        });
        if (classroomOptions.length === 0)
            return Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ได้เป็นครูที่ปรึกษาห้องใด', 'warning');
    }

    const roomSelectHtml = classroomOptions.length === 1
        ? `<input type="hidden" id="clr-room-id" value="${classroomOptions[0].id}">
           <div class="p-2 bg-rose-50 border border-rose-200 rounded-lg text-center font-bold text-rose-700 mb-3">
             <i class="fas fa-lock mr-1"></i> ห้อง: ${classroomOptions[0].label}
           </div>`
        : `<select id="clr-room-id" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-rose-500">
             <option value="">-- เลือกห้องเรียน --</option>
             ${classroomOptions.map(r => `<option value="${r.id}">${r.label}</option>`).join('')}
           </select>`;

    const currentClassroomId = $('#classroom-select').val();
    const currentDate = $('#check-date').val();

    const { value: form } = await Swal.fire({
        title: '<i class="fas fa-trash-alt text-rose-500 mr-2"></i>ล้างข้อมูลการเช็คชื่อ',
        width: 520,
        html: `
        <div class="text-left text-sm space-y-3 mt-2">
            <div>
                <label class="font-bold text-slate-600 block mb-1">1. ห้องเรียน</label>
                ${roomSelectHtml}
            </div>
            <div>
                <label class="font-bold text-slate-600 block mb-1">2. รูปแบบการล้าง</label>
                <div class="flex gap-2">
                    <label class="flex-1 flex items-center gap-2 border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-rose-400 transition has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50">
                        <input type="radio" name="clr-mode" value="single" checked> <span class="font-bold text-slate-700">ทีละวัน</span>
                    </label>
                    <label class="flex-1 flex items-center gap-2 border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-rose-400 transition has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50">
                        <input type="radio" name="clr-mode" value="range"> <span class="font-bold text-slate-700">ช่วงหลายวัน</span>
                    </label>
                </div>
            </div>
            <div id="clr-single-section">
                <label class="font-bold text-slate-600 block mb-1">3. เลือกวันที่ต้องการล้าง</label>
                <input type="date" id="clr-single-date" value="${currentDate}"
                    class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500">
            </div>
            <div id="clr-range-section" class="hidden">
                <label class="font-bold text-slate-600 block mb-1">3. เลือกช่วงวันที่</label>
                <input type="text" id="clr-range-date"
                    class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500"
                    placeholder="คลิกเพื่อเลือกช่วงวันที่...">
            </div>
            <p class="text-[10px] text-rose-500 font-bold bg-rose-50 p-2 rounded-lg">⚠️ ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้</p>
        </div>`,
        didOpen: () => {
            document.querySelectorAll('input[name="clr-mode"]').forEach(radio => {
                radio.addEventListener('change', e => {
                    if (e.target.value === 'single') {
                        document.getElementById('clr-single-section').classList.remove('hidden');
                        document.getElementById('clr-range-section').classList.add('hidden');
                    } else {
                        document.getElementById('clr-single-section').classList.add('hidden');
                        document.getElementById('clr-range-section').classList.remove('hidden');
                        flatpickr('#clr-range-date', { mode: 'range', dateFormat: 'Y-m-d', locale: 'th' });
                    }
                });
            });
        },
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '<i class="fas fa-arrow-right mr-1"></i> ถัดไป',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const roomId = document.getElementById('clr-room-id').value;
            const mode = document.querySelector('input[name="clr-mode"]:checked').value;
            const roomLabel = document.getElementById('clr-room-id').tagName === 'SELECT'
                ? document.querySelector('#clr-room-id option:checked')?.text
                : classroomOptions[0]?.label;

            if (!roomId) return Swal.showValidationMessage('กรุณาเลือกห้องเรียน');

            let startDate, endDate;
            if (mode === 'single') {
                startDate = document.getElementById('clr-single-date').value;
                endDate = startDate;
                if (!startDate) return Swal.showValidationMessage('กรุณาเลือกวันที่');
            } else {
                const rangeVal = document.getElementById('clr-range-date').value;
                if (!rangeVal) return Swal.showValidationMessage('กรุณาเลือกช่วงวันที่');
                let parts = rangeVal.includes(' ถึง ') ? rangeVal.split(' ถึง ') : rangeVal.split(' to ');
                startDate = parts[0].trim();
                endDate = parts[1] ? parts[1].trim() : startDate;
            }
            return { roomId, roomLabel, startDate, endDate };
        }
    });

    if (!form) return;

    const dateDisplay = form.startDate === form.endDate
        ? formatThaiDateFull(form.startDate)
        : `${formatThaiDateFull(form.startDate)} ถึง ${formatThaiDateFull(form.endDate)}`;

    const confirm = await Swal.fire({
        title: 'ยืนยันการล้างข้อมูล?',
        html: `<div class="text-sm text-left space-y-1">
            <p>ห้องเรียน: <b class="text-rose-700">${form.roomLabel}</b></p>
            <p>วันที่: <b class="text-rose-700">${dateDisplay}</b></p>
            <p class="text-xs text-slate-500 mt-2">ข้อมูลจะหายถาวร ไม่สามารถกู้คืนได้</p>
        </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '<i class="fas fa-trash-alt mr-1"></i> ลบถาวร',
        cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({ title: 'กำลังล้างข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { error } = await db.from('homeroom_attendance')
            .delete()
            .eq('classroom_id', form.roomId)
            .gte('check_date', form.startDate)
            .lte('check_date', form.endDate);
        if (error) throw error;

        await Swal.fire({
            icon: 'success',
            title: 'ล้างข้อมูลสำเร็จ!',
            html: `<p class="text-sm">ลบข้อมูลการเช็คชื่อของ <b>${form.roomLabel}</b><br>วันที่ <b>${dateDisplay}</b> เรียบร้อยแล้ว</p>`,
            timer: 2500,
            showConfirmButton: true
        });

        loadStudentList(currentClassroomId);
        loadClassroomOverview(currentClassroomId);
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==================== HISTORY & EXPORT ====================
let currentViewStudent = null;
async function openStudentHistory(sid, name, no) {
    const classroomId = $('#classroom-select').val();
    $('#student-history-modal').removeClass('hidden');
    $('#student-history-content').html('<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i></div>');
    const { data } = await db.from('homeroom_attendance').select('check_date, status').eq('student_id', sid).eq('classroom_id', classroomId).order('check_date', { ascending: true });
    let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    let rows = '';
    data?.forEach(h => { counts[h.status] = (counts[h.status] || 0) + 1; rows += `<tr class="border-b"><td class="py-2">${formatThaiDateFull(h.check_date)}</td><td class="py-2 font-bold ${h.status === 'มา' ? 'text-green-600' : 'text-rose-600'}">${h.status}</td></tr>`; });
    if (!rows) rows = '<tr><td colspan="2" class="text-center py-4 text-slate-400">ยังไม่มีประวัติ</td></tr>';
    currentViewStudent = { name, no, counts, history: data || [] };
    $('#student-history-content').html(`
        <h3 class="text-xl font-bold text-slate-800 mb-4">เลขที่ ${no} : ${name}</h3>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
            ${['มา', 'ขาด', 'สาย', 'ลา', 'ป่วย'].map(s => `<div class="bg-${s === 'มา' ? 'green' : s === 'ขาด' ? 'rose' : s === 'สาย' ? 'orange' : 'yellow'}-50 p-3 rounded-lg text-center"><p class="text-xs font-bold">${s}</p><p class="text-xl font-black">${counts[s] || 0}</p></div>`).join('')}
        </div>
        <table class="w-full text-sm"><thead class="bg-slate-100"><tr><th class="py-2 px-2">วันที่</th><th class="py-2 px-2">สถานะ</th></tr></thead><tbody>${rows}</tbody></table>`);
    $('#btn-export-student-pdf').off('click').on('click', () => exportStudentPDF(name, no, counts, rows, $('#classroom-select option:selected').text()));
}
function closeStudentHistory() { $('#student-history-modal').addClass('hidden'); }

function exportStudentPDF(name, no, counts, tableRows, className) {
    Swal.fire({ title: 'กำลังสร้าง PDF...', text: 'จัดหน้าเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const schoolName = currentSchoolInfo?.school_name_th || currentSchoolInfo?.school_name || 'โรงเรียน (ตั้งค่าชื่อโรงเรียนในระบบส่วนกลาง)';
    const termInfo = `ภาคเรียนที่ ${currentSchoolInfo?.current_semester || '-'} ปีการศึกษา ${currentSchoolInfo?.current_academic_year || '-'}`;
    const logoUrl = currentSchoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    const history = currentViewStudent.history || [];

    const chunkSize = 20;
    const pages = [];
    for (let i = 0; i < history.length; i += chunkSize) pages.push(history.slice(i, i + chunkSize));
    if (pages.length === 0) pages.push([]);

    const reportElement = document.createElement('div');
    let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333;">`;
    pages.forEach((pageData, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;
        htmlContent += `<div style="padding: 20px 40px; box-sizing: border-box; ${!isLastPage ? 'page-break-after: always;' : ''}">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${logoUrl}" crossorigin="anonymous" style="height: 60px; display: block; margin: 0 auto 10px auto;" alt="Logo">
                <h2 style="margin: 0; font-size: 18px;">${schoolName}</h2>
                <h3 style="margin: 5px 0 15px 0; font-size: 14px; font-weight: normal;">${termInfo}</h3>
                <h2 style="margin: 0; font-size: 16px; color: #1e3a8a;">รายงานประวัติการมาเรียนรายบุคคล</h2>
                <h3 style="margin: 10px 0 5px 0; font-size: 14px; font-weight: normal;">ชื่อ: ${name} (เลขที่ ${no}) | ชั้นเรียน: ${className}</h3>
                <p style="margin: 0; font-size: 12px; color: #666;">(หน้าที่ ${pageIndex + 1} / ${pages.length})</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; font-size: 14px;">
                <tr style="background: #f1f5f9;">
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">มา</th><th style="border: 1px solid #cbd5e1; padding: 8px;">ขาด</th><th style="border: 1px solid #cbd5e1; padding: 8px;">สาย</th><th style="border: 1px solid #cbd5e1; padding: 8px;">ลา</th><th style="border: 1px solid #cbd5e1; padding: 8px;">ป่วย</th>
                </tr>
                <tr>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: green; font-weight: bold;">${counts['มา']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: red;">${counts['ขาด']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: orange;">${counts['สาย']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #ca8a04;">${counts['ลา']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: blue;">${counts['ป่วย']}</td>
                </tr>
            </table>
            <h4 style="margin-bottom: 10px; font-size: 14px;">รายละเอียดการเช็คชื่อ</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
                <thead style="background: #f1f5f9;"><tr><th style="border: 1px solid #cbd5e1; padding: 8px;">วันที่</th><th style="border: 1px solid #cbd5e1; padding: 8px; width: 30%; text-align: center;">สถานะ</th></tr></thead>
                <tbody>`;
        if (pageData.length > 0) {
            pageData.forEach(h => {
                const thaiDate = formatThaiDateFull(h.check_date);
                let color = 'color: #333;';
                if (h.status === 'มา') color = 'color: green;';
                else if (h.status === 'ขาด') color = 'color: red;';
                else if (h.status === 'สาย') color = 'color: orange;';
                else if (h.status === 'ลา') color = 'color: #ca8a04;';
                else if (h.status === 'ป่วย') color = 'color: blue;';
                htmlContent += `<tr><td style="border: 1px solid #cbd5e1; padding: 8px;">${thaiDate}</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-weight: bold; ${color}">${h.status}</td></tr>`;
            });
        } else {
            htmlContent += `<tr><td colspan="2" style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #94a3b8;">ยังไม่มีประวัติการเช็คชื่อ</td></tr>`;
        }
        htmlContent += `</tbody></table></div>`;
    });
    htmlContent += `</div>`;
    reportElement.innerHTML = htmlContent;

    html2pdf().set({
        margin: 5,
        filename: `ประวัติ_${name.replace(/\s+/g, '')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(reportElement).save().then(() => {
        Swal.close();
        Swal.fire('สำเร็จ', 'ดาวน์โหลดไฟล์ PDF ประวัติรายบุคคลเรียบร้อยแล้ว', 'success');
    });
}

async function exportToExcel() {
    const classroomId = $('#classroom-select').val();
    const className = $('#classroom-select option:selected').text();
    Swal.fire({ title: 'กำลังสร้างตาราง Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: students } = await db.from('student_enrollments').select(`student_id, student_number, core_students(prefix, first_name, last_name)`).eq('classroom_id', classroomId).order('student_number');
    const { data: allAttendance } = await db.from('homeroom_attendance').select('*').eq('classroom_id', classroomId);
    if (!allAttendance || allAttendance.length === 0) { Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีประวัติ', 'info'); return; }

    const wb = XLSX.utils.book_new();
    const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const groupedByMonth = {};
    allAttendance.forEach(att => {
        const monthKey = att.check_date.substring(0, 7);
        if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = { dates: new Set(), attendance: {} };
        groupedByMonth[monthKey].dates.add(att.check_date);
        if (!groupedByMonth[monthKey].attendance[att.student_id]) groupedByMonth[monthKey].attendance[att.student_id] = {};
        groupedByMonth[monthKey].attendance[att.student_id][att.check_date] = att.status;
    });

    for (const [monthKey, monthData] of Object.entries(groupedByMonth)) {
        const [year, month] = monthKey.split('-');
        const sheetName = `${monthNames[parseInt(month) - 1]} ${parseInt(year) + 543}`;
        const sortedDates = Array.from(monthData.dates).sort();
        const dateHeaders = sortedDates.map(d => `${d.split('-')[2]}/${d.split('-')[1]}`);
        const wsData = [['เลขที่', 'ชื่อ-นามสกุล', 'มา', 'ขาด', 'สาย', 'ลา', 'ป่วย', ...dateHeaders]];
        students.forEach(std => {
            const stdId = std.student_id;
            let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
            let dailyStatuses = [];
            sortedDates.forEach(d => {
                const status = (monthData.attendance[stdId] && monthData.attendance[stdId][d]) ? monthData.attendance[stdId][d] : '-';
                dailyStatuses.push(status);
                if (counts[status] !== undefined) counts[status]++;
            });
            wsData.push([
                std.student_number,
                `${std.core_students.prefix}${std.core_students.first_name} ${std.core_students.last_name}`,
                counts['มา'], counts['ขาด'], counts['สาย'], counts['ลา'], counts['ป่วย'],
                ...dailyStatuses
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    XLSX.writeFile(wb, `เช็คชื่อ_${className.replace(/\s+/g, '')}_ละเอียด.xlsx`);
    Swal.close();
}

async function generatePDFReport() {
    const className = $('#classroom-select option:selected').text();
    const checkDateStr = $('#check-date').val();
    if (Object.keys(attendanceData).length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'กรุณาเช็คชื่อนักเรียนให้เรียบร้อยก่อนออกรายงาน', 'warning');
        return;
    }
    Swal.fire({ title: 'กำลังสร้าง PDF...', text: 'จัดหน้าเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const schoolName = currentSchoolInfo?.school_name_th || currentSchoolInfo?.school_name || 'โรงเรียน (ตั้งค่าชื่อโรงเรียนในระบบส่วนกลาง)';
    const termInfo = `ภาคเรียนที่ ${currentSchoolInfo?.current_semester || '-'} ปีการศึกษา ${currentSchoolInfo?.current_academic_year || '-'}`;
    const logoUrl = currentSchoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    const thaiDateText = formatThaiDateFull(checkDateStr);
    let cPresent = 0, cAbsent = 0, cLate = 0, cLeave = 0, cSick = 0;
    Object.values(attendanceData).forEach(status => {
        if (status === 'มา') cPresent++;
        else if (status === 'ขาด') cAbsent++;
        else if (status === 'สาย') cLate++;
        else if (status === 'ลา') cLeave++;
        else if (status === 'ป่วย') cSick++;
    });
    const studentsList = [];
    $('#student-list tr[data-student-id]').each(function () {
        studentsList.push({
            no: $(this).find('td').eq(0).text().trim(),
            studentCode: $(this).data('student-code'),
            name: $(this).find('td').eq(1).text().replace(' (คลิกชื่อเพื่อดูประวัติ)', '').trim(),
            status: attendanceData[$(this).data('student-id')] || 'ยังไม่เช็ค'
        });
    });
    const chunkSize = 20;
    const pages = [];
    for (let i = 0; i < studentsList.length; i += chunkSize) pages.push(studentsList.slice(i, i + chunkSize));
    let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333;">`;
    pages.forEach((pageStudents, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;
        htmlContent += `
        <div style="padding: 10px 20px; box-sizing: border-box; ${!isLastPage ? 'page-break-after: always;' : ''}">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${logoUrl}" crossorigin="anonymous" style="height: 60px; display: block; margin: 0 auto 10px auto;" alt="Logo">
                <h2 style="margin: 0; font-size: 18px;">${schoolName}</h2>
                <h3 style="margin: 5px 0 15px 0; font-size: 14px; font-weight: normal;">${termInfo}</h3>
                <h2 style="margin: 0; font-size: 16px;">รายงานการเช็คชื่อกิจกรรมหน้าเสาธง/โฮมรูม</h2>
                <h3 style="margin: 5px 0 0 0; font-size: 14px; font-weight: normal;">ชั้นเรียน: ${className} | ประจำวันที่: ${thaiDateText}</h3>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">(หน้าที่ ${pageIndex + 1} / ${pages.length})</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead><tr style="background-color: #f1f5f9;">
                    <th style="border: 1px solid #cbd5e1; padding: 8px; width: 10%; text-align: center;">เลขที่</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">เลขประจำตัว</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; width: 50%; text-align: left;">ชื่อ - นามสกุล</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">สถานะ</th>
                </tr></thead>
                <tbody>`;
        pageStudents.forEach(std => {
            let color = '';
            if (std.status === 'มา') color = 'color: green;';
            else if (std.status === 'ขาด') color = 'color: red;';
            htmlContent += `<tr>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${std.no}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${std.studentCode}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px;">${std.name}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; ${color}">${std.status}</td>
            </tr>`;
        });
        htmlContent += `</tbody></table>`;
        if (isLastPage) {
            htmlContent += `
            <div style="margin-top: 20px; font-size: 14px; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; background-color: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <b>สรุป:</b> 
                <span style="color: green;">มาเรียน ${cPresent} คน</span> | 
                <span style="color: red;">ขาด ${cAbsent} คน</span> | 
                <span style="color: orange;">สาย ${cLate} คน</span> | 
                <span style="color: #ca8a04;">ลา ${cLeave} คน</span> | 
                <span style="color: blue;">ป่วย ${cSick} คน</span>
            </div>
            <div style="margin-top: 50px; display: flex; justify-content: space-around; font-size: 14px;">
                <div style="text-align: center;"><p>ลงชื่อ........................................................</p><p>( ${adviser1Name} )</p><p>ครูที่ปรึกษา</p></div>
                <div style="text-align: center;"><p>ลงชื่อ........................................................</p><p>( ${adviser2Name} )</p><p>ครูที่ปรึกษา</p></div>
            </div>`;
        }
        htmlContent += `</div>`;
    });
    htmlContent += `</div>`;
    const opt = {
        margin: [4, 4, 4, 4],
        filename: `รายงานประจำวัน_${className.replace(/\s+/g, '')}_${checkDateStr}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css'], avoid: ['tr'] }
    };
    html2pdf().set(opt).from(htmlContent).save().then(() => {
        Swal.close();
        Swal.fire('สำเร็จ', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว', 'success');
    });
}

async function openHistoryModal() {
    const classroomId = $('#classroom-select').val();
    const className = $('#classroom-select option:selected').text();
    if (!classroomId) return;
    Swal.fire({ title: 'กำลังโหลดประวัติ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { data } = await db.from('homeroom_attendance')
        .select('check_date, status')
        .eq('classroom_id', classroomId)
        .order('check_date', { ascending: false });
    Swal.close();
    if (!data || data.length === 0) {
        return Swal.fire('ไม่มีข้อมูล', `ยังไม่มีการเช็คชื่อของ ${className}`, 'info');
    }
    const byDate = {};
    data.forEach(r => {
        if (!byDate[r.check_date]) byDate[r.check_date] = { มา: 0, ขาด: 0, สาย: 0, ลา: 0, ป่วย: 0 };
        byDate[r.check_date][r.status] = (byDate[r.check_date][r.status] || 0) + 1;
    });
    const rows = Object.entries(byDate).map(([date, s]) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="py-2 px-3 text-sm">${formatThaiDateFull(date)}</td>
            <td class="py-2 px-3 text-center text-green-600 font-bold">${s['มา'] || 0}</td>
            <td class="py-2 px-3 text-center text-rose-600 font-bold">${s['ขาด'] || 0}</td>
            <td class="py-2 px-3 text-center text-orange-500 font-bold">${s['สาย'] || 0}</td>
            <td class="py-2 px-3 text-center text-yellow-600 font-bold">${s['ลา'] || 0}</td>
            <td class="py-2 px-3 text-center text-blue-600 font-bold">${s['ป่วย'] || 0}</td>
        </tr>`).join('');
    Swal.fire({
        title: `ประวัติการเช็คชื่อ: ${className}`,
        width: 640,
        html: `<div class="overflow-auto max-h-80">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-100 sticky top-0"><tr><th class="py-2 px-3">วันที่</th><th class="py-2 px-3 text-center text-green-600">มา</th><th class="py-2 px-3 text-center text-rose-600">ขาด</th><th class="py-2 px-3 text-center text-orange-500">สาย</th><th class="py-2 px-3 text-center text-yellow-600">ลา</th><th class="py-2 px-3 text-center text-blue-600">ป่วย</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#64748b'
    });
}

// ==================== ADMIN MODAL ====================
function openAdminModal() {
    $('#setting-weekdays').prop('checked', moduleSettings.check_only_weekdays);
    $('#setting-lock-future').prop('checked', moduleSettings.lock_future_dates);
    $('#setting-enforce-term-start').prop('checked', moduleSettings.enforce_term_start);
    $('#setting-end-date').val(moduleSettings.end_date || '');
    renderHolidayList();
    
    const today = new Date().toISOString().split('T')[0];
    $('#admin-batch-date').val(today);
    $('#admin-batch-status').html('');

    $('#admin-modal').removeClass('hidden');
}
function closeAdminModal() { $('#admin-modal').addClass('hidden'); }

async function saveAdminSettings() {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const newSettings = {
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        end_date: $('#setting-end-date').val() || null,
        check_only_weekdays: $('#setting-weekdays').is(':checked'),
        lock_future_dates: $('#setting-lock-future').is(':checked'),
        enforce_term_start: $('#setting-enforce-term-start').is(':checked')
    };
    const { error } = await db.from('module_attendance_settings').upsert(newSettings, { onConflict: 'academic_year,semester' });
    if (error) { Swal.fire('Error', error.message, 'error'); }
    else {
        moduleSettings = newSettings;
        applyDateConstraints();
        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success').then(() => {
            closeAdminModal();
            loadStudentList($('#classroom-select').val());
        });
    }
}
function toggleRoleView() {
    currentViewRole = currentViewRole === 'admin' ? 'teacher' : 'admin';
    updateToggleButtonUI();
    $('#admin-settings-btn').toggleClass('hidden', currentViewRole === 'teacher');
    Swal.fire({ toast: true, position: 'bottom-end', icon: 'info', title: `เปลี่ยนเป็นมุมมอง${currentViewRole === 'admin' ? ' Admin' : 'ครู'}`, showConfirmButton: false, timer: 1500 });
}

async function adminMarkAllPresentBatch() {
    if (actualUserRole !== 'admin' && actualUserRole !== 'super_admin') {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'error');
    }
    const batchDate = $('#admin-batch-date').val();
    if (!batchDate) return Swal.fire('กรุณาเลือกวันที่', '', 'warning');

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการบันทึกย้อนหลัง',
        html: `คุณต้องการบันทึก <b>"มา"</b> ให้กับนักเรียน <b>ทุกห้อง</b> ในวันที่ <b>${formatThaiDateFull(batchDate)}</b> ใช่หรือไม่?<br><span class="text-sm text-rose-600">(การดำเนินการนี้อาจใช้เวลาสักครู่)</span>`,
        icon: 'question', showCancelButton: true, confirmButtonText: 'ใช่, บันทึกเลย', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    Swal.fire({
        title: 'กำลังดำเนินการ...', html: 'กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลให้กับทุกห้องเรียน',
        allowOutsideClick: false, didOpen: () => Swal.showLoading()
    });

    try {
        const { data: rooms, error: roomErr } = await db.from('core_classrooms')
            .select('id, grade_level, room_number')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester);
        if (roomErr) throw roomErr;
        if (!rooms || rooms.length === 0) {
            Swal.close(); return Swal.fire('ไม่พบห้องเรียน', 'ไม่มีห้องเรียนในเทอมนี้', 'warning');
        }

        let totalStudents = 0;
        for (const room of rooms) {
            const { data: students, error: studentErr } = await db.from('student_enrollments')
                .select('student_id').eq('classroom_id', room.id);
            if (studentErr) throw studentErr;
            if (!students || students.length === 0) continue;

            const upsertData = students.map(s => ({
                student_id: s.student_id, classroom_id: room.id,
                check_date: batchDate, status: 'มา', teacher_id: currentUser.id
            }));
            const { error: upsertErr } = await db.from('homeroom_attendance')
                .upsert(upsertData, { onConflict: 'student_id,check_date' });
            if (upsertErr) throw upsertErr;
            totalStudents += students.length;
        }

        const currentClassroomId = $('#classroom-select').val();
        const currentCheckDate = $('#check-date').val();
        if (currentClassroomId && currentCheckDate === batchDate) {
            await loadStudentList(currentClassroomId);
        }

        Swal.fire({
            icon: 'success', title: 'ดำเนินการเสร็จสิ้น',
            html: `บันทึก <b>"มา"</b> ให้กับนักเรียนทั้งหมด <b>${totalStudents} คน</b> ใน <b>${rooms.length} ห้อง</b> สำหรับวันที่ <b>${formatThaiDateFull(batchDate)}</b> เรียบร้อยแล้ว`,
        });
        $('#admin-batch-status').removeClass('text-rose-600 text-emerald-600')
            .addClass('text-emerald-600')
            .html(`<i class="fas fa-check-circle mr-1"></i> บันทึกเรียบร้อยเมื่อ ${new Date().toLocaleTimeString('th-TH')}`);
    } catch (err) {
        console.error('Batch mark error:', err);
        Swal.fire('ข้อผิดพลาด', err.message || 'เกิดข้อผิดพลาดระหว่างดำเนินการ', 'error');
        $('#admin-batch-status').removeClass('text-emerald-600 text-rose-600')
            .addClass('text-rose-600')
            .html(`<i class="fas fa-exclamation-triangle mr-1"></i> ${err.message}`);
    }
}

// ==================== HOLIDAYS ====================
function renderHolidayList() {
    const tbody = $('#holiday-list-table');
    tbody.empty();
    if (holidayList.length === 0) {
        tbody.append('<tr><td colspan="3" class="text-center py-4 text-slate-400">ยังไม่มีข้อมูลวันหยุด</td></tr>');
        return;
    }
    holidayList.forEach(h => {
        tbody.append(`<tr>
            <td class="px-4 py-2 font-semibold text-indigo-600">${h.holiday_date}</td>
            <td class="px-4 py-2">${h.description}</td>
            <td class="px-4 py-2 text-center"><button onclick="deleteHoliday('${h.id}')" class="text-rose-500 hover:text-rose-700"><i class="fas fa-trash"></i></button></td>
        </tr>`);
    });
}
async function addHoliday() {
    const date = $('#new-holiday-date').val();
    const desc = $('#new-holiday-desc').val();
    if (!date || !desc) { Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }
    const { data, error } = await db.from('module_attendance_holidays').insert([{ holiday_date: date, description: desc }]).select();
    if (!error && data) {
        holidayList.push(data[0]);
        renderHolidayList();
        $('#new-holiday-date').val('');
        $('#new-holiday-desc').val('');
    } else {
        Swal.fire('ผิดพลาด', 'อาจมีวันหยุดนี้อยู่แล้ว หรือฐานข้อมูลมีปัญหา', 'error');
    }
}
async function deleteHoliday(id) {
    await db.from('module_attendance_holidays').delete().eq('id', id);
    holidayList = holidayList.filter(h => h.id !== id);
    renderHolidayList();
}

// ==================== GRADE OVERVIEW (with filters) ====================
function openGradeOverview() {
    if (!currentManagedGrades.length) return Swal.fire('ไม่พบสิทธิ์', 'คุณไม่มีสิทธิ์เข้าถึง', 'error');
    $('#grade-overview-title').text(`(ม.${currentManagedGrades.join(', ม.')})`);
    $('#overview-date-select').val($('#check-date').val());
    $('#grade-overview-modal').removeClass('hidden');

    if ($('#grade-overview-filters').length === 0) {
        const filterHtml = `
        <div id="grade-overview-filters" class="flex flex-wrap items-center gap-3 mb-4 p-3 bg-purple-50/50 rounded-xl border border-purple-100">
            <div class="flex items-center gap-2">
                <label class="text-sm font-bold text-purple-800"><i class="fas fa-filter mr-1"></i>ระดับชั้น</label>
                <select id="grade-filter" class="border border-purple-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-purple-500 bg-white">
                    <option value="">ทั้งหมด</option>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <label class="text-sm font-bold text-purple-800"><i class="fas fa-search mr-1"></i>ค้นหาห้อง</label>
                <input type="text" id="room-search" placeholder="พิมพ์เลขห้อง เช่น 1/1" class="border border-purple-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-purple-500 bg-white w-40">
            </div>
        </div>`;
        $('#grade-overview-tbody').closest('table').before(filterHtml);
    }

    const gradeSelect = $('#grade-filter');
    gradeSelect.empty().append('<option value="">ทั้งหมด</option>');
    currentManagedGrades.forEach(g => {
        gradeSelect.append(`<option value="ม.${g}">ม.${g}</option>`);
    });

    gradeSelect.off('change').on('change', applyGradeOverviewFilters);
    $('#room-search').off('input').on('input', applyGradeOverviewFilters);

    loadGradeOverviewData();
}

function applyGradeOverviewFilters() {
    const gradeFilter = $('#grade-filter').val();
    const searchText = $('#room-search').val().trim().toLowerCase();
    $('#grade-overview-tbody tr').each(function () {
        const row = $(this);
        if (row.hasClass('summary-row')) return;
        const grade = row.attr('data-grade') || '';
        const roomText = row.find('td:first').text().toLowerCase();
        const gradeMatch = !gradeFilter || grade === gradeFilter;
        const searchMatch = !searchText || roomText.includes(searchText);
        row.toggle(gradeMatch && searchMatch);
    });
}

async function loadGradeOverviewData() {
    const checkDate = $('#overview-date-select').val();
    $('#grade-overview-tbody').html('<tr><td colspan="8" class="py-16 text-center"><i class="fas fa-circle-notch fa-spin text-4xl text-purple-500 mb-4 drop-shadow-md"></i><p class="text-slate-500 font-bold tracking-wide">กำลังวิเคราะห์ข้อมูลระดับชั้น...</p></td></tr>');
    try {
        const { data: allRooms, error: roomError } = await db.from('core_classrooms')
            .select('*')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });
        if (roomError) throw roomError;
        const managedNumbers = currentManagedGrades.map(g => (String(g).match(/\d+/) || [])[0]).filter(n => n !== null);
        const rooms = allRooms.filter(r => managedNumbers.includes(String(r.grade_level)));
        if (rooms.length === 0) {
            $('#grade-overview-tbody').html(`<tr><td colspan="8" class="py-12 text-center text-rose-500 font-bold bg-rose-50/50"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><br>ไม่พบข้อมูลห้องเรียนในระดับที่ท่านดูแล</td></tr>`);
            return;
        }
        const roomIds = rooms.map(r => r.id);
        const [enrollRes, attendRes] = await Promise.all([
            db.from('student_enrollments').select('classroom_id').in('classroom_id', roomIds),
            db.from('homeroom_attendance').select('classroom_id, status').in('classroom_id', roomIds).eq('check_date', checkDate)
        ]);
        const studentCounts = {};
        enrollRes.data?.forEach(e => { studentCounts[e.classroom_id] = (studentCounts[e.classroom_id] || 0) + 1; });
        const attSummary = {};
        attendRes.data?.forEach(a => {
            if (!attSummary[a.classroom_id]) attSummary[a.classroom_id] = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0, totalChecked: 0 };
            if (attSummary[a.classroom_id][a.status] !== undefined) {
                attSummary[a.classroom_id][a.status]++;
                attSummary[a.classroom_id].totalChecked++;
            }
        });
        let html = '';
        let gTotal = 0, gP = 0, gA = 0, gL = 0, gLe = 0, gS = 0, gUncheck = 0;
        rooms.forEach(r => {
            const total = studentCounts[r.id] || 0;
            const sum = attSummary[r.id] || { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0, totalChecked: 0 };
            const uncheckCount = total - sum.totalChecked;
            gTotal += total; gP += sum['มา']; gA += sum['ขาด']; gL += sum['สาย']; gLe += sum['ลา']; gS += sum['ป่วย']; gUncheck += uncheckCount;
            let statusBadge = '';
            if (total === 0) statusBadge = '<span class="text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-sm inline-flex items-center"><i class="fas fa-minus-circle mr-1.5"></i>ไม่มีนักเรียน</span>';
            else if (sum.totalChecked === 0) statusBadge = '<span class="text-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 text-[11px] font-bold shadow-sm inline-flex items-center"><i class="fas fa-clock mr-1.5"></i>รอเช็คชื่อ</span>';
            else if (sum.totalChecked < total) statusBadge = `<span class="text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-[11px] font-bold shadow-sm inline-flex items-center"><i class="fas fa-exclamation-triangle mr-1.5"></i>ค้าง ${uncheckCount} คน</span>`;
            else statusBadge = '<span class="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 text-[11px] font-black shadow-sm inline-flex items-center"><i class="fas fa-check-circle mr-1.5"></i>ครบถ้วน</span>';
            html += `<tr class="hover:bg-purple-50/40 transition-all border-b border-slate-100 last:border-0 group cursor-default" data-grade="ม.${r.grade_level}">
                <td class="py-3.5 px-4 text-center font-black text-slate-700 whitespace-nowrap">ม.${r.grade_level}/${r.room_number}</td>
                <td class="py-3.5 px-4 text-center font-bold text-slate-500">${total}</td>
                <td class="py-3.5 px-4 text-center font-black text-emerald-600 bg-emerald-50/20">${sum['มา']}</td>
                <td class="py-3.5 px-4 text-center font-black text-rose-600 bg-rose-50/20">${sum['ขาด']}</td>
                <td class="py-3.5 px-4 text-center font-black text-orange-500 bg-orange-50/20">${sum['สาย']}</td>
                <td class="py-3.5 px-4 text-center font-black text-yellow-600 bg-yellow-50/20">${sum['ลา']}</td>
                <td class="py-3.5 px-4 text-center font-black text-blue-600 bg-blue-50/20">${sum['ป่วย']}</td>
                <td class="py-3.5 px-4 text-center">${statusBadge}</td>
            </tr>`;
        });
        html += `<tr class="bg-purple-100/60 border-t-2 border-purple-200 summary-row">
            <td class="py-4 px-4 text-center font-black text-purple-900">รวมทั้งระดับชั้น</td>
            <td class="py-4 px-4 text-center font-black text-purple-900">${gTotal}</td>
            <td class="py-4 px-4 text-center font-black text-emerald-700">${gP}</td>
            <td class="py-4 px-4 text-center font-black text-rose-700">${gA}</td>
            <td class="py-4 px-4 text-center font-black text-orange-700">${gL}</td>
            <td class="py-4 px-4 text-center font-black text-yellow-700">${gLe}</td>
            <td class="py-4 px-4 text-center font-black text-blue-700">${gS}</td>
            <td class="py-4 px-4 text-center font-black ${gUncheck === 0 ? 'text-emerald-600' : 'text-rose-600'}">${gUncheck === 0 ? '<i class="fas fa-check-double mr-1"></i>เช็คครบ 100%' : '<i class="fas fa-info-circle mr-1"></i>ค้างรวม ' + gUncheck + ' คน'}</td>
        </tr>`;
        $('#grade-overview-tbody').html(html);
        applyGradeOverviewFilters();
    } catch (err) {
        console.error("Overview Error:", err);
        $('#grade-overview-tbody').html(`<tr><td colspan="8" class="py-10 text-center text-rose-500 font-bold bg-rose-50">เกิดข้อผิดพลาด: ${err.message}</td></tr>`);
    }
}

// ✅ ส่วนที่เพิ่มเติม: closeGradeOverview (จำเป็น)
function closeGradeOverview() { 
    $('#grade-overview-modal').addClass('hidden'); 
}

// ==================== STATS MODAL ====================
function openStatsModal() {
    const modal = document.getElementById('stats-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10);
}
function closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
}
async function generateStats() {
    const classroomId = $('#classroom-select').val();
    const startDate = $('#stat-start-date').val();
    const endDate = $('#stat-end-date').val();
    const roomText = $('#classroom-select option:selected').text();
    if (!classroomId || !startDate || !endDate) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและช่วงวันที่ให้ครบถ้วน', 'warning');
    }
    Swal.fire({ title: 'กำลังประมวลผลข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: records, error } = await db.from('homeroom_attendance')
            .select('student_id, status')
            .eq('classroom_id', classroomId)
            .gte('check_date', startDate)
            .lte('check_date', endDate);
        if (error) throw error;
        const sem = currentSchoolInfo ? currentSchoolInfo.current_semester : '-';
        const year = currentSchoolInfo ? currentSchoolInfo.current_academic_year : '-';
        let statsCount = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
        let studentIssues = { 'ขาด': {}, 'สาย': {}, 'ลา': {}, 'ป่วย': {} };
        records.forEach(r => {
            if (statsCount[r.status] !== undefined) {
                statsCount[r.status]++;
                if (r.status !== 'มา') {
                    if (!studentIssues[r.status][r.student_id]) studentIssues[r.status][r.student_id] = 0;
                    studentIssues[r.status][r.student_id]++;
                }
            }
        });
        const studentMap = {};
        currentDashboardStudents.forEach(enroll => {
            const s = enroll.core_students || enroll;
            const sid = enroll.student_id || enroll.id;
            studentMap[sid] = {
                name: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                no: enroll.student_number || '-'
            };
        });
        const generateStatsListHTML = (title, statusKey, icon, colorClass, bgClass) => {
            const issues = studentIssues[statusKey];
            const studentIds = Object.keys(issues);
            if (studentIds.length === 0) return '';
            const list = studentIds.map(sid => {
                const info = studentMap[sid] || { name: 'ไม่พบข้อมูลชื่อ', no: 99 };
                return { name: info.name, no: info.no, count: issues[sid] };
            }).sort((a, b) => a.no - b.no);
            const itemsHTML = list.map(s => `
                <li class="flex justify-between items-center py-1.5 border-b border-slate-200/50 last:border-0" style="page-break-inside: avoid; break-inside: avoid;">
                    <div class="text-[12px] text-slate-700"><span class="font-bold text-slate-500 mr-1">${s.no}.</span> ${s.name}</div>
                    <div class="text-[11px] font-black px-2 py-0.5 rounded-lg bg-white text-slate-600 shadow-sm border border-slate-100">${s.count} ครั้ง</div>
                </li>`).join('');
            return `<div class="${bgClass} p-5 rounded-2xl border border-slate-200 shadow-sm" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 16px;">
                <h4 class="font-black text-sm ${colorClass} mb-3 flex items-center border-b border-white pb-2"><i class="${icon} mr-2"></i> ${title} (${list.length} คน)</h4>
                <ul class="space-y-1">${itemsHTML}</ul>
            </div>`;
        };
        const listsContainer = document.getElementById('stats-student-lists');
        if (listsContainer) {
            listsContainer.innerHTML = generateStatsListHTML('ขาดเรียน', 'ขาด', 'fas fa-user-times', '#be123c', '#fff1f2') +
                generateStatsListHTML('มาสาย', 'สาย', 'fas fa-clock', '#c2410c', '#fff7ed') +
                generateStatsListHTML('ลากิจ', 'ลา', 'fas fa-envelope-open-text', '#a16207', '#fefce8') +
                generateStatsListHTML('ลาป่วย', 'ป่วย', 'fas fa-procedures', '#1d4ed8', '#eff6ff');
            listsContainer.classList.remove('hidden');
        }
        document.getElementById('ui-stats-room-term').textContent = `ระดับชั้น: ${roomText} | ภาคเรียนที่ ${sem}/${year}`;
        document.getElementById('ui-stats-advisers').textContent = `ครูที่ปรึกษา: ${adviser1Name} และ ${adviser2Name}`;
        document.getElementById('stats-pdf-term').textContent = `ภาคเรียนที่ ${sem} ปีการศึกษา ${year}`;
        document.getElementById('stats-pdf-room').textContent = `ระดับชั้น: ${roomText}`;
        document.getElementById('stats-pdf-adviser1').textContent = `ครูที่ปรึกษาคนที่ 1: ${adviser1Name}`;
        document.getElementById('stats-pdf-adviser2').textContent = `ครูที่ปรึกษาคนที่ 2: ${adviser2Name}`;
        document.getElementById('stats-pdf-subtitle').textContent = `ช่วงวันที่: ${formatThaiDate(startDate)} ถึง ${formatThaiDate(endDate)}`;
        renderAttendanceChart(statsCount);
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถประมวลผลข้อมูลได้', 'error');
    }
}
function renderAttendanceChart(stats) {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;
    if (attendanceChartInstance) attendanceChartInstance.destroy();
    const dataValues = [stats['มา'], stats['ขาด'], stats['สาย'], stats['ลา'], stats['ป่วย']];
    const bgColors = ['#10b981', '#f43f5e', '#f97316', '#eab308', '#3b82f6'];
    attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['มาเรียน', 'ขาดเรียน', 'มาสาย', 'ลากิจ', 'ลาป่วย'],
            datasets: [{
                label: 'จำนวนครั้ง (รวมนักเรียนทุกคน)',
                data: dataValues,
                backgroundColor: bgColors,
                borderRadius: 8,
                barThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'กราฟสรุปจำนวนครั้งแยกตามสถานะ', font: { size: 14, family: 'Anuphan' } }
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}
function printStatsPDF() {
    if (!attendanceChartInstance) {
        return Swal.fire('แจ้งเตือน', 'กรุณากดปุ่ม "ดูสถิติ" เพื่อแสดงกราฟและรายชื่อก่อน', 'warning');
    }
    const header = document.getElementById('stats-pdf-header');
    header.classList.remove('hidden');
    const listsContainer = document.getElementById('stats-student-lists');
    if (listsContainer) listsContainer.classList.remove('hidden');
    const element = document.getElementById('stats-print-area');
    const opt = {
        margin: [4, 4, 4, 4],
        filename: `รายงานสถิติ_${$('#classroom-select option:selected').text()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css'], avoid: ['tr'] }
    };
    Swal.fire({ title: 'กำลังเตรียมไฟล์ PDF...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    html2pdf().set(opt).from(element).save().then(() => {
        header.classList.add('hidden');
        if (listsContainer) listsContainer.classList.add('hidden');
        Swal.close();
    });
}

// ==================== UTILS ====================
function applyDateConstraints() {
    const today = new Date();
    const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    let minDateVal = (moduleSettings.enforce_term_start && termStartDate) ? termStartDate : null;
    let maxDateVal = null;
    if (moduleSettings.lock_future_dates) {
        if (termEndDate && new Date(todayStr) > new Date(termEndDate)) maxDateVal = termEndDate;
        else maxDateVal = todayStr;
    } else {
        maxDateVal = termEndDate || null;
    }
    const dateInputNode = document.querySelector('#check-date');
    if (dateInputNode && dateInputNode._flatpickr) {
        dateInputNode._flatpickr.set('minDate', minDateVal);
        dateInputNode._flatpickr.set('maxDate', maxDateVal);
    } else {
        const $dateInput = $('#check-date');
        minDateVal ? $dateInput.attr('min', minDateVal) : $dateInput.removeAttr('min');
        maxDateVal ? $dateInput.attr('max', maxDateVal) : $dateInput.removeAttr('max');
    }
}
async function logout() { await db.auth.signOut(); window.location.href = 'index.html'; }
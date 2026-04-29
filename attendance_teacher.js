/**
 * WRK System - Morning Attendance Logic (Pro Version)
 * อัปเดตล่าสุด: ดึง student_id_card มาแสดงใน PDF อย่างถูกต้อง, วันที่ไทย, Super Admin Select2
 */

let currentUser = null;
let currentSchoolInfo = null;
let actualUserRole = '';
let currentViewRole = 'teacher';
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

const statusStyles = {
    'มา': { active: 'active-มา', inactive: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100 hover:shadow-md' },
    'ขาด': { active: 'active-ขาด', inactive: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:shadow-md' },
    'สาย': { active: 'active-สาย', inactive: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 hover:shadow-md' },
    'ลา': { active: 'active-ลา', inactive: 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100 hover:shadow-md' },
    'ป่วย': { active: 'active-ป่วย', inactive: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:shadow-md' }
};

function formatThaiDateFull(dateStr) {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr);
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = dateObj.getDate();
    const m = dateObj.getMonth();
    const y = dateObj.getFullYear() + 543;
    return `${days[dateObj.getDay()]} ${d} ${months[m]} ${y}`;
}

$(document).ready(async () => {
    $('#check-date').val(new Date().toISOString().split('T')[0]);
    await checkAuth();

    $('#classroom-select').on('change', function () { loadStudentList(this.value); });
    $('#check-date').on('change', function () { loadStudentList($('#classroom-select').val()); });
});

async function checkAuth() {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) { window.location.href = "index.html"; return; }

    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) return;

    currentUser = personnel;
    actualUserRole = personnel.role;

    let userDisplayText = `<i class="fas fa-user-tie mr-1"></i> ครู${personnel.first_name}`;

    const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
    if (schoolInfo) {
        currentSchoolInfo = schoolInfo;
        termStartDate = schoolInfo.term_start_date;
    }

    const { data: settings } = await db.from('module_attendance_settings')
        .select('*').eq('academic_year', schoolInfo.current_academic_year).eq('semester', schoolInfo.current_semester).maybeSingle();

    if (settings) {
        moduleSettings = {
            check_only_weekdays: settings.check_only_weekdays !== false,
            lock_future_dates: settings.lock_future_dates !== false,
            enforce_term_start: settings.enforce_term_start !== false,
            end_date: settings.end_date
        };
        termEndDate = settings.end_date;
    }

    const { data: holidays } = await db.from('module_attendance_holidays').select('*');
    holidayList = holidays || [];

    applyDateConstraints();

    const { data: headInfo } = await db.from('core_grade_heads')
        .select('grade_level')
        .eq('personnel_id', user.id)
        .eq('academic_year', schoolInfo.current_academic_year);

    let managedGrades = headInfo ? headInfo.map(h => h.grade_level) : [];

    currentManagedGrades = managedGrades;
    if (currentManagedGrades.length > 0) $('#btn-grade-overview').removeClass('hidden');
    else $('#btn-grade-overview').addClass('hidden');

    if (managedGrades.length > 0) {
        userDisplayText += `<span class="block text-[10px] text-indigo-600 font-black mt-1 uppercase tracking-wider">หัวหน้าระดับ: ${managedGrades.join(', ')}</span>`;
    }
    $('#user-display').html(userDisplayText);

    // 🌟 จัดการปุ่มสลับโหมดและสิทธิ์ Admin
    if (actualUserRole === 'admin' || actualUserRole === 'super_admin' || managedGrades.length > 0) {

        if (actualUserRole === 'admin' || actualUserRole === 'super_admin') {
            currentViewRole = 'admin';
            $('#admin-settings-btn').removeClass('hidden').addClass('flex');

            if (actualUserRole === 'super_admin') {
                $('#super-admin-section').removeClass('hidden');
                loadAllTeachersForSelect();
            }
        } else {
            currentViewRole = 'teacher';
        }

        const toggleBtn = document.getElementById('btnAdminMode');
        if (toggleBtn) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
            if (currentViewRole === 'admin') {
                toggleBtn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
                toggleBtn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm';
            } else {
                toggleBtn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
                toggleBtn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm';
            }
        }
    }

    const { data: allClassrooms } = await db.from('core_classrooms')
        .select('*')
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester)
        .order('grade_level', { ascending: true })
        .order('room_number', { ascending: true });

    let classrooms = [];

    if (actualUserRole === 'admin' || actualUserRole === 'super_admin') {
        classrooms = allClassrooms;
    } else {
        classrooms = allClassrooms.filter(cls =>
            managedGrades.includes(cls.grade_level) ||
            cls.adviser_id_1 === user.id ||
            cls.adviser_id_2 === user.id
        );
    }

    if (!classrooms || classrooms.length === 0) {
        Swal.fire('ไม่พบห้องเรียน', 'คุณไม่ได้เป็นครูที่ปรึกษา หรือหัวหน้าระดับชั้นในเทอมนี้', 'warning');
        $('#classroom-select').html('<option value="">ไม่มีสิทธิ์เข้าถึงข้อมูล</option>');
        return;
    }

    $('#classroom-select').empty();
    classrooms.forEach(cls => {
        $('#classroom-select').append(`<option value="${cls.id}">ชั้น ${cls.grade_level}/${cls.room_number}</option>`);
    });

    loadStudentList(classrooms[0].id);
}

function applyDateConstraints() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = $('#check-date');
    if (moduleSettings.enforce_term_start && termStartDate) dateInput.attr('min', termStartDate);
    else dateInput.removeAttr('min');

    if (moduleSettings.lock_future_dates) {
        if (termEndDate && new Date(todayStr) > new Date(termEndDate)) dateInput.attr('max', termEndDate);
        else dateInput.attr('max', todayStr);
    } else {
        dateInput.attr('max', termEndDate || '');
    }
}

async function loadStudentList(classroomId) {
    if (!classroomId) return;

    adviser1Name = '.......................................';
    adviser2Name = '.......................................';
    const { data: currentRoom } = await db.from('core_classrooms').select('*').eq('id', classroomId).single();
    if (currentRoom) {
        if (currentRoom.adviser_id_1) {
            const { data: adv1 } = await db.from('core_personnel').select('prefix, first_name, last_name').eq('id', currentRoom.adviser_id_1).single();
            if (adv1) adviser1Name = `${adv1.prefix || ''}${adv1.first_name} ${adv1.last_name}`;
        }
        if (currentRoom.adviser_id_2) {
            const { data: adv2 } = await db.from('core_personnel').select('prefix, first_name, last_name').eq('id', currentRoom.adviser_id_2).single();
            if (adv2) adviser2Name = `${adv2.prefix || ''}${adv2.first_name} ${adv2.last_name}`;
        }
    }

    const checkDate = $('#check-date').val();
    await loadClassroomOverview(classroomId);

    if (!checkDate) return;

    const dateObj = new Date(checkDate);
    const dayOfWeek = dateObj.getDay();
    if (moduleSettings.check_only_weekdays && (dayOfWeek === 0 || dayOfWeek === 6)) {
        $('#student-list').html(`<tr><td colspan="3" class="text-center py-16 text-rose-500 font-bold bg-rose-50/50">ปิดระบบเช็คชื่อ (วันหยุดเสาร์-อาทิตย์)</td></tr>`);
        updateStatsClear(); return;
    }

    const isHoliday = holidayList.find(h => h.holiday_date === checkDate);
    if (isHoliday) {
        $('#student-list').html(`<tr><td colspan="3" class="text-center py-16 text-indigo-600 font-bold bg-indigo-50/50">วันหยุด: ${isHoliday.description} (ระบบบันทึกมาอัตโนมัติ)</td></tr>`);
        updateStatsClear(); return;
    }

    $('#student-list').html('<tr><td colspan="3" class="text-center py-10"><i class="fas fa-spinner fa-spin mr-2 text-blue-500"></i> กำลังดึงข้อมูล...</td></tr>');

    const { data: enrollments } = await db.from('student_enrollments')
        .select(`student_id, student_number, core_students (prefix, first_name, last_name, student_id_card)`)
        .eq('classroom_id', classroomId).order('student_number', { ascending: true });

    const { data: attendance } = await db.from('homeroom_attendance')
        .select('student_id, status')
        .eq('classroom_id', classroomId).eq('check_date', checkDate);

    attendanceData = {};
    attendance?.forEach(row => { attendanceData[row.student_id] = row.status; });

    renderTable(enrollments);
    updateStats();
}

async function loadClassroomOverview(classroomId) {
    if (!termStartDate) return;
    const { data: checkedData } = await db.from('homeroom_attendance').select('check_date').eq('classroom_id', classroomId);

    const uniqueDates = [...new Set(checkedData?.map(d => d.check_date) || [])];
    checkedDatesList = uniqueDates.sort((a, b) => new Date(a) - new Date(b));
    $('#days-checked-count').text(checkedDatesList.length);

    let expectedDates = [];
    let currDate = new Date(termStartDate);
    let endDate = new Date();
    if (termEndDate && endDate > new Date(termEndDate)) endDate = new Date(termEndDate);

    while (currDate <= endDate) {
        let dateStr = currDate.toISOString().split('T')[0];
        let dayOfWeek = currDate.getDay();
        let isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        let isHoliday = holidayList.some(h => h.holiday_date === dateStr);

        if ((!moduleSettings.check_only_weekdays || !isWeekend) && !isHoliday) {
            expectedDates.push(dateStr);
        }
        currDate.setDate(currDate.getDate() + 1);
    }

    missingDatesList = expectedDates.filter(d => !checkedDatesList.includes(d));
    $('#missing-days-count').text(missingDatesList.length);
}

function showCheckedDates() {
    if (checkedDatesList.length === 0) {
        Swal.fire('ข้อมูล', 'ยังไม่มีการเช็คชื่อในเทอมนี้เลยครับ', 'info');
        return;
    }
    const formattedDates = checkedDatesList.map(d => formatThaiDateFull(d)).join('<br>');
    Swal.fire({
        title: 'รายการวันที่เช็คชื่อแล้ว',
        html: `<div class="max-h-48 overflow-y-auto text-sm text-blue-600 font-medium">${formattedDates}</div>`,
        icon: 'info'
    });
}

function showMissingDates() {
    if (missingDatesList.length === 0) {
        Swal.fire('ยอดเยี่ยม!', 'คุณเช็คชื่อครบถ้วนทุกวันแล้วครับ', 'success');
        return;
    }
    const formattedDates = missingDatesList.map(d => formatThaiDateFull(d)).join('<br>');
    Swal.fire({
        title: 'รายการวันที่ยังไม่ได้เช็คชื่อ',
        html: `<div class="max-h-48 overflow-y-auto text-sm text-rose-600 font-medium">${formattedDates}</div>`,
        icon: 'warning'
    });
}

function renderTable(enrollments) {
    const tbody = $('#student-list');
    tbody.empty();

    if (!enrollments || enrollments.length === 0) return;

    enrollments.forEach(item => {
        const std = item.core_students;
        const currentStatus = attendanceData[item.student_id] || '';
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;

        const row = `
            <tr data-student-id="${item.student_id}" data-student-code="${std?.student_id_card || '-'}" class="hover:bg-blue-50/50 transition-colors border-b border-slate-50">
                <td class="px-6 py-4 font-bold text-slate-400 text-center">${item.student_number}</td>
                <td class="px-6 py-4">
                    <div class="font-bold text-blue-700 cursor-pointer hover:text-blue-900 transition-colors" onclick="openStudentHistory('${item.student_id}', '${fullName}', '${item.student_number}')">
                        ${fullName} <i class="fas fa-search text-[10px] ml-1 opacity-50"></i>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex justify-center gap-1 sm:gap-2">
                        ${['มา', 'ขาด', 'สาย', 'ลา', 'ป่วย'].map(s => {
            const colorClass = currentStatus === s ? statusStyles[s].active : statusStyles[s].inactive;
            return `<button onclick="updateAttendance('${item.student_id}', '${s}')" class="status-btn px-3 py-2 rounded-xl border text-[11px] font-black transition-all ${colorClass}">${s}</button>`;
        }).join('')}
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

async function updateAttendance(studentId, status) {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();

    if (!studentId || !classroomId || !currentUser) return;

    const { error } = await db.from('homeroom_attendance').upsert({
        student_id: studentId, classroom_id: classroomId, check_date: checkDate, status: status, teacher_id: currentUser.id
    }, { onConflict: 'student_id,check_date' });

    if (!error) {
        attendanceData[studentId] = status;
        updateStats();

        const row = $(`tr[data-student-id="${studentId}"]`);
        row.find('button').each(function () {
            const btnStatus = $(this).text().trim();
            $(this).removeClass().addClass('status-btn px-3 py-2 rounded-xl border text-[11px] font-black transition-all');
            $(this).addClass(btnStatus === status ? statusStyles[btnStatus].active : statusStyles[btnStatus].inactive);
        });

        loadClassroomOverview(classroomId);
        Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1000 }).fire({ icon: 'success', title: `บันทึก "${status}" เรียบร้อย` });
    }
}

function updateStats() {
    const values = Object.values(attendanceData);
    $('#stat-present').text(values.filter(v => v === 'มา').length);
    $('#stat-absent').text(values.filter(v => v !== 'มา' && v !== '').length);
}
function updateStatsClear() { $('#stat-present').text('0'); $('#stat-absent').text('0'); }

// --- ประวัติรายบุคคล ---
let currentViewStudent = null;

async function openStudentHistory(studentId, studentName, studentNumber) {
    const classroomId = $('#classroom-select').val();
    const className = $('#classroom-select option:selected').text();

    $('#student-history-modal').removeClass('hidden');
    $('#student-history-content').html('<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i></div>');

    const { data: history } = await db.from('homeroom_attendance')
        .select('check_date, status')
        .eq('student_id', studentId)
        .eq('classroom_id', classroomId)
        .order('check_date', { ascending: true });

    let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    let tableRows = '';

    if (history && history.length > 0) {
        history.forEach(h => {
            counts[h.status] = (counts[h.status] || 0) + 1;
            const thaiDate = formatThaiDateFull(h.check_date);
            let color = h.status === 'มา' ? 'text-green-600' : 'text-rose-600';
            tableRows += `<tr class="border-b"><td class="py-2">${thaiDate}</td><td class="py-2 font-bold ${color}">${h.status}</td></tr>`;
        });
    } else {
        tableRows = '<tr><td colspan="2" class="text-center py-4 text-slate-400">ยังไม่มีประวัติการเช็คชื่อ</td></tr>';
    }

    currentViewStudent = { name: studentName, no: studentNumber, counts, history };

    const html = `
        <div class="mb-4">
            <h3 class="text-xl font-bold text-slate-800">เลขที่ ${studentNumber} : ${studentName}</h3>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
            <div class="bg-green-50 p-3 rounded-lg text-center"><p class="text-xs text-green-600 font-bold">มา</p><p class="text-xl font-black text-green-700">${counts['มา']}</p></div>
            <div class="bg-rose-50 p-3 rounded-lg text-center"><p class="text-xs text-rose-600 font-bold">ขาด</p><p class="text-xl font-black text-rose-700">${counts['ขาด']}</p></div>
            <div class="bg-orange-50 p-3 rounded-lg text-center"><p class="text-xs text-orange-600 font-bold">สาย</p><p class="text-xl font-black text-orange-700">${counts['สาย']}</p></div>
            <div class="bg-yellow-50 p-3 rounded-lg text-center"><p class="text-xs text-yellow-600 font-bold">ลา</p><p class="text-xl font-black text-yellow-700">${counts['ลา']}</p></div>
            <div class="bg-blue-50 p-3 rounded-lg text-center"><p class="text-xs text-blue-600 font-bold">ป่วย</p><p class="text-xl font-black text-blue-700">${counts['ป่วย']}</p></div>
        </div>
        <table class="w-full text-sm text-left"><thead class="bg-slate-100 text-slate-500"><tr><th class="py-2 px-2">วันที่</th><th class="py-2 px-2">สถานะ</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
    `;

    $('#student-history-content').html(html);

    $('#btn-export-student-pdf').off('click').on('click', () => {
        exportStudentPDF(studentName, studentNumber, counts, tableRows, className);
    });
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
    for (let i = 0; i < history.length; i += chunkSize) {
        pages.push(history.slice(i, i + chunkSize));
    }
    if (pages.length === 0) pages.push([]);

    const reportElement = document.createElement('div');
    let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333;">`;

    pages.forEach((pageData, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;

        htmlContent += `
        <div style="padding: 20px 40px; box-sizing: border-box; ${!isLastPage ? 'page-break-after: always;' : ''}">
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
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">มา</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">ขาด</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">สาย</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">ลา</th>
                    <th style="border: 1px solid #cbd5e1; padding: 8px;">ป่วย</th>
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
                <thead style="background: #f1f5f9;">
                    <tr>
                        <th style="border: 1px solid #cbd5e1; padding: 8px;">วันที่</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; width: 30%; text-align: center;">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (pageData.length > 0) {
            pageData.forEach(h => {
                const thaiDate = formatThaiDateFull(h.check_date);
                let color = 'color: #333;';
                if (h.status === 'มา') color = 'color: green;';
                else if (h.status === 'ขาด') color = 'color: red;';
                else if (h.status === 'สาย') color = 'color: orange;';
                else if (h.status === 'ลา') color = 'color: #ca8a04;';
                else if (h.status === 'ป่วย') color = 'color: blue;';

                htmlContent += `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">${thaiDate}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-weight: bold; ${color}">${h.status}</td>
                    </tr>
                `;
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
    for (let i = 0; i < studentsList.length; i += chunkSize) {
        pages.push(studentsList.slice(i, i + chunkSize));
    }

    let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333;">`;

    pages.forEach((pageStudents, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;

        htmlContent += `
        <div style="padding: 20px 40px; box-sizing: border-box; ${!isLastPage ? 'page-break-after: always;' : ''}">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${logoUrl}" crossorigin="anonymous" style="height: 60px; display: block; margin: 0 auto 10px auto;" alt="Logo">
                <h2 style="margin: 0; font-size: 18px;">${schoolName}</h2>
                <h3 style="margin: 5px 0 15px 0; font-size: 14px; font-weight: normal;">${termInfo}</h3>
                
                <h2 style="margin: 0; font-size: 16px;">รายงานการเช็คชื่อกิจกรรมหน้าเสาธง/โฮมรูม</h2>
                <h3 style="margin: 5px 0 0 0; font-size: 14px; font-weight: normal;">ชั้นเรียน: ${className} | ประจำวันที่: ${thaiDateText}</h3>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">(หน้าที่ ${pageIndex + 1} / ${pages.length})</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background-color: #f1f5f9;">
                        <th style="border: 1px solid #cbd5e1; padding: 8px; width: 10%; text-align: center;">เลขที่</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">เลขประจำตัว</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; width: 50%; text-align: left;">ชื่อ - นามสกุล</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
        `;

        pageStudents.forEach(std => {
            let color = '';
            if (std.status === 'มา') color = 'color: green;';
            else if (std.status === 'ขาด') color = 'color: red;';

            htmlContent += `
                <tr>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${std.no}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${std.studentCode}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px;">${std.name}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; ${color}">${std.status}</td>
                </tr>
            `;
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
                    <div style="text-align: center;">
                        <p>ลงชื่อ........................................................</p>
                        <p>( ${adviser1Name} )</p>
                        <p>ครูที่ปรึกษา</p>
                    </div>
                    <div style="text-align: center;">
                        <p>ลงชื่อ........................................................</p>
                        <p>( ${adviser2Name} )</p>
                        <p>ครูที่ปรึกษา</p>
                    </div>
                </div>
            `;
        }
        htmlContent += `</div>`;
    });

    htmlContent += `</div>`;

    const opt = {
        margin: 5,
        filename: `รายงานประจำวัน_${className.replace(/\s+/g, '')}_${checkDateStr}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(htmlContent).save().then(() => {
        Swal.close();
        Swal.fire('สำเร็จ', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว', 'success');
    });
}

async function markAllAs(status) {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();

    const studentIds = [];
    $('#student-list tr[data-student-id]').each(function () {
        studentIds.push($(this).data('student-id'));
    });

    if (studentIds.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายชื่อนักเรียนในหน้าจอ', 'warning');
        return;
    }

    Swal.fire({
        title: 'ยืนยันการเช็คชื่อ?',
        text: `บันทึกสถานะ "${status}" ให้กับนักเรียนทุกคน (${studentIds.length} คน)?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const upsertData = studentIds.map(id => ({
                student_id: id, classroom_id: classroomId, check_date: checkDate, status: status, teacher_id: currentUser.id
            }));

            const { error } = await db.from('homeroom_attendance').upsert(upsertData, { onConflict: 'student_id,check_date' });

            if (error) {
                Swal.fire('ผิดพลาด', error.message, 'error');
            } else {
                Swal.fire('สำเร็จ', `บันทึกสถานะ "${status}" ให้ทุกคนเรียบร้อย`, 'success');
                loadStudentList(classroomId);
            }
        }
    });
}

async function clearDailyData() {
    const classroomId = $('#classroom-select').val();
    const checkDate = $('#check-date').val();
    const className = $('#classroom-select option:selected').text();

    if (Object.keys(attendanceData).length === 0) {
        Swal.fire('ไม่มีข้อมูล', `ไม่มีข้อมูลการเช็คชื่อในวันที่ ${checkDate} ให้ลบ`, 'info');
        return;
    }

    Swal.fire({
        title: 'ยืนยันการล้างข้อมูล?',
        text: `คุณต้องการลบข้อมูลการเช็คชื่อของ "${className}" ประจำวันที่ ${checkDate} ใช่หรือไม่? (ข้อมูลจะหายไปถาวร)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบทิ้งเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังล้างข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const { error } = await db.from('homeroom_attendance')
                .delete()
                .eq('classroom_id', classroomId)
                .eq('check_date', checkDate);

            if (error) {
                Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลได้: ' + error.message, 'error');
            } else {
                Swal.fire('สำเร็จ!', 'ล้างข้อมูลของวันนี้เรียบร้อยแล้ว', 'success');
                loadStudentList(classroomId);
            }
        }
    });
}

function openAdminModal() {
    $('#setting-weekdays').prop('checked', moduleSettings.check_only_weekdays);
    $('#setting-lock-future').prop('checked', moduleSettings.lock_future_dates);
    $('#setting-enforce-term-start').prop('checked', moduleSettings.enforce_term_start);
    $('#setting-end-date').val(moduleSettings.end_date || '');
    renderHolidayList();

    if (actualUserRole === 'super_admin') {
        renderGradeHeadsList();
    }

    $('#admin-modal').removeClass('hidden');
}

function closeAdminModal() {
    $('#admin-modal').addClass('hidden');
}

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
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        moduleSettings = newSettings;
        applyDateConstraints();
        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success').then(() => {
            closeAdminModal();
            loadStudentList($('#classroom-select').val());
        });
    }
}

// 🌟 ฟังก์ชันสลับโหมด (แค่เปลี่ยนหน้าตาปุ่ม เพราะสิทธิ์เข้าถึงห้องเรียนดึงไว้แล้ว)
function toggleRoleView() {
    const toggleBtn = document.getElementById('btnAdminMode');

    if (currentViewRole === 'admin') {
        currentViewRole = 'teacher';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
            toggleBtn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm';
        }
        $('#admin-settings-btn').addClass('hidden').removeClass('flex');
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'info', title: 'เปลี่ยนเป็นมุมมองครู', showConfirmButton: false, timer: 1500 });
    } else {
        currentViewRole = 'admin';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
            toggleBtn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm';
        }
        $('#admin-settings-btn').removeClass('hidden').addClass('flex');
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'เปลี่ยนเป็นมุมมอง Admin', showConfirmButton: false, timer: 1500 });
    }
}

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

let allTeachersList = [];

async function loadAllTeachersForSelect() {
    const { data: personnel } = await db.from('core_personnel').select('id, prefix, first_name, last_name').order('first_name');
    if (personnel) {
        allTeachersList = personnel;
        const select = $('#head-teacher-select');

        select.empty();
        select.append('<option value="">-- พิมพ์ชื่อเพื่อค้นหา --</option>');

        personnel.forEach(p => {
            select.append(`<option value="${p.id}">${p.prefix || ''}${p.first_name} ${p.last_name}</option>`);
        });

        select.select2({
            placeholder: "-- พิมพ์ชื่อเพื่อค้นหา --",
            allowClear: true,
            width: '100%',
            dropdownParent: $('#admin-modal')
        });
    }
}

async function renderGradeHeadsList() {
    const tbody = $('#grade-head-list-table');
    tbody.html('<tr><td colspan="3" class="text-center py-4"><i class="fas fa-spinner fa-spin text-rose-500"></i> กำลังโหลด...</td></tr>');

    const { data: heads } = await db.from('core_grade_heads')
        .select(`id, grade_level, personnel_id, core_personnel(prefix, first_name, last_name)`)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .order('grade_level');

    tbody.empty();
    if (!heads || heads.length === 0) {
        tbody.append('<tr><td colspan="3" class="text-center py-4 text-slate-400">ยังไม่มีการแต่งตั้งหัวหน้าระดับชั้น</td></tr>');
        return;
    }

    heads.forEach(h => {
        const teacher = h.core_personnel;
        const teacherName = teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : 'ไม่พบข้อมูลครู';

        tbody.append(`
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2 font-black text-rose-600">${h.grade_level}</td>
                <td class="px-4 py-2 font-bold text-slate-700">${teacherName}</td>
                <td class="px-4 py-2 text-center">
                    <button onclick="removeGradeHead('${h.id}')" class="text-slate-400 hover:text-rose-600 transition-colors bg-white hover:bg-rose-50 px-2 py-1 rounded">
                        <i class="fas fa-user-minus"></i>
                    </button>
                </td>
            </tr>
        `);
    });
}

async function addGradeHead() {
    const teacherId = $('#head-teacher-select').val();
    const gradeLevel = $('#head-grade-select').val();

    if (!teacherId || !gradeLevel) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกคุณครูและระดับชั้นให้ครบถ้วน', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: existing } = await db.from('core_grade_heads')
        .select('id').eq('academic_year', currentSchoolInfo.current_academic_year).eq('grade_level', gradeLevel).maybeSingle();

    if (existing) {
        Swal.fire('ซ้ำซ้อน', `ระดับชั้น ${gradeLevel} มีหัวหน้าระดับแล้ว หากต้องการเปลี่ยน กรุณาถอดถอนคนเก่าก่อน`, 'error');
        return;
    }

    const { error } = await db.from('core_grade_heads').insert([{
        academic_year: currentSchoolInfo.current_academic_year,
        grade_level: gradeLevel,
        personnel_id: teacherId
    }]);

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: `แต่งตั้งหัวหน้าระดับ ${gradeLevel} เรียบร้อย`, showConfirmButton: false, timer: 1500 });
        $('#head-teacher-select').val(null).trigger('change');
        $('#head-grade-select').val('');
        renderGradeHeadsList();
    }
}

async function removeGradeHead(recordId) {
    Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        text: 'ระบบจะยกเลิกสิทธิ์หัวหน้าระดับชั้นของคุณครูท่านนี้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ใช่, ถอดถอนเลย'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const { error } = await db.from('core_grade_heads').delete().eq('id', recordId);
            if (error) {
                Swal.fire('ผิดพลาด', error.message, 'error');
            } else {
                Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'ถอดถอนเรียบร้อย', showConfirmButton: false, timer: 1500 });
                renderGradeHeadsList();
            }
        }
    });
}

// ==========================================
// 🟢 ส่วนการทำงานของ "หัวหน้าระดับชั้น" (Dashboard ภาพรวม)
// ==========================================

async function openGradeOverview() {
    if (!currentManagedGrades || currentManagedGrades.length === 0) {
        Swal.fire('ไม่พบสิทธิ์', 'คุณไม่มีสิทธิ์เข้าถึงภาพรวมระดับชั้น', 'error');
        return;
    }

    const checkDate = $('#check-date').val();
    $('#grade-overview-title').text(`(${currentManagedGrades.join(', ')})`);
    $('#grade-overview-date').text(formatThaiDateFull(checkDate));

    $('#grade-overview-modal').removeClass('hidden');
    $('#grade-overview-tbody').html('<tr><td colspan="8" class="py-10"><i class="fas fa-spinner fa-spin text-3xl text-purple-500"></i><p class="mt-2 text-slate-500 font-bold">กำลังประมวลผลข้อมูลระดับชั้น...</p></td></tr>');

    try {
        const { data: allRooms, error: roomError } = await db.from('core_classrooms')
            .select('*')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });

        if (roomError) throw roomError;

        const managedNumbers = currentManagedGrades.map(g => {
            const match = String(g).match(/\d+/);
            return match ? match[0] : null;
        }).filter(n => n !== null);

        const rooms = allRooms.filter(r => {
            const roomGradeStr = String(r.grade_level);
            return managedNumbers.includes(roomGradeStr);
        });

        if (rooms.length === 0) {
            $('#grade-overview-tbody').html(`<tr><td colspan="8" class="py-10 text-slate-400">ไม่พบข้อมูลห้องเรียนในระดับที่ท่านดูแล<br><small>สิทธิ์: ${currentManagedGrades.join(', ')} | DB Grade: ${allRooms[0]?.grade_level || 'N/A'}</small></td></tr>`);
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
        let gTotal = 0, gP = 0, gA = 0, gL = 0, gLe = 0, gS = 0;

        rooms.forEach(r => {
            const total = studentCounts[r.id] || 0;
            const sum = attSummary[r.id] || { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0, totalChecked: 0 };

            gTotal += total; gP += sum['มา']; gA += sum['ขาด']; gL += sum['สาย']; gLe += sum['ลา']; gS += sum['ป่วย'];

            let statusBadge = '';
            if (sum.totalChecked === 0) statusBadge = '<span class="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 text-[10px] font-bold">ยังไม่เช็ค</span>';
            else if (sum.totalChecked < total) statusBadge = '<span class="text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 text-[10px] font-bold">เช็คไม่ครบ</span>';
            else statusBadge = '<span class="text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 text-[10px] font-bold">ครบถ้วน</span>';

            html += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4 text-left font-bold text-slate-700">ม.${r.grade_level}/${r.room_number}</td>
                    <td class="py-3 px-4 text-slate-500">${total}</td>
                    <td class="py-3 px-4 text-green-600 font-bold">${sum['มา']}</td>
                    <td class="py-3 px-4 text-rose-600 font-bold">${sum['ขาด']}</td>
                    <td class="py-3 px-4 text-orange-500">${sum['สาย']}</td>
                    <td class="py-3 px-4 text-yellow-600">${sum['ลา']}</td>
                    <td class="py-3 px-4 text-blue-600">${sum['ป่วย']}</td>
                    <td class="py-3 px-4">${statusBadge}</td>
                </tr>`;
        });

        html += `
            <tr class="bg-purple-50 font-black text-purple-900">
                <td class="py-4 px-4 text-left">รวมทั้งระดับชั้น</td>
                <td class="py-4 px-4">${gTotal}</td>
                <td class="py-4 px-4 text-green-700">${gP}</td>
                <td class="py-4 px-4 text-rose-700">${gA}</td>
                <td class="py-4 px-4 text-orange-600">${gL}</td>
                <td class="py-4 px-4 text-yellow-700">${gLe}</td>
                <td class="py-4 px-4 text-blue-700">${gS}</td>
                <td class="py-4 px-4">-</td>
            </tr>`;

        $('#grade-overview-tbody').html(html);

    } catch (err) {
        console.error("Overview Error:", err);
        $('#grade-overview-tbody').html(`<tr><td colspan="8" class="py-10 text-rose-500">เกิดข้อผิดพลาด: ${err.message}</td></tr>`);
    }
}

function closeGradeOverview() {
    $('#grade-overview-modal').addClass('hidden');
}

async function exportGradeOverviewPDF() {
    Swal.fire({ title: 'กำลังสร้างรายงาน...', text: 'กรุณารอซักครู่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const checkDate = $('#check-date').val();
    const thaiDateText = formatThaiDateFull(checkDate);
    const gradeTitle = currentManagedGrades.join(', ');

    const schoolName = currentSchoolInfo?.school_name_th || currentSchoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
    const termInfo = `ภาคเรียนที่ ${currentSchoolInfo?.current_semester || '-'} ปีการศึกษา ${currentSchoolInfo?.current_academic_year || '-'}`;
    const logoUrl = currentSchoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    const headTeacherName = `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`;

    try {
        const { data: allRooms } = await db.from('core_classrooms')
            .select('*')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('room_number', { ascending: true });

        const cleanManagedNumbers = currentManagedGrades.map(g => {
            const m = String(g).match(/\d+/);
            return m ? m[0] : null;
        }).filter(n => n !== null);

        const targetRooms = allRooms.filter(r => cleanManagedNumbers.includes(String(r.grade_level)));
        const targetRoomIds = targetRooms.map(r => r.id);
        const roomMap = {}; targetRooms.forEach(r => roomMap[r.id] = `ม.${r.grade_level}/${r.room_number}`);

        const [enrollRes, attendRes] = await Promise.all([
            db.from('student_enrollments').select(`student_id, student_number, classroom_id, core_students(student_id_card, prefix, first_name, last_name)`).in('classroom_id', targetRoomIds),
            db.from('homeroom_attendance').select('student_id, classroom_id, status').in('classroom_id', targetRoomIds).eq('check_date', checkDate)
        ]);

        const students = enrollRes.data || [];
        const attendance = attendRes.data || [];

        const roomsPerPage = targetRooms.length > 15 ? 10 : 15;
        const roomChunks = [];
        for (let i = 0; i < targetRooms.length; i += roomsPerPage) {
            roomChunks.push(targetRooms.slice(i, i + roomsPerPage));
        }

        let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333; background: white;">`;

        let gTotal = 0, gP = 0, gA = 0, gLa = 0, gLe = 0, gS = 0;
        roomChunks.forEach((chunk, index) => {
            const isLastChunk = index === roomChunks.length - 1;
            htmlContent += `
            <div style="padding: 15px 30px; ${!isLastChunk ? 'page-break-after: always;' : ''}">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="${logoUrl}" crossorigin="anonymous" style="height: 70px; display: block; margin: 0 auto 10px auto;">
                    <h2 style="margin: 0; font-size: 18px;">${schoolName}</h2>
                    <h3 style="margin: 5px 0 10px 0; font-size: 14px; font-weight: normal;">${termInfo}</h3>
                    <h2 style="margin: 0; font-size: 16px; color: #7e22ce;">รายงานสรุปการเช็คชื่อกิจกรรมหน้าเสาธง/โฮมรูม ระดับชั้น ${gradeTitle}</h2>
                    <h3 style="margin: 5px 0 15px 0; font-size: 14px; font-weight: normal;">ประจำวันที่: ${thaiDateText}</h3>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f8fafc;">
                            <th style="border: 1px solid #cbd5e1; padding: 10px; text-align: left;">ห้องเรียน</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 15%;">นร. ทั้งหมด</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 10%; color: green;">มา</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 10%; color: red;">ขาด</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 10%; color: orange;">สาย</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 10%; color: #ca8a04;">ลา</th>
                            <th style="border: 1px solid #cbd5e1; padding: 10px; width: 10%; color: blue;">ป่วย</th>
                        </tr>
                    </thead>
                    <tbody>`;

            chunk.forEach(r => {
                const rEnroll = students.filter(s => s.classroom_id === r.id);
                const rAttend = attendance.filter(a => a.classroom_id === r.id);
                const total = rEnroll.length;
                const p = rAttend.filter(a => a.status === 'มา').length;
                const a = rAttend.filter(a => a.status === 'ขาด').length;
                const la = rAttend.filter(a => a.status === 'สาย').length;
                const le = rAttend.filter(a => a.status === 'ลา').length;
                const s = rAttend.filter(a => a.status === 'ป่วย').length;
                gTotal += total; gP += p; gA += a; gLa += la; gLe += le; gS += s;

                htmlContent += `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ม.${r.grade_level}/${r.room_number}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">${total}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">${p}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; color: ${a > 0 ? 'red' : '#333'};">${a}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; color: orange;">${la}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; color: #ca8a04;">${le}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; color: blue;">${s}</td>
                    </tr>`;
            });

            if (isLastChunk) {
                htmlContent += `
                    <tr style="background-color: #f5f3ff; font-weight: bold;">
                        <td style="border: 1px solid #cbd5e1; padding: 10px; text-align: left;">รวมทั้งระดับชั้น</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gTotal}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gP}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gA}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gLa}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gLe}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${gS}</td>
                    </tr>`;
            }
            htmlContent += `</tbody></table>`;

            if (isLastChunk) {
                htmlContent += `
                <div style="margin-top: 30px; display: flex; justify-content: flex-end;">
                    <div style="text-align: center; width: 250px;">
                        <p>ลงชื่อ........................................................</p>
                        <p style="margin: 8px 0;">( ${headTeacherName} )</p>
                        <p>หัวหน้าระดับชั้น ${gradeTitle}</p>
                    </div>
                </div>`;
            }
            htmlContent += `</div>`;
        });

        let exceptionHtml = '';
        const statuses = ['ขาด', 'สาย', 'ลา', 'ป่วย'];

        statuses.forEach(statusType => {
            const list = attendance.filter(a => a.status === statusType).map(a => {
                const s = students.find(std => std.student_id === a.student_id);
                return {
                    room: roomMap[a.classroom_id],
                    no: s?.student_number || '-',
                    code: s?.core_students?.student_id_card || '-',
                    name: s ? `${s.core_students.prefix}${s.core_students.first_name} ${s.core_students.last_name}` : 'ไม่พบข้อมูล'
                };
            }).sort((a, b) => a.room.localeCompare(b.room, 'th') || a.no - b.no);

            if (list.length > 0) {
                exceptionHtml += `
                <div style="margin-bottom: 25px;">
                    <h3 style="border-left: 5px solid #7e22ce; padding-left: 10px; margin-bottom: 10px; font-size: 15px;">
                        สรุปรายชื่อนักเรียนที่ <span style="font-size: 17px; color: ${statusType === 'ขาด' ? 'red' : '#7e22ce'}">"${statusType}"</span>
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background-color: #f1f5f9;">
                                <th style="border: 1px solid #cbd5e1; padding: 8px; width: 15%;">ห้อง</th>
                                <th style="border: 1px solid #cbd5e1; padding: 8px; width: 10%;">เลขที่</th>
                                <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%;">เลขประจำตัว</th>
                                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">ชื่อ - นามสกุล</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${list.map(s => `
                                <tr>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${s.room}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${s.no}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${s.code}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">${s.name}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            }
        });

        if (exceptionHtml !== '') {
            htmlContent += `<div style="padding: 15px 30px; page-break-before: always;">${exceptionHtml}</div>`;
        }

        htmlContent += `</div>`;
        const reportElement = document.createElement('div');
        reportElement.innerHTML = htmlContent;

        html2pdf().set({
            margin: 5,
            filename: `สรุปภาพรวม_${gradeTitle}_${checkDate}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(reportElement).save().then(() => {
            Swal.close();
            Swal.fire('สำเร็จ', 'ดาวน์โหลดรายงานเรียบร้อยแล้ว', 'success');
        });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'ไม่สามารถสร้างรายงานได้: ' + err.message, 'error');
    }
}

async function logout() { await db.auth.signOut(); window.location.href = "index.html"; }

// ฟังก์ชันสำหรับเปิดหน้าต่างประวัติการเช็คชื่อ
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

    // สรุปรายวัน
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
                <thead class="bg-slate-100 sticky top-0">
                    <tr>
                        <th class="py-2 px-3">วันที่</th>
                        <th class="py-2 px-3 text-center text-green-600">มา</th>
                        <th class="py-2 px-3 text-center text-rose-600">ขาด</th>
                        <th class="py-2 px-3 text-center text-orange-500">สาย</th>
                        <th class="py-2 px-3 text-center text-yellow-600">ลา</th>
                        <th class="py-2 px-3 text-center text-blue-600">ป่วย</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#64748b'
    });
}

// ==========================================
// ล้างข้อมูลการเช็คชื่อ — รองรับทั้งครูและแอดมิน
// ครู: เฉพาะห้องที่ตัวเองเป็นครูที่ปรึกษา
// แอดมิน: เลือกห้องใดก็ได้
// ==========================================
async function clearAttendanceData() {
    const isAdmin = (actualUserRole === 'super_admin' || actualUserRole === 'admin');

    // ── สร้างตัวเลือกห้องเรียน ──
    let classroomOptions = [];
    if (isAdmin) {
        Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
// 🌟 โค้ดใหม่: เพิ่ม .eq() เพื่อกรองเฉพาะเทอมปัจจุบัน
        const { data, error } = await db.from('core_classrooms')
            .select('id, grade_level, room_number, semester, academic_year')
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });
        Swal.close();
        if (error || !data) return Swal.fire('ผิดพลาด', 'โหลดห้องเรียนไม่ได้', 'error');
        classroomOptions = data.map(r => ({ id: r.id, label: `ม.${r.grade_level}/${r.room_number}(${r.semester}/${r.academic_year})` }));
    } else {
        // ดึงรายการห้องจาก dropdown ที่ load ไว้แล้ว (เฉพาะห้องที่ครูมีสิทธิ์)
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

    // ── เปิด popup เลือกห้อง + โหมด + วันที่ ──
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
            // toggle single/range
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
                // 🌟 แยกสตริงด้วย " ถึง " (ภาษาไทย) หรือ " to " (ภาษาอังกฤษ)
                let parts = [];
                if (rangeVal.includes(' ถึง ')) {
                    parts = rangeVal.split(' ถึง ');
                } else {
                    parts = rangeVal.split(' to ');
                }
                startDate = parts[0].trim();
                endDate = (parts[1] ? parts[1].trim() : startDate);
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
        // ── Bug Fix: ตารางถูกต้องคือ homeroom_attendance ──
        const { error } = await db.from('homeroom_attendance')
            .delete()
            .eq('classroom_id', form.roomId)
            .gte('check_date', form.startDate)
            .lte('check_date', form.endDate);

        if (error) throw error;

        await Swal.fire({
            icon: 'success', title: 'ล้างข้อมูลสำเร็จ!',
            html: `<p class="text-sm">ลบข้อมูลการเช็คชื่อของ <b>${form.roomLabel}</b><br>วันที่ <b>${dateDisplay}</b> เรียบร้อยแล้ว</p>`,
            timer: 2500, showConfirmButton: true
        });

        // ── Bug Fix: เรียก loadStudentList ไม่ใช่ loadRoomData ──
        loadStudentList(currentClassroomId);
        loadClassroomOverview(currentClassroomId);

    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

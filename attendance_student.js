/**
 * WRK System - Student Attendance Viewer (v2 — Term Selector)
 * นักเรียนดูประวัติการเช็คชื่อของตนเอง พร้อมเลือกเทอมย้อนหลัง
 */

let currentStudent = null;
let currentEnrollment = null;
let currentSchoolInfo = null;
let attendanceHistory = [];

// ✅ Academic Terms
let academicTerms = [];
let selectedTerm = null;

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
    await checkAuth();
});

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        window.location.replace("index.html");
        return;
    }

    try {
        const studentSid = session.user.email.split('@')[0];
        console.log('🔍 Student SID:', studentSid);

        const { data: student, error: studentError } = await db
            .from('core_students')
            .select(`
                *,
                student_enrollments (
                    student_number,
                    classroom_id,
                    academic_year,
                    semester,
                    core_classrooms (
                        grade_level,
                        room_number
                    )
                )
            `)
            .eq('student_id_card', studentSid)
            .single();

        if (studentError || !student) {
            console.error('❌ Student not found:', studentError);
            await db.auth.signOut();
            window.location.replace("index.html");
            return;
        }

        currentStudent = student;
        console.log('✅ Student found:', currentStudent.id);

        const enrollments = student.student_enrollments || [];
        console.log('📋 Enrollments from nested select:', enrollments);

        if (enrollments.length === 0) {
            Swal.fire('ไม่พบห้องเรียน', 'ท่านไม่ได้ลงทะเบียนในระบบ กรุณาติดต่อครูที่ปรึกษา', 'warning').then(() => logout());
            return;
        }

        // โหลด school_info + terms (parallel)
        const [schoolRes, termsRes] = await Promise.all([
            db.from('core_school_info').select('*').single(),
            db.from('core_academic_terms').select('*').eq('is_active', true)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false })
        ]);

        if (schoolRes.data) currentSchoolInfo = schoolRes.data;
        if (termsRes.data) academicTerms = termsRes.data;

        // ✅ หา enrollment ล่าสุดเป็น default
        const sorted = [...enrollments].sort((a, b) => {
            const yearA = parseInt(a.academic_year) || 0;
            const yearB = parseInt(b.academic_year) || 0;
            if (yearA !== yearB) return yearB - yearA;
            return (parseInt(b.semester) || 0) - (parseInt(a.semester) || 0);
        });

        const latestEnr = sorted[0];
        console.log('✅ Selected latest enrollment:', latestEnr);

        const classroom = latestEnr.core_classrooms;
        if (!classroom) {
            console.error('❌ No classroom data');
            Swal.fire('ไม่พบห้องเรียน', 'ไม่พบข้อมูลห้องเรียนของท่าน กรุณาติดต่อครูที่ปรึกษา', 'warning').then(() => logout());
            return;
        }

        currentEnrollment = {
            student_number: latestEnr.student_number,
            classroom_id: latestEnr.classroom_id,
            academic_year: latestEnr.academic_year,
            semester: latestEnr.semester,
            core_classrooms: classroom
        };

        // ✅ ตั้ง default term
        if (academicTerms.length > 0) {
            const defaultKey = `${latestEnr.academic_year}_${latestEnr.semester}`;
            selectedTerm = academicTerms.find(t => `${t.academic_year}_${t.semester}` === defaultKey) || academicTerms[0];
        }

        // ✅ แสดงข้อมูลส่วนตัว
        const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
        const className = `ม.${classroom.grade_level}/${classroom.room_number}`;

        $('#student-fullname').text(fullName);
        $('#student-info').html(`
            <p><i class="fas fa-graduation-cap w-5 text-center text-emerald-400 drop-shadow-sm"></i> ชั้นมัธยมศึกษาปีที่ ${className}</p>
            <p><i class="fas fa-list-ol w-5 text-center text-emerald-400 drop-shadow-sm"></i> เลขที่ ${currentEnrollment.student_number || '-'}</p>
            <p><i class="fas fa-id-card w-5 text-center text-emerald-400 drop-shadow-sm"></i> รหัสประจำตัว: ${currentStudent.student_id_card || '-'}</p>
        `);

        // ✅ จัดการรูปโปรไฟล์
        const avatarUrl = currentStudent.avatar_students_url;
        if (avatarUrl) {
            $('#student-avatar').attr('src', avatarUrl).removeClass('hidden');
            $('#student-avatar-placeholder').addClass('hidden');
        } else {
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentStudent.first_name)}&background=d1fae5&color=059669&font-size=0.4&bold=true`;
            $('#student-avatar').attr('src', fallbackUrl).removeClass('hidden');
            $('#student-avatar-placeholder').addClass('hidden');
        }

        $('#user-display').html(`<i class="fas fa-user-graduate mr-1 text-emerald-600"></i>${currentStudent.first_name} ${currentStudent.last_name}`);

        // ✅ populate term dropdown
        populateStudentTermSelect();

        await loadAttendanceHistory();
    } catch (err) {
        console.error('❌ Auth Error:', err);
        window.location.replace("index.html");
    }
}

// ==========================================
// ✅ Term Dropdown
// ==========================================
function populateStudentTermSelect() {
    const sel = document.getElementById('term-select-student');
    if (!sel) return;

    if (academicTerms.length === 0) {
        sel.innerHTML = '<option value="">-- ไม่พบภาคเรียน --</option>';
        return;
    }

    const studentEnrollments = currentStudent.student_enrollments || [];

    sel.innerHTML = academicTerms.map(t => {
        const key = `${t.academic_year}_${t.semester}`;
        const hasEnr = studentEnrollments.some(e =>
            String(e.academic_year) === String(t.academic_year) &&
            String(e.semester) === String(t.semester)
        );
        const isSelected = selectedTerm && `${selectedTerm.academic_year}_${selectedTerm.semester}` === key;
        return `<option value="${key}" ${!hasEnr ? 'disabled' : ''} ${isSelected ? 'selected' : ''}>
            เทอม ${t.semester}/${t.academic_year}${!hasEnr ? ' (ไม่มีข้อมูล)' : ''}
        </option>`;
    }).join('');

    // set value
    if (selectedTerm) {
        const key = `${selectedTerm.academic_year}_${selectedTerm.semester}`;
        if (academicTerms.some(t => `${t.academic_year}_${t.semester}` === key)) {
            sel.value = key;
        }
    }

    updateStudentTermDisplay();
}

function updateStudentTermDisplay() {
    const el = document.getElementById('student-current-term');
    if (!el) return;

    if (!selectedTerm) {
        el.innerHTML = '<i class="fas fa-calendar-alt mr-1"></i> ไม่พบข้อมูลเทอม';
        return;
    }

    const startThai = formatThaiDateFull(selectedTerm.start_date);
    const endThai = formatThaiDateFull(selectedTerm.end_date);
    el.innerHTML = `<i class="fas fa-calendar-alt mr-1"></i> เทอม ${selectedTerm.semester}/${selectedTerm.academic_year} (${startThai} - ${endThai})`;
}

async function onStudentTermChanged() {
    const sel = document.getElementById('term-select-student');
    const key = sel.value;
    if (!key) return;

    selectedTerm = academicTerms.find(t => `${t.academic_year}_${t.semester}` === key);
    if (!selectedTerm) return;

    const enrollments = currentStudent.student_enrollments || [];
    const targetEnr = enrollments.find(e =>
        String(e.academic_year) === String(selectedTerm.academic_year) &&
        String(e.semester) === String(selectedTerm.semester)
    );

    if (!targetEnr) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบการลงทะเบียนในภาคเรียนนี้', 'info');
        return;
    }

    currentEnrollment = {
        student_number: targetEnr.student_number,
        classroom_id: targetEnr.classroom_id,
        academic_year: targetEnr.academic_year,
        semester: targetEnr.semester,
        core_classrooms: targetEnr.core_classrooms
    };

    // อัปเดตการแสดงผล
    const classroom = targetEnr.core_classrooms;
    if (classroom) {
        const className = `ม.${classroom.grade_level}/${classroom.room_number}`;
        $('#student-info').html(`
            <p><i class="fas fa-graduation-cap w-5 text-center text-emerald-400 drop-shadow-sm"></i> ชั้นมัธยมศึกษาปีที่ ${className}</p>
            <p><i class="fas fa-list-ol w-5 text-center text-emerald-400 drop-shadow-sm"></i> เลขที่ ${targetEnr.student_number || '-'}</p>
            <p><i class="fas fa-id-card w-5 text-center text-emerald-400 drop-shadow-sm"></i> รหัสประจำตัว: ${currentStudent.student_id_card || '-'}</p>
        `);
    }

    updateStudentTermDisplay();
    await loadAttendanceHistory();
}

// ==========================================
// Load Attendance History
// ==========================================
async function loadAttendanceHistory() {
    $('#history-list').html(`
        <tr><td colspan="2" class="text-center py-16">
            <i class="fas fa-spinner fa-spin text-3xl text-emerald-200"></i>
            <p class="text-slate-400 font-medium mt-2">กำลังโหลด...</p>
        </td></tr>`);

    let query = db.from('homeroom_attendance')
        .select('check_date, status')
        .eq('student_id', currentStudent.id)
        .eq('classroom_id', currentEnrollment.classroom_id);

    // ✅ filter ตามช่วงวันที่ของเทอมที่เลือก
    if (selectedTerm) {
        query = query
            .gte('check_date', selectedTerm.start_date)
            .lte('check_date', selectedTerm.end_date);
    }

    const { data, error } = await query.order('check_date', { ascending: false });

    if (error) {
        $('#history-list').html('<tr><td colspan="2" class="text-center py-10 text-rose-500">ไม่สามารถโหลดข้อมูลได้</td></tr>');
        return;
    }

    attendanceHistory = data || [];

    let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    attendanceHistory.forEach(h => {
        if (counts[h.status] !== undefined) counts[h.status]++;
    });

    $('#count-present').text(counts['มา']);
    $('#count-absent').text(counts['ขาด']);
    $('#count-late').text(counts['สาย']);
    $('#count-leave').text(counts['ลา']);
    $('#count-sick').text(counts['ป่วย']);

    if (attendanceHistory.length === 0) {
        $('#history-list').html('<tr><td colspan="2" class="text-center py-16 text-slate-400 font-medium">ยังไม่มีประวัติการเช็คชื่อในเทอมนี้</td></tr>');
        return;
    }

    let rows = '';
    attendanceHistory.forEach(h => {
        const thaiDate = formatThaiDateFull(h.check_date);
        let colorClass = 'text-slate-700 bg-slate-100';
        if (h.status === 'มา') colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        else if (h.status === 'ขาด') colorClass = 'text-rose-700 bg-rose-50 border-rose-200';
        else if (h.status === 'สาย') colorClass = 'text-orange-700 bg-orange-50 border-orange-200';
        else if (h.status === 'ลา') colorClass = 'text-yellow-700 bg-yellow-50 border-yellow-200';
        else if (h.status === 'ป่วย') colorClass = 'text-blue-700 bg-blue-50 border-blue-200';

        rows += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="px-6 py-4 font-bold text-slate-600 text-[13px]">${thaiDate}</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 text-xs font-black rounded-xl border ${colorClass}">${h.status}</span>
                </td>
            </tr>
        `;
    });

    $('#history-list').html(rows);
}

// ==========================================
// Export PDF
// ==========================================
async function exportToPDF() {
    if (attendanceHistory.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีประวัติให้พิมพ์', 'info');
        return;
    }

    Swal.fire({ title: 'กำลังสร้างเอกสาร PDF...', text: 'จัดหน้าเอกสาร กรุณารอสักครู่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const schoolName = currentSchoolInfo?.school_name_th || currentSchoolInfo?.school_name || 'โรงเรียน (ตั้งค่าชื่อโรงเรียนในระบบส่วนกลาง)';

    // ✅ ใช้ข้อมูลเทอมที่เลือก
    const termInfo = selectedTerm
        ? `ภาคเรียนที่ ${selectedTerm.semester} ปีการศึกษา ${selectedTerm.academic_year}`
        : `ภาคเรียนที่ ${currentSchoolInfo?.current_semester || '-'} ปีการศึกษา ${currentSchoolInfo?.current_academic_year || '-'}`;

    const logoUrl = currentSchoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    const studentFullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
    const className = `ม.${currentEnrollment.core_classrooms.grade_level}/${currentEnrollment.core_classrooms.room_number}`;

    let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    attendanceHistory.forEach(h => counts[h.status]++);

    const chunkSize = 20;
    const pages = [];
    for (let i = 0; i < attendanceHistory.length; i += chunkSize) {
        pages.push(attendanceHistory.slice(i, i + chunkSize));
    }

    let htmlContent = `<div style="font-family: 'Anuphan', sans-serif; color: #333;">`;

    pages.forEach((pageData, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;

        htmlContent += `
        <div style="padding: 20px 40px; box-sizing: border-box; ${!isLastPage ? 'page-break-after: always;' : ''}">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${logoUrl}" crossorigin="anonymous" style="height: 60px; display: block; margin: 0 auto 10px auto;" alt="Logo">
                <h2 style="margin: 0; font-size: 18px;">${schoolName}</h2>
                <h3 style="margin: 5px 0 15px 0; font-size: 14px; font-weight: normal;">${termInfo}</h3>
                <h2 style="margin: 0; font-size: 16px; color: #059669;">รายงานประวัติการมาเรียนรายบุคคล</h2>
                <h3 style="margin: 10px 0 5px 0; font-size: 14px; font-weight: normal;">
                    ชื่อ: ${studentFullName} | เลขที่ ${currentEnrollment.student_number} | ชั้น ${className}
                </h3>
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
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #059669; font-weight: bold;">${counts['มา']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #e11d48;">${counts['ขาด']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #ea580c;">${counts['สาย']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #ca8a04;">${counts['ลา']}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 8px; color: #2563eb;">${counts['ป่วย']}</td>
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
                let colorStyle = 'color: #333;';
                if (h.status === 'มา') colorStyle = 'color: #059669; font-weight: bold;';
                else if (h.status === 'ขาด') colorStyle = 'color: #e11d48; font-weight: bold;';
                else if (h.status === 'สาย') colorStyle = 'color: #ea580c;';
                else if (h.status === 'ลา') colorStyle = 'color: #ca8a04;';
                else if (h.status === 'ป่วย') colorStyle = 'color: #2563eb;';

                htmlContent += `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px;">${thaiDate}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; ${colorStyle}">${h.status}</td>
                    </tr>
                `;
            });
        } else {
            htmlContent += `<tr><td colspan="2" style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #94a3b8;">ยังไม่มีประวัติ</td></tr>`;
        }

        htmlContent += `</tbody></table></div>`;
    });

    htmlContent += `</div>`;

    const opt = {
        margin: 5,
        filename: `ประวัติการมาเรียน_${studentFullName.replace(/\s+/g, '')}_${selectedTerm ? selectedTerm.semester + '-' + selectedTerm.academic_year : ''}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(htmlContent).save().then(() => {
        Swal.close();
        Swal.fire('สำเร็จ', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว', 'success');
    });
}

async function logout() {
    await db.auth.signOut();
    window.location.href = "index.html";
}

// Export
window.onStudentTermChanged = onStudentTermChanged;
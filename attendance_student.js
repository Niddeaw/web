/**
 * WRK System - Student Attendance Viewer
 * นักเรียนดูประวัติการเช็คชื่อของตนเอง
 */

let currentStudent = null;
let currentEnrollment = null;
let currentSchoolInfo = null;
let attendanceHistory = [];

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
    // ✅ ตรวจสอบ session จาก Supabase Auth แทน localStorage
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        window.location.replace("index.html");
        return;
    }

    try {
        // ✅ ดึง SID จาก email (รูปแบบ: {student_id_card}@wrk.ac.th)
        const studentSid = session.user.email.split('@')[0];

        // ดึงข้อมูลนักเรียนจาก core_students
        const { data: student, error: studentError } = await db
            .from('core_students')
            .select('*')
            .eq('student_id_card', studentSid)
            .single();

        if (studentError || !student) {
            console.error("ไม่พบข้อมูลนักเรียน:", studentError);
            await db.auth.signOut();
            window.location.replace("index.html");
            return;
        }

        currentStudent = student;

        // ดึงข้อมูลโรงเรียน
        const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
        if (schoolInfo) currentSchoolInfo = schoolInfo;

        // หาการลงทะเบียนปัจจุบัน
        const { data: enrollment, error: enrollError } = await db.from('student_enrollments')
            .select('student_number, classroom_id, core_classrooms!inner(grade_level, room_number, academic_year, semester)')
            .eq('student_id', currentStudent.id)
            .eq('core_classrooms.academic_year', schoolInfo?.current_academic_year)
            .eq('core_classrooms.semester', schoolInfo?.current_semester)
            .maybeSingle();

        if (enrollError || !enrollment) {
            Swal.fire('ไม่พบห้องเรียน', 'ท่านไม่ได้ลงทะเบียนในภาคเรียนนี้', 'warning').then(() => logout());
            return;
        }

        currentEnrollment = enrollment;

        // 🟢 1. แสดงข้อมูลส่วนตัว (อัปเดตให้ตรงกับ HTML ดีไซน์ใหม่)
        const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
        const className = `ม.${enrollment.core_classrooms.grade_level}/${enrollment.core_classrooms.room_number}`;
        
        $('#student-fullname').text(fullName);
        $('#student-info').html(`
            <p><i class="fas fa-graduation-cap w-5 text-center text-emerald-400 drop-shadow-sm"></i> ชั้นมัธยมศึกษาปีที่ ${className}</p>
            <p><i class="fas fa-list-ol w-5 text-center text-emerald-400 drop-shadow-sm"></i> เลขที่ ${enrollment.student_number}</p>
            <p><i class="fas fa-id-card w-5 text-center text-emerald-400 drop-shadow-sm"></i> รหัสประจำตัว: ${currentStudent.student_id_card || '-'}</p>
        `);
        
        // 🟢 2. จัดการรูปโปรไฟล์ (Avatar)
        const avatarUrl = currentStudent.avatar_students_url;
        if (avatarUrl) {
            $('#student-avatar').attr('src', avatarUrl).removeClass('hidden');
            $('#student-avatar-placeholder').addClass('hidden');
        } else {
            // ถ้าไม่มีรูประบบจะเจนรูปตัวอักษรสีเขียว (สไตล์หน้าเด็กนักเรียน) แทนให้อัตโนมัติ
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentStudent.first_name)}&background=d1fae5&color=059669&font-size=0.4&bold=true`;
            $('#student-avatar').attr('src', fallbackUrl).removeClass('hidden');
            $('#student-avatar-placeholder').addClass('hidden');
        }

        $('#user-display').html(`<i class="fas fa-user-graduate mr-1 text-emerald-600"></i>${currentStudent.first_name} ${currentStudent.last_name}`);

        await loadAttendanceHistory();
    } catch (err) {
        console.error("Auth Error:", err);
        window.location.replace("index.html");
    }
}

async function loadAttendanceHistory() {
    const { data, error } = await db.from('homeroom_attendance')
        .select('check_date, status')
        .eq('student_id', currentStudent.id)
        .eq('classroom_id', currentEnrollment.classroom_id)
        .order('check_date', { ascending: false });

    if (error) {
        $('#history-list').html('<tr><td colspan="2" class="text-center py-10 text-rose-500">ไม่สามารถโหลดข้อมูลได้</td></tr>');
        return;
    }

    attendanceHistory = data || [];

    // คำนวณสถิติ
    let counts = { 'มา': 0, 'ขาด': 0, 'สาย': 0, 'ลา': 0, 'ป่วย': 0 };
    attendanceHistory.forEach(h => {
        if (counts[h.status] !== undefined) counts[h.status]++;
    });

    $('#count-present').text(counts['มา']);
    $('#count-absent').text(counts['ขาด']);
    $('#count-late').text(counts['สาย']);
    $('#count-leave').text(counts['ลา']);
    $('#count-sick').text(counts['ป่วย']);

    // สร้างตารางประวัติย้อนหลัง
    if (attendanceHistory.length === 0) {
        $('#history-list').html('<tr><td colspan="2" class="text-center py-16 text-slate-400 font-medium">ยังไม่มีประวัติการเช็คชื่อในเทอมนี้</td></tr>');
        return;
    }

    let rows = '';
    attendanceHistory.forEach(h => {
        const thaiDate = formatThaiDateFull(h.check_date);
        let colorClass = 'text-slate-700 bg-slate-100'; // Default
        
        // 🟢 เปลี่ยนสีสถานะให้ตรงกับสีในการ์ดด้านบน (Tailwind CSS)
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

// 🟢 3. แก้ชื่อฟังก์ชันให้ตรงกับปุ่มใน HTML (จาก exportMyPDF -> exportToPDF)
async function exportToPDF() {
    if (attendanceHistory.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีประวัติให้พิมพ์', 'info');
        return;
    }

    Swal.fire({ title: 'กำลังสร้างเอกสาร PDF...', text: 'จัดหน้าเอกสาร กรุณารอสักครู่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const schoolName = currentSchoolInfo?.school_name_th || currentSchoolInfo?.school_name || 'โรงเรียน (ตั้งค่าชื่อโรงเรียนในระบบส่วนกลาง)';
    const termInfo = `ภาคเรียนที่ ${currentSchoolInfo?.current_semester || '-'} ปีการศึกษา ${currentSchoolInfo?.current_academic_year || '-'}`;
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
        filename: `ประวัติการมาเรียน_${studentFullName.replace(/\s+/g, '')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(htmlContent).save().then(() => {
        Swal.close();
        Swal.fire('สำเร็จ', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว', 'success');
    });
}

// ✅ logout
async function logout() {
    await db.auth.signOut();
    window.location.href = "index.html";
}
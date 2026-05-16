// ใช้ db จาก config.js (Supabase Client)
let currentSchoolInfo = null;
let currentStudent = null;
let currentMembership = null;
let studentGradeLevel = null;   // ระดับชั้นของนักเรียน (เช่น 1,2,3...)
let allClubsData = [];          // เก็บข้อมูลชุมนุมที่โหลด
let clubMemberCounts = {};      // จำนวนผู้สมัครต่อ club_id

$(document).ready(async function() {
    await initStudentSystem();
});

async function initStudentSystem() {
    // 1. ตรวจสอบล็อกอินผ่าน Supabase Auth
    const { data: { session }, error: sessionErr } = await db.auth.getSession();
    if (sessionErr || !session) return window.location.href = '/login.html';
    const userId = session.user.id;

    // 2. ดึงข้อมูลปีการศึกษาปัจจุบัน
    const { data: schoolInfo, error: schoolErr } = await db.from('core_school_info').select('*').single();
    if (schoolErr) return Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลปีการศึกษา', 'error');
    currentSchoolInfo = schoolInfo;
    $('#term-info').text(`ปีการศึกษา ${schoolInfo.current_academic_year} ภาคเรียนที่ ${schoolInfo.current_semester}`);

    // 3. ดึงข้อมูลนักเรียน (ผูกกับ auth.uid() หรือ student_id_card?)
    //    สมมติว่า core_students มีคอลัมน์ user_id = auth.uid()
    const { data: student, error: stuErr } = await db.from('core_students')
        .select(`
            id, student_id_card, prefix, first_name, last_name,
            student_enrollments( core_classrooms( grade_level, room_number, academic_year, semester ) )
        `)
        .eq('user_id', userId)   // หรือ .eq('student_id_card', user.email.split('@')[0])
        .single();

    if (stuErr || !student) return Swal.fire('Error', 'ไม่พบข้อมูลนักเรียน', 'error').then(() => window.location.href = '/login.html');
    currentStudent = student;

    // หา classroom ปัจจุบัน
    const currentEnr = student.student_enrollments?.find(e =>
        e.core_classrooms?.academic_year == currentSchoolInfo.current_academic_year &&
        e.core_classrooms?.semester == currentSchoolInfo.current_semester
    );
    if (currentEnr) {
        studentGradeLevel = currentEnr.core_classrooms.grade_level;
    } else {
        studentGradeLevel = null; // กรณีไม่พบห้อง ให้แสดงทุกอัน (อาจต้องแจ้งเตือน)
    }

    $('#student-profile').html(`
        <p class="font-bold text-lg">${student.prefix || ''}${student.first_name} ${student.last_name}</p>
        <p class="text-sm text-gray-500">รหัส: ${student.student_id_card} | ชั้น ม.${studentGradeLevel || '?'}</p>
    `);

    await checkCurrentEnrollment();
    await loadCategories();
    await loadClubs();
}

async function checkCurrentEnrollment() {
    const { data, error } = await db.from('club_memberships')
        .select('*, club_registers(*, core_personnel(prefix, first_name, last_name, avatar_url), club_categories(name))')
        .eq('student_id', currentStudent.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .maybeSingle();

    if (data) {
        currentMembership = data;
        renderSummary();
    } else {
        currentMembership = null;
        $('#summary-section').addClass('hidden');
        $('#club-selection-area').removeClass('hidden');
    }
}

function renderSummary() {
    $('#club-selection-area').addClass('hidden');
    $('#summary-section').removeClass('hidden');
    const club = currentMembership.club_registers;
    const teacher = club.core_personnel;

    let statusText = '';
    if (currentMembership.status === 'approved') statusText = '<span class="text-green-600 font-bold">(อนุมัติแล้ว)</span>';
    else if (currentMembership.status === 'rejected') statusText = `<span class="text-red-600 font-bold">(ไม่อนุมัติ - ${currentMembership.rejection_reason || '-'})</span>`;
    else statusText = '<span class="text-yellow-600 font-bold">(รออนุมัติ)</span>';

    const teacherName = teacher ? `${teacher.prefix||''}${teacher.first_name} ${teacher.last_name}` : 'ไม่ระบุ';
    const category = club.club_categories?.name || '-';

    $('#selected-club-details').html(`
        <p><strong>ชุมนุม:</strong> ${club.club_name} ${statusText}</p>
        <p><strong>หมวดหมู่:</strong> ${category}</p>
        <p><strong>ครูที่ปรึกษา:</strong> ${teacherName}</p>
        <p><strong>สถานที่:</strong> ${club.location || '-'}</p>
        ${teacher?.avatar_url ? `<img src="${teacher.avatar_url}" class="w-12 h-12 rounded-full mt-2 object-cover border" />` : ''}
    `);

    if (currentMembership.is_confirmed || currentMembership.status === 'approved') {
        $('#btn-cancel-enroll, #btn-final-confirm').hide();
    } else {
        $('#btn-cancel-enroll, #btn-final-confirm').show();
    }

    if (currentMembership.status === 'rejected') {
        $('#btn-final-confirm').hide();
        $('#btn-cancel-enroll').text('รับทราบและเลือกชุมนุมใหม่');
    } else {
        $('#btn-cancel-enroll').text('ยกเลิกการเลือก');
    }
}

async function loadCategories() {
    const { data } = await db.from('club_categories').select('*').order('name');
    $('#category-filter').empty().append('<option value="all">ทุกหมวดหมู่</option>');
    data.forEach(cat => $('#category-filter').append(`<option value="${cat.id}">${cat.name}</option>`));
    $('#category-filter').off('change').on('change', loadClubs);
}

async function loadClubs() {
    const filterId = $('#category-filter').val();
    let query = db.from('club_registers')
        .select('*, core_personnel(id, prefix, first_name, last_name, avatar_url), club_categories(name)')
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .eq('is_locked', false);   // เฉพาะชุมนุมที่ยังเปิดรับ

    if (filterId !== 'all') query = query.eq('category_id', filterId);

    const { data: clubs, error } = await query;
    if (error) return console.error(error);
    allClubsData = clubs || [];

    // ดึงจำนวนสมาชิกที่สมัครแล้วทั้งหมดในเทอมนี้
    const { data: memberships } = await db.from('club_memberships')
        .select('club_id')
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .neq('status', 'rejected');   // ไม่นับที่ถูกปฏิเสธ

    clubMemberCounts = {};
    if (memberships) {
        memberships.forEach(m => {
            clubMemberCounts[m.club_id] = (clubMemberCounts[m.club_id] || 0) + 1;
        });
    }

    renderClubs();
}

function renderClubs() {
    const container = $('#clubs-container').empty();

    if (!studentGradeLevel) {
        container.html('<p class="text-gray-500 col-span-full text-center py-8">ไม่พบระดับชั้นของนักเรียน กรุณาติดต่อครูที่ปรึกษา</p>');
        return;
    }

    const filteredClubs = allClubsData.filter(club => {
        if (!club.target_grades) return false;
        // เช็คว่าระดับชั้นของนักเรียนอยู่ในช่วงที่ชุมนุมรับหรือไม่
        return isGradeAccepted(studentGradeLevel, club.target_grades);
    });

    if (filteredClubs.length === 0) {
        container.html('<p class="text-gray-500 col-span-full text-center py-8">ไม่มีชุมนุมที่เปิดรับสำหรับระดับชั้นของคุณในขณะนี้</p>');
        return;
    }

    filteredClubs.forEach(club => {
        const enrolled = clubMemberCounts[club.id] || 0;
        const isFull = enrolled >= club.max_capacity;
        const teacherName = club.core_personnel ? `${club.core_personnel.prefix||''}${club.core_personnel.first_name} ${club.core_personnel.last_name}` : 'ไม่ระบุ';
        const avatarUrl = club.core_personnel?.avatar_url || null;

        container.append(`
            <div class="bg-white rounded-xl shadow border border-gray-100 p-5 flex flex-col h-full transition hover:shadow-lg">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 text-xl overflow-hidden">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover" />` : '<i class="fa-solid fa-chalkboard-user"></i>'}
                    </div>
                    <div>
                        <h3 class="font-bold text-lg text-gray-800">${club.club_name}</h3>
                        <p class="text-sm text-gray-500">${teacherName}</p>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mb-4 flex-grow">${club.description || ''}</p>
                <div class="flex justify-between items-center mb-4 text-sm">
                    <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded">${club.target_grades}</span>
                    <span class="${isFull ? 'text-red-500' : 'text-green-600'} font-semibold">รับแล้ว ${enrolled}/${club.max_capacity}</span>
                </div>
                <button onclick="enrollClub('${club.id}')" ${isFull || currentMembership ? 'disabled' : ''}
                    class="w-full py-2 rounded-lg font-semibold transition ${(isFull || currentMembership) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white'}">
                    ${isFull ? 'เต็มแล้ว' : (currentMembership ? 'คุณมีรายการเลือกอยู่แล้ว' : 'สมัครชุมนุมนี้')}
                </button>
            </div>
        `);
    });
}

// ฟังก์ชันตรวจสอบว่าระดับชั้นตรงกับ target_grades หรือไม่
function isGradeAccepted(studentGrade, targetGrades) {
    if (!targetGrades) return false;
    const g = parseInt(studentGrade);
    if (targetGrades === `ม.${g}`) return true;
    if (targetGrades === 'ม.1-3' && g >= 1 && g <= 3) return true;
    if (targetGrades === 'ม.4-6' && g >= 4 && g <= 6) return true;
    if (targetGrades === 'ม.1-6') return true;
    return false;
}

window.enrollClub = async (clubId) => {
    if (currentMembership) {
        return Swal.fire('ไม่สามารถสมัครได้', 'คุณมีชุมนุมที่เลือกไว้แล้ว 1 รายการ', 'warning');
    }

    const result = await Swal.fire({
        title: 'ยืนยันการเลือกชุมนุม?',
        text: 'เมื่อเลือกแล้วจะต้องรอครูอนุมัติ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0d9488'
    });

    if (result.isConfirmed) {
        const { error } = await db.from('club_memberships').insert([{
            student_id: currentStudent.id,
            club_id: clubId,
            academic_year: currentSchoolInfo.current_academic_year,
            semester: currentSchoolInfo.current_semester,
            status: 'pending',
            is_confirmed: false
        }]);

        if (error) {
            return Swal.fire('Error', error.message, 'error');
        }
        Swal.fire('สำเร็จ', 'บันทึกการเลือกชุมนุมแล้ว', 'success');
        await checkCurrentEnrollment();
    }
};

$('#btn-cancel-enroll').click(async () => {
    if (!currentMembership) return;
    const result = await Swal.fire({
        title: 'ยกเลิกการเลือกชุมนุม?',
        text: 'คุณสามารถเลือกชุมนุมใหม่ได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626'
    });
    if (result.isConfirmed) {
        await db.from('club_memberships').delete().eq('id', currentMembership.id);
        await checkCurrentEnrollment();
        await loadClubs();
    }
});

$('#btn-final-confirm').click(async () => {
    if (!currentMembership) return;
    const result = await Swal.fire({
        title: 'ยืนยันสิทธิ์ขั้นเด็ดขาด?',
        text: 'หากยืนยันแล้วจะไม่สามารถเปลี่ยนชุมนุมได้อีก',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0d9488'
    });
    if (result.isConfirmed) {
        await db.from('club_memberships').update({ is_confirmed: true }).eq('id', currentMembership.id);
        Swal.fire('สำเร็จ', 'ยืนยันสิทธิ์เรียบร้อย', 'success');
        await checkCurrentEnrollment();
    }
});
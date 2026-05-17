// ใช้ db จาก config.js (Supabase Client)
let currentSchoolInfo = null;
let currentStudent = null;
let currentMembership = null;
let studentGradeLevel = null;   
let studentClassRoom = null;    
let allClubsData = [];          
let clubMemberCounts = {};      

$(document).ready(async function() {
    await checkAuth();
});

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        window.location.replace("index.html");
        return;
    }

    try {
        const { data: schoolInfo, error: schoolErr } = await db.from('core_school_info').select('*').eq('id', 1).maybeSingle();
        if (schoolErr || !schoolInfo) {
            currentSchoolInfo = { current_academic_year: '2567', current_semester: '1' };
        } else {
            currentSchoolInfo = schoolInfo;
        }
        
        $('#term-info').html(`<i class="fa-solid fa-graduation-cap mr-1"></i> ปีการศึกษา ${currentSchoolInfo.current_academic_year} / เทอม ${currentSchoolInfo.current_semester}`);

        const studentSid = session.user.email.split('@')[0];
        const { data: student, error: studentError } = await db.from('core_students')
            .select(`
                id, student_id_card, prefix, first_name, last_name,
                student_enrollments(
                    core_classrooms(grade_level, room_number, academic_year, semester)
                )
            `)
            .eq('student_id_card', studentSid)
            .single();

        if (studentError || !student) {
            await db.auth.signOut();
            window.location.replace("index.html");
            return;
        }

        currentStudent = student;
        
        if (student.student_enrollments && student.student_enrollments.length > 0) {
            const currentEnr = student.student_enrollments.find(e => 
                e.core_classrooms.academic_year == currentSchoolInfo.current_academic_year && 
                e.core_classrooms.semester == currentSchoolInfo.current_semester
            );
            if (currentEnr) {
                studentGradeLevel = currentEnr.core_classrooms.grade_level;
                studentClassRoom = `ม.${currentEnr.core_classrooms.grade_level}/${currentEnr.core_classrooms.room_number}`;
            }
        }
        
        const stuFullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
        const stuIdCard = currentStudent.student_id_card || '-';
        const stuClassText = studentClassRoom || 'ไม่ระบุชั้น';
        
        $('#user-display').html(`
            <div class="text-xs text-slate-500 font-medium">ข้อมูลผู้ใช้งานระบบ</div>
            <div class="text-sm font-bold text-teal-800 flex items-center gap-1.5 justify-end">
                <i class="fas fa-user-graduate text-teal-600"></i> ${stuFullName}
            </div>
            <div class="text-[11px] text-slate-500 font-mono mt-0.5">
                เลขประจำตัว: <span class="text-slate-700 font-bold">${stuIdCard}</span> | ชั้น: <span class="text-slate-700 font-bold">${stuClassText}</span>
            </div>
        `);
        
        await checkCurrentEnrollment();
        await loadCategories();
        await loadClubs();

    } catch (err) {
        console.error("Auth Error:", err);
        window.location.replace("index.html");
    }
}

async function checkCurrentEnrollment() {
    const { data, error } = await db.from('club_registrations')
        .select('*, club_lists(*, core_personnel(prefix, first_name, last_name, avatar_url), club_categories(name))')
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
    
    const club = currentMembership.club_lists;
    const teacher = club.core_personnel;

    // 🌟 ดึงสถานะมาแปลงเป็นตัวเล็ก เพื่อใช้เช็คเงื่อนไข
    const currentStatus = (currentMembership.status || '').toLowerCase().trim();

    let statusText = '';
    if (currentStatus === 'approved') {
        statusText = '<span class="text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-lg border border-green-200"><i class="fa-solid fa-check-circle mr-1"></i>อนุมัติแล้ว</span>';
    } else if (currentStatus === 'rejected') {
        statusText = `<span class="text-red-600 font-bold bg-red-50 px-2.5 py-1 rounded-lg border border-red-200"><i class="fa-solid fa-times-circle mr-1"></i>ไม่อนุมัติ - ${currentMembership.rejection_reason || '-'}</span>`;
    } else {
        statusText = '<span class="text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"><i class="fa-solid fa-clock mr-1"></i>รอพิจารณา</span>';
    }

    const teacherName = teacher ? `${teacher.prefix||''}${teacher.first_name} ${teacher.last_name}` : 'ไม่ระบุ';
    const category = club.club_categories?.name || '-';

    $('#selected-club-details').html(`
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-200 pb-4">
            <div>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">ชุมนุมที่เลือกเรียน</span>
                <span class="text-2xl font-black text-slate-800">${club.club_name}</span>
            </div>
            <div>${statusText}</div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-medium">
            <p class="text-slate-600"><i class="fa-solid fa-layer-group text-slate-400 mr-1.5 w-4"></i><strong>หมวดหมู่:</strong> ${category}</p>
            <p class="text-slate-600"><i class="fa-solid fa-location-dot text-slate-400 mr-1.5 w-4"></i><strong>สถานที่จัดกิจกรรม:</strong> ${club.location || '-'}</p>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200/60 inline-flex w-full sm:w-auto">
            ${teacher?.avatar_url ? `
                <img src="${teacher.avatar_url}" 
                     onclick="viewTeacherImage('${teacher.avatar_url}', '${teacherName}')" 
                     class="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm cursor-pointer hover:scale-105 transition-all" 
                     title="คลิกเพื่อดูรูปใหญ่" />
            ` : `
                <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl border border-slate-200 shadow-sm">
                    <i class="fa-solid fa-user"></i>
                </div>
            `}
            <div>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ครูที่ปรึกษาชุมนุม</span>
                <span class="font-bold text-slate-700 text-base">${teacherName}</span>
                <span class="text-xs block text-slate-400"><i class="fa-solid fa-magnifying-glass-plus"></i> คลิกที่รูปเพื่อดูหน้าครูชัดๆ</span>
            </div>
        </div>
    `);

    const btnCancel = $('#btn-cancel-enroll');
    const btnConfirm = $('#btn-final-confirm');

    btnCancel.css('display', ''); 
    btnConfirm.css('display', '');

    // 🌟 แก้ไข Logic Bug: เอา rejected ขึ้นมาเช็คเป็นอันดับ 1 เสมอ
    if (currentStatus === 'rejected') {
        btnConfirm.hide();
        btnCancel.show();
        btnCancel.html('<i class="fa-solid fa-arrow-rotate-left mr-1"></i> รับทราบและขอคืนสิทธิ์เลือกใหม่');
        btnCancel.attr('class', 'px-6 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-bold shadow-lg shadow-orange-500/40 transition-all active:scale-95 border border-orange-600');
    
    // ถ้าสถานะปกติ แต่ยืนยันเด็ดขาดไปแล้ว ค่อยซ่อนปุ่ม
    } else if (currentMembership.is_confirmed || currentStatus === 'approved') {
        btnCancel.hide();
        btnConfirm.hide();
    
    // สถานะรอพิจารณา และยังไม่ยืนยันเด็ดขาด
    } else {
        btnConfirm.show();
        btnCancel.show();
        btnCancel.html('<i class="fa-solid fa-xmark mr-1"></i> ยกเลิกการเลือก');
        btnCancel.attr('class', 'px-6 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-100 font-bold transition-colors shadow-sm');
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
    let query = db.from('club_lists')
        .select('*, core_personnel(id, prefix, first_name, last_name, avatar_url), club_categories(name)')
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .eq('is_locked', false);

    if (filterId !== 'all') query = query.eq('category_id', filterId);

    const { data: clubs, error } = await query;
    if (error) return console.error(error);
    allClubsData = clubs || [];

    const { data: memberships } = await db.from('club_registrations')
        .select('club_id')
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester)
        .neq('status', 'rejected');

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
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full transition hover:shadow-lg">
                <div class="flex items-start gap-4 mb-3">
                    <div class="w-16 h-16 shrink-0 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-300 text-2xl overflow-hidden shadow-sm">
                        ${avatarUrl ? `
                            <img src="${avatarUrl}" 
                                 onclick="viewTeacherImage('${avatarUrl}', '${teacherName}')"
                                 class="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-300" 
                                 title="คลิกดูรูปใหญ่" />
                        ` : '<i class="fa-solid fa-user-tie"></i>'}
                    </div>
                    <div>
                        <h3 class="font-bold text-lg text-gray-800 leading-tight mb-1">${club.club_name}</h3>
                        <p class="text-sm text-gray-500 font-medium">${teacherName}</p>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mb-4 flex-grow">${club.description || ''}</p>
                <div class="flex justify-between items-center mb-4 text-sm">
                    <span class="bg-teal-50 text-teal-700 px-3 py-1 rounded-lg font-bold">${club.target_grades}</span>
                    <span class="${isFull ? 'text-red-500' : 'text-green-600'} font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                        รับแล้ว ${enrolled}/${club.max_capacity}
                    </span>
                </div>
                <button onclick="enrollClub('${club.id}', ${isFull})" ${currentMembership ? 'disabled' : ''}
                    class="w-full py-2.5 rounded-xl font-bold transition-all shadow-sm ${currentMembership ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : (isFull ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-500 hover:text-white' : 'bg-teal-600 text-white hover:bg-teal-700')}">
                    ${currentMembership ? 'คุณมีรายการเลือกอยู่แล้ว' : (isFull ? 'สมัครสำรอง (เต็มแล้ว)' : 'สมัครชุมนุมนี้')}
                </button>
            </div>
        `);
    });
}

window.viewTeacherImage = (url, name) => {
    if (!url) return;
    Swal.fire({
        title: name || 'ครูที่ปรึกษา',
        imageUrl: url,
        imageAlt: 'Teacher Profile',
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0d9488',
        customClass: { image: 'rounded-2xl object-cover max-h-[60vh] shadow-lg border-4 border-white' }
    });
};

function isGradeAccepted(studentGrade, targetGrades) {
    if (!targetGrades) return false;
    const g = parseInt(studentGrade);
    if (targetGrades === `ม.${g}`) return true;
    if (targetGrades === 'ม.1-3' && g >= 1 && g <= 3) return true;
    if (targetGrades === 'ม.4-6' && g >= 4 && g <= 6) return true;
    if (targetGrades === 'ม.1-6') return true;
    return false;
}

window.enrollClub = async (clubId, isFull) => {
    if (currentMembership) {
        return Swal.fire('ไม่สามารถสมัครได้', 'คุณมีชุมนุมที่เลือกไว้แล้ว 1 รายการ', 'warning');
    }

    let alertOptions = {
        title: 'ยืนยันการเลือกชุมนุม?',
        text: 'เมื่อเลือกแล้วจะต้องรอครูประจำชุมนุมอนุมัติสิทธิ์',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0d9488',
        cancelButtonText: 'ยกเลิก'
    };

    if (isFull) {
        alertOptions = {
            title: 'ชุมนุมนี้เต็มแล้ว!',
            html: `ปัจจุบันมีผู้สมัครเต็มจำนวนแล้ว<br><br>คุณสามารถ <b>"สมัครสำรอง"</b> ไว้ได้ แต่ครูที่ปรึกษาอาจพิจารณาลบชื่อคุณออกในภายหลัง<br><br>ยืนยันที่จะรับความเสี่ยงหรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'รับความเสี่ยงและสมัคร',
            cancelButtonText: 'เปลี่ยนใจ'
        };
    }

    const result = await Swal.fire(alertOptions);

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('club_registrations').insert([{
            student_id: currentStudent.id,
            club_id: clubId,
            academic_year: currentSchoolInfo.current_academic_year,
            semester: currentSchoolInfo.current_semester,
            status: 'pending',
            is_confirmed: false
        }]);

        if (error) {
            return Swal.fire('ข้อผิดพลาด', 'คุณอาจมีรายชื่อสมัครในระบบอยู่แล้ว กรุณารีเฟรชหน้าเว็บ', 'error');
        }
        Swal.fire('สำเร็จ', 'บันทึกการเลือกชุมนุมแล้ว อย่าลืมกดยืนยันสิทธิ์และรอครูอนุมัติ', 'success');
        await checkCurrentEnrollment();
        await loadClubs();
    }
};

$('#btn-cancel-enroll').click(async () => {
    if (!currentMembership) return;
    
    // 🌟 แปลงเป็นพิมพ์เล็กเหมือนกัน เพื่อให้กดเช็คได้แม่นยำ
    const currentStatus = (currentMembership.status || '').toLowerCase().trim();

    if (currentStatus === 'rejected') {
        const result = await Swal.fire({
            title: 'รับทราบและขอคืนสิทธิ์',
            html: 'ระบบจะลบประวัติการถูกปฏิเสธเดิม<br>และเปิดให้คุณ <b>เลือกชุมนุมใหม่ได้ทันที</b>',
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#0d9488',
            confirmButtonText: 'ตกลง รับสิทธิ์คืน',
            cancelButtonText: 'ปิด'
        });
        
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
            await db.from('club_registrations').delete().eq('id', currentMembership.id);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'คืนสิทธิ์สำเร็จ กรุณาเลือกชุมนุมใหม่', timer: 2000, showConfirmButton: false });
            await checkCurrentEnrollment();
            await loadClubs();
        }
    } else {
        const result = await Swal.fire({
            title: 'ยกเลิกการเลือกชุมนุม?',
            text: 'คุณสามารถไปเลือกชุมนุมใหม่ได้ทันที',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'ยืนยันการยกเลิก',
            cancelButtonText: 'ปิด'
        });
        
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังประมวลผล...', didOpen: () => Swal.showLoading() });
            await db.from('club_registrations').delete().eq('id', currentMembership.id);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ยกเลิกสำเร็จ', timer: 1500, showConfirmButton: false });
            await checkCurrentEnrollment();
            await loadClubs();
        }
    }
});

$('#btn-final-confirm').click(async () => {
    if (!currentMembership) return;
    const result = await Swal.fire({
        title: 'ยืนยันสิทธิ์ขั้นเด็ดขาด?',
        html: 'หากกดยืนยันแล้ว <b>คุณจะไม่สามารถยกเลิกหรือเปลี่ยนชุมนุมได้อีก</b>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0d9488',
        confirmButtonText: 'ยืนยันสิทธิ์',
        cancelButtonText: 'ยังก่อน'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
        await db.from('club_registrations').update({ is_confirmed: true }).eq('id', currentMembership.id);
        Swal.fire('สำเร็จ', 'ยืนยันสิทธิ์เข้าชุมนุมเรียบร้อยแล้ว', 'success');
        await checkCurrentEnrollment();
    }
});
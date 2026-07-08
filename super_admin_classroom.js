// ==========================================
// super_admin_classroom.js
// จัดการห้องเรียน, นักเรียน, การนำเข้า-ส่งออก, คัดลอกเทอม, เลื่อนชั้น
// ==========================================

// ==========================================
// ห้องเรียน (Classrooms)
// ==========================================
async function loadClassrooms() {
    try {
        if ($.fn.DataTable.isDataTable('#classroomsTable')) $('#classroomsTable').DataTable().destroy();

        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        const currentYear = schoolInfo ? schoolInfo.current_academic_year : '';
        const currentTerm = schoolInfo ? schoolInfo.current_semester : '';

        let query = db.from('core_classrooms')
            .select(`*, adv1:core_personnel!adviser_id_1(first_name, last_name), adv2:core_personnel!adviser_id_2(first_name, last_name)`)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });

        if (currentYear) query = query.eq('academic_year', currentYear);
        if (currentTerm) query = query.eq('semester', currentTerm);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('tb-classrooms');
        const select = document.getElementById('filterStudentClass');
        select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';

        if (data && data.length > 0) {
            tbody.innerHTML = data.map(cls => {
                const adv1 = cls.adv1 ? `${cls.adv1.first_name} ${cls.adv1.last_name}` : '<span class="text-red-500 text-sm">ยังไม่ระบุ</span>';
                const adv2 = cls.adv2 ? `${cls.adv2.first_name} ${cls.adv2.last_name}` : '<span class="text-gray-400 italic">-</span>';

                select.innerHTML += `<option value="${cls.id}">ม.${cls.grade_level}/${cls.room_number} (เทอม ${cls.semester}/${cls.academic_year})</option>`;

                return `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-4 text-center font-bold text-gray-700">${cls.semester}/${cls.academic_year}</td>
                    <td class="py-3 px-4 text-center font-bold text-blue-700">ม.${cls.grade_level}/${cls.room_number}</td>
                    <td class="py-3 px-4 text-gray-600">${cls.study_plan || '-'}</td>
                    <td class="py-3 px-4 text-gray-700 font-medium">${adv1}</td>
                    <td class="py-3 px-4 text-gray-600 text-sm">${adv2}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editClassroom('${cls.id}', '${cls.academic_year}', '${cls.semester}', '${cls.grade_level}', '${cls.room_number}', '${cls.study_plan || ''}', '${cls.adviser_id_1 || ''}', '${cls.adviser_id_2 || ''}')" class="text-yellow-600 hover:text-yellow-800 text-sm font-bold px-2 rounded hover:bg-yellow-100 transition-colors"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                        <button onclick="deleteClassroom('${cls.id}', 'ม.${cls.grade_level}/${cls.room_number}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 ml-1 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                    </td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">ไม่พบข้อมูลห้องเรียนในภาคเรียนปัจจุบัน</td></tr>';
        }

        $('#classroomsTable').DataTable({
            scrollX: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 10,
            destroy: true
        });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function ensurePersonnelListLoaded() {
    if (globalPersonnelList.length === 0) {
        const { data, error } = await db.from('core_personnel')
            .select('id, first_name, last_name, department')
            .order('first_name');
        if (error) throw error;
        globalPersonnelList = data || [];
    }
}

function initAdviserSelect2() {
    const adv1 = document.getElementById('c_adv1');
    const adv2 = document.getElementById('c_adv2');
    if (adv1.tomselect) adv1.tomselect.destroy();
    if (adv2.tomselect) adv2.tomselect.destroy();

    new TomSelect(adv1, {
        placeholder: '-- พิมพ์เพื่อค้นหาชื่อครู --',
        allowEmptyOption: true,
        render: { no_results: function () { return '<div class="no-results">ไม่พบครู</div>'; } }
    });
    new TomSelect(adv2, {
        placeholder: '-- พิมพ์เพื่อค้นหาชื่อครู --',
        allowEmptyOption: true,
        render: { no_results: function () { return '<div class="no-results">ไม่พบครู</div>'; } }
    });
}

async function openClassModal() {
    currentEditClassId = null;
    document.getElementById('classForm').reset();
    document.getElementById('modalClassTitle').innerHTML = 'เพิ่มห้องเรียนใหม่';

    try {
        Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading() });
        await ensurePersonnelListLoaded();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดรายชื่อครูได้', 'error');
        return;
    }

    const adv1El = document.getElementById('c_adv1');
    const adv2El = document.getElementById('c_adv2');
    let options = '<option value="">-- ไม่ระบุครูที่ปรึกษา --</option>';
    globalPersonnelList.forEach(p => {
        options += `<option value="${p.id}">${p.first_name} ${p.last_name} (${p.department || ''})</option>`;
    });
    adv1El.innerHTML = options;
    adv2El.innerHTML = options;

    document.getElementById('c_year').value = (new Date().getFullYear() + 543).toString();
    document.getElementById('c_term').value = '1';
    document.getElementById('classroomModal').classList.remove('hidden');

    initAdviserSelect2();
    adv1El.tomselect?.clear();
    adv2El.tomselect?.clear();
}

async function editClassroom(id, year, semester, grade, room, plan, adv1, adv2) {
    currentEditClassId = id;
    document.getElementById('modalClassTitle').innerHTML = 'แก้ไขห้องเรียน';

    try {
        Swal.fire({ title: 'กำลังโหลด...', didOpen: () => Swal.showLoading() });
        await ensurePersonnelListLoaded();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
        return;
    }

    const adv1El = document.getElementById('c_adv1');
    const adv2El = document.getElementById('c_adv2');
    let options = '<option value="">-- ไม่ระบุครูที่ปรึกษา --</option>';
    globalPersonnelList.forEach(p => {
        options += `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`;
    });
    adv1El.innerHTML = options;
    adv2El.innerHTML = options;

    document.getElementById('c_year').value = year;
    document.getElementById('c_term').value = semester || '1';
    document.getElementById('c_grade').value = grade;
    document.getElementById('c_room').value = room;
    document.getElementById('c_plan').value = plan;
    document.getElementById('classroomModal').classList.remove('hidden');

    initAdviserSelect2();
    if (adv1) adv1El.tomselect?.setValue(adv1);
    else adv1El.tomselect?.clear();
    if (adv2) adv2El.tomselect?.setValue(adv2);
    else adv2El.tomselect?.clear();
}

function closeClassModal() {
    document.getElementById('classroomModal').classList.add('hidden');
    const adv1 = document.getElementById('c_adv1');
    const adv2 = document.getElementById('c_adv2');
    if (adv1?.tomselect) adv1.tomselect.destroy();
    if (adv2?.tomselect) adv2.tomselect.destroy();
}

async function saveClassroom(e) {
    e.preventDefault();
    const year = document.getElementById('c_year').value.trim();
    const term = document.getElementById('c_term').value;
    const grade = document.getElementById('c_grade').value;
    const room = document.getElementById('c_room').value;
    const plan = document.getElementById('c_plan').value.trim();
    const adv1 = document.getElementById('c_adv1').value || null;
    const adv2 = document.getElementById('c_adv2').value || null;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (!currentEditClassId) {
            const { data: existing } = await db.from('core_classrooms').select('id').eq('academic_year', year).eq('semester', term).eq('grade_level', grade).eq('room_number', room);
            if (existing && existing.length > 0) throw new Error(`ห้อง ม.${grade}/${room} เทอม ${term}/${year} มีอยู่ในระบบแล้ว!`);

            const { error } = await db.from('core_classrooms').insert([{ academic_year: year, semester: term, grade_level: grade, room_number: room, study_plan: plan, adviser_id_1: adv1, adviser_id_2: adv2 }]);
            if (error) throw error;
        } else {
            const { error } = await db.from('core_classrooms').update({
                academic_year: year, semester: term, grade_level: grade, room_number: room, study_plan: plan, adviser_id_1: adv1, adviser_id_2: adv2
            }).eq('id', currentEditClassId);
            if (error) throw error;
        }

        closeClassModal(); await loadClassrooms();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function deleteClassroom(id, name) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบห้องเรียน?', html: `ลบห้อง <b>${name}</b> ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบห้องเรียน' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_classrooms').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { await loadClassrooms(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
    }
}

// ==========================================
// นักเรียน (Students)
// ==========================================
function getStudentAvatarHtml(avatarUrl, studentName) {
    if (!avatarUrl || avatarUrl.trim() === '') {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : '?';
        return `<div class="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm shadow-sm">${initial}</div>`;
    }

    let fullUrl = avatarUrl;
    if (!avatarUrl.startsWith('http') && !avatarUrl.startsWith('blob:')) {
        const { data: { publicUrl } } = db.storage.from('avatars').getPublicUrl(avatarUrl);
        fullUrl = publicUrl;
    }

    return `<img src="${fullUrl}"
                onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=random&rounded=true&size=36';"
                onclick="viewStudentImage('${fullUrl}', '${studentName.replace(/'/g, "\\'")}')"
                class="w-9 h-9 rounded-full object-cover cursor-pointer hover:scale-105 transition-all border border-slate-200 shadow-sm"
                title="คลิกเพื่อดูรูปใหญ่" />`;
}

// ฟังก์ชันแสดงรูปขนาดใหญ่ (SweetAlert)
window.viewStudentImage = function(imgUrl, studentName) {
    Swal.fire({
        title: studentName,
        imageUrl: imgUrl,
        imageAlt: studentName,
        imageWidth: '300px',
        background: '#fff',
        confirmButtonText: 'ปิด',
        showCloseButton: true
    });
};

async function loadStudents() {
    const classId = document.getElementById('filterStudentClass').value;
    const tbody = document.getElementById('tb-students');

    document.getElementById('bulk-action-bar').classList.add('hidden');
    if (document.getElementById('selectAll')) document.getElementById('selectAll').checked = false;

    if (!classId) return;

    Swal.fire({ title: 'กำลังดึงรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if ($.fn.DataTable.isDataTable('#studentsTable')) $('#studentsTable').DataTable().destroy();

        const { data, error } = await db.from('student_enrollments')
            .select(`id, student_number, status, classroom_id, core_students!inner(id, student_id_card, national_id, prefix, first_name, last_name, avatar_students_url)`)
            .eq('classroom_id', classId)
            .order('student_number', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            tbody.innerHTML = data.map((enr) => {
                let std = enr.core_students;
                let stBadge = enr.status === 'เรียนปกติ'
                    ? '<span class="px-2 py-1 text-[11px] font-bold rounded bg-green-100 text-green-700">เรียนปกติ</span>'
                    : `<span class="px-2 py-1 text-[11px] font-bold rounded bg-red-100 text-red-700">${enr.status}</span>`;
                const safeFname = std.first_name ? std.first_name.replace(/'/g, "\\'") : '';
                const safeLname = std.last_name ? std.last_name.replace(/'/g, "\\'") : '';
                const fullName = `${std.prefix || ''}${std.first_name} ${std.last_name}`;

                const avatarHtml = getStudentAvatarHtml(std.avatar_students_url, fullName);

                return `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-4 text-center">
                        <input type="checkbox" class="student-chk w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded cursor-pointer focus:ring-blue-500" value="${enr.id}" onchange="updateSelectedCount()">
                    </td>
                    <td class="py-3 px-2 text-center">${avatarHtml}</td>
                    <td class="py-3 px-4 text-center font-bold text-gray-700">${enr.student_number || '-'}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-blue-700">${std.student_id_card || '-'}</div>
                        <div class="text-[11px] text-gray-500">ปชช: ${std.national_id || '-'}</div>
                    </td>
                    <td class="py-3 px-4 text-gray-800 font-medium">${fullName}</td>
                    <td class="py-3 px-4 text-center">${stBadge}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editSingleStudent('${enr.id}', '${enr.student_number || ''}', '${std.student_id_card || ''}', '${std.national_id || ''}', '${std.prefix || ''}', '${safeFname}', '${safeLname}', '${enr.status || 'เรียนปกติ'}', '${std.avatar_students_url || ''}', '${std.id}')" class="text-yellow-600 hover:text-yellow-800 text-sm font-bold px-2 rounded hover:bg-yellow-100"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                        <button onclick="deleteSingleStudent('${enr.id}', '${safeFname}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 ml-1 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                    </td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">ไม่พบนักเรียนในห้องนี้</td></tr>';
        }

        $('#studentsTable').DataTable({
            scrollX: true,
            responsive: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 50,
            lengthMenu: [[5, 10, 25, 50, -1], [5, 10, 25, 50, "ทั้งหมด"]],
            columnDefs: [{ orderable: false, targets: [0, 1, 6] }, { responsivePriority: 1, targets: -1 }],
            destroy: true
        });
        Swal.close();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// เปิด modal เพิ่มนักเรียน
function openAddStudentModal() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนเพิ่มนักเรียน', 'warning');

    document.getElementById('studentDetailForm').reset();
    document.getElementById('s_id').value = '';
    document.getElementById('s_core_id').value = '';
    document.getElementById('s_avatar_url').value = '';
    document.getElementById('modalStudentTitle').innerHTML = '<i class="fa-solid fa-user-plus text-green-600 mr-2"></i>เพิ่มนักเรียนใหม่';
    setStudentAvatar('student-avatar-preview', '', null);
    _pendingStudentAvatarFile = null;
    const badge = document.getElementById('student-avatar-badge');
    if (badge) badge.classList.add('hidden');
    document.getElementById('studentDetailModal').classList.remove('hidden');
    attachStudentFileInputEvent();
}

// แก้ไขนักเรียน (รับ avatarUrl)
function editSingleStudent(enrollId, studentNumber, studentIdCard, nationalId, prefix, fname, lname, status, avatarUrl, coreStudentId) {
    document.getElementById('s_id').value = enrollId;
    document.getElementById('s_core_id').value = coreStudentId;
    document.getElementById('s_number').value = studentNumber;
    document.getElementById('s_student_id').value = studentIdCard;
    document.getElementById('s_national_id').value = nationalId;
    document.getElementById('s_prefix').value = prefix;
    document.getElementById('s_fname').value = fname;
    document.getElementById('s_lname').value = lname;
    document.getElementById('s_status').value = status;
    document.getElementById('s_avatar_url').value = avatarUrl || '';

    const fullName = `${prefix}${fname} ${lname}`;
    setStudentAvatar('student-avatar-preview', fullName, avatarUrl);
    _pendingStudentAvatarFile = null;
    const badge = document.getElementById('student-avatar-badge');
    if (badge) badge.classList.add('hidden');

    document.getElementById('modalStudentTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-yellow-600 mr-2"></i>แก้ไขข้อมูลนักเรียน';
    document.getElementById('studentDetailModal').classList.remove('hidden');
    attachStudentFileInputEvent();
}

function attachStudentFileInputEvent() {
    const fileInput = document.getElementById('student-avatar-file');
    if (!fileInput) return;
    if (fileInput.hasListener) return;
    fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
            _pendingStudentAvatarFile = e.target.files[0];
            const badge = document.getElementById('student-avatar-badge');
            if (badge) badge.classList.remove('hidden');
            const reader = new FileReader();
            reader.onload = function(ev) {
                const fullName = `${document.getElementById('s_prefix').value}${document.getElementById('s_fname').value} ${document.getElementById('s_lname').value}`;
                setStudentAvatar('student-avatar-preview', fullName, ev.target.result);
            };
            reader.readAsDataURL(e.target.files[0]);
        } else {
            _pendingStudentAvatarFile = null;
            const badge = document.getElementById('student-avatar-badge');
            if (badge) badge.classList.add('hidden');
            const existingUrl = document.getElementById('s_avatar_url').value;
            const fullName = `${document.getElementById('s_prefix').value}${document.getElementById('s_fname').value} ${document.getElementById('s_lname').value}`;
            setStudentAvatar('student-avatar-preview', fullName, existingUrl);
        }
    });
    fileInput.hasListener = true;
}

function closeStudentModal() {
    document.getElementById('studentDetailModal').classList.add('hidden');
}

// บันทึกนักเรียน (รวม avatar_students_url)
async function saveSingleStudent(e) {
    e.preventDefault();
    const classId = document.getElementById('filterStudentClass').value;
    const enrollmentId = document.getElementById('s_id').value;
    const coreStudentId = document.getElementById('s_core_id').value;
    const avatarUrl = document.getElementById('s_avatar_url').value.trim() || null;

    const studentIdCard = document.getElementById('s_student_id').value.trim();
    const nationalId = document.getElementById('s_national_id').value.trim() || null;
    const prefix = document.getElementById('s_prefix').value;
    const firstName = document.getElementById('s_fname').value.trim();
    const lastName = document.getElementById('s_lname').value.trim();
    const studentNumber = document.getElementById('s_number').value ? parseInt(document.getElementById('s_number').value) : null;
    const status = document.getElementById('s_status').value;

    // ตรวจสอบข้อมูลจำเป็น
    if (!studentIdCard || !firstName || !lastName) {
        Swal.fire('กรุณากรอกข้อมูลให้ครบ', 'เลขประจำตัวนักเรียน, ชื่อ และนามสกุล เป็นข้อมูลที่จำเป็น', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // เตรียมข้อมูลนักเรียน
        const studentData = {
            student_id_card: studentIdCard,
            national_id: nationalId,
            prefix: prefix,
            first_name: firstName,
            last_name: lastName,
            avatar_students_url: avatarUrl
        };

        let finalCoreStudentId = coreStudentId;
        let studentUpsertResult;

        // ถ้ามี coreStudentId (กรณีแก้ไขนักเรียนที่มีอยู่แล้ว) → อัปเดตโดยตรง
        if (coreStudentId) {
            const { data, error } = await db.from('core_students')
                .update(studentData)
                .eq('id', coreStudentId)
                .select();
            if (error) throw error;
            studentUpsertResult = data ? data[0] : null;
            if (!studentUpsertResult) throw new Error('ไม่พบข้อมูลนักเรียนในระบบ');
        }
        // กรณีเพิ่มใหม่ → upsert โดยใช้ student_id_card เป็น key
        else {
            const { data, error } = await db.from('core_students')
                .upsert(studentData, { onConflict: 'student_id_card' })
                .select()
                .single();
            if (error) throw error;
            studentUpsertResult = data;
            finalCoreStudentId = data.id;
            // เก็บ core student id ไว้ใน hidden field เพื่อใช้ในการอัปโหลดรูปครั้งต่อไป
            document.getElementById('s_core_id').value = finalCoreStudentId;
        }

        if (!studentUpsertResult) throw new Error('ไม่สามารถบันทึกข้อมูลนักเรียนได้');

        // จัดการ student_enrollments (เพิ่มหรืออัปเดต)
        if (!enrollmentId) {
            // ตรวจสอบว่านักเรียนคนนี้มีในห้องนี้แล้วหรือยัง
            const { data: existingEnroll } = await db.from('student_enrollments')
                .select('id')
                .eq('student_id', finalCoreStudentId)
                .eq('classroom_id', classId)
                .maybeSingle();
            if (existingEnroll) {
                Swal.fire('ข้อมูลซ้ำ', 'นักเรียนคนนี้มีรายชื่อในห้องนี้แล้ว', 'warning');
                return;
            }
            const { error: insertErr } = await db.from('student_enrollments').insert({
                student_id: finalCoreStudentId,
                classroom_id: classId,
                student_number: studentNumber,
                status: status
            });
            if (insertErr) throw insertErr;
        } else {
            // อัปเดต enrollment (เลขที่, สถานะ)
            const { error: updateErr } = await db.from('student_enrollments')
                .update({
                    student_number: studentNumber,
                    status: status
                })
                .eq('id', enrollmentId);
            if (updateErr) throw updateErr;
        }

        closeStudentModal();
        await loadStudents(); // รีเฟรชตาราง
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function deleteSingleStudent(id, fname) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', html: `ต้องการลบข้อมูลการจัดห้องของ <b>${fname}</b> ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูล' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('student_enrollments').delete().eq('id', id);
        if (error) Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        else { await loadStudents(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
    }
}

// Bulk Actions
function toggleSelectAll() {
    const isChecked = document.getElementById('selectAll').checked;
    const checkboxes = document.querySelectorAll('.student-chk');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.student-chk:checked').length;
    document.getElementById('selected-count').innerText = selectedCount;

    if (selectedCount > 0) {
        document.getElementById('bulk-action-bar').classList.remove('hidden');
    } else {
        document.getElementById('bulk-action-bar').classList.add('hidden');
        document.getElementById('selectAll').checked = false;
    }
}

async function bulkMoveStudents() {
    const selectedIds = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return;

    const currentClassId = document.getElementById('filterStudentClass').value;
    const selectObj = document.getElementById('filterStudentClass');
    let optionsHtml = '<select id="targetClassId" class="w-full border border-gray-300 rounded-lg px-4 py-3 mt-4 text-gray-700 outline-none focus:border-indigo-500">';
    optionsHtml += '<option value="">-- กรุณาเลือกระดับชั้น/ห้องปลายทาง --</option>';

    for (let i = 1; i < selectObj.options.length; i++) {
        if (selectObj.options[i].value !== currentClassId && selectObj.options[i].value !== "") {
            optionsHtml += `<option value="${selectObj.options[i].value}">${selectObj.options[i].text}</option>`;
        }
    }
    optionsHtml += '</select>';

    const { isConfirmed, value: targetId } = await Swal.fire({
        title: `ย้ายนักเรียน ${selectedIds.length} คน`,
        html: `<div class="text-left text-sm text-gray-600">เลือกห้องเรียนเป้าหมาย:<br>${optionsHtml}</div>`,
        icon: 'info', showCancelButton: true, confirmButtonColor: '#4f46e5', confirmButtonText: '<i class="fa-solid fa-truck-fast mr-1"></i> ย้ายห้อง', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const val = document.getElementById('targetClassId').value;
            if (!val) Swal.showValidationMessage('กรุณาเลือกห้องปลายทาง');
            return val;
        }
    });

    if (isConfirmed && targetId) {
        Swal.fire({ title: 'กำลังย้ายห้อง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await db.from('student_enrollments').update({ classroom_id: targetId }).in('id', selectedIds);
            if (error) throw error;

            await loadStudents();
            Swal.fire({ icon: 'success', title: 'ย้ายห้องสำเร็จ!', text: `จำนวน ${selectedIds.length} คน`, timer: 2000, showConfirmButton: false });
        } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    }
}

async function bulkDeleteStudents() {
    const selectedIds = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบแบบกลุ่ม?',
        html: `ลบนักเรียน <b>${selectedIds.length}</b> คน ออกจากห้องนี้ใช่หรือไม่?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยันการลบ', cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await db.from('student_enrollments').delete().in('id', selectedIds);
            if (error) throw error;

            await loadStudents();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ!', text: `จำนวน ${selectedIds.length} คน`, timer: 1500, showConfirmButton: false });
        } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    }
}

// นำเข้า-ส่งออก
function downloadStudentTemplate() {
    const ws_data = [['เลขที่', 'เลขประจำตัวนักเรียน', 'เลขประจำตัวประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'สถานะ']];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อนักเรียน");
    XLSX.writeFile(wb, "ต้นแบบรายชื่อนักเรียน.xlsx");
}

function triggerImportStudents() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนทำการนำเข้า Excel', 'warning');
    document.getElementById('excelUploadStudents').click();
}

async function exportAllStudentsExcel() {
    Swal.fire({ title: 'กำลังดึงข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        const year = schoolInfo?.current_academic_year;
        const term = schoolInfo?.current_semester;
        if (!year) throw new Error('ยังไม่ได้ตั้งค่าปีการศึกษาในระบบ');

        let query = db.from('student_enrollments')
            .select(`
                student_number, status,
                core_students!inner( student_id_card, national_id, prefix, first_name, last_name ),
                core_classrooms!inner( grade_level, room_number, academic_year, semester )
            `);
        if (year) query = query.eq('core_classrooms.academic_year', year);
        if (term) query = query.eq('core_classrooms.semester', term);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบรายชื่อนักเรียนในภาคเรียนปัจจุบัน', 'info');
            return;
        }

        data.sort((a, b) => {
            const gradeA = Number(a.core_classrooms.grade_level) || 0;
            const gradeB = Number(b.core_classrooms.grade_level) || 0;
            if (gradeA !== gradeB) return gradeA - gradeB;
            const roomA = Number(a.core_classrooms.room_number) || 0;
            const roomB = Number(b.core_classrooms.room_number) || 0;
            if (roomA !== roomB) return roomA - roomB;
            const numA = Number(a.student_number) || 0;
            const numB = Number(b.student_number) || 0;
            return numA - numB;
        });

        const wsData = [['ห้อง', 'เลขที่', 'รหัสนักเรียน', 'เลขประจำตัวประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'สถานะ']];
        data.forEach(row => {
            const s = row.core_students;
            const c = row.core_classrooms;
            wsData.push([
                `ม.${c.grade_level}/${c.room_number}`,
                row.student_number || '',
                s.student_id_card || '',
                s.national_id || '',
                s.prefix || '',
                s.first_name || '',
                s.last_name || '',
                row.status || 'เรียนปกติ'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 25 }, { wch: 12 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "รายชื่อนักเรียนทั้งหมด");
        XLSX.writeFile(wb, `รายชื่อนักเรียน_เทอม${term}_${year}.xlsx`);
        Swal.close();
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function processImportStudents(event) {
    const classId = document.getElementById('filterStudentClass').value;
    const file = event.target.files[0];
    if (!file || !classId) return;

    Swal.fire({ title: 'กำลังนำเข้ารายชื่อ...', html: 'ระบบกำลังประมวลผลแยกข้อมูล<br><span class="text-sm text-red-500">*ห้ามปิดหน้าต่างนี้*</span>', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            rows = rows.map(row => {
                let rawNationalId = row['เลขประจำตัวประชาชน'] || row.national_id || '';
                rawNationalId = String(rawNationalId).trim();
                if (rawNationalId === '' || rawNationalId === '-' || rawNationalId === '9999999999999') {
                    row['เลขประจำตัวประชาชน'] = null;
                    row.national_id = null;
                } else {
                    row['เลขประจำตัวประชาชน'] = rawNationalId;
                    row.national_id = rawNationalId;
                }
                return row;
            });

            await insertStudentDataToDB(rows, classId);
            event.target.value = '';
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message || 'รูปแบบไฟล์ไม่ถูกต้อง', 'error');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

async function triggerImportGoogleSheet() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือก "ห้องเรียนปลายทาง" ในระบบก่อนทำการดึงข้อมูล', 'warning');

    const { value: formValues } = await Swal.fire({
        title: 'ดึงข้อมูลจาก Google Sheet',
        html: `
            <div class="text-sm text-left text-gray-600 mb-4 space-y-2 bg-green-50 p-4 rounded-xl border border-green-200">
                <p class="font-bold text-green-800"><i class="fa-solid fa-circle-info"></i> วิธีดึงจากไฟล์รวม (Database เดียว):</p>
                <ol class="list-decimal ml-5 space-y-1">
                    <li>วางลิงก์ไฟล์ Google Sheet (แบบ Anyone with the link)</li>
                    <li>ในไฟล์ Sheet ต้องมีคอลัมน์ชื่อ <b>"ห้อง"</b> หรือ <b>"ห้องเรียน"</b></li>
                    <li>พิมพ์ระบุชื่อห้องที่ต้องการนำเข้า (เพื่อให้ระบบกรองเฉพาะห้องนี้)</li>
                </ol>
            </div>
            <input id="swal-gsheet-url" class="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 outline-none focus:border-green-500 font-medium" placeholder="วางลิงก์ Google Sheet ที่นี่...">
            <input id="swal-gsheet-room" class="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-blue-500 font-medium" placeholder="ตัวกรอง: เช่น 1/1, ม.1/1 (ปล่อยว่างเท่านำเข้าทั้งหมด)">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#0f9d58',
        confirmButtonText: '<i class="fa-solid fa-filter"></i> ดึงและกรองข้อมูล',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const url = document.getElementById('swal-gsheet-url').value.trim();
            const roomFilter = document.getElementById('swal-gsheet-room').value.trim();
            if (!url) Swal.showValidationMessage('กรุณาวางลิงก์ Google Sheet ก่อนครับ');
            return { url, roomFilter };
        }
    });

    if (formValues && formValues.url) {
        Swal.fire({ title: 'กำลังดึงและกรองข้อมูล...', html: 'กรุณารอสักครู่ ระบบกำลังค้นหาห้องที่คุณระบุ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const match = formValues.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!match) throw new Error("รูปแบบลิงก์ Google Sheet ไม่ถูกต้องครับ");
            const sheetId = match[1];

            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
            const response = await fetch(csvUrl);
            if (!response.ok) throw new Error("ไม่สามารถเข้าถึงไฟล์ได้ (โปรดตรวจสอบว่าเปิดแชร์ Anyone with the link แล้ว)");
            const csvText = await response.text();

            const workbook = XLSX.read(csvText, { type: 'string' });
            let rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (!rawRows || rawRows.length === 0) throw new Error("ไม่พบข้อมูลใน Google Sheet หรือรูปแบบตารางไม่ถูกต้อง");

            let rows = rawRows.map(row => {
                let cleanRow = {};
                for (let key in row) {
                    const cleanKey = key.replace(/"/g, '').trim();
                    cleanRow[cleanKey] = row[key];
                }
                let rawNationalId = cleanRow['เลขประจำตัวประชาชน'] || cleanRow.national_id || '';
                rawNationalId = String(rawNationalId).trim();
                if (rawNationalId === '' || rawNationalId === '-' || rawNationalId === '9999999999999') {
                    cleanRow['เลขประจำตัวประชาชน'] = null;
                    cleanRow.national_id = null;
                } else {
                    cleanRow['เลขประจำตัวประชาชน'] = rawNationalId;
                    cleanRow.national_id = rawNationalId;
                }
                return cleanRow;
            });

            if (formValues.roomFilter) {
                rows = rows.filter(row => {
                    const sheetRoom = row['ห้อง'] || row['ห้องเรียน'] || row['ชั้นเรียน'] || row['room'] || '';
                    return String(sheetRoom).trim() === formValues.roomFilter;
                });
                if (rows.length === 0) throw new Error(`ไม่พบรายชื่อนักเรียนห้อง "${formValues.roomFilter}" ในไฟล์เลยครับ (เช็กชื่อคอลัมน์ใน Sheet ว่าตั้งเป็น "ห้อง" หรือไม่)`);
            }

            await insertStudentDataToDB(rows, classId);
            Swal.fire('นำเข้าสำเร็จ!', `ดึงรายชื่อนักเรียนห้อง ${formValues.roomFilter || 'ทั้งหมด'} จำนวน ${rows.length} คน เรียบร้อยแล้ว`, 'success');
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

async function insertStudentDataToDB(rows, classId) {
    if (!rows || rows.length === 0) throw new Error("ไม่พบข้อมูลที่จะนำเข้า");

    let successCount = 0;
    let errorList = [];

    const { data: existingEnrollments } = await db.from('student_enrollments')
        .select('student_id, id')
        .eq('classroom_id', classId);
    const existingMap = new Map();
    if (existingEnrollments) {
        existingEnrollments.forEach(e => existingMap.set(e.student_id, e.id));
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const stdIdCard = (row['เลขประจำตัวนักเรียน'] || row['เลขประจำตัว'] || '')?.toString().trim();
        const fName = (row['ชื่อ'] || row['ชื่อจริง'] || '')?.toString().trim();

        if (!stdIdCard || !fName) {
            errorList.push(`แถวที่ ${i + 2}: ขาดข้อมูลสำคัญ (เลขประจำตัว หรือ ชื่อ)`);
            continue;
        }

        const { data: stdData, error: stdErr } = await db.from('core_students').upsert({
            student_id_card: stdIdCard,
            national_id: row['เลขประจำตัวประชาชน']?.toString().trim() || null,
            prefix: row['คำนำหน้า']?.toString().trim() || '',
            first_name: fName,
            last_name: row['นามสกุล']?.toString().trim() || ''
        }, { onConflict: 'student_id_card' }).select('id').single();

        if (stdErr) {
            errorList.push(`แถวที่ ${i + 2}: ข้อผิดพลาดประวัติ (${stdErr.message})`);
            continue;
        }

        const studentId = stdData.id;
        const studentNumber = parseInt(row['เลขที่']) || null;
        const status = row['สถานะ']?.toString().trim() || 'เรียนปกติ';

        if (existingMap.has(studentId)) {
            const enrollId = existingMap.get(studentId);
            const { error: updateErr } = await db.from('student_enrollments')
                .update({ student_number: studentNumber, status })
                .eq('id', enrollId);
            if (updateErr) errorList.push(`แถวที่ ${i + 2}: อัปเดตเลขที่/สถานะไม่สำเร็จ (${updateErr.message})`);
            else successCount++;
        } else {
            const { error: insertErr } = await db.from('student_enrollments').insert({
                student_id: studentId,
                classroom_id: classId,
                student_number: studentNumber,
                status
            });
            if (insertErr) errorList.push(`แถวที่ ${i + 2}: เพิ่มลงห้องไม่สำเร็จ (${insertErr.message})`);
            else successCount++;
        }
    }

    if (errorList.length > 0) {
        let errHtml = `<div class="text-left text-sm text-red-600 max-h-40 overflow-y-auto mt-2 bg-red-50 p-2 border border-red-200 rounded-lg">` + errorList.map(err => `<div>- ${err}</div>`).join('') + `</div>`;
        Swal.fire({ icon: 'warning', title: `นำเข้าสำเร็จ ${successCount} รายการ`, html: `แต่พบข้อผิดพลาดบางส่วน:<br>${errHtml}`, confirmButtonText: 'รับทราบ' });
    } else {
        Swal.fire({ icon: 'success', title: 'นำเข้ารายชื่อสำเร็จ!', text: `จำนวน ${successCount} คน เข้าสู่ระบบเรียบร้อยแล้ว`, timer: 2000, showConfirmButton: false });
    }
    await loadStudents();
}

// ตรวจสอบนักเรียนซ้ำ (คงเดิม)
async function checkDuplicateStudents() {
    Swal.fire({ title: 'กำลังสแกนฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        if (!schoolInfo) throw new Error('ไม่พบข้อมูลปีการศึกษา');

        const { data: enrolls, error } = await db.from('student_enrollments').select(`
            id, student_number,
            core_students ( id, student_id_card, prefix, first_name, last_name ),
            core_classrooms ( id, grade_level, room_number, academic_year, semester )
        `);
        if (error) throw error;

        const currentEnrolls = enrolls.filter(e =>
            e.core_classrooms &&
            e.core_classrooms.academic_year === schoolInfo.current_academic_year &&
            e.core_classrooms.semester === schoolInfo.current_semester &&
            e.core_students
        );

        const studentMap = {};
        currentEnrolls.forEach(e => {
            const sid = e.core_students.id;
            if (!studentMap[sid]) studentMap[sid] = [];
            studentMap[sid].push(e);
        });

        const duplicates = Object.values(studentMap).filter(arr => arr.length > 1);
        Swal.close();

        if (duplicates.length === 0) {
            return Swal.fire({ icon: 'success', title: 'ยอดเยี่ยม!', text: 'ไม่พบนักเรียนที่มีรายชื่อซ้ำซ้อนในเทอมปัจจุบันครับ' });
        }

        let html = `
        <div class="bg-rose-50 text-rose-700 p-4 rounded-2xl mb-4 text-sm border border-rose-200 shadow-sm flex gap-3 items-start">
            <i class="fas fa-exclamation-triangle text-xl mt-0.5"></i>
            <div>
                <p class="font-bold text-base">พบนักเรียนมีรายชื่อซ้ำซ้อน ${duplicates.length} คน</p>
                <p class="text-rose-600 mt-1">ระบบพบนักเรียนที่มีรายชื่อผูกอยู่กับหลายห้องในเทอมปัจจุบัน กรุณาลบรายชื่อออกจากห้องที่ผิดครับ</p>
            </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="bg-slate-100 text-slate-600">
                    <tr>
                        <th class="p-3 border-b font-bold w-1/4">เลขประจำตัว</th>
                        <th class="p-3 border-b font-bold w-1/3">ชื่อ-นามสกุล</th>
                        <th class="p-3 border-b font-bold">ห้องเรียนที่มีชื่ออยู่</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
        `;
        duplicates.forEach(arr => {
            const stu = arr[0].core_students;
            html += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 align-top font-medium text-slate-600">${stu.student_id_card || '-'}</td>
                <td class="p-3 align-top font-bold text-blue-700">${stu.prefix || ''}${stu.first_name} ${stu.last_name}</td>
                <td class="p-3 align-top">
                    <div class="space-y-2">
            `;
            arr.forEach(enroll => {
                const cr = enroll.core_classrooms;
                html += `
                        <div class="flex items-center justify-between bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm">
                            <span class="font-bold text-slate-700"><i class="fas fa-door-open text-slate-400 mr-1"></i> ม.${cr.grade_level}/${cr.room_number} <span class="text-xs text-slate-400 font-normal ml-1">(เลขที่ ${enroll.student_number || '-'})</span></span>
                            <button onclick="removeDuplicateEnrollment('${enroll.id}')" class="text-xs font-bold bg-red-50 text-red-600 border border-red-100 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition shadow-sm">
                                <i class="fas fa-trash-alt mr-1"></i> ลบออก
                            </button>
                        </div>
                `;
            });
            html += `</div></td></tr>`;
        });
        html += `</tbody></table></div>`;
        document.getElementById('duplicate-content').innerHTML = html;
        document.getElementById('modal-duplicates').classList.remove('hidden');
        document.getElementById('modal-duplicates').classList.add('flex');
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function closeDuplicateModal() {
    document.getElementById('modal-duplicates').classList.add('hidden');
    document.getElementById('modal-duplicates').classList.remove('flex');
}

async function removeDuplicateEnrollment(enrollId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบรายชื่อ?',
        html: '<p class="text-sm text-red-500">รายชื่อนี้จะถูกนำออกจากห้องเรียนนี้เท่านั้น<br>(ข้อมูลประวัติเด็กยังอยู่ครบ)</p>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบรายชื่อนี้',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('student_enrollments').delete().eq('id', enrollId);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1500, showConfirmButton: false });
            checkDuplicateStudents();
            loadStudents();
        }
    }
}

// ค้นหานักเรียนอิสระ
function openGlobalStudentSearch() {
    Swal.fire({
        title: 'ค้นหาและจัดการนักเรียนทั้งระบบ',
        html: '<p class="text-sm text-gray-500 mb-4">ค้นหาเพื่อแก้ไขชื่อ, ย้ายห้อง หรือลบนักเรียนที่ซ้ำซ้อน</p>',
        input: 'text',
        inputPlaceholder: 'พิมพ์ชื่อ, นามสกุล หรือเลขประจำตัว...',
        showCancelButton: true,
        confirmButtonColor: '#9333ea',
        confirmButtonText: '<i class="fas fa-search"></i> ค้นหา',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value) return 'กรุณาพิมพ์คำค้นหาด้วยครับ!';
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            searchGlobalStudents(result.value.trim());
        }
    });
}

async function searchGlobalStudents(keyword) {
    Swal.fire({ title: 'กำลังค้นหา...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: students, error: stuErr } = await db
            .from('core_students')
            .select(`
                id,
                student_id_card,
                first_name,
                last_name,
                student_enrollments!student_id (
                    id,
                    student_number,
                    classroom_id,
                    core_classrooms (
                        id,
                        grade_level,
                        room_number,
                        academic_year,
                        semester
                    )
                )
            `)
            .or(`student_id_card.ilike.%${keyword}%,first_name.ilike.%${keyword}%,last_name.ilike.%${keyword}%`)
            .limit(50);
        if (stuErr) throw stuErr;
        if (!students || students.length === 0) {
            Swal.fire('ไม่พบข้อมูล', `ไม่พบนักเรียนที่ตรงกับ "${keyword}"`, 'info');
            return;
        }

        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year').single();
        const currentYear = schoolInfo?.current_academic_year || (new Date().getFullYear() + 543).toString();
        const { data: classrooms } = await db
            .from('core_classrooms')
            .select('id, grade_level, room_number, semester, academic_year')
            .eq('academic_year', currentYear)
            .order('grade_level')
            .order('room_number');

        const roomOptions = (classrooms || []).map(c => ({
            value: c.id,
            text: `ม.${c.grade_level}/${c.room_number} (เทอม ${c.semester}/${c.academic_year})`
        }));

        let html = `<div class="overflow-x-auto max-h-[60vh] text-left">
            <table class="w-full text-sm border-collapse">
                <thead class="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th class="p-2 border border-gray-300">รหัส</th>
                        <th class="p-2 border border-gray-300">ชื่อ - นามสกุล</th>
                        <th class="p-2 border border-gray-300 text-center">ห้องปัจจุบัน</th>
                        <th class="p-2 border border-gray-300 text-center">เปลี่ยนห้อง</th>
                        <th class="p-2 border border-gray-300 text-center">ลบ</th>
                    </tr>
                </thead>
                <tbody>`;
        for (const s of students) {
            const enroll = s.student_enrollments && s.student_enrollments.length > 0 ? s.student_enrollments[0] : null;
            const currentRoomId = enroll?.classroom_id || '';
            const enrollId = enroll?.id || '';

            let roomText = '<span class="text-rose-500 font-bold">ไม่มีห้อง</span>';
            if (enroll && enroll.core_classrooms) {
                const cr = enroll.core_classrooms;
                roomText = `<span class="font-bold text-indigo-700">ม.${cr.grade_level}/${cr.room_number}</span><br>
                            <span class="text-[10px] text-gray-500">(เทอม ${cr.semester}/${cr.academic_year})</span>`;
            }
            html += `
                <tr class="hover:bg-purple-50 transition-colors">
                    <td class="p-2 border border-gray-300 font-medium text-gray-700">${s.student_id_card || '-'}</td>
                    <td class="p-2 border border-gray-300 min-w-[150px]">
                        <input type="text" id="fname_${s.id}" value="${escapeHtml(s.first_name)}" class="border rounded p-1 w-full text-xs mb-1 outline-none focus:border-purple-500" placeholder="ชื่อ">
                        <input type="text" id="lname_${s.id}" value="${escapeHtml(s.last_name)}" class="border rounded p-1 w-full text-xs outline-none focus:border-purple-500" placeholder="นามสกุล">
                        <button onclick="saveGlobalStudentName('${s.id}')" class="w-full mt-1 text-[10px] bg-purple-100 text-purple-700 py-1 rounded hover:bg-purple-200 font-bold">บันทึกชื่อ</button>
                    </td>
                    <td class="p-2 border border-gray-300 text-center whitespace-nowrap">${roomText}</td>
                    <td class="p-2 border border-gray-300 text-center min-w-[200px]">
                        <select class="room-select" data-student-id="${s.id}" data-enroll-id="${enrollId}" data-current-room="${currentRoomId}"></select>
                    </td>
                    <td class="p-2 border border-gray-300 text-center">
                        <button onclick="deleteGlobalStudent('${s.id}', '${escapeHtml(s.first_name)}')" class="bg-red-50 text-red-600 hover:bg-red-500 hover:text-white h-8 w-8 rounded-full transition-colors"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }
        html += `</tbody></table></div>`;

        Swal.fire({
            title: 'ผลการค้นหานักเรียน',
            html: html,
            width: '1000px',
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'ปิด',
            didOpen: () => {
                document.querySelectorAll('.room-select').forEach(select => {
                    const studentId = select.dataset.studentId;
                    const enrollId = select.dataset.enrollId;
                    const currentRoomId = select.dataset.currentRoom;
                    new TomSelect(select, {
                        options: roomOptions,
                        valueField: 'value',
                        labelField: 'text',
                        searchField: ['text'],
                        placeholder: currentRoomId ? '-- ถอดออกจากห้อง --' : '-- เลือกห้องเพื่อเพิ่ม --',
                        allowEmptyOption: true,
                        onChange: (value) => {
                            changeStudentGlobalRoom(studentId, enrollId, value || '');
                        }
                    });
                    if (currentRoomId) {
                        select.tomselect.setValue(currentRoomId);
                    }
                });
            },
            willClose: () => {
                document.querySelectorAll('.room-select').forEach(select => {
                    if (select.tomselect) select.tomselect.destroy();
                });
            }
        });
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function saveGlobalStudentName(studentId) {
    const fname = document.getElementById(`fname_${studentId}`).value.trim();
    const lname = document.getElementById(`lname_${studentId}`).value.trim();
    if (!fname || !lname) return Swal.fire({ toast: true, position: 'top-end', title: 'กรุณากรอกชื่อและสกุล', icon: 'warning', showConfirmButton: false, timer: 1500 });
    const { error } = await db.from('core_students').update({ first_name: fname, last_name: lname }).eq('id', studentId);
    if (error) Swal.fire({ toast: true, position: 'top-end', title: 'อัปเดตชื่อผิดพลาด', icon: 'error', showConfirmButton: false, timer: 1500 });
    else Swal.fire({ toast: true, position: 'top-end', title: 'อัปเดตชื่อสำเร็จ', icon: 'success', showConfirmButton: false, timer: 1500 });
}

async function changeStudentGlobalRoom(studentId, currentEnrollId, newRoomId) {
    Swal.fire({ title: 'กำลังอัปเดตห้องเรียน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (!newRoomId) {
            if (currentEnrollId) await db.from('student_enrollments').delete().eq('id', currentEnrollId);
        } else {
            if (currentEnrollId) await db.from('student_enrollments').update({ classroom_id: newRoomId }).eq('id', currentEnrollId);
            else await db.from('student_enrollments').insert({ student_id: studentId, classroom_id: newRoomId });
        }
        Swal.fire({ icon: 'success', title: 'อัปเดตห้องเรียนสำเร็จ', timer: 1500, showConfirmButton: false });
        if (typeof loadStudents === 'function') loadStudents();
        if (typeof updateUnassignedBadge === 'function') updateUnassignedBadge();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deleteGlobalStudent(studentId, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบถาวร?',
        html: `<p class="text-sm text-red-500">คุณกำลังลบ <b>${name}</b> ออกจากระบบ<br>ข้อมูลการเข้าเรียน, พฤติกรรม <b>จะถูกลบทั้งหมด</b></p>`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูลถาวร'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_students').delete().eq('id', studentId);
        if (!error) {
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
            const row = document.getElementById(`fname_${studentId}`).closest('tr');
            if (row) row.remove();
        } else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

// นักเรียนตกหล่น
async function checkUnassignedStudents() {
    Swal.fire({ title: 'กำลังตรวจสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
        const activeYear = sInfo?.current_academic_year;
        if (!activeYear) throw new Error("ไม่พบข้อมูลปีการศึกษาปัจจุบัน");

        const { data: allStudents, error: allErr } = await db.from('core_students').select('id, student_id_card, first_name, last_name');
        if (allErr) throw allErr;

        const { data: enrolledData, error: enrErr } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms!inner(academic_year)')
            .eq('core_classrooms.academic_year', activeYear);
        if (enrErr) throw enrErr;

        const enrolledIds = new Set(enrolledData ? enrolledData.map(e => e.student_id) : []);
        const unassignedStudents = allStudents.filter(s => !enrolledIds.has(s.id));

        if (!unassignedStudents || unassignedStudents.length === 0) {
            return Swal.fire({ icon: 'success', title: 'ข้อมูลเรียบร้อย!', text: `นักเรียนทุกคนในปีการศึกษา ${activeYear} มีห้องเรียนครบถ้วนแล้ว`, confirmButtonColor: '#10b981' });
        }

        let studentListHtml = `
            <div class="overflow-x-auto max-h-[60vh] text-left border rounded-2xl shadow-sm bg-white">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-rose-50 sticky top-0 z-10">
                        <tr class="text-rose-700">
                            <th class="p-3 border-b border-rose-100 w-20 text-center">ลำดับ</th>
                            <th class="p-3 border-b border-rose-100">รหัสประจำตัว</th>
                            <th class="p-3 border-b border-rose-100">ชื่อ - นามสกุล</th>
                            <th class="p-3 border-b border-rose-100 text-center w-40 whitespace-nowrap">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${unassignedStudents.map((s, index) => `
                            <tr class="hover:bg-rose-50/50 transition-colors">
                                <td class="p-3 text-center text-slate-400 font-medium">${index + 1}</td>
                                <td class="p-3 font-mono font-bold text-blue-600">${s.student_id_card || '-'}</td>
                                <td class="p-3 font-bold text-slate-700">${s.first_name} ${s.last_name}</td>
                                <td class="p-3 text-center">
                                    <button onclick="Swal.close(); searchGlobalStudents('${s.student_id_card}')" 
                                        class="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-black shadow-sm transition-all">
                                        <i class="fas fa-plus mr-1"></i> จัดเข้าห้อง
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="mt-4 p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3">
                <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center text-rose-500 shadow-sm shrink-0">
                    <i class="fas fa-user-slash"></i>
                </div>
                <div class="text-left">
                    <p class="text-sm font-black text-rose-700">พบนร. ยังไม่มีห้อง ${unassignedStudents.length} คน</p>
                    <p class="text-[11px] text-rose-500 font-bold">กรุณาคลิกปุ่ม "จัดเข้าห้อง" เพื่อเลือกห้องเรียนให้เด็ก</p>
                </div>
            </div>
        `;
        Swal.fire({ title: `นักเรียนตกหล่น (ปี ${activeYear})`, html: studentListHtml, width: '960px', showConfirmButton: false, showCancelButton: true, cancelButtonText: 'ปิดหน้าต่าง' });
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถตรวจสอบได้: ' + err.message, 'error');
    }
}

// คัดลอกเทอม, เลื่อนชั้น
async function copyToTerm2() {
    Swal.fire({ title: 'กำลังตรวจสอบระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: sysSettings } = await db.from('core_school_info').select('*').eq('id', 1).single();
        const currentYear = sysSettings.current_academic_year;
        const currentTerm = sysSettings.current_semester;
        Swal.close();
        if (currentTerm !== '2') {
            return Swal.fire('แจ้งเตือน', 'ฟังก์ชันนี้ใช้สำหรับคัดลอกข้อมูลเข้าสู่ "เทอม 2" เท่านั้น<br>กรุณาเปลี่ยนการตั้งค่าระบบเป็นเทอม 2 ก่อนครับ', 'warning');
        }
        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการคัดลอกรายชื่อ?',
            html: `ระบบจะคัดลอกรายชื่อนักเรียนทั้งหมดจาก <b>เทอม 1 / ${currentYear}</b><br>มายัง <b>เทอม 2 / ${currentYear}</b> (ห้องเรียนเดิม เลขที่เดิม)`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#2563eb', confirmButtonText: 'ยืนยันการคัดลอก', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
        Swal.fire({ title: 'กำลังดึงและจัดสรรข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: sourceClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '1');
        const { data: destClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '2');
        if (!sourceClasses || sourceClasses.length === 0) throw new Error('ไม่พบข้อมูลโครงสร้างห้องเรียนของเทอม 1 ในระบบ');
        if (!destClasses || destClasses.length === 0) throw new Error('ไม่พบข้อมูลโครงสร้างห้องเรียนของเทอม 2 (กรุณาสร้างห้องเรียนส่วนกลางก่อน)');

        let enrollmentsToInsert = [];
        for (let destClass of destClasses) {
            const sourceClass = sourceClasses.find(c => c.grade_level === destClass.grade_level && c.room_number === destClass.room_number);
            if (sourceClass) {
                const { data: students } = await db.from('student_enrollments').select('student_id, student_number, status').eq('classroom_id', sourceClass.id);
                const { data: existing } = await db.from('student_enrollments').select('student_id').eq('classroom_id', destClass.id);
                const existingIds = existing ? existing.map(e => e.student_id) : [];
                if (students) {
                    students.forEach(std => {
                        if (!existingIds.includes(std.student_id)) {
                            enrollmentsToInsert.push({
                                classroom_id: destClass.id,
                                student_id: std.student_id,
                                student_number: std.student_number,
                                status: std.status || 'ปกติ'
                            });
                        }
                    });
                }
            }
        }
        if (enrollmentsToInsert.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีรายชื่อนักเรียนใหม่ให้คัดลอก<br>(หรือนักเรียนทั้งหมดถูกคัดลอกมาครบแล้ว)', 'info');
        const { error } = await db.from('student_enrollments').insert(enrollmentsToInsert);
        if (error) throw error;
        Swal.fire('สำเร็จ!', `คัดลอกนักเรียนจำนวน ${enrollmentsToInsert.length} รายการ เข้าสู่เทอม 2 เรียบร้อยแล้ว`, 'success');
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function promoteStudents() {
    Swal.fire({ title: 'กำลังตรวจสอบระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: sysSettings } = await db.from('core_school_info').select('*').eq('id', 1).single();
        const currentYear = sysSettings.current_academic_year;
        const currentTerm = sysSettings.current_semester;
        const prevYear = (parseInt(currentYear) - 1).toString();
        Swal.close();
        if (currentTerm !== '1') {
            return Swal.fire('แจ้งเตือน', 'ฟังก์ชันเลื่อนชั้นใช้สำหรับ "เทอม 1" ของปีการศึกษาใหม่เท่านั้น<br>กรุณาเปลี่ยนการตั้งค่าระบบเป็นเทอม 1 ก่อนครับ', 'warning');
        }
        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการเลื่อนชั้นเรียน?',
            html: `ระบบจะดึงรายชื่อจาก <b>เทอม 2 / ${prevYear}</b><br>เลื่อนระดับชั้นมายัง <b>เทอม 1 / ${currentYear}</b><br><br><span class="text-sm text-red-500">*หมายเหตุ: ระบบจะเลื่อนชั้นอัตโนมัติ (เช่น ม.1->ม.2)<br>และจะข้ามการเลื่อนชั้นของ ม.3 และ ม.6 (จบการศึกษา)</span>`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#9333ea', confirmButtonText: 'ยืนยันการเลื่อนชั้น', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
        Swal.fire({ title: 'กำลังประมวลผลเลื่อนชั้น...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: sourceClasses } = await db.from('core_classrooms').select('*').eq('academic_year', prevYear).eq('semester', '2');
        const { data: destClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '1');
        if (!sourceClasses || sourceClasses.length === 0) throw new Error(`ไม่พบโครงสร้างห้องเรียนของเทอม 2 ปีการศึกษา ${prevYear}`);
        if (!destClasses || destClasses.length === 0) throw new Error(`ไม่พบโครงสร้างห้องเรียนของเทอม 1 ปีการศึกษา ${currentYear} (กรุณาสร้างก่อน)`);

        let enrollmentsToInsert = [];
        for (let destClass of destClasses) {
            if (destClass.grade_level === 1 || destClass.grade_level === 4) continue;
            const sourceGrade = destClass.grade_level - 1;
            const sourceClass = sourceClasses.find(c => c.grade_level === sourceGrade && c.room_number === destClass.room_number);
            if (sourceClass) {
                const { data: students } = await db.from('student_enrollments').select('student_id, student_number, status').eq('classroom_id', sourceClass.id);
                const { data: existing } = await db.from('student_enrollments').select('student_id').eq('classroom_id', destClass.id);
                const existingIds = existing ? existing.map(e => e.student_id) : [];
                if (students) {
                    students.forEach(std => {
                        if (!existingIds.includes(std.student_id)) {
                            enrollmentsToInsert.push({
                                classroom_id: destClass.id,
                                student_id: std.student_id,
                                student_number: std.student_number,
                                status: std.status || 'ปกติ'
                            });
                        }
                    });
                }
            }
        }
        if (enrollmentsToInsert.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่พบรายชื่อนักเรียนที่จะสามารถเลื่อนชั้นได้<br>(หรือคุณยังไม่มีข้อมูลของปีการศึกษาที่แล้ว หรือเลื่อนชั้นเสร็จหมดแล้ว)', 'info');
        const { error } = await db.from('student_enrollments').insert(enrollmentsToInsert);
        if (error) throw error;
        Swal.fire('สำเร็จ!', `เลื่อนชั้นนักเรียนจำนวน ${enrollmentsToInsert.length} รายการ เข้าสู่ปีการศึกษา ${currentYear} เรียบร้อยแล้ว`, 'success');
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

// จัดลำดับเลขที่นักเรียน (drag & drop)
async function openStudentNumberReorder() {
    const classId = document.getElementById('filterStudentClass').value;
    const classSelect = document.getElementById('filterStudentClass');
    const className = classSelect.options[classSelect.selectedIndex]?.text || '';
    if (!classId) return Swal.fire({ icon: 'warning', title: 'กรุณาเลือกห้องเรียนก่อน', timer: 2000, showConfirmButton: false });

    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: enrollments, error } = await db
        .from('student_enrollments')
        .select(`id, student_number, status, core_students!inner(student_id_card, prefix, first_name, last_name)`)
        .eq('classroom_id', classId)
        .order('student_number', { ascending: true });
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    if (!enrollments || enrollments.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่พบนักเรียนในห้องนี้', 'info');
    Swal.close();

    let rowsHtml = '';
    enrollments.forEach((enr, idx) => {
        const s = enr.core_students;
        const num = enr.student_number ?? idx + 1;
        const stBadge = enr.status === 'เรียนปกติ'
            ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">เรียนปกติ</span>'
            : `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">${enr.status || '-'}</span>`;
        rowsHtml += `
      <tr data-enrollment-id="${enr.id}"
          class="reorder-row bg-white hover:bg-blue-50 border-b border-gray-100 cursor-grab active:cursor-grabbing transition-colors">
        <td class="p-2 text-center font-mono font-bold text-indigo-600 order-number w-12 select-none">${num}</td>
        <td class="p-2 text-sm font-bold text-blue-700 select-none">${s.student_id_card || '-'}</td>
        <td class="p-2 text-sm text-gray-800 select-none">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
        <td class="p-2 text-center select-none">${stBadge}</td>
        <td class="p-2 text-center text-gray-300 select-none drag-handle-cell"><i class="fas fa-grip-vertical"></i></td>
      </tr>`;
    });

    const html = `
    <div class="flex items-center gap-2 text-xs text-blue-700 mb-3 bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
      <i class="fas fa-hand-pointer text-blue-500"></i>
      <span>ลากแถวขึ้น-ลงเพื่อจัดลำดับ — เลขที่จะอัปเดตอัตโนมัติ — กด <b>บันทึก</b> เพื่อยืนยัน</span>
    </div>
    <div class="overflow-auto rounded-xl border border-gray-200" style="max-height:55vh;">
      <table class="w-full border-collapse bg-white text-left" id="reorder-student-table">
        <thead class="bg-gray-50 sticky top-0 z-10">
          <tr class="text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <th class="p-2 text-center w-12">เลขที่</th>
            <th class="p-2">รหัสนักเรียน</th>
            <th class="p-2">ชื่อ-สกุล</th>
            <th class="p-2 text-center">สถานะ</th>
            <th class="p-2 w-10"></th>
          </tr>
        </thead>
        <tbody id="reorder-student-tbody">${rowsHtml}</tbody>
      </table>
    </div>`;

    const { isConfirmed } = await Swal.fire({
        title: `<span class="text-indigo-700"><i class="fas fa-sort-numeric-up-alt mr-2"></i>จัดลำดับเลขที่</span><span class="text-base font-normal text-gray-500 ml-2">${className}</span>`,
        html,
        width: '720px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึกเลขที่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#6b7280',
        showLoaderOnConfirm: true,
        didOpen: () => {
            const tbody = document.getElementById('reorder-student-tbody');
            if (!tbody || typeof Sortable === 'undefined') return;
            new Sortable(tbody, {
                animation: 180,
                ghostClass: 'opacity-30',
                chosenClass: 'bg-indigo-50',
                dragClass: 'shadow-lg',
                handle: '.reorder-row',
                onEnd: () => { _updateStudentOrderNumbers(); }
            });
        },
        preConfirm: async () => {
            const rows = document.querySelectorAll('#reorder-student-tbody tr');
            const updates = Array.from(rows).map((row, index) =>
                db.from('student_enrollments').update({ student_number: index + 1 }).eq('id', row.dataset.enrollmentId)
            );
            try {
                const results = await Promise.all(updates);
                const failed = results.filter(r => r.error);
                if (failed.length > 0) throw new Error(failed[0].error.message);
                return true;
            } catch (err) {
                Swal.showValidationMessage(`บันทึกไม่สำเร็จ: ${err.message}`);
                return false;
            }
        },
        allowOutsideClick: () => !Swal.isLoading()
    });
    if (isConfirmed) {
        await loadStudents();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'อัปเดตลำดับเลขที่นักเรียนเรียบร้อยแล้ว', timer: 2000, showConfirmButton: false });
    }
}

function _updateStudentOrderNumbers() {
    document.querySelectorAll('#reorder-student-tbody tr').forEach((row, i) => {
        const cell = row.querySelector('.order-number');
        if (cell) cell.textContent = i + 1;
    });
}

// ==========================================
// ตัวแปรสำหรับอัปโหลดรูปนักเรียน
// ==========================================
let _pendingStudentAvatarFile = null;
let _studentGasSettings = null;

async function loadStudentGasSettings() {
    if (_studentGasSettings) return _studentGasSettings;
    const { data, error } = await db.from('core_school_info')
        .select('gas_avatar_api_url, gas_avatar_folder_id')
        .single();
    if (error || !data) {
        console.warn('ไม่พบการตั้งค่า GAS สำหรับอัปโหลดรูปนักเรียน');
        return { apiUrl: null, folderId: null };
    }
    _studentGasSettings = {
        apiUrl: data.gas_avatar_api_url,
        folderId: data.gas_avatar_folder_id
    };
    return _studentGasSettings;
}

function setStudentAvatar(displayElementId, studentName, imageUrl) {
    const container = document.getElementById(displayElementId);
    if (!container) return;

    if (!imageUrl || imageUrl === '') {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : '?';
        container.innerHTML = `<div class="w-24 h-24 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold text-3xl shadow-sm">${initial}</div>`;
        return;
    }

    let finalUrl = imageUrl;

    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        finalUrl = imageUrl;
    }
    else if (!imageUrl.startsWith('http') && imageUrl.match(/^[a-zA-Z0-9_-]{33,}$/)) {
        finalUrl = `https://lh3.googleusercontent.com/d/${imageUrl}=s200?authuser=0`;
    }
    else if (!imageUrl.startsWith('http')) {
        try {
            const { data: { publicUrl } } = db.storage.from('avatars').getPublicUrl(imageUrl);
            finalUrl = publicUrl;
        } catch(e) { console.warn(e); }
    }

    container.innerHTML = `<img src="${finalUrl}"
        onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=random&rounded=true&size=96';"
        class="w-24 h-24 rounded-full object-cover border border-slate-200 shadow-sm cursor-pointer"
        onclick="viewStudentImage('${finalUrl}', '${studentName.replace(/'/g, "\\'")}')"
        title="คลิกดูรูปใหญ่">`;
}

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

async function resizeImageBlob(file, maxSize) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let sc = maxSize / Math.max(img.width, img.height);
                if (sc > 1) sc = 1;
                canvas.width = img.width * sc;
                canvas.height = img.height * sc;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            };
        };
        reader.readAsDataURL(file);
    });
}

async function uploadStudentFileToDrive(file, studentCode, studentName) {
    const settings = await loadStudentGasSettings();
    if (!settings.apiUrl || !settings.folderId) {
        Swal.fire({
            icon: 'info', title: 'ยังไม่ตั้งค่าระบบอัปโหลด',
            html: `<p class="text-sm">กรุณาไปที่เมนู <b>Student Portal</b> แล้วตั้งค่า<br>
                  <b>GAS Deployment URL</b> และ <b>ID โฟลเดอร์ Drive</b> ก่อนอัปโหลดรูป</p>`,
            confirmButtonText: 'ไปตั้งค่า',
            showCancelButton: true,
            cancelButtonText: 'ยกเลิก'
        }).then(result => {
            if (result.isConfirmed) switchMenu('menu-student-portal');
        });
        return null;
    }

    Swal.fire({ title: 'กำลังย่อและอัปโหลดรูป...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
        const resizedBlob = await resizeImageBlob(file, 600);
        const base64Data = await blobToBase64(resizedBlob);

        const fileName = `avatar_${studentCode}.jpg`;

        const response = await fetch(settings.apiUrl, {
            method: "POST",
            body: JSON.stringify({
                action: 'upload',
                base64: base64Data,
                fileName: fileName,
                folderId: settings.folderId
            })
        });
        const resData = await response.json();
        if (resData.status === "success") {
            Swal.close();
            const match = resData.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const fileId = match ? match[1] : null;
            if (fileId) {
                return `https://lh5.googleusercontent.com/d/${fileId}`;
            }
            return resData.url;
        } else {
            throw new Error(resData.message);
        }
    } catch (err) {
        Swal.close();
        console.error('Upload error:', err);
        Swal.fire('อัปโหลดไม่สำเร็จ', 'ตรวจสอบการเชื่อมต่อ GAS หรือสิทธิ์โฟลเดอร์', 'error');
        return null;
    }
}

async function uploadStudentAvatarNow() {
    if (!_pendingStudentAvatarFile) {
        return Swal.fire('ไม่มีไฟล์', 'ยังไม่ได้เลือกรูป', 'info');
    }
    const enrollId = document.getElementById('s_id').value;
    const coreStudentId = document.getElementById('s_core_id').value;
    if (!coreStudentId) {
        Swal.fire({
            icon: 'info',
            title: 'ยังอัปโหลดไม่ได้',
            text: 'กรุณาบันทึกข้อมูลนักเรียนก่อน (สร้างประวัติ) แล้วค่อยอัปโหลดรูป',
            confirmButtonText: 'เข้าใจแล้ว'
        });
        return;
    }

    const { data: student, error } = await db.from('core_students')
        .select('student_id_card')
        .eq('id', coreStudentId)
        .single();

    if (error || !student || !student.student_id_card) {
        console.error(error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบเลขประจำตัวนักเรียน กรุณาบันทึกข้อมูลก่อน', 'error');
        return;
    }

    const studentCode = student.student_id_card;
    const fullName = `${document.getElementById('s_prefix').value}${document.getElementById('s_fname').value} ${document.getElementById('s_lname').value}`;
    const driveUrl = await uploadStudentFileToDrive(_pendingStudentAvatarFile, studentCode, fullName);

    if (driveUrl) {
        document.getElementById('s_avatar_url').value = driveUrl;
        setStudentAvatar('student-avatar-preview', fullName, driveUrl);
        _pendingStudentAvatarFile = null;
        const badge = document.getElementById('student-avatar-badge');
        if (badge) badge.classList.add('hidden');
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'อัปโหลดรูปสำเร็จ!', showConfirmButton: false, timer: 2000 });
    }
}

async function clearStudentAvatar() {
    document.getElementById('s_avatar_url').value = '';
    const fullName = `${document.getElementById('s_prefix').value}${document.getElementById('s_fname').value} ${document.getElementById('s_lname').value}`;
    setStudentAvatar('student-avatar-preview', fullName, null);
    _pendingStudentAvatarFile = null;
    const badge = document.getElementById('student-avatar-badge');
    if (badge) badge.classList.add('hidden');
}
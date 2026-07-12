// ==========================================
// scholarship_teacher.js (ฉบับสมบูรณ์ แก้ไขล่าสุด)
// - ใช้ checkSessionAndRole() จาก config.js
// - ใช้ isAdminUser() และ requireAdmin() จาก config.js
// - ใช้ hasModuleAccess() สำหรับตรวจสอบ Module Admin
// - Logout ไป login.html ตามมาตรฐาน
// - ใช้ applyVisibilityByRole() จาก config.js
// ==========================================

// ===== STATE VARIABLES =====
let currentUser = null;
let currentProfile = null;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let currentYear = '';
let currentTerm = '';
let currentClassroomId = null;
let studentTomSelect = null;
let tsClassroom = null;
let recordStudentTomSelect = null;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_id: "" };
let currentStudentForForm = null;
let _scholarshipTableWarningShown = false;
let recordSearchCache = {};
let isModuleAdmin = false;
// เพิ่มหลัง state variables
let selectedRecipientIds = new Set();   // เก็บ id ของทุนที่เลือกในตาราง

// ==========================================
// AUTH & INIT (ใช้ checkSessionAndRole)
// ==========================================
$(document).ready(async () => {
    try {
        await checkAuth();
        await loadModuleSettings();
        initTomSelects();
        await loadClassrooms();
        applyAdminVisibility();
        document.getElementById('mainBody').classList.add('loaded');

        // ตั้งค่าแท็บเริ่มต้น (ผู้รับทุน)
        switchTab('recipients');
    } catch (err) {
        console.error('Initialization error:', err);
    }
});

// ==========================================
// checkAuth (ใช้ config.js)
// ==========================================
async function checkAuth() {
    Swal.fire({
        title: 'กำลังตรวจสอบ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    // ✅ ใช้ checkSessionAndRole จาก config.js
    const result = await checkSessionAndRole('scholarship', WRK_ROLES.ALLOWED);
    if (!result) {
        Swal.close();
        return; // redirect ไป login.html แล้ว
    }

    currentUser = result.user;
    currentProfile = result.personnel;
    actualRole = currentProfile.role;

    // ✅ ตรวจสอบ Module Admin (ใช้ hasModuleAccess)
    isModuleAdmin = await hasModuleAccess(actualRole, 'scholarship', currentUser.id);

    // ดึงข้อมูลปีการศึกษา/เทอม
    const { data: sInfo } = await db.from('core_school_info')
        .select('current_academic_year, current_semester')
        .single();

    if (sInfo) {
        currentYear = sInfo.current_academic_year;
        currentTerm = sInfo.current_semester;
        document.getElementById('term-display').innerText = `${currentTerm}/${currentYear}`;
    }

    // ✅ ตรวจสอบสิทธิ์เพิ่มเติม (หัวหน้างานปกครอง, หัวหน้าระดับชั้น)
    const [discHead, gradeHead] = await Promise.all([
        db.from('core_discipline_heads')
            .select('id')
            .eq('personnel_id', currentUser.id)
            .eq('academic_year', currentYear)
            .maybeSingle(),
        db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', currentUser.id)
            .maybeSingle()
    ]);

    // ✅ กำหนด View Role โดยใช้ isAdminUser จาก config.js
    if (isAdminUser(actualRole, false) || isModuleAdmin) {
        currentViewRole = 'module_admin';
    } else if (discHead?.data) {
        currentViewRole = 'head_discipline';
    } else if (gradeHead?.data) {
        currentViewRole = 'head_grade';
    } else {
        currentViewRole = 'teacher';
    }

    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);
    updateUIByRole();

    // ✅ แสดงปุ่มสลับโหมดเฉพาะผู้ที่มีสิทธิ์ Admin
    if (isAdminUser(actualRole, false) || isModuleAdmin) {
        document.getElementById('btnAdminMode')?.classList.remove('hidden');
    }

    updateAdminModeButton();
    Swal.close();
}

// ==========================================
// UI Helpers
// ==========================================
function updateUIByRole() {
    document.getElementById('userNameDisplay').innerText =
        `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;

    let roleText = 'ครูที่ปรึกษา';
    if (currentViewRole === 'super_admin') roleText = 'ผู้ดูแลระบบสูงสุด';
    else if (currentViewRole === 'module_admin') roleText = 'แอดมินโมดูลทุน';
    else if (currentViewRole === 'head_discipline') roleText = 'หัวหน้างานปกครอง (ดูอย่างเดียว)';
    else if (currentViewRole === 'head_grade') roleText = 'หัวหน้าระดับชั้น (ดูอย่างเดียว)';

    document.getElementById('userRoleDisplay').innerText = roleText;
    applyAdminVisibility();
}

function updateAdminModeButton() {
    const btn = document.getElementById('btnAdminMode');
    if (!btn) return;
    const isAdmin = isAdminUser(actualRole, false) || isModuleAdmin;
    if (!isAdmin) {
        btn.classList.add('hidden');
        return;
    }
    btn.classList.remove('hidden');
    if (currentViewRole === 'teacher') {
        btn.innerHTML = '<i class="fa-solid fa-user-shield md:mr-1"></i><span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
        btn.className = 'flex h-8 md:h-10 px-2 md:px-3 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm text-xs md:text-sm font-bold whitespace-nowrap';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-chalkboard-user md:mr-1"></i><span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
        btn.className = 'flex h-8 md:h-10 px-2 md:px-3 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm text-xs md:text-sm font-bold whitespace-nowrap';
    }
}

// ==========================================
// toggleRoleView (ใช้ isAdminUser จาก config)
// ==========================================
window.toggleRoleView = function () {
    const isAdmin = isAdminUser(actualRole, false) || isModuleAdmin;
    if (!isAdmin) return;

    currentViewRole = (currentViewRole === 'teacher') ? 'module_admin' : 'teacher';
    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);
    updateAdminModeButton();
    updateUIByRole();
    loadClassrooms();

    Swal.fire({
        toast: true,
        icon: 'info',
        title: `สลับเป็น${currentViewRole === 'teacher' ? 'โหมดครู' : 'โหมดผู้ดูแล'}`,
        timer: 1500
    });
};

// ==========================================
// ฟังก์ชันตรวจสอบสิทธิ์ (ใช้ config.js)
// ==========================================
function isAdminUserLocal() {
    return isAdminUser(actualRole, false) || isModuleAdmin;
}

function requireAdminLocal() {
    if (!isAdminUserLocal()) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์',
            text: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้',
            confirmButtonText: 'ตกลง'
        });
        return false;
    }
    return true;
}

// ==========================================
// applyAdminVisibility (ใช้ applyVisibilityByRole)
// ==========================================
function applyAdminVisibility() {
    const isAdmin = isAdminUserLocal();

    applyVisibilityByRole(actualRole, isAdmin, {
        settingsBtn: 'admin-settings-btn'
    });

    // จัดการปุ่มบันทึกทุน
    const recordBtnNav = document.getElementById('btnRecordScholarshipNav');
    if (recordBtnNav) {
        if (isAdmin) {
            recordBtnNav.classList.add('visible');
            recordBtnNav.classList.remove('admin-only');
        } else {
            recordBtnNav.classList.remove('visible');
            recordBtnNav.classList.add('admin-only');
        }
    }

    const recordBtn = document.getElementById('btnRecordScholarship');
    if (recordBtn) {
        recordBtn.style.display = 'none !important';
    }

    // จัดการปุ่ม admin-only ทั่วไป (รวมปุ่มนำเข้า/ส่งออก และปุ่มลบ)
    document.querySelectorAll('.admin-only').forEach(el => {
        if (isAdmin) {
            el.classList.add('visible');
        } else {
            el.classList.remove('visible');
        }
    });
}

// ==========================================
// Logout (ไป login.html ตามมาตรฐาน)
// ==========================================
async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        await db.auth.signOut();
        window.location.href = 'login.html';
    }
}

// ==========================================
// ฟังก์ชันอื่น ๆ
// ==========================================

async function loadModuleSettings() {
    try {
        const { data } = await db.from('core_scholarship_settings').select('settings').single();
        if (data?.settings) moduleSettings = data.settings;
    } catch (e) {
        console.warn('Settings table not ready yet:', e.message);
        moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_id: "" };
    }
}

// ===== โหลดห้องเรียน =====
async function loadClassrooms() {
    let query = db.from('core_classrooms')
        .select('*')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level')
        .order('room_number');

    const isHighLevel = ['super_admin', 'module_admin', 'head_discipline'].includes(currentViewRole);
    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', currentUser.id)
            .single();
        if (gh) query = query.eq('grade_level', gh.grade_level);
        else query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else if (!isHighLevel) {
        query = query.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
    }

    const { data: classrooms } = await query;
    const select = document.getElementById('select-classroom');
    if (tsClassroom) tsClassroom.destroy();

    select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
    (classrooms || []).forEach(c => {
        select.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
    });

    tsClassroom = new TomSelect("#select-classroom", {
        create: false,
        placeholder: "ค้นหาห้องเรียน",
        onChange: (val) => {
            if (val) onClassroomSelected(val);
            else clearClassroomSelection();
        }
    });

    if (currentViewRole === 'teacher' && classrooms && classrooms.length === 1) {
        tsClassroom.setValue(classrooms[0].id);
    }
}

// ===== เลือกห้องเรียน =====
async function onClassroomSelected(classroomId) {
    currentClassroomId = classroomId;
    await loadStudentsForTable(classroomId);
    await loadStudentSelectForForm(classroomId);
    document.getElementById('status-badge').innerHTML =
        `<i class="fas fa-check-circle text-emerald-500"></i> ห้องเรียนถูกเลือกแล้ว`;
    if ($('#tab-list').hasClass('active')) {
        loadStudentsForTable(classroomId);
    }
}

function clearClassroomSelection() {
    currentClassroomId = null;
    document.getElementById('status-badge').innerHTML =
        '<i class="fas fa-circle text-slate-300 text-[8px]"></i> ยังไม่เลือกห้องเรียน';
    document.getElementById('tb-students').innerHTML =
        '<tr><td colspan="6" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียน</td></tr>';
}

// ===== TAB: รายการทุน (ห้องเรียน) =====
async function loadStudentsForTable(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_number, student_id, core_students(id, student_id_card, prefix, first_name, last_name, avatar_students_url)')
        .eq('classroom_id', classroomId)
        .order('student_number');

    if (!enrolls?.length) {
        document.getElementById('tb-students').innerHTML =
            '<tr><td colspan="6" class="text-center py-10 text-slate-400">ไม่มีนักเรียน</td></tr>';
        return;
    }

    const studentIds = enrolls.map(e => e.student_id);
    let schMap = {};

    try {
        const { data: scholarships, error } = await db.from('core_scholarships')
            .select('student_id, amount')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear);

        if (error) throw error;
        (scholarships || []).forEach(s => { schMap[s.student_id] = true; });
    } catch (err) {
        console.warn('core_scholarships table missing or error:', err);
        if (!_scholarshipTableWarningShown) {
            _scholarshipTableWarningShown = true;
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่พบตาราง core_scholarships',
                html: `<p>กรุณาสร้างตารางใน Supabase SQL Editor</p>`,
                confirmButtonText: 'เข้าใจแล้ว'
            });
        }
    }

    let html = '';
    for (let e of enrolls) {
        const s = e.core_students;
        const hasSch = schMap[s.id] ? 'เคยได้รับทุน' : 'ไม่เคยได้รับทุน';
        const avatar = s.avatar_students_url ?
            `<img src="${s.avatar_students_url}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-200">` :
            '<div class="w-10 h-10 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center text-slate-500"><i class="fas fa-user"></i></div>';

        html += `<tr class="hover:bg-slate-50/60 transition">
            <td class="p-3">${avatar}</td>
            <td class="p-3 font-medium">${e.student_number}</td>
            <td class="p-3">${s.student_id_card}</td>
            <td class="p-3 font-bold text-slate-800">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
            <td class="p-3"><span class="px-3 py-1 rounded-full text-xs font-bold ${hasSch === 'เคยได้รับทุน' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}">${hasSch}</span></td>
            <td class="p-3 text-center">
                <button onclick="viewStudentDetail('${s.id}')" class="action-btn view-btn" title="ดูประวัติ"><i class="fas fa-eye"></i></button>
                <button onclick="requestScholarship('${s.id}')" class="action-btn request-btn" title="ขอทุน"><i class="fas fa-hand-holding-heart"></i><span>ขอทุน</span></button>
            </td>
        </tr>`;
    }
    document.getElementById('tb-students').innerHTML = html;
}

// ===== TAB: ฟอร์มขอรับทุน =====
async function loadStudentSelectForForm(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_id, core_students(id, student_id_card, prefix, first_name, last_name)')
        .eq('classroom_id', classroomId)
        .order('student_number');

    const options = (enrolls || []).map(e => ({
        value: e.core_students.id,
        text: `${e.core_students.student_id_card} - ${e.core_students.prefix || ''}${e.core_students.first_name} ${e.core_students.last_name}`
    }));

    if (studentTomSelect) studentTomSelect.destroy();
    studentTomSelect = new TomSelect('#student_select', {
        create: false,
        placeholder: 'เลือกนักเรียน',
        options,
        onChange: (val) => { if (val) loadStudentDataForForm(val); }
    });
}

async function loadStudentDataForForm(studentId) {
    currentStudentForForm = studentId;
    const { data: enroll } = await db.from('student_enrollments')
        .select('student_number, classroom_id, core_students(*), core_classrooms(grade_level, room_number)')
        .eq('student_id', studentId)
        .eq('classroom_id', currentClassroomId)
        .single();

    if (!enroll) return;
    const s = enroll.core_students;

    document.getElementById('student_id_card').value = s.student_id_card;
    document.getElementById('student_fullname').value = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
    document.getElementById('student_grade').value = `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}`;

    const { data: classroom } = await db.from('core_classrooms')
        .select('adviser_id_1, adviser_id_2')
        .eq('id', currentClassroomId)
        .single();

    let teacherName = '';
    if (classroom?.adviser_id_1) {
        const { data: t } = await db.from('core_personnel')
            .select('first_name, last_name')
            .eq('id', classroom.adviser_id_1)
            .single();
        if (t) teacherName = `${t.first_name} ${t.last_name}`;
    }
    document.getElementById('teacher_name').value = teacherName;

    const { data: homevisit } = await db.from('module_home_visits')
        .select('*')
        .eq('student_id', studentId)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .single();

    if (homevisit) {
        document.getElementById('father_name').value = homevisit.father_name || '';
        document.getElementById('father_job').value = homevisit.father_job || '';
        document.getElementById('father_phone').value = homevisit.father_phone || '';
        document.getElementById('mother_name').value = homevisit.mother_name || '';
        document.getElementById('mother_job').value = homevisit.mother_job || '';
        document.getElementById('mother_phone').value = homevisit.mother_phone || '';
        document.getElementById('guardian_name').value = homevisit.guardian_name || '';
        document.getElementById('guardian_job').value = homevisit.guardian_job || '';
        document.getElementById('guardian_phone').value = homevisit.guardian_phone || '';
        document.getElementById('parents_status').value = homevisit.parents_status || 'อยู่ด้วยกัน';
        document.getElementById('addr_house').value = homevisit.house_number || '';
        document.getElementById('addr_moo').value = homevisit.village_no || '';
        document.getElementById('addr_subdistrict').value = homevisit.sub_district || '';
        document.getElementById('addr_district').value = homevisit.district || '';
        document.getElementById('addr_province').value = homevisit.province || '';
        document.getElementById('addr_zipcode').value = homevisit.zipcode || '';

        if (homevisit.latitude && homevisit.longitude) {
            document.getElementById('map_link').value =
                `https://www.google.com/maps?q=${homevisit.latitude},${homevisit.longitude}`;
        }
        document.getElementById('preview_outside').src = homevisit.photo_outside || '';
        document.getElementById('preview_inside').src = homevisit.photo_inside || '';
        document.getElementById('preview_teacher').src = homevisit.photo_teacher || '';
        document.getElementById('family_income').value = homevisit.economic_data?.income || '';
    }
}

function copyParentData(type) {
    if (type === 'father') {
        document.getElementById('guardian_name').value = document.getElementById('father_name').value;
        document.getElementById('guardian_job').value = document.getElementById('father_job').value;
        document.getElementById('guardian_phone').value = document.getElementById('father_phone').value;
    } else if (type === 'mother') {
        document.getElementById('guardian_name').value = document.getElementById('mother_name').value;
        document.getElementById('guardian_job').value = document.getElementById('mother_job').value;
        document.getElementById('guardian_phone').value = document.getElementById('mother_phone').value;
    }
}

function openMapFromLink() {
    const link = document.getElementById('map_link').value;
    if (link) window.open(link, '_blank');
    else Swal.fire('ไม่มีพิกัด', 'กรุณาเลือกนักเรียนที่มีข้อมูลพิกัดจากระบบเยี่ยมบ้าน', 'info');
}

// ===== ส่งคำขอทุน =====
async function submitApplication() {
    if (!currentStudentForForm) return Swal.fire('ผิดพลาด', 'กรุณาเลือกนักเรียน', 'error');

    const formData = {
        student_id: currentStudentForForm,
        teacher_id: currentUser.id,
        father: {
            name: $('#father_name').val(),
            job: $('#father_job').val(),
            income: $('#father_income').val(),
            phone: $('#father_phone').val()
        },
        mother: {
            name: $('#mother_name').val(),
            job: $('#mother_job').val(),
            income: $('#mother_income').val(),
            phone: $('#mother_phone').val()
        },
        guardian: {
            name: $('#guardian_name').val(),
            job: $('#guardian_job').val(),
            income: $('#guardian_income').val(),
            phone: $('#guardian_phone').val(),
            workplace: $('#guardian_workplace').val()
        },
        parents_status: $('#parents_status').val(),
        siblings: {
            total: $('#siblings_total').val(),
            study: $('#siblings_study').val(),
            work: $('#siblings_work').val(),
            notwork: $('#siblings_notwork').val()
        },
        dependents: Array.from(document.querySelectorAll('input[name="dependents"]:checked')).map(cb => cb.value),
        address: {
            house: $('#addr_house').val(),
            moo: $('#addr_moo').val(),
            subdistrict: $('#addr_subdistrict').val(),
            district: $('#addr_district').val(),
            province: $('#addr_province').val(),
            zipcode: $('#addr_zipcode').val()
        },
        map_link: $('#map_link').val(),
        economy: {
            family_income: $('#family_income').val(),
            travel_expense: $('#travel_expense').val(),
            food_expense: $('#food_expense').val(),
            other_expense: $('#other_expense').val()
        },
        disease: {
            has: $('input[name="has_disease"]:checked').val(),
            name: $('#disease_name').val(),
            medicine: $('#disease_medicine').val(),
            hospital: $('#disease_hospital').val()
        },
        reason: $('#reason').val(),
        usage_plan: $('#usage_plan').val()
    };

    const { error } = await db.from('core_scholarship_applications').insert([{
        student_id: currentStudentForForm,
        teacher_id: currentUser.id,
        form_data: formData,
        status: 'pending',
        reason: formData.reason,
        usage_plan: formData.usage_plan
    }]);

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire('สำเร็จ', 'ส่งคำขอรับทุนเรียบร้อย', 'success').then(() => switchTab('list'));
    }
}

// ===== ดูประวัติรายบุคคล =====
window.viewStudentDetail = async function (studentId) {
    let scholarships = [];
    let hasNote = true;

    try {
        const { data, error } = await db.from('core_scholarships')
            .select('*')
            .eq('student_id', studentId)
            .order('academic_year', { ascending: false });
        if (error) throw error;
        scholarships = data || [];
    } catch (e) {
        if (e.message?.includes('column "note" does not exist')) {
            hasNote = false;
            const { data, error } = await db.from('core_scholarships')
                .select('id, student_id, scholarship_name, amount, academic_year, semester, scholarship_type, created_by, created_at, updated_at')
                .eq('student_id', studentId)
                .order('academic_year', { ascending: false });
            if (error) throw error;
            scholarships = data || [];
        } else {
            throw e;
        }
    }

    const { data: applications } = await db.from('core_scholarship_applications')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

    const totalAmount = scholarships.reduce((sum, s) => sum + (s.amount || 0), 0);

    let html = `<div class="space-y-4">
        <div class="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between">
            <div>
                <span class="text-sm font-bold text-indigo-700"><i class="fas fa-coins mr-1"></i> รวมทุนทั้งหมด</span>
                <p class="text-2xl font-extrabold text-indigo-800">${totalAmount.toLocaleString()} บาท</p>
            </div>
            <div class="text-sm text-indigo-600 bg-white/60 px-4 py-2 rounded-xl shadow-sm">
                <i class="fas fa-trophy mr-1"></i> จำนวนครั้งที่ได้รับทุน: ${scholarships.length}
            </div>
        </div>
        <h4 class="font-bold text-indigo-700"><i class="fas fa-trophy mr-2"></i>ประวัติทุนที่ได้รับ</h4>`;

    if (scholarships.length === 0) {
        html += `<p class="text-slate-400 text-sm">ยังไม่มีประวัติทุน</p>`;
    } else {
        html += `<div class="overflow-x-auto"><table class="w-full text-sm border rounded-xl">
            <thead class="bg-slate-50">
                <tr>
                    <th class="p-2 text-left">ปี</th>
                    <th class="p-2 text-left">ชื่อทุน</th>
                    <th class="p-2 text-left">จำนวนเงิน</th>
                    <th class="p-2 text-left">ภาคเรียน</th>
                    ${hasNote ? '<th class="p-2 text-left">หมายเหตุ</th>' : ''}
                </tr>
            </thead>
            <tbody>`;
        scholarships.forEach(s => {
            html += `<tr class="border-t">
                <td class="p-2">${s.academic_year}</td>
                <td class="p-2 font-medium">${s.scholarship_name}</td>
                <td class="p-2">${s.amount.toLocaleString()} บาท</td>
                <td class="p-2">${s.semester}</td>
                ${hasNote ? `<td class="p-2 text-sm text-slate-500">${s.note || '-'}</td>` : ''}
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `<h4 class="mt-4 font-bold text-indigo-700"><i class="fas fa-file-alt mr-2"></i>คำขอทุนล่าสุด</h4>
        <div class="border rounded-xl p-4 bg-slate-50">${applications?.[0]?.reason || 'ไม่มีคำขอทุน'}</div></div>`;

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailModal').classList.add('flex');
};

window.closeDetailModal = () => {
    document.getElementById('detailModal').classList.add('hidden');
    document.getElementById('detailModal').classList.remove('flex');
};

window.requestScholarship = function (studentId) {
    if (studentTomSelect) studentTomSelect.setValue(studentId);
    switchTab('form');
    goToStep(1);
};

// ===== Navigation Steps =====
let currentStep = 1;

function goToStep(step) {
    currentStep = step;
    $('.step-content').removeClass('active');
    $(`#step-${step}`).addClass('active');

    const progress = (step - 1) * 33.33;
    $('#progressBar').css('width', `${progress}%`);

    for (let i = 1; i <= 4; i++) {
        if (i <= step) {
            $(`#circle-${i}`).removeClass('bg-slate-100 text-slate-400').addClass('bg-amber-600 text-white');
            $(`#text-step-${i}`).removeClass('text-slate-400').addClass('text-amber-700');
        } else {
            $(`#circle-${i}`).removeClass('bg-amber-600 text-white').addClass('bg-slate-100 text-slate-400');
            $(`#text-step-${i}`).removeClass('text-amber-700').addClass('text-slate-400');
        }
    }
}

function nextStep(step) { goToStep(step); }
function prevStep(step) { goToStep(step); }

// ===== SWITCH TAB =====
function switchTab(tabId) {
    $('#tab-recipients, #tab-list, #tab-form').removeClass('active');
    $(`#tab-${tabId}`).addClass('active');

    $('#tab-recipients-btn, #tab-list-btn, #tab-form-btn').removeClass(
        'active-recipients active-list active-form inactive-recipients inactive-list inactive-form'
    );

    if (tabId === 'recipients') {
        $('#tab-recipients-btn').addClass('active-recipients');
        if (!$.fn.DataTable.isDataTable('#recipientTable')) {
            loadRecipientsTabData();
        } else {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } else if (tabId === 'list') {
        $('#tab-list-btn').addClass('active-list');
        if (currentClassroomId) {
            loadStudentsForTable(currentClassroomId);
        } else {
            $('#tb-students').html('<tr><td colspan="6" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียน</td></tr>');
        }
    } else if (tabId === 'form') {
        $('#tab-form-btn').addClass('active-form');
        if (currentClassroomId) {
            loadStudentSelectForForm(currentClassroomId);
        }
    }
}

// ===== TAB: ผู้รับทุน =====
function loadRecipientsTabData() {
    if ($.fn.DataTable.isDataTable('#recipientTable')) {
        $('#recipientTable').DataTable().ajax.reload(null, false);
        return;
    }

    // โหลดตัวกรอง
    fetchRecipientsData().then(result => {
        const years = [...new Set(result.data.map(s => s.academic_year).filter(y => y && y !== '-'))];
        const semesters = [...new Set(result.data.map(s => s.semester).filter(s => s))];
        $('#filter-academic-year').html('<option value="">ปีการศึกษา (ทั้งหมด)</option>' +
            years.map(y => `<option value="${y}">${y}</option>`).join(''));
        $('#filter-semester').html('<option value="">ภาคเรียน (ทั้งหมด)</option>' +
            semesters.map(s => `<option value="${s}">เทอม ${s}</option>`).join(''));
    });

    // สร้างปุ่มลบ (เฉพาะแอดมิน)
    if (!$('#recipient-actions').length && isAdminUserLocal()) {
        $('#recipientTable_wrapper').before(`
            <div id="recipient-actions" class="admin-only flex flex-wrap items-center gap-2 mb-3">
                <button onclick="deleteSelectedScholarships()" id="deleteSelectedBtn" class="btn-danger-gradient px-4 py-2 text-sm flex items-center gap-2" disabled>
                    <i class="fas fa-trash"></i> ลบที่เลือก
                </button>
                <button onclick="deleteAllScholarships()" class="btn-danger-gradient px-4 py-2 text-sm flex items-center gap-2">
                    <i class="fas fa-trash-alt"></i> ลบทั้งหมด
                </button>
                <span class="text-xs text-slate-400 ml-2" id="selectedCount">เลือก 0 รายการ</span>
            </div>
        `);
        // ใส่ style
        $('<style> .btn-danger-gradient { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 9999px; border: none; padding: 0.5rem 1rem; font-weight: 600; transition: 0.2s; } .btn-danger-gradient:hover { opacity: 0.8; } .btn-danger-gradient:disabled { opacity: 0.5; cursor: not-allowed; } </style>').appendTo('head');
    }

    // คอลัมน์ตาราง (เพิ่ม checkbox ที่คอลัมน์แรก)
    const columns = [
        {
            data: null,
            className: 'dt-center',
            orderable: false,
            render: function (data, type, row) {
                return `<input type="checkbox" class="recipient-checkbox" data-id="${row.id}">`;
            }
        },
        { data: 'grade', className: 'text-center font-semibold text-slate-600' },
        { data: 'code', className: 'font-mono text-slate-600' },
        { data: 'name', className: 'font-medium text-slate-800' },
        { data: 'scholarship_name', className: 'font-medium text-emerald-700' },
        { data: 'amount', className: 'text-center font-bold text-slate-700', render: d => d ? d.toLocaleString() : 0 },
        { data: 'academic_year', className: 'text-center' },
        { data: 'semester', className: 'text-center', render: d => d ? 'เทอม ' + d : '-' },
        { data: 'note', className: 'text-sm text-slate-500', render: d => d || '-' },
        {
            data: 'id',
            className: 'text-center whitespace-nowrap',
            render: function (id, type, row) {
                const isAdmin = isAdminUserLocal();
                let html = `<button onclick="viewScholarshipDetail('${id}')" class="action-btn view-btn" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>`;
                if (isAdmin) {
                    html += `<button onclick="openEditScholarshipModal('${id}')" class="action-btn text-amber-600 hover:bg-amber-50" title="แก้ไข"><i class="fas fa-edit"></i></button>`;
                    html += `<button onclick="deleteScholarshipRecord('${id}')" class="action-btn text-rose-600 hover:bg-rose-50" title="ลบ"><i class="fas fa-trash"></i></button>`;
                }
                return html;
            }
        }
    ];

    $('#recipientTable').DataTable({
        responsive: {
            details: {
                display: $.fn.dataTable.Responsive.display.modal({
                    header: function (row) { return 'รายละเอียดข้อมูล'; }
                }),
                renderer: $.fn.dataTable.Responsive.renderer.tableAll({ tableClass: 'table' })
            }
        },
        pageLength: 15,
        lengthMenu: [
            [10, 15, 25, 50, 100, -1],
            [10, 15, 25, 50, 100, 'ทั้งหมด']
        ],
        order: [[2, 'asc']],
        columnDefs: [
            { targets: 'no-sort', orderable: false },
            { targets: '_all', orderable: true }
        ],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
        },
        ajax: function (data, callback, settings) {
            fetchRecipientsData()
                .then(result => {
                    callback({ data: result.data, recordsTotal: result.total, recordsFiltered: result.total });
                })
                .catch(err => {
                    console.error('Error loading recipients data:', err);
                    callback({ data: [], recordsTotal: 0, recordsFiltered: 0 });
                });
        },
        columns: columns,
        drawCallback: function () {
            // จัดการ checkbox แต่ละแถว
            $('.recipient-checkbox').off('change').on('change', function () {
                const id = $(this).data('id');
                if (this.checked) {
                    selectedRecipientIds.add(id);
                } else {
                    selectedRecipientIds.delete(id);
                }
                updateDeleteButtonState();
                updateSelectAllState(); // อัปเดตสถานะ select-all
            });

            // จัดการ select-all checkbox
            $('#selectAllRecipients').off('change').on('change', function () {
                const isChecked = this.checked;
                // วนลูป checkbox ทุกตัวในหน้าปัจจุบัน
                $('.recipient-checkbox').each(function () {
                    const cb = $(this);
                    const id = cb.data('id');
                    if (isChecked) {
                        cb.prop('checked', true);
                        selectedRecipientIds.add(id);
                    } else {
                        cb.prop('checked', false);
                        selectedRecipientIds.delete(id);
                    }
                });
                updateDeleteButtonState();
                updateSelectAllState();
            });

            // อัปเดตสถานะ select-all ตาม checkbox ในหน้าปัจจุบัน
            function updateSelectAllState() {
                const total = $('.recipient-checkbox').length;
                const checked = $('.recipient-checkbox:checked').length;
                const selectAll = $('#selectAllRecipients');
                if (total === 0) {
                    selectAll.prop('checked', false);
                    selectAll.prop('indeterminate', false);
                } else if (checked === total) {
                    selectAll.prop('checked', true);
                    selectAll.prop('indeterminate', false);
                } else if (checked > 0) {
                    selectAll.prop('checked', false);
                    selectAll.prop('indeterminate', true);
                } else {
                    selectAll.prop('checked', false);
                    selectAll.prop('indeterminate', false);
                }
            }

            // เรียกครั้งแรกเพื่อตั้งค่า
            updateSelectAllState();
            updateDeleteButtonState();

            $('.action-btn').tooltip ? $('.action-btn').tooltip() : null;

            const info = this.api().page.info();
            const isAdmin = isAdminUserLocal();
            $('#recipient-footer').html(
                `<i class="fas fa-database mr-1"></i> พบข้อมูลทั้งหมด ${info.recordsDisplay} รายการ` +
                (!isAdmin ? ' <span class="text-amber-600"><i class="fas fa-info-circle mr-1"></i> เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไข/ลบได้</span>' : '')
            );
        }
    });

    // รีเซ็ต selection เมื่อโหลดใหม่
    selectedRecipientIds.clear();
    updateDeleteButtonState();
}

function updateDeleteButtonState() {
    const count = selectedRecipientIds.size;
    $('#selectedCount').text(`เลือก ${count} รายการ`);
    $('#deleteSelectedBtn').prop('disabled', count === 0);
}

// ลบเฉพาะที่เลือก
window.deleteSelectedScholarships = async function () {
    if (!requireAdminLocal()) return;

    const ids = Array.from(selectedRecipientIds);
    if (ids.length === 0) {
        return Swal.fire('ไม่มีรายการเลือก', 'กรุณาเลือกอย่างน้อย 1 รายการ', 'info');
    }

    const confirm = await Swal.fire({
        title: `ยืนยันลบ ${ids.length} รายการ?`,
        html: `<p>คุณกำลังจะลบทุนที่เลือก ${ids.length} รายการ</p><p style="color:#dc2626;">ข้อมูลจะถูกลบอย่างถาวร</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirm.isConfirmed) return;

    try {
        const { error } = await db.from('core_scholarships')
            .delete()
            .in('id', ids);
        if (error) throw error;

        await Swal.fire('สำเร็จ', `ลบข้อมูล ${ids.length} รายการเรียบร้อย`, 'success');
        selectedRecipientIds.clear();
        updateDeleteButtonState();

        if ($.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
        if (currentClassroomId) {
            await loadStudentsForTable(currentClassroomId);
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถลบข้อมูลได้', 'error');
    }
};

// ลบทั้งหมด (ตามข้อมูลที่แสดงในตาราง)
window.deleteAllScholarships = async function () {
    if (!requireAdminLocal()) return;

    const confirm = await Swal.fire({
        title: '⚠️ ลบทุนทั้งหมด?',
        html: `<p>คุณกำลังจะลบ <strong>ทุกแถวที่แสดงในตาราง</strong> (ตามตัวกรองปัจจุบัน)</p>
               <p style="color:#dc2626;">ข้อมูลจะถูกลบอย่างถาวร ไม่สามารถกู้คืนได้</p>
               <p>กรุณาพิมพ์ <strong>ลบทั้งหมด</strong> เพื่อยืนยัน</p>`,
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'พิมพ์ "ลบทั้งหมด"',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ลบทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        preConfirm: (value) => {
            if (value !== 'ลบทั้งหมด') {
                Swal.showValidationMessage('กรุณาพิมพ์ "ลบทั้งหมด" ให้ถูกต้อง');
                return false;
            }
            return true;
        }
    });

    if (!confirm.isConfirmed) return;

    try {
        const table = $('#recipientTable').DataTable();
        const data = table.rows({ search: 'applied' }).data();
        const ids = data.map(row => row.id).toArray();

        if (ids.length === 0) {
            return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลที่จะลบ', 'info');
        }

        const confirm2 = await Swal.fire({
            title: `ยืนยันลบทั้งหมด ${ids.length} รายการ?`,
            text: `คุณกำลังจะลบข้อมูล ${ids.length} รายการทั้งหมด`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันลบ',
            cancelButtonText: 'ยกเลิก'
        });

        if (!confirm2.isConfirmed) return;

        const { error } = await db.from('core_scholarships')
            .delete()
            .in('id', ids);
        if (error) throw error;

        await Swal.fire('สำเร็จ', `ลบข้อมูลทั้งหมด ${ids.length} รายการเรียบร้อย`, 'success');
        selectedRecipientIds.clear();
        updateDeleteButtonState();

        if ($.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
        if (currentClassroomId) {
            await loadStudentsForTable(currentClassroomId);
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถลบข้อมูลได้', 'error');
    }
};

async function fetchRecipientsData() {
    try {
        let scholarships = [];
        let hasNote = true;

        try {
            const { data, error } = await db.from('core_scholarships')
                .select(`
                    id,
                    student_id,
                    scholarship_name,
                    amount,
                    academic_year,
                    semester,
                    note,
                    created_at,
                    core_students!inner (
                        id,
                        student_id_card,
                        prefix,
                        first_name,
                        last_name
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            scholarships = data || [];
        } catch (e) {
            if (e.message?.includes('column "note" does not exist')) {
                hasNote = false;
                const { data, error } = await db.from('core_scholarships')
                    .select(`
                        id,
                        student_id,
                        scholarship_name,
                        amount,
                        academic_year,
                        semester,
                        created_at,
                        core_students!inner (
                            id,
                            student_id_card,
                            prefix,
                            first_name,
                            last_name
                        )
                    `)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                scholarships = data || [];
            } else {
                throw e;
            }
        }

        if (!scholarships || scholarships.length === 0) {
            return { data: [], total: 0 };
        }

        let classroomMap = {};
        try {
            const studentIds = [...new Set(scholarships.map(s => s.student_id))];
            const { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
                .select('student_id, core_classrooms!inner(grade_level, room_number, academic_year, semester)')
                .in('student_id', studentIds)
                .eq('core_classrooms.academic_year', currentYear)
                .eq('core_classrooms.semester', currentTerm);

            if (enrollErr) throw enrollErr;
            (enrolls || []).forEach(e => {
                const c = e.core_classrooms;
                if (c) classroomMap[e.student_id] = `ม.${c.grade_level}/${c.room_number}`;
            });
        } catch (e) {
            console.warn('Error loading classroom info for recipients:', e.message);
        }

        const data = scholarships.map(s => {
            const student = s.core_students;
            return {
                id: s.id,
                student_id: s.student_id,
                grade: classroomMap[s.student_id] || '-',
                code: student ? student.student_id_card : '-',
                name: student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล',
                scholarship_name: s.scholarship_name,
                amount: s.amount || 0,
                academic_year: s.academic_year || '-',
                semester: s.semester || '',
                note: s.note || '-'
            };
        });

        return { data: data, total: data.length };
    } catch (err) {
        console.error('Error fetching recipients data:', err);
        throw err;
    }
}

// ===== ฟังก์ชันกรองข้อมูลผู้รับทุน =====
function applyRecipientFilters() {
    const year = $('#filter-academic-year').val();
    const semester = $('#filter-semester').val();

    const table = $('#recipientTable').DataTable();
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex) {
            const rowData = table.row(dataIndex).data();
            if (!rowData) return true;
            let match = true;
            if (year && rowData.academic_year !== year) match = false;
            if (semester && rowData.semester !== semester) match = false;
            return match;
        }
    );
    table.draw();
    $.fn.dataTable.ext.search.pop();
}

function clearRecipientFilters() {
    $('#filter-academic-year').val('');
    $('#filter-semester').val('');
    const table = $('#recipientTable').DataTable();
    table.search('').columns().search('').draw();
    table.draw();
}

// ==========================================
// ฟังก์ชันจัดการปุ่มใน DataTable ผู้รับทุน
// ==========================================

// ===== ดูประวัติรายบุคคล (ใช้ Modal เดียวกัน) =====
window.viewScholarshipDetail = async function (scholarshipId) {
    try {
        const { data, error } = await db.from('core_scholarships')
            .select('student_id')
            .eq('id', scholarshipId)
            .single();
        if (error) throw error;
        if (data && data.student_id) {
            showStudentScholarshipHistory(data.student_id);
        } else {
            Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียน', 'error');
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// ==========================================
// SHOW STUDENT SCHOLARSHIP HISTORY (DETAIL MODAL)
// ==========================================
async function showStudentScholarshipHistory(studentId) {
    try {
        // ดึงข้อมูลนักเรียน
        const { data: student, error: studentErr } = await db.from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name')
            .eq('id', studentId)
            .single();
        if (studentErr) throw studentErr;

        // ดึงชั้นเรียนปัจจุบัน
        let gradeInfo = '-';
        try {
            const { data: enroll } = await db.from('student_enrollments')
                .select('core_classrooms(grade_level, room_number)')
                .eq('student_id', studentId)
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .single();
            if (enroll && enroll.core_classrooms) {
                const c = enroll.core_classrooms;
                gradeInfo = `ม.${c.grade_level}/${c.room_number}`;
            }
        } catch (e) { }

        // ดึงประวัติทุนทั้งหมด
        let scholarships = [];
        let hasNote = true;
        try {
            const { data, error } = await db.from('core_scholarships')
                .select('*')
                .eq('student_id', studentId)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false });
            if (error) throw error;
            scholarships = data || [];
        } catch (e) {
            if (e.message?.includes('column "note" does not exist')) {
                hasNote = false;
                const { data, error } = await db.from('core_scholarships')
                    .select('id, student_id, scholarship_name, amount, academic_year, semester, scholarship_type, created_by, created_at, updated_at')
                    .eq('student_id', studentId)
                    .order('academic_year', { ascending: false })
                    .order('semester', { ascending: false });
                if (error) throw error;
                scholarships = data || [];
            } else {
                throw e;
            }
        }

        const totalAmount = scholarships.reduce((sum, s) => sum + (s.amount || 0), 0);
        const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

        // สร้าง HTML
        let html = `
            <div class="space-y-4">
                <div class="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between">
                    <div>
                        <p class="text-sm font-bold text-indigo-700"><i class="fas fa-user mr-1"></i> ${studentName}</p>
                        <p class="text-xs text-slate-500">รหัส: ${student.student_id_card} | ชั้น: ${gradeInfo}</p>
                    </div>
                    <div class="text-sm text-indigo-600 bg-white/60 px-4 py-2 rounded-xl shadow-sm">
                        <i class="fas fa-trophy mr-1"></i> ทุนทั้งหมด: ${scholarships.length} ครั้ง
                    </div>
                </div>
                <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between">
                    <div>
                        <span class="text-sm font-bold text-emerald-700"><i class="fas fa-coins mr-1"></i> รวมเงินทุนทั้งหมด</span>
                        <p class="text-2xl font-extrabold text-emerald-800">${totalAmount.toLocaleString()} บาท</p>
                    </div>
                </div>
                <h4 class="font-bold text-indigo-700"><i class="fas fa-list mr-2"></i>ประวัติทุนที่ได้รับ</h4>
        `;

        if (scholarships.length === 0) {
            html += `<p class="text-slate-400 text-sm">ยังไม่มีประวัติทุน</p>`;
        } else {
            html += `<div class="overflow-x-auto"><table class="w-full text-sm border rounded-xl">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="p-2 text-left">ปี</th>
                        <th class="p-2 text-left">ชื่อทุน</th>
                        <th class="p-2 text-left">จำนวนเงิน</th>
                        <th class="p-2 text-left">ภาคเรียน</th>
                        ${hasNote ? '<th class="p-2 text-left">หมายเหตุ</th>' : ''}
                    </tr>
                </thead>
                <tbody>`;
            scholarships.forEach(s => {
                html += `<tr class="border-t">
                    <td class="p-2">${s.academic_year}</td>
                    <td class="p-2 font-medium">${s.scholarship_name}</td>
                    <td class="p-2">${s.amount.toLocaleString()} บาท</td>
                    <td class="p-2">${s.semester}</td>
                    ${hasNote ? `<td class="p-2 text-sm text-slate-500">${s.note || '-'}</td>` : ''}
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }

        // ปุ่มสำหรับ Admin
        const isAdmin = isAdminUserLocal();
        if (isAdmin) {
            html += `
                <div class="flex flex-wrap justify-between items-center mt-4 pt-4 border-t border-slate-200">
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="exportStudentScholarships('${studentId}')" class="btn-success-gradient px-4 py-2 text-sm flex items-center gap-2"><i class="fas fa-file-excel"></i> ส่งออก Excel</button>
                        <button onclick="importStudentScholarships('${studentId}')" class="btn-primary-gradient px-4 py-2 text-sm flex items-center gap-2"><i class="fas fa-upload"></i> นำเข้า Excel</button>
                    </div>
                    <button onclick="closeDetailModal()" class="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-2xl font-semibold transition">ปิด</button>
                </div>
            `;
        } else {
            html += `
                <div class="flex justify-end mt-4 pt-4 border-t border-slate-200">
                    <button onclick="closeDetailModal()" class="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-2xl font-semibold transition">ปิด</button>
                </div>
            `;
        }

        html += `</div>`;

        document.getElementById('modalContent').innerHTML = html;
        document.getElementById('detailModal').classList.remove('hidden');
        document.getElementById('detailModal').classList.add('flex');

        window._currentDetailStudentId = studentId;

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

// ==========================================
// EXPORT STUDENT SCHOLARSHIPS TO EXCEL
// ==========================================
window.exportStudentScholarships = async function (studentId) {
    if (!isAdminUserLocal()) {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'error');
    }

    try {
        const { data: student, error: studentErr } = await db.from('core_students')
            .select('student_id_card, prefix, first_name, last_name')
            .eq('id', studentId)
            .single();
        if (studentErr) throw studentErr;

        let scholarships = [];
        let hasNote = true;
        try {
            const { data, error } = await db.from('core_scholarships')
                .select('*')
                .eq('student_id', studentId)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false });
            if (error) throw error;
            scholarships = data || [];
        } catch (e) {
            if (e.message?.includes('column "note" does not exist')) {
                hasNote = false;
                const { data, error } = await db.from('core_scholarships')
                    .select('id, student_id, scholarship_name, amount, academic_year, semester, scholarship_type, created_by, created_at, updated_at')
                    .eq('student_id', studentId)
                    .order('academic_year', { ascending: false })
                    .order('semester', { ascending: false });
                if (error) throw error;
                scholarships = data || [];
            } else {
                throw e;
            }
        }

        if (scholarships.length === 0) {
            return Swal.fire('ไม่มีข้อมูล', 'นักเรียนนี้ยังไม่มีประวัติทุน', 'info');
        }

        const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

        const rows = scholarships.map(s => {
            const row = {
                'ชื่อทุน': s.scholarship_name,
                'จำนวนเงิน': s.amount,
                'ปีการศึกษา': s.academic_year,
                'ภาคเรียน': s.semester
            };
            if (hasNote) row['หมายเหตุ'] = s.note || '';
            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 30 },
            { wch: 15 },
            { wch: 15 },
            { wch: 12 },
            { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'ประวัติทุน');
        const fileName = `ประวัติทุน_${studentName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        Swal.fire('สำเร็จ', 'ส่งออกไฟล์ Excel เรียบร้อย', 'success');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถส่งออกข้อมูลได้', 'error');
    }
};

// ==========================================
// IMPORT STUDENT SCHOLARSHIPS FROM EXCEL
// ==========================================
window.importStudentScholarships = function (studentId) {
    if (!requireAdminLocal()) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (!jsonData || jsonData.length === 0) {
                return Swal.fire('ไฟล์ว่าง', 'ไม่มีข้อมูลในไฟล์', 'error');
            }

            const requiredCols = ['ชื่อทุน', 'จำนวนเงิน', 'ปีการศึกษา', 'ภาคเรียน'];
            const headers = Object.keys(jsonData[0]);
            const missing = requiredCols.filter(col => !headers.includes(col));
            if (missing.length > 0) {
                return Swal.fire('คอลัมน์ไม่ถูกต้อง', `ขาดคอลัมน์: ${missing.join(', ')}`, 'error');
            }

            const sample = jsonData.slice(0, 5).map(row =>
                `${row['ชื่อทุน']} (${row['จำนวนเงิน']} บาท) ${row['ปีการศึกษา']} เทอม ${row['ภาคเรียน']}`
            ).join('\n');

            const result = await Swal.fire({
                title: `นำเข้าข้อมูลทุน (พบ ${jsonData.length} รายการ)`,
                html: `
                    <div style="text-align:left;">
                        <p><strong>ตัวอย่างข้อมูล:</strong></p>
                        <pre style="background:#f1f5f9;padding:10px;border-radius:8px;font-size:12px;">${sample}</pre>
                        <p style="margin-top:10px;">⚠️ ระบบจะตรวจสอบความซ้ำซ้อน และจะไม่บันทึกข้อมูลที่ซ้ำ</p>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันนำเข้า',
                cancelButtonText: 'ยกเลิก'
            });

            if (!result.isConfirmed) return;

            let successCount = 0, skipCount = 0, errorCount = 0;

            for (let row of jsonData) {
                try {
                    const scholarshipName = row['ชื่อทุน']?.toString().trim();
                    const amount = parseFloat(row['จำนวนเงิน']);
                    const academicYear = row['ปีการศึกษา']?.toString().trim();
                    const semester = row['ภาคเรียน']?.toString().trim();
                    const note = row['หมายเหตุ']?.toString().trim() || '';

                    if (!scholarshipName || isNaN(amount) || !academicYear || !semester) {
                        errorCount++;
                        continue;
                    }

                    // ตรวจสอบซ้ำ
                    const { data: existing } = await db.from('core_scholarships')
                        .select('id')
                        .eq('student_id', studentId)
                        .eq('scholarship_name', scholarshipName)
                        .eq('amount', amount)
                        .eq('academic_year', academicYear)
                        .eq('semester', semester);

                    if (existing && existing.length > 0) {
                        skipCount++;
                        continue;
                    }

                    const insertData = {
                        student_id: studentId,
                        scholarship_name: scholarshipName,
                        amount: amount,
                        academic_year: academicYear,
                        semester: semester,
                        scholarship_type: 'ทุนทั่วไป',
                        created_by: currentUser.id,
                        created_at: new Date().toISOString()
                    };

                    if (note && typeof note === 'string') {
                        try {
                            insertData.note = note;
                            const { error } = await db.from('core_scholarships').insert([insertData]);
                            if (error) {
                                if (error.message?.includes('column "note" does not exist')) {
                                    delete insertData.note;
                                    const { error: e2 } = await db.from('core_scholarships').insert([insertData]);
                                    if (e2) throw e2;
                                } else {
                                    throw error;
                                }
                            }
                        } catch (e) {
                            delete insertData.note;
                            const { error } = await db.from('core_scholarships').insert([insertData]);
                            if (error) throw error;
                        }
                    } else {
                        const { error } = await db.from('core_scholarships').insert([insertData]);
                        if (error) throw error;
                    }
                    successCount++;
                } catch (err) {
                    errorCount++;
                    console.error('Error importing row:', err);
                }
            }

            let msg = `นำเข้าเสร็จสิ้น: สำเร็จ ${successCount} รายการ`;
            if (skipCount > 0) msg += `, ข้าม ${skipCount} รายการ (ซ้ำ)`;
            if (errorCount > 0) msg += `, ผิดพลาด ${errorCount} รายการ`;
            await Swal.fire('เสร็จสิ้น', msg, 'success');

            // รีเฟรชข้อมูล
            await showStudentScholarshipHistory(studentId);
            if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
            if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                $('#recipientTable').DataTable().ajax.reload(null, false);
            }

        } catch (err) {
            console.error(err);
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถนำเข้าข้อมูลได้', 'error');
        }
    };

    input.click();
};

// ===== แก้ไขทุน (ใช้ requireAdminLocal) =====
window.openEditScholarshipModal = async function (scholarshipId) {
    if (!requireAdminLocal()) return;

    try {
        const { data, error } = await db.from('core_scholarships')
            .select('*')
            .eq('id', scholarshipId)
            .single();

        if (error) throw error;

        document.getElementById('edit_record_id').value = data.id;
        document.getElementById('edit_scholarship_name').value = data.scholarship_name;
        document.getElementById('edit_amount').value = data.amount;
        document.getElementById('edit_academic_year').value = data.academic_year;
        document.getElementById('edit_semester').value = data.semester;
        document.getElementById('edit_note').value = data.note || '';

        $('#editScholarshipModal').removeClass('hidden').addClass('flex');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้', 'error');
    }
};

window.closeEditScholarshipModal = function () {
    $('#editScholarshipModal').addClass('hidden').removeClass('flex');
};

window.updateScholarshipRecord = async function () {
    if (!requireAdminLocal()) return;

    const id = document.getElementById('edit_record_id').value;
    const scholarshipName = document.getElementById('edit_scholarship_name').value.trim();
    const amount = parseFloat(document.getElementById('edit_amount').value);
    const academicYear = document.getElementById('edit_academic_year').value.trim();
    const semester = document.getElementById('edit_semester').value;
    const note = document.getElementById('edit_note').value.trim();

    if (!scholarshipName || !amount || !academicYear || !semester) {
        return Swal.fire('กรุณากรอกข้อมูลให้ครบถ้วน', '', 'error');
    }

    try {
        const updateData = {
            scholarship_name: scholarshipName,
            amount: amount,
            academic_year: academicYear,
            semester: semester,
            updated_at: new Date().toISOString()
        };
        if (note) updateData.note = note;

        const { error } = await db.from('core_scholarships')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        window.closeEditScholarshipModal();
        await Swal.fire('สำเร็จ', 'อัปเดตข้อมูลทุนเรียบร้อย', 'success');

        if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
        if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } catch (err) {
        console.error(err);
        window.closeEditScholarshipModal();

        if (err.code === '42703' || err.message?.includes('column "note" does not exist')) {
            try {
                const updateData = {
                    scholarship_name: scholarshipName,
                    amount: amount,
                    academic_year: academicYear,
                    semester: semester,
                    updated_at: new Date().toISOString()
                };
                const { error } = await db.from('core_scholarships')
                    .update(updateData)
                    .eq('id', id);

                if (error) throw error;

                window.closeEditScholarshipModal();
                await Swal.fire('สำเร็จ', 'อัปเดตข้อมูลทุนเรียบร้อย', 'success');
                if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
                if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                    $('#recipientTable').DataTable().ajax.reload(null, false);
                }
            } catch (e2) {
                Swal.fire('ผิดพลาด', e2.message || 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
            }
        } else {
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
        }
    }
};

// ===== ลบทุน (ใช้ requireAdminLocal) =====
window.deleteScholarshipRecord = async function (scholarshipId) {
    if (!requireAdminLocal()) return;

    try {
        const { data, error } = await db.from('core_scholarships')
            .select(`
                scholarship_name,
                amount,
                core_students (
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .eq('id', scholarshipId)
            .single();

        if (error) throw error;

        const student = data.core_students;
        const studentName = student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล';

        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            html: `
                <div style="text-align:left;">
                    <p><strong>นักเรียน:</strong> ${studentName}</p>
                    <p><strong>ชื่อทุน:</strong> ${data.scholarship_name}</p>
                    <p><strong>จำนวนเงิน:</strong> ${data.amount.toLocaleString()} บาท</p>
                </div>
                <p style="color:#dc2626; margin-top:12px;">⚠️ ข้อมูลนี้จะถูกลบอย่างถาวร ไม่สามารถกู้คืนได้</p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบเลย',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            const { error: deleteErr } = await db.from('core_scholarships')
                .delete()
                .eq('id', scholarshipId);

            if (deleteErr) throw deleteErr;

            await Swal.fire('ลบสำเร็จ', 'ลบข้อมูลทุนเรียบร้อย', 'success');
            if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
            if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                $('#recipientTable').DataTable().ajax.reload(null, false);
            }
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถลบข้อมูลได้', 'error');
    }
};

// ==========================================
// ADMIN SETTINGS (ใช้ requireAdminLocal)
// ==========================================

window.openAdminModal = async function () {
    if (!requireAdminLocal()) return;

    await loadModuleSettings();
    $('#set-gas-url').val(moduleSettings.gas_url || '');
    $('#set-drive-folder-id').val(moduleSettings.drive_folder_id || '');
    $('#set-pdf-api-url').val(moduleSettings.pdf_api_url || '');
    $('#set-slide-id').val(moduleSettings.slide_template_id || '');
    await loadTeachersForAppoint();
    await loadModuleAdminsList();
    $('#admin-modal').removeClass('hidden').addClass('flex');
};

function closeAdminModal() {
    $('#admin-modal').addClass('hidden').removeClass('flex');
}

async function saveAdminSettings() {
    const settings = {
        gas_url: $('#set-gas-url').val(),
        drive_folder_id: $('#set-drive-folder-id').val(),
        pdf_api_url: $('#set-pdf-api-url').val(),
        slide_template_id: $('#set-slide-id').val()
    };

    try {
        const { error } = await db.from('core_scholarship_settings')
            .update({ settings })
            .eq('id', (await db.from('core_scholarship_settings').select('id').single()).data.id);

        if (error) throw error;
        moduleSettings = settings;
        Swal.fire('สำเร็จ', 'บันทึกเรียบร้อย', 'success');
        closeAdminModal();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message || 'ไม่สามารถบันทึกได้', 'error');
    }
}

async function loadTeachersForAppoint() {
    const { data } = await db.from('core_personnel')
        .select('id, first_name, last_name')
        .order('first_name');

    const select = $('#select-teacher-appoint');
    select.html('<option value="">-- เลือกครู --</option>');
    data?.forEach(t => select.append(`<option value="${t.id}">${t.first_name} ${t.last_name}</option>`));

    if (typeof TomSelect !== 'undefined') {
        new TomSelect("#select-teacher-appoint", { create: false });
    }
}

async function loadModuleAdminsList() {
    try {
        const { data } = await db.from('core_scholarship_admins')
            .select('id, core_personnel(first_name, last_name)')
            .eq('module_id', 'scholarship');

        const container = $('#module-admin-list');
        if (!data?.length) {
            container.html('<p class="text-slate-400">ไม่มีผู้ดูแลระบบ</p>');
            return;
        }

        let html = '<table class="w-full text-sm"><thead class="bg-slate-50"><tr><th class="p-2 text-left">ชื่อ</th><th class="p-2 text-right"></th></tr></thead><tbody>';
        data.forEach(a => {
            html += `<tr class="border-t"><td class="p-2">${a.core_personnel.first_name} ${a.core_personnel.last_name}</td><td class="p-2 text-right"><button onclick="removeModuleAdmin('${a.id}')" class="text-rose-500 hover:text-rose-700 transition"><i class="fas fa-trash"></i></button></td></tr>`;
        });
        html += '</tbody></table>';
        container.html(html);
    } catch (e) {
        $('#module-admin-list').html('<p class="text-slate-400">ไม่สามารถโหลดรายการได้</p>');
    }
}

window.appointModuleAdmin = async function () {
    const teacherId = $('#select-teacher-appoint').val();
    if (!teacherId) return Swal.fire('กรุณาเลือกครู');

    try {
        const { error } = await db.from('core_scholarship_admins')
            .insert({ user_id: teacherId, module_id: 'scholarship' });

        if (error) throw error;
        Swal.fire('สำเร็จ', 'แต่งตั้งเรียบร้อย', 'success');
        loadModuleAdminsList();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message, 'error');
    }
};

window.removeModuleAdmin = async function (id) {
    try {
        await db.from('core_scholarship_admins').delete().eq('id', id);
        loadModuleAdminsList();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message, 'error');
    }
};

function initTomSelects() {
    // สำหรับ select ที่ใช้ tom-select
}

// ==========================================
// ADMIN RECORD SCHOLARSHIP (ใช้ requireAdminLocal)
// ==========================================

async function searchStudentsForRecord(query) {
    if (!query || query.trim().length < 2) return [];

    const like = `%${query.trim()}%`;
    try {
        const { data, error } = await db.from('student_enrollments')
            .select(`
                student_id,
                classroom_id,
                core_students!inner (id, student_id_card, prefix, first_name, last_name),
                core_classrooms!inner (grade_level, room_number, academic_year, semester, adviser_id_1, adviser_id_2)
            `)
            .eq('core_classrooms.academic_year', currentYear)
            .eq('core_classrooms.semester', currentTerm)
            .or(`first_name.ilike.${like},last_name.ilike.${like},student_id_card.ilike.${like}`, { foreignTable: 'core_students' })
            .limit(20);

        if (error) throw error;

        recordSearchCache = {};
        return (data || []).map(e => {
            const s = e.core_students;
            const c = e.core_classrooms;
            recordSearchCache[s.id] = { student: s, classroom: c, classroomId: e.classroom_id };
            return {
                id: s.id,
                label: `${s.student_id_card} - ${s.prefix || ''}${s.first_name} ${s.last_name} (ม.${c.grade_level}/${c.room_number})`
            };
        });
    } catch (err) {
        console.error('Error searching students for record:', err);
        return [];
    }
}

function initRecordStudentSearch() {
    const el = document.getElementById('record_student_select');
    if (recordStudentTomSelect) {
        recordStudentTomSelect.destroy();
    }

    el.innerHTML = '';
    recordStudentTomSelect = new TomSelect("#record_student_select", {
        valueField: 'id',
        labelField: 'label',
        searchField: ['label'],
        create: false,
        placeholder: 'พิมพ์ชื่อ นามสกุล หรือรหัสนักเรียน (อย่างน้อย 2 ตัวอักษร)',
        maxOptions: 20,
        shouldLoad: (query) => query.trim().length >= 2,
        load: function (query, callback) {
            searchStudentsForRecord(query)
                .then(results => callback(results))
                .catch(() => callback());
        },
        onChange: async (val) => {
            if (val) await fillRecordStudentData(val);
            else clearRecordFields();
        }
    });
}

async function fillRecordStudentData(studentId) {
    const cached = recordSearchCache[studentId];
    if (!cached) return;

    const { student: s, classroom: c } = cached;
    document.getElementById('record_student_id').value = s.student_id_card;
    document.getElementById('record_student_name').value = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
    document.getElementById('record_student_grade').value = `ม.${c.grade_level}/${c.room_number}`;
    document.getElementById('record_academic_year').value = currentYear || '';
    document.getElementById('record_semester').value = currentTerm || '';

    let adv1 = '', adv2 = '';
    if (c.adviser_id_1) {
        const { data: t } = await db.from('core_personnel')
            .select('first_name, last_name')
            .eq('id', c.adviser_id_1)
            .single();
        if (t) adv1 = `ครู${t.first_name} ${t.last_name}`;
    }
    if (c.adviser_id_2) {
        const { data: t } = await db.from('core_personnel')
            .select('first_name, last_name')
            .eq('id', c.adviser_id_2)
            .single();
        if (t) adv2 = `ครู${t.first_name} ${t.last_name}`;
    }
    document.getElementById('record_advisor_1').value = adv1;
    document.getElementById('record_advisor_2').value = adv2;
}

function clearRecordFields() {
    ['record_student_id', 'record_student_name', 'record_student_grade',
        'record_advisor_1', 'record_advisor_2', 'record_scholarship_name',
        'record_amount', 'record_academic_year', 'record_note'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const sem = document.getElementById('record_semester');
    if (sem) sem.value = '';
}

window.openRecordScholarshipModal = async function () {
    if (!requireAdminLocal()) return;

    clearRecordFields();
    document.getElementById('record_scholarship_name').value = '';
    document.getElementById('record_amount').value = '';
    document.getElementById('record_academic_year').value = currentYear || '';
    document.getElementById('record_semester').value = currentTerm || '';
    document.getElementById('record_note').value = '';
    initRecordStudentSearch();
    $('#recordScholarshipModal').removeClass('hidden').addClass('flex');
};

window.closeRecordScholarshipModal = function () {
    $('#recordScholarshipModal').addClass('hidden').removeClass('flex');
};

window.saveScholarshipRecord = async function () {
    if (!requireAdminLocal()) return;

    const studentId = document.getElementById('record_student_select').value;
    if (!studentId) {
        closeRecordScholarshipModal();
        return Swal.fire('กรุณาเลือกนักเรียน', '', 'error');
    }

    const scholarshipName = document.getElementById('record_scholarship_name').value.trim();
    const amount = parseFloat(document.getElementById('record_amount').value);
    const academicYear = document.getElementById('record_academic_year').value.trim();
    const semester = document.getElementById('record_semester').value;
    const note = document.getElementById('record_note').value.trim();

    if (!scholarshipName || !amount || !academicYear || !semester) {
        closeRecordScholarshipModal();
        return Swal.fire('กรุณากรอกข้อมูลให้ครบถ้วน', '', 'error');
    }

    // ตรวจสอบข้อมูลซ้ำ
    try {
        const { data: existing, error: checkErr } = await db.from('core_scholarships')
            .select('id, scholarship_name, amount, academic_year, semester')
            .eq('student_id', studentId)
            .eq('scholarship_name', scholarshipName)
            .eq('amount', amount)
            .eq('academic_year', academicYear)
            .eq('semester', semester);

        if (checkErr) throw checkErr;

        if (existing && existing.length > 0) {
            closeRecordScholarshipModal();
            const existingRecord = existing[0];
            await Swal.fire({
                icon: 'warning',
                title: '⚠️ มีข้อมูลทุนนี้อยู่แล้ว!',
                html: `
                    <div style="text-align:left; padding:0 10px;">
                        <p><strong>ชื่อทุน:</strong> ${existingRecord.scholarship_name}</p>
                        <p><strong>จำนวนเงิน:</strong> ${existingRecord.amount.toLocaleString()} บาท</p>
                        <p><strong>ปีการศึกษา:</strong> ${existingRecord.academic_year}</p>
                        <p><strong>ภาคเรียน:</strong> ${existingRecord.semester}</p>
                    </div>
                    <p style="margin-top:12px;color:#b45309;">ไม่สามารถบันทึกซ้ำได้ กรุณาตรวจสอบข้อมูล</p>
                `,
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#d97706'
            });
            return;
        }
    } catch (checkErr) {
        console.error('Error checking duplicate:', checkErr);
        closeRecordScholarshipModal();
        await Swal.fire({
            icon: 'info',
            title: 'ไม่สามารถตรวจสอบข้อมูลซ้ำได้',
            text: 'ระบบจะบันทึกข้อมูลให้ แต่กรุณาตรวจสอบความซ้ำซ้อนด้วยตนเอง',
            confirmButtonText: 'ดำเนินการต่อ'
        });
    }

    // บันทึกข้อมูล
    try {
        const insertData = {
            student_id: studentId,
            scholarship_name: scholarshipName,
            amount: amount,
            academic_year: academicYear,
            semester: semester,
            scholarship_type: 'ทุนทั่วไป',
            created_by: currentUser.id,
            created_at: new Date().toISOString()
        };
        if (note) insertData.note = note;

        const { error } = await db.from('core_scholarships').insert([insertData]);
        if (error) throw error;

        closeRecordScholarshipModal();
        await Swal.fire('บันทึกสำเร็จ', 'เพิ่มประวัติทุนเรียบร้อย', 'success');

        if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
        if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } catch (err) {
        console.error(err);
        closeRecordScholarshipModal();

        if (err.code === '42703' || err.message?.includes('column "note" does not exist')) {
            try {
                const insertData = {
                    student_id: studentId,
                    scholarship_name: scholarshipName,
                    amount: amount,
                    academic_year: academicYear,
                    semester: semester,
                    scholarship_type: 'ทุนทั่วไป',
                    created_by: currentUser.id,
                    created_at: new Date().toISOString()
                };
                const { error } = await db.from('core_scholarships').insert([insertData]);
                if (error) throw error;

                await Swal.fire('บันทึกสำเร็จ', 'เพิ่มประวัติทุนเรียบร้อย (ไม่บันทึกหมายเหตุ)', 'success');
                if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
                if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                    $('#recipientTable').DataTable().ajax.reload(null, false);
                }
            } catch (e2) {
                await Swal.fire('ผิดพลาด', e2.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
            }
        } else if (err.code === '42P01' || err.message?.includes('relation') || err.code === '404') {
            await Swal.fire({
                icon: 'error',
                title: 'ไม่พบตาราง core_scholarships',
                html: `<p>กรุณาสร้างตารางใน Supabase SQL Editor</p>`,
                confirmButtonText: 'เข้าใจแล้ว'
            });
        } else {
            await Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    }
};

// ==========================================
// APPLICANT LIST MODAL
// ==========================================

window.openApplicantListModal = async function () {
    const modal = document.getElementById('applicantListModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('applicantListContent').innerHTML =
        '<div class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin text-3xl mb-3"></i><p>กำลังโหลดข้อมูล...</p></div>';

    try {
        const { data: applications, error } = await db.from('core_scholarship_applications')
            .select(`
                id,
                student_id,
                reason,
                usage_plan,
                status,
                created_at,
                core_students!inner (
                    id,
                    student_id_card,
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!applications || applications.length === 0) {
            document.getElementById('applicantListContent').innerHTML = `
                <div class="text-center py-16 text-slate-400">
                    <i class="fas fa-inbox text-5xl mb-4 text-slate-300"></i>
                    <p class="text-lg font-medium">ยังไม่มีรายการคำขอทุน</p>
                    <p class="text-sm">ยังไม่มีนักเรียนทำการขอทุนในระบบ</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-scroll">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-slate-50 border-b-2 border-slate-200">
                        <tr>
                            <th class="p-3 text-left font-bold text-slate-600">รหัสประจำตัว</th>
                            <th class="p-3 text-left font-bold text-slate-600">ชื่อ-สกุล</th>
                            <th class="p-3 text-left font-bold text-slate-600">เหตุผลขอทุน</th>
                            <th class="p-3 text-left font-bold text-slate-600">แผนการใช้เงิน</th>
                            <th class="p-3 text-center font-bold text-slate-600">สถานะ</th>
                            <th class="p-3 text-center font-bold text-slate-600">วันที่ขอ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
        `;

        const statusMap = {
            'pending': { label: 'รอดำเนินการ', cls: 'badge-pending' },
            'approved': { label: 'อนุมัติ', cls: 'badge-approved' },
            'rejected': { label: 'ไม่อนุมัติ', cls: 'badge-rejected' }
        };

        applications.forEach(a => {
            const student = a.core_students;
            const name = student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล';
            const code = student ? student.student_id_card : '-';
            const statusInfo = statusMap[a.status] || { label: a.status || 'รอดำเนินการ', cls: 'badge-pending' };
            const date = a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : '-';

            const reasonShort = a.reason ? (a.reason.length > 60 ? a.reason.substring(0, 60) + '...' : a.reason) : '-';
            const usageShort = a.usage_plan ? (a.usage_plan.length > 60 ? a.usage_plan.substring(0, 60) + '...' : a.usage_plan) : '-';

            html += `
                <tr class="hover:bg-slate-50/60 transition">
                    <td class="p-3 font-mono text-slate-600">${code}</td>
                    <td class="p-3 font-medium text-slate-800">${name}</td>
                    <td class="p-3 text-sm text-slate-600" title="${a.reason || ''}">${reasonShort}</td>
                    <td class="p-3 text-sm text-slate-600" title="${a.usage_plan || ''}">${usageShort}</td>
                    <td class="p-3 text-center"><span class="badge-status ${statusInfo.cls}">${statusInfo.label}</span></td>
                    <td class="p-3 text-center text-sm text-slate-500">${date}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
            <div class="mt-3 text-sm text-slate-500 bg-slate-50 p-2 rounded-xl text-center">
                <i class="fas fa-database mr-1"></i> พบข้อมูลทั้งหมด ${applications.length} รายการ
            </div>
        `;

        document.getElementById('applicantListContent').innerHTML = html;
    } catch (err) {
        console.error('Error loading applicant list:', err);
        document.getElementById('applicantListContent').innerHTML = `
            <div class="text-center py-10 text-rose-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p>เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</p>
            </div>
        `;
    }
};

window.closeApplicantListModal = function () {
    document.getElementById('applicantListModal').classList.add('hidden');
    document.getElementById('applicantListModal').classList.remove('flex');
};

window.exportApplicantListExcel = function () {
    Swal.fire({
        icon: 'info',
        title: 'ส่งออก Excel',
        text: 'กำลังพัฒนาฟังก์ชันส่งออกผู้ขอทุน',
        confirmButtonText: 'ตกลง'
    });
};

window.exportRecipientListExcel = function () {
    Swal.fire({
        icon: 'info',
        title: 'ส่งออก Excel',
        text: 'กำลังพัฒนาฟังก์ชันส่งออกผู้รับทุน',
        confirmButtonText: 'ตกลง'
    });
};

// ===== ฟังก์ชันเสริมสำหรับนำเข้า/ส่งออก =====
async function getStudentIdByCard(studentIdCard) {
    if (!studentIdCard) return null;
    const { data, error } = await db.from('core_students')
        .select('id')
        .eq('student_id_card', studentIdCard.trim())
        .maybeSingle();
    if (error || !data) return null;
    return data.id;
}

async function insertScholarship(studentId, scholarshipName, amount, academicYear, semester, note) {
    if (!studentId || !scholarshipName || isNaN(amount) || !academicYear || !semester) {
        return { success: false, error: 'ข้อมูลไม่ครบ' };
    }

    const insertData = {
        student_id: studentId,
        scholarship_name: scholarshipName,
        amount: amount,
        academic_year: academicYear,
        semester: semester,
        scholarship_type: 'ทุนทั่วไป',
        created_by: currentUser.id,
        created_at: new Date().toISOString()
    };

    if (note && typeof note === 'string' && note.trim()) {
        insertData.note = note.trim();
    }

    try {
        const { error } = await db.from('core_scholarships').insert([insertData]);
        if (error) {
            if (error.message?.includes('column "note" does not exist')) {
                delete insertData.note;
                const { error: e2 } = await db.from('core_scholarships').insert([insertData]);
                if (e2) throw e2;
            } else {
                throw error;
            }
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

window.exportRecipientsToExcel = async function () {
    if (!isAdminUserLocal()) {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'error');
    }
    try {
        const result = await fetchRecipientsData();
        const data = result.data;
        if (!data || data.length === 0) {
            return Swal.fire('ไม่มีข้อมูล', 'ไม่มีข้อมูลผู้รับทุน', 'info');
        }
        const rows = data.map(row => ({
            'ชั้น': row.grade,
            'รหัสประจำตัว': row.code,
            'ชื่อ-สกุล': row.name,
            'ชื่อทุน': row.scholarship_name,
            'จำนวนเงิน': row.amount,
            'ปีการศึกษา': row.academic_year,
            'ภาคเรียน': row.semester,
            'หมายเหตุ': row.note || ''
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'ผู้รับทุน');
        const fileName = `ผู้รับทุน_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        Swal.fire('สำเร็จ', 'ส่งออกไฟล์ Excel เรียบร้อย', 'success');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถส่งออกข้อมูลได้', 'error');
    }
};

window.importRecipientsFromExcel = function () {
    if (!requireAdminLocal()) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (!jsonData || jsonData.length === 0) {
                return Swal.fire('ไฟล์ว่าง', 'ไม่มีข้อมูลในไฟล์', 'error');
            }

            const requiredCols = ['รหัสประจำตัว', 'ชื่อทุน', 'จำนวนเงิน', 'ปีการศึกษา', 'ภาคเรียน'];
            const headers = Object.keys(jsonData[0]);
            const missing = requiredCols.filter(col => !headers.includes(col));
            if (missing.length > 0) {
                return Swal.fire('คอลัมน์ไม่ถูกต้อง', `ขาดคอลัมน์: ${missing.join(', ')}`, 'error');
            }

            const hasNameCol = headers.includes('ชื่อ-สกุล');
            const sample = jsonData.slice(0, 5).map(row =>
                `${row['รหัสประจำตัว']} - ${row['ชื่อทุน']} (${row['จำนวนเงิน']} บาท) ${row['ปีการศึกษา']} เทอม ${row['ภาคเรียน']}`
            ).join('\n');

            // ยืนยันนำเข้า
            const confirmResult = await Swal.fire({
                title: `นำเข้าข้อมูลทุน (พบ ${jsonData.length} รายการ)`,
                html: `
                    <div style="text-align:left;">
                        <p><strong>ตัวอย่างข้อมูล:</strong></p>
                        <pre style="background:#f1f5f9;padding:10px;border-radius:8px;font-size:12px;">${sample}</pre>
                        <p style="margin-top:10px;">⚠️ ระบบจะค้นหานักเรียนจากรหัสประจำตัว ${hasNameCol ? 'และตรวจสอบชื่อ-สกุล' : ''} และตรวจสอบความซ้ำซ้อน (รหัส+ชื่อ+ชื่อทุน+จำนวนเงิน+ปี+เทอม)</p>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันนำเข้า',
                cancelButtonText: 'ยกเลิก'
            });

            if (!confirmResult.isConfirmed) return;

            // ตัวแปรนับผล
            let successCount = 0, skipCount = 0, errorCount = 0, notFoundCount = 0, nameMismatchCount = 0;
            const duplicateRows = [];
            const notFoundRows = [];
            const nameMismatchRows = [];
            const errorRows = [];

            // แสดง Swal พร้อมความคืบหน้า
            Swal.fire({
                title: 'กำลังนำเข้า...',
                html: `
                    <div style="text-align:left;">
                        <p>กำลังดำเนินการ: <span id="import-progress-text">0</span> / ${jsonData.length} รายการ</p>
                        <div style="width:100%; background:#e2e8f0; border-radius:8px; height:20px; margin-top:10px;">
                            <div id="import-progress-bar" style="width:0%; background:linear-gradient(135deg,#059669,#10B981); height:20px; border-radius:8px; transition:width 0.3s;"></div>
                        </div>
                        <div style="margin-top:10px; font-size:0.9rem;">
                            <span style="color:#059669;">✅ สำเร็จ: <span id="import-success">0</span></span> |
                            <span style="color:#b45309;">⏭️ ซ้ำ: <span id="import-skip">0</span></span> |
                            <span style="color:#dc2626;">❌ ผิดพลาด: <span id="import-error">0</span></span>
                        </div>
                    </div>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // ฟังก์ชันอัปเดต UI
            const updateProgress = (processed, success, skip, error) => {
                const popup = Swal.getPopup();
                if (!popup) return;
                const progressText = popup.querySelector('#import-progress-text');
                const progressBar = popup.querySelector('#import-progress-bar');
                const successSpan = popup.querySelector('#import-success');
                const skipSpan = popup.querySelector('#import-skip');
                const errorSpan = popup.querySelector('#import-error');
                if (progressText) progressText.textContent = processed;
                if (progressBar) progressBar.style.width = `${(processed / jsonData.length) * 100}%`;
                if (successSpan) successSpan.textContent = success;
                if (skipSpan) skipSpan.textContent = skip;
                if (errorSpan) errorSpan.textContent = error;
            };

            // วนลูปประมวลผลทีละรายการ
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                try {
                    const studentIdCard = row['รหัสประจำตัว']?.toString().trim();
                    const scholarshipName = row['ชื่อทุน']?.toString().trim();
                    const amount = parseFloat(row['จำนวนเงิน']);
                    const academicYear = row['ปีการศึกษา']?.toString().trim();
                    const semester = row['ภาคเรียน']?.toString().trim();
                    const note = row['หมายเหตุ']?.toString().trim() || '';
                    const fullNameFromFile = hasNameCol ? row['ชื่อ-สกุล']?.toString().trim() : '';

                    if (!studentIdCard || !scholarshipName || isNaN(amount) || !academicYear || !semester) {
                        errorCount++;
                        errorRows.push({ row: i + 1, reason: 'ข้อมูลไม่ครบ' });
                        updateProgress(i + 1, successCount, skipCount, errorCount);
                        continue;
                    }

                    // ค้นหานักเรียนจากรหัส
                    const student = await getStudentByCardWithName(studentIdCard);
                    if (!student) {
                        notFoundCount++;
                        notFoundRows.push({ row: i + 1, studentIdCard });
                        updateProgress(i + 1, successCount, skipCount, errorCount);
                        continue;
                    }

                    // ตรวจสอบชื่อ (ถ้ามี)
                    if (hasNameCol && fullNameFromFile) {
                        const fullNameDB = `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim();
                        if (fullNameDB.replace(/\s+/g, ' ') !== fullNameFromFile.replace(/\s+/g, ' ')) {
                            nameMismatchCount++;
                            nameMismatchRows.push({ row: i + 1, studentIdCard, expected: fullNameDB, got: fullNameFromFile });
                            updateProgress(i + 1, successCount, skipCount, errorCount);
                            continue;
                        }
                    }

                    // ตรวจสอบข้อมูลซ้ำ
                    const isDuplicate = await checkDuplicateScholarship(student.id, scholarshipName, amount, academicYear, semester);
                    if (isDuplicate) {
                        skipCount++;
                        duplicateRows.push({ row: i + 1, studentIdCard, scholarshipName, amount, academicYear, semester });
                        updateProgress(i + 1, successCount, skipCount, errorCount);
                        continue;
                    }

                    // บันทึกข้อมูล
                    const resultInsert = await insertScholarship(student.id, scholarshipName, amount, academicYear, semester, note);
                    if (resultInsert.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        errorRows.push({ row: i + 1, reason: resultInsert.error || 'ไม่ทราบสาเหตุ' });
                    }
                    updateProgress(i + 1, successCount, skipCount, errorCount);

                } catch (err) {
                    errorCount++;
                    errorRows.push({ row: i + 1, reason: err.message });
                    updateProgress(i + 1, successCount, skipCount, errorCount);
                }

                // ปล่อยให้ UI อัปเดต ทุก 5 รายการ
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // ปิด Swal กำลังโหลด
            Swal.close();

            // สร้าง HTML สรุปผลแบบละเอียด
            let summaryHtml = `
                <div style="text-align:left; font-size:0.95rem; line-height:1.8;">
                    <p><strong>✅ สำเร็จ:</strong> ${successCount} รายการ</p>
                    <p><strong>⏭️ ข้าม (ซ้ำ):</strong> ${skipCount} รายการ</p>
                    ${skipCount > 0 ? `<details><summary>📋 รายการที่ซ้ำ</summary><ul style="max-height:150px; overflow-y:auto; background:#f8fafc; padding:8px; border-radius:8px;">${duplicateRows.map(r => `<li>แถว ${r.row}: ${r.studentIdCard} - ${r.scholarshipName} (${r.amount.toLocaleString()} บาท) ปี ${r.academicYear} เทอม ${r.semester}</li>`).join('')}</ul></details>` : ''}
                    <p><strong>❌ ไม่พบนักเรียน:</strong> ${notFoundCount} รายการ</p>
                    ${notFoundCount > 0 ? `<details><summary>📋 รายการที่ไม่พบ</summary><ul style="max-height:150px; overflow-y:auto; background:#f8fafc; padding:8px; border-radius:8px;">${notFoundRows.map(r => `<li>แถว ${r.row}: รหัส ${r.studentIdCard}</li>`).join('')}</ul></details>` : ''}
                    <p><strong>⚠️ ชื่อไม่ตรง:</strong> ${nameMismatchCount} รายการ</p>
                    ${nameMismatchCount > 0 ? `<details><summary>📋 รายการชื่อไม่ตรง</summary><ul style="max-height:150px; overflow-y:auto; background:#f8fafc; padding:8px; border-radius:8px;">${nameMismatchRows.map(r => `<li>แถว ${r.row}: ${r.studentIdCard} (พบ: ${r.expected} แต่ในไฟล์: ${r.got})</li>`).join('')}</ul></details>` : ''}
                    <p><strong>❌ ผิดพลาด:</strong> ${errorCount} รายการ</p>
                    ${errorCount > 0 ? `<details><summary>📋 รายการที่ผิดพลาด</summary><ul style="max-height:150px; overflow-y:auto; background:#f8fafc; padding:8px; border-radius:8px;">${errorRows.map(r => `<li>แถว ${r.row}: ${r.reason}</li>`).join('')}</ul></details>` : ''}
                </div>
            `;

            await Swal.fire({
                title: 'นำเข้าเสร็จสิ้น',
                html: summaryHtml,
                icon: 'success',
                confirmButtonText: 'ตกลง'
            });

            // รีเฟรชตาราง
            if ($.fn.DataTable.isDataTable('#recipientTable')) {
                $('#recipientTable').DataTable().ajax.reload(null, false);
            }
            if (currentClassroomId) {
                await loadStudentsForTable(currentClassroomId);
            }

        } catch (err) {
            console.error(err);
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถนำเข้าข้อมูลได้', 'error');
        }
    };

    input.click();
};

// ค้นหานักเรียนจากรหัสและดึงชื่อ
async function getStudentByCardWithName(studentIdCard) {
    if (!studentIdCard) return null;
    const { data, error } = await db.from('core_students')
        .select('id, student_id_card, prefix, first_name, last_name')
        .eq('student_id_card', studentIdCard.trim())
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

// ตรวจสอบข้อมูลทุนซ้ำ (ใช้ student_id + ชื่อทุน + จำนวนเงิน + ปี + เทอม)
async function checkDuplicateScholarship(studentId, scholarshipName, amount, academicYear, semester) {
    const { data, error } = await db.from('core_scholarships')
        .select('id')
        .eq('student_id', studentId)
        .eq('scholarship_name', scholarshipName)
        .eq('amount', amount)
        .eq('academic_year', academicYear)
        .eq('semester', semester)
        .maybeSingle();
    if (error) {
        console.warn('checkDuplicate error:', error);
        return false;
    }
    return !!data;
}

// ==========================================
// DOM READY (Event Listeners)
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    const dependentsItems = [
        'ผู้สูงอายุ', 'ผู้ป่วยติดเตียง', 'ผู้พิการ',
        'ผู้ที่ไม่สามารถช่วยเหลือตนเองได้', 'ผู้ที่ต้องบำบัด',
        'เด็กทารก 0-3 ปี', 'คนว่างงานอายุ 15-65 ปี',
        'เป็นพ่อหรือแม่เลี้ยงเดี่ยว'
    ];

    const container = document.getElementById('dependents_checklist');
    if (container) {
        dependentsItems.forEach(item => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 hover:border-amber-300 transition cursor-pointer";
            label.innerHTML = `<input type="checkbox" name="dependents" value="${item}" class="accent-amber-600"> <span class="text-sm">${item}</span>`;
            container.appendChild(label);
        });
    }

    document.querySelectorAll('input[name="has_disease"]').forEach(radio => {
        radio.addEventListener('change', function () {
            document.getElementById('disease_fields').classList.toggle('hidden', this.value === 'no');
        });
    });

    const reasonTextarea = document.getElementById('reason');
    const usageTextarea = document.getElementById('usage_plan');

    if (reasonTextarea) {
        reasonTextarea.addEventListener('input', () => {
            document.getElementById('reason_counter').innerText = reasonTextarea.value.length;
        });
    }
    if (usageTextarea) {
        usageTextarea.addEventListener('input', () => {
            document.getElementById('usage_counter').innerText = usageTextarea.value.length;
        });
    }
});
// ==========================================
// homevisit_core.js (ปรับปรุงสิทธิ์ ใช้ config.js)
// ตัวแปร Global, Auth, Role, Classroom, Student, Form, Auto-Save, Submit
// ==========================================

// ==========================================
// 1. GLOBAL VARIABLES & CONSTANTS
// ==========================================
let currentUser = null;
let currentUserId = null;
let currentUserRole = 'teacher';
let isAdminMode = false;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let isHead = false;
let isModuleAdmin = false;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_url: "", gd_pdf_folder_id: "", report_template_id: "" };
let map, marker;
let routeLayer = null;
let schoolMarkerObj = null;

let formIsDirty = false;
let suppressDirty = false;
let isSubmitting = false;
let isAutoSaving = false;
let personnelCache = null;

const SCHOOL_LAT = 13.740269204697068;
const SCHOOL_LNG = 100.25988109513965;
const SCHOOL_NAME = 'โรงเรียนวัดไร่ขิงวิทยา';

let studentTomSelect = null;
let tsClassroom = null;
let currentYear = '';
let currentTerm = '';
let currentStudentId = null;
window.currentClassroomId = null;
let overviewClassroomTom = null;

const templateFields = [
    'student_id_card',
    'visit_date', 'visit_status', 'visit_times',
    'student_nickname', 'student_phone', 'student_line',
    'father_name', 'father_job', 'father_phone',
    'mother_name', 'mother_job', 'mother_phone',
    'guardian_name', 'guardian_job', 'guardian_phone', 'guardian_relation',
    'living_with', 'parents_status',
    'house_number', 'village_no', 'sub_district', 'district', 'province', 'zipcode',
    'latitude', 'longitude', 'travel_distance',
    'house_type',
    'travel_hour', 'travel_minute', 'travel_method',
    'env_house_status', 'env_clean_status', 'env_location_status',
    'utility_electric', 'utility_water', 'utility_toilet',
    'family_members_total', 'family_members_male', 'family_members_female',
    'sib_same_total', 'sib_same_male', 'sib_same_female',
    'sib_diff_total', 'sib_diff_male', 'sib_diff_female',
    'economic_income', 'economic_allowance_source', 'economic_student_job_name', 'economic_student_job_income', 'economic_money_to_school',
    'family_relations_status', 'family_relations_time_together',
    'special_help_details', 'responsibilities_details', 'hobbies_details', 'leave_with_whom_details',
    'guardian_concerns', 'guardian_requests', 'past_welfare', 'informant_type',
    'risk_health', 'risk_welfare', 'risk_responsibilities', 'risk_hobbies', 'risk_drugs', 'risk_violence', 'risk_sex', 'risk_gaming', 'risk_communication', 'risk_internet_access'
];

const templateHeadersThai = [
    'รหัสนักเรียน', 'ชื่อ-นามสกุล',
    'วันที่เยี่ยม', 'สถานะการเยี่ยม', 'ครั้งที่',
    'ชื่อเล่น', 'เบอร์โทรศัพท์', 'ID Line',
    'ชื่อบิดา', 'อาชีพบิดา', 'เบอร์โทรบิดา',
    'ชื่อมารดา', 'อาชีพมารดา', 'เบอร์โทรมารดา',
    'ชื่อผู้ปกครอง', 'อาชีพผู้ปกครอง', 'เบอร์โทรผู้ปกครอง', 'ความสัมพันธ์ผู้ปกครอง',
    'อาศัยอยู่กับ', 'สถานภาพบิดามารดา',
    'บ้านเลขที่', 'หมู่ที่', 'ตำบล', 'อำเภอ', 'จังหวัด', 'รหัสไปรษณีย์',
    'ละติจูด', 'ลองจิจูด', 'ระยะทาง (กม.)',
    'ประเภทบ้าน',
    'ชั่วโมงเดินทาง', 'นาทีเดินทาง', 'วิธีเดินทาง',
    'สภาพบ้าน', 'ความสะอาด', 'สภาพแวดล้อม',
    'ไฟฟ้า', 'น้ำ', 'สุขา',
    'สมาชิกทั้งหมด', 'สมาชิกชาย', 'สมาชิกหญิง',
    'พี่น้องร่วมฯ รวม', 'พี่น้องร่วมฯ ชาย', 'พี่น้องร่วมฯ หญิง',
    'พี่น้องต่างฯ รวม', 'พี่น้องต่างฯ ชาย', 'พี่น้องต่างฯ หญิง',
    'รายได้ครอบครัว (บาท/เดือน)', 'แหล่งค่าใช้จ่ายนักเรียน', 'อาชีพนักเรียน', 'รายได้นักเรียน (บาท/วัน)', 'เงินไปโรงเรียน (บาท/วัน)',
    'ความสัมพันธ์ในครอบครัว', 'เวลาอยู่ร่วมกัน (ชั่วโมง/วัน)',
    'ความช่วยเหลือพิเศษ', 'ความรับผิดชอบ', 'งานอดิเรก', 'ฝากไว้กับใคร',
    'ข้อห่วงใย', 'ข้อเสนอแนะ', 'สวัสดิการที่เคยได้รับ', 'ผู้ให้ข้อมูล',
    'สัมพันธ์กับบิดา', 'สัมพันธ์กับมารดา', 'สัมพันธ์กับพี่น้องชาย', 'สัมพันธ์กับพี่น้องสาว', 'สัมพันธ์กับปู่ย่าตายาย', 'สัมพันธ์กับญาติ',
    'เสี่ยงสุขภาพ', 'เสี่ยงสวัสดิการ', 'เสี่ยงความรับผิดชอบ', 'เสี่ยงงานอดิเรก', 'เสี่ยงสารเสพติด', 'เสี่ยงรุนแรง', 'เสี่ยงเพศ', 'เสี่ยงเกม', 'เสี่ยงสื่อสาร', 'อินเทอร์เน็ต'
];

const fieldKeyMap = {
    'รหัสนักเรียน': 'student_id_card',
    'วันที่เยี่ยม': 'visit_date',
    'สถานะการเยี่ยม': 'visit_status',
    'ครั้งที่': 'visit_times',
    'ชื่อเล่น': 'student_nickname',
    'เบอร์โทรศัพท์': 'student_phone',
    'ID Line': 'student_line',
    'ชื่อบิดา': 'father_name',
    'อาชีพบิดา': 'father_job',
    'เบอร์โทรบิดา': 'father_phone',
    'ชื่อมารดา': 'mother_name',
    'อาชีพมารดา': 'mother_job',
    'เบอร์โทรมารดา': 'mother_phone',
    'ชื่อผู้ปกครอง': 'guardian_name',
    'อาชีพผู้ปกครอง': 'guardian_job',
    'เบอร์โทรผู้ปกครอง': 'guardian_phone',
    'ความสัมพันธ์ผู้ปกครอง': 'guardian_relation',
    'อาศัยอยู่กับ': 'living_with',
    'สถานภาพบิดามารดา': 'parents_status',
    'บ้านเลขที่': 'house_number',
    'หมู่ที่': 'village_no',
    'ตำบล': 'sub_district',
    'อำเภอ': 'district',
    'จังหวัด': 'province',
    'รหัสไปรษณีย์': 'zipcode',
    'ละติจูด': 'latitude',
    'ลองจิจูด': 'longitude',
    'ระยะทาง (กม.)': 'travel_distance',
    'ประเภทบ้าน': 'house_type',
    'ชั่วโมงเดินทาง': 'travel_hour',
    'นาทีเดินทาง': 'travel_minute',
    'วิธีเดินทาง': 'travel_method',
    'สภาพบ้าน': 'env_house_status',
    'ความสะอาด': 'env_clean_status',
    'สภาพแวดล้อม': 'env_location_status',
    'ไฟฟ้า': 'utility_electric',
    'น้ำ': 'utility_water',
    'สุขา': 'utility_toilet',
    'สมาชิกทั้งหมด': 'family_members_total',
    'สมาชิกชาย': 'family_members_male',
    'สมาชิกหญิง': 'family_members_female',
    'พี่น้องร่วมฯ รวม': 'sib_same_total',
    'พี่น้องร่วมฯ ชาย': 'sib_same_male',
    'พี่น้องร่วมฯ หญิง': 'sib_same_female',
    'พี่น้องต่างฯ รวม': 'sib_diff_total',
    'พี่น้องต่างฯ ชาย': 'sib_diff_male',
    'พี่น้องต่างฯ หญิง': 'sib_diff_female',
    'สัมพันธ์กับบิดา': 'rel_father',
    'สัมพันธ์กับมารดา': 'rel_mother',
    'สัมพันธ์กับพี่น้องชาย': 'rel_brother',
    'สัมพันธ์กับพี่น้องสาว': 'rel_sister',
    'สัมพันธ์กับปู่ย่าตายาย': 'rel_grandparent',
    'สัมพันธ์กับญาติ': 'rel_relative',
    'รายได้ครอบครัว (บาท/เดือน)': 'economic_income',
    'แหล่งค่าใช้จ่ายนักเรียน': 'economic_allowance_source',
    'อาชีพนักเรียน': 'economic_student_job_name',
    'รายได้นักเรียน (บาท/วัน)': 'economic_student_job_income',
    'เงินไปโรงเรียน (บาท/วัน)': 'economic_money_to_school',
    'ความสัมพันธ์ในครอบครัว': 'family_relations_status',
    'เวลาอยู่ร่วมกัน (ชั่วโมง/วัน)': 'family_relations_time_together',
    'ความช่วยเหลือพิเศษ': 'special_help_details',
    'ความรับผิดชอบ': 'responsibilities_details',
    'งานอดิเรก': 'hobbies_details',
    'ฝากไว้กับใคร': 'leave_with_whom_details',
    'ข้อห่วงใย': 'guardian_concerns',
    'ข้อเสนอแนะ': 'guardian_requests',
    'สวัสดิการที่เคยได้รับ': 'past_welfare',
    'ผู้ให้ข้อมูล': 'informant_type',
    'เสี่ยงสุขภาพ': 'risk_health',
    'เสี่ยงสวัสดิการ': 'risk_welfare',
    'เสี่ยงความรับผิดชอบ': 'risk_responsibilities',
    'เสี่ยงงานอดิเรก': 'risk_hobbies',
    'เสี่ยงสารเสพติด': 'risk_drugs',
    'เสี่ยงรุนแรง': 'risk_violence',
    'เสี่ยงเพศ': 'risk_sex',
    'เสี่ยงเกม': 'risk_gaming',
    'เสี่ยงสื่อสาร': 'risk_communication',
    'อินเทอร์เน็ต': 'risk_internet_access'
};

// ==========================================
// 2. ฟังก์ชันอัปเดต UI ตามสิทธิ์ (ใช้ config.js มาตรฐานกลาง)
// ==========================================
function applyAdminVisibility() {
    const isAdminEffective = isAdminMode || isModuleAdmin || currentUserRole === 'super_admin';
    window.applyVisibilityByRole(currentUserRole, isAdminEffective, {
        settingsBtn: 'admin-settings-btn',
        toggleBtn: 'btnAdminMode',
        adminManagerBtn: 'adminManagerBtn'
    });
}

// ==========================================
// 3. AUTHENTICATION & ROLE MANAGEMENT (ใช้ config.js)
// ==========================================
async function checkAuth() {
    try {
        const session = await window.checkSessionAndRole('ระบบเยี่ยมบ้าน', [
            'super_admin', 'admin', 'director', 'deputy', 'teacher'
        ]);
        if (!session) return;

        const { user, personnel, role, isAdmin, isTeacher, isOffice } = session;
        currentUser = personnel;
        currentUserId = user.id;
        currentUserRole = role;
        isAdminMode = isAdmin;

        isModuleAdmin = await window.hasModuleAccess(role, 'homevisit', user.id);

        const { data: sInfo } = await db.from('core_school_info')
            .select('current_academic_year, current_semester')
            .single();
        currentYear = sInfo?.current_academic_year;
        currentTerm = sInfo?.current_semester;

        let isDisciplineHead = false;
        let isGradeHead = false;

        const { data: discHead } = await db.from('core_discipline_heads')
            .select('id')
            .eq('personnel_id', user.id)
            .eq('academic_year', currentYear)
            .maybeSingle();
        if (discHead) isDisciplineHead = true;

        const { data: gradeHead } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', user.id)
            .maybeSingle();
        if (gradeHead) isGradeHead = true;

        if (role === 'super_admin') {
            currentViewRole = 'super_admin';
            isReadOnly = false;
        } else if (isModuleAdmin) {
            currentViewRole = 'module_admin';
            isReadOnly = false;
        } else if (isDisciplineHead || isGradeHead) {
            currentViewRole = isDisciplineHead ? 'head_discipline' : 'head_grade';
            isReadOnly = true;
        } else {
            currentViewRole = 'teacher';
            isReadOnly = false;
        }

        applyAdminVisibility();

        const isAdminEffective = isAdminMode || isModuleAdmin || currentUserRole === 'super_admin';
        window.updateToggleModeUI(currentUserRole, isAdminEffective, 'btnAdminMode');

        if (role === 'super_admin' || isModuleAdmin) {
            const toggleBtn = document.getElementById('btnAdminMode');
            if (toggleBtn) toggleBtn.classList.remove('hidden');
        }

        const termDisplay = document.getElementById('term-display');
        if (termDisplay) termDisplay.innerText = `${currentTerm}/${currentYear}`;

        await window.logUserAction('เข้าสู่ระบบเยี่ยมบ้าน', 'homevisit');

        updateUIByRole();
        await loadClassrooms();
        applyReportVisibility();
        applyReadOnlyState();

        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        Swal.close();

    } catch (error) {
        console.error("Auth Error:", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถยืนยันตัวตนได้', 'error');
    }
}

function applyReadOnlyState() {
    if (!isReadOnly) return;

    $('.action-btn, .status-btn, #btnSaveAll, #btn-grade-overview, .btn-edit, .btn-delete, #btn-import, #btn-export-excel, .btn-import, .btn-export, .btn-hover-lift').each(function () {
        if (this.id !== 'btnAdminMode' && this.id !== 'btn-settings') {
            $(this).prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
        }
    });

    $('#homeVisitForm input, #homeVisitForm select, #homeVisitForm textarea').each(function () {
        if ($(this).attr('type') !== 'file') {
            $(this).prop('disabled', true).addClass('opacity-60');
        }
    });

    $('#btn-add-student, #btn-edit-student, #btn-delete-student, #btn-submit-homevisit, #btn-import').hide();

    const alertHtml = `<div class="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl mb-4 flex items-center gap-2">
        <i class="fas fa-eye text-amber-600"></i>
        <span class="font-bold">คุณอยู่ในโหมดดูข้อมูลอย่างเดียว (ไม่สามารถแก้ไขได้)</span>
    </div>`;
    $('#form-section .glass-card:first').prepend(alertHtml);

    console.log('🔒 เปิดใช้งานโหมดอ่านอย่างเดียว');
}

function updateUIByRole() {
    if (!currentUser) return;
    document.getElementById('userNameDisplay').innerText = `ครู${currentUser.first_name} ${currentUser.last_name}`;

    let roleText = 'ครูที่ปรึกษา';
    if (currentViewRole === 'super_admin') roleText = 'ผู้ดูแลระบบสูงสุด';
    else if (currentViewRole === 'module_admin') roleText = 'แอดมินโมดูลเยี่ยมบ้าน';
    else if (currentViewRole === 'head_discipline') roleText = 'หัวหน้างานปกครอง (ดูอย่างเดียว)';
    else if (currentViewRole === 'head_grade') roleText = 'หัวหน้าระดับชั้น (ดูอย่างเดียว)';
    document.getElementById('userRoleDisplay').innerText = roleText;

    const submitBtn = document.getElementById('btn-submit-homevisit');
    if (submitBtn) {
        submitBtn.disabled = isReadOnly;
        submitBtn.classList.toggle('opacity-50', isReadOnly);
    }

    document.querySelectorAll('#homeVisitForm input, #homeVisitForm select, #homeVisitForm textarea').forEach(el => {
        if (el.type !== 'file') {
            el.disabled = isReadOnly;
            el.classList.toggle('opacity-60', isReadOnly);
        }
    });
}

window.toggleRoleView = function () {
    const isAdminEffective = isAdminMode || isModuleAdmin || currentUserRole === 'super_admin';
    if (!isAdminEffective) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถสลับโหมดได้', 'warning');
        return;
    }

    if (currentViewRole === 'teacher') {
        currentViewRole = isModuleAdmin ? 'module_admin' : (currentUserRole === 'super_admin' ? 'super_admin' : 'admin');
        isReadOnly = false;
    } else {
        currentViewRole = 'teacher';
        isReadOnly = false;
    }

    const btn = document.getElementById('btnAdminMode');
    if (btn) {
        if (currentViewRole === 'teacher') {
            btn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
            btn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
            btn.className = 'flex h-10 px-3 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm';
        }
    }

    window.logUserAction(`สลับโหมดเป็น ${currentViewRole}`, 'homevisit');
    applyAdminVisibility();
    updateUIByRole();
    loadClassrooms();

    const modeName = currentViewRole === 'teacher' ? 'โหมดครูที่ปรึกษา' : 'โหมดผู้ดูแลระบบ';
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: `สลับเป็น ${modeName}`,
        showConfirmButton: false,
        timer: 2000
    });
};

async function logout() {
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

function applyReportVisibility() {
    const isReportEnabled = moduleSettings.show_report === 'true';
    const isSuperAdmin = (currentUserRole === 'super_admin' || currentViewRole === 'super_admin');
    const navBtn = document.getElementById('nav-btn-report');
    const tabBtnDesktop = document.getElementById('tab-report-btn');
    const tabBtnMobile = document.getElementById('tab-report-btn-mobile');

    if (isSuperAdmin) {
        if (navBtn) navBtn.classList.remove('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.remove('hidden');
        if (tabBtnMobile) { tabBtnMobile.classList.remove('hidden'); tabBtnMobile.classList.add('flex-1'); }
        return;
    }
    if (isReportEnabled) {
        if (navBtn) navBtn.classList.remove('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.remove('hidden');
        if (tabBtnMobile) { tabBtnMobile.classList.remove('hidden'); tabBtnMobile.classList.add('flex-1'); }
    } else {
        if (navBtn) navBtn.classList.add('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.add('hidden');
        if (tabBtnMobile) { tabBtnMobile.classList.add('hidden'); tabBtnMobile.classList.remove('flex-1'); }
    }
}

// ==========================================
// 4. CLASSROOM & STUDENT MANAGEMENT
// ==========================================
async function loadClassrooms() {
    let query = db.from('core_classrooms')
        .select('*')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level').order('room_number');

    const isHighLevel = ['super_admin', 'module_admin', 'head_discipline'].includes(currentViewRole);
    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).single();
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
        placeholder: "-- ค้นหาและเลือกห้องเรียน --",
        maxHeight: '500px',
        maxOptions: 1000,
        dropdownParent: 'body',
        searchField: ['text'],
        score: function (search) {
            return function (item) {
                if (item.text.toLowerCase().includes(search.toLowerCase())) return 1;
                return 0;
            };
        },
        onChange: (val) => {
            if (val) onClassroomSelected(val);
            else clearClassroomSelection();
        }
    });

    if (currentViewRole === 'teacher' && classrooms && classrooms.length === 1) {
        tsClassroom.setValue(classrooms[0].id);
    }
}

async function onClassroomSelected(classroomId) {
    window.currentClassroomId = classroomId;
    document.getElementById('no-classroom-selected')?.classList.add('hidden');
    document.getElementById('homeVisitForm')?.classList.remove('hidden');
    await loadStudentsForClassroom(classroomId);
    updateStatusBadge('empty');
    goToStep(1);
}

function clearClassroomSelection() {
    window.currentClassroomId = null;
    document.getElementById('no-classroom-selected')?.classList.remove('hidden');
    document.getElementById('homeVisitForm')?.classList.add('hidden');
}

async function loadStudentsForClassroom(classroomId) {
    const studentSelect = document.getElementById('hv_student');
    if (!studentSelect) return;
    try {
        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('classroom_id', classroomId)
            .order('student_number');
        const options = (enrolls || []).map(e => ({
            value: e.core_students.id,
            text: `${e.core_students.student_id_card || '-'} - ${e.core_students.prefix || ''}${e.core_students.first_name} ${e.core_students.last_name}`
        }));
        if (studentTomSelect) studentTomSelect.destroy();
        studentTomSelect = new TomSelect('#hv_student', {
            create: false,
            placeholder: '-- ค้นหาและเลือกนักเรียน --',
            options: options,
            dropdownParent: 'body',
            onChange: async (val) => {
                if (val) {
                    if (formIsDirty && currentStudentId && !isReadOnly) {
                        const result = await Swal.fire({
                            title: 'มีข้อมูลที่ยังไม่ได้บันทึก',
                            html: 'ต้องการบันทึกข้อมูลของนักเรียนคนปัจจุบัน<br>ก่อนเปลี่ยนไปยังนักเรียนคนใหม่หรือไม่?',
                            icon: 'warning',
                            showCancelButton: true,
                            showDenyButton: true,
                            confirmButtonColor: '#0284c7',
                            denyButtonColor: '#64748b',
                            cancelButtonColor: '#dc2626',
                            confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึกแล้วเปลี่ยน',
                            denyButtonText: '<i class="fas fa-arrow-right mr-1"></i> เปลี่ยนโดยไม่บันทึก',
                            cancelButtonText: '<i class="fas fa-times mr-1"></i> ยกเลิก',
                            reverseButtons: false,
                        });
                        if (result.isDismissed) {
                            studentTomSelect.setValue(currentStudentId, true);
                            return;
                        }
                        if (result.isConfirmed) {
                            const didSave = await autoSaveIfDirty();
                            await loadStudentInfo(val);
                            if (didSave) {
                                Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: '<span class="text-sm">บันทึกอัตโนมัติเรียบร้อยแล้ว</span>', showConfirmButton: false, timer: 2500, timerProgressBar: true });
                            }
                            return;
                        }
                        formIsDirty = false;
                        await loadStudentInfo(val);
                        return;
                    }
                    await loadStudentInfo(val);
                } else {
                    clearStudentInfo();
                }
            }
        });
    } catch (err) {
        console.error(err);
    }
}

async function loadStudentInfo(studentId) {
    suppressDirty = true;
    clearStudentInfo();
    currentStudentId = studentId;
    Swal.fire({ title: 'กำลังโหลดข้อมูลประวัติ...', didOpen: () => Swal.showLoading() });

    const { data: enroll, error } = await db.from('student_enrollments')
        .select('student_number, classroom_id, core_students(*), core_classrooms(id, grade_level, room_number)')
        .eq('student_id', studentId)
        .eq('classroom_id', window.currentClassroomId)
        .maybeSingle();

    if (error || !enroll) { Swal.close(); Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียน', 'warning'); return; }

    document.getElementById('student_code').value = enroll.core_students?.student_id_card || '';
    document.getElementById('student_fullname').value = `${enroll.core_students?.prefix || ''}${enroll.core_students?.first_name} ${enroll.core_students?.last_name}`;
    document.getElementById('student_grade').value = enroll.core_classrooms?.grade_level || '';
    document.getElementById('student_number').value = enroll.student_number || '';

    const avatarUrl = enroll.core_students?.avatar_students_url;
    const studentPicInput = document.getElementById('pic_student');
    const avatarImg = document.getElementById('student-avatar-img');
    const avatarPlaceholder = document.getElementById('student-avatar-placeholder');
    const avatarBadge = document.getElementById('student-avatar-badge');
    const avatarStatus = document.getElementById('student-avatar-status');

    if (avatarUrl) {
        if (avatarImg) { avatarImg.src = avatarUrl; avatarImg.classList.remove('hidden'); }
        if (avatarPlaceholder) avatarPlaceholder.classList.add('hidden');
        if (avatarBadge) avatarBadge.classList.remove('hidden');
        if (avatarStatus) avatarStatus.textContent = 'มีรูปโปรไฟล์แล้ว ✓';
    } else {
        if (avatarImg) { avatarImg.src = ''; avatarImg.classList.add('hidden'); }
        if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
        if (avatarBadge) avatarBadge.classList.add('hidden');
        if (avatarStatus) avatarStatus.textContent = 'ยังไม่มีรูปโปรไฟล์';
    }

    if (studentPicInput) {
        const previewImg = document.getElementById('preview1');
        const delBtn = document.getElementById('del_btn1');
        const cloudBtn = document.getElementById('cloud_btn1');
        if (avatarUrl) {
            studentPicInput.dataset.uploadedUrl = avatarUrl;
            if (previewImg) { previewImg.src = avatarUrl; previewImg.classList.remove('hidden'); previewImg.dataset.url = avatarUrl; }
            if (delBtn) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
            if (cloudBtn) {
                cloudBtn.innerHTML = `<i class="fa-solid fa-check text-green-400"></i> ใช้รูปโปรไฟล์เดิม`;
                cloudBtn.classList.add('bg-slate-700', 'text-white');
                cloudBtn.classList.remove('bg-green-600', 'opacity-40');
                cloudBtn.disabled = true;
            }
        } else {
            delete studentPicInput.dataset.uploadedUrl;
            if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); delete previewImg.dataset.url; }
            if (delBtn) { delBtn.classList.add('hidden'); delBtn.classList.remove('flex'); }
            if (cloudBtn) {
                cloudBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้`;
                cloudBtn.classList.add('bg-green-600', 'text-white', 'opacity-40');
                cloudBtn.classList.remove('bg-slate-700');
                cloudBtn.disabled = true;
            }
        }
    }

    await loadExistingHomeVisit(studentId);
    Swal.close();
}

function clearStudentInfo() {
    suppressDirty = true;
    currentStudentId = null;
    formIsDirty = false;

    ['student_code', 'student_fullname', 'student_grade', 'student_number'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const tomInstances = ['tomLivingWith', 'tomParentsStatus', 'tomHouseType', 'tomTravelMethod',
        'tomEnvHouseStatus', 'tomEnvCleanStatus', 'tomEnvLocationStatus',
        'tomInformantType', 'tomFamilyRelationStatus', 'tomLeaveWithWhom', 'tomAllowanceSource'];
    tomInstances.forEach(inst => {
        if (window[inst]) window[inst].setValue('');
    });

    const radioGroups = ['visit_status', 'utility_electric', 'utility_water', 'utility_toilet', 'internet_access'];
    radioGroups.forEach(group => {
        const radios = document.querySelectorAll(`input[name="${group}"]`);
        radios.forEach(radio => radio.checked = false);
        if (group === 'visit_status') {
            const defaultRadio = document.querySelector(`input[name="visit_status"][value="เยี่ยมแล้ว"]`);
            if (defaultRadio) defaultRadio.checked = true;
        }
    });

    for (let i = 0; i < 6; i++) {
        const radios = document.querySelectorAll(`input[name="rel_radio_${i}"]`);
        radios.forEach(radio => radio.checked = false);
        const defaultRadio = document.querySelector(`input[name="rel_radio_${i}"][value="ไม่มี"]`);
        if (defaultRadio) defaultRadio.checked = true;
    }

    const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
    riskGroups.forEach(group => {
        document.querySelectorAll(`input[name="risk_${group}"]`).forEach(cb => cb.checked = false);
        const otherInput = document.getElementById(`risk_${group}_other_txt`);
        if (otherInput) {
            otherInput.value = '';
            otherInput.classList.add('hidden');
        }
    });

    const avatarImg = document.getElementById('student-avatar-img');
    const avatarPlaceholder = document.getElementById('student-avatar-placeholder');
    const avatarBadge = document.getElementById('student-avatar-badge');
    const avatarStatus = document.getElementById('student-avatar-status');
    if (avatarImg) { avatarImg.src = ''; avatarImg.classList.add('hidden'); }
    if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
    if (avatarBadge) avatarBadge.classList.add('hidden');
    if (avatarStatus) avatarStatus.textContent = '— เลือกนักเรียนเพื่อดูรูป —';

    const photos = [
        { inputId: 'pic_student', previewId: 'preview1', cloudBtnId: 'cloud_btn1', delBtnId: 'del_btn1' },
        { inputId: 'pic_outside', previewId: 'preview2', cloudBtnId: 'cloud_btn2', delBtnId: 'del_btn2' },
        { inputId: 'pic_inside', previewId: 'preview3', cloudBtnId: 'cloud_btn3', delBtnId: 'del_btn3' },
        { inputId: 'pic_teacher', previewId: 'preview4', cloudBtnId: 'cloud_btn4', delBtnId: 'del_btn4' }
    ];
    photos.forEach(p => {
        const fileInput = document.getElementById(p.inputId);
        if (fileInput) {
            fileInput.value = '';
            delete fileInput.dataset.uploadedUrl;
        }
        const img = document.getElementById(p.previewId);
        if (img) {
            img.src = '';
            img.classList.add('hidden');
            delete img.dataset.url;
        }
        const delBtn = document.getElementById(p.delBtnId);
        if (delBtn) delBtn.classList.add('hidden');
        const cloudBtn = document.getElementById(p.cloudBtnId);
        if (cloudBtn) {
            cloudBtn.disabled = true;
            cloudBtn.classList.add('opacity-40', 'bg-green-600', 'text-white');
            cloudBtn.classList.remove('bg-slate-700');
            cloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้';
        }
    });

    const textFields = [
        'hv_date', 'visit_times', 'student_nickname', 'student_phone', 'student_line',
        'father_name', 'father_job', 'father_phone', 'mother_name', 'mother_job', 'mother_phone',
        'guardian_name', 'guardian_job', 'guardian_phone', 'guardian_relation',
        'addr_house', 'addr_moo', 'addr_subdistrict', 'addr_district', 'addr_province', 'addr_zipcode',
        'travel_distance', 'travel_hour', 'travel_minute', 'lat', 'lng',
        'member_total', 'member_male', 'member_female',
        'sib_same_total', 'sib_same_male', 'sib_same_female',
        'sib_diff_total', 'sib_diff_male', 'sib_diff_female',
        'family_income_monthly', 'student_job_name', 'student_job_income', 'money_to_school',
        'time_together_hours', 'special_help_details', 'responsibilities_details',
        'hobbies_details', 'guardian_concerns_details', 'guardian_requests_details', 'past_welfare_details'
    ];
    textFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const defaultDate = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById('hv_date');
    if (dateInput) dateInput.value = defaultDate;
    const timesInput = document.getElementById('visit_times');
    if (timesInput) timesInput.value = '1';

    // เรียกใช้ฟังก์ชันแผนที่จาก homevisit_map.js (ถ้ามี)
    if (typeof resetMap === 'function') resetMap();
    else if (window.map && window.marker) {
        window.marker.setLatLng([SCHOOL_LAT, SCHOOL_LNG]);
        window.map.setView([SCHOOL_LAT, SCHOOL_LNG], 10);
        if (window.routeLayer) { window.map.removeLayer(window.routeLayer); window.routeLayer = null; }
        if (typeof updateRouteInfoPanel === 'function') updateRouteInfoPanel(null);
    }

    suppressDirty = false;
}

async function loadExistingHomeVisit(studentId) {
    try {
        const { data: records, error } = await db.from('module_home_visits')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);

        if (error) throw error;
        const data = records && records.length > 0 ? records[0] : null;
        if (!data) {
            suppressDirty = false;
            formIsDirty = false;
            return;
        }

        suppressDirty = true;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
        const setRadio = (name, val) => {
            if (!val) return;
            const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
            if (el) el.checked = true;
        };

        setVal('hv_date', data.visit_date ? data.visit_date.split('T')[0] : '');
        setRadio('visit_status', data.visit_status);
        setVal('visit_times', data.visit_times);
        setVal('student_nickname', data.student_nickname);
        setVal('student_phone', data.student_phone);
        setVal('student_line', data.student_line);

        setVal('father_name', data.father_name);
        setVal('father_job', data.father_job);
        setVal('father_phone', data.father_phone);

        setVal('mother_name', data.mother_name);
        setVal('mother_job', data.mother_job);
        setVal('mother_phone', data.mother_phone);

        setVal('guardian_name', data.guardian_name);
        setVal('guardian_job', data.guardian_job);
        setVal('guardian_phone', data.guardian_phone);
        setVal('guardian_relation', data.guardian_relation);

        if (data.living_with) window.tomLivingWith?.setValue(data.living_with, true);
        if (data.parents_status) window.tomParentsStatus?.setValue(data.parents_status, true);

        setVal('addr_house', data.house_number);
        setVal('addr_moo', data.village_no);
        setVal('addr_subdistrict', data.sub_district);
        setVal('addr_district', data.district);
        setVal('addr_province', data.province);
        setVal('addr_zipcode', data.zipcode);

        setVal('lat', data.latitude);
        setVal('lng', data.longitude);
        setVal('travel_distance', data.travel_distance);

        if (data.house_type) window.tomHouseType?.setValue(data.house_type, true);

        setVal('travel_hour', data.travel_hour);
        setVal('travel_minute', data.travel_minute);

        if (data.travel_method) window.tomTravelMethod?.setValue(data.travel_method, true);
        if (data.env_house_status) window.tomEnvHouseStatus?.setValue(data.env_house_status, true);
        if (data.env_clean_status) window.tomEnvCleanStatus?.setValue(data.env_clean_status, true);
        if (data.env_location_status) window.tomEnvLocationStatus?.setValue(data.env_location_status, true);

        setRadio('utility_electric', data.utility_electric);
        setRadio('utility_water', data.utility_water);
        setRadio('utility_toilet', data.utility_toilet);

        const fm = data.family_members || {};
        setVal('member_total', fm.total);
        setVal('member_male', fm.male);
        setVal('member_female', fm.female);
        setVal('sib_same_total', fm.sib_same_total);
        setVal('sib_same_male', fm.sib_same_male);
        setVal('sib_same_female', fm.sib_same_female);
        setVal('sib_diff_total', fm.sib_diff_total);
        setVal('sib_diff_male', fm.sib_diff_male);
        setVal('sib_diff_female', fm.sib_diff_female);

        const eco = data.economic_data || {};
        setVal('family_income_monthly', eco.income);
        if (eco.allowance_source) window.tomAllowanceSource?.setValue(eco.allowance_source, true);
        setVal('student_job_name', eco.student_job_name);
        setVal('student_job_income', eco.student_job_income);
        setVal('money_to_school', eco.money_to_school);

        const fRel = data.family_relations || {};
        if (fRel.status) window.tomFamilyRelationStatus?.setValue(fRel.status, true);
        setVal('time_together_hours', fRel.time_together);

        const relations = data.relations_data || data.relatives_data || [];
        relations.forEach((item, i) => {
            const el = document.querySelector(`input[name="rel_radio_${i}"][value="${item.relation}"]`);
            if (el) el.checked = true;
        });

        const risk = data.risk_factors || data.risk_data || {};
        const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
        riskGroups.forEach(group => {
            const values = risk[group] || [];
            values.forEach(val => {
                if (val.startsWith('อื่นๆ:')) {
                    const otherCheckbox = Array.from(document.querySelectorAll(`input[name="risk_${group}"]`)).find(cb => cb.value.includes('อื่นๆ'));
                    if (otherCheckbox) otherCheckbox.checked = true;
                    const otherInput = document.getElementById(`risk_${group}_other_txt`);
                    if (otherInput) {
                        otherInput.value = val.replace('อื่นๆ: ', '').trim();
                        otherInput.classList.remove('hidden');
                    }
                } else {
                    const el = document.querySelector(`input[name="risk_${group}"][value="${val}"]`);
                    if (el) el.checked = true;
                }
            });
        });

        setVal('special_help_details', data.special_help_details);
        setVal('responsibilities_details', data.responsibilities_details);
        setVal('hobbies_details', data.hobbies_details);
        if (data.leave_with_whom_details) window.tomLeaveWithWhom?.setValue(data.leave_with_whom_details, true);

        setVal('guardian_concerns_details', data.guardian_concerns);
        setVal('guardian_requests_details', data.guardian_requests);
        setVal('past_welfare_details', data.past_welfare);

        if (data.informant_type) window.tomInformantType?.setValue(data.informant_type, true);

        // อัปเดตแผนที่
        if (data.latitude && data.longitude && window.map && window.marker) {
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                window.marker.setLatLng([lat, lng]);
                window.map.setView([lat, lng], 16);
                if (typeof calculateRoute === 'function') {
                    calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
                }
            }
        }

        const loadPic = (id, previewId, btnId, delId, url) => {
            const input = document.getElementById(id);
            if (!input) return;
            if (url && url !== 'null' && url !== '-') {
                input.dataset.uploadedUrl = url;
                const img = document.getElementById(previewId);
                if (img) { img.src = url; img.classList.remove('hidden'); img.dataset.url = url; }
                const delBtn = document.getElementById(delId);
                if (delBtn) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
                const cloudBtn = document.getElementById(btnId);
                if (cloudBtn) {
                    cloudBtn.innerHTML = '<i class="fa-solid fa-check text-green-400"></i> อัพโหลดแล้ว';
                    cloudBtn.classList.add('bg-slate-700', 'text-white');
                    cloudBtn.classList.remove('bg-green-600', 'opacity-40');
                }
            }
        };

        loadPic('pic_student', 'preview1', 'cloud_btn1', 'del_btn1', data.photo_student);
        loadPic('pic_outside', 'preview2', 'cloud_btn2', 'del_btn2', data.photo_outside);
        loadPic('pic_inside', 'preview3', 'cloud_btn3', 'del_btn3', data.photo_inside);
        loadPic('pic_teacher', 'preview4', 'cloud_btn4', 'del_btn4', data.photo_teacher);

        suppressDirty = false;
        formIsDirty = false;
        updateStatusBadge('completed');

    } catch (err) {
        console.error('Error loading existing home visit:', err);
        suppressDirty = false;
        formIsDirty = false;
    }
}

// ==========================================
// ฟังก์ชันเสริม
// ==========================================
function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (!badge || !text) return;
    if (status === 'completed') {
        badge.className = 'px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-center border border-emerald-100';
        text.innerHTML = '<i class="fas fa-check-circle text-emerald-400 mr-1"></i> บันทึกแล้ว';
    } else if (status === 'saving') {
        badge.className = 'px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-center border border-blue-100';
        text.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-400 mr-1"></i> กำลังบันทึก...';
    } else {
        badge.className = 'px-3 py-2 bg-slate-50 text-slate-400 rounded-xl text-center border border-slate-200';
        text.innerHTML = '<i class="fas fa-circle text-slate-300 text-[8px] mr-1"></i> ยังไม่บันทึก';
    }
}

// ==========================================
// ✅ STEP NAVIGATION (เพิ่มเติม/แก้ไข)
// ==========================================
const stepColorConfigs = {
    1: { bg: 'bg-red-600', text: 'text-red-700', shadow: 'shadow-red-100' },
    2: { bg: 'bg-orange-600', text: 'text-orange-700', shadow: 'shadow-orange-100' },
    3: { bg: 'bg-yellow-600', text: 'text-yellow-700', shadow: 'shadow-yellow-100' },
    4: { bg: 'bg-green-600', text: 'text-green-700', shadow: 'shadow-green-100' },
    5: { bg: 'bg-sky-600', text: 'text-sky-700', shadow: 'shadow-sky-100' }
};

window.goToStep = function (step) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    const targetStep = document.getElementById(`step-${step}`);
    if (targetStep) targetStep.classList.add('active');

    const percentages = { 1: '0%', 2: '25%', 3: '50%', 4: '75%', 5: '100%' };
    const progBar = document.getElementById('progressBar');
    if (progBar) progBar.style.width = percentages[step];

    for (let i = 1; i <= 5; i++) {
        const circle = document.getElementById(`circle-${i}`);
        const text = document.getElementById(`text-step-${i}`);
        if (circle && text) {
            const config = stepColorConfigs[i];
            if (i <= step) {
                circle.className = `w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-md transition-all ${config.bg} ${config.shadow}`;
                text.className = `text-xs font-black transition-colors ${config.text}`;
            } else {
                circle.className = 'w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg bg-slate-100 text-slate-400 transition-all';
                text.className = 'text-xs font-bold text-slate-400 transition-colors';
            }
        }
    }
    if (step === 2) {
        setTimeout(() => {
            if (typeof initMap === 'function') initMap();
            else if (window.map) window.map.invalidateSize();
        }, 200);
    }
};

window.nextStep = async function (step) {
    if (step === 2 && !document.getElementById('hv_student')?.value) {
        return Swal.fire('ผิดพลาด', 'กรุณาเลือกนักเรียนก่อนครับ', 'warning');
    }
    await autoSaveStep();
    goToStep(step);
};

window.prevStep = function (step) { goToStep(step); };

// ==========================================
// 5. FORM HANDLING & AUTO-SAVE
// ==========================================
function markDirty() {
    if (suppressDirty || !currentStudentId) return;
    if (formIsDirty) return;
    formIsDirty = true;
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (badge && text) {
        badge.className = 'px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-center border border-orange-100';
        text.innerHTML = '<i class="fas fa-circle text-orange-400 text-[8px] mr-1 animate-pulse"></i> มีการแก้ไข (กำลังบันทึกอัตโนมัติ...)';
    }

    clearTimeout(window._autoSaveTimer);
    window._autoSaveTimer = setTimeout(async () => {
        await autoSaveStep();
    }, 1500);
}

function initDirtyTracking() {
    const formContainer = document.getElementById('homeVisitForm');
    if (!formContainer) return;
    formContainer.addEventListener('input', () => markDirty());
    formContainer.addEventListener('change', () => markDirty());
    window.addEventListener('beforeunload', (e) => {
        if (formIsDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

function buildFormData(studentId, classroomId) {
    const getVal = (id) => document.getElementById(id)?.value || '';
    const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || null;

    const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
    const riskData = {};
    riskGroups.forEach(group => {
        const checkedBoxes = document.querySelectorAll(`input[name="risk_${group}"]:checked`);
        let values = Array.from(checkedBoxes).map(cb => cb.value);
        const otherCheckbox = Array.from(checkedBoxes).find(cb => cb.value.includes('อื่นๆ'));
        if (otherCheckbox) {
            const otherInput = document.getElementById(`risk_${group}_other_txt`);
            if (otherInput && otherInput.value.trim()) {
                values = values.map(v => v === otherCheckbox.value ? `อื่นๆ: ${otherInput.value.trim()}` : v);
            }
        }
        riskData[group] = values;
    });
    riskData.internet_access = getRadio('internet_access');

    const relatives = ['บิดา', 'มารดา', 'พี่ชาย/น้องชาย', 'พี่สาว/น้องสาว', 'ปู่/ย่า/ตา/ยาย', 'ญาติ'];
    const relations = relatives.map((rel, i) => {
        const radio = document.querySelector(`input[name="rel_radio_${i}"]:checked`);
        return { relative: rel, relation: radio ? radio.value : 'ไม่มี' };
    });

    return {
        student_id: studentId, classroom_id: classroomId, teacher_id: currentUser.id,
        academic_year: currentYear, semester: currentTerm,
        visit_date: getVal('hv_date') || new Date().toISOString().split('T')[0],
        visit_status: getRadio('visit_status') || 'เยี่ยมแล้ว',
        visit_times: parseInt(getVal('visit_times')) || 1,
        student_nickname: getVal('student_nickname'), student_phone: getVal('student_phone'), student_line: getVal('student_line'),
        father_name: getVal('father_name'), father_job: getVal('father_job'), father_phone: getVal('father_phone'),
        mother_name: getVal('mother_name'), mother_job: getVal('mother_job'), mother_phone: getVal('mother_phone'),
        guardian_name: getVal('guardian_name'), guardian_job: getVal('guardian_job'), guardian_phone: getVal('guardian_phone'),
        guardian_relation: getVal('guardian_relation'),
        living_with: window.tomLivingWith?.getValue() || '', parents_status: window.tomParentsStatus?.getValue() || '',
        house_number: getVal('addr_house'), village_no: getVal('addr_moo'), sub_district: getVal('addr_subdistrict'),
        district: getVal('addr_district'), province: getVal('addr_province'), zipcode: getVal('addr_zipcode'),
        latitude: getVal('lat') || null, longitude: getVal('lng') || null, travel_distance: getVal('travel_distance') || null,
        house_type: window.tomHouseType?.getValue() || '',
        travel_hour: parseInt(getVal('travel_hour')) || 0, travel_minute: parseInt(getVal('travel_minute')) || 0,
        travel_method: window.tomTravelMethod?.getValue() || '',
        env_house_status: window.tomEnvHouseStatus?.getValue() || '',
        env_clean_status: window.tomEnvCleanStatus?.getValue() || '',
        env_location_status: window.tomEnvLocationStatus?.getValue() || '',
        utility_electric: getRadio('utility_electric'), utility_water: getRadio('utility_water'), utility_toilet: getRadio('utility_toilet'),
        family_members: {
            total: getVal('member_total'), male: getVal('member_male'), female: getVal('member_female'),
            sib_same_total: getVal('sib_same_total'), sib_same_male: getVal('sib_same_male'), sib_same_female: getVal('sib_same_female'),
            sib_diff_total: getVal('sib_diff_total'), sib_diff_male: getVal('sib_diff_male'), sib_diff_female: getVal('sib_diff_female'),
        },
        economic_data: {
            income: getVal('family_income_monthly'),
            allowance_source: window.tomAllowanceSource?.getValue() || '',
            student_job_name: getVal('student_job_name'), student_job_income: getVal('student_job_income'), money_to_school: getVal('money_to_school'),
        },
        family_relations: { status: window.tomFamilyRelationStatus?.getValue() || '', time_together: getVal('time_together_hours') },
        special_help_details: getVal('special_help_details'), responsibilities_details: getVal('responsibilities_details'),
        hobbies_details: getVal('hobbies_details'), leave_with_whom_details: window.tomLeaveWithWhom?.getValue() || '',
        photo_student: document.getElementById('pic_student')?.dataset.uploadedUrl || null,
        photo_outside: document.getElementById('pic_outside')?.dataset.uploadedUrl || null,
        photo_inside: document.getElementById('pic_inside')?.dataset.uploadedUrl || null,
        photo_teacher: document.getElementById('pic_teacher')?.dataset.uploadedUrl || null,
        guardian_concerns: getVal('guardian_concerns_details'), guardian_requests: getVal('guardian_requests_details'),
        past_welfare: getVal('past_welfare_details'), informant_type: window.tomInformantType?.getValue() || '',
        risk_data: riskData,
        relations_data: relations,
        updated_at: new Date().toISOString()
    };
}

async function autoSaveIfDirty() {
    if (!formIsDirty || !currentStudentId || !window.currentClassroomId || isReadOnly) return false;
    try {
        const formData = buildFormData(currentStudentId, window.currentClassroomId);
        const { data: existingRecords } = await db
            .from('module_home_visits')
            .select('id')
            .eq('student_id', currentStudentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);
        const existingRow = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;
        let savedData, saveError;
        if (existingRow) {
            const { data, error } = await db.from('module_home_visits').update(formData).eq('id', existingRow.id).select('id');
            savedData = data; saveError = error;
        } else {
            const { data, error } = await db.from('module_home_visits').insert([formData]).select('id');
            savedData = data; saveError = error;
        }
        if (saveError) throw saveError;
        if (!savedData || savedData.length === 0) throw new Error('RLS blocked auto-save — 0 rows written');
        formIsDirty = false;
        updateStatusBadge('completed');
        return true;
    } catch (err) {
        console.warn('Auto-save failed:', err);
        return false;
    }
}

async function autoSaveStep() {
    if (!formIsDirty || !currentStudentId || !window.currentClassroomId || isReadOnly) {
        return true;
    }

    if (isAutoSaving) return true;

    isAutoSaving = true;

    const toastLoading = Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: 'info',
        title: '⏳ กำลังบันทึกอัตโนมัติ...',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    try {
        const formData = buildFormData(currentStudentId, window.currentClassroomId);

        const { data: existingRecords, error: selectError } = await db
            .from('module_home_visits')
            .select('id')
            .eq('student_id', currentStudentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);

        if (selectError) throw selectError;

        const existingRow = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;
        let savedData, saveError;

        if (existingRow) {
            const { data, error } = await db
                .from('module_home_visits')
                .update(formData)
                .eq('id', existingRow.id)
                .select('id');
            savedData = data;
            saveError = error;
        } else {
            const { data, error } = await db
                .from('module_home_visits')
                .insert([formData])
                .select('id');
            savedData = data;
            saveError = error;
        }

        if (saveError) throw saveError;
        if (!savedData || savedData.length === 0) {
            throw new Error('ไม่สามารถบันทึกข้อมูล (อาจถูก RLS ปิดกั้น)');
        }

        formIsDirty = false;
        updateStatusBadge('completed');

        Swal.close();

        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'success',
            title: '💾 บันทึกอัตโนมัติสำเร็จ',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });

        return true;
    } catch (err) {
        console.error('Auto-save step error:', err);

        Swal.close();

        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'warning',
            title: '⚠️ บันทึกอัตโนมัติล้มเหลว',
            text: err.message || 'กรุณาบันทึกด้วยตนเอง',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });
        return false;
    } finally {
        isAutoSaving = false;
    }
}

window.submitHomeVisit = async function (isAutoSave = false) {
    if (isReadOnly) {
        if (!isAutoSave) Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');
        return;
    }
    if (isSubmitting) return;
    const studentId = currentStudentId;
    const classroomId = window.currentClassroomId;
    if (!studentId || !classroomId) {
        if (!isAutoSave) Swal.fire('ผิดพลาด', 'กรุณาเลือกห้องเรียนและนักเรียน', 'warning');
        return;
    }
    isSubmitting = true;
    try {
        if (!isAutoSave) {
            Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }
        const formData = buildFormData(studentId, classroomId);
        const { data: existingRecords, error: selectError } = await db
            .from('module_home_visits')
            .select('id')
            .eq('student_id', studentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);
        if (selectError) throw selectError;
        const existingRow = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;
        let savedData, saveError;
        if (existingRow) {
            const { data, error } = await db.from('module_home_visits').update(formData).eq('id', existingRow.id).select('id');
            savedData = data; saveError = error;
        } else {
            const { data, error } = await db.from('module_home_visits').insert([formData]).select('id');
            savedData = data; saveError = error;
        }
        if (saveError) throw saveError;
        if (!savedData || savedData.length === 0) throw new Error('บันทึกไม่สำเร็จ — ระบบไม่ได้รับยืนยันการบันทึก กรุณาตรวจสอบสิทธิ์');
        formIsDirty = false;
        if (!isAutoSave) {
            await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกข้อมูลการเยี่ยมบ้านเรียบร้อย', confirmButtonText: 'ตกลง' });
            goToStep(1);
            updateStatusBadge('completed');
            if (currentStudentId) {
                await loadExistingHomeVisit(currentStudentId);
            }
            if (typeof loadDataTable === 'function') loadDataTable();
        }
    } catch (err) {
        console.error('HomeVisit Save Error:', err);
        if (!isAutoSave) {
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    } finally {
        isSubmitting = false;
    }
};

// ==========================================
// จบส่วน core
// ==========================================
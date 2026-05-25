// ==========================================
// homevisit.js (ฉบับแก้ไข) 24/5/2026 - ปรับปรุงโค้ดให้รองรับการนำเข้า Excel สำหรับทั้งห้องเรียน
// ==========================================

let currentUser = null;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_url: "", gd_pdf_folder_id: "", report_template_id: "" };
let map, marker;
let studentTomSelect = null;
let tsClassroom = null;
let currentYear = '';
let currentTerm = '';
let currentStudentId = null;
window.currentClassroomId = null;

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
    'รหัสนักเรียน', 'ชื่อ-นามสกุล',          // ✅ เพิ่มคอลัมน์ชื่อ-นามสกุล
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

// Mapping จากหัวคอลัมน์ภาษาไทย → ชื่อฟิลด์ภาษาอังกฤษ (ใช้ใน populateFormFromTemplate)
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
// 1. Init
// ==========================================
$(document).ready(async () => {
    try {
        initPlugins();
        await checkAuth();
        await loadModuleSettings();
        initAllTomSelects();

        // Listener สำหรับ report-scope (อยู่ในแท็บ report แล้ว)
        const reportScope = document.getElementById('report-scope');
        if (reportScope) {
            reportScope.addEventListener('change', function () {
                const gradeSel = document.getElementById('grade-select-container');
                if (this.value === 'grade') gradeSel.classList.remove('hidden');
                else gradeSel.classList.add('hidden');
                loadReport();
            });
        }

        // ✅ Listener สำหรับการนำเข้า Excel ทั้งห้อง
        const importClassroomInput = document.getElementById('importClassroomFileInput');
        if (importClassroomInput) {
            importClassroomInput.addEventListener('change', async function (event) {
                const file = event.target.files[0];
                if (!file) return;

                Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

                try {
                    const data = new Uint8Array(await file.arrayBuffer());
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                    if (rows.length < 2) throw new Error('ไฟล์ต้องมีอย่างน้อยหัวคอลัมน์และข้อมูล 1 แถว');

                    const headers = rows[0];
                    const dataRows = rows.slice(1);

                    const classroomId = window.currentClassroomId;
                    if (!classroomId) throw new Error('ไม่ได้เลือกห้องเรียน');

                    const { data: enrolls } = await db.from('student_enrollments')
                        .select('student_id, core_students(student_id_card)')
                        .eq('classroom_id', classroomId);

                    const studentMap = {};
                    (enrolls || []).forEach(e => {
                        if (e.core_students?.student_id_card) {
                            studentMap[e.core_students.student_id_card] = e.student_id;
                        }
                    });

                    let successCount = 0, notFoundCount = 0, errorCount = 0;
                    for (const row of dataRows) {
                        const studentIdCard = String(row[headers.indexOf('รหัสนักเรียน')] || '').trim();
                        if (!studentIdCard) continue;

                        const hasData = row.some((cell, idx) => idx !== headers.indexOf('รหัสนักเรียน') && cell.toString().trim() !== '');
                        if (!hasData) continue;

                        const studentId = studentMap[studentIdCard];
                        if (!studentId) { notFoundCount++; continue; }

                        const formData = buildVisitDataFromRow(headers, row, studentId, classroomId);
                        if (!formData) continue;

                        try {
                            const { data: existing } = await db.from('module_home_visits')
                                .select('id').eq('student_id', studentId)
                                .eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();

                            let resError;
                            if (existing) {
                                const { error } = await db.from('module_home_visits').update(formData).eq('id', existing.id);
                                resError = error;
                            } else {
                                const { error } = await db.from('module_home_visits').insert([formData]);
                                resError = error;
                            }
                            if (resError) throw resError;
                            successCount++;
                        } catch (err) {
                            console.error(`Error for ${studentIdCard}:`, err);
                            errorCount++;
                        }
                    }

                    Swal.fire('นำเข้าเสร็จสิ้น', `สำเร็จ ${successCount} คน, ไม่พบรหัสนักเรียน ${notFoundCount} คน, ผิดพลาด ${errorCount} คน`, 'success');
                    loadDataTable();
                } catch (err) {
                    Swal.fire('ผิดพลาด', 'ไม่สามารถนำเข้าได้: ' + err.message, 'error');
                    console.error(err);
                }
            });
        }

    } catch (err) {
        console.error('Initialization error:', err);
    }
});

function queryTimeout(promise, label = '', ms = 15000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`เชื่อมต่อฐานข้อมูลช้าเกินไป [${label}]`)), ms))
    ]);
}

// ==========================================
// 2. Auth & Role
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return window.location.replace('login.html');

        const [{ data: profile }, { data: sInfo }] = await Promise.all([
            db.from('core_personnel').select('*').eq('id', session.user.id).single(),
            db.from('core_school_info').select('current_academic_year, current_semester').single()
        ]);
        if (!profile) return window.location.replace('login.html');
        currentUser = profile;
        actualRole = profile.role;

        if (sInfo) {
            currentYear = sInfo.current_academic_year;
            currentTerm = sInfo.current_semester;
            const termDisplay = document.getElementById('term-display');
            if (termDisplay) termDisplay.innerText = `${currentTerm}/${currentYear}`;
        }

        const [{ data: modAdmin }, { data: discHeadData }, { data: gradeHead }] = await Promise.all([
            db.from('core_module_admins').select('id').eq('user_id', currentUser.id).eq('module_id', 'homevisit').maybeSingle(),
            currentYear ? db.from('core_discipline_heads').select('id').eq('personnel_id', currentUser.id).eq('academic_year', currentYear).maybeSingle() : Promise.resolve({ data: null }),
            db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).maybeSingle()
        ]);

        if (actualRole === 'super_admin') {
            currentViewRole = 'super_admin';
            document.getElementById('admin-settings-btn')?.classList.remove('hidden');
        } else if (modAdmin) {
            currentViewRole = 'module_admin';
        } else if (discHeadData) {
            currentViewRole = 'head_discipline';
            isReadOnly = true;
        } else if (gradeHead) {
            currentViewRole = 'head_grade';
            isReadOnly = true;
        } else {
            currentViewRole = 'teacher';
        }

        if (actualRole !== 'teacher') document.getElementById('btnAdminMode')?.classList.remove('hidden');
        updateUIByRole();
        await loadClassrooms();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        Swal.close();
    } catch (error) {
        console.error("Auth Error:", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถยืนยันตัวตนได้', 'error');
    }
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
        submitBtn.classList.toggle('cursor-not-allowed', isReadOnly);
    }
    const uploadBtns = document.querySelectorAll('.upload-btn');
    uploadBtns.forEach(btn => {
        btn.disabled = isReadOnly;
        btn.classList.toggle('opacity-50', isReadOnly);
    });
}

window.toggleRoleView = function () {
    if (actualRole === 'teacher') return;
    currentViewRole = (currentViewRole === 'teacher') ? actualRole : 'teacher';
    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);
    const btn = document.getElementById('btnAdminMode');
    if (btn) {
        btn.innerHTML = currentViewRole === 'teacher' ? '<i class="fas fa-sync-alt mr-1"></i> โหมดแอดมิน' : '<i class="fas fa-sync-alt mr-1"></i> โหมดครู';
    }
    updateUIByRole();
    loadClassrooms();
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `สลับเป็น${currentViewRole === 'teacher' ? 'โหมดครูที่ปรึกษา' : 'โหมดผู้ดูแล'}`, showConfirmButton: false, timer: 2000 });
};

// ==========================================
// 3. Load Classrooms
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
            onChange: (val) => { if (val) loadStudentInfo(val); else clearStudentInfo(); }
        });
    } catch (err) {
        console.error(err);
    }
}

async function loadStudentInfo(studentId) {
    // ✅ เคลียร์ฟอร์มก่อนโหลดข้อมูลนักเรียนใหม่
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

    await loadExistingHomeVisit(studentId);
    Swal.close();
}

function clearStudentInfo() {
    currentStudentId = null;

    // เคลียร์ฟิลด์ทั่วไป
    ['student_code', 'student_fullname', 'student_grade', 'student_number'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // เคลียร์ TomSelect ทั้งหมด
    const tomInstances = ['tomLivingWith', 'tomParentsStatus', 'tomHouseType', 'tomTravelMethod',
        'tomEnvHouseStatus', 'tomEnvCleanStatus', 'tomEnvLocationStatus',
        'tomInformantType', 'tomFamilyRelationStatus', 'tomLeaveWithWhom', 'tomAllowanceSource'];
    tomInstances.forEach(inst => {
        if (window[inst]) window[inst].setValue('');
    });

    // เคลียร์ radio ทั่วไป (visit_status, utility_*, internet_access)
    const radioGroups = ['visit_status', 'utility_electric', 'utility_water', 'utility_toilet', 'internet_access'];
    radioGroups.forEach(group => {
        const radios = document.querySelectorAll(`input[name="${group}"]`);
        radios.forEach(radio => radio.checked = false);
        // ตั้งค่า default สำหรับ visit_status
        if (group === 'visit_status') {
            const defaultRadio = document.querySelector(`input[name="visit_status"][value="เยี่ยมแล้ว"]`);
            if (defaultRadio) defaultRadio.checked = true;
        }
    });

    // เคลียร์ตารางความสัมพันธ์ (relations radio)
    for (let i = 0; i < 6; i++) {
        const radios = document.querySelectorAll(`input[name="rel_radio_${i}"]`);
        radios.forEach(radio => radio.checked = false);
        const defaultRadio = document.querySelector(`input[name="rel_radio_${i}"][value="ไม่มี"]`);
        if (defaultRadio) defaultRadio.checked = true;
    }

    // เคลียร์ checkbox ความเสี่ยงทั้งหมด
    const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
    riskGroups.forEach(group => {
        document.querySelectorAll(`input[name="risk_${group}"]`).forEach(cb => cb.checked = false);
        const otherInput = document.getElementById(`risk_${group}_other_txt`);
        if (otherInput) {
            otherInput.value = '';
            otherInput.classList.add('hidden');
        }
    });

    // เคลียร์รูปภาพทั้งหมด
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
        }
        const delBtn = document.getElementById(p.delBtnId);
        if (delBtn) delBtn.classList.add('hidden');
        const cloudBtn = document.getElementById(p.cloudBtnId);
        if (cloudBtn) {
            cloudBtn.disabled = true;
            cloudBtn.classList.add('opacity-40');
            cloudBtn.classList.remove('bg-slate-700');
            cloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้';
        }
    });

    // เคลียร์ฟิลด์ข้อความทั้งหมด
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

    // รีเซ็ตค่าเริ่มต้นบางตัว
    const defaultDate = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById('hv_date');
    if (dateInput) dateInput.value = defaultDate;
    const timesInput = document.getElementById('visit_times');
    if (timesInput) timesInput.value = '1';

    // เคลียร์พิกัดและแผนที่
    if (map && marker) {
        const defaultLat = 13.740195920850455;
        const defaultLng = 100.2598792489264;
        marker.setLatLng([defaultLat, defaultLng]);
        map.setView([defaultLat, defaultLng], 15);
    }
}

async function loadExistingHomeVisit(studentId) {
    const { data, error } = await db.from('module_home_visits')
        .select('*').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();
    if (data && !error) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'พบข้อมูลเยี่ยมบ้านเดิม ระบบทำการโหลดให้แล้ว', showConfirmButton: false, timer: 3000 });
        populateFormWithData(data);
    }
}

// ==========================================
// ภาค 2/3: Submit, Upload, Map, Step Navigator, Admin Modal
// ==========================================
function populateFormWithData(data) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setRadio = (name, val) => { const el = document.querySelector(`input[name="${name}"][value="${val}"]`); if (el) el.checked = true; };

    // ข้อมูลพื้นฐาน
    setVal('hv_date', data.visit_date || new Date().toISOString().slice(0, 10));
    setRadio('visit_status', data.visit_status || 'เยี่ยมแล้ว');
    setVal('visit_times', data.visit_times || 1);
    setVal('student_nickname', data.student_nickname || '');
    setVal('student_phone', data.student_phone || '');
    setVal('student_line', data.student_line || '');
    setVal('father_name', data.father_name || ''); setVal('father_job', data.father_job || ''); setVal('father_phone', data.father_phone || '');
    setVal('mother_name', data.mother_name || ''); setVal('mother_job', data.mother_job || ''); setVal('mother_phone', data.mother_phone || '');
    setVal('guardian_name', data.guardian_name || ''); setVal('guardian_job', data.guardian_job || ''); setVal('guardian_phone', data.guardian_phone || '');
    setVal('guardian_relation', data.guardian_relation || '');

    if (window.tomLivingWith) window.tomLivingWith.setValue(data.living_with || '');
    if (window.tomParentsStatus) window.tomParentsStatus.setValue(data.parents_status || '');

    // ที่อยู่
    setVal('addr_house', data.house_number || ''); setVal('addr_moo', data.village_no || '');
    setVal('addr_subdistrict', data.sub_district || '');
    setVal('addr_district', data.district || '');
    setVal('addr_province', data.province || '');
    setVal('addr_zipcode', data.zipcode || '');
    setVal('travel_distance', data.travel_distance || '');
    setVal('travel_hour', data.travel_hour || 0);
    setVal('travel_minute', data.travel_minute || 0);

    // TomSelect อื่น ๆ
    if (window.tomHouseType) window.tomHouseType.setValue(data.house_type || '');
    if (window.tomTravelMethod) window.tomTravelMethod.setValue(data.travel_method || '');
    if (window.tomEnvHouseStatus) window.tomEnvHouseStatus.setValue(data.env_house_status || '');
    if (window.tomEnvCleanStatus) window.tomEnvCleanStatus.setValue(data.env_clean_status || '');
    if (window.tomEnvLocationStatus) window.tomEnvLocationStatus.setValue(data.env_location_status || '');
    if (window.tomInformantType) window.tomInformantType.setValue(data.informant_type || '');
    if (window.tomFamilyRelationStatus) window.tomFamilyRelationStatus.setValue((data.family_relations || {}).status || '');
    if (window.tomLeaveWithWhom) window.tomLeaveWithWhom.setValue(data.leave_with_whom_details || '');
    if (window.tomAllowanceSource) window.tomAllowanceSource.setValue((data.economic_data || {}).allowance_source || '');

    // Radio สาธารณูปโภค
    ['utility_electric', 'utility_water', 'utility_toilet'].forEach(util => setRadio(util, data[util]));

    // จำนวนสมาชิก
    if (data.family_members) {
        setVal('member_total', data.family_members.total);
        setVal('member_male', data.family_members.male);
        setVal('member_female', data.family_members.female);
        setVal('sib_same_total', data.family_members.sib_same_total);
        setVal('sib_same_male', data.family_members.sib_same_male);
        setVal('sib_same_female', data.family_members.sib_same_female);
        setVal('sib_diff_total', data.family_members.sib_diff_total);
        setVal('sib_diff_male', data.family_members.sib_diff_male);
        setVal('sib_diff_female', data.family_members.sib_diff_female);
    }

    // เศรษฐกิจ
    if (data.economic_data) {
        setVal('family_income_monthly', data.economic_data.income);
        setVal('student_job_name', data.economic_data.student_job_name);
        setVal('student_job_income', data.economic_data.student_job_income);
        setVal('money_to_school', data.economic_data.money_to_school);
    }

    // เวลาอยู่ร่วมกัน
    setVal('time_together_hours', (data.family_relations || {}).time_together || '');

    // ข้อความเพิ่มเติม
    setVal('special_help_details', data.special_help_details || '');
    setVal('responsibilities_details', data.responsibilities_details || '');
    setVal('hobbies_details', data.hobbies_details || '');
    setVal('guardian_concerns_details', data.guardian_concerns || '');
    setVal('guardian_requests_details', data.guardian_requests || '');
    setVal('past_welfare_details', data.past_welfare || '');

    // ---------- 1. RESTORE ความสัมพันธ์ในครอบครัว (Radio Table) ----------
    if (data.relations_data && Array.isArray(data.relations_data)) {
        const relatives = ['บิดา', 'มารดา', 'พี่ชาย/น้องชาย', 'พี่สาว/น้องสาว', 'ปู่/ย่า/ตา/ยาย', 'ญาติ'];
        data.relations_data.forEach((rel, idx) => {
            const index = relatives.indexOf(rel.relative);
            if (index !== -1 && rel.relation) {
                const radio = document.querySelector(`input[name="rel_radio_${index}"][value="${rel.relation}"]`);
                if (radio) radio.checked = true;
            }
        });
    }

    // ---------- 2. RESTORE ความเสี่ยง (Checkboxes) ----------
    if (data.risk_data) {
        const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
        riskGroups.forEach(group => {
            const values = data.risk_data[group] || [];
            // ยกเลิกการเลือกทั้งหมดก่อน
            document.querySelectorAll(`input[name="risk_${group}"]`).forEach(cb => cb.checked = false);
            values.forEach(val => {
                // รองรับกรณี "อื่นๆ: ..."
                let pureVal = val;
                let otherText = '';
                if (val.startsWith('อื่นๆ:')) {
                    pureVal = 'อื่นๆ ระบุ...';
                    otherText = val.replace('อื่นๆ:', '').trim();
                }
                const cb = document.querySelector(`input[name="risk_${group}"][value="${pureVal}"]`);
                if (cb) {
                    cb.checked = true;
                    if (pureVal === 'อื่นๆ ระบุ...') {
                        const otherInput = document.getElementById(`risk_${group}_other_txt`);
                        if (otherInput) {
                            otherInput.value = otherText;
                            otherInput.classList.remove('hidden');
                        }
                    }
                }
            });
        });
        // Internet access (radio)
        if (data.risk_data.internet_access) {
            setRadio('internet_access', data.risk_data.internet_access);
        }
    }

    // ---------- 3. RESTORE รูปภาพ ----------
    const restorePhoto = (url, inputId, previewId, cloudBtnId) => {
        if (url) {
            const img = document.getElementById(previewId);
            if (img) {
                img.src = url;
                img.classList.remove('hidden');
            }
            const fileInput = document.getElementById(inputId);
            if (fileInput) fileInput.dataset.uploadedUrl = url;
            const cloudBtn = document.getElementById(cloudBtnId);
            if (cloudBtn) {
                cloudBtn.disabled = false;
                cloudBtn.classList.remove('opacity-40');
                cloudBtn.innerHTML = '<i class="fa-solid fa-check text-green-400"></i> อัพโหลดสำเร็จ';
                cloudBtn.classList.add('bg-slate-700');
            }
            const delBtn = document.getElementById(`del_${cloudBtnId.split('_')[1]}`);
            if (delBtn) delBtn.classList.remove('hidden');
        }
    };
    restorePhoto(data.photo_student, 'pic_student', 'preview1', 'cloud_btn1');
    restorePhoto(data.photo_outside, 'pic_outside', 'preview2', 'cloud_btn2');
    restorePhoto(data.photo_inside, 'pic_inside', 'preview3', 'cloud_btn3');
    restorePhoto(data.photo_teacher, 'pic_teacher', 'preview4', 'cloud_btn4');

    // ---------- 4. RESTORE พิกัด (Lat/Lng) ----------
    if (data.latitude && data.longitude) {
        setVal('lat', data.latitude);
        setVal('lng', data.longitude);
        // อัปเดตแผนที่ถ้ามีการสร้างแล้ว (ถ้ายังไม่มี marker ให้เก็บค่าไว้ initMap จะอ่านจาก input)
        if (map && marker) {
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 15);
        }
    }
}

window.submitHomeVisit = async function () {
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

    const studentId = document.getElementById('hv_student').value;
    const classroomId = window.currentClassroomId;
    if (!studentId || !classroomId) return Swal.fire('ผิดพลาด', 'กรุณาเลือกห้องเรียนและนักเรียน', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

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

    const formData = {
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

    try {
        const { data: existing } = await db.from('module_home_visits')
            .select('id').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();
        let resError;
        if (existing) {
            const { error } = await db.from('module_home_visits').update(formData).eq('id', existing.id);
            resError = error;
        } else {
            const { error } = await db.from('module_home_visits').insert([formData]);
            resError = error;
        }
        if (resError) throw resError;
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลการเยี่ยมบ้านเรียบร้อย', 'success');
        goToStep(1);
        updateStatusBadge('completed');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

window.triggerSingleUpload = async function (event, inputId, type) {
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');
    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files[0];
    const studentId = document.getElementById('hv_student')?.value;
    if (!file || !studentId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนและไฟล์รูปภาพก่อนครับ', 'warning');
    const btn = event.currentTarget;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัพโหลด...`;
    btn.disabled = true;
    try {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            const response = await fetch(moduleSettings.gas_url, {
                method: "POST",
                body: JSON.stringify({ action: 'upload', base64, fileName: `HV_${studentId}_${type}.jpg`, folderId: moduleSettings.drive_folder_id }),
            });
            const res = await response.json();
            fileInput.dataset.uploadedUrl = res.url;
            btn.innerHTML = `<i class="fa-solid fa-check text-green-400"></i> อัพโหลดสำเร็จ`;
            btn.classList.replace('bg-green-600', 'bg-slate-700');
        };
        reader.readAsDataURL(file);
    } catch (err) {
        btn.innerHTML = 'อัพโหลดรูปนี้';
        btn.disabled = false;
        Swal.fire('Error', 'ไม่สามารถอัพโหลดได้: ' + err.message, 'error');
    }
};

// ==========================================
// Step Navigation & Map
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
    if (step === 2) setTimeout(initMap, 200);
};

window.nextStep = function (step) {
    if (step === 2 && !document.getElementById('hv_student')?.value) {
        return Swal.fire('ผิดพลาด', 'กรุณาเลือกนักเรียนก่อนครับ', 'warning');
    }
    goToStep(step);
};
window.prevStep = function (step) { goToStep(step); };

function initPlugins() {
    if (document.getElementById('hv_date')) {
        flatpickr("#hv_date", { locale: "th", dateFormat: "Y-m-d", defaultDate: "today" });
    }

    $.Thailand({
        database: 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/database/db.json',
        $district: $('#addr_subdistrict'),
        $amphoe: $('#addr_district'),
        $province: $('#addr_province'),
        $zipcode: $('#addr_zipcode'),
    });
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    if (map) { map.invalidateSize(); return; }
    map = L.map('map').setView([13.740195920850455, 100.2598792489264], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([13.740195920850455, 100.2598792489264], { draggable: true }).addTo(map);
    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(7);
        document.getElementById('lng').value = pos.lng.toFixed(7);
    });

    $('#lat, #lng').off('input').on('input', function () {
        const lat = parseFloat($('#lat').val());
        const lng = parseFloat($('#lng').val());
        if (!isNaN(lat) && !isNaN(lng) && marker) {
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], map.getZoom());
        }
    });

    // ✅ เพิ่มส่วนนี้: ดึงค่าพิกัดจาก input (ถ้ามี) มาปักหมุด
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    if (latInput && lngInput && latInput.value && lngInput.value) {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 15);
        }
    }
}

window.updateMarkerFromInputs = function () {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    if (isNaN(lat) || isNaN(lng)) return;
    if (map && marker) {
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], map.getZoom());
    }
};

window.geocodeAddress = function () {
    const house = document.getElementById('addr_house').value;
    const subdistrict = document.getElementById('addr_subdistrict').value;
    const district = document.getElementById('addr_district').value;
    const province = document.getElementById('addr_province').value;
    const address = `${house}, ${subdistrict}, ${district}, ${province}, Thailand`;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(res => res.json())
        .then(data => {
            if (data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                document.getElementById('lat').value = lat.toFixed(7);
                document.getElementById('lng').value = lng.toFixed(7);
                if (map && marker) {
                    marker.setLatLng([lat, lng]);
                    map.setView([lat, lng], 16);
                }
            } else {
                Swal.fire('ไม่พบ', 'ไม่พบพิกัดจากที่อยู่นี้', 'warning');
            }
        });
};

function parseGoogleMapsUrl(url) {
    let match = url.match(/@([-\d.]+),([-\d.]+),\d+z/i);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    match = url.match(/!3d([-\d.]+)!4d([-\d.]+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    match = url.match(/[?&]q=(loc:)?([-\d.]+),([-\d.]+)/);
    if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[3]) };

    return null;
}

window.parseAndPinCoords = function () {
    const raw = document.getElementById('coord-input').value.trim();
    if (!raw) return Swal.fire('กรุณาวางพิกัด', 'คัดลอกพิกัดจาก Google Maps แล้ววางในช่อง', 'warning');

    const parts = raw.split(/[\s,]+/).filter(p => p);
    if (parts.length < 2) return Swal.fire('รูปแบบไม่ถูกต้อง', 'ตัวอย่างรูปแบบที่ถูกต้อง: 13.7389, 100.2595', 'warning');

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return Swal.fire('รูปแบบไม่ถูกต้อง', 'พบตัวเลขพิกัดไม่สมบูรณ์', 'warning');

    document.getElementById('lat').value = lat.toFixed(7);
    document.getElementById('lng').value = lng.toFixed(7);

    if (map && marker) {
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 16);
    }
    Swal.fire('ปักหมุดแล้ว', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'success');
};

window.openInGoogleMaps = function () {
    const house = document.getElementById('addr_house').value;
    const subdistrict = document.getElementById('addr_subdistrict').value;
    const district = document.getElementById('addr_district').value;
    const province = document.getElementById('addr_province').value;
    const address = `${house}, ${subdistrict}, ${district}, ${province}, Thailand`;
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
};

window.syncGuardianData = function (role) {
    const isFather = (role === 'father');
    const getVal = id => document.getElementById(id) ? document.getElementById(id).value : '';
    const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).value = val; };
    setVal('guardian_name', getVal(isFather ? 'father_name' : 'mother_name'));
    setVal('guardian_job', getVal(isFather ? 'father_job' : 'mother_job'));
    setVal('guardian_phone', getVal(isFather ? 'father_phone' : 'mother_phone'));
    setVal('guardian_relation', isFather ? 'บิดา' : 'มารดา');
};

window.calcFemaleCount = function (prefix) {
    const total = parseInt(document.getElementById(`${prefix}_total`)?.value) || 0;
    const male = parseInt(document.getElementById(`${prefix}_male`)?.value) || 0;
    const femaleEl = document.getElementById(`${prefix}_female`);
    if (femaleEl) femaleEl.value = (total - male) >= 0 ? (total - male) : 0;
};

// ==========================================
// Admin Modal
// ==========================================
async function loadModuleSettings() {
    const { data } = await db.from('core_system_modules').select('*').eq('module_id', 'homevisit').single();
    if (data?.settings) {
        moduleSettings = {
            gas_url: data.settings.gas_url || "",
            drive_folder_id: data.settings.drive_folder_id || "",
            pdf_api_url: data.settings.pdf_api_url || "",
            slide_template_url: data.settings.slide_template_url || "",
            gd_pdf_folder_id: data.settings.gd_pdf_folder_id || "",
            report_template_id: data.settings.report_template_id || ""
        };
    }
}

window.openAdminModal = async function () {
    document.getElementById('admin-modal').classList.remove('hidden');
    await loadAdminSettings();
};

function closeAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function loadAdminSettings() {
    await loadModuleSettings();
    document.getElementById('set-gas-url').value = moduleSettings.gas_url;
    document.getElementById('set-drive-folder-id').value = moduleSettings.drive_folder_id;
    document.getElementById('set-pdf-api-url').value = moduleSettings.pdf_api_url;
    document.getElementById('set-slide-id').value = moduleSettings.slide_template_url;
    document.getElementById('set-pdf-folder-id').value = moduleSettings.gd_pdf_folder_id;
    const reportTemplateEl = document.getElementById('set-report-template-id');
    if (reportTemplateEl) reportTemplateEl.value = moduleSettings.report_template_id;
    await Promise.all([loadTeachersForAppoint(), loadModuleAdminsList()]);
}

async function saveAdminSettings() {
    const payload = {
        gas_url: document.getElementById('set-gas-url').value.trim(),
        drive_folder_id: document.getElementById('set-drive-folder-id').value.trim(),
        pdf_api_url: document.getElementById('set-pdf-api-url').value.trim(),
        slide_template_url: document.getElementById('set-slide-id').value.trim(),
        gd_pdf_folder_id: document.getElementById('set-pdf-folder-id').value.trim(),
        report_template_id: document.getElementById('set-report-template-id')?.value.trim() || ""
    };
    const { error } = await db.from('core_system_modules').update({ settings: payload }).eq('module_id', 'homevisit');
    if (error) return Swal.fire('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
    moduleSettings = payload;
    Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
    closeAdminModal();
}

async function loadTeachersForAppoint() {
    const { data } = await db.from('core_personnel').select('id, first_name, last_name').order('first_name');
    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาชื่อครู --</option>';
    if (data) data.forEach(t => select.innerHTML += `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`);
    if (window.tsTeacherAppoint) window.tsTeacherAppoint.destroy();
    window.tsTeacherAppoint = new TomSelect("#select-teacher-appoint", { create: false, placeholder: "ค้นหาชื่อครู..." });
}

async function loadModuleAdminsList() {
    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400">กำลังโหลด...</td></tr>';
    const { data } = await db.from('core_module_admins')
        .select('id, core_personnel (id, first_name, last_name)')
        .eq('module_id', 'homevisit');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400 text-xs">ยังไม่มีการแต่งตั้งผู้ดูแลระบบ</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(admin => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 font-bold text-slate-700 flex items-center gap-2">
                <div class="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px]"><i class="fas fa-user-shield"></i></div>
                ${admin.core_personnel.first_name} ${admin.core_personnel.last_name}
             </td>
            <td class="py-3 px-4 text-center">
                <button onclick="removeModuleAdmin('${admin.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
             </td>
        </tr>`).join('');
}

window.appointModuleAdmin = async function () {
    const teacherId = document.getElementById('select-teacher-appoint').value;
    if (!teacherId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชื่อครู', 'warning');
    const { error } = await db.from('core_module_admins').insert({ user_id: teacherId, module_id: 'homevisit' });
    if (error) {
        if (error.code === '23505') return Swal.fire('แจ้งเตือน', 'ครูท่านนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }
    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'แต่งตั้งแอดมินโมดูลเรียบร้อย', timer: 1500, showConfirmButton: false });
    window.tsTeacherAppoint?.clear();
    loadModuleAdminsList();
};

window.removeModuleAdmin = async function (recordId) {
    const result = await Swal.fire({
        title: 'ยืนยันการปลดสิทธิ์?', text: "ครูท่านนี้จะกลับไปเห็นข้อมูลเฉพาะห้องประจำชั้นของตนเอง",
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ปลดสิทธิ์'
    });
    if (result.isConfirmed) {
        await db.from('core_module_admins').delete().eq('id', recordId);
        Swal.fire({ icon: 'success', title: 'ปลดสิทธิ์เรียบร้อย', timer: 1500, showConfirmButton: false });
        loadModuleAdminsList();
    }
};

// ==========================================
// ภาค 3/3: DataTable, Dashboard, Export, PDF, TomSelect Init, Helpers
// ==========================================

let personnelCache = null;
async function getPersonnelMap() {
    if (personnelCache) return personnelCache;
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name');
    personnelCache = {};
    (data || []).forEach(p => { if (p?.id) personnelCache[p.id] = `${p.prefix || ''}${p.first_name} ${p.last_name}`; });
    return personnelCache;
}

window.loadDataTable = async function () {
    const isTeacher = (currentViewRole === 'teacher');
    const classSummaryTable = document.getElementById('class-table-container');
    const teacherTableContainer = document.getElementById('teacher-table-container');
    const exportBtn = document.querySelector('#tab-data button.bg-emerald-50');

    if (isTeacher) {
        classSummaryTable.classList.add('hidden');
        teacherTableContainer.classList.remove('hidden');
        if (exportBtn) exportBtn.style.display = 'none';
    } else {
        classSummaryTable.classList.remove('hidden');
        teacherTableContainer.classList.add('hidden');
        if (exportBtn) exportBtn.style.display = '';
    }

    if (!isTeacher) {
        const tbody = document.getElementById('tb-class-summary');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';
        try {
            let classQuery = db.from('core_classrooms')
                .select('*')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .order('grade_level').order('room_number');
            if (currentViewRole === 'head_grade') {
                const { data: gh } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).single();
                if (gh) classQuery = classQuery.eq('grade_level', gh.grade_level);
                else classQuery = classQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }

            const [{ data: classrooms }, { data: visits }, staffMap] = await Promise.all([
                classQuery,
                db.from('module_home_visits')
                    .select('classroom_id, student_id')
                    .eq('academic_year', currentYear)
                    .eq('semester', currentTerm),
                getPersonnelMap()
            ]);

            if (!classrooms || classrooms.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">ไม่พบห้องเรียน</td></tr>';
                renderDashboard(0, 0);
                return;
            }
            const { data: enrolls } = await db.from('student_enrollments')
                .select('classroom_id, student_id')
                .in('classroom_id', classrooms.map(c => c.id));
            const totalMap = {}, visitedMap = {};
            (enrolls || []).forEach(e => { totalMap[e.classroom_id] = (totalMap[e.classroom_id] || 0) + 1; });
            (visits || []).forEach(v => { visitedMap[v.classroom_id] = (visitedMap[v.classroom_id] || 0) + 1; });

            let doneCount = 0;
            tbody.innerHTML = classrooms.map(c => {
                const room = `ม.${c.grade_level}/${c.room_number}`;
                const adv1 = staffMap[c.adviser_id_1] || '-';
                const adv2 = staffMap[c.adviser_id_2] || '-';
                const total = totalMap[c.id] || 0;
                const visited = visitedMap[c.id] || 0;
                const status = total === 0 ? 'ไม่มีนักเรียน' : (visited >= total ? 'ครบถ้วน' : 'ยังไม่ครบ');
                if (status === 'ครบถ้วน') doneCount++;
                return `<tr>
                    <td class="py-3 px-4 font-black">${room}</td>
                    <td class="py-3 px-4">${adv1}</td>
                    <td class="py-3 px-4">${adv2}</td>
                    <td class="py-3 px-4 text-center">${total}</td>
                    <td class="py-3 px-4 text-center">${visited}</td>
                    <td class="py-3 px-4 text-center"><span class="px-3 py-1 rounded-xl text-[10px] font-black uppercase ${status === 'ครบถ้วน' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${status}</span></td>
                    <td class="py-3 px-4 text-right"><button onclick="editFromTable('${c.id}')" class="text-blue-500 hover:text-blue-700 p-2"><i class="fas fa-edit"></i></button></td>
                </tr>`;
            }).join('');
            renderDashboard(classrooms.length, doneCount, false);
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500">เกิดข้อผิดพลาด</td></tr>';
        }
        return;
    }

    const classroomId = window.currentClassroomId;
    const tbody = document.getElementById('tb-teacher-students');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        if (!classroomId) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียนในแท็บฟอร์มก่อน</td></tr>';
            renderDashboard(0, 0, true);
            return;
        }

        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id, student_number, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('classroom_id', classroomId)
            .order('student_number');

        if (!enrolls || enrolls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">ไม่มีนักเรียนในห้องนี้</td></tr>';
            return;
        }

        const studentIds = enrolls.map(e => e.student_id);
        const { data: visits } = await db.from('module_home_visits')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        tbody.innerHTML = enrolls.map(e => {
            const s = e.core_students;
            const visit = visitMap[s.id] || null;
            const isVisited = !!visit;
            const statusHtml = isVisited
                ? '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase">เยี่ยมแล้ว</span>'
                : '<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase">ยังไม่เยี่ยม</span>';

            let actions = '';
            if (visit) {
                actions += `<button onclick="editStudentVisit('${visit.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="แก้ไข"><i class="fas fa-edit"></i></button>`;
                actions += `<button onclick="printPDF('${visit.id}')" class="text-green-500 hover:text-green-700 p-1" title="พิมพ์ PDF"><i class="fas fa-file-pdf"></i></button>`;
                if (visit.pdf_url) {
                    actions += `<a href="${visit.pdf_url}" target="_blank" class="text-sky-500 hover:text-sky-700 p-1" title="ดู PDF"><i class="fas fa-eye"></i></a>`;
                } else {
                    actions += `<span class="text-slate-300 p-1" title="ยังไม่มี PDF"><i class="fas fa-eye"></i></span>`;
                }
            } else {
                actions += `<button onclick="selectStudentForForm('${s.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="กรอกข้อมูล"><i class="fas fa-edit"></i></button>`;
            }
            return `<tr class="hover:bg-slate-50">
                <td class="py-3 px-4 text-center font-bold">${e.student_number || '-'}</td>
                <td class="py-3 px-4">${s.student_id_card || '-'}</td>
                <td class="py-3 px-4">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
                <td class="py-3 px-4">${visit ? visit.visit_date : '-'}</td>
                <td class="py-3 px-4 text-center">${visit ? visit.visit_times : '-'}</td>
                <td class="py-3 px-4 text-center">${statusHtml}</td>
                <td class="py-3 px-4 text-right whitespace-nowrap">${actions}</td>
            </tr>`;
        }).join('');

        const totalStudents = enrolls.length;
        const visitedCount = Object.keys(visitMap).length;
        renderDashboard(totalStudents, visitedCount, true);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500">เกิดข้อผิดพลาด</td></tr>';
    }
};

function renderDashboard(total, done, isTeacher = false) {
    const container = document.getElementById('dashboard-stats');
    if (!container) return;
    if (isTeacher) {
        container.innerHTML = `
            <div class="glass-card rounded-2xl p-5 border-l-4 border-blue-500">
                <h3 class="text-3xl font-black text-blue-700">${total}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">นักเรียนทั้งหมด</p>
            </div>
            <div class="glass-card rounded-2xl p-5 border-l-4 border-emerald-500">
                <h3 class="text-3xl font-black text-emerald-600">${done}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">เยี่ยมแล้ว</p>
            </div>
            <div class="glass-card rounded-2xl p-5 border-l-4 border-amber-500">
                <h3 class="text-3xl font-black text-amber-600">${total - done}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">รอการเยี่ยม</p>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="glass-card rounded-2xl p-5 border-l-4 border-blue-500">
                <h3 class="text-3xl font-black text-blue-700">${total}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">ห้องเรียนทั้งหมด</p>
            </div>
            <div class="glass-card rounded-2xl p-5 border-l-4 border-emerald-500">
                <h3 class="text-3xl font-black text-emerald-600">${done}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">บันทึกครบแล้ว</p>
            </div>
            <div class="glass-card rounded-2xl p-5 border-l-4 border-amber-500">
                <h3 class="text-3xl font-black text-amber-600">${total - done}</h3>
                <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">รอการเยี่ยม</p>
            </div>`;
    }
}

function editFromTable(classroomId) {
    tsClassroom.setValue(classroomId);
    switchTab('form');
}

function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (!badge || !text) return;
    if (status === 'completed') {
        badge.className = "px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-center border border-emerald-100";
        text.innerHTML = '<i class="fas fa-check-circle mr-1"></i> บันทึกข้อมูลแล้ว';
    } else {
        badge.className = "px-3 py-2 bg-amber-50 text-amber-600 rounded-xl text-center border border-amber-100";
        text.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> ยังไม่มีข้อมูล';
    }
}

// ส่งออกตาราง Excel ทั้งโรงเรียน
window.exportToExcel = async function () {
    Swal.fire({ title: 'กำลังส่งออก...', didOpen: () => Swal.showLoading() });
    const { data } = await db.from('module_home_visits')
        .select('*, student_enrollments( student_number, core_students(student_id_card, first_name, last_name), core_classrooms(grade_level, room_number) )')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm);

    if (!data?.length) return Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีบันทึกการเยี่ยมบ้าน', 'info');
    const rows = [['รหัส', 'ชื่อนักเรียน', 'ชั้น', 'วันที่เยี่ยม', 'ครั้งที่', 'ผู้ปกครอง', 'ผู้บันทึก']];
    data.forEach(v => {
        const st = v.student_enrollments?.core_students;
        const cls = v.student_enrollments?.core_classrooms;
        rows.push([
            st?.student_id_card || '-',
            `${st?.first_name || ''} ${st?.last_name || ''}`.trim(),
            cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
            v.visit_date || '-',
            v.visit_times || 1,
            v.guardian_name || '-',
            v.teacher_id || '-'
        ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HomeVisit');

    let fileName = `เยี่ยมบ้านนักเรียน-รวมทุกห้อง_เทอม${currentTerm}_${currentYear}`;
    if (currentViewRole === 'teacher' && window.currentClassroomId) {
        try {
            const { data: clsData } = await db.from('core_classrooms')
                .select('grade_level, room_number')
                .eq('id', window.currentClassroomId)
                .single();
            if (clsData) {
                fileName = `เยี่ยมบ้านนักเรียน-ชั้นม.${clsData.grade_level}-ห้อง${clsData.room_number}_เทอม${currentTerm}_${currentYear}`;
            }
        } catch (e) { /* fallback */ }
    }

    XLSX.writeFile(wb, `${fileName}.xlsx`);
    Swal.close();
};

// พิมพ์ PDF
window.printPDF = async function (visitId) {
    if (!moduleSettings.pdf_api_url || !moduleSettings.slide_template_url) {
        return Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนด PDF API URL และ Slide ID ในเมนูตั้งค่าระบบ', 'warning');
    }

    Swal.fire({ title: 'กำลังสร้าง PDF...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        // ดึงข้อมูล visit พร้อมข้อมูลนักเรียนและห้องเรียน
        const { data: visit, error } = await db.from('module_home_visits')
            .select('*, core_students(*), core_classrooms(*)')
            .eq('id', visitId).single();
        if (error) throw error;

        const student = visit.core_students;
        const classroom = visit.core_classrooms;

        // ฟังก์ชันช่วยแปลง array เป็น string สำหรับความเสี่ยง
        const formatRiskList = (riskArr) => (riskArr || []).join(', ');

        // ข้อมูลนักเรียน
        const studentFullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
        const studentIdCard = student.student_id_card || '-';

        // ที่อยู่แบบบรรทัดเดียว
        const fullAddress = `${visit.house_number || ''} ${visit.village_no || ''} ต.${visit.sub_district || ''} อ.${visit.district || ''} จ.${visit.province || ''} ${visit.zipcode || ''}`.trim();

        // ข้อมูลครอบครัว
        const family = visit.family_members || {};
        const economic = visit.economic_data || {};
        const relations = visit.family_relations || {};
        const risk = visit.risk_data || {};

        // เตรียม replacements
        const replacements = {
            // นักเรียน
            "{{STUDENT_NAME}}": studentFullName,
            "{{STUDENT_ID}}": studentIdCard,
            "{{STUDENT_NICKNAME}}": visit.student_nickname || '-',
            "{{STUDENT_PHONE}}": visit.student_phone || '-',
            "{{STUDENT_LINE}}": visit.student_line || '-',
            "{{CLASSROOM}}": classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-',
            "{{VISIT_DATE}}": visit.visit_date || '-',
            "{{VISIT_TIMES}}": visit.visit_times || '1',

            // บิดา มารดา ผู้ปกครอง
            "{{FATHER_NAME}}": visit.father_name || '-',
            "{{FATHER_JOB}}": visit.father_job || '-',
            "{{FATHER_PHONE}}": visit.father_phone || '-',
            "{{MOTHER_NAME}}": visit.mother_name || '-',
            "{{MOTHER_JOB}}": visit.mother_job || '-',
            "{{MOTHER_PHONE}}": visit.mother_phone || '-',
            "{{GUARDIAN_NAME}}": visit.guardian_name || '-',
            "{{GUARDIAN_JOB}}": visit.guardian_job || '-',
            "{{GUARDIAN_PHONE}}": visit.guardian_phone || '-',
            "{{GUARDIAN_RELATION}}": visit.guardian_relation || '-',
            "{{LIVING_WITH}}": visit.living_with || '-',
            "{{PARENTS_STATUS}}": visit.parents_status || '-',

            // ที่อยู่
            "{{ADDRESS}}": fullAddress,
            "{{HOUSE_NUMBER}}": visit.house_number || '',
            "{{VILLAGE_NO}}": visit.village_no || '',
            "{{SUB_DISTRICT}}": visit.sub_district || '',
            "{{DISTRICT}}": visit.district || '',
            "{{PROVINCE}}": visit.province || '',
            "{{ZIPCODE}}": visit.zipcode || '',
            "{{LATITUDE}}": visit.latitude || '',
            "{{LONGITUDE}}": visit.longitude || '',
            "{{TRAVEL_DISTANCE}}": visit.travel_distance || '',
            "{{HOUSE_TYPE}}": visit.house_type || '-',
            "{{TRAVEL_HOUR}}": visit.travel_hour || '0',
            "{{TRAVEL_MINUTE}}": visit.travel_minute || '0',
            "{{TRAVEL_METHOD}}": visit.travel_method || '-',

            // สภาพแวดล้อม
            "{{ENV_HOUSE_STATUS}}": visit.env_house_status || '-',
            "{{ENV_CLEAN_STATUS}}": visit.env_clean_status || '-',
            "{{ENV_LOCATION_STATUS}}": visit.env_location_status || '-',
            "{{UTILITY_ELECTRIC}}": visit.utility_electric || '-',
            "{{UTILITY_WATER}}": visit.utility_water || '-',
            "{{UTILITY_TOILET}}": visit.utility_toilet || '-',

            // ครอบครัว
            "{{FAMILY_TOTAL}}": family.total || '0',
            "{{FAMILY_MALE}}": family.male || '0',
            "{{FAMILY_FEMALE}}": family.female || '0',
            "{{SIB_SAME_TOTAL}}": family.sib_same_total || '0',
            "{{SIB_SAME_MALE}}": family.sib_same_male || '0',
            "{{SIB_SAME_FEMALE}}": family.sib_same_female || '0',
            "{{SIB_DIFF_TOTAL}}": family.sib_diff_total || '0',
            "{{SIB_DIFF_MALE}}": family.sib_diff_male || '0',
            "{{SIB_DIFF_FEMALE}}": family.sib_diff_female || '0',

            // เศรษฐกิจ
            "{{ECONOMIC_INCOME}}": economic.income || '0',
            "{{ALLOWANCE_SOURCE}}": economic.allowance_source || '-',
            "{{STUDENT_JOB_NAME}}": economic.student_job_name || '-',
            "{{STUDENT_JOB_INCOME}}": economic.student_job_income || '0',
            "{{MONEY_TO_SCHOOL}}": economic.money_to_school || '0',

            // ความสัมพันธ์ในครอบครัว
            "{{FAMILY_RELATIONS_STATUS}}": relations.status || '-',
            "{{TIME_TOGETHER_HOURS}}": relations.time_together || '0',

            // ข้อความเพิ่มเติม
            "{{SPECIAL_HELP_DETAILS}}": visit.special_help_details || '-',
            "{{RESPONSIBILITIES_DETAILS}}": visit.responsibilities_details || '-',
            "{{HOBBIES_DETAILS}}": visit.hobbies_details || '-',
            "{{LEAVE_WITH_WHOM}}": visit.leave_with_whom_details || '-',
            "{{GUARDIAN_CONCERNS}}": visit.guardian_concerns || '-',
            "{{GUARDIAN_REQUESTS}}": visit.guardian_requests || '-',
            "{{PAST_WELFARE}}": visit.past_welfare || '-',
            "{{INFORMANT_TYPE}}": visit.informant_type || '-',

            // ความเสี่ยง (รวมเป็นข้อความ)
            "{{RISK_HEALTH}}": formatRiskList(risk.health),
            "{{RISK_WELFARE}}": formatRiskList(risk.welfare),
            "{{RISK_RESPONSIBILITIES}}": formatRiskList(risk.responsibilities),
            "{{RISK_HOBBIES}}": formatRiskList(risk.hobbies),
            "{{RISK_DRUGS}}": formatRiskList(risk.drugs),
            "{{RISK_VIOLENCE}}": formatRiskList(risk.violence),
            "{{RISK_SEX}}": formatRiskList(risk.sex),
            "{{RISK_GAMING}}": formatRiskList(risk.gaming),
            "{{RISK_COMMUNICATION}}": formatRiskList(risk.communication),
            "{{INTERNET_ACCESS}}": risk.internet_access || '-',

            // รูปภาพ URL
            "{{PHOTO_STUDENT}}": visit.photo_student || '',
            "{{PHOTO_OUTSIDE}}": visit.photo_outside || '',
            "{{PHOTO_INSIDE}}": visit.photo_inside || '',
            "{{PHOTO_TEACHER}}": visit.photo_teacher || ''
        };

        // สร้าง payload และเรียก Google Apps Script
        const payload = {
            action: 'generate_pdf',   // ✅ เพิ่มบรรทัดนี้
            templateId: moduleSettings.slide_template_url,
            pdfFolderId: moduleSettings.gd_pdf_folder_id,
            fileName: `HomeVisit_${studentIdCard}_${visit.visit_date}`,
            replacements
        };

        // 🔧 แก้ไข Headers ให้เป็น text/plain เพื่อหลีกเลี่ยง CORS preflight
        const response = await fetch(moduleSettings.pdf_api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success' && result.url) {
            // อัปเดต pdf_url ในฐานข้อมูล (ถ้ามีฟิลด์นี้)
            if (visit.pdf_url !== undefined) {
                await db.from('module_home_visits')
                    .update({ pdf_url: result.url })
                    .eq('id', visitId);
            }
            // ✅ รีเฟรชตารางข้อมูลทันที เพื่อให้ไอคอนรูปดวงตาแสดง
            loadDataTable();
            Swal.close();
            window.open(result.url, '_blank');
        } else {
            throw new Error(result.message || 'สร้าง PDF ไม่สำเร็จ');
        }
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// TomSelect Init & Options
// ==========================================
const dropdownOptions = {
    living_with: ['บิดา', 'มารดา', 'บิดาและมารดา', 'ปู่/ย่า/ตา/ยาย', 'ญาติ', 'อยู่คนเดียว', 'อื่นๆ'],
    parents_status: ['อยู่ด้วยกันจดทะเบียนสมรส', 'อยู่ด้วยกันไม่ได้จดทะเบียนสมรส', 'หย่าร้าง', 'แยกกันอยู่', 'บิดาถึงแก่กรรม', 'มารดาถึงแก่กรรม', 'บิดาและมารดาถึงแก่กรรม', 'ไม่ทราบ'],
    house_type: ['บ้านของตนเอง', 'บ้านเช่า', 'อาศัยอยู่กับผู้อื่น', 'บ้านญาติ', 'อื่นๆ'],
    travel_method: ['ผู้ปกครองมาส่ง', 'เดิน', 'รถโรงเรียน', 'รถโดยสารประจำทาง', 'รถยนต์ส่วนตัว', 'รถจักรยานยนต์', 'รถจักรยาน', 'อื่นๆ'],
    env_house_status: ['ดี', 'พอใช้', 'เก่าทรุดโทรม', 'พื้นที่คับแคบ', 'ไม่มีความเป็นสัดส่วน'],
    env_clean_status: ['สะอาดเป็นระเบียบ', 'พอใช้', 'ไม่เป็นระเบียบ', 'สกปรก', 'อื่นๆ'],
    env_location_status: ['ปลอดภัย', 'ใกล้แหล่งมั่วสุม', 'ใกล้สถานบันเทิง', 'ชุมชนแออัด', 'อื่นๆ'],
    informant_type: ['บิดา', 'มารดา', 'ผู้ปกครอง', 'ญาติ', 'เพื่อนบ้าน', 'นักเรียนให้ข้อมูลเอง', 'อื่นๆ'],
    family_relation_status: ['รักใคร่กันดี', 'ขัดแย้งทะเลาะกันบางครั้ง', 'ขัดแย้งทะเลาะกันบ่อยครั้ง', 'ห่างเหิน', 'ขัดแย้งและทำร้ายร่างกายบางครั้ง', 'ขัดแย้งและทำร้ายร่างกายบ่อยครั้ง', 'อื่นๆ'],
    leave_with_whom: ['บิดา', 'มารดา', 'พี่ชาย', 'พี่สาว', 'ลุง', 'ป้า', 'น้า', 'อา', 'ปู่', 'ย่า', 'ตา', 'ยาย', 'ทวด', 'พ่อเลี้ยง', 'แม่เลี้ยง', 'นายจ้าง', 'อื่นๆ'],
    allowance_source: ['บิดา', 'มารดา', 'บิดาและมารดา', 'พี่ชาย', 'พี่สาว', 'ลุง', 'ป้า', 'น้า', 'อา', 'ปู่', 'ย่า', 'ตา', 'ยาย', 'ทวด', 'พ่อเลี้ยง', 'แม่เลี้ยง', 'นายจ้าง', 'อื่นๆ']
};

function toggleOtherInput(selectId, otherInputId, value) {
    const otherInput = document.getElementById(otherInputId);
    if (!otherInput) return;
    if (value === 'อื่นๆ' || value === 'others') otherInput.classList.remove('hidden');
    else { otherInput.classList.add('hidden'); otherInput.value = ''; }
}

function initAllTomSelects() {
    ['tomLivingWith', 'tomParentsStatus', 'tomHouseType', 'tomTravelMethod', 'tomEnvHouseStatus', 'tomEnvCleanStatus', 'tomEnvLocationStatus', 'tomInformantType', 'tomFamilyRelationStatus', 'tomLeaveWithWhom', 'tomAllowanceSource'].forEach(k => {
        if (window[k]) window[k].destroy();
    });

    window.tomLivingWith = new TomSelect('#living_with', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.living_with.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('living_with', 'living_with_other', val) });
    window.tomParentsStatus = new TomSelect('#parents_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.parents_status.map(v => ({ value: v, text: v })) });
    window.tomHouseType = new TomSelect('#house_type', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.house_type.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('house_type', 'house_type_other', val) });
    window.tomTravelMethod = new TomSelect('#travel_method', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.travel_method.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('travel_method', 'travel_method_other', val) });
    window.tomEnvHouseStatus = new TomSelect('#env_house_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_house_status.map(v => ({ value: v, text: v })) });
    window.tomEnvCleanStatus = new TomSelect('#env_clean_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_clean_status.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('env_clean_status', 'env_clean_other', val) });
    window.tomEnvLocationStatus = new TomSelect('#env_location_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_location_status.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('env_location_status', 'env_location_other', val) });
    window.tomInformantType = new TomSelect('#informant_type', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.informant_type.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('informant_type', 'informant_type_other', val) });
    window.tomFamilyRelationStatus = new TomSelect('#family_relation_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.family_relation_status.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('family_relation_status', 'family_relation_other', val) });
    window.tomLeaveWithWhom = new TomSelect('#leave_with_whom_details', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.leave_with_whom.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('leave_with_whom_details', 'leave_with_whom_other', val) });
    window.tomAllowanceSource = new TomSelect('#student_allowance_source', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.allowance_source.map(v => ({ value: v, text: v })), onChange: (val) => toggleOtherInput('student_allowance_source', 'student_allowance_source_other', val) });
}
// ==========================================
// Image Helpers
// ==========================================
window.previewSelectedImage = function (input, previewId, cloudBtnId, delBtnId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById(previewId);
            if (img) { img.src = e.target.result; img.classList.remove('hidden'); }
            const delBtn = document.getElementById(delBtnId);
            if (delBtn) delBtn.classList.remove('hidden');
            const cloudBtn = document.getElementById(cloudBtnId);
            if (cloudBtn) { cloudBtn.disabled = false; cloudBtn.classList.remove('opacity-40'); }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.clearSelectedImage = function (event, inputId, previewId, cloudBtnId) {
    document.getElementById(inputId).value = '';
    const img = document.getElementById(previewId);
    if (img) { img.src = ''; img.classList.add('hidden'); }
    const delBtn = event.currentTarget;
    if (delBtn) delBtn.classList.add('hidden');
    const cloudBtn = document.getElementById(cloudBtnId);
    if (cloudBtn) {
        cloudBtn.disabled = true;
        cloudBtn.classList.add('opacity-40');
        cloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้';
    }
    const fileInput = document.getElementById(inputId);
    if (fileInput) delete fileInput.dataset.uploadedUrl;
};

// ==========================================
// Switch Tab (แก้ไขให้รองรับ report)
// ==========================================
function switchTab(tabId) {
    document.getElementById('tab-form').classList.toggle('hidden', tabId !== 'form');
    document.getElementById('tab-data').classList.toggle('hidden', tabId !== 'data');
    document.getElementById('tab-report').classList.toggle('hidden', tabId !== 'report');

    // อัปเดต style ปุ่ม Tab
    const formBtn = document.getElementById('tab-form-btn');
    const dataBtn = document.getElementById('tab-data-btn');
    const reportBtn = document.getElementById('tab-report-btn');

    const activeClass = 'flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all text-sm';
    const inactiveClass = 'flex-1 bg-white text-slate-600 border border-slate-200 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm';

    if (tabId === 'form') {
        formBtn.className = activeClass;
        dataBtn.className = inactiveClass;
        reportBtn.className = inactiveClass;
    } else if (tabId === 'data') {
        dataBtn.className = activeClass;
        formBtn.className = inactiveClass;
        reportBtn.className = inactiveClass;
        loadDataTable();
    } else if (tabId === 'report') {
        reportBtn.className = activeClass;
        formBtn.className = inactiveClass;
        dataBtn.className = inactiveClass;
        loadReport();   // โหลดข้อมูลรายงานทันทีเมื่อเปิดแท็บ
    }
}

// ==========================================
// Report functions (loadReport, showReportStudentList, printReportPDF)
// ==========================================
async function loadReport() {
    const scope = document.getElementById('report-scope').value;
    const grade = document.getElementById('report-grade')?.value;

    Swal.fire({ title: 'กำลังประมวลผลรายงาน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        let classIds = [];
        if (scope === 'myclass' && currentViewRole === 'teacher') {
            const { data } = await db.from('core_classrooms')
                .select('id').eq('academic_year', currentYear).eq('semester', currentTerm)
                .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
            classIds = (data || []).map(c => c.id);
        } else if (scope === 'grade') {
            const { data } = await db.from('core_classrooms')
                .select('id').eq('academic_year', currentYear).eq('semester', currentTerm).eq('grade_level', grade);
            classIds = (data || []).map(c => c.id);
        } else {
            const { data } = await db.from('core_classrooms')
                .select('id').eq('academic_year', currentYear).eq('semester', currentTerm);
            classIds = (data || []).map(c => c.id);
        }

        if (classIds.length === 0) {
            Swal.close();
            document.getElementById('report-content').innerHTML = '<div class="text-center py-10 text-slate-400">ไม่มีข้อมูลห้องเรียนในขอบเขตนี้</div>';
            return;
        }

        const [{ data: enrolls }, { data: classrooms }] = await Promise.all([
            db.from('student_enrollments')
                .select('student_id, core_students(id, student_id_card, prefix, first_name, last_name), classroom_id')
                .in('classroom_id', classIds),
            db.from('core_classrooms')
                .select('id, grade_level, room_number')
                .in('id', classIds)
        ]);

        if (!enrolls || enrolls.length === 0) {
            Swal.close();
            document.getElementById('report-content').innerHTML = '<div class="text-center py-10 text-slate-400">ไม่มีนักเรียนในขอบเขตนี้</div>';
            return;
        }

        const roomMap = {};
        (classrooms || []).forEach(c => { roomMap[c.id] = `ม.${c.grade_level}/${c.room_number}`; });

        const uniqueStudents = [];
        const seenStudentIds = new Set();
        enrolls.forEach(e => {
            if (e.core_students && !seenStudentIds.has(e.core_students.id)) {
                seenStudentIds.add(e.core_students.id);
                e.core_students.room_label = roomMap[e.classroom_id] || '-';
                uniqueStudents.push(e.core_students);
            }
        });

        const totalStudents = uniqueStudents.length;

        const { data: visits } = await db.rpc('get_visits_by_classrooms', {
            p_classroom_ids: classIds,
            p_year: currentYear,
            p_semester: currentTerm
        });

        const visitedMap = {};
        (visits || []).forEach(v => { visitedMap[v.student_id] = v; });

        window.reportVisitedList = [];
        window.reportNotVisitedList = [];

        let visitedCount = 0;
        const riskCounts = { learning: 0, health: 0, drugs: 0, violence: 0, sex: 0, gaming: 0, economy: 0 };
        const problemCounts = { ...riskCounts };
        const riskStudents = { learning: [], health: [], drugs: [], violence: [], sex: [], gaming: [], economy: [] };
        const problemStudents = { ...riskStudents };

        uniqueStudents.forEach(s => {
            const visit = visitedMap[s.id];
            const name = `${s.prefix || ''}${s.first_name} ${s.last_name} (${s.student_id_card})`;

            const studentItem = { id: s.student_id_card || '-', name: `${s.prefix || ''}${s.first_name} ${s.last_name}`, room: s.room_label };

            if (visit) {
                visitedCount++;
                window.reportVisitedList.push(studentItem);

                const risk = visit.risk_data || {};
                const eco = visit.economic_data || {};
                const special = visit.special_help_details || '';

                const evaluateRisk = (category, conditionRisk, conditionProblem) => {
                    if (conditionProblem) {
                        problemCounts[category]++;
                        problemStudents[category].push(name);
                    } else if (conditionRisk) {
                        riskCounts[category]++;
                        riskStudents[category].push(name);
                    }
                };

                evaluateRisk('health', risk.health?.length > 0, risk.health?.length > 1);
                evaluateRisk('drugs', risk.drugs?.length > 0, risk.drugs?.length > 1);
                evaluateRisk('violence', risk.violence?.length > 0, risk.violence?.length > 1);
                evaluateRisk('sex', risk.sex?.length > 0, risk.sex?.length > 1);
                evaluateRisk('gaming', risk.gaming?.length > 0, risk.gaming?.length > 1);
                evaluateRisk('learning', (risk.responsibilities?.length > 0 || special.length > 5), (risk.responsibilities?.length > 1 || special.length > 10));

                const income = parseInt(eco.income) || 0;
                const hasNoAllowance = (eco.allowance_source || '').includes('ไม่มี');
                evaluateRisk('economy', (income > 0 && income < 3000) || hasNoAllowance, income > 0 && income < 1500);
            } else {
                window.reportNotVisitedList.push(studentItem);
            }
        });

        const notVisited = totalStudents - visitedCount;
        const catNames = { learning: 'การเรียน', health: 'สุขภาพ', drugs: 'สารเสพติด', violence: 'ความรุนแรง', sex: 'เรื่องเพศ', gaming: 'ติดเกม', economy: 'เศรษฐกิจ' };

        let html = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div onclick="showReportStudentList('visited')" class="bg-blue-50 p-4 rounded-2xl cursor-pointer hover:bg-blue-100 transition border border-blue-100 shadow-sm relative group">
                <h4 class="font-black text-blue-800">เยี่ยมบ้านแล้ว</h4>
                <p class="text-3xl font-black">${visitedCount} <span class="text-sm text-blue-600 font-normal">คน (${totalStudents > 0 ? ((visitedCount / totalStudents) * 100).toFixed(1) : 0}%)</span></p>
                <div class="absolute top-4 right-4 text-blue-400 group-hover:text-blue-600 transition"><i class="fas fa-search-plus"></i></div>
            </div>
            <div onclick="showReportStudentList('not_visited')" class="bg-slate-100 p-4 rounded-2xl cursor-pointer hover:bg-slate-200 transition border border-slate-200 shadow-sm relative group">
                <h4 class="font-black text-slate-600">ยังไม่ได้เยี่ยม</h4>
                <p class="text-3xl font-black">${notVisited} <span class="text-sm text-slate-500 font-normal">คน (${totalStudents > 0 ? ((notVisited / totalStudents) * 100).toFixed(1) : 0}%)</span></p>
                <div class="absolute top-4 right-4 text-slate-400 group-hover:text-slate-600 transition"><i class="fas fa-search-plus"></i></div>
            </div>
        </div>`;

        const renderCategoryBox = (cat, counts, studentsList, bgClass, textClass) => {
            let listHtml = '<p class="text-xs text-slate-400 mt-1">-</p>';
            if (studentsList[cat].length > 0) {
                const uniqueNames = [...new Set(studentsList[cat])];
                listHtml = '<ul class="text-xs mt-2 list-disc pl-4 text-slate-600 space-y-1">';
                listHtml += uniqueNames.slice(0, 5).map(n => `<li>${n}</li>`).join('');
                if (uniqueNames.length > 5) listHtml += `<li class="text-slate-400 italic">...และอีก ${uniqueNames.length - 5} คน</li>`;
                listHtml += '</ul>';
            }
            return `
            <div class="${bgClass} p-3 rounded-xl border border-white/50 shadow-sm">
                <div class="flex justify-between items-center font-bold text-sm">
                    <span class="text-slate-700">${catNames[cat]}</span>
                    <span class="${textClass} bg-white px-2 py-0.5 rounded-full shadow-sm">${counts[cat]} คน</span>
                </div>
                ${listHtml}
            </div>`;
        };

        html += `<h4 class="font-black text-amber-600 mb-3 flex items-center"><i class="fas fa-exclamation-triangle mr-2"></i>กลุ่มเสี่ยง (เริ่มมีแนวโน้ม)</h4>
                 <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">`;
        for (let cat of Object.keys(catNames)) { html += renderCategoryBox(cat, riskCounts, riskStudents, 'bg-amber-50', 'text-amber-600'); }
        html += `</div>`;

        html += `<h4 class="font-black text-rose-600 mb-3 flex items-center"><i class="fas fa-biohazard mr-2"></i>กลุ่มมีปัญหา (ต้องช่วยเหลือเร่งด่วน)</h4>
                 <div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
        for (let cat of Object.keys(catNames)) { html += renderCategoryBox(cat, problemCounts, problemStudents, 'bg-rose-50', 'text-rose-600'); }
        html += `</div>`;

        document.getElementById('report-content').innerHTML = html;
        Swal.close();

    } catch (err) {
        Swal.close();
        console.error(err);
        document.getElementById('report-content').innerHTML = `<div class="text-center py-10 text-red-500">เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน</div>`;
    }
}

window.showReportStudentList = function (type) {
    const isVisited = type === 'visited';
    const list = isVisited ? window.reportVisitedList : window.reportNotVisitedList;
    const titleText = isVisited ? 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว' : 'รายชื่อนักเรียนที่ ยังไม่ได้เยี่ยมบ้าน';
    const themeColor = isVisited ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-slate-700 bg-slate-100 border-slate-200';

    if (!list || list.length === 0) {
        Swal.fire('ไม่มีข้อมูล', `ไม่มีรายชื่อนักเรียนในหมวดหมู่นี้`, 'info');
        return;
    }

    list.sort((a, b) => {
        if (a.room !== b.room) return a.room.localeCompare(b.room);
        return a.id.localeCompare(b.id);
    });

    const tableHtml = `
        <div class="max-h-[60vh] overflow-y-auto mt-2 rounded-xl border border-slate-200">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="sticky top-0 ${themeColor} shadow-sm z-10">
                    <tr>
                        <th class="p-3 w-16 text-center font-bold">ลำดับ</th>
                        <th class="p-3 w-32 font-bold">รหัสประจำตัว</th>
                        <th class="p-3 font-bold">ชื่อ - นามสกุล</th>
                        <th class="p-3 w-28 text-center font-bold">ชั้นเรียน</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                    ${list.map((s, idx) => `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-3 text-center text-slate-500">${idx + 1}</td>
                            <td class="p-3 font-mono text-slate-500">${s.id}</td>
                            <td class="p-3 font-bold text-slate-700">${s.name}</td>
                            <td class="p-3 text-center"><span class="bg-slate-100 px-2 py-1 rounded text-xs text-slate-600">${s.room}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    Swal.fire({
        title: `<div class="text-xl font-black ${isVisited ? 'text-blue-700' : 'text-slate-700'}">${titleText}</div>
                <div class="text-sm font-normal text-slate-500 mt-1">จำนวน ${list.length} คน</div>`,
        html: tableHtml,
        width: '800px',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            popup: 'rounded-2xl shadow-2xl',
            closeButton: 'bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-lg transition mt-2 mr-2'
        }
    });
};

async function printReportPDF() {
    if (!moduleSettings.pdf_api_url || !moduleSettings.report_template_id) {
        return Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนด PDF API URL และ Report Template ID ในเมนูตั้งค่าระบบ', 'warning');
    }
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>รายงานสรุป</title><script src="https://cdn.tailwindcss.com"><\/script></head><body class="p-8">');
    printWindow.document.write(document.getElementById('report-content').innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// ==========================================
// ฟังก์ชันสำหรับครู: นำเข้า/ส่งออก และอื่น ๆ
// ==========================================
window.selectStudentForForm = function (studentId) {
    if (studentTomSelect) {
        studentTomSelect.setValue(studentId);
    }
    switchTab('form');
};

window.editStudentVisit = async function (visitId) {
    if (!visitId) return;

    Swal.fire({
        title: 'กำลังโหลดข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const { data: visit, error } = await db
            .from('module_home_visits')
            .select('student_id, classroom_id')
            .eq('id', visitId)
            .single();

        if (error || !visit) throw new Error('ไม่พบข้อมูลการเยี่ยมบ้านนี้');

        if (tsClassroom && visit.classroom_id) {
            tsClassroom.setValue(visit.classroom_id);
        }
        await onClassroomSelected(visit.classroom_id);

        if (studentTomSelect && visit.student_id) {
            studentTomSelect.setValue(visit.student_id);
        }

        switchTab('form');
        goToStep(1);

        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

window.downloadTemplate = function () {
    const sampleRow = [
        '12345', 'เด็กชายสมชาย ใจดี',    // ✅ เพิ่มชื่อ-นามสกุลตัวอย่าง
        '2568-07-10', 'เยี่ยมแล้ว', '1',
        'ต้น', '0812345678', 'ton_line',
        'สมชาย', 'รับจ้าง', '0811111111',
        'สมหญิง', 'ค้าขาย', '0822222222',
        'สมปอง', 'เกษตรกร', '0833333333', 'ลุง',
        'ลุง', 'อยู่ด้วยกัน',
        '12/3', '5', 'ท่าข้าม', 'บางปะกง', 'ฉะเชิงเทรา', '24180',
        '13.7380', '100.2741', '5.2',
        'บ้านเดี่ยว',
        '0', '45', 'รถจักรยานยนต์',
        'มั่นคงแข็งแรง', 'สะอาดเป็นระเบียบ', 'ปลอดภัย',
        'มีไฟฟ้า', 'มีน้ำ', 'มีสุขา',
        '4', '2', '2',
        '2', '1', '1',
        '1', '0', '1',
        '15000', 'บิดา', 'ขายของออนไลน์', '200', '60',
        'รักใคร่ปรองดอง', '3',
        '', 'ช่วยงานบ้าน', 'เล่นกีฬา', 'น้า',
        'อยากให้ช่วยเรื่องการเรียน', 'ขอทุนการศึกษา', 'เคยได้ทุน', 'บิดา',
        'ร่างกายไม่แข็งแรง', '', '', '', '', '', '', '', '', 'สามารถเข้าถึง Internet ได้จากที่บ้าน'
    ];

    const ws_data = [templateHeadersThai, sampleRow];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = templateHeadersThai.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'HV_Template.xlsx');
};

function populateFormFromTemplate(headers, values) {
    const mappedHeaders = headers.map(h => fieldKeyMap[h] || h);

    const fieldMap = {
        'visit_date': { id: 'hv_date' },
        'visit_status': { id: 'visit_status', type: 'radio' },
        'visit_times': { id: 'visit_times' },
        'student_nickname': { id: 'student_nickname' },
        'student_phone': { id: 'student_phone' },
        'student_line': { id: 'student_line' },
        'father_name': { id: 'father_name' },
        'father_job': { id: 'father_job' },
        'father_phone': { id: 'father_phone' },
        'mother_name': { id: 'mother_name' },
        'mother_job': { id: 'mother_job' },
        'mother_phone': { id: 'mother_phone' },
        'guardian_name': { id: 'guardian_name' },
        'guardian_job': { id: 'guardian_job' },
        'guardian_phone': { id: 'guardian_phone' },
        'guardian_relation': { id: 'guardian_relation' },
        'living_with': { id: 'living_with', tomInstance: 'tomLivingWith' },
        'parents_status': { id: 'parents_status', tomInstance: 'tomParentsStatus' },
        'house_number': { id: 'addr_house' },
        'village_no': { id: 'addr_moo' },
        'sub_district': { id: 'addr_subdistrict' },
        'district': { id: 'addr_district' },
        'province': { id: 'addr_province' },
        'zipcode': { id: 'addr_zipcode' },
        'latitude': { id: 'lat' },
        'longitude': { id: 'lng' },
        'travel_distance': { id: 'travel_distance' },
        'house_type': { id: 'house_type', tomInstance: 'tomHouseType' },
        'travel_hour': { id: 'travel_hour' },
        'travel_minute': { id: 'travel_minute' },
        'travel_method': { id: 'travel_method', tomInstance: 'tomTravelMethod' },
        'env_house_status': { id: 'env_house_status', tomInstance: 'tomEnvHouseStatus' },
        'env_clean_status': { id: 'env_clean_status', tomInstance: 'tomEnvCleanStatus' },
        'env_location_status': { id: 'env_location_status', tomInstance: 'tomEnvLocationStatus' },
        'utility_electric': { id: 'utility_electric', type: 'radio' },
        'utility_water': { id: 'utility_water', type: 'radio' },
        'utility_toilet': { id: 'utility_toilet', type: 'radio' },
        'family_members_total': { id: 'member_total' },
        'family_members_male': { id: 'member_male' },
        'family_members_female': { id: 'member_female' },
        'sib_same_total': { id: 'sib_same_total' },
        'sib_same_male': { id: 'sib_same_male' },
        'sib_same_female': { id: 'sib_same_female' },
        'sib_diff_total': { id: 'sib_diff_total' },
        'sib_diff_male': { id: 'sib_diff_male' },
        'sib_diff_female': { id: 'sib_diff_female' },
        'economic_income': { id: 'family_income_monthly' },
        'economic_allowance_source': { id: 'student_allowance_source' },
        'economic_student_job_name': { id: 'student_job_name' },
        'economic_student_job_income': { id: 'student_job_income' },
        'economic_money_to_school': { id: 'money_to_school' },
        'family_relations_status': { id: 'family_relation_status', tomInstance: 'tomFamilyRelationStatus' },
        'family_relations_time_together': { id: 'time_together_hours' },
        'special_help_details': { id: 'special_help_details', textarea: true },
        'responsibilities_details': { id: 'responsibilities_details', textarea: true },
        'hobbies_details': { id: 'hobbies_details', textarea: true },
        'leave_with_whom_details': { id: 'leave_with_whom_details', textarea: true },
        'guardian_concerns': { id: 'guardian_concerns_details', textarea: true },
        'guardian_requests': { id: 'guardian_requests_details', textarea: true },
        'past_welfare': { id: 'past_welfare_details', textarea: true },
        'informant_type': { id: 'informant_type', tomInstance: 'tomInformantType' }
    };

    mappedHeaders.forEach((header, i) => {
        const val = String(values[i] || '').trim();
        if (!val) return;
        const map = fieldMap[header];
        if (!map) return;
        const el = document.getElementById(map.id);
        if (!el) return;
        if (map.type === 'radio') {
            const radio = document.querySelector(`input[name="${map.id}"][value="${val}"]`);
            if (radio) radio.checked = true;
        } else if (map.tomInstance) {
            const inst = window[map.tomInstance];
            if (inst) inst.setValue(val);
        } else if (map.textarea) {
            el.value = val;
        } else {
            el.value = val;
        }
    });

    const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
    riskGroups.forEach(group => {
        const thKey = Object.keys(fieldKeyMap).find(k => fieldKeyMap[k] === `risk_${group}`);
        const idx = headers.indexOf(thKey);
        if (idx === -1 || !values[idx]) return;
        const items = values[idx].split(',').map(s => s.trim());
        document.querySelectorAll(`input[name="risk_${group}"]`).forEach(cb => cb.checked = false);
        items.forEach(item => {
            if (item.startsWith('อื่นๆ:')) {
                const otherCb = document.querySelector(`input[name="risk_${group}"][value="อื่นๆ ระบุ..."]`);
                if (otherCb) {
                    otherCb.checked = true;
                    const otherInput = document.getElementById(`risk_${group}_other_txt`);
                    if (otherInput) {
                        otherInput.value = item.replace('อื่นๆ:', '').trim();
                        otherInput.classList.remove('hidden');
                    }
                }
            } else {
                const cb = document.querySelector(`input[name="risk_${group}"][value="${item}"]`);
                if (cb) cb.checked = true;
            }
        });
    });

    const internetTh = 'อินเทอร์เน็ต';
    const internetIdx = headers.indexOf(internetTh);
    if (internetIdx !== -1 && values[internetIdx]) {
        const radio = document.querySelector(`input[name="internet_access"][value="${values[internetIdx]}"]`);
        if (radio) radio.checked = true;
    }
}

function buildTemplateRowFromVisit(visit, studentIdCard = '', studentFullName = '') {
    const eco = visit.economic_data || {};
    const fam = visit.family_members || {};
    const risk = visit.risk_data || {};
    const rels = visit.relations_data || [];
    const getRel = (name) => { const r = rels.find(x => x.relative === name); return r ? r.relation : ''; };
    const getRiskVal = (group) => (risk[group] || []).join(', ');

    return [
        studentIdCard || '',
        studentFullName || '',    // ✅ ชื่อ-นามสกุล
        visit.visit_date || '',
        visit.visit_status || '',
        visit.visit_times || '',
        visit.student_nickname || '',
        visit.student_phone || '',
        visit.student_line || '',
        visit.father_name || '',
        visit.father_job || '',
        visit.father_phone || '',
        visit.mother_name || '',
        visit.mother_job || '',
        visit.mother_phone || '',
        visit.guardian_name || '',
        visit.guardian_job || '',
        visit.guardian_phone || '',
        visit.guardian_relation || '',
        visit.living_with || '',
        visit.parents_status || '',
        visit.house_number || '',
        visit.village_no || '',
        visit.sub_district || '',
        visit.district || '',
        visit.province || '',
        visit.zipcode || '',
        visit.latitude || '',
        visit.longitude || '',
        visit.travel_distance || '',
        visit.house_type || '',
        visit.travel_hour || '',
        visit.travel_minute || '',
        visit.travel_method || '',
        visit.env_house_status || '',
        visit.env_clean_status || '',
        visit.env_location_status || '',
        visit.utility_electric || '',
        visit.utility_water || '',
        visit.utility_toilet || '',
        fam.total || '',
        fam.male || '',
        fam.female || '',
        fam.sib_same_total || '',
        fam.sib_same_male || '',
        fam.sib_same_female || '',
        fam.sib_diff_total || '',
        fam.sib_diff_male || '',
        fam.sib_diff_female || '',
        eco.income || '',
        eco.allowance_source || '',
        eco.student_job_name || '',
        eco.student_job_income || '',
        eco.money_to_school || '',
        (visit.family_relations || {}).status || '',
        (visit.family_relations || {}).time_together || '',
        visit.special_help_details || '',
        visit.responsibilities_details || '',
        visit.hobbies_details || '',
        visit.leave_with_whom_details || '',
        visit.guardian_concerns || '',
        visit.guardian_requests || '',
        visit.past_welfare || '',
        visit.informant_type || '',
        getRel('บิดา'),
        getRel('มารดา'),
        getRel('พี่ชาย/น้องชาย'),
        getRel('พี่สาว/น้องสาว'),
        getRel('ปู่/ย่า/ตา/ยาย'),
        getRel('ญาติ'),
        getRiskVal('health'),
        getRiskVal('welfare'),
        getRiskVal('responsibilities'),
        getRiskVal('hobbies'),
        getRiskVal('drugs'),
        getRiskVal('violence'),
        getRiskVal('sex'),
        getRiskVal('gaming'),
        getRiskVal('communication'),
        risk.internet_access || ''
    ];
}

// ส่งออกตาราง Excel ทั้งห้องเรียน
window.exportTeacherClassroom = async function () {
    if (currentViewRole !== 'teacher') return;
    const classroomId = window.currentClassroomId;
    if (!classroomId) return Swal.fire('กรุณาเลือกห้องเรียน', 'เลือกห้องเรียนในแท็บฟอร์มก่อน', 'warning');

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading() });

    try {
        const { data: classroom, error: classError } = await db.from('core_classrooms')
            .select('grade_level, room_number')
            .eq('id', classroomId)
            .single();
        if (classError || !classroom) throw new Error('ไม่พบข้อมูลห้องเรียน');

        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_number, student_id, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('classroom_id', classroomId)
            .order('student_number');

        if (!enrolls || enrolls.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่มีนักเรียนในห้องนี้', 'info');
            return;
        }

        const studentIds = enrolls.map(e => e.student_id);
        const { data: visits } = await db.from('module_home_visits')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        const rows = enrolls.map(e => {
            const s = e.core_students;
            const v = visitMap[s.id];
            const fullName = `${s.prefix || ''}${s.first_name} ${s.last_name}`.trim();
            if (v) {
                return buildTemplateRowFromVisit(v, s.student_id_card || '', fullName);
            }
            // กรณียังไม่เคยเยี่ยม ให้ใส่เฉพาะรหัส+ชื่อ ที่เหลือเว้นว่าง
            return [
                s.student_id_card || '',
                fullName,
                '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
                '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
                '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
                '', '', '', '', '', '',
                '', '', '', '', '', '',
                '', '', '', '', '', '', '', '', '', ''
            ];
        });

        const ws_data = [templateHeadersThai, ...rows];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        ws['!cols'] = templateHeadersThai.map(() => ({ wch: 22 }));
        XLSX.utils.book_append_sheet(wb, ws, 'ทั้งห้อง');

        const fileName = `เยี่ยมบ้าน_ชั้นม.${classroom.grade_level}/${classroom.room_number}_ภาคเรียนที่${currentTerm}_${currentYear}.xlsx`;
        XLSX.writeFile(wb, fileName);

        Swal.fire('สำเร็จ', 'ส่งออกข้อมูลทั้งห้องเรียบร้อย', 'success');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ส่งออกไม่สำเร็จ: ' + err.message, 'error');
    }
};

// นำเข้าตาราง Excel ทั้งห้องเรียน
window.triggerImportClassroom = function () {
    const input = document.getElementById('importClassroomFileInput');
    if (input) {
        input.value = '';
        input.click();
    }
};

function buildVisitDataFromRow(headers, values, studentId, classroomId) {
    const mapped = {};
    headers.forEach((h, i) => {
        const key = fieldKeyMap[h];
        if (key) mapped[key] = values[i];
    });

    const getVal = (field, defaultVal = '') => mapped[field] || defaultVal;
    const getRiskVal = (group) => {
        const val = getVal(`risk_${group}`);
        return val ? val.split(',').map(s => s.trim()).filter(s => s) : [];
    };

    const formData = {
        student_id: studentId,
        classroom_id: classroomId,
        teacher_id: currentUser.id,
        academic_year: currentYear,
        semester: currentTerm,
        visit_date: getVal('visit_date', new Date().toISOString().split('T')[0]),
        visit_status: getVal('visit_status', 'เยี่ยมแล้ว'),
        visit_times: parseInt(getVal('visit_times')) || 1,
        student_nickname: getVal('student_nickname'),
        student_phone: getVal('student_phone'),
        student_line: getVal('student_line'),
        father_name: getVal('father_name'),
        father_job: getVal('father_job'),
        father_phone: getVal('father_phone'),
        mother_name: getVal('mother_name'),
        mother_job: getVal('mother_job'),
        mother_phone: getVal('mother_phone'),
        guardian_name: getVal('guardian_name'),
        guardian_job: getVal('guardian_job'),
        guardian_phone: getVal('guardian_phone'),
        guardian_relation: getVal('guardian_relation'),
        living_with: getVal('living_with'),
        parents_status: getVal('parents_status'),
        house_number: getVal('house_number'),
        village_no: getVal('village_no'),
        sub_district: getVal('sub_district'),
        district: getVal('district'),
        province: getVal('province'),
        zipcode: getVal('zipcode'),
        latitude: getVal('latitude') || null,
        longitude: getVal('longitude') || null,
        travel_distance: getVal('travel_distance') || null,
        house_type: getVal('house_type'),
        travel_hour: parseInt(getVal('travel_hour')) || 0,
        travel_minute: parseInt(getVal('travel_minute')) || 0,
        travel_method: getVal('travel_method'),
        env_house_status: getVal('env_house_status'),
        env_clean_status: getVal('env_clean_status'),
        env_location_status: getVal('env_location_status'),
        utility_electric: getVal('utility_electric') || null,
        utility_water: getVal('utility_water') || null,
        utility_toilet: getVal('utility_toilet') || null,
        family_members: {
            total: getVal('family_members_total'),
            male: getVal('family_members_male'),
            female: getVal('family_members_female'),
            sib_same_total: getVal('sib_same_total'),
            sib_same_male: getVal('sib_same_male'),
            sib_same_female: getVal('sib_same_female'),
            sib_diff_total: getVal('sib_diff_total'),
            sib_diff_male: getVal('sib_diff_male'),
            sib_diff_female: getVal('sib_diff_female'),
        },
        economic_data: {
            income: getVal('family_income_monthly'),
            allowance_source: window.tomAllowanceSource?.getValue() || '',
            student_job_name: getVal('student_job_name'), student_job_income: getVal('student_job_income'), money_to_school: getVal('money_to_school'),
        },
        family_relations: {
            status: getVal('family_relations_status'),
            time_together: getVal('family_relations_time_together'),
        },
        special_help_details: getVal('special_help_details'),
        responsibilities_details: getVal('responsibilities_details'),
        hobbies_details: getVal('hobbies_details'),
        leave_with_whom_details: window.tomLeaveWithWhom?.getValue() || '',
        guardian_concerns: getVal('guardian_concerns'),
        guardian_requests: getVal('guardian_requests'),
        past_welfare: getVal('past_welfare'),
        informant_type: getVal('informant_type'),
        risk_data: {
            health: getRiskVal('health'),
            welfare: getRiskVal('welfare'),
            responsibilities: getRiskVal('responsibilities'),
            hobbies: getRiskVal('hobbies'),
            drugs: getRiskVal('drugs'),
            violence: getRiskVal('violence'),
            sex: getRiskVal('sex'),
            gaming: getRiskVal('gaming'),
            communication: getRiskVal('communication'),
            internet_access: getVal('risk_internet_access'),
        },
        relations_data: [],
        updated_at: new Date().toISOString()
    };
    return formData;
}
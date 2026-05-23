// ==========================================
// homevisit.js (ฉบับแก้ไข)
// แก้ไข: openReportModal ซ้ำ, addEventListener ซ้ำ, report_template_id หาย,
//         isReadOnly ไม่บังคับใช้, tb-homevisit element ผิด,
//         event global ใน upload/clear image, switchTab ไม่อัปเดตปุ่ม
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

// ==========================================
// 1. Init
// ==========================================
$(document).ready(async () => {
    try {
        initPlugins();
        await checkAuth();
        await loadModuleSettings();
        initAllTomSelects();
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

    // ✅ FIX: บังคับใช้ isReadOnly — disable ปุ่มบันทึกและ form เมื่อเป็นโหมดดูอย่างเดียว
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
    ['student_code', 'student_fullname', 'student_grade', 'student_number'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const form = document.getElementById('homeVisitForm'); if (form) form.reset();
}

async function loadExistingHomeVisit(studentId) {
    const { data, error } = await db.from('module_home_visits')
        .select('*').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();
    if (data && !error) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'พบข้อมูลเยี่ยมบ้านเดิม ระบบทำการโหลดให้แล้ว', showConfirmButton: false, timer: 3000 });
        populateFormWithData(data);
    }
}

function populateFormWithData(data) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setRadio = (name, val) => { const el = document.querySelector(`input[name="${name}"][value="${val}"]`); if (el) el.checked = true; };

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

    setVal('addr_house', data.house_number || ''); setVal('addr_moo', data.village_no || ''); setVal('addr_subdistrict', data.sub_district || '');
    setVal('addr_district', data.district || ''); setVal('addr_province', data.province || ''); setVal('addr_zipcode', data.zipcode || '');
    setVal('lat', data.latitude || ''); setVal('lng', data.longitude || '');
    setVal('travel_distance', data.travel_distance || '');
    setVal('travel_hour', data.travel_hour || 0); setVal('travel_minute', data.travel_minute || 0);

    if (window.tomHouseType) window.tomHouseType.setValue(data.house_type || '');
    if (window.tomTravelMethod) window.tomTravelMethod.setValue(data.travel_method || '');
    if (window.tomEnvHouseStatus) window.tomEnvHouseStatus.setValue(data.env_house_status || '');
    if (window.tomEnvCleanStatus) window.tomEnvCleanStatus.setValue(data.env_clean_status || '');
    if (window.tomEnvLocationStatus) window.tomEnvLocationStatus.setValue(data.env_location_status || '');

    ['utility_electric', 'utility_water', 'utility_toilet'].forEach(util => setRadio(util, data[util]));

    if (data.family_members) {
        setVal('member_total', data.family_members.total); setVal('member_male', data.family_members.male); setVal('member_female', data.family_members.female);
        setVal('sib_same_total', data.family_members.sib_same_total); setVal('sib_same_male', data.family_members.sib_same_male); setVal('sib_same_female', data.family_members.sib_same_female);
        setVal('sib_diff_total', data.family_members.sib_diff_total); setVal('sib_diff_male', data.family_members.sib_diff_male); setVal('sib_diff_female', data.family_members.sib_diff_female);
    }
    if (data.economic_data) {
        setVal('family_income_monthly', data.economic_data.income); setVal('student_allowance_source', data.economic_data.allowance_source);
        setVal('student_job_name', data.economic_data.student_job_name); setVal('student_job_income', data.economic_data.student_job_income); setVal('money_to_school', data.economic_data.money_to_school);
    }
    if (data.family_relations) {
        if (window.tomFamilyRelationStatus) window.tomFamilyRelationStatus.setValue(data.family_relations.status || '');
        setVal('time_together_hours', data.family_relations.time_together || '');
    }

    setVal('special_help_details', data.special_help_details || '');
    setVal('responsibilities_details', data.responsibilities_details || '');
    setVal('hobbies_details', data.hobbies_details || '');
    setVal('leave_with_whom_details', data.leave_with_whom_details || '');
    setVal('guardian_concerns_details', data.guardian_concerns || '');
    setVal('guardian_requests_details', data.guardian_requests || '');
    setVal('past_welfare_details', data.past_welfare || '');
    if (window.tomInformantType) window.tomInformantType.setValue(data.informant_type || '');

    if (data.latitude && data.longitude && map && marker) {
        marker.setLatLng([data.latitude, data.longitude]); map.setView([data.latitude, data.longitude], 15);
    }
}

// ==========================================
// ภาค 2/3: Submit, Upload, Map, Step Navigator, Admin Modal
// ==========================================

window.submitHomeVisit = async function () {
    // ✅ FIX: ป้องกันการบันทึกในโหมด read-only
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

    const studentId = document.getElementById('hv_student').value;
    const classroomId = window.currentClassroomId;
    if (!studentId || !classroomId) return Swal.fire('ผิดพลาด', 'กรุณาเลือกห้องเรียนและนักเรียน', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const getVal = (id) => document.getElementById(id)?.value || '';
    const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || null;

    // --- รวบรวมข้อมูลความเสี่ยงจาก Checkbox ---
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

    // internet access (radio)
    riskData.internet_access = getRadio('internet_access');

    // --- รวบรวมความสัมพันธ์ในครอบครัว (ตาราง Radio) ---
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
            income: getVal('family_income_monthly'), allowance_source: getVal('student_allowance_source'),
            student_job_name: getVal('student_job_name'), student_job_income: getVal('student_job_income'), money_to_school: getVal('money_to_school'),
        },
        family_relations: { status: window.tomFamilyRelationStatus?.getValue() || '', time_together: getVal('time_together_hours') },
        special_help_details: getVal('special_help_details'), responsibilities_details: getVal('responsibilities_details'),
        hobbies_details: getVal('hobbies_details'), leave_with_whom_details: getVal('leave_with_whom_details'),
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

// ✅ FIX: รับ event เป็น parameter แทนการใช้ global event object
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

    // ✅ URL ที่ถูกต้อง
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
    map = L.map('map').setView([13.7380, 100.2741], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([13.7380, 100.2741], { draggable: true }).addTo(map);
    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(7);
        document.getElementById('lng').value = pos.lng.toFixed(7);
    });
}

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
        // ✅ FIX: เพิ่ม report_template_id ใน moduleSettings
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
    // ✅ FIX: reuse moduleSettings ที่โหลดมาแล้ว แทนการ query ซ้ำ
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
        // ✅ FIX: บันทึก report_template_id ด้วย
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
    const exportBtn = document.querySelector('#tab-data button.bg-emerald-50'); // ปุ่ม Export Excel

    // แสดง / ซ่อน container ตามบทบาท
    if (isTeacher) {
        classSummaryTable.classList.add('hidden');
        teacherTableContainer.classList.remove('hidden');
        // export ยังใช้ได้กับข้อมูลนักเรียน (ปรับชื่อหรือซ่อนตามชอบ)
        if (exportBtn) exportBtn.style.display = 'none'; // ซ่อน export หรือปรับเป็น export รายบุคคล
    } else {
        classSummaryTable.classList.remove('hidden');
        teacherTableContainer.classList.add('hidden');
        if (exportBtn) exportBtn.style.display = '';
    }

    // --- กรณี admin/หัวหน้าระดับ/หัวหน้างานปกครอง (โหลดตารางภาพรวมรายชั้น) ---
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
            renderDashboard(classrooms.length, doneCount, false);  // หรือไม่ต้องใส่ false ก็ได้
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500">เกิดข้อผิดพลาด</td></tr>';
        }
        return;
    }

    // --- กรณีครู (ตารางรายบุคคล) ---
    const classroomId = window.currentClassroomId;
    const tbody = document.getElementById('tb-teacher-students');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        if (!classroomId) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียนในแท็บฟอร์มก่อน</td></tr>';
            // ✅ เพิ่มตรงนี้
            renderDashboard(0, 0, true);  // ล้างการ์ดทั้ง 3 ช่อง
            return;
        }

        // ดึงนักเรียนในห้อง + ข้อมูลเยี่ยมบ้าน
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
                // ปุ่มแก้ไข (ไปที่ฟอร์ม)
                actions += `<button onclick="editStudentVisit('${visit.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="แก้ไข"><i class="fas fa-edit"></i></button>`;
                // ปุ่มพิมพ์ PDF
                actions += `<button onclick="printPDF('${visit.id}')" class="text-green-500 hover:text-green-700 p-1" title="พิมพ์ PDF"><i class="fas fa-file-pdf"></i></button>`;
                // ปุ่มดู PDF (ถ้ามี pdf_url)
                if (visit.pdf_url) {
                    actions += `<a href="${visit.pdf_url}" target="_blank" class="text-sky-500 hover:text-sky-700 p-1" title="ดู PDF"><i class="fas fa-eye"></i></a>`;
                } else {
                    actions += `<span class="text-slate-300 p-1" title="ยังไม่มี PDF"><i class="fas fa-eye"></i></span>`;
                }
            } else {
                // ยังไม่เคยบันทึก -> ไปที่ฟอร์มพร้อมเลือกนักเรียนคนนี้ (โดยกำหนดค่าใน dropdown)
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

        // แสดงจำนวนนักเรียนใน dashboard
        // renderDashboard(1, visits ? Object.keys(visitMap).length : 0); // หรือปรับเป็นจำนวนนร.ทั้งหมด
        const totalStudents = enrolls.length;             // จำนวนนักเรียนทั้งหมดในห้อง
        const visitedCount = Object.keys(visitMap).length; // จำนวนที่เยี่ยมแล้ว
        renderDashboard(totalStudents, visitedCount, true);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500">เกิดข้อผิดพลาด</td></tr>';
    }
};

// function renderDashboard(total, done) {
//     const container = document.getElementById('dashboard-stats');
//     if (!container) return;
//     container.innerHTML = `
//         <div class="glass-card rounded-2xl p-5 border-l-4 border-blue-500"><h3 class="text-3xl font-black text-blue-700">${total}</h3><p>ห้องเรียนทั้งหมด</p></div>
//         <div class="glass-card rounded-2xl p-5 border-l-4 border-emerald-500"><h3 class="text-3xl font-black text-emerald-600">${done}</h3><p>บันทึกครบแล้ว</p></div>
//         <div class="glass-card rounded-2xl p-5 border-l-4 border-amber-500"><h3 class="text-3xl font-black text-amber-600">${total - done}</h3><p>รอการเยี่ยม</p></div>`;
// }

function renderDashboard(total, done, isTeacher = false) {
    const container = document.getElementById('dashboard-stats');
    if (!container) return;
    if (isTeacher) {
        // การ์ดสำหรับครู (นับจำนวนนักเรียน)
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
        // การ์ดสำหรับ admin/หัวหน้าระดับ/หัวหน้างานปกครอง (นับจำนวนห้อง)
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
    XLSX.writeFile(wb, `เยี่ยมบ้าน_${currentTerm}_${currentYear}.xlsx`);
    Swal.close();
};

window.printPDF = async function (visitId) {
    if (!moduleSettings.pdf_api_url || !moduleSettings.slide_template_url) {
        return Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนด PDF API URL และ Slide ID ในเมนูตั้งค่าระบบ', 'warning');
    }
    Swal.fire({ title: 'กำลังสร้าง PDF...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: visit, error } = await db.from('module_home_visits')
            .select('*, core_students(*), core_classrooms(*)')
            .eq('id', visitId).single();
        if (error) throw error;
        const replacements = {
            "{{STUDENT_NAME}}": `${visit.core_students.first_name} ${visit.core_students.last_name}`,
            "{{student_id}}": visit.core_students.student_id_card,
            "{{VISIT_DATE}}": visit.visit_date,
            "{{VISIT_TIMES}}": visit.visit_times,
            "{{GUARDIAN_NAME}}": visit.guardian_name || '-',
            "{{ADDRESS}}": `${visit.house_number} ${visit.village_no} ต.${visit.sub_district} อ.${visit.district} จ.${visit.province} ${visit.zipcode}`,
        };
        const payload = {
            templateId: moduleSettings.slide_template_url,
            pdfFolderId: moduleSettings.gd_pdf_folder_id,
            fileName: `HomeVisit_${visit.core_students.student_id_card}_${visit.visit_date}`,
            replacements
        };
        const response = await fetch(moduleSettings.pdf_api_url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') window.open(result.url, '_blank');
        else throw new Error(result.message);
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// TomSelect Init & Options
// ==========================================
const dropdownOptions = {
    living_with: ['บิดา', 'มารดา', 'บิดาและมารดา', 'ปู่/ย่า/ตา/ยาย', 'ญาติ', 'อยู่คนเดียว', 'อื่นๆ'],
    parents_status: ['อยู่ด้วยกัน', 'หย่าร้าง', 'แยกกันอยู่', 'บิดาถึงแก่กรรม', 'มารดาถึงแก่กรรม', 'ทั้งคู่ถึงแก่กรรม', 'ไม่ทราบ'],
    house_type: ['บ้านเดี่ยว', 'ทาวน์เฮ้าส์', 'ตึกแถว/ห้องแถว', 'อพาร์ทเมนต์/คอนโด', 'บ้านเช่า', 'บ้านพักข้าราชการ', 'อื่นๆ'],
    travel_method: ['เดิน', 'จักรยาน', 'รถจักรยานยนต์', 'รถรับส่งโรงเรียน', 'รถส่วนตัว', 'เรือ', 'อื่นๆ'],
    env_house_status: ['มั่นคงแข็งแรง', 'พอใช้', 'ทรุดโทรม', 'ไม่ปลอดภัย'],
    env_clean_status: ['สะอาดเป็นระเบียบ', 'พอใช้', 'ไม่เป็นระเบียบ', 'สกปรก', 'อื่นๆ'],
    env_location_status: ['ปลอดภัย', 'มีความเสี่ยง', 'อันตราย', 'others'],
    informant_type: ['บิดา', 'มารดา', 'ผู้ปกครอง', 'ญาติ', 'เพื่อนบ้าน', 'นักเรียนให้ข้อมูลเอง', 'อื่นๆ'],
    family_relation_status: ['รักใคร่ปรองดอง', 'ทะเลาะเบาะแว้ง', 'ห่างเหิน', 'อื่นๆ']
};

function toggleOtherInput(selectId, otherInputId, value) {
    const otherInput = document.getElementById(otherInputId);
    if (!otherInput) return;
    if (value === 'อื่นๆ' || value === 'others') otherInput.classList.remove('hidden');
    else { otherInput.classList.add('hidden'); otherInput.value = ''; }
}

function initAllTomSelects() {
    ['tomLivingWith', 'tomParentsStatus', 'tomHouseType', 'tomTravelMethod', 'tomEnvHouseStatus', 'tomEnvCleanStatus', 'tomEnvLocationStatus', 'tomInformantType', 'tomFamilyRelationStatus'].forEach(k => {
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
}

// ==========================================
// Image Helpers
// ==========================================
// ✅ FIX: รับ inputId, previewId, cloudBtnId, delBtnId เป็น parameter ชัดเจน
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

// ✅ FIX: รับ event เป็น parameter แทน global event
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
    // ล้าง uploaded URL ด้วย
    const fileInput = document.getElementById(inputId);
    if (fileInput) delete fileInput.dataset.uploadedUrl;
};

// ✅ FIX: switchTab อัปเดต active style ของปุ่มด้วย
function switchTab(tabId) {
    document.getElementById('tab-form').classList.toggle('hidden', tabId !== 'form');
    document.getElementById('tab-data').classList.toggle('hidden', tabId !== 'data');

    // ✅ อัปเดต style ปุ่ม Tab
    const formBtn = document.getElementById('tab-form-btn');
    const dataBtn = document.getElementById('tab-data-btn');
    if (formBtn && dataBtn) {
        if (tabId === 'form') {
            formBtn.className = 'flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all text-sm';
            dataBtn.className = 'flex-1 bg-white text-slate-600 border border-slate-200 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm';
        } else {
            dataBtn.className = 'flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all text-sm';
            formBtn.className = 'flex-1 bg-white text-slate-600 border border-slate-200 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm';
        }
    }

    if (tabId === 'data') loadDataTable();
}

// ✅ FIX: ลบ DOMContentLoaded ที่เช็ค 'tb-homevisit' (element ไม่มีใน HTML)
//         ใช้ switchTab เป็นตัว trigger loadDataTable แทน

// ==========================================
// Report Modal
// ==========================================
// ✅ FIX: เหลือฟังก์ชันเดียว และเรียก loadReport() เองตรงๆ
//         ไม่ต้องพึ่ง change event เพราะ set value ด้วย JS ไม่ trigger 'change'
function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    const scopeSelect = document.getElementById('report-scope');
    const gradeContainer = document.getElementById('grade-select-container');
    if (currentViewRole === 'teacher') {
        scopeSelect.value = 'myclass';
    } else {
        scopeSelect.value = 'all';
    }
    gradeContainer.classList.add('hidden');
    loadReport(); // ✅ เรียกตรง เพราะ set value ด้วย JS ไม่ trigger change event
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

// ✅ FIX: listener เดียว (ลบตัวซ้ำออก)
document.getElementById('report-scope').addEventListener('change', function () {
    const gradeSel = document.getElementById('grade-select-container');
    if (this.value === 'grade') gradeSel.classList.remove('hidden');
    else gradeSel.classList.add('hidden');
    loadReport();
});

async function loadReport() {
    const scope = document.getElementById('report-scope').value;
    const grade = document.getElementById('report-grade')?.value;

    Swal.fire({ title: 'กำลังประมวลผลรายงาน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        let classIds = [];
        if (scope === 'myclass' && currentViewRole === 'teacher') {
            const { data } = await db.from('core_classrooms')
                .select('id')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
            classIds = (data || []).map(c => c.id);
        } else if (scope === 'grade') {
            const { data } = await db.from('core_classrooms')
                .select('id')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .eq('grade_level', grade);
            classIds = (data || []).map(c => c.id);
        } else {
            const { data } = await db.from('core_classrooms')
                .select('id')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm);
            classIds = (data || []).map(c => c.id);
        }

        if (classIds.length === 0) {
            Swal.close();
            document.getElementById('report-content').innerHTML = '<div class="text-center py-10 text-slate-400">ไม่มีข้อมูลห้องเรียนในขอบเขตนี้</div>';
            return;
        }

        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id, core_students(id, student_id_card, prefix, first_name, last_name), classroom_id')
            .in('classroom_id', classIds);

        if (!enrolls || enrolls.length === 0) {
            Swal.close();
            document.getElementById('report-content').innerHTML = '<div class="text-center py-10 text-slate-400">ไม่มีนักเรียนในขอบเขตนี้</div>';
            return;
        }

        const { data: classrooms } = await db.from('core_classrooms')
            .select('id, grade_level')
            .in('id', classIds);
        const gradeMap = {};
        (classrooms || []).forEach(c => { gradeMap[c.id] = c.grade_level; });

        const students = enrolls.map(e => ({
            student: e.core_students,
            grade_level: gradeMap[e.classroom_id] || '?'
        }));

        const totalStudents = students.length;
        const studentIds = students.map(s => s.student.id);

        // const { data: visits } = await db.from('module_home_visits')
        //     .select('student_id, risk_data, economic_data, special_help_details')
        //     .in('student_id', studentIds)
        //     .eq('academic_year', currentYear)
        //     .eq('semester', currentTerm);
        const { data: visits } = await db.rpc('get_visits_by_classrooms', {
            p_classroom_ids: classIds,
            p_year: currentYear,
            p_semester: currentTerm
        });
        const visitedMap = {};
        (visits || []).forEach(v => { visitedMap[v.student_id] = v; });

        let visitedCount = 0;
        const riskCounts = { learning: 0, health: 0, drugs: 0, violence: 0, sex: 0, gaming: 0, economy: 0 };
        const problemCounts = { ...riskCounts };
        const riskStudents = { learning: [], health: [], drugs: [], violence: [], sex: [], gaming: [], economy: [] };
        const problemStudents = { ...riskStudents };

        students.forEach(s => {
            const visit = visitedMap[s.student.id];
            const name = `${s.student.prefix || ''}${s.student.first_name} ${s.student.last_name} (${s.student.student_id_card})`;

            if (visit) {
                visitedCount++;
                const risk = visit.risk_data || {};
                const eco = visit.economic_data || {};
                const special = visit.special_help_details || '';

                if (risk.health?.length) { riskCounts.health++; riskStudents.health.push(name); }
                if (risk.drugs?.length) { riskCounts.drugs++; riskStudents.drugs.push(name); }
                if (risk.violence?.length) { riskCounts.violence++; riskStudents.violence.push(name); }
                if (risk.sex?.length) { riskCounts.sex++; riskStudents.sex.push(name); }
                if (risk.gaming?.length) { riskCounts.gaming++; riskStudents.gaming.push(name); }
                if (risk.responsibilities?.length || special.length > 5) { riskCounts.learning++; riskStudents.learning.push(name); }
                if (eco && (parseInt(eco.income) < 3000 || (eco.allowance_source || '').includes('ไม่มี'))) {
                    riskCounts.economy++; riskStudents.economy.push(name);
                }

                if (risk.health?.length > 1) { problemCounts.health++; problemStudents.health.push(name); }
                if (risk.drugs?.length > 1) { problemCounts.drugs++; problemStudents.drugs.push(name); }
                if (risk.violence?.length > 1) { problemCounts.violence++; problemStudents.violence.push(name); }
                if (risk.sex?.length > 1) { problemCounts.sex++; problemStudents.sex.push(name); }
                if (risk.gaming?.length > 1) { problemCounts.gaming++; problemStudents.gaming.push(name); }
                if (risk.responsibilities?.length > 1 || special.length > 10) { problemCounts.learning++; problemStudents.learning.push(name); }
                if (eco && parseInt(eco.income) < 1500) { problemCounts.economy++; problemStudents.economy.push(name); }
            }
        });

        const notVisited = totalStudents - visitedCount;
        const catNames = {
            learning: 'การเรียน', health: 'สุขภาพ', drugs: 'สารเสพติด', violence: 'ความรุนแรง',
            sex: 'เพศ', gaming: 'ติดเกม', economy: 'เศรษฐกิจ'
        };

        let html = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div class="bg-blue-50 p-4 rounded-2xl">
                <h4 class="font-black text-blue-800">เยี่ยมบ้านแล้ว</h4>
                <p class="text-3xl font-black">${visitedCount} <span class="text-sm">คน (${totalStudents > 0 ? ((visitedCount / totalStudents) * 100).toFixed(1) : 0}%)</span></p>
            </div>
            <div class="bg-slate-100 p-4 rounded-2xl">
                <h4 class="font-black text-slate-600">ยังไม่ได้เยี่ยม</h4>
                <p class="text-3xl font-black">${notVisited} <span class="text-sm">คน (${totalStudents > 0 ? ((notVisited / totalStudents) * 100).toFixed(1) : 0}%)</span></p>
            </div>
        </div>`;

        html += `<h4 class="font-black text-amber-800 mb-3">กลุ่มเสี่ยง</h4><div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">`;
        for (let cat of Object.keys(catNames)) {
            html += `<div class="bg-amber-50 p-3 rounded-xl">
                <div class="flex justify-between font-bold text-sm"><span>${catNames[cat]}</span><span class="text-amber-600">${riskCounts[cat]} คน</span></div>
                ${riskStudents[cat].length ? '<ul class="text-xs mt-2 list-disc pl-4">' + riskStudents[cat].slice(0, 5).map(n => `<li>${n}</li>`).join('') + (riskStudents[cat].length > 5 ? `<li class="text-slate-400">...และอีก ${riskStudents[cat].length - 5} คน</li>` : '') + '</ul>' : '<p class="text-xs text-slate-400 mt-1">-</p>'}
            </div>`;
        }
        html += `</div>`;

        html += `<h4 class="font-black text-rose-800 mb-3">กลุ่มมีปัญหา</h4><div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
        for (let cat of Object.keys(catNames)) {
            html += `<div class="bg-rose-50 p-3 rounded-xl">
                <div class="flex justify-between font-bold text-sm"><span>${catNames[cat]}</span><span class="text-rose-600">${problemCounts[cat]} คน</span></div>
                ${problemStudents[cat].length ? '<ul class="text-xs mt-2 list-disc pl-4">' + problemStudents[cat].slice(0, 5).map(n => `<li>${n}</li>`).join('') + (problemStudents[cat].length > 5 ? `<li class="text-slate-400">...และอีก ${problemStudents[cat].length - 5} คน</li>` : '') + '</ul>' : '<p class="text-xs text-slate-400 mt-1">-</p>'}
            </div>`;
        }
        html += `</div>`;

        document.getElementById('report-content').innerHTML = html;
        Swal.close();

    } catch (err) {
        Swal.close();
        console.error(err);
        document.getElementById('report-content').innerHTML = `<div class="text-center py-10 text-red-500">เกิดข้อผิดพลาด: ${err.message}</div>`;
    }
}

async function printReportPDF() {
    // ✅ FIX: เช็ค report_template_id ที่มีอยู่จริงใน moduleSettings
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

// เลือกนักเรียนในฟอร์ม (เมื่อครูคลิกจากตารางรายบุคคล)
window.selectStudentForForm = function (studentId) {
    if (studentTomSelect) {
        studentTomSelect.setValue(studentId);
    }
    switchTab('form');
};

// แก้ไขข้อมูลเยี่ยมบ้าน (โหลดข้อมูลนักเรียนและย้อนไป Step 1)
window.editStudentVisit = function (visitId) {
    // ดึง student_id จาก visit แล้วเลือกใน dropdown + switch tab
    // หรือใช้ visitId ไปที่ฟอร์มแก้ไข (คุณสามารถ implement เต็ม ๆ ได้)
    // สำหรับตอนนี้ ใช้ alert หรือเปิด modal แก้ไข (แนะนำให้ใช้ modal เฉพาะ)
    Swal.fire('แจ้งเตือน', 'ฟังก์ชันนี้จะเปิดเร็ว ๆ นี้', 'info');
};
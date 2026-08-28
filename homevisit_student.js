// ==========================================
// homevisit_student.js (ฉบับสมบูรณ์ แก้ไขปัญหา)
// สำหรับนักเรียนกรอกข้อมูลเยี่ยมบ้านของตนเอง
// (มีระบบ Lock เมื่อครูกดยืนยัน)
// ==========================================

// ==========================================
// 0. กำหนด stepColorConfigs ก่อนใช้งาน (ป้องกัน error)
// ==========================================
if (typeof window.stepColorConfigs === 'undefined') {
    window.stepColorConfigs = {
        1: { bg: 'bg-red-600', text: 'text-red-700', shadow: 'shadow-red-100' },
        2: { bg: 'bg-orange-600', text: 'text-orange-700', shadow: 'shadow-orange-100' },
        3: { bg: 'bg-yellow-600', text: 'text-yellow-700', shadow: 'shadow-yellow-100' },
        4: { bg: 'bg-green-600', text: 'text-green-700', shadow: 'shadow-green-100' },
        5: { bg: 'bg-sky-600', text: 'text-sky-700', shadow: 'shadow-sky-100' }
    };
}

// ==========================================
// 1. ตัวแปร Global
// ==========================================
let currentUser = null;
let currentStudentId = null;
let currentClassroomId = null;
let currentYear = '';
let currentTerm = '';
let isReadOnly = false;
let isVerified = false;

let map, marker, routeLayer = null;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_url: "", gd_pdf_folder_id: "", report_template_id: "" };

let formIsDirty = false;
let suppressDirty = false;
let isSubmitting = false;

const SCHOOL_LAT = 13.740269204697068;
const SCHOOL_LNG = 100.25988109513965;
const SCHOOL_NAME = 'โรงเรียนวัดไร่ขิงวิทยา';

// ==========================================
// 2. ตรวจสอบ Session และโหลดข้อมูล
// ==========================================
$(document).ready(async function () {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเข้าสู่ระบบ', text: 'คุณยังไม่ได้เข้าสู่ระบบ กรุณา Login ก่อนใช้งาน', confirmButtonColor: '#3b82f6' })
            .then(() => { window.location.href = 'login.html'; });
        return;
    }
    currentUser = session.user;
    try {
        const email = session.user.email;
        const studentIdCard = email.split('@')[0];
        const { data: student, error } = await db
            .from('core_students')
            .select(`
                *,
                student_enrollments (
                    academic_year,
                    semester,
                    classroom_id,
                    core_classrooms ( grade_level, room_number )
                )
            `)
            .eq('student_id_card', studentIdCard)
            .single();

        if (error || !student) throw new Error('ไม่พบข้อมูลนักเรียนในระบบ');

        currentStudentId = student.id;

        const fullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
        document.getElementById('userNameDisplay').textContent = fullName;
        document.getElementById('student-fullname-display').textContent = fullName;
        document.getElementById('student-id-display').textContent = student.student_id_card;

        // ✅ ดึงปีการศึกษา/เทอมจาก core_school_info
        const { data: sInfo } = await db.from('core_school_info')
            .select('current_academic_year, current_semester')
            .single();
        if (sInfo) {
            currentYear = sInfo.current_academic_year;
            currentTerm = sInfo.current_semester;
        }

        // ✅ หา enrollment ที่ตรงกับปีการศึกษา/เทอมปัจจุบัน
        let currentEnrollment = null;
        if (student.student_enrollments) {
            currentEnrollment = student.student_enrollments.find(
                e => e.academic_year == currentYear && e.semester == currentTerm
            );
            // ถ้าไม่เจอ ให้ใช้อันแรก
            if (!currentEnrollment && student.student_enrollments.length > 0) {
                currentEnrollment = student.student_enrollments[0];
                if (!currentYear || !currentTerm) {
                    currentYear = currentEnrollment.academic_year;
                    currentTerm = currentEnrollment.semester || '1';
                }
            }
        }

        if (currentEnrollment) {
            currentClassroomId = currentEnrollment.classroom_id;
            const cls = currentEnrollment.core_classrooms;
            document.getElementById('student-class-display').textContent = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';
            document.getElementById('student_grade').value = cls?.grade_level || '';

            // ดึงเลขที่จาก student_enrollments
            const { data: enrollDetail } = await db
                .from('student_enrollments')
                .select('student_number')
                .eq('student_id', student.id)
                .eq('classroom_id', currentEnrollment.classroom_id)
                .maybeSingle();
            document.getElementById('student_number').value = enrollDetail?.student_number || '';
        } else {
            document.getElementById('student-class-display').textContent = '-';
            document.getElementById('student_grade').value = '';
            document.getElementById('student_number').value = '';
            // ถ้าไม่มี enrollment ให้ไม่สามารถบันทึกได้ (จะเช็คตอน submit)
        }

        document.getElementById('student_code').value = student.student_id_card || '';
        document.getElementById('student_fullname').value = fullName;

        window._student = student;

        // ✅ แสดงรูปโปรไฟล์จาก core_students
        const avatarUrl = student.avatar_students_url;
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

        applyAvatarToStep4(avatarUrl);

        // โหลดข้อมูลเยี่ยมบ้าน (filter ปี/เทอม)
        await loadExistingHomeVisit(currentStudentId);
        initForm();
        document.getElementById('form-section').classList.remove('hidden');
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

    } catch (err) {
        console.error('Load student error:', err);
        Swal.fire({ icon: 'error', title: 'ไม่สามารถโหลดข้อมูล', text: err.message || 'กรุณาติดต่อครูผู้ดูแลระบบ', confirmButtonColor: '#3b82f6' })
            .then(() => { window.location.href = 'login.html'; });
    }
});

// ==========================================
// 3. ดึงรูปโปรไฟล์ไปใช้ใน Step 4 Card 1
// ==========================================
function applyAvatarToStep4(avatarUrl) {
    const autoBanner = document.getElementById('avatar-auto-banner');
    const missingBanner = document.getElementById('avatar-missing-banner');
    const autoThumb = document.getElementById('avatar-auto-thumb');
    const studentPicInput = document.getElementById('pic_student');
    const previewImg = document.getElementById('preview1');
    const delBtn = document.getElementById('del_btn1');
    const cloudBtn = document.getElementById('cloud_btn1');

    if (avatarUrl) {
        if (autoBanner) { autoBanner.classList.remove('hidden'); autoBanner.classList.add('flex'); }
        if (missingBanner) { missingBanner.classList.add('hidden'); missingBanner.classList.remove('flex'); }
        if (autoThumb) { autoThumb.src = avatarUrl; }

        if (studentPicInput) { studentPicInput.dataset.uploadedUrl = avatarUrl; }
        if (previewImg) {
            previewImg.src = avatarUrl;
            previewImg.classList.remove('hidden');
            previewImg.dataset.url = avatarUrl;
        }
        if (delBtn) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
        if (cloudBtn) {
            cloudBtn.innerHTML = '<i class="fa-solid fa-check text-green-400"></i> ใช้รูปโปรไฟล์เดิม';
            cloudBtn.classList.add('bg-slate-700', 'text-white');
            cloudBtn.classList.remove('bg-green-600', 'opacity-40');
            cloudBtn.disabled = true;
        }
    } else {
        if (autoBanner) { autoBanner.classList.add('hidden'); autoBanner.classList.remove('flex'); }
        if (missingBanner) { missingBanner.classList.remove('hidden'); missingBanner.classList.add('flex'); }
        if (previewImg) {
            previewImg.src = '';
            previewImg.classList.add('hidden');
            delete previewImg.dataset.url;
        }
    }
}

// ==========================================
// 4. เริ่มต้นฟอร์ม
// ==========================================
// 1. แก้ไข initForm (ไม่เรียก initMap)
function initForm() {
    initPlugins();
    initAllTomSelects();
    initDirtyTracking();
    goToStep(1);  // เริ่มที่ step 1 (ไม่ต้อง initMap)
}

// ==========================================
// 5. โหลดข้อมูลเยี่ยมบ้านเดิม + ตรวจสอบ Lock
// ==========================================
async function loadExistingHomeVisit(studentId) {
    try {
        let query = db.from('module_home_visits')
            .select('*')
            .eq('student_id', studentId);
        if (currentYear) query = query.eq('academic_year', currentYear);
        if (currentTerm) query = query.eq('semester', currentTerm);
        const { data: records, error } = await query
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        const data = records && records.length > 0 ? records[0] : null;
        if (data) {
            isVerified = data.is_verified || false;
            populateFormWithData(data);
            updateStatusBadge('completed');
            applyStudentLockState();
        } else {
            isVerified = false;
            updateStatusBadge('empty');
            applyStudentLockState();
        }
    } catch (err) {
        console.error('loadExistingHomeVisit error:', err);
    }
}

// ==========================================
// 6. ล็อกฟอร์ม (สำหรับนักเรียน)
// ==========================================
function applyStudentLockState() {
    const form = document.getElementById('homeVisitForm');
    const banner = document.getElementById('lock-banner');
    const submitBtn = document.getElementById('btn-student-submit');

    if (isVerified) {
        banner.classList.remove('hidden');
        form.querySelectorAll('input, textarea, select, button').forEach(el => {
            if (el.type !== 'file') {
                el.disabled = true;
                el.classList.add('opacity-60', 'cursor-not-allowed');
            }
        });
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-40', 'cursor-not-allowed');
        }
    } else {
        banner.classList.add('hidden');
        form.querySelectorAll('input, textarea, select, button').forEach(el => {
            if (el.type !== 'file') {
                el.disabled = false;
                el.classList.remove('opacity-60', 'cursor-not-allowed');
            }
        });
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        }
    }
}

// ==========================================
// 7. populateFormWithData (เหมือนครู)
// ==========================================
function populateFormWithData(data) {
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
    setVal('member_total', fm.total); setVal('member_male', fm.male); setVal('member_female', fm.female);
    setVal('sib_same_total', fm.sib_same_total); setVal('sib_same_male', fm.sib_same_male); setVal('sib_same_female', fm.sib_same_female);
    setVal('sib_diff_total', fm.sib_diff_total); setVal('sib_diff_male', fm.sib_diff_male); setVal('sib_diff_female', fm.sib_diff_female);

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

    const risk = data.risk_data || data.risk_factors || {};
    const riskGroups = ['health', 'welfare', 'responsibilities', 'hobbies', 'drugs', 'violence', 'sex', 'gaming', 'communication'];
    riskGroups.forEach(group => {
        const values = risk[group] || [];
        values.forEach(val => {
            let pureVal = val;
            let otherText = '';
            if (val.startsWith('อื่นๆ:')) { pureVal = 'อื่นๆ ระบุ...'; otherText = val.replace('อื่นๆ:', '').trim(); }
            const el = document.querySelector(`input[name="risk_${group}"][value="${pureVal}"]`);
            if (el) { el.checked = true; if (pureVal === 'อื่นๆ ระบุ...') { const oi = document.getElementById(`risk_${group}_other_txt`); if (oi) { oi.value = otherText; oi.classList.remove('hidden'); } } }
        });
    });

    if (risk.internet_access) {
        const radio = document.querySelector(`input[name="internet_access"][value="${risk.internet_access}"]`);
        if (radio) radio.checked = true;
    }

    setVal('special_help_details', data.special_help_details);
    setVal('responsibilities_details', data.responsibilities_details);
    setVal('hobbies_details', data.hobbies_details);
    if (data.leave_with_whom_details) window.tomLeaveWithWhom?.setValue(data.leave_with_whom_details, true);
    setVal('guardian_concerns_details', data.guardian_concerns);
    setVal('guardian_requests_details', data.guardian_requests);
    setVal('past_welfare_details', data.past_welfare);
    if (data.informant_type) window.tomInformantType?.setValue(data.informant_type, true);

    const loadPic = (id, previewId, btnId, delId, url) => {
        const input = document.getElementById(id);
        if (!input) return;
        if (url && url !== 'null' && url !== '-') {
            input.dataset.uploadedUrl = url;
            const img = document.getElementById(previewId);
            if (img) {
                img.src = url;
                img.classList.remove('hidden');
                img.dataset.url = url;
            }
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

    if (data.photo_student) {
        const s1Img = document.getElementById('student-avatar-img');
        const s1Placeholder = document.getElementById('student-avatar-placeholder');
        const s1Badge = document.getElementById('student-avatar-badge');
        const s1Status = document.getElementById('student-avatar-status');
        if (s1Img) { s1Img.src = data.photo_student; s1Img.classList.remove('hidden'); }
        if (s1Placeholder) s1Placeholder.classList.add('hidden');
        if (s1Badge) s1Badge.classList.remove('hidden');
        if (s1Status) s1Status.textContent = 'มีรูปโปรไฟล์แล้ว ✓';
    }

    if (data.latitude && data.longitude && map) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 15);
            calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
        }
    }
    suppressDirty = false;
    formIsDirty = false;
}

// ==========================================
// 8. ฟังก์ชันดึง teacher_id จากห้องเรียน (แก้ RLS)
// ==========================================
async function getAdvisorId(classroomId) {
    if (!classroomId) return null;
    try {
        const { data, error } = await db
            .from('core_classrooms')
            .select('adviser_id_1')
            .eq('id', classroomId)
            .single();
        if (error || !data) return null;
        return data.adviser_id_1; // ถ้าต้องการ adviser_id_2 ก็สามารถปรับได้
    } catch (err) {
        console.warn('ไม่สามารถดึง teacher_id:', err);
        return null;
    }
}

// ==========================================
// 9. buildFormData (ปรับให้รับ teacherId)
// ==========================================
function buildFormData(studentId, classroomId, teacherId) {
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
        student_id: studentId,
        classroom_id: classroomId,
        teacher_id: teacherId, // ใช้ teacherId ที่ส่งเข้ามา (อาจเป็น null)
        academic_year: currentYear,
        semester: currentTerm,
        visit_date: getVal('hv_date') || new Date().toISOString().split('T')[0],
        visit_status: getRadio('visit_status') || 'เยี่ยมแล้ว',
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
        living_with: window.tomLivingWith?.getValue() || '',
        parents_status: window.tomParentsStatus?.getValue() || '',
        house_number: getVal('addr_house'),
        village_no: getVal('addr_moo'),
        sub_district: getVal('addr_subdistrict'),
        district: getVal('addr_district'),
        province: getVal('addr_province'),
        zipcode: getVal('addr_zipcode'),
        latitude: getVal('lat') || null,
        longitude: getVal('lng') || null,
        travel_distance: getVal('travel_distance') || null,
        house_type: window.tomHouseType?.getValue() || '',
        travel_hour: parseInt(getVal('travel_hour')) || 0,
        travel_minute: parseInt(getVal('travel_minute')) || 0,
        travel_method: window.tomTravelMethod?.getValue() || '',
        env_house_status: window.tomEnvHouseStatus?.getValue() || '',
        env_clean_status: window.tomEnvCleanStatus?.getValue() || '',
        env_location_status: window.tomEnvLocationStatus?.getValue() || '',
        utility_electric: getRadio('utility_electric'),
        utility_water: getRadio('utility_water'),
        utility_toilet: getRadio('utility_toilet'),
        family_members: {
            total: getVal('member_total'),
            male: getVal('member_male'),
            female: getVal('member_female'),
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
            student_job_name: getVal('student_job_name'),
            student_job_income: getVal('student_job_income'),
            money_to_school: getVal('money_to_school'),
        },
        family_relations: {
            status: window.tomFamilyRelationStatus?.getValue() || '',
            time_together: getVal('time_together_hours')
        },
        special_help_details: getVal('special_help_details'),
        responsibilities_details: getVal('responsibilities_details'),
        hobbies_details: getVal('hobbies_details'),
        leave_with_whom_details: window.tomLeaveWithWhom?.getValue() || '',
        photo_student: document.getElementById('pic_student')?.dataset.uploadedUrl || null,
        photo_outside: document.getElementById('pic_outside')?.dataset.uploadedUrl || null,
        photo_inside: document.getElementById('pic_inside')?.dataset.uploadedUrl || null,
        photo_teacher: document.getElementById('pic_teacher')?.dataset.uploadedUrl || null,
        guardian_concerns: getVal('guardian_concerns_details'),
        guardian_requests: getVal('guardian_requests_details'),
        past_welfare: getVal('past_welfare_details'),
        informant_type: window.tomInformantType?.getValue() || '',
        risk_data: riskData,
        relations_data: relations,
        updated_at: new Date().toISOString()
    };
}

// ==========================================
// 10. submitHomeVisit (พร้อมเช็ค Lock และดึง teacher_id)
// ==========================================
window.submitHomeVisit = async function () {
    if (isSubmitting) return;
    if (!currentStudentId || !currentClassroomId) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียนหรือห้องเรียน', 'warning');
        return;
    }

    if (isVerified) {
        Swal.fire('ไม่สามารถแก้ไขได้', 'ข้อมูลนี้ถูกล็อกโดยครูแล้ว กรุณาติดต่อครูหากต้องการเปลี่ยนแปลง', 'warning');
        return;
    }

    isSubmitting = true;
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ดึง teacher_id จากห้องเรียน (แก้ RLS)
        let teacherId = await getAdvisorId(currentClassroomId);
        if (!teacherId) {
            // ถ้าไม่มีครูที่ปรึกษา (กรณี error) ให้แจ้งเตือนและหยุด
            Swal.close();
            Swal.fire({
                icon: 'warning',
                title: 'ไม่พบครูที่ปรึกษา',
                text: 'ระบบไม่พบครูที่ปรึกษาของห้องนี้ กรุณาติดต่อผู้ดูแลระบบ',
                confirmButtonText: 'ตกลง'
            });
            isSubmitting = false;
            return;
        }

        const formData = buildFormData(currentStudentId, currentClassroomId, teacherId);

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

        if (saveError) {
            // ถ้า error เกิดจาก RLS (เช่น teacher_id ไม่ถูกต้อง) ให้แจ้งให้ชัดเจน
            if (saveError.message && saveError.message.includes('permission denied')) {
                throw new Error('ไม่มีสิทธิ์บันทึกข้อมูล กรุณาติดต่อครูที่ปรึกษา');
            }
            throw saveError;
        }
        if (!savedData || savedData.length === 0) {
            throw new Error('ไม่สามารถบันทึกข้อมูล (อาจถูก RLS ปิดกั้น)');
        }

        formIsDirty = false;
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'ข้อมูลการเยี่ยมบ้านของนักเรียนถูกบันทึกแล้ว', confirmButtonText: 'ตกลง' });
        goToStep(1);
        updateStatusBadge('completed');
        await loadExistingHomeVisit(currentStudentId);

    } catch (err) {
        console.error('Submit error:', err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
        isSubmitting = false;
    }
};

// ==========================================
// 11. ฟังก์ชัน Auto Save (ปรับให้ใช้ teacher_id เช่นกัน)
// ==========================================
let isAutoSaving = false;

async function autoSaveStep() {
    if (!formIsDirty || !currentStudentId || !currentClassroomId || isVerified) {
        return true;
    }

    if (isAutoSaving) return true;

    isAutoSaving = true;
    try {
        let teacherId = await getAdvisorId(currentClassroomId);
        if (!teacherId) {
            // ถ้าไม่มี teacher_id ไม่ต้อง auto save (เดี๋ยว submit เอง)
            return true;
        }

        const formData = buildFormData(currentStudentId, currentClassroomId, teacherId);

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

        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'success',
            title: 'บันทึกอัตโนมัติสำเร็จ',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
        });
        return true;
    } catch (err) {
        console.error('Auto-save step error:', err);
        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'warning',
            title: 'บันทึกอัตโนมัติล้มเหลว',
            text: err.message || 'กรุณาบันทึกด้วยตนเอง',
            showConfirmButton: false,
            timer: 3000,
        });
        return false;
    } finally {
        isAutoSaving = false;
    }
}

// ==========================================
// 12. ฟังก์ชันเสริม (markDirty, initDirtyTracking)
// ==========================================
function markDirty() {
    if (suppressDirty || !currentStudentId) return;
    if (formIsDirty) return;
    formIsDirty = true;
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (badge && text) {
        badge.className = 'px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-center border border-orange-100';
        text.innerHTML = '<i class="fas fa-circle text-orange-400 text-[8px] mr-1 animate-pulse"></i> มีการแก้ไข (ยังไม่บันทึก)';
    }
}

function initDirtyTracking() {
    const formContainer = document.getElementById('homeVisitForm');
    if (!formContainer) return;
    formContainer.addEventListener('input', () => markDirty());
    formContainer.addEventListener('change', () => markDirty());
    window.addEventListener('beforeunload', (e) => {
        if (formIsDirty) { e.preventDefault(); e.returnValue = ''; }
    });
}

// ==========================================
// 13. Step Navigation (ปลอดภัย)
// ==========================================
// ==========================================
// 13. Step Navigation (แก้ไขให้เรียกแผนที่ง่ายขึ้น)
// ==========================================
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
            const config = window.stepColorConfigs[i];
            if (i <= step) {
                circle.className = `w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-md transition-all ${config.bg} ${config.shadow}`;
                text.className = `text-xs font-black transition-colors ${config.text}`;
            } else {
                circle.className = 'w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg bg-slate-100 text-slate-400 transition-all';
                text.className = 'text-xs font-bold text-slate-400 transition-colors';
            }
        }
    }

    // แก้ไข: เมื่อไป Step 2 ให้รอ 200ms แล้วเรียก initMap ทันที (ไม่ต้องเช็คขนาดซับซ้อน)
    if (step === 2) {
        setTimeout(() => {
            initMap();
        }, 200);
    }
};

// ==========================================
// initMap (เวอร์ชันแก้ไข - ใช้ตัวแปร Global map/marker)
// ==========================================
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) {
        console.error('ไม่พบ element #map');
        return;
    }

    // ✅ ถ้ามีแผนที่อยู่แล้ว ให้ invalidateSize เฉยๆ
    if (map) {
        map.invalidateSize();
        return;
    }

    // ✅ ตรวจสอบว่า Leaflet โหลดแล้วหรือยัง
    if (typeof L === 'undefined') {
        console.warn('Leaflet ยังไม่โหลด');
        return;
    }

    try {
        // ✅ ใช้ตัวแปร map (Global) ไม่ใช่ window.map
        map = L.map(mapEl).setView([SCHOOL_LAT, SCHOOL_LNG], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        const schoolIcon = L.divIcon({
            html: `<div style="width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:26px solid #dc2626;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));position:relative;"><div style="position:absolute;bottom:-24px;left:-6px;width:12px;height:12px;background:#fff;border-radius:50%;"></div></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 26],
            className: ''
        });

        L.marker([SCHOOL_LAT, SCHOOL_LNG], { icon: schoolIcon, draggable: false })
            .addTo(map)
            .bindTooltip(`🏫 ${SCHOOL_NAME}`, { permanent: false, direction: 'top' });

        const homeIcon = L.divIcon({
            html: `<div style="width:22px;height:22px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.6);"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            className: ''
        });

        const latInput = document.getElementById('lat');
        const lngInput = document.getElementById('lng');
        const hasCoords = latInput?.value && lngInput?.value;
        const homeLat = hasCoords ? parseFloat(latInput.value) : SCHOOL_LAT;
        const homeLng = hasCoords ? parseFloat(lngInput.value) : SCHOOL_LNG;

        marker = L.marker([homeLat, homeLng], { icon: homeIcon, draggable: true })
            .addTo(map)
            .bindTooltip('🏠 บ้านนักเรียน', { permanent: false, direction: 'top' });

        marker.on('dragend', function () {
            const pos = marker.getLatLng();
            document.getElementById('lat').value = pos.lat.toFixed(7);
            document.getElementById('lng').value = pos.lng.toFixed(7);
            calculateRoute(SCHOOL_LAT, SCHOOL_LNG, pos.lat, pos.lng);
        });

        $('#lat, #lng').off('input').on('input', function () {
            const lat = parseFloat($('#lat').val());
            const lng = parseFloat($('#lng').val());
            if (!isNaN(lat) && !isNaN(lng) && marker) {
                marker.setLatLng([lat, lng]);
                map.setView([lat, lng], map.getZoom());
                calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
            }
        });

        if (hasCoords && !isNaN(homeLat) && !isNaN(homeLng)) {
            calculateRoute(SCHOOL_LAT, SCHOOL_LNG, homeLat, homeLng);
        } else {
            updateRouteInfoPanel(null);
        }

        // บังคับปรับขนาดอีกครั้ง
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 300);

        console.log('✅ แผนที่ถูกสร้างเรียบร้อย');

    } catch (e) {
        console.error('Error initializing map:', e);
    }
}

window.nextStep = async function (step) {
    await autoSaveStep();
    goToStep(step);
};

window.prevStep = function (step) { goToStep(step); };

// ==========================================
// 14. Plugins (Flatpickr, Thailand.js)
// ==========================================
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

// ==========================================
// 16. Route (OSRM)
// ==========================================
async function calculateRoute(fromLat, fromLng, toLat, toLng) {
    const panel = document.getElementById('route-info-panel');
    if (panel) {
        panel.innerHTML = `<div class="flex items-center gap-2 text-orange-500 text-sm font-bold py-2 animate-pulse"><i class="fas fa-spinner fa-spin"></i> กำลังคำนวณเส้นทาง...</div>`;
    }
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length) {
            updateRouteInfoPanel(null);
            return;
        }

        const route = data.routes[0];
        const distanceKm = (route.distance / 1000).toFixed(2);
        const durationMin = Math.round(route.duration / 60);

        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(route.geometry, {
            style: { color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
        }).addTo(map);

        const bounds = L.latLngBounds([fromLat, fromLng], [toLat, toLng]);
        map.fitBounds(bounds, { padding: [50, 50] });

        document.getElementById('travel_distance').value = distanceKm;
        document.getElementById('travel_hour').value = Math.floor(durationMin / 60);
        document.getElementById('travel_minute').value = durationMin % 60;

        updateRouteInfoPanel({ distanceKm, durationMin, toLat, toLng });
    } catch (e) {
        console.error('Route calculation error:', e);
        updateRouteInfoPanel(null);
    }
}

function updateRouteInfoPanel(info) {
    const panel = document.getElementById('route-info-panel');
    if (!panel) return;
    const latVal = document.getElementById('lat')?.value || '';
    const lngVal = document.getElementById('lng')?.value || '';

    if (!info) {
        panel.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">📍 พิกัดโรงเรียน</p><p class="font-mono text-xs font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p></div><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">🏠 พิกัดบ้านนักเรียน</p><p class="font-mono text-xs font-bold text-slate-400">${latVal ? latVal + ', ' + lngVal : 'ยังไม่ได้ปักหมุด'}</p></div></div>`;
        return;
    }

    const hrs = Math.floor(info.durationMin / 60);
    const mins = info.durationMin % 60;
    const timeStr = hrs > 0 ? `${hrs} ชั่วโมง ${mins} นาที` : `${mins} นาที`;

    panel.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 text-xs">
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5"><span class="inline-block w-3 h-3 bg-red-600 rounded-sm" style="clip-path:polygon(50% 0%,100% 100%,0% 100%)"></span> โรงเรียน</p><p class="font-bold text-slate-700">${SCHOOL_NAME}</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดโรงเรียน</p><p class="font-mono font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5"><span class="inline-block w-3 h-3 bg-blue-600 rounded-full"></span> บ้านนักเรียน</p><p class="font-bold text-slate-700">-</p></div>
            <div><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดบ้านนักเรียน</p><p class="font-mono font-bold text-slate-600">${parseFloat(info.toLat).toFixed(5)}, ${parseFloat(info.toLng).toFixed(5)}</p></div>
        </div>
        <div class="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-3">
            <i class="fas fa-route text-orange-500 text-2xl flex-shrink-0"></i>
            <div class="flex-1"><p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">ระยะถนนจริง</p><p class="text-2xl font-black text-orange-700 leading-tight">${info.distanceKm} <span class="text-base font-bold text-orange-600">กิโลเมตร</span> <span class="text-sm font-bold text-slate-500 ml-2">(ระยะทางถนนจริง — ประมาณ ${info.durationMin} นาที)</span></p></div>
            <div class="flex gap-3 text-center flex-shrink-0"><div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm"><i class="fas fa-car text-orange-500 text-sm"></i><p class="text-xs font-black text-orange-700 mt-0.5">${info.distanceKm} กม.</p></div><div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm"><i class="fas fa-clock text-orange-500 text-sm"></i><p class="text-xs font-black text-orange-700 mt-0.5">ประมาณ ${timeStr}</p></div></div>
        </div>`;
}

// ==========================================
// 17. Map Helpers (geocode, pin, Google Maps)
// ==========================================
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
                    calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
                }
            } else {
                Swal.fire('ไม่พบ', 'ไม่พบพิกัดจากที่อยู่นี้', 'warning');
            }
        });
};

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
    if (map && marker) { // ✅ ใช้ map, marker
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 13);
        calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
    }
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `ปักหมุดแล้ว: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, showConfirmButton: false, timer: 2500 });
};

window.openInGoogleMaps = function () {
    const house = document.getElementById('addr_house').value;
    const subdistrict = document.getElementById('addr_subdistrict').value;
    const district = document.getElementById('addr_district').value;
    const province = document.getElementById('addr_province').value;
    const address = `${house}, ${subdistrict}, ${district}, ${province}, Thailand`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
};

window.openRouteInGoogleMaps = function () {
    const lat = parseFloat(document.getElementById('lat')?.value);
    const lng = parseFloat(document.getElementById('lng')?.value);
    if (isNaN(lat) || isNaN(lng) || !lat || !lng) {
        Swal.fire({ icon: 'warning', title: 'ยังไม่มีพิกัดบ้าน', text: 'กรุณาปักหมุดบ้านนักเรียน หรือกรอกละติจูด/ลองจิจูด ก่อน', confirmButtonText: 'ตกลง' });
        return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${SCHOOL_LAT},${SCHOOL_LNG}&destination=${lat},${lng}&travelmode=driving`, '_blank');
};

// ==========================================
// 18. Upload (ฟังก์ชันจาก homevisit_upload.js)
// ฟังก์ชันเหล่านี้ถูกประกาศใน homevisit_upload.js แล้ว ไม่ต้องประกาศซ้ำ
// ==========================================

// ==========================================
// 19. Other Helpers
// ==========================================
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
// 20. TomSelect
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

    window.tomLivingWith = new TomSelect('#living_with', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.living_with.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('living_with', 'living_with_other', val) });
    window.tomParentsStatus = new TomSelect('#parents_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.parents_status.map(v => ({ value: v, text: v })), dropdownParent: 'body' });
    window.tomHouseType = new TomSelect('#house_type', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.house_type.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('house_type', 'house_type_other', val) });
    window.tomTravelMethod = new TomSelect('#travel_method', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.travel_method.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('travel_method', 'travel_method_other', val) });
    window.tomEnvHouseStatus = new TomSelect('#env_house_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_house_status.map(v => ({ value: v, text: v })), dropdownParent: 'body' });
    window.tomEnvCleanStatus = new TomSelect('#env_clean_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_clean_status.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('env_clean_status', 'env_clean_other', val) });
    window.tomEnvLocationStatus = new TomSelect('#env_location_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.env_location_status.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('env_location_status', 'env_location_other', val) });
    window.tomInformantType = new TomSelect('#informant_type', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.informant_type.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('informant_type', 'informant_type_other', val) });
    window.tomFamilyRelationStatus = new TomSelect('#family_relation_status', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.family_relation_status.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('family_relation_status', 'family_relation_other', val) });
    window.tomLeaveWithWhom = new TomSelect('#leave_with_whom_details', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.leave_with_whom.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('leave_with_whom_details', 'leave_with_whom_other', val) });
    window.tomAllowanceSource = new TomSelect('#student_allowance_source', { create: false, placeholder: '-- เลือก --', options: dropdownOptions.allowance_source.map(v => ({ value: v, text: v })), dropdownParent: 'body', onChange: (val) => toggleOtherInput('student_allowance_source', 'student_allowance_source_other', val) });
}

// ==========================================
// 21. Status Badge
// ==========================================
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

// ==========================================
// 22. Logout
// ==========================================
async function logout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) {
        await db.auth.signOut();
        window.location.href = 'login.html';
    }
}
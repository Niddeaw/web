// ==========================================
// homevisit.js (ฉบับแก้ไข) 10/6/2026
// ==========================================

let currentUser = null;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_url: "", gd_pdf_folder_id: "", report_template_id: "" };
let map, marker;
let routeLayer = null;
let schoolMarkerObj = null;

// ==========================================
// Auto-Save: ติดตามสถานะ Dirty ของฟอร์ม
// ==========================================
let formIsDirty = false;       // true = มีการแก้ไขที่ยังไม่ได้บันทึก
let suppressDirty = false;     // true = กำลัง populate/clear → ไม่นับว่า dirty
// ====================================================
// 🏫 พิกัดโรงเรียน — แก้ไขค่านี้ให้ตรงกับโรงเรียนจริง
// ====================================================
const SCHOOL_LAT = 13.740269204697068;
const SCHOOL_LNG = 100.25988109513965;
const SCHOOL_NAME = 'โรงเรียนวัดไร่ขิงวิทยา';
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
        initDirtyTracking();

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
// Auto-Save: ฟังก์ชันหลัก
// ==========================================

/** เปลี่ยนสถานะ dirty → แสดงจุดสีส้มบน status badge */
function markDirty() {
    if (suppressDirty || !currentStudentId) return;
    if (formIsDirty) return; // ไม่อัปเดต DOM ซ้ำ
    formIsDirty = true;
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (badge && text) {
        badge.className = 'px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-center border border-orange-100';
        text.innerHTML = '<i class="fas fa-circle text-orange-400 text-[8px] mr-1 animate-pulse"></i> มีการแก้ไข (ยังไม่บันทึก)';
    }
}

/** สร้าง payload จากฟอร์ม (ใช้ร่วมกันระหว่าง save ปกติ และ auto-save) */
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

/**
 * Auto-Save ถ้าฟอร์ม dirty — เรียกก่อนโหลดนักเรียนคนใหม่
 * ใช้ Toast แทน SweetAlert2
 */
async function autoSaveIfDirty() {
    if (!formIsDirty || !currentStudentId || !window.currentClassroomId || isReadOnly) return false;
    try {
        const formData = buildFormData(currentStudentId, window.currentClassroomId);

        // ✅ ตรวจสอบว่ามี record เดิมหรือเปล่าก่อน
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
        return true;   // ✅ บันทึกสำเร็จ → แจ้งให้ caller แสดง toast เอง
    } catch (err) {
        console.warn('Auto-save failed:', err);
        Swal.fire({
            toast: true, position: 'bottom-end', icon: 'warning',
            title: '<span class="text-sm">บันทึกอัตโนมัติไม่สำเร็จ กรุณาบันทึกด้วยตัวเอง</span>',
            showConfirmButton: false, timer: 3500,
        });
        return false;
    }
}

/**
 * ผูก Event Listener สำหรับ Dirty Tracking บนฟอร์มทั้งหมด
 * ใช้ Event Delegation — listener เดียว ครอบคลุมทุก field
 */
function initDirtyTracking() {
    const formContainer = document.getElementById('homeVisitForm');
    if (!formContainer) return;

    formContainer.addEventListener('input', () => markDirty());
    formContainer.addEventListener('change', () => markDirty());

    // ✅ เพิ่ม: แจ้งเตือนก่อนปิดหน้า/รีเฟรช/กด Back
    window.addEventListener('beforeunload', (e) => {
        if (formIsDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
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
            document.getElementById('btn-import-excel')?.classList.remove('hidden'); // <--- เพิ่มบรรทัดนี้
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
        applyReportVisibility(); // เพิ่มบรรทัดนี้ลงไปหลังจากโหลดค่าต่างๆ เสร็จ
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
        btn.innerHTML = currentViewRole === 'teacher' ? '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>' : '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
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
            onChange: async (val) => {
                if (val) {
                    // ✅ ถ้ามีข้อมูลที่ยังไม่ได้บันทึก → แสดง SweetAlert ยืนยันก่อนเปลี่ยนนักเรียน
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
                            // ✅ กด "ยกเลิก" → คืนค่า TomSelect กลับเป็นนักเรียนคนเดิม
                            studentTomSelect.setValue(currentStudentId, true); // silent=true ป้องกัน onChange วนซ้ำ
                            return;
                        }

                        if (result.isConfirmed) {
                            // ✅ กด "บันทึกแล้วเปลี่ยน" → บันทึกก่อน แล้วค่อยเปลี่ยน
                            const didSave = await autoSaveIfDirty();
                            await loadStudentInfo(val);
                            if (didSave) {
                                Swal.fire({
                                    toast: true, position: 'bottom-end', icon: 'success',
                                    title: '<span class="text-sm">บันทึกอัตโนมัติเรียบร้อยแล้ว</span>',
                                    showConfirmButton: false, timer: 2500, timerProgressBar: true,
                                });
                            }
                            return;
                        }

                        // ✅ กด "เปลี่ยนโดยไม่บันทึก" → ล้าง dirty แล้วโหลดคนใหม่เลย
                        formIsDirty = false;
                        await loadStudentInfo(val);
                        return;
                    }

                    // ไม่มี dirty → โหลดคนใหม่ตรงๆ
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
    // ✅ ป้องกัน dirty tracking ตลอด flow การโหลดข้อมูลนักเรียน
    suppressDirty = true;
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

    // ==========================================
    // ✅ ดึงรูปโปรไฟล์นักเรียน → แสดงทั้ง Step 1 และ Step 4
    // ==========================================
    const avatarUrl = enroll.core_students?.avatar_students_url;
    const studentPicInput = document.getElementById('pic_student');

    // --- Step 1: แสดงรูปในกรอบโปรไฟล์ ---
    const avatarImg = document.getElementById('student-avatar-img');
    const avatarPlaceholder = document.getElementById('student-avatar-placeholder');
    const avatarBadge = document.getElementById('student-avatar-badge');
    const avatarStatus = document.getElementById('student-avatar-status');

    if (avatarUrl) {
        if (avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.classList.remove('hidden');
        }
        if (avatarPlaceholder) avatarPlaceholder.classList.add('hidden');
        if (avatarBadge) avatarBadge.classList.remove('hidden');
        if (avatarStatus) avatarStatus.textContent = 'มีรูปโปรไฟล์แล้ว ✓';
    } else {
        if (avatarImg) { avatarImg.src = ''; avatarImg.classList.add('hidden'); }
        if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
        if (avatarBadge) avatarBadge.classList.add('hidden');
        if (avatarStatus) avatarStatus.textContent = 'ยังไม่มีรูปโปรไฟล์';
    }

    // --- Step 4: แสดงรูปในการ์ดอัปโหลด ---
    if (studentPicInput) {
        const previewImg = document.getElementById('preview1');
        const delBtn = document.getElementById('del_btn1');
        const cloudBtn = document.getElementById('cloud_btn1');

        if (avatarUrl) {
            studentPicInput.dataset.uploadedUrl = avatarUrl;

            if (previewImg) {
                previewImg.src = avatarUrl;
                previewImg.classList.remove('hidden');
            }
            if (delBtn) {
                delBtn.classList.remove('hidden');
                delBtn.classList.add('flex');
            }
            if (cloudBtn) {
                cloudBtn.innerHTML = `<i class="fa-solid fa-check text-green-400"></i> ใช้รูปโปรไฟล์เดิม`;
                cloudBtn.classList.add('bg-slate-700', 'text-white');
                cloudBtn.classList.remove('bg-green-600', 'opacity-40');
                cloudBtn.disabled = true;
            }
        } else {
            delete studentPicInput.dataset.uploadedUrl;
            if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
            if (delBtn) { delBtn.classList.add('hidden'); delBtn.classList.remove('flex'); }
            if (cloudBtn) {
                cloudBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้`;
                cloudBtn.classList.add('bg-green-600', 'text-white', 'opacity-40');
                cloudBtn.classList.remove('bg-slate-700');
                cloudBtn.disabled = true;
            }
        }
    }
    // ==========================================

    await loadExistingHomeVisit(studentId);
    Swal.close();
}

function clearStudentInfo() {
    suppressDirty = true;   // ✅ ป้องกัน clear form ถูกนับว่า dirty
    currentStudentId = null;
    formIsDirty = false;

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

    // เคลียร์รูปโปรไฟล์ Step 1
    const avatarImg = document.getElementById('student-avatar-img');
    const avatarPlaceholder = document.getElementById('student-avatar-placeholder');
    const avatarBadge = document.getElementById('student-avatar-badge');
    const avatarStatus = document.getElementById('student-avatar-status');
    if (avatarImg) { avatarImg.src = ''; avatarImg.classList.add('hidden'); }
    if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
    if (avatarBadge) avatarBadge.classList.add('hidden');
    if (avatarStatus) avatarStatus.textContent = '— เลือกนักเรียนเพื่อดูรูป —';

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
            cloudBtn.classList.add('opacity-40', 'bg-green-600', 'text-white');
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
        marker.setLatLng([SCHOOL_LAT, SCHOOL_LNG]);
        map.setView([SCHOOL_LAT, SCHOOL_LNG], 10);
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        updateRouteInfoPanel(null);
    }

    // ⚠️ ไม่ reset suppressDirty = false ที่นี่
    // เพราะ loadStudentInfo จะเรียก loadExistingHomeVisit ต่อทันที
    // suppressDirty จะถูก reset = false ใน loadExistingHomeVisit เท่านั้น
    // (กรณีเรียก clearStudentInfo โดยตรงโดยไม่โหลดนักเรียนใหม่ เช่นเมื่อ val = '' จะไม่มีปัญหา)
    suppressDirty = false;
}

// async function loadExistingHomeVisit(studentId) {
//     const { data, error } = await db.from('module_home_visits')
//         .select('*').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();
//     if (data && !error) {
//         Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'พบข้อมูลเยี่ยมบ้านเดิม ระบบทำการโหลดให้แล้ว', showConfirmButton: false, timer: 3000 });
//         populateFormWithData(data);
//     }
// }
async function loadExistingHomeVisit(studentId) {
    try {
        // 🛑 เปลี่ยนมาใช้ .limit(1) ป้องกันระบบค้างกรณีมีข้อมูลเก่าซ้ำซ้อนกัน
        const { data: records, error } = await db.from('module_home_visits')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);

        if (error) throw error;
        
        const data = records && records.length > 0 ? records[0] : null;
        if (!data) {
            // ไม่มีข้อมูลเดิม → reset suppressDirty แล้ว return
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

        if (data.latitude && data.longitude && map) {
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                marker.setLatLng([lat, lng]);
                map.setView([lat, lng], 16);
            }
        }

        const loadPic = (id, previewId, btnId, delId, url) => {
            const input = document.getElementById(id);
            if (!input) return;
            if (url && url !== 'null' && url !== '-') {
                input.dataset.uploadedUrl = url;
                const img = document.getElementById(previewId);
                if (img) { img.src = url; img.classList.remove('hidden'); }
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

        // ✅ อัปเดต status badge ให้แสดงว่ามีข้อมูลแล้ว
        updateStatusBadge('completed');

    } catch (err) {
        console.error('Error loading existing home visit:', err);
        suppressDirty = false;
        formIsDirty = false;
    }
}

// ==========================================
// ภาค 2/3: Submit, Upload, Map, Step Navigator, Admin Modal
// ==========================================
function populateFormWithData(data) {
    suppressDirty = true;   // ✅ ป้องกัน populate ถูกนับว่า dirty
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

    // ซิงค์รูปนักเรียน → กรอบโปรไฟล์ Step 1
    const s1Img = document.getElementById('student-avatar-img');
    const s1Placeholder = document.getElementById('student-avatar-placeholder');
    const s1Badge = document.getElementById('student-avatar-badge');
    const s1Status = document.getElementById('student-avatar-status');
    if (data.photo_student) {
        if (s1Img) { s1Img.src = data.photo_student; s1Img.classList.remove('hidden'); }
        if (s1Placeholder) s1Placeholder.classList.add('hidden');
        if (s1Badge) s1Badge.classList.remove('hidden');
        if (s1Status) s1Status.textContent = 'มีรูปโปรไฟล์แล้ว ✓';
    }

    // ---------- 4. RESTORE พิกัด (Lat/Lng) ----------
    if (data.latitude && data.longitude) {
        setVal('lat', data.latitude);
        setVal('lng', data.longitude);
        if (map && marker) {
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 15);
            calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
        }
    }

    suppressDirty = false;  // ✅ เปิดการติดตาม dirty อีกครั้ง
    formIsDirty = false;    // ✅ เพิ่งโหลดข้อมูลเดิมมา ถือว่ายังไม่ dirty
}

// window.submitHomeVisit = async function () {
//     if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

//     const studentId = document.getElementById('hv_student').value;
//     const classroomId = window.currentClassroomId;
//     if (!studentId || !classroomId) return Swal.fire('ผิดพลาด', 'กรุณาเลือกห้องเรียนและนักเรียน', 'warning');

//     Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

//     // ✅ ใช้ buildFormData ร่วมกับ autoSave
//     const formData = buildFormData(studentId, classroomId);

//     try {
//         const { data: existing } = await db.from('module_home_visits')
//             .select('id').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).maybeSingle();
//         let resError;
//         if (existing) {
//             const { error } = await db.from('module_home_visits').update(formData).eq('id', existing.id);
//             resError = error;
//         } else {
//             const { error } = await db.from('module_home_visits').insert([formData]);
//             resError = error;
//         }
//         if (resError) throw resError;

//         formIsDirty = false;   // ✅ บันทึกสำเร็จ → reset dirty flag
//         // ✅ การบันทึกปกติ ใช้ SweetAlert2
//         Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกข้อมูลการเยี่ยมบ้านเรียบร้อย', confirmButtonText: 'ตกลง' });
//         goToStep(1);
//         updateStatusBadge('completed');
//         // ✅ เพิ่มบรรทัดนี้
//         if (typeof loadDataTable === 'function') loadDataTable();
//         console.log('Saving with year:', currentYear, 'term:', currentTerm);
//         console.log('Loading with year:', currentYear, 'term:', currentTerm);
//     } catch (err) {
//         console.error(err);
//         Swal.fire('ผิดพลาด', err.message, 'error');
//     }
// };
// ประกาศตัวแปรรักษาความปลอดภัยป้องกันการกดปุ่มซ้ำ
let isSubmitting = false;

window.submitHomeVisit = async function (isAutoSave = false) {
    if (isReadOnly) {
        if (!isAutoSave) Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');
        return;
    }
    
    // 🛑 ป้องกันการรันฟังก์ชันซ้ำซ้อนกัน (Double Submit)
    if (isSubmitting) return; 

    const studentId = currentStudentId;
    const classroomId = window.currentClassroomId;
    
    if (!studentId || !classroomId) {
        if (!isAutoSave) Swal.fire('ผิดพลาด', 'กรุณาเลือกห้องเรียนและนักเรียน', 'warning');
        return;
    }

    isSubmitting = true; // ล็อคระบบชั่วคราว

    try {
        // 🔍 Debug log — ช่วย diagnose ปัญหา
        console.log('[submitHomeVisit] studentId:', studentId, '| classroomId:', classroomId, '| year:', currentYear, '| term:', currentTerm, '| user:', currentUser?.id);

        if (!isAutoSave) {
            Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }

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

        // ✅ ดึง record ที่มีอยู่ก่อน (ถ้ามี) แล้วค่อย update หรือ insert
        // เพิ่ม .select() ทุก operation เพื่อตรวจสอบว่า write จริงๆ (ป้องกัน RLS block เงียบๆ)
        const { data: existingRecords, error: selectError } = await db
            .from('module_home_visits')
            .select('id')
            .eq('student_id', studentId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .limit(1);

        if (selectError) {
            console.error('Select error:', selectError);
            throw selectError;
        }

        const existingRow = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;
        let savedData, saveError;

        if (existingRow) {
            // UPDATE พร้อม .select() เพื่อตรวจสอบว่า write สำเร็จจริง
            const { data, error } = await db
                .from('module_home_visits')
                .update(formData)
                .eq('id', existingRow.id)
                .select('id');
            savedData = data;
            saveError = error;
        } else {
            // INSERT พร้อม .select() เพื่อตรวจสอบว่า write สำเร็จจริง
            const { data, error } = await db
                .from('module_home_visits')
                .insert([formData])
                .select('id');
            savedData = data;
            saveError = error;
        }

        if (saveError) {
            console.error('Save error:', saveError);
            throw saveError;
        }

        // ✅ ตรวจสอบว่า Supabase write data จริงๆ (ถ้า RLS block → savedData จะว่าง)
        if (!savedData || savedData.length === 0) {
            console.error('Save returned no rows — likely blocked by RLS policy');
            throw new Error('บันทึกไม่สำเร็จ — ระบบไม่ได้รับยืนยันการบันทึก กรุณาตรวจสอบสิทธิ์ (RLS Policy)');
        }

        console.log('✅ Saved successfully, row id:', savedData[0]?.id);
        
        formIsDirty = false; // รีเซ็ตการแก้ไขให้เป็น false

        if (isAutoSave) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'บันทึกข้อมูลอัตโนมัติสำเร็จ', showConfirmButton: false, timer: 1500 });
        } else {
            await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกข้อมูลการเยี่ยมบ้านเรียบร้อย', confirmButtonText: 'ตกลง' });
            goToStep(1);
            updateStatusBadge('completed');
            // ✅ Reload ข้อมูลจาก DB หลังบันทึก เพื่อให้ฟอร์มแสดงข้อมูลล่าสุด
            if (currentStudentId) {
                await loadExistingHomeVisit(currentStudentId);
            }
            if (typeof loadDataTable === 'function') loadDataTable();
        }

    } catch (err) {
        console.error('HomeVisit Save Error:', err);
        if (!isAutoSave) {
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } else {
            Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'บันทึกอัตโนมัติล้มเหลว', showConfirmButton: false, timer: 2500 });
            throw err; 
        }
    } finally {
        isSubmitting = false; // ปลดล็อคเมื่อทำงานเสร็จ
    }
};


// ==========================================
// ฟังก์ชันบีบอัดรูปภาพให้ไม่เกินขนาดที่กำหนด (หน่วยเป็น MB)
// ==========================================
async function compressImage(file, maxSizeMB = 2) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // ย่อขนาดความกว้าง/สูงสูงสุดที่ 1920px (เพื่อไม่ให้ภาพใหญ่เกินไป)
                const MAX_SIZE = 1920;
                if (width > height && width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.9; // เริ่มต้นที่คุณภาพ 90%
                let base64 = canvas.toDataURL('image/jpeg', quality);

                // ลดคุณภาพลงเรื่อยๆ จนกว่าขนาดจะต่ำกว่า maxSizeMB
                while (Math.round((base64.length * 3) / 4) / (1024 * 1024) > maxSizeMB && quality > 0.1) {
                    quality -= 0.1;
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }

                resolve(base64.split(',')[1]); // ส่งคืนเฉพาะส่วน Base64 (ไม่เอา Data URI)
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// ==========================================
// ระบบอัปโหลดรูปภาพ (แยกโฟลเดอร์ + บีบอัดภาพ)
// ==========================================
window.triggerSingleUpload = async function (event, inputId, type) {
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files[0];
    const studentId = document.getElementById('hv_student')?.value; // รหัส UUID
    const studentCode = document.getElementById('student_code')?.value; // รหัส 5 หลัก

    if (!file || !studentId || !studentCode) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนและไฟล์รูปภาพก่อนทำการอัพโหลด', 'warning');
    }

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัพโหลด...`;
    btn.disabled = true;

    // ดึงค่า URL และ โฟลเดอร์เยี่ยมบ้าน จากการตั้งค่าส่วนกลาง
    const GAS_URL = moduleSettings.gas_url;
    const FOLDER_HOMEVISIT = moduleSettings.drive_folder_id;
    const FOLDER_PROFILE = '168WCLk-GfvyGZnlE5ywGOVx2Qz8QRvnN'; // โฟลเดอร์รูปโปรไฟล์นักเรียน

    let targetFolderId = FOLDER_HOMEVISIT;
    let targetFileName = `HV_${studentCode}_${type}.jpg`;

    // ✅ แก้ไข: เช็ค type เป็น 'student_pic' ตามที่ส่งมาจาก HTML
    if (type === 'student_pic') {
        targetFolderId = FOLDER_PROFILE;
        targetFileName = `avatar_${studentCode}.jpg`;
    }

    try {
        // บีบอัดภาพให้ไม่เกิน 2MB (ฟังก์ชันที่วางไปก่อนหน้านี้)
        const compressedBase64 = await compressImage(file, 2);

        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({
                action: 'upload',
                base64: compressedBase64,
                fileName: targetFileName,
                folderId: targetFolderId
            }),
        });

        const res = await response.json();

        if (res.status === 'success' && res.url) {
            fileInput.dataset.uploadedUrl = res.url;

            // ✅ ถ้าเป็นรูปนักเรียน ให้ Update ลงตาราง core_students ด้วย
            if (type === 'student_pic') {
                await db.from('core_students')
                    .update({ avatar_students_url: res.url })
                    .eq('student_id_card', studentCode);
            }

            btn.innerHTML = `<i class="fa-solid fa-check text-green-400"></i> อัพโหลดสำเร็จ`;
            btn.classList.add('bg-slate-700', 'text-white');
            btn.classList.remove('bg-green-600', 'opacity-40');
        } else {
            throw new Error(res.message || "ไม่สามารถอัพโหลดได้");
        }
    } catch (err) {
        btn.innerHTML = originalText;
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

    // สร้างแผนที่โดยมีจุดศูนย์กลางที่โรงเรียน
    map = L.map('map').setView([SCHOOL_LAT, SCHOOL_LNG], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // ---- ไอคอนโรงเรียน (สีแดง รูปสามเหลี่ยม) ----
    const schoolIcon = L.divIcon({
        html: `<div style="
            width:0;height:0;
            border-left:14px solid transparent;
            border-right:14px solid transparent;
            border-bottom:26px solid #dc2626;
            filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            position:relative;">
            <div style="position:absolute;bottom:-24px;left:-6px;width:12px;height:12px;background:#fff;border-radius:50%;"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 26],
        className: ''
    });

    // ---- ไอคอนบ้านนักเรียน (สีน้ำเงิน วงกลม) ----
    const homeIcon = L.divIcon({
        html: `<div style="
            width:22px;height:22px;
            background:#2563eb;
            border-radius:50%;
            border:3px solid #fff;
            box-shadow:0 2px 8px rgba(37,99,235,0.6);">
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        className: ''
    });

    // หมุดโรงเรียน (คงที่)
    schoolMarkerObj = L.marker([SCHOOL_LAT, SCHOOL_LNG], { icon: schoolIcon, draggable: false })
        .addTo(map)
        .bindTooltip(`🏫 ${SCHOOL_NAME}`, { permanent: false, direction: 'top' });

    // ตรวจสอบว่ามีพิกัดบ้านอยู่แล้วหรือไม่
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    const hasCoords = latInput?.value && lngInput?.value;
    const homeLat = hasCoords ? parseFloat(latInput.value) : SCHOOL_LAT;
    const homeLng = hasCoords ? parseFloat(lngInput.value) : SCHOOL_LNG;

    // หมุดบ้านนักเรียน (ลากได้)
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
}

// ==========================================
// 📍 คำนวณเส้นทางจากโรงเรียน → บ้านนักเรียน
// ==========================================
async function calculateRoute(fromLat, fromLng, toLat, toLng) {
    const panel = document.getElementById('route-info-panel');
    if (panel) {
        panel.innerHTML = `<div class="flex items-center gap-2 text-orange-500 text-sm font-bold py-2 animate-pulse">
            <i class="fas fa-spinner fa-spin"></i> กำลังคำนวณเส้นทาง...
        </div>`;
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

        // วาดเส้นทางบนแผนที่
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(route.geometry, {
            style: { color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
        }).addTo(map);

        // ซูมให้เห็นทั้งสองจุด
        const bounds = L.latLngBounds([fromLat, fromLng], [toLat, toLng]);
        map.fitBounds(bounds, { padding: [50, 50] });

        // ✅ อัปเดต field ระยะทาง / เวลาเดินทาง อัตโนมัติ
        const distEl = document.getElementById('travel_distance');
        const hourEl = document.getElementById('travel_hour');
        const minEl = document.getElementById('travel_minute');
        if (distEl) distEl.value = distanceKm;
        if (hourEl) hourEl.value = Math.floor(durationMin / 60);
        if (minEl) minEl.value = durationMin % 60;

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
        panel.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">📍 พิกัดโรงเรียน</p>
                    <p class="font-mono text-xs font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p>
                </div>
                <div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">🏠 พิกัดบ้านนักเรียน</p>
                    <p class="font-mono text-xs font-bold text-slate-400">${latVal ? latVal + ', ' + lngVal : 'ยังไม่ได้ปักหมุด'}</p>
                </div>
            </div>`;
        return;
    }

    const hrs = Math.floor(info.durationMin / 60);
    const mins = info.durationMin % 60;
    const timeStr = hrs > 0 ? `${hrs} ชั่วโมง ${mins} นาที` : `${mins} นาที`;

    panel.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 text-xs">
            <div>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                    <span class="inline-block w-3 h-3 bg-red-600 rounded-sm" style="clip-path:polygon(50% 0%,100% 100%,0% 100%)"></span> โรงเรียน
                </p>
                <p class="font-bold text-slate-700">${SCHOOL_NAME}</p>
            </div>
            <div>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดโรงเรียน</p>
                <p class="font-mono font-bold text-slate-600">${SCHOOL_LAT}, ${SCHOOL_LNG}</p>
            </div>
            <div>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                    <span class="inline-block w-3 h-3 bg-blue-600 rounded-full"></span> บ้านนักเรียน
                </p>
                <p class="font-bold text-slate-700">-</p>
            </div>
            <div>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">พิกัดบ้านนักเรียน</p>
                <p class="font-mono font-bold text-slate-600">${parseFloat(info.toLat).toFixed(5)}, ${parseFloat(info.toLng).toFixed(5)}</p>
            </div>
        </div>
        <div class="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-3">
            <i class="fas fa-route text-orange-500 text-2xl flex-shrink-0"></i>
            <div class="flex-1">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">ระยะถนนจริง</p>
                <p class="text-2xl font-black text-orange-700 leading-tight">
                    ${info.distanceKm} <span class="text-base font-bold text-orange-600">กิโลเมตร</span>
                    <span class="text-sm font-bold text-slate-500 ml-2">(ระยะทางถนนจริง — ประมาณ ${info.durationMin} นาที)</span>
                </p>
            </div>
            <div class="flex gap-3 text-center flex-shrink-0">
                <div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm">
                    <i class="fas fa-car text-orange-500 text-sm"></i>
                    <p class="text-xs font-black text-orange-700 mt-0.5">${info.distanceKm} กม.</p>
                </div>
                <div class="bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-sm">
                    <i class="fas fa-clock text-orange-500 text-sm"></i>
                    <p class="text-xs font-black text-orange-700 mt-0.5">ประมาณ ${timeStr}</p>
                </div>
            </div>
        </div>`;
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
                    calculateRoute(SCHOOL_LAT, SCHOOL_LNG, lat, lng);
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
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
};

// ==========================================
// เปิดเส้นทางใน Google Maps (โรงเรียน → บ้าน)
// ==========================================
window.openRouteInGoogleMaps = function () {
    const lat = parseFloat(document.getElementById('lat')?.value);
    const lng = parseFloat(document.getElementById('lng')?.value);

    if (isNaN(lat) || isNaN(lng) || !lat || !lng) {
        Swal.fire({
            icon: 'warning',
            title: 'ยังไม่มีพิกัดบ้าน',
            text: 'กรุณาปักหมุดบ้านนักเรียน หรือกรอกละติจูด/ลองจิจูด ก่อน',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    const origin = `${SCHOOL_LAT},${SCHOOL_LNG}`;
    const destination = `${lat},${lng}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

    window.open(url, '_blank');
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
            report_template_id: data.settings.report_template_id || "",
            show_report: data.settings.show_report || "false"   // ✅ เพิ่มบรรทัดนี้
        };
    }
}

window.openAdminModal = async function () {
    document.getElementById('admin-modal').classList.remove('hidden');
    await loadAdminSettings();

    // ✅ ซ่อนการตั้งค่าเปิด/ปิดรายงานถ้าไม่ใช่ Super Admin
    const toggleContainer = document.getElementById('report-toggle-container');
    if (toggleContainer) {
        if (actualRole === 'super_admin') {
            toggleContainer.classList.remove('hidden');
        } else {
            toggleContainer.classList.add('hidden');
        }
    }
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

    // ✅ โหลดค่า show_report
    const showReportCheckbox = document.getElementById('setting-show-report');
    if (showReportCheckbox) {
        showReportCheckbox.checked = (moduleSettings.show_report === 'true');
    }

    await Promise.all([loadTeachersForAppoint(), loadModuleAdminsList()]);
}

async function saveAdminSettings() {
    const showReportCheckbox = document.getElementById('setting-show-report');
    const showReportValue = showReportCheckbox ? (showReportCheckbox.checked ? 'true' : 'false') : 'false';

    const payload = {
        gas_url: document.getElementById('set-gas-url').value.trim(),
        drive_folder_id: document.getElementById('set-drive-folder-id').value.trim(),
        pdf_api_url: document.getElementById('set-pdf-api-url').value.trim(),
        slide_template_url: document.getElementById('set-slide-id').value.trim(),
        gd_pdf_folder_id: document.getElementById('set-pdf-folder-id').value.trim(),
        report_template_id: document.getElementById('set-report-template-id')?.value.trim() || "",
        show_report: showReportValue   // ✅ เพิ่มบรรทัดนี้
    };
    const { error } = await db.from('core_system_modules').update({ settings: payload }).eq('module_id', 'homevisit');
    if (error) return Swal.fire('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
    moduleSettings = payload;
    Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
    closeAdminModal();
    applyReportVisibility(); // ✅ รีเฟรชการแสดงผลปุ่มรายงานทันที
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

            // ================== ให้คัดลอกส่วนนี้ไปทับของเดิม ==================
            const [{ data: classrooms }, { data: visits }, staffMap] = await Promise.all([
                classQuery,
                db.from('module_home_visits')
                    // ✅ 1. เพิ่มการดึง visit_status มาด้วย
                    .select('classroom_id, student_id, visit_status')
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

            // ✅ 2. เปลี่ยนการนับ ให้นับเพิ่มเฉพาะคนที่สถานะเป็น 'เยี่ยมแล้ว' เท่านั้น
            (visits || []).forEach(v => {
                if (v.visit_status === 'เยี่ยมแล้ว') {
                    visitedMap[v.classroom_id] = (visitedMap[v.classroom_id] || 0) + 1;
                }
            });
            // =============================================================

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

            // ✅ แก้ไข: เช็คสถานะ visit_status อย่างชัดเจน ว่าต้องเป็นคำว่า 'เยี่ยมแล้ว' เท่านั้น
            const isVisited = visit && visit.visit_status === 'เยี่ยมแล้ว';
            const statusHtml = isVisited
                ? '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase">เยี่ยมแล้ว</span>'
                : '<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase">ยังไม่เยี่ยม</span>';

            let actions = '';
            // ✅ เปลี่ยนจาก if (visit) เป็น if (isVisited)
            if (isVisited) {
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
                
                <td class="py-3 px-4">${visit?.visit_date || '-'}</td>
                <td class="py-3 px-4 text-center">${visit?.visit_times || '-'}</td>
                
                <td class="py-3 px-4 text-center">${statusHtml}</td>
                <td class="py-3 px-4 text-center flex items-center justify-center gap-1">${actions}</td>
            </tr>`;
        }).join('');

        const totalStudents = enrolls.length;
        // ✅ นับเฉพาะที่ visit_status === 'เยี่ยมแล้ว' ให้ตรงกับตาราง
        const visitedCount = Object.values(visitMap).filter(v => v.visit_status === 'เยี่ยมแล้ว').length;
        renderDashboard(totalStudents, visitedCount, true);
        console.log('Saving with year:', currentYear, 'term:', currentTerm);
        console.log('Loading with year:', currentYear, 'term:', currentTerm);
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

        // ✅ ดึงเลขที่นักเรียนจาก student_enrollments
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_number')
            .eq('student_id', visit.student_id)
            .eq('classroom_id', visit.classroom_id)
            .maybeSingle();
        const studentNumber = enroll?.student_number || '-';

        // ✅ ดึงข้อมูลครูที่ปรึกษาคนที่ 1 และคนที่ 2
        let teacher1Name = '-', teacher2Name = '-';
        if (classroom) {
            const adviserIds = [classroom.adviser_id_1, classroom.adviser_id_2].filter(id => id);
            if (adviserIds.length > 0) {
                const { data: teachers } = await db.from('core_personnel')
                    .select('id, prefix, first_name, last_name')
                    .in('id', adviserIds);
                const teacherMap = {};
                (teachers || []).forEach(t => { teacherMap[t.id] = `${t.prefix || ''}${t.first_name} ${t.last_name}`; });
                if (classroom.adviser_id_1) teacher1Name = teacherMap[classroom.adviser_id_1] || '-';
                if (classroom.adviser_id_2) teacher2Name = teacherMap[classroom.adviser_id_2] || '-';
            }
        }

        // ✅ ฟังก์ชันแปลงวันที่เป็นภาษาไทย
        const formatThaiDate = (dateStr) => {
            if (!dateStr) return '';
            const monthsThai = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const d = new Date(dateStr);
            const day = d.getDate();
            const month = monthsThai[d.getMonth()];
            const year = d.getFullYear() + 543; // พ.ศ.
            return `วันที่ ${day} ${month} ${year}`;
        };
        const visitDateThai = formatThaiDate(visit.visit_date);

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

        // ========== สร้าง mapping ความสัมพันธ์จาก relations_data ==========
        const relMap = {};
        if (visit.relations_data && Array.isArray(visit.relations_data)) {
            visit.relations_data.forEach(rel => {
                const relative = rel.relative;
                const relation = rel.relation || 'ไม่มี';
                if (relative === 'บิดา') relMap['FATHER'] = relation;
                else if (relative === 'มารดา') relMap['MOTHER'] = relation;
                else if (relative === 'พี่ชาย/น้องชาย') relMap['BROTHER'] = relation;
                else if (relative === 'พี่สาว/น้องสาว') relMap['SISTER'] = relation;
                else if (relative === 'ปู่/ย่า/ตา/ยาย') relMap['GRANDPARENT'] = relation;
                else if (relative === 'ญาติ') relMap['RELATIVE'] = relation;
            });
        }
        // กำหนดค่าเริ่มต้นถ้าไม่มีข้อมูล
        const defaultRel = 'ไม่มี';

        // เตรียม replacements
        const replacements = {
            // นักเรียน
            "{{STUDENT_NAME}}": studentFullName,
            "{{STUDENT_ID}}": studentIdCard,
            "{{STUDENT_NUMBER}}": studentNumber,
            "{{STUDENT_NICKNAME}}": visit.student_nickname || '-',
            "{{STUDENT_PHONE}}": visit.student_phone || '-',
            "{{STUDENT_LINE}}": visit.student_line || '-',
            "{{CLASSROOM}}": classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-',
            "{{VISIT_DATE}}": visit.visit_date || '-',
            "{{VISIT_DATE_TH}}": visitDateThai,   // ✅ เพิ่มวันที่ภาษาไทย
            "{{VISIT_TIMES}}": visit.visit_times || '1',

            // ครูที่ปรึกษา
            "{{TEACHER1_NAME}}": teacher1Name,
            "{{TEACHER2_NAME}}": teacher2Name,

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

            // ความสัมพันธ์ในครอบครัว (จาก Radio Table)
            "{{REL_FATHER}}": relMap['FATHER'] || defaultRel,
            "{{REL_MOTHER}}": relMap['MOTHER'] || defaultRel,
            "{{REL_BROTHER}}": relMap['BROTHER'] || defaultRel,
            "{{REL_SISTER}}": relMap['SISTER'] || defaultRel,
            "{{REL_GRANDPARENT}}": relMap['GRANDPARENT'] || defaultRel,
            "{{REL_RELATIVE}}": relMap['RELATIVE'] || defaultRel,

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
            "{{PHOTO_STUDENT_IMAGE}}": visit.photo_student || '',
            "{{PHOTO_OUTSIDE_IMAGE}}": visit.photo_outside || '',
            "{{PHOTO_INSIDE_IMAGE}}": visit.photo_inside || '',
            "{{PHOTO_TEACHER_IMAGE}}": visit.photo_teacher || ''
        };

        // สร้าง payload และเรียก Google Apps Script
        const payload = {
            action: 'generate_pdf',
            templateId: moduleSettings.slide_template_url,
            pdfFolderId: moduleSettings.gd_pdf_folder_id,
            fileName: `HomeVisit_${studentIdCard}_${visit.visit_date}`,
            existingPdfUrl: visit.pdf_url || null,
            replacements
        };

        const response = await fetch(moduleSettings.pdf_api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success' && result.url) {
            await db.from('module_home_visits')
                .update({ pdf_url: result.url })
                .eq('id', visitId);

            await loadDataTable();
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
        cloudBtn.classList.add('opacity-40', 'bg-green-600', 'text-white');
        cloudBtn.classList.remove('bg-slate-700');
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

            // ✅ เปลี่ยนแปลงสำคัญ: ตรวจสอบสถานะว่าต้องเป็น 'เยี่ยมแล้ว' เท่านั้น
            if (visit && visit.visit_status === 'เยี่ยมแล้ว') {
                visitedCount++;
                window.reportVisitedList.push(studentItem);

                // ✅ ดักจับ Error กรณีชื่อฟิลด์ JSON ของความเสี่ยงไม่ตรงกัน
                const risk = visit.risk_factors || visit.risk_data || {};
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

// ==========================================
// ระบบนำเข้าข้อมูลเยี่ยมบ้านจากไฟล์ Excel
// ==========================================
window.importFromExcel = function () {
    // 1. สร้าง Input File แบบซ่อนเพื่อเปิดหน้าต่างเลือกไฟล์
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Swal.fire({ title: 'กำลังอ่านไฟล์ Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                // 2. แปลงไฟล์ Excel เป็น JSON
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // แปลง Sheet เป็น Array ของ Object (แถวแรกเป็นชื่อคอลัมน์)
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (json.length === 0) throw new Error("ไม่พบข้อมูลในไฟล์ Excel");

                Swal.fire({ title: 'กำลังตรวจสอบข้อมูลนักเรียน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                // ================== ให้ก๊อปปี้ทับส่วนที่ 3 ของเดิม ==================
                // 3. ดึงรายชื่อนักเรียนทั้งหมดมาเพื่อเทียบ รหัสประจำตัว (student_id_card) -> ID (UUID)
                // เปลี่ยนไปดึงผ่านตารางการลงทะเบียนเรียนแทน เพื่อเอา classroom_id มาด้วย
                const { data: enrollments, error: stdError } = await db.from('student_enrollments')
                    .select('classroom_id, core_students(id, student_id_card)');

                if (stdError) throw stdError;

                // สร้าง Dictionary (Map) สำหรับค้นหานักเรียนอย่างรวดเร็ว
                const studentMap = {};
                (enrollments || []).forEach(row => {
                    if (row.core_students && row.core_students.student_id_card) {
                        studentMap[String(row.core_students.student_id_card).trim()] = {
                            id: row.core_students.id,
                            classroom_id: row.classroom_id
                        };
                    }
                });
                // =============================================================

                const formattedData = [];
                let skipCount = 0;

                // 4. วนลูปจับคู่ข้อมูลจาก Excel
                for (const row of json) {
                    const idCard = String(row['รหัสประจำตัว'] || row['รหัสนักเรียน'] || row['student_id_card'] || '').trim();

                    const stdInfo = studentMap[idCard];
                    if (!stdInfo) {
                        skipCount++;
                        continue;
                    }

                    // ✅ สร้างตัวแปรเช็คสถานะและวันที่
                    const vStatus = row['สถานะ'] || row['visit_status'] || 'ยังไม่เยี่ยม';
                    let vDate = row['วันที่เยี่ยม'] || row['visit_date'] || null;

                    // ✅ เงื่อนไข: ถ้ายังไม่เยี่ยม ให้เคลียร์วันที่เป็นค่าว่าง (null)
                    if (vStatus === 'ยังไม่เยี่ยม') {
                        vDate = null;
                    } else if (!vDate) {
                        // ถ้าเยี่ยมแล้วแต่ใน Excel ลืมใส่วันที่มา ให้ใช้วันที่ปัจจุบันแทน
                        vDate = new Date().toISOString().split('T')[0];
                    }

                    // จัดโครงสร้างให้ตรงกับ Database module_home_visits
                    const formData = {
                        student_id: stdInfo.id,
                        classroom_id: stdInfo.classroom_id,
                        teacher_id: currentUser.id,
                        academic_year: currentYear,
                        semester: currentTerm,

                        // ✅ ใช้วันที่และสถานะที่ผ่านการตรวจสอบแล้ว
                        visit_date: vDate,
                        visit_status: vStatus,
                        visit_times: parseInt(row['ครั้งที่'] || row['visit_times']) || 1,

                        student_nickname: String(row['ชื่อเล่น'] || ''),
                        student_phone: String(row['เบอร์โทรนักเรียน'] || ''),

                        father_name: String(row['ชื่อบิดา'] || ''),
                        father_job: String(row['อาชีพบิดา'] || ''),
                        father_phone: String(row['เบอร์โทรบิดา'] || ''),
                        mother_name: String(row['ชื่อมารดา'] || ''),
                        mother_job: String(row['อาชีพมารดา'] || ''),
                        mother_phone: String(row['เบอร์โทรมารดา'] || ''),
                        guardian_name: String(row['ชื่อผู้ปกครอง'] || ''),
                        guardian_job: String(row['อาชีพผู้ปกครอง'] || ''),
                        guardian_phone: String(row['เบอร์โทรผู้ปกครอง'] || ''),
                        guardian_relation: String(row['ความเกี่ยวข้อง'] || ''),

                        house_number: String(row['บ้านเลขที่'] || ''),
                        village_no: String(row['หมู่'] || ''),
                        sub_district: String(row['ตำบล'] || ''),
                        district: String(row['อำเภอ'] || ''),
                        province: String(row['จังหวัด'] || ''),
                        zipcode: String(row['รหัสไปรษณีย์'] || ''),

                        latitude: parseFloat(row['ละติจูด'] || row['latitude']) || null,
                        longitude: parseFloat(row['ลองจิจูด'] || row['longitude']) || null,

                        risk_factors: { health: [], drugs: [], violence: [], sex: [], gaming: [], responsibilities: [], hobbies: [] },
                        updated_at: new Date().toISOString()
                    };

                    formattedData.push(formData);
                }

                if (formattedData.length === 0) {
                    throw new Error("ไม่พบข้อมูลที่ตรงกับรหัสนักเรียนในระบบ<br><br><span class='text-sm text-slate-500'>(โปรดตรวจสอบว่าคอลัมน์รหัสนักเรียนในไฟล์ Excel ตั้งชื่อว่า <b>'รหัสประจำตัว'</b> หรือ <b>'รหัสนักเรียน'</b>)</span>");
                }

                Swal.fire({ title: `กำลังบันทึก ${formattedData.length} รายการ...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                // ================== ให้ก๊อปปี้ทับส่วนที่ 5 ของเดิม ==================
                // 5. บันทึกลงฐานข้อมูล (ตรวจเช็คและแยก Update / Insert ทีละรายการ)
                let successCount = 0;
                for (const formData of formattedData) {
                    // ค้นหาว่าเด็กคนนี้ เทอมนี้ เคยมีข้อมูลเยี่ยมบ้านหรือยัง?
                    const { data: existing } = await db.from('module_home_visits')
                        .select('id')
                        .eq('student_id', formData.student_id)
                        .eq('academic_year', currentYear)
                        .eq('semester', currentTerm)
                        .maybeSingle();

                    let opError;
                    if (existing) {
                        // ถ้ามีแล้วให้ทำการ อัปเดต (Update) ข้อมูลเดิม
                        const { error } = await db.from('module_home_visits').update(formData).eq('id', existing.id);
                        opError = error;
                    } else {
                        // ถ้ายังไม่มีให้ เพิ่มข้อมูลใหม่ (Insert)
                        const { error } = await db.from('module_home_visits').insert([formData]);
                        opError = error;
                    }

                    if (opError) {
                        console.error("Error saving student ID:", formData.student_id, opError);
                    } else {
                        successCount++;
                    }
                }

                // สรุปผล
                let msg = `นำเข้าข้อมูลสำเร็จ <b>${successCount}</b> รายการ`;
                if (skipCount > 0) msg += `<br><span class="text-rose-500 text-sm mt-2 block">* ข้าม ${skipCount} รายการ (หารหัสนักเรียนไม่พบในระบบ)</span>`;
                if (successCount < formattedData.length) msg += `<br><span class="text-rose-500 text-sm mt-1 block">* บางรายการบันทึกไม่สำเร็จ (ดูรายละเอียดใน F12)</span>`;

                Swal.fire({
                    title: 'นำเข้าสำเร็จ!',
                    html: msg,
                    icon: 'success'
                }).then(() => {
                    if (document.getElementById('overview-modal') && !document.getElementById('overview-modal').classList.contains('hidden')) {
                        if (currentViewRole === 'teacher' && typeof loadTeacherOverview === 'function') loadTeacherOverview();
                        if (currentViewRole !== 'teacher' && typeof loadAdminOverview === 'function') loadAdminOverview();
                    }
                });
                // =============================================================

            } catch (err) {
                Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    fileInput.click(); // กดเพื่อเปิดหน้าต่างเลือกไฟล์
}

// ==========================================
// ระบบแสดงภาพรวม & รายงาน (Overview & Report Tabs)
// ==========================================

window.openOverviewModal = async function (tab = 'overview') {
    const modal = document.getElementById('overview-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    await switchOverviewTab(tab);
};

window.closeOverviewModal = function () {
    const modal = document.getElementById('overview-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
};

window.switchOverviewTab = async function (tab) {
    const tabs = ['overview', 'report'];
    tabs.forEach(t => {
        const isMatch = (t === tab);

        // สลับ Class ปุ่ม (Desktop)
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) btn.className = isMatch
            ? "px-4 py-2 rounded-lg font-bold text-sm bg-white text-sky-700 shadow-sm transition"
            : "px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-700 transition";

        // สลับ Class ปุ่ม (Mobile)
        const btnMobile = document.getElementById(`tab-btn-${t}-mobile`);
        if (btnMobile) btnMobile.className = isMatch
            ? "flex-1 py-2 rounded-lg font-bold text-xs bg-white text-sky-700 shadow-sm transition"
            : "flex-1 py-2 rounded-lg font-bold text-xs text-slate-500 hover:text-slate-700 transition";

        // แสดง/ซ่อน Content
        const content = document.getElementById(`tab-content-${t}`);
        if (content) {
            if (isMatch) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
    });

    if (typeof hideReportStudentList === 'function') hideReportStudentList();

    // ประมวลผลข้อมูลตามแท็บที่ถูกเปิด
    if (tab === 'overview') {
        if (currentViewRole === 'teacher') {
            document.getElementById('admin-overview-container')?.classList.add('hidden');
            document.getElementById('teacher-overview-container')?.classList.remove('hidden');
            await loadTeacherOverview();
        } else {
            document.getElementById('teacher-overview-container')?.classList.add('hidden');
            document.getElementById('admin-overview-container')?.classList.remove('hidden');
            await loadAdminOverview();
        }
    } else if (tab === 'report') {
        const scopeSelect = document.getElementById('report-scope');
        const gradeContainer = document.getElementById('grade-select-container');
        if (scopeSelect && !scopeSelect.value) {
            scopeSelect.value = currentViewRole === 'teacher' ? 'myclass' : 'all';
            if (gradeContainer) gradeContainer.classList.add('hidden');
        }
        await loadReport();
    }
};

// ==========================================
// ฟังก์ชันโหลดข้อมูล (ตารางครูที่ปรึกษา)
// ==========================================
async function loadTeacherOverview() {
    const tbody = document.getElementById('tb-overview-teacher');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูลนักเรียน...</td></tr>';

    try {
        const { data: classrooms } = await db.from('core_classrooms')
            .select('id').eq('academic_year', currentYear).eq('semester', currentTerm)
            .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);

        if (!classrooms || classrooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">ไม่พบห้องเรียนที่คุณเป็นที่ปรึกษา</td></tr>';
            return;
        }
        const classIds = classrooms.map(c => c.id);

        const { data: students } = await db.from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name, class_room_number')
            .in('classroom_id', classIds).order('class_room_number');

        const { data: visits } = await db.from('module_home_visits')
            .select('id, student_id, pdf_url, visit_status')
            .eq('academic_year', currentYear).eq('semester', currentTerm).in('classroom_id', classIds);

        const visitMap = {};
        (visits || []).forEach(v => visitMap[v.student_id] = v);

        if (!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">ยังไม่มีนักเรียนในระบบ</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => {
            const v = visitMap[s.id];
            const isVisited = v && v.visit_status === 'เยี่ยมแล้ว';

            const statusHtml = isVisited
                ? `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-check-circle mr-1"></i> เยี่ยมแล้ว</span>`
                : `<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-clock mr-1"></i> ยังไม่เยี่ยม</span>`;

            let actionHtml = '';
            if (isVisited) {
                actionHtml = `
                    <div class="flex justify-center gap-2">
                        <button onclick="editHomeVisit('${s.id}')" class="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded border border-sky-200 transition" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
                        <button onclick="printPDF('${v.id}')" class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition" title="พิมพ์ PDF ใหม่"><i class="fas fa-print"></i></button>
                        <button onclick="viewExistingPDF('${v.pdf_url}')" class="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition" title="ดูไฟล์ PDF ล่าสุด"><i class="fas fa-file-pdf"></i></button>
                    </div>`;
            } else {
                actionHtml = `<button onclick="editHomeVisit('${s.id}')" class="text-rose-600 hover:bg-rose-50 px-3 py-1 rounded border border-rose-200 text-xs font-bold transition"><i class="fas fa-plus mr-1"></i> บันทึกข้อมูล</button>`;
            }

            return `<tr class="hover:bg-slate-50 transition">
                <td class="p-3 text-center">${s.class_room_number || '-'}</td>
                <td class="p-3 font-mono text-slate-500">${s.student_id_card || '-'}</td>
                <td class="p-3 font-bold text-slate-700">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
                <td class="p-3 text-center">${statusHtml}</td>
                <td class="p-3 text-center">${actionHtml}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

// ==========================================
// ฟังก์ชันโหลดข้อมูล (ตารางแอดมิน)
// ==========================================
// ==========================================
// ฟังก์ชันโหลดข้อมูล (ตารางแอดมิน)
// ==========================================
async function loadAdminOverview() {
    const tbody = document.getElementById('tb-overview-admin');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังคำนวณข้อมูล...</td></tr>';

    try {
        let roomQuery = db.from('core_classrooms').select('id, grade_level, room_number')
            .eq('academic_year', currentYear).eq('semester', currentTerm).order('grade_level').order('room_number');

        if (currentViewRole === 'head_grade') {
            const { data: gh } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).single();
            if (gh) roomQuery = roomQuery.eq('grade_level', gh.grade_level);
        }

        const { data: classrooms } = await roomQuery;
        if (!classrooms || classrooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">ไม่พบข้อมูลห้องเรียน</td></tr>';
            return;
        }

        const classIds = classrooms.map(c => c.id);

        const [{ data: students }, { data: visits }] = await Promise.all([
            db.from('core_students').select('classroom_id').in('classroom_id', classIds),
            db.from('module_home_visits').select('classroom_id, visit_status').in('classroom_id', classIds).eq('academic_year', currentYear).eq('semester', currentTerm)
        ]);

        const stdCount = {};
        const visitCount = {};
        classIds.forEach(id => { stdCount[id] = 0; visitCount[id] = 0; });

        // นับนักเรียนทั้งหมด
        (students || []).forEach(s => { if (stdCount[s.classroom_id] !== undefined) stdCount[s.classroom_id]++; });

        // ✅ นับเฉพาะที่เยี่ยมแล้วจริงๆ 
        (visits || []).forEach(v => {
            if (visitCount[v.classroom_id] !== undefined && v.visit_status === 'เยี่ยมแล้ว') {
                visitCount[v.classroom_id]++;
            }
        });

        tbody.innerHTML = classrooms.map(c => {
            const total = stdCount[c.id] || 0;
            const visited = visitCount[c.id] || 0;
            const pending = total - visited;
            const percent = total > 0 ? Math.round((visited / total) * 100) : 0;
            let colorClass = percent === 100 ? 'bg-green-500' : (percent >= 50 ? 'bg-yellow-500' : 'bg-rose-500');

            return `<tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-bold text-slate-700">ม.${c.grade_level}/${c.room_number}</td>
                <td class="p-3 text-center">${total}</td>
                <td class="p-3 text-center text-green-600 font-bold">${visited}</td>
                <td class="p-3 text-center text-rose-500 font-bold">${pending}</td>
                <td class="p-3 w-48">
                    <div class="flex items-center gap-2">
                        <div class="w-full bg-slate-200 rounded-full h-2.5">
                            <div class="${colorClass} h-2.5 rounded-full" style="width: ${percent}%"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-600 w-8 text-right">${percent}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

// ==========================================
// ฟังก์ชันย่อยสำหรับปุ่ม Action ในตาราง
// ==========================================
window.editHomeVisit = function (studentId) {
    const modal = document.getElementById('overview-modal');
    if (modal) { modal.classList.remove('flex'); modal.classList.add('hidden'); }

    // ตั้งค่ารายชื่อในกล่องค้นหาให้ตรงกับคนที่กดเลือก
    if (studentTomSelect) {
        studentTomSelect.setValue(studentId);
    }
    goToStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.viewExistingPDF = function (pdfUrl) {
    if (!pdfUrl || pdfUrl === 'null' || pdfUrl === 'undefined') {
        Swal.fire('ไม่พบไฟล์', 'ยังไม่มีการสร้างไฟล์ PDF สำหรับนักเรียนคนนี้ กรุณากดพิมพ์ PDF เพื่อให้ระบบสร้างไฟล์ก่อนครับ', 'info');
        return;
    }
    window.open(pdfUrl, '_blank');
};

window.applyReportVisibility = function () {
    const isReportEnabled = moduleSettings.show_report === 'true';
    const isSuperAdmin = (actualRole === 'super_admin' || currentViewRole === 'super_admin');

    // ปุ่มทั้งหมดที่เกี่ยวกับรายงาน
    const navBtn = document.getElementById('nav-btn-report');          // ถ้ามีใน navbar
    const tabBtnDesktop = document.getElementById('tab-report-btn');
    const tabBtnMobile = document.getElementById('tab-report-btn-mobile');

    // ถ้าเป็น Super Admin ให้แสดงเสมอ (เพราะเขาต้องการควบคุม)
    if (isSuperAdmin) {
        if (navBtn) navBtn.classList.remove('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.remove('hidden');
        if (tabBtnMobile) {
            tabBtnMobile.classList.remove('hidden');
            tabBtnMobile.classList.add('flex-1');
        }
        return;
    }

    // สำหรับผู้ใช้อื่น: แสดงก็ต่อเมื่อเปิดใช้งานรายงาน
    if (isReportEnabled) {
        if (navBtn) navBtn.classList.remove('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.remove('hidden');
        if (tabBtnMobile) {
            tabBtnMobile.classList.remove('hidden');
            tabBtnMobile.classList.add('flex-1');
        }
    } else {
        if (navBtn) navBtn.classList.add('hidden');
        if (tabBtnDesktop) tabBtnDesktop.classList.add('hidden');
        if (tabBtnMobile) {
            tabBtnMobile.classList.add('hidden');
            tabBtnMobile.classList.remove('flex-1');
        }
    }
};

async function logout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'index.html'; }
}
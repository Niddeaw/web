// ==========================================
// homevisit_data.js
// DataTable, Dashboard, Export, PDF, Report,
// Admin, Overview, Helpers, TomSelect,
// Step Navigation, Image Helpers, Switch Tab
// ==========================================

// ==========================================
// 1. STEP NAVIGATION & MAP HELPERS
// ==========================================

const stepColorConfigs = {
    1: { bg: 'bg-red-600', text: 'text-red-700', shadow: 'shadow-red-100' },
    2: { bg: 'bg-orange-600', text: 'text-orange-700', shadow: 'shadow-orange-100' },
    3: { bg: 'bg-yellow-600', text: 'text-yellow-700', shadow: 'shadow-yellow-100' },
    4: { bg: 'bg-green-600', text: 'text-green-700', shadow: 'shadow-green-100' },
    5: { bg: 'bg-sky-600', text: 'text-sky-700', shadow: 'shadow-sky-100' }
};
// ==========================================
// ตัวแปรป้องกันการเรียกซ้ำและสถานะแท็บ
// ==========================================
let isReportLoading = false;
let currentTab = 'form';
let isRenderingCharts = false;
let renderTimeout = null;
let chartRenderCount = 0;  // เพิ่มไว้ดีบัก (ไม่จำเป็น)

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

window.nextStep = async function (step) {
    if (step === 2 && !document.getElementById('hv_student')?.value) {
        return Swal.fire('ผิดพลาด', 'กรุณาเลือกนักเรียนก่อนครับ', 'warning');
    }
    await autoSaveStep();
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

// ==========================================
// 2. HELPER FUNCTIONS
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

async function getPersonnelMap() {
    if (personnelCache) return personnelCache;
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name');
    personnelCache = {};
    (data || []).forEach(p => { if (p?.id) personnelCache[p.id] = `${p.prefix || ''}${p.first_name} ${p.last_name}`; });
    return personnelCache;
}

async function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (!badge || !text) return;

    let statusHtml = '';
    if (status === 'completed') {
        badge.className = "px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-center border border-emerald-100";
        statusHtml = '<i class="fas fa-check-circle mr-1"></i> บันทึกข้อมูลแล้ว';
    } else {
        badge.className = "px-3 py-2 bg-amber-50 text-amber-600 rounded-xl text-center border border-amber-100";
        statusHtml = '<i class="fas fa-exclamation-circle mr-1"></i> ยังไม่มีข้อมูล';
    }

    // เริ่มสร้าง HTML ทั้งหมด
    let fullHtml = statusHtml;

    // ถ้ามี classroomId ให้โหลดครูและเพิ่มเข้าไป
    if (window.currentClassroomId) {
        try {
            const classroomId = window.currentClassroomId;
            const { data: classroom, error } = await db.from('core_classrooms')
                .select('adviser_id_1, adviser_id_2')
                .eq('id', classroomId)
                .single();

            if (!error && classroom) {
                const teacherIds = [classroom.adviser_id_1, classroom.adviser_id_2].filter(id => id);
                if (teacherIds.length > 0) {
                    const { data: teachers } = await db.from('core_personnel')
                        .select('id, prefix, first_name, last_name')
                        .in('id', teacherIds);

                    const teacherMap = {};
                    teachers.forEach(t => { teacherMap[t.id] = `${t.prefix || ''}${t.first_name} ${t.last_name}`; });

                    let teacherHtml = `<div class="teacher-info text-xs mt-2 pt-2 border-t border-slate-200 text-slate-500">`;
                    if (classroom.adviser_id_1) {
                        teacherHtml += `<div class="flex items-center gap-1 mt-1">
                            <i class="fas fa-chalkboard-user text-slate-400 text-[10px] w-4"></i>
                            <span>ครูที่ปรึกษาคนที่ 1: <strong class="font-semibold text-slate-600">${teacherMap[classroom.adviser_id_1] || '-'}</strong></span>
                        </div>`;
                    }
                    if (classroom.adviser_id_2) {
                        teacherHtml += `<div class="flex items-center gap-1 mt-1">
                            <i class="fas fa-chalkboard-user text-slate-400 text-[10px] w-4"></i>
                            <span>ครูที่ปรึกษาคนที่ 2: <strong class="font-semibold text-slate-600">${teacherMap[classroom.adviser_id_2] || '-'}</strong></span>
                        </div>`;
                    }
                    teacherHtml += `</div>`;
                    fullHtml += teacherHtml;
                }
            }
        } catch (err) {
            console.warn('Cannot load teachers:', err);
        }
    }

    // ตั้งค่า HTML ใหม่ทั้งหมด
    text.innerHTML = fullHtml;
}

async function loadAndDisplayTeachers(classroomId, textElement) {
    try {
        // ✅ ลบ teacher-info เก่าทั้งหมดออก (ใช้ querySelectorAll)
        const oldInfos = textElement.querySelectorAll('.teacher-info');
        oldInfos.forEach(el => el.remove());

        const { data: classroom, error } = await db.from('core_classrooms')
            .select('adviser_id_1, adviser_id_2')
            .eq('id', classroomId)
            .single();

        if (error || !classroom) return;

        const teacherIds = [classroom.adviser_id_1, classroom.adviser_id_2].filter(id => id);
        if (teacherIds.length === 0) return;

        const { data: teachers } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name')
            .in('id', teacherIds);

        const teacherMap = {};
        teachers.forEach(t => { teacherMap[t.id] = `${t.prefix || ''}${t.first_name} ${t.last_name}`; });

        let teacherHtml = `<div class="teacher-info text-xs mt-2 pt-2 border-t border-slate-200 text-slate-500">`;
        if (classroom.adviser_id_1) {
            teacherHtml += `<div class="flex items-center gap-1 mt-1">
                <i class="fas fa-chalkboard-user text-slate-400 text-[10px] w-4"></i>
                <span>ครูที่ปรึกษาคนที่ 1: <strong class="font-semibold text-slate-600">${teacherMap[classroom.adviser_id_1] || '-'}</strong></span>
            </div>`;
        }
        if (classroom.adviser_id_2) {
            teacherHtml += `<div class="flex items-center gap-1 mt-1">
                <i class="fas fa-chalkboard-user text-slate-400 text-[10px] w-4"></i>
                <span>ครูที่ปรึกษาคนที่ 2: <strong class="font-semibold text-slate-600">${teacherMap[classroom.adviser_id_2] || '-'}</strong></span>
            </div>`;
        }
        teacherHtml += `</div>`;

        textElement.insertAdjacentHTML('beforeend', teacherHtml);
    } catch (err) {
        console.warn('Cannot load teachers:', err);
    }
}

function editFromTable(classroomId) {
    tsClassroom.setValue(classroomId);
    switchTab('form');
}

window.selectStudentForForm = function (studentId) {
    if (studentTomSelect) {
        studentTomSelect.setValue(studentId);
    }
    switchTab('form');
};

window.editStudentVisit = async function (visitId) {
    if (!visitId) return;
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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
        '12345', 'เด็กชายสมชาย ใจดี', '2568-07-10', 'เยี่ยมแล้ว', '1',
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
        studentFullName || '',
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
            student_job_name: getVal('student_job_name'),
            student_job_income: getVal('student_job_income'),
            money_to_school: getVal('money_to_school'),
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

window.importFromExcel = function () {
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
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                if (json.length === 0) throw new Error("ไม่พบข้อมูลในไฟล์ Excel");
                Swal.fire({ title: 'กำลังตรวจสอบข้อมูลนักเรียน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const { data: enrollments, error: stdError } = await db.from('student_enrollments')
                    .select('classroom_id, core_students(id, student_id_card)');
                if (stdError) throw stdError;
                const studentMap = {};
                (enrollments || []).forEach(row => {
                    if (row.core_students && row.core_students.student_id_card) {
                        studentMap[String(row.core_students.student_id_card).trim()] = {
                            id: row.core_students.id,
                            classroom_id: row.classroom_id
                        };
                    }
                });
                const formattedData = [];
                let skipCount = 0;
                for (const row of json) {
                    const idCard = String(row['รหัสประจำตัว'] || row['รหัสนักเรียน'] || row['student_id_card'] || '').trim();
                    const stdInfo = studentMap[idCard];
                    if (!stdInfo) { skipCount++; continue; }
                    const vStatus = row['สถานะ'] || row['visit_status'] || 'ยังไม่เยี่ยม';
                    let vDate = row['วันที่เยี่ยม'] || row['visit_date'] || null;
                    if (vStatus === 'ยังไม่เยี่ยม') {
                        vDate = null;
                    } else if (!vDate) {
                        vDate = new Date().toISOString().split('T')[0];
                    }
                    const formData = {
                        student_id: stdInfo.id,
                        classroom_id: stdInfo.classroom_id,
                        teacher_id: currentUser.id,
                        academic_year: currentYear,
                        semester: currentTerm,
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
                let successCount = 0;
                for (const formData of formattedData) {
                    const { data: existing } = await db.from('module_home_visits')
                        .select('id')
                        .eq('student_id', formData.student_id)
                        .eq('academic_year', currentYear)
                        .eq('semester', currentTerm)
                        .maybeSingle();
                    let opError;
                    if (existing) {
                        const { error } = await db.from('module_home_visits').update(formData).eq('id', existing.id);
                        opError = error;
                    } else {
                        const { error } = await db.from('module_home_visits').insert([formData]);
                        opError = error;
                    }
                    if (opError) {
                        console.error("Error saving student ID:", formData.student_id, opError);
                    } else {
                        successCount++;
                    }
                }
                let msg = `นำเข้าข้อมูลสำเร็จ <b>${successCount}</b> รายการ`;
                if (skipCount > 0) msg += `<br><span class="text-rose-500 text-sm mt-2 block">* ข้าม ${skipCount} รายการ (หารหัสนักเรียนไม่พบในระบบ)</span>`;
                if (successCount < formattedData.length) msg += `<br><span class="text-rose-500 text-sm mt-1 block">* บางรายการบันทึกไม่สำเร็จ (ดูรายละเอียดใน F12)</span>`;
                Swal.fire({ title: 'นำเข้าสำเร็จ!', html: msg, icon: 'success' });
            } catch (err) {
                Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    fileInput.click();
};

// ==========================================
// 3. DATA TABLE, DASHBOARD, EXPORT, PDF
// ==========================================
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

    Swal.fire({ title: 'กำลังโหลดข้อมูลภาพรวม...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // ========== ส่วนของผู้ดูแลระบบ (Server‑Side DataTable) ==========
    if (!isTeacher) {
        const tableId = '#class-summary-table';

        // ทำลาย DataTable เก่าถ้ามี
        if ($.fn.DataTable.isDataTable(tableId)) {
            $(tableId).DataTable().clear().destroy();
        }

        $(tableId).DataTable({
            processing: true,
            serverSide: true,
            ajax: async function (data, callback) {
                const orderColIndex = data.order[0]?.column ?? 0;
                const orderCol = data.columns[orderColIndex]?.data || 'room';
                const orderDir = data.order[0]?.dir || 'asc';
                const searchValue = data.search?.value || '';

                let gradeLevel = null;
                if (currentViewRole === 'head_grade') {
                    const { data: gh } = await db.from('behavior_grade_heads')
                        .select('grade_level').eq('teacher_id', currentUser.id).single();
                    if (gh) gradeLevel = gh.grade_level;
                }

                const { data: result, error } = await db.rpc('get_classroom_summary_datatable', {
                    p_year: currentYear,
                    p_term: currentTerm,
                    p_search: searchValue,
                    p_order_column: orderCol,
                    p_order_dir: orderDir,
                    p_start: data.start,
                    p_length: data.length,
                    p_grade_level: gradeLevel
                });

                if (error) {
                    console.error('RPC Error:', error);
                    callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
                    Swal.close();
                    return;
                }

                const res = result;
                const rows = (res.data || []).map(row => ({
                    ...row,
                    action: `<button onclick="editFromTable('${row.classroom_id}')" class="text-blue-500 hover:text-blue-700 p-2"><i class="fas fa-edit"></i></button>`
                }));

                // อัปเดตการ์ด Dashboard
                if (res.summary) {
                    renderDashboard(
                        res.summary.totalStudents,
                        res.summary.completeStudents,
                        res.summary.incompleteStudents,
                        res.summary.notVisitedStudents
                    );
                }

                Swal.close();

                callback({
                    draw: data.draw,
                    recordsTotal: res.recordsTotal,
                    recordsFiltered: res.recordsFiltered,
                    data: rows
                });
            },
            columns: [
                { data: 'room', title: 'ห้องเรียน', orderable: true },
                { data: 'adviser1', title: 'ครูที่ปรึกษาคนที่ 1', orderable: false },
                { data: 'adviser2', title: 'ครูที่ปรึกษาคนที่ 2', orderable: false },
                { data: 'total_students', title: 'นร.ทั้งหมด', orderable: true, className: 'text-center' },
                { data: 'visited_count', title: 'เยี่ยมแล้ว', orderable: true, className: 'text-center' },
                {
                    data: 'status',
                    title: 'สถานะ',
                    orderable: false,
                    render: function (data, type) {
                        if (type === 'display') {
                            return `<span class="px-3 py-1 rounded-xl text-[10px] font-black uppercase ${data.color}">${data.text}</span>`;
                        }
                        return data.text;
                    }
                },
                {
                    data: 'action',
                    title: 'จัดการ',
                    orderable: false,
                    className: 'text-right'
                }
            ],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
            },
            pageLength: 25,
            order: [[0, 'asc']],
            drawCallback: function () {
                // ผูก event หรือทำความสะอาดเพิ่มเติมได้ที่นี่
            }
        });

        return; // จบส่วน admin
    }

    // ========== ส่วนของครูที่ปรึกษา (คงเดิม) ==========
    const classroomId = window.currentClassroomId;
    const tbody = document.getElementById('tb-teacher-students');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        if (!classroomId) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียนในแท็บฟอร์มก่อน</td></tr>';
            renderDashboard(0, 0, 0, 0);
            Swal.close();
            return;
        }

        const { data: classroom, error: classError } = await db.from('core_classrooms')
            .select('grade_level, room_number')
            .eq('id', classroomId)
            .single();

        if (classError) console.warn('ไม่พบข้อมูลห้องเรียน', classError);
        const roomLabel = classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';

        const { data: enrolls, error: enrollError } = await db.from('student_enrollments')
            .select('student_id, student_number, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('classroom_id', classroomId)
            .order('student_number');

        if (enrollError) throw enrollError;

        if (!enrolls || enrolls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400">ไม่มีนักเรียนในห้องนี้</td></tr>';
            renderDashboard(0, 0, 0, 0);
            Swal.close();
            return;
        }

        const studentIds = enrolls.map(e => e.student_id);
        const { data: visits, error: visitError } = await db.from('module_home_visits')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        if (visitError) throw visitError;

        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        window.overviewCompleteList = [];
        window.overviewIncompleteList = [];
        window.overviewNotVisitedList = [];
        let completeCount = 0, incompleteCount = 0, notVisitedCount = 0;

        const rowsHtml = enrolls.map(e => {
            const s = e.core_students;
            const visit = visitMap[s.id] || null;
            const isVisited = visit && visit.visit_status === 'เยี่ยมแล้ว';

            const studentItem = {
                id: s.student_id_card || '-',
                name: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                student_uuid: s.id,
                room: roomLabel
            };

            if (isVisited) {
                const completeness = getCompletenessStatus(visit);
                if (completeness.complete) {
                    completeCount++;
                    window.overviewCompleteList.push(studentItem);
                } else {
                    incompleteCount++;
                    window.overviewIncompleteList.push(studentItem);
                }
            } else {
                notVisitedCount++;
                window.overviewNotVisitedList.push(studentItem);
            }

            const completeBadge = isVisited ?
                (getCompletenessStatus(visit).complete ?
                    '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-check-double mr-1"></i> ครบ</span>' :
                    '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> ยังไม่ครบ</span>') :
                '<span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-hourglass-half mr-1"></i> รอการเยี่ยม</span>';

            const statusHtml = isVisited ?
                '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase">เยี่ยมแล้ว</span>' :
                '<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase">ยังไม่เยี่ยม</span>';

            const checkButton = (!isVisited ? '' :
                (getCompletenessStatus(visit).complete ?
                    '<span class="text-slate-400 text-xs px-2">-</span>' :
                    `<button onclick="showMissingFields('${s.id}')" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 text-xs font-bold transition"><i class="fas fa-list mr-1"></i> รายการที่ขาด</button>`)
            );

            let lockHtml = '';
            if (isVisited) {
                lockHtml = visit.is_verified ?
                    `<span class="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200"><i class="fas fa-lock"></i> ล็อกแล้ว</span>` :
                    `<button onclick="verifyVisit('${visit.id}')" class="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded border border-amber-200 transition text-xs font-bold" title="ล็อกข้อมูล"><i class="fas fa-lock"></i> ล็อก</button>`;
            } else {
                lockHtml = `<span class="text-slate-400 text-xs">-</span>`;
            }

            let actions = '';
            if (isVisited) {
                actions = `<div class="flex justify-center gap-2 flex-wrap items-center">
                <button onclick="editStudentVisit('${visit.id}')" class="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded border border-sky-200 transition" title="แก้ไข"><i class="fas fa-edit"></i></button>
                <button onclick="printPDF('${visit.id}')" class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition" title="พิมพ์ PDF"><i class="fas fa-print"></i></button>
                ${visit.pdf_url ? `<button onclick="viewExistingPDF('${visit.pdf_url}')" class="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition" title="ดู PDF"><i class="fas fa-file-pdf"></i></button>` : ''}
                ${lockHtml}
                ${checkButton}
            </div>`;
            } else {
                actions = `<button onclick="selectStudentForForm('${s.id}')" class="text-rose-600 hover:bg-rose-50 px-3 py-1 rounded border border-rose-200 text-xs font-bold transition"><i class="fas fa-plus mr-1"></i> บันทึกข้อมูล</button>`;
            }

            return `<tr class="hover:bg-slate-50">
            <td class="py-3 px-4 text-center font-bold">${e.student_number || '-'}</td>
            <td class="py-3 px-4">${s.student_id_card || '-'}</td>
            <td class="py-3 px-4">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
            <td class="py-3 px-4">${visit?.visit_date || '-'}</td>
            <td class="py-3 px-4 text-center">${visit?.visit_times || '-'}</td>
            <td class="py-3 px-4 text-center">${statusHtml}</td>
            <td class="py-3 px-4 text-center">${completeBadge}</td>
            <td class="py-3 px-4 text-center">${actions}</td>
        </tr>`;
        }).join('');

        tbody.innerHTML = rowsHtml;
        renderDashboard(enrolls.length, completeCount, incompleteCount, notVisitedCount);
        Swal.close();

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-500">เกิดข้อผิดพลาด</td></tr>';
        renderDashboard(0, 0, 0, 0);
        Swal.close();
    }
};

// ==========================================
// ฟังก์ชันสำหรับแสดงการ์ดภาพรวม (Dashboard)
// ==========================================
window.renderDashboard = function (total, completed, incomplete, notVisited) {
    const dashboardEl = document.getElementById('dashboard-stats');
    if (!dashboardEl) return;

    const pctCompleted = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pctIncomplete = total > 0 ? Math.round((incomplete / total) * 100) : 0;
    const pctNotVisited = total > 0 ? Math.round((notVisited / total) * 100) : 0;

    dashboardEl.innerHTML = `
        <div class="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full mb-6">
            <div class="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl shadow-sm relative overflow-hidden">
                <h4 class="font-bold text-indigo-800 text-sm">นักเรียนทั้งหมด</h4>
                <p class="text-3xl font-black text-indigo-600 mt-1">${total} <span class="text-sm font-normal text-indigo-500">คน</span></p>
                <p class="text-xs text-indigo-400 mt-1">100%</p>
                <i class="fas fa-users absolute -bottom-4 -right-4 text-6xl text-indigo-200 opacity-40"></i>
            </div>
            <div onclick="fetchOverviewStudentList('complete')" class="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl shadow-sm relative overflow-hidden cursor-pointer hover:bg-emerald-100 transition group">
                <h4 class="font-bold text-emerald-800 text-sm">เยี่ยมบ้านครบถ้วน</h4>
                <p class="text-3xl font-black text-emerald-600 mt-1">${completed} <span class="text-sm font-normal text-emerald-500">คน</span></p>
                <p class="text-xs text-emerald-400 mt-1">${pctCompleted}%</p>
                <i class="fas fa-check-circle absolute -bottom-4 -right-4 text-6xl text-emerald-200 opacity-40"></i>
                <div class="absolute top-3 right-3 text-emerald-400 opacity-60 group-hover:opacity-100 transition"><i class="fas fa-search-plus text-sm"></i></div>
            </div>
            <div onclick="fetchOverviewStudentList('incomplete')" class="bg-amber-50 border border-amber-100 p-5 rounded-2xl shadow-sm relative overflow-hidden cursor-pointer hover:bg-amber-100 transition group">
                <h4 class="font-bold text-amber-800 text-sm">เยี่ยมบ้านยังไม่ครบถ้วน</h4>
                <p class="text-3xl font-black text-amber-600 mt-1">${incomplete} <span class="text-sm font-normal text-amber-500">คน</span></p>
                <p class="text-xs text-amber-400 mt-1">${pctIncomplete}%</p>
                <i class="fas fa-exclamation-triangle absolute -bottom-4 -right-4 text-6xl text-amber-200 opacity-40"></i>
                <div class="absolute top-3 right-3 text-amber-400 opacity-60 group-hover:opacity-100 transition"><i class="fas fa-search-plus text-sm"></i></div>
            </div>
            <div onclick="fetchOverviewStudentList('not_visited')" class="bg-rose-50 border border-rose-100 p-5 rounded-2xl shadow-sm relative overflow-hidden cursor-pointer hover:bg-rose-100 transition group">
                <h4 class="font-bold text-rose-800 text-sm">ยังไม่เยี่ยม</h4>
                <p class="text-3xl font-black text-rose-600 mt-1">${notVisited} <span class="text-sm font-normal text-rose-500">คน</span></p>
                <p class="text-xs text-rose-400 mt-1">${pctNotVisited}%</p>
                <i class="fas fa-times-circle absolute -bottom-4 -right-4 text-6xl text-rose-200 opacity-40"></i>
                <div class="absolute top-3 right-3 text-rose-400 opacity-60 group-hover:opacity-100 transition"><i class="fas fa-search-plus text-sm"></i></div>
            </div>
        </div>
    `;
};

window.fetchOverviewStudentList = async function (type) {
    let statusParam, titleText, themeColor;
    if (type === 'complete') {
        statusParam = 'complete';
        titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลครบสมบูรณ์)';
        themeColor = 'text-green-700 bg-green-50 border-green-200';
    } else if (type === 'incomplete') {
        statusParam = 'incomplete';
        titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลยังไม่ครบ)';
        themeColor = 'text-amber-700 bg-amber-50 border-amber-200';
    } else if (type === 'not_visited') {
        statusParam = 'not_visited';
        titleText = 'รายชื่อนักเรียนที่ ยังไม่ได้เยี่ยมบ้าน';
        themeColor = 'text-slate-700 bg-slate-100 border-slate-200';
    } else return;

    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    let gradeLevel = null;
    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads')
            .select('grade_level').eq('teacher_id', currentUser.id).single();
        if (gh) gradeLevel = gh.grade_level;
    }

    const { data, error } = await db.rpc('get_students_by_status', {
        p_year: currentYear,
        p_term: currentTerm,
        p_status: statusParam,
        p_grade_level: gradeLevel
    });

    Swal.close();
    if (error) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถดึงข้อมูลได้', 'error');
        return;
    }

    // data เป็น array ของ { id, name, student_uuid, room }
    if (!data || data.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบนักเรียนในหมวดนี้', 'info');
        return;
    }

    showStudentListModal(data, titleText, themeColor);
};

// ==========================================
// ตัวแปรและฟังก์ชันสำหรับจัดการกราฟ (Chart.js)
// ==========================================
let barChartInstance = null;
let doughnutChartInstance = null;

function destroyCharts() {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
        renderTimeout = null;
    }
    if (barChartInstance) {
        barChartInstance.destroy();
        barChartInstance = null;
    }
    if (doughnutChartInstance) {
        doughnutChartInstance.destroy();
        doughnutChartInstance = null;
    }
    isRenderingCharts = false;
    // ✅ ลบ container ทิ้งเพื่อไม่ให้มีของค้าง
    const container = document.getElementById('grade-charts-container');
    if (container) container.remove();
}

function toggleClassroomSelect(scope) {
    const container = document.getElementById('classroom-select-container');
    if (!container) return;
    if (scope === 'classroom') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

// ==========================================
// ฟังก์ชันกลางสำหรับแสดงรายชื่อนักเรียนในรูปแบบ DataTable
// ==========================================
window.showStudentListModal = function (list, titleText, themeColor, extraFooterHtml = '') {
    if (!list || list.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายชื่อนักเรียนในหมวดหมู่นี้', 'info');
        return;
    }

    const tableId = 'student-list-table-' + Date.now();

    const rowsHtml = list.map((s, idx) => `
        <tr>
            <td class="text-center">${idx + 1}</td>
            <td class="text-center font-bold">${s.room || '-'}</td>
            <td class="font-mono">${s.id}</td>
            <td class="font-bold">${s.name}</td>
            <td class="text-center">
                <button onclick="editHomeVisit('${s.student_uuid}')" 
                        class="text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 transition text-xs font-bold flex items-center justify-center gap-1 mx-auto">
                    <i class="fas fa-eye"></i> ดูข้อมูล
                </button>
            </td>
        </tr>
    `).join('');

    const html = `
        <div class="max-h-[70vh] overflow-y-auto">
            <table id="${tableId}" class="display nowrap" style="width:100%">
                <thead class="${themeColor}">
                    <tr>
                        <th class="text-center">ลำดับ</th>
                        <th class="text-center">ชั้น</th>
                        <th>รหัสประจำตัว</th>
                        <th>ชื่อ - นามสกุล</th>
                        <th class="text-center">จัดการ</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        ${extraFooterHtml ? `<div class="text-xs text-slate-400 mt-3 text-center">${extraFooterHtml}</div>` : ''}
    `;

    Swal.fire({
        title: `<div class="text-xl font-black text-slate-800">${titleText}</div>
                <div class="text-sm font-normal text-slate-500 mt-1">จำนวน ${list.length} คน</div>`,
        html: html,
        width: '95%',
        maxWidth: '1200px',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            popup: 'rounded-2xl shadow-2xl',
            closeButton: 'bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-lg transition mt-2 mr-2'
        },
        didOpen: () => {
            new DataTable('#' + tableId, {
                responsive: true,
                pageLength: 10,
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
                },
                columnDefs: [
                    { orderable: false, targets: [0, 4] } // ปิดการเรียงลำดับในคอลัมน์ ลำดับ และ จัดการ
                ],
                order: [[1, 'asc']] // เรียงตามชั้น (คอลัมน์ที่ 1)
            });
        }
    });
};

// ==========================================
// แสดงรายชื่อนักเรียนจาก Overview (4 การ์ด)
// ==========================================
window.showOverviewStudentList = function (type) {
    let list, titleText, themeColor;

    switch (type) {
        case 'complete':
            list = window.overviewCompleteList || [];
            titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลครบสมบูรณ์)';
            themeColor = 'text-green-700 bg-green-50 border-green-200';
            break;
        case 'incomplete':
            list = window.overviewIncompleteList || [];
            titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลยังไม่ครบ)';
            themeColor = 'text-amber-700 bg-amber-50 border-amber-200';
            break;
        case 'not_visited':
            list = window.overviewNotVisitedList || [];
            titleText = 'รายชื่อนักเรียนที่ ยังไม่ได้เยี่ยมบ้าน';
            themeColor = 'text-slate-700 bg-slate-100 border-slate-200';
            break;
        default:
            Swal.fire('ข้อผิดพลาด', 'ประเภทข้อมูลไม่ถูกต้อง', 'error');
            return;
    }

    // เรียงลำดับตามรหัส
    list.sort((a, b) => a.id.localeCompare(b.id));

    showStudentListModal(list, titleText, themeColor);
};

// ==========================================
// ฟังก์ชันส่งออก Excel (สำหรับหน้าแอดมินเท่านั้น)
// ==========================================
window.exportToExcel = async function () {
    Swal.fire({ title: 'กำลังเตรียมข้อมูลส่งออก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

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
                .select('classroom_id, student_id, visit_status')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm),
            getPersonnelMap()
        ]);

        if (!classrooms || classrooms.length === 0) {
            Swal.close();
            return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลห้องเรียนในขอบเขตนี้', 'info');
        }

        const { data: enrolls } = await db.from('student_enrollments')
            .select('classroom_id, student_id')
            .in('classroom_id', classrooms.map(c => c.id));

        const totalMap = {}, visitedMap = {};
        (enrolls || []).forEach(e => { totalMap[e.classroom_id] = (totalMap[e.classroom_id] || 0) + 1; });
        (visits || []).forEach(v => {
            if (v.visit_status === 'เยี่ยมแล้ว') {
                visitedMap[v.classroom_id] = (visitedMap[v.classroom_id] || 0) + 1;
            }
        });

        const rows = [['ห้องเรียน', 'ครูที่ปรึกษาคนที่ 1', 'ครูที่ปรึกษาคนที่ 2', 'จำนวนนักเรียนทั้งหมด', 'เยี่ยมแล้ว', 'สถานะ']];

        classrooms.forEach(c => {
            const room = `ม.${c.grade_level}/${c.room_number}`;
            const adv1 = staffMap[c.adviser_id_1] || '-';
            const adv2 = staffMap[c.adviser_id_2] || '-';
            const total = totalMap[c.id] || 0;
            const visited = visitedMap[c.id] || 0;
            const status = total === 0 ? 'ไม่มีนักเรียน' : (visited >= total ? 'ครบถ้วน' : 'ยังไม่ครบ');

            rows.push([room, adv1, adv2, total, visited, status]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Overview_Admin');

        const fileName = `สรุปภาพรวมเยี่ยมบ้าน_เทอม${currentTerm}_${currentYear}`;
        XLSX.writeFile(wb, `${fileName}.xlsx`);
        Swal.close();
        Swal.fire('สำเร็จ', 'ส่งออกข้อมูลภาพรวมเรียบร้อย', 'success');

    } catch (err) {
        console.error('exportToExcel error:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้: ' + err.message, 'error');
    }
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
        const student = visit.core_students;
        const classroom = visit.core_classrooms;
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_number')
            .eq('student_id', visit.student_id)
            .eq('classroom_id', visit.classroom_id)
            .maybeSingle();
        const studentNumber = enroll?.student_number || '-';
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
        const formatThaiDate = (dateStr) => {
            if (!dateStr) return '';
            const monthsThai = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            const d = new Date(dateStr);
            const day = d.getDate();
            const month = monthsThai[d.getMonth()];
            const year = d.getFullYear() + 543;
            return `วันที่ ${day} ${month} ${year}`;
        };
        const visitDateThai = formatThaiDate(visit.visit_date);
        const formatRiskList = (riskArr) => (riskArr || []).join(', ');
        const studentFullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
        const studentIdCard = student.student_id_card || '-';
        const fullAddress = `${visit.house_number || ''} ${visit.village_no || ''} ต.${visit.sub_district || ''} อ.${visit.district || ''} จ.${visit.province || ''} ${visit.zipcode || ''}`.trim();
        const family = visit.family_members || {};
        const economic = visit.economic_data || {};
        const relations = visit.family_relations || {};
        const risk = visit.risk_data || {};
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
        const defaultRel = 'ไม่มี';
        const replacements = {
            "{{STUDENT_NAME}}": studentFullName,
            "{{STUDENT_ID}}": studentIdCard,
            "{{STUDENT_NUMBER}}": studentNumber,
            "{{STUDENT_NICKNAME}}": visit.student_nickname || '-',
            "{{STUDENT_PHONE}}": visit.student_phone || '-',
            "{{STUDENT_LINE}}": visit.student_line || '-',
            "{{CLASSROOM}}": classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-',
            "{{VISIT_DATE}}": visit.visit_date || '-',
            "{{VISIT_DATE_TH}}": visitDateThai,
            "{{VISIT_TIMES}}": visit.visit_times || '1',
            "{{TEACHER1_NAME}}": teacher1Name,
            "{{TEACHER2_NAME}}": teacher2Name,
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
            "{{ENV_HOUSE_STATUS}}": visit.env_house_status || '-',
            "{{ENV_CLEAN_STATUS}}": visit.env_clean_status || '-',
            "{{ENV_LOCATION_STATUS}}": visit.env_location_status || '-',
            "{{UTILITY_ELECTRIC}}": visit.utility_electric || '-',
            "{{UTILITY_WATER}}": visit.utility_water || '-',
            "{{UTILITY_TOILET}}": visit.utility_toilet || '-',
            "{{FAMILY_TOTAL}}": family.total || '0',
            "{{FAMILY_MALE}}": family.male || '0',
            "{{FAMILY_FEMALE}}": family.female || '0',
            "{{SIB_SAME_TOTAL}}": family.sib_same_total || '0',
            "{{SIB_SAME_MALE}}": family.sib_same_male || '0',
            "{{SIB_SAME_FEMALE}}": family.sib_same_female || '0',
            "{{SIB_DIFF_TOTAL}}": family.sib_diff_total || '0',
            "{{SIB_DIFF_MALE}}": family.sib_diff_male || '0',
            "{{SIB_DIFF_FEMALE}}": family.sib_diff_female || '0',
            "{{REL_FATHER}}": relMap['FATHER'] || defaultRel,
            "{{REL_MOTHER}}": relMap['MOTHER'] || defaultRel,
            "{{REL_BROTHER}}": relMap['BROTHER'] || defaultRel,
            "{{REL_SISTER}}": relMap['SISTER'] || defaultRel,
            "{{REL_GRANDPARENT}}": relMap['GRANDPARENT'] || defaultRel,
            "{{REL_RELATIVE}}": relMap['RELATIVE'] || defaultRel,
            "{{ECONOMIC_INCOME}}": economic.income || '0',
            "{{ALLOWANCE_SOURCE}}": economic.allowance_source || '-',
            "{{STUDENT_JOB_NAME}}": economic.student_job_name || '-',
            "{{STUDENT_JOB_INCOME}}": economic.student_job_income || '0',
            "{{MONEY_TO_SCHOOL}}": economic.money_to_school || '0',
            "{{FAMILY_RELATIONS_STATUS}}": relations.status || '-',
            "{{TIME_TOGETHER_HOURS}}": relations.time_together || '0',
            "{{SPECIAL_HELP_DETAILS}}": visit.special_help_details || '-',
            "{{RESPONSIBILITIES_DETAILS}}": visit.responsibilities_details || '-',
            "{{HOBBIES_DETAILS}}": visit.hobbies_details || '-',
            "{{LEAVE_WITH_WHOM}}": visit.leave_with_whom_details || '-',
            "{{GUARDIAN_CONCERNS}}": visit.guardian_concerns || '-',
            "{{GUARDIAN_REQUESTS}}": visit.guardian_requests || '-',
            "{{PAST_WELFARE}}": visit.past_welfare || '-',
            "{{INFORMANT_TYPE}}": visit.informant_type || '-',
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
            "{{PHOTO_STUDENT_IMAGE}}": visit.photo_student || '',
            "{{PHOTO_OUTSIDE_IMAGE}}": visit.photo_outside || '',
            "{{PHOTO_INSIDE_IMAGE}}": visit.photo_inside || '',
            "{{PHOTO_TEACHER_IMAGE}}": visit.photo_teacher || ''
        };
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

window.verifyVisit = async function (visitId) {
    if (!visitId) return;
    const result = await Swal.fire({
        title: 'ยืนยันการล็อกข้อมูล?',
        text: 'เมื่อล็อกแล้ว นักเรียนจะไม่สามารถแก้ไขข้อมูลนี้ได้อีก แต่คุณยังสามารถแก้ไขได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0d9488',
        confirmButtonText: 'ยืนยันล็อก',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;
    Swal.fire({ title: 'กำลังล็อกข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('module_home_visits')
        .update({ is_verified: true, verified_by: currentUser.id, verified_at: new Date().toISOString() })
        .eq('id', visitId);
    if (error) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถล็อกข้อมูลได้: ' + error.message, 'error');
        return;
    }
    Swal.fire({ icon: 'success', title: 'ล็อกข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
    loadDataTable();
};

// ==========================================
// 4. ADMIN MODAL
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
            show_report: data.settings.show_report || "false"
        };
    }
}

window.openAdminModal = async function () {
    // ✅ ใช้ requireAdmin จาก config.js
    if (!window.requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถตั้งค่าระบบได้')) return;
    
    document.getElementById('admin-modal').classList.remove('hidden');
    await loadAdminSettings();
    
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
    // ✅ ใช้ isAdminUser จาก config.js
    if (!window.isAdminUser(currentUserRole, isAdminMode)) return;
    
    await loadModuleSettings();
    document.getElementById('set-gas-url').value = moduleSettings.gas_url;
    document.getElementById('set-drive-folder-id').value = moduleSettings.drive_folder_id;
    document.getElementById('set-pdf-api-url').value = moduleSettings.pdf_api_url;
    document.getElementById('set-slide-id').value = moduleSettings.slide_template_url;
    document.getElementById('set-pdf-folder-id').value = moduleSettings.gd_pdf_folder_id;
    const reportTemplateEl = document.getElementById('set-report-template-id');
    if (reportTemplateEl) reportTemplateEl.value = moduleSettings.report_template_id;
    const showReportCheckbox = document.getElementById('setting-show-report');
    if (showReportCheckbox) {
        showReportCheckbox.checked = (moduleSettings.show_report === 'true');
    }
    await Promise.all([loadTeachersForAppoint(), loadModuleAdminsList()]);
}

async function saveAdminSettings() {
    // ✅ ใช้ requireAdmin จาก config.js
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;
    
    const showReportCheckbox = document.getElementById('setting-show-report');
    const showReportValue = showReportCheckbox ? (showReportCheckbox.checked ? 'true' : 'false') : 'false';
    const payload = {
        gas_url: document.getElementById('set-gas-url').value.trim(),
        drive_folder_id: document.getElementById('set-drive-folder-id').value.trim(),
        pdf_api_url: document.getElementById('set-pdf-api-url').value.trim(),
        slide_template_url: document.getElementById('set-slide-id').value.trim(),
        gd_pdf_folder_id: document.getElementById('set-pdf-folder-id').value.trim(),
        report_template_id: document.getElementById('set-report-template-id')?.value.trim() || "",
        show_report: showReportValue
    };
    const { error } = await db.from('core_system_modules').update({ settings: payload }).eq('module_id', 'homevisit');
    if (error) return Swal.fire('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
    moduleSettings = payload;
    Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
    closeAdminModal();
    applyReportVisibility();
}

async function loadTeachersForAppoint() {
    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาชื่อครู --</option>';
    try {
        const { data, error } = await db.from('core_personnel')
            .select('id, first_name, last_name')
            .order('first_name');
        if (error) throw error;
        if (data && data.length > 0) {
            data.forEach(t => {
                select.innerHTML += `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`;
            });
        }
        if (window.tsTeacherAppoint) window.tsTeacherAppoint.destroy();
        window.tsTeacherAppoint = new TomSelect("#select-teacher-appoint", {
            create: false,
            placeholder: "ค้นหาชื่อครู..."
        });
    } catch (err) {
        console.error('loadTeachersForAppoint error:', err);
        select.innerHTML = '<option value="">ไม่สามารถโหลดรายชื่อครู</option>';
    }
}

async function loadModuleAdminsList() {
    // ✅ ใช้ isAdminUser จาก config.js
    if (!window.isAdminUser(currentUserRole, isAdminMode)) return;
    
    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400">กำลังโหลด...</td></tr>';
    try {
        const { data, error } = await db.from('core_module_admins')
            .select('id, user_id')
            .eq('module_id', 'homevisit');
        if (error) {
            console.error('Error loading module admins:', error);
            tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
            return;
        }
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400 text-xs">ยังไม่มีการแต่งตั้งผู้ดูแลระบบ</td></tr>';
            return;
        }
        const personnelMap = await getPersonnelMap();
        const rows = data
            .filter(admin => personnelMap[admin.user_id])
            .map(admin => {
                const name = personnelMap[admin.user_id];
                return `
                    <tr class="hover:bg-slate-50">
                        <td class="py-3 px-4 font-bold text-slate-700 flex items-center gap-2">
                            <div class="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px]">
                                <i class="fas fa-user-shield"></i>
                            </div>
                            ${name}
                        </td>
                        <td class="py-3 px-4 text-center">
                            <button onclick="removeModuleAdmin('${admin.id}')" 
                                    class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        tbody.innerHTML = rows.join('') || '<tr><td colspan="2" class="text-center py-4 text-slate-400 text-xs">ไม่พบข้อมูลผู้ใช้ที่ถูกต้อง</td></tr>';
    } catch (err) {
        console.error('loadModuleAdminsList error:', err);
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-red-400">เกิดข้อผิดพลาด</td></tr>';
    }
}

window.appointModuleAdmin = async function () {
    // ✅ ใช้ requireAdmin จาก config.js
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;
    
    const teacherId = document.getElementById('select-teacher-appoint').value;
    if (!teacherId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชื่อครู', 'warning');
    }
    const { data: existing } = await db.from('core_module_admins')
        .select('id')
        .eq('user_id', teacherId)
        .eq('module_id', 'homevisit')
        .maybeSingle();
    if (existing) {
        return Swal.fire('แจ้งเตือน', 'ครูท่านนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
    }
    const { error } = await db.from('core_module_admins')
        .insert({ user_id: teacherId, module_id: 'homevisit' });
    if (error) {
        if (error.code === '23505') {
            return Swal.fire('แจ้งเตือน', 'ครูท่านนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
        }
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }
    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'แต่งตั้งแอดมินโมดูลเรียบร้อย', timer: 1500, showConfirmButton: false });
    window.tsTeacherAppoint?.clear();
    await loadModuleAdminsList();
};

window.removeModuleAdmin = async function (recordId) {
    // ✅ ใช้ requireAdmin จาก config.js
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;
    
    const result = await Swal.fire({
        title: 'ยืนยันการปลดสิทธิ์?',
        text: "ครูท่านนี้จะกลับไปเห็นข้อมูลเฉพาะห้องประจำชั้นของตนเอง",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'ปลดสิทธิ์',
        cancelButtonText: 'ยกเลิก'
    });
    if (result.isConfirmed) {
        const { error } = await db.from('core_module_admins').delete().eq('id', recordId);
        if (error) {
            Swal.fire('ผิดพลาด', 'ไม่สามารถปลดสิทธิ์ได้: ' + error.message, 'error');
            return;
        }
        Swal.fire({ icon: 'success', title: 'ปลดสิทธิ์เรียบร้อย', timer: 1500, showConfirmButton: false });
        await loadModuleAdminsList();
    }
};

// ==========================================
// 5. REPORT
// ==========================================
window.loadReport = async function () {
    // ป้องกันการเรียกซ้ำ
    if (isReportLoading) {
        console.warn('loadReport กำลังทำงานอยู่');
        return;
    }
    isReportLoading = true;

    // ลบกราฟเก่า
    destroyCharts();
    // รีเซ็ต flag การเรนเดอร์กราฟ
    isRenderingCharts = false;

    const scope = document.getElementById('report-scope').value;
    const grade = document.getElementById('report-grade')?.value;
    const classroomId = document.getElementById('report-classroom')?.value;

    // ถ้าเลือก "แยกตามระดับชั้น" แต่ยังไม่ได้เลือกระดับชั้น
    if (scope === 'grade' && !grade) {
        document.getElementById('report-content').innerHTML = `
            <div class="text-center py-10 text-blue-500">
                <i class="fas fa-layer-group text-3xl mb-3 block"></i>
                <p class="font-bold">กรุณาเลือกระดับชั้น</p>
                <p class="text-sm text-slate-400 mt-1">เลือกระดับชั้นที่ต้องการดูรายงานจาก dropdown ด้านบน</p>
            </div>
        `;
        isReportLoading = false;
        return;
    }

    // ถ้าเลือก "ระบุห้องเรียน" แต่ยังไม่ได้เลือกห้อง
    if (scope === 'classroom' && !classroomId) {
        Swal.fire('กรุณาเลือกห้องเรียน', 'เลือกห้องเรียนที่ต้องการดูรายงาน', 'warning');
        isReportLoading = false;
        return;
    }

    Swal.fire({ title: 'กำลังประมวลผลรายงาน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        let classIds = [];
        if (scope === 'myclass') {
            const { data } = await db.from('core_classrooms')
                .select('id')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
            classIds = (data || []).map(c => c.id);
            if (classIds.length === 0) {
                Swal.close();
                document.getElementById('report-content').innerHTML = `
                    <div class="text-center py-10 text-amber-600">
                        <i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i>
                        <p class="font-bold">ไม่พบห้องเรียนที่คุณเป็นครูที่ปรึกษา</p>
                        <p class="text-sm text-slate-400 mt-1">กรุณาเลือก "แยกตามระดับชั้น" หรือ "ทั้งโรงเรียน" แทน</p>
                    </div>
                `;
                return;
            }
        } else if (scope === 'grade') {
            const { data } = await db.from('core_classrooms')
                .select('id')
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .eq('grade_level', grade);
            classIds = (data || []).map(c => c.id);
        } else if (scope === 'classroom') {
            classIds = [classroomId];
        } else {
            // all
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

        const { data: visits } = await db.from('module_home_visits')
            .select('*')
            .in('classroom_id', classIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        const visitedMap = {};
        (visits || []).forEach(v => { visitedMap[v.student_id] = v; });

        // ประกาศตัวแปรเก็บรายชื่อแยก
        window.reportCompleteList = [];
        window.reportIncompleteList = [];
        window.reportNotVisitedList = [];

        let visitedCompleteCount = 0;
        let visitedIncompleteCount = 0;

        const riskStudents = {
            learning: [], health: [], drugs: [], violence: [],
            sex: [], gaming: [], economy: []
        };
        const problemStudents = {
            learning: [], health: [], drugs: [], violence: [],
            sex: [], gaming: [], economy: []
        };

        const riskCounts = { learning: 0, health: 0, drugs: 0, violence: 0, sex: 0, gaming: 0, economy: 0 };
        const problemCounts = { ...riskCounts };

        uniqueStudents.forEach(s => {
            const visit = visitedMap[s.id];
            const studentItem = {
                id: s.student_id_card || '-',
                name: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                room: s.room_label || '-',
                student_uuid: s.id
            };

            if (visit && visit.visit_status === 'เยี่ยมแล้ว') {
                const completeness = getCompletenessStatus(visit);
                if (completeness.complete) {
                    visitedCompleteCount++;
                    window.reportCompleteList.push(studentItem);
                } else {
                    visitedIncompleteCount++;
                    window.reportIncompleteList.push(studentItem);
                }

                const risk = visit.risk_factors || visit.risk_data || {};
                const eco = visit.economic_data || {};
                const special = visit.special_help_details || '';

                const evaluateRisk = (category, conditionRisk, conditionProblem) => {
                    if (conditionProblem) {
                        problemCounts[category]++;
                        problemStudents[category].push(studentItem);
                    } else if (conditionRisk) {
                        riskCounts[category]++;
                        riskStudents[category].push(studentItem);
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

        const notVisitedCount = totalStudents - visitedCompleteCount - visitedIncompleteCount;
        const catNames = {
            learning: 'การเรียน', health: 'สุขภาพ', drugs: 'สารเสพติด',
            violence: 'ความรุนแรง', sex: 'เรื่องเพศ', gaming: 'ติดเกม',
            economy: 'เศรษฐกิจ'
        };

        // --- การ์ดหลัก 4 ใบ ---
        let html = `
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100 shadow-sm">
                <h4 class="font-black text-blue-800">นักเรียนทั้งหมด</h4>
                <p class="text-3xl font-black text-blue-700">${totalStudents} <span class="text-sm font-normal text-blue-500">คน</span></p>
            </div>
            <div onclick="showReportStudentList('complete')" class="bg-green-50 p-4 rounded-2xl cursor-pointer hover:bg-green-100 transition border border-green-100 shadow-sm relative group">
                <h4 class="font-black text-green-800">เยี่ยมบ้านแล้ว (ครบ)</h4>
                <p class="text-3xl font-black text-green-700">${visitedCompleteCount} <span class="text-sm font-normal text-green-500">คน</span></p>
                <div class="absolute top-4 right-4 text-green-400 group-hover:text-green-600 transition"><i class="fas fa-search-plus"></i></div>
            </div>
            <div onclick="showReportStudentList('incomplete')" class="bg-amber-50 p-4 rounded-2xl cursor-pointer hover:bg-amber-100 transition border border-amber-100 shadow-sm relative group">
                <h4 class="font-black text-amber-800">เยี่ยมบ้านแล้ว (ไม่ครบ)</h4>
                <p class="text-3xl font-black text-amber-700">${visitedIncompleteCount} <span class="text-sm font-normal text-amber-500">คน</span></p>
                <div class="absolute top-4 right-4 text-amber-400 group-hover:text-amber-600 transition"><i class="fas fa-search-plus"></i></div>
            </div>
            <div onclick="showReportStudentList('not_visited')" class="bg-slate-100 p-4 rounded-2xl cursor-pointer hover:bg-slate-200 transition border border-slate-200 shadow-sm relative group">
                <h4 class="font-black text-slate-600">ยังไม่ได้เยี่ยม</h4>
                <p class="text-3xl font-black text-slate-600">${notVisitedCount} <span class="text-sm font-normal text-slate-500">คน</span></p>
                <div class="absolute top-4 right-4 text-slate-400 group-hover:text-slate-600 transition"><i class="fas fa-search-plus"></i></div>
            </div>
        </div>`;

        // --- เพิ่มกราฟถ้าเลือก "แยกตามระดับชั้น" ---
        let chartsHtml = '';
        if (scope === 'grade' && grade) {
            // ใน loadReport() ส่วนสร้าง chartsHtml
            chartsHtml = `
                <div id="grade-charts-container" class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200" style="height: 320px;">
                        <h5 class="font-bold text-slate-700 mb-2">จำนวนนักเรียนที่เยี่ยมบ้านครบ/ไม่ครบ แยกรายห้อง</h5>
                        <div style="height: 250px;"> <!-- wrapper มี height ชัดเจน -->
                            <canvas id="barChart"></canvas>
                        </div>
                    </div>
                    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200" style="height: 320px;">
                        <h5 class="font-bold text-slate-700 mb-2">สรุปรวมภาพรวม</h5>
                        <div style="height: 250px;">
                            <canvas id="doughnutChart"></canvas>
                        </div>
                    </div>
                </div>`;
        }
        html += chartsHtml;

        // --- กลุ่มเสี่ยง ---
        const renderCategoryBox = (cat, counts, type) => {
            const catName = catNames[cat];
            const bgClass = type === 'risk' ? 'bg-amber-50' : 'bg-rose-50';
            const borderClass = type === 'risk' ? 'border-amber-100' : 'border-rose-100';
            const hoverClass = type === 'risk' ? 'hover:bg-amber-100' : 'hover:bg-rose-100';
            const iconColor = type === 'risk' ? 'text-amber-400' : 'text-rose-400';
            const iconHover = type === 'risk' ? 'group-hover:text-amber-600' : 'group-hover:text-rose-600';

            return `
            <div onclick="showRiskStudentList('${cat}', '${type}')" 
                 class="${bgClass} p-3 rounded-xl border ${borderClass} shadow-sm cursor-pointer hover:${hoverClass} transition relative group">
                <div class="flex justify-between items-center font-bold text-sm">
                    <span class="text-slate-700">${catName}</span>
                    <span class="${type === 'risk' ? 'text-amber-600' : 'text-rose-600'} bg-white px-2 py-0.5 rounded-full shadow-sm">${counts[cat] || 0} คน</span>
                </div>
                <div class="absolute top-2 right-2 ${iconColor} group-hover:${iconHover} transition">
                    <i class="fas fa-search-plus text-xs"></i>
                </div>
            </div>`;
        };

        html += `<h4 class="font-black text-amber-600 mb-3 flex items-center"><i class="fas fa-exclamation-triangle mr-2"></i>กลุ่มเสี่ยง (เริ่มมีแนวโน้ม)</h4>
                 <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">`;
        for (let cat of Object.keys(catNames)) {
            html += renderCategoryBox(cat, riskCounts, 'risk');
        }
        html += `</div>`;

        html += `<h4 class="font-black text-rose-600 mb-3 flex items-center"><i class="fas fa-biohazard mr-2"></i>กลุ่มมีปัญหา (ต้องช่วยเหลือเร่งด่วน)</h4>
                 <div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
        for (let cat of Object.keys(catNames)) {
            html += renderCategoryBox(cat, problemCounts, 'problem');
        }
        html += `</div>`;

        window._riskData = { risk: riskStudents, problem: problemStudents };
        window._catNames = catNames;

        document.getElementById('report-content').innerHTML = html;
        Swal.close();

        // หลังจากแสดง HTML แล้ว ถ้าเป็น 'grade' ให้สร้างกราฟทันที (ไม่ใช้ setTimeout)
        if (scope === 'grade' && grade) {
            isRenderingCharts = false;
            renderGradeCharts(classrooms, visits, enrolls, grade);
        }
    } catch (err) {
        Swal.close();
        console.error(err);
        document.getElementById('report-content').innerHTML = `<div class="text-center py-10 text-red-500">เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน</div>`;
    } finally {
        isReportLoading = false;
    }
};

// ==========================================
// ฟังก์ชันสร้างกราฟสำหรับระดับชั้น
// ==========================================
function renderGradeCharts(classrooms, visits, enrolls, gradeLevel) {
    // ตรวจสอบ canvas elements
    const barCanvas = document.getElementById('barChart');
    const doughnutCanvas = document.getElementById('doughnutChart');
    if (!barCanvas || !doughnutCanvas) {
        console.warn('Canvas not found, aborting chart render');
        isRenderingCharts = false;
        return;
    }

    // ถ้ามี instance ค้างอยู่ ให้ทำลายเฉพาะ instance โดยไม่ลบ container
    if (barChartInstance) {
        barChartInstance.destroy();
        barChartInstance = null;
    }
    if (doughnutChartInstance) {
        doughnutChartInstance.destroy();
        doughnutChartInstance = null;
    }

    isRenderingCharts = true;

    try {
        // สร้าง lookup สำหรับ visits ต่อ student
        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        // สร้าง lookup สำหรับ enrolls ต่อ classroom
        const enrollMap = {};
        (enrolls || []).forEach(e => {
            if (!enrollMap[e.classroom_id]) enrollMap[e.classroom_id] = [];
            enrollMap[e.classroom_id].push(e);
        });

        // เตรียมข้อมูลสำหรับ Bar chart
        const roomLabels = [];
        const completeData = [];
        const incompleteData = [];
        let totalComplete = 0;
        let totalIncomplete = 0;
        let totalNotVisited = 0;

        classrooms.forEach(c => {
            const roomLabel = `ม.${c.grade_level}/${c.room_number}`;
            roomLabels.push(roomLabel);
            const students = enrollMap[c.id] || [];
            let complete = 0;
            let incomplete = 0;
            students.forEach(e => {
                const v = visitMap[e.student_id];
                if (v && v.visit_status === 'เยี่ยมแล้ว') {
                    const comp = getCompletenessStatus(v);
                    if (comp.complete) {
                        complete++;
                        totalComplete++;
                    } else {
                        incomplete++;
                        totalIncomplete++;
                    }
                } else {
                    totalNotVisited++;
                }
            });
            completeData.push(complete);
            incompleteData.push(incomplete);
        });

        // ถ้าไม่มีห้อง ให้ออก
        if (roomLabels.length === 0) {
            return;
        }

        // สร้าง Bar Chart
        const barCtx = barCanvas.getContext('2d');
        if (barCtx) {
            barChartInstance = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: roomLabels,
                    datasets: [
                        {
                            label: 'เยี่ยมครบ',
                            data: completeData,
                            backgroundColor: 'rgba(16, 185, 129, 0.7)',
                            borderColor: 'rgb(16, 185, 129)',
                            borderWidth: 1
                        },
                        {
                            label: 'เยี่ยมแล้วไม่ครบ',
                            data: incompleteData,
                            backgroundColor: 'rgba(245, 158, 11, 0.7)',
                            borderColor: 'rgb(245, 158, 11)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            stacked: false
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                        }
                    }
                }
            });
        }

        // สร้าง Doughnut Chart
        const totalStudents = totalComplete + totalIncomplete + totalNotVisited;
        if (totalStudents === 0) {
            const doughnutCtx = doughnutCanvas.getContext('2d');
            if (doughnutCtx) {
                doughnutCtx.clearRect(0, 0, 400, 400);
                doughnutCtx.font = '16px Anuphan';
                doughnutCtx.fillStyle = '#94a3b8';
                doughnutCtx.textAlign = 'center';
                doughnutCtx.fillText('ไม่มีข้อมูลนักเรียน', 200, 120);
            }
            return; // isRenderingCharts จะถูก reset ใน finally block
        }

        const doughnutCtx = doughnutCanvas.getContext('2d');
        if (doughnutCtx) {
            doughnutChartInstance = new Chart(doughnutCtx, {
                type: 'doughnut',
                data: {
                    labels: ['เยี่ยมครบ', 'เยี่ยมแล้วไม่ครบ', 'ยังไม่เยี่ยม'],
                    datasets: [{
                        data: [totalComplete, totalIncomplete, totalNotVisited],
                        backgroundColor: ['#10b981', '#f59e0b', '#94a3b8'],
                        borderColor: '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error('Error rendering charts:', err);
    } finally {
        isRenderingCharts = false;
    }
}

// ==========================================
// showRiskStudentList() - ฉบับสมบูรณ์
// ==========================================
window.showRiskStudentList = function (category, type) {
    const dataMap = window._riskData || {};
    const list = dataMap[type]?.[category] || [];
    const catName = window._catNames?.[category] || category;

    if (!list || list.length === 0) {
        Swal.fire('ไม่มีข้อมูล', `ไม่มีนักเรียนในกลุ่ม ${catName}`, 'info');
        return;
    }

    // เรียงลำดับตามห้องแล้วตามรหัส
    list.sort((a, b) => {
        if (a.room !== b.room) return a.room.localeCompare(b.room);
        return a.id.localeCompare(b.id);
    });

    const titleText = type === 'risk'
        ? `⚠️ กลุ่มเสี่ยง (${catName})`
        : `🔴 กลุ่มมีปัญหา (${catName})`;

    const themeColor = type === 'risk'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-rose-700 bg-rose-50 border-rose-200';

    const extraFooterHtml = '💡 คลิกปุ่ม "ดูข้อมูล" เพื่อไปที่หน้ากรอกฟอร์มและตรวจสอบรายละเอียดความเสี่ยง';

    showStudentListModal(list, titleText, themeColor, extraFooterHtml);
};

window.showReportStudentList = function (type) {
    let list, titleText, themeColor;

    switch (type) {
        case 'complete':
            list = window.reportCompleteList || [];
            titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลครบสมบูรณ์)';
            themeColor = 'text-green-700 bg-green-50 border-green-200';
            break;
        case 'incomplete':
            list = window.reportIncompleteList || [];
            titleText = 'รายชื่อนักเรียนที่ เยี่ยมบ้านแล้ว (ข้อมูลยังไม่ครบ)';
            themeColor = 'text-amber-700 bg-amber-50 border-amber-200';
            break;
        case 'not_visited':
            list = window.reportNotVisitedList || [];
            titleText = 'รายชื่อนักเรียนที่ ยังไม่ได้เยี่ยมบ้าน';
            themeColor = 'text-slate-700 bg-slate-100 border-slate-200';
            break;
        default:
            Swal.fire('ข้อผิดพลาด', 'ประเภทข้อมูลไม่ถูกต้อง', 'error');
            return;
    }

    // เรียงลำดับตามห้องแล้วตามรหัส
    list.sort((a, b) => {
        if (a.room !== b.room) return a.room.localeCompare(b.room);
        return a.id.localeCompare(b.id);
    });

    showStudentListModal(list, titleText, themeColor);
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
// 6. OVERVIEW MODAL
// ==========================================

window.openOverviewModal = async function (tab = 'overview') {
    const modal = document.getElementById('overview-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    await updateOverviewAdvisorName();
    if (currentViewRole !== 'teacher') {
        await loadClassroomsForOverview();
    }
    await switchOverviewTab(tab);
};

async function loadClassroomsForOverview() {
    const select = document.getElementById('overview-classroom-select');
    if (!select) return;

    let query = db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level').order('room_number');

    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', currentUser.id)
            .single();
        if (gh) query = query.eq('grade_level', gh.grade_level);
    }

    const { data: classrooms } = await query;

    if (overviewClassroomTom) overviewClassroomTom.destroy();

    const options = (classrooms || []).map(c => ({
        value: c.id,
        text: `ม.${c.grade_level}/${c.room_number}`
    }));

    overviewClassroomTom = new TomSelect('#overview-classroom-select', {
        create: false,
        placeholder: 'พิมพ์ค้นหาห้องเรียน...',
        options: options,
        maxItems: 1,
        maxHeight: '500px',
        maxOptions: 1000,
        dropdownParent: 'body',
        searchField: ['text'],
        score: function (search) {
            return function (item) {
                if (item.text.toLowerCase().includes(search.toLowerCase())) {
                    return 1;
                }
                return 0;
            };
        }
    });
}

async function loadReportClassrooms() {
    const select = document.getElementById('report-classroom');
    if (!select) return;
    // ถ้าเป็นครูที่ปรึกษาไม่ต้องโหลด
    if (currentViewRole === 'teacher') {
        select.innerHTML = '<option value="">-- ไม่มีให้เลือก --</option>';
        return;
    }
    let query = db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level').order('room_number');

    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', currentUser.id)
            .single();
        if (gh) query = query.eq('grade_level', gh.grade_level);
    }
    const { data: classrooms } = await query;
    select.innerHTML = '<option value="">-- เลือกห้อง --</option>';
    (classrooms || []).forEach(c => {
        select.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
    });
}

window.loadOverviewByClassroom = async function () {
    const classroomId = overviewClassroomTom ? overviewClassroomTom.getValue() : document.getElementById('overview-classroom-select')?.value;
    if (!classroomId) {
        Swal.fire('กรุณาเลือกห้องเรียน', 'เลือกห้องเรียนที่ต้องการดูภาพรวมก่อน', 'warning');
        return;
    }

    const tbody = document.getElementById('tb-overview-admin');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูล...</td></tr>';

    try {
        // ดึงข้อมูลห้องเรียนเพื่อใช้ room
        const { data: classroom } = await db.from('core_classrooms')
            .select('grade_level, room_number')
            .eq('id', classroomId)
            .single();
        const roomLabel = classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';

        const { data: enrolls, error: enrollError } = await db.from('student_enrollments')
            .select('student_number, student_id, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('classroom_id', classroomId)
            .order('student_number');

        if (enrollError) throw enrollError;
        if (!enrolls || enrolls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่มีนักเรียนในห้องนี้</td></tr>';
            renderDashboard(0, 0, 0, 0);
            return;
        }

        const studentIds = enrolls.map(e => e.student_id);
        const { data: visits, error: visitError } = await db.from('module_home_visits')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        if (visitError) throw visitError;

        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        // ✅ สร้างลิสต์นักเรียนสำหรับ Overview
        window.overviewCompleteList = [];
        window.overviewIncompleteList = [];
        window.overviewNotVisitedList = [];

        let totalStudents = enrolls.length;
        let completedStudents = 0;
        let incompleteStudents = 0;
        let notVisitedStudents = 0;

        // สร้างแถวตารางและลิสต์
        const rowsHtml = enrolls.map(enroll => {
            const s = enroll.core_students;
            const visit = visitMap[s.id] || null;
            const isVisited = visit && visit.visit_status === 'เยี่ยมแล้ว';

            const studentItem = {
                id: s.student_id_card || '-',
                name: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                student_uuid: s.id,
                room: roomLabel
            };

            if (isVisited) {
                const comp = getCompletenessStatus(visit);
                if (comp.complete) {
                    completedStudents++;
                    window.overviewCompleteList.push(studentItem);
                } else {
                    incompleteStudents++;
                    window.overviewIncompleteList.push(studentItem);
                }
            } else {
                notVisitedStudents++;
                window.overviewNotVisitedList.push(studentItem);
            }

            const completeness = getCompletenessStatus(visit);
            let completeBadge = '';
            if (!isVisited) {
                completeBadge = '<span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-hourglass-half mr-1"></i> รอการเยี่ยม</span>';
            } else if (completeness.complete) {
                completeBadge = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-check-double mr-1"></i> ครบ</span>';
            } else {
                completeBadge = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> ยังไม่ครบ</span>';
            }

            const statusHtml = isVisited
                ? '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase">เยี่ยมแล้ว</span>'
                : '<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase">ยังไม่เยี่ยม</span>';

            let actionHtml = '';
            if (isVisited) {
                actionHtml = `
                    <div class="flex justify-center gap-2 flex-wrap">
                        <button onclick="editHomeVisit('${s.id}')" class="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded border border-sky-200 transition" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
                        <button onclick="printPDF('${visit.id}')" class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition" title="พิมพ์ PDF"><i class="fas fa-print"></i></button>
                        ${visit.pdf_url ? `<button onclick="viewExistingPDF('${visit.pdf_url}')" class="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition" title="ดู PDF"><i class="fas fa-file-pdf"></i></button>` : ''}
                        ${!completeness.complete ? `<button onclick="showMissingFields('${s.id}')" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 text-xs font-bold transition"><i class="fas fa-list mr-1"></i> รายการที่ขาด</button>` : ''}
                    </div>
                `;
            } else {
                actionHtml = `<button onclick="editHomeVisit('${s.id}')" class="text-rose-600 hover:bg-rose-50 px-3 py-1 rounded border border-rose-200 text-xs font-bold transition"><i class="fas fa-plus mr-1"></i> บันทึกข้อมูล</button>`;
            }

            return `<tr class="hover:bg-slate-50">
                <td class="p-3 text-center font-bold">${enroll.student_number || '-'}</td>
                <td class="p-3 font-mono text-slate-500">${s.student_id_card || '-'}</td>
                <td class="p-3 font-bold text-slate-700">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
                <td class="p-3 text-center">${statusHtml}</td>
                <td class="p-3 text-center">${completeBadge}</td>
                <td class="p-3 text-center">${actionHtml}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rowsHtml;
        renderDashboard(totalStudents, completedStudents, incompleteStudents, notVisitedStudents);

    } catch (err) {
        console.error('loadOverviewByClassroom error:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        renderDashboard(0, 0, 0, 0);
    }
};

window.closeOverviewModal = function () {
    const modal = document.getElementById('overview-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
};

async function updateOverviewAdvisorName() {
    const container = document.getElementById('overview-advisor-name');
    if (!container) return;

    if (currentViewRole === 'teacher') {
        const { data: classrooms } = await db.from('core_classrooms')
            .select('grade_level, room_number')
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`)
            .limit(1);

        if (classrooms && classrooms.length > 0) {
            const c = classrooms[0];
            container.innerHTML = `<i class="fas fa-chalkboard-user mr-1"></i> ครูที่ปรึกษา: ${currentUser.first_name} ${currentUser.last_name} (ม.${c.grade_level}/${c.room_number})`;
        } else {
            container.innerHTML = `<i class="fas fa-chalkboard-user mr-1"></i> ครูที่ปรึกษา: ${currentUser.first_name} ${currentUser.last_name}`;
        }
    } else {
        container.innerHTML = `<i class="fas fa-users-viewfinder mr-1"></i> แสดงข้อมูลตามห้องที่เลือก`;
    }
}

window.switchOverviewTab = async function (tab) {
    const tabs = ['overview', 'report'];
    tabs.forEach(t => {
        const isMatch = (t === tab);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = isMatch
                ? "px-4 py-2 rounded-lg font-bold text-sm bg-white text-sky-700 shadow-sm transition"
                : "px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:text-slate-700 transition";
        }
        const btnMobile = document.getElementById(`tab-btn-${t}-mobile`);
        if (btnMobile) {
            btnMobile.className = isMatch
                ? "flex-1 py-2 rounded-lg font-bold text-xs bg-white text-sky-700 shadow-sm transition"
                : "flex-1 py-2 rounded-lg font-bold text-xs text-slate-500 hover:text-slate-700 transition";
        }
        const content = document.getElementById(`tab-content-${t}`);
        if (content) {
            if (isMatch) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
    });

    if (typeof hideReportStudentList === 'function') hideReportStudentList();

    if (tab === 'overview') {
        const overviewTitle = document.querySelector('#overview-modal .modal-title') ||
            document.querySelector('#overview-modal h2');
        if (overviewTitle && currentViewRole === 'teacher') {
            const teacherName = `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`;
            overviewTitle.innerHTML = `<i class="fas fa-chart-line mr-2 text-indigo-600"></i>ภาพรวมข้อมูลเยี่ยมบ้าน (ครูที่ปรึกษา: ${teacherName})`;
        } else if (overviewTitle && currentViewRole !== 'teacher') {
            overviewTitle.innerHTML = `<i class="fas fa-chart-line mr-2 text-indigo-600"></i>ภาพรวมข้อมูลเยี่ยมบ้าน (ผู้ดูแลระบบ)`;
        }

        if (currentViewRole === 'teacher') {
            document.getElementById('admin-overview-container')?.classList.add('hidden');
            document.getElementById('teacher-overview-container')?.classList.remove('hidden');
            await loadTeacherOverview();
        } else {
            document.getElementById('teacher-overview-container')?.classList.add('hidden');
            document.getElementById('admin-overview-container')?.classList.remove('hidden');
            const tbody = document.getElementById('tb-overview-admin');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">กรุณาเลือกห้องเรียนและกดปุ่ม "แสดงข้อมูล"</td></tr>';
            }
            // ✅ เคลียร์การ์ด
            renderDashboard(0, 0, 0, 0);
            await loadClassroomsForOverview();
        }
    } else if (tab === 'report') {
        const scopeSelect = document.getElementById('report-scope');
        const gradeContainer = document.getElementById('grade-select-container');
        if (scopeSelect && !scopeSelect.value) {
            scopeSelect.value = currentViewRole === 'teacher' ? 'myclass' : 'all';
            if (gradeContainer) gradeContainer.classList.add('hidden');
        }
        // await loadReport();
        await window.loadReport();
    }
};

async function loadTeacherOverview() {
    const tbody = document.getElementById('tb-overview-teacher');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูลนักเรียน...</td></tr>';

    try {
        const { data: classrooms, error: classError } = await db.from('core_classrooms')
            .select('id')
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);

        if (classError) throw classError;

        if (!classrooms || classrooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่พบห้องเรียนที่คุณเป็นที่ปรึกษา</td></tr>';
            renderDashboard(0, 0, 0, 0);
            return;
        }

        const classIds = classrooms.map(c => c.id);

        const { data: enrolls, error: enrollError } = await db.from('student_enrollments')
            .select(`
                student_number,
                student_id,
                core_students (
                    id,
                    student_id_card,
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .in('classroom_id', classIds)
            .order('student_number');

        if (enrollError) throw enrollError;

        if (!enrolls || enrolls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่มีนักเรียนในระบบ</td></tr>';
            renderDashboard(0, 0, 0, 0);
            return;
        }

        const studentIds = enrolls.map(e => e.student_id);

        const { data: visits, error: visitError } = await db.from('module_home_visits')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);

        if (visitError) throw visitError;

        const visitMap = {};
        (visits || []).forEach(v => { visitMap[v.student_id] = v; });

        tbody.innerHTML = enrolls.map(enroll => {
            const s = enroll.core_students;
            const visit = visitMap[s.id] || null;
            const isVisited = visit && visit.visit_status === 'เยี่ยมแล้ว';

            const completeness = getCompletenessStatus(visit);
            const completeBadge = !isVisited ?
                '<span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-hourglass-half mr-1"></i> รอการเยี่ยม</span>' :
                (completeness.complete ?
                    '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-check-double mr-1"></i> ครบ</span>' :
                    '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> ยังไม่ครบ</span>');

            const statusHtml = isVisited ?
                '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase">เยี่ยมแล้ว</span>' :
                '<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase">ยังไม่เยี่ยม</span>';

            let actionHtml = '';
            if (isVisited) {
                actionHtml = `
                    <div class="flex justify-center gap-2 flex-wrap">
                        <button onclick="editHomeVisit('${s.id}')" class="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded border border-sky-200 transition" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
                        <button onclick="printPDF('${visit.id}')" class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition" title="พิมพ์ PDF"><i class="fas fa-print"></i></button>
                        ${visit.pdf_url ? `<button onclick="viewExistingPDF('${visit.pdf_url}')" class="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition" title="ดู PDF"><i class="fas fa-file-pdf"></i></button>` : ''}
                        ${!completeness.complete ? `<button onclick="showMissingFields('${s.id}')" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 text-xs font-bold transition"><i class="fas fa-list mr-1"></i> รายการที่ขาด</button>` : ''}
                    </div>`;
            } else {
                actionHtml = `<button onclick="editHomeVisit('${s.id}')" class="text-rose-600 hover:bg-rose-50 px-3 py-1 rounded border border-rose-200 text-xs font-bold transition"><i class="fas fa-plus mr-1"></i> บันทึกข้อมูล</button>`;
            }

            return `<tr class="hover:bg-slate-50">
                <td class="p-3 text-center font-bold">${enroll.student_number || '-'}</td>
                <td class="p-3 font-mono text-slate-500">${s.student_id_card || '-'}</td>
                <td class="p-3 font-bold text-slate-700">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
                <td class="p-3 text-center">${statusHtml}</td>
                <td class="p-3 text-center">${completeBadge}</td>
                <td class="p-3 text-center">${actionHtml}</td>
            </tr>`;
        }).join('');

        // ✅ อัปเดต Dashboard สำหรับครู
        let totalStudents = enrolls.length;
        let completedStudents = 0;
        let incompleteStudents = 0;
        let notVisitedStudents = 0;
        for (const e of enrolls) {
            const v = visitMap[e.student_id];
            if (v && v.visit_status === 'เยี่ยมแล้ว') {
                const comp = getCompletenessStatus(v);
                if (comp.complete) completedStudents++;
                else incompleteStudents++;
            } else {
                notVisitedStudents++;
            }
        }
        renderDashboard(totalStudents, completedStudents, incompleteStudents, notVisitedStudents);

    } catch (err) {
        console.error('loadTeacherOverview error:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        renderDashboard(0, 0, 0, 0);
    }
}

async function loadAdminOverview() {
    const tbody = document.getElementById('tb-overview-admin');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูลนักเรียน...</td></tr>';

    try {
        let roomQuery = db.from('core_classrooms').select('id, grade_level, room_number')
            .eq('academic_year', currentYear).eq('semester', currentTerm).order('grade_level').order('room_number');

        if (currentViewRole === 'head_grade') {
            const { data: gh } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).single();
            if (gh) roomQuery = roomQuery.eq('grade_level', gh.grade_level);
        }

        const { data: classrooms } = await roomQuery;
        if (!classrooms || classrooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่พบข้อมูลห้องเรียน</td></tr>';
            return;
        }

        const classIds = classrooms.map(c => c.id);
        const roomMap = {};
        classrooms.forEach(c => { roomMap[c.id] = `ม.${c.grade_level}/${c.room_number}`; });

        const { data: students } = await db.from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name, classroom_id')
            .in('classroom_id', classIds)
            .order('classroom_id');

        if (!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่มีนักเรียนในระบบ</td></tr>';
            return;
        }

        const { data: visits } = await db.from('module_home_visits')
            .select('*')
            .eq('academic_year', currentYear).eq('semester', currentTerm)
            .in('classroom_id', classIds);

        const visitMap = {};
        (visits || []).forEach(v => visitMap[v.student_id] = v);

        tbody.innerHTML = students.map(s => {
            const v = visitMap[s.id];
            const isVisited = v && v.visit_status === 'เยี่ยมแล้ว';
            const completeness = getCompletenessStatus(v);
            const completeBadge = completeness.complete
                ? `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-check-double mr-1"></i> ครบ</span>`
                : `<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> ยังไม่ครบ</span>`;

            let actionHtml = '';
            if (isVisited) {
                actionHtml = `
                    <div class="flex justify-center gap-2 flex-wrap">
                        <button onclick="editHomeVisit('${s.id}')" class="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded border border-sky-200 transition" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
                        <button onclick="printPDF('${v.id}')" class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition" title="พิมพ์ PDF"><i class="fas fa-print"></i></button>
                        <button onclick="viewExistingPDF('${v.pdf_url}')" class="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition" title="ดู PDF"><i class="fas fa-file-pdf"></i></button>
                        ${!completeness.complete ? `<button onclick="showMissingFields('${s.id}')" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 text-xs font-bold transition"><i class="fas fa-list"></i></button>` : ''}
                    </div>`;
            } else {
                actionHtml = `<button onclick="editHomeVisit('${s.id}')" class="text-rose-600 hover:bg-rose-50 px-3 py-1 rounded border border-rose-200 text-xs font-bold transition"><i class="fas fa-plus mr-1"></i> บันทึกข้อมูล</button>`;
            }

            return `<tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-bold text-slate-700">${roomMap[s.classroom_id] || '-'}</td>
                <td class="p-3 font-mono text-slate-500">${s.student_id_card || '-'}</td>
                <td class="p-3 font-bold text-slate-700">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
                <td class="p-3 text-center">${completeBadge}</td>
                <td class="p-3 text-center">${actionHtml}</td>
             </tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

window.editHomeVisit = async function (studentId) {
    // 1. ปิด Modal
    const modal = document.getElementById('overview-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }

    try {
        let classroomId = null;

        // 2. ลองหาจาก student_enrollments (โดยไม่กรองปี/เทอม ก่อน)
        let { data: enroll, error } = await db.from('student_enrollments')
            .select('classroom_id')
            .eq('student_id', studentId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching enrollment:', error);
        }

        if (enroll) {
            classroomId = enroll.classroom_id;
        } else {
            // 3. ถ้าไม่พบ ลองหา classroom_id จาก module_home_visits
            const { data: visit } = await db.from('module_home_visits')
                .select('classroom_id')
                .eq('student_id', studentId)
                .order('visit_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (visit) {
                classroomId = visit.classroom_id;
            }
        }

        if (!classroomId) {
            Swal.fire('ไม่พบข้อมูล', 'ไม่พบห้องเรียนของนักเรียนคนนี้ กรุณาตรวจสอบข้อมูล', 'warning');
            return;
        }

        // 4. เลือกห้องเรียนผ่าน tsClassroom
        const tsClass = window.tsClassroom || tsClassroom;
        if (tsClass && typeof tsClass.setValue === 'function') {
            tsClass.setValue(classroomId);
        } else {
            const select = document.getElementById('classroom-select');
            if (select) select.value = classroomId;
        }

        // 5. เรียก onClassroomSelected เพื่อโหลดนักเรียน
        if (typeof onClassroomSelected === 'function') {
            await onClassroomSelected(classroomId);
        } else {
            // ถ้าไม่มี onClassroomSelected ให้โหลดนักเรียนเอง
            const { data: students } = await db.from('student_enrollments')
                .select('student_id, core_students(id, student_id_card, prefix, first_name, last_name)')
                .eq('classroom_id', classroomId)
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .order('student_number');

            const ts = window.studentTomSelect || studentTomSelect;
            if (ts && students) {
                ts.clearOptions();
                ts.addOptions(
                    students.map(s => ({
                        value: s.core_students.id,
                        text: `${s.core_students.student_id_card || ''} - ${s.core_students.prefix || ''}${s.core_students.first_name} ${s.core_students.last_name}`
                    }))
                );
            }
        }

        // 6. เลือกนักเรียน
        const trySetStudent = (retries = 0) => {
            const ts = window.studentTomSelect || studentTomSelect;
            if (ts && typeof ts.setValue === 'function') {
                if (ts.options && Object.keys(ts.options).length === 0) {
                    if (retries < 10) {
                        setTimeout(() => trySetStudent(retries + 1), 300);
                        return;
                    }
                }
                ts.setValue(studentId);
                switchTab('form');
                goToStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (retries < 15) {
                setTimeout(() => trySetStudent(retries + 1), 300);
            } else {
                console.warn('studentTomSelect not ready after retries');
                Swal.fire('ไม่สามารถเลือกนักเรียนได้', 'กรุณาลองเลือกห้องเรียนก่อนแล้วจึงเลือกนักเรียนจากรายการ', 'warning');
                switchTab('form');
                goToStep(1);
            }
        };
        trySetStudent();

    } catch (err) {
        console.error('editHomeVisit error:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
    }
};

window.viewExistingPDF = function (pdfUrl) {
    if (!pdfUrl || pdfUrl === 'null' || pdfUrl === 'undefined') {
        Swal.fire('ไม่พบไฟล์', 'ยังไม่มีการสร้างไฟล์ PDF สำหรับนักเรียนคนนี้ กรุณากดพิมพ์ PDF เพื่อให้ระบบสร้างไฟล์ก่อนครับ', 'info');
        return;
    }
    window.open(pdfUrl, '_blank');
};

// ==========================================
// 7. COMPLETENESS & MISSING FIELDS
// ==========================================

function getCompletenessStatus(visit) {
    if (!visit) return { complete: false, missingFields: ['ยังไม่มีข้อมูลการเยี่ยมบ้าน'] };

    const missing = [];

    // Step 1
    if (!visit.visit_date) missing.push('วันที่เยี่ยมบ้าน');
    if (!visit.visit_times) missing.push('ครั้งที่');
    if (!visit.student_nickname?.trim()) missing.push('ชื่อเล่น');
    if (!visit.student_phone?.trim()) missing.push('เบอร์โทรศัพท์นักเรียน');
    if (!visit.student_line?.trim()) missing.push('ID Line');

    if (!visit.father_name?.trim()) missing.push('ชื่อบิดา');
    if (!visit.father_job?.trim()) missing.push('อาชีพบิดา');
    if (!visit.father_phone?.trim()) missing.push('เบอร์โทรบิดา');

    if (!visit.mother_name?.trim()) missing.push('ชื่อมารดา');
    if (!visit.mother_job?.trim()) missing.push('อาชีพมารดา');
    if (!visit.mother_phone?.trim()) missing.push('เบอร์โทรมารดา');

    if (!visit.guardian_name?.trim()) missing.push('ชื่อผู้ปกครอง');
    if (!visit.guardian_job?.trim()) missing.push('อาชีพผู้ปกครอง');
    if (!visit.guardian_phone?.trim()) missing.push('เบอร์โทรผู้ปกครอง');
    if (!visit.guardian_relation?.trim()) missing.push('ความสัมพันธ์ผู้ปกครอง');
    if (!visit.living_with?.trim()) missing.push('อาศัยอยู่กับ');
    if (!visit.parents_status?.trim()) missing.push('สถานภาพบิดามารดา');

    // Step 2
    if (!visit.house_number?.trim()) missing.push('บ้านเลขที่');
    if (!visit.village_no?.trim()) missing.push('หมู่ที่');
    if (!visit.sub_district?.trim()) missing.push('ตำบล');
    if (!visit.district?.trim()) missing.push('อำเภอ');
    if (!visit.province?.trim()) missing.push('จังหวัด');
    if (!visit.zipcode?.trim()) missing.push('รหัสไปรษณีย์');
    if (!visit.latitude || !visit.longitude) missing.push('พิกัด GPS');
    if (!visit.house_type?.trim()) missing.push('ประเภทบ้าน');
    if (visit.travel_hour === undefined || visit.travel_minute === undefined) missing.push('เวลาเดินทาง');
    if (!visit.travel_method?.trim()) missing.push('วิธีการเดินทาง');
    if (!visit.env_house_status?.trim()) missing.push('สภาพตัวบ้าน');
    if (!visit.env_clean_status?.trim()) missing.push('ความสะอาด');
    if (!visit.env_location_status?.trim()) missing.push('สภาพแวดล้อม');
    if (!visit.utility_electric) missing.push('ไฟฟ้า');
    if (!visit.utility_water) missing.push('น้ำอุปโภคบริโภค');
    if (!visit.utility_toilet) missing.push('ห้องสุขา');

    // Step 3
    const fm = visit.family_members || {};
    if (!fm.total) missing.push('สมาชิกในครอบครัว (รวม)');
    if (fm.male === undefined || fm.male === null) missing.push('สมาชิกชาย');
    if (fm.female === undefined || fm.female === null) missing.push('สมาชิกหญิง');
    if (!fm.sib_same_total && fm.sib_same_total !== 0) missing.push('พี่น้องร่วมบิดามารดา (รวม)');
    if (fm.sib_same_male === undefined) missing.push('พี่น้องร่วมฯ ชาย');
    if (fm.sib_same_female === undefined) missing.push('พี่น้องร่วมฯ หญิง');
    if (!fm.sib_diff_total && fm.sib_diff_total !== 0) missing.push('พี่น้องต่างบิดามารดา (รวม)');
    if (fm.sib_diff_male === undefined) missing.push('พี่น้องต่างฯ ชาย');
    if (fm.sib_diff_female === undefined) missing.push('พี่น้องต่างฯ หญิง');

    const eco = visit.economic_data || {};
    if (!eco.income && eco.income !== 0) missing.push('รายได้ครอบครัวต่อเดือน');
    if (!eco.allowance_source?.trim()) missing.push('นักเรียนได้รับค่าใช้จ่ายจาก');
    if (!eco.student_job_name?.trim()) missing.push('อาชีพนักเรียน (ถ้ามี)');
    if (!eco.student_job_income && eco.student_job_income !== 0) missing.push('รายได้นักเรียนต่อวัน');
    if (!eco.money_to_school && eco.money_to_school !== 0) missing.push('เงินไปโรงเรียนต่อวัน');

    const fRel = visit.family_relations || {};
    if (!fRel.status?.trim()) missing.push('ความสัมพันธ์ในครอบครัว');
    if (!fRel.time_together && fRel.time_together !== 0) missing.push('เวลาอยู่ร่วมกันต่อวัน');

    if (!visit.special_help_details?.trim()) missing.push('กรณีต้องการการช่วยเหลือพิเศษ');
    if (!visit.responsibilities_details?.trim()) missing.push('ภาระงานรับผิดชอบ');
    if (!visit.hobbies_details?.trim()) missing.push('กิจกรรมยามว่าง');
    if (!visit.leave_with_whom_details?.trim()) missing.push('ฝากเด็กอยู่กับใคร');

    // Step 4
    if (!visit.photo_student) missing.push('ภาพถ่ายตัวนักเรียน');
    if (!visit.photo_outside) missing.push('ภาพถ่ายสภาพบ้านภายนอก');
    if (!visit.photo_inside) missing.push('ภาพถ่ายสภาพบ้านภายใน');
    if (!visit.photo_teacher) missing.push('ภาพครูกำลังเยี่ยมบ้าน');

    // Step 5
    if (!visit.guardian_concerns?.trim()) missing.push('ข้อห่วงใยของผู้ปกครอง');
    if (!visit.guardian_requests?.trim()) missing.push('สิ่งที่ผู้ปกครองต้องการให้ช่วยเหลือ');
    if (!visit.past_welfare?.trim()) missing.push('ความช่วยเหลือที่เคยได้รับ');
    if (!visit.informant_type?.trim()) missing.push('ผู้ให้ข้อมูล');

    return {
        complete: missing.length === 0,
        missingFields: missing
    };
}

window.showMissingFields = async function (studentId) {
    const { data: visit } = await db.from('module_home_visits')
        .select('*')
        .eq('student_id', studentId)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .maybeSingle();

    const completeness = getCompletenessStatus(visit);
    if (completeness.complete) {
        Swal.fire('ข้อมูลครบถ้วน', 'นักเรียนคนนี้กรอกข้อมูลครบทุกส่วน (ยกเว้นหัวข้อความเสี่ยง)', 'success');
        return;
    }

    let missingHtml = '<ul class="text-left max-h-80 overflow-y-auto list-disc pl-5 space-y-1">';
    completeness.missingFields.forEach(field => {
        missingHtml += `<li class="text-slate-700">${field}</li>`;
    });
    missingHtml += '</ul>';

    Swal.fire({
        title: 'รายการข้อมูลที่ยังไม่ครบ',
        html: missingHtml,
        icon: 'warning',
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#3085d6'
    });
};

// ==========================================
// 8. TOMSELECT & OTHER INIT
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
// 9. SWITCH TAB
// ==========================================
function switchTab(tabId) {
    // ถ้าอยู่ที่ report และกด report ซ้ำ ไม่ต้องโหลดใหม่
    if (tabId === 'report' && currentTab === 'report') {
        return;
    }
    currentTab = tabId;

    document.getElementById('tab-form').classList.toggle('hidden', tabId !== 'form');
    document.getElementById('tab-data').classList.toggle('hidden', tabId !== 'data');
    document.getElementById('tab-report').classList.toggle('hidden', tabId !== 'report');

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

        const scopeSelect = document.getElementById('report-scope');
        const gradeContainer = document.getElementById('grade-select-container');
        const classroomContainer = document.getElementById('classroom-select-container');

        // ลบกราฟเก่าเมื่อเปลี่ยนแท็บ
        destroyCharts();

        if (currentViewRole === 'teacher') {
            // ซ่อน classroom container และลบ option 'classroom'
            if (classroomContainer) classroomContainer.classList.add('hidden');
            for (let i = 0; i < scopeSelect.options.length; i++) {
                if (scopeSelect.options[i].value === 'classroom') {
                    scopeSelect.remove(i);
                    break;
                }
            }
            if (scopeSelect.value === 'classroom') scopeSelect.value = 'myclass';
        } else {
            // Admin: แสดง classroom container เฉพาะเมื่อเลือก 'classroom'
            toggleClassroomSelect(scopeSelect.value);
            // ตรวจสอบและเพิ่ม option 'classroom' ถ้ายังไม่มี
            let hasClassroom = false;
            for (let i = 0; i < scopeSelect.options.length; i++) {
                if (scopeSelect.options[i].value === 'classroom') {
                    hasClassroom = true;
                    break;
                }
            }
            if (!hasClassroom) {
                const opt = document.createElement('option');
                opt.value = 'classroom';
                opt.textContent = 'ระบุห้องเรียน';
                scopeSelect.appendChild(opt);
            }
            // โหลดรายการห้องเรียน
            loadReportClassrooms();
        }

        // เรียก loadReport
        // loadReport();
        window.loadReport();
    }
}

// ==========================================
// 10. IMAGE HELPERS
// ==========================================

// (previewSelectedImage, clearSelectedImage, syncCamToMain อยู่ใน homevisit_upload.js แล้ว)

// ==========================================
// 11. INITIALIZATION
// ==========================================

$(document).ready(async () => {
    try {
        initPlugins();
        await checkAuth();
        await loadModuleSettings();
        initAllTomSelects();
        initDirtyTracking();

        const reportScope = document.getElementById('report-scope');
        if (reportScope) {
            reportScope.addEventListener('change', function () {
                const gradeSel = document.getElementById('grade-select-container');
                if (this.value === 'grade') gradeSel.classList.remove('hidden');
                else gradeSel.classList.add('hidden');
                toggleClassroomSelect(this.value);
                window.loadReport(); // loadReport() จะ destroyCharts() เองในบรรทัดแรก
            });
        }

        // event listener สำหรับการเปลี่ยนระดับชั้น
        const reportGrade = document.getElementById('report-grade');
        if (reportGrade) {
            reportGrade.addEventListener('change', function () {
                window.loadReport(); // loadReport() จะ destroyCharts() เองในบรรทัดแรก
            });
        }

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

// Fallback ในกรณี window.loadReport หาย
if (typeof window.loadReport !== 'function') {
    console.warn('window.loadReport not defined, creating fallback');
    window.loadReport = async function () {
        Swal.fire('ข้อผิดพลาด', 'ฟังก์ชันรายงานไม่พร้อมใช้งาน กรุณารีเฟรชหน้า', 'error');
    };
}
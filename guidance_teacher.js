// ==========================================
// guidance_teacher.js — ระบบครูผู้สอนแนะแนว
// - ลบส่วนของคะแนน/ผลการเรียนออกทั้งหมด
// - สถานะ 5 แบบ: ปกติ, พักการเรียน, ขาดนาน, ลาออก, ย้ายสถานศึกษา
// - เพิ่มสีพื้นหลังตามสถานะการเข้าเรียน (ป่วย/ลา/ขาด)
// - เพิ่มสีพื้นหลังคุณลักษณะ (มผ = แดงเข้ม)
// - แสดง badge ชื่อห้องก่อนวันที่เริ่มสอน
// - ใช้ RPC save_guidance_all (บันทึกใน 1 คำสั่ง)
// ==========================================

let currentUserProfile = null;
let globalSystemSettings = null;
let globalGuidanceSettings = null;
let myClasses = [];
let globalSelectedClass = null;
let globalStudents = [];
let globalAttendance = [];
let globalAttributes = [];
let weekDatesArray = [];
let globalIsSystemOpen = true;

let classTomSelect = null;

let dataCache = {
    students: {},
    attendance: {},
    attributes: {}
};
let cacheTimestamp = {};
const CACHE_EXPIRY = 5 * 60 * 1000;

let currentUserRole = 'teacher';
let isAdminMode = false;
let currentUserId = null;
let isModuleAdmin = false;

const ATTR_COLS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5'];
const STUDENT_STATUS_OPTIONS = ['ปกติ', 'พักการเรียน', 'ขาดนาน', 'ลาออก', 'ย้ายสถานศึกษา'];

// ==========================================
// LOGOUT
// ==========================================
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

// ==========================================
// INIT
// ==========================================
window.onload = async () => {
    const result = await window.checkSessionAndRole('guidance_teacher');
    if (!result) return;

    const { user, personnel, role, isAdmin, isTeacher } = result;
    currentUserProfile = personnel;
    currentUserId = user.id;
    currentUserRole = role;
    isAdminMode = isAdmin;

    isModuleAdmin = await window.hasModuleAccess(role, 'guidance', user.id);

    const { data: isGui } = await db.from('guidance_teachers').select('*').eq('teacher_id', user.id).single();
    if (!isGui) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณยังไม่ได้รับสิทธิ์เป็นครูแนะแนว', 'error');
        window.location.replace('index.html');
        return;
    }

    const isTeacherMode = localStorage.getItem('activeMode') === 'teacher';
    if (window.isAdminUser(role, isAdminMode) && !isTeacherMode) {
        if (isModuleAdmin) {
            window.location.replace('guidance_admin.html');
            return;
        }
    }

    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('dashboardMain').classList.remove('hidden');
    document.getElementById('dashboardMain').classList.add('flex');

    if (window.isAdminUser(role, isAdminMode) || isModuleAdmin) {
        const btnAdmin = document.getElementById('btnAdminMode');
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        window.updateToggleModeUI(role, isAdminMode, 'btnAdminMode');
    }

    await window.logUserAction('เข้าสู่ระบบแนะแนว (ครู)', 'guidance');

    await initDashboard(user.id, personnel);
};

async function initDashboard(userId, profile) {
    currentUserProfile = profile;
    document.getElementById('userNameDisplay').innerText = `สวัสดี, ครู${profile.first_name}`;

    const { data: sysInfo } = await db.from('core_school_info').select('*').single();
    globalSystemSettings = sysInfo || {};
    const currentSemester = sysInfo?.current_semester || '1', currentYear = sysInfo?.current_academic_year || '2569';

    const { data: guiInfo } = await db.from('guidance_settings').select('*').single();
    globalGuidanceSettings = guiInfo || {};

    document.getElementById('infoSubject').innerText = `วิชา: ${guiInfo?.subject_name || 'กิจกรรมแนะแนว'}`;
    document.getElementById('infoTerm').innerText = `ภาคเรียน: ${currentSemester}/${currentYear}`;
    document.getElementById('infoDirector').innerText = `ผู้อำนวยการ: ${sysInfo?.director_name || '-'}`;

    const { data: mod } = await db.from('core_system_modules').select('is_active').eq('module_id', 'guidance').single();
    globalIsSystemOpen = mod ? mod.is_active : true;

    if (globalIsSystemOpen) {
        document.getElementById('systemClosedBanner')?.classList.add('hidden');
    } else {
        document.getElementById('systemClosedBanner')?.classList.remove('hidden');
        const saveBtn = document.getElementById('btnSaveAll');
        saveBtn.className = 'bg-gray-500 text-white font-bold py-2.5 px-8 rounded-xl shadow-md text-base w-full md:w-auto flex items-center justify-center gap-2 transition-all';
        saveBtn.innerHTML = '<i class="fa-solid fa-lock"></i> ระบบปิดการบันทึก';
    }

    const { data: mapped } = await db.from('guidance_classes')
        .select('classroom_id, start_date, core_classrooms(id, grade_level, room_number, semester, academic_year)')
        .eq('teacher_id', userId);

    if (mapped) {
        myClasses = mapped
            .filter(m => m.core_classrooms.semester === currentSemester && m.core_classrooms.academic_year === currentYear)
            .map(m => ({
                id: m.classroom_id,
                grade: m.core_classrooms.grade_level,
                room: m.core_classrooms.room_number,
                start_date: m.start_date
            }))
            .sort((a, b) => a.grade - b.grade || a.room - b.room);
    }

    const selectEl = document.getElementById('classSelect');
    selectEl.innerHTML = '<option value="">-- กรุณาเลือกห้อง --</option>';
    myClasses.forEach(cls => {
        selectEl.innerHTML += `<option value="${cls.id}">ม.${cls.grade}/${cls.room}</option>`;
    });

    if (classTomSelect) classTomSelect.destroy();
    classTomSelect = new TomSelect(selectEl, {
        create: false,
        sortField: { field: 'text', direction: 'asc' },
        placeholder: '-- กรุณาเลือกห้อง --',
        onChange: function (value) {
            if (value) {
                const cacheKey = value;
                delete dataCache.students[cacheKey];
                delete dataCache.attendance[cacheKey];
                delete dataCache.attributes[cacheKey];
                delete cacheTimestamp[cacheKey];
                loadAllData(value);
            }
        },
        render: {
            option: function (data, escape) {
                return `<div class="px-2 py-1 font-bold text-brand-700">${escape(data.text)}</div>`;
            },
            item: function (data, escape) {
                return `<div class="font-bold text-brand-700">${escape(data.text)}</div>`;
            }
        }
    });

    selectEl.classList.add('hidden');
    await updateClassStatusBadges();
}

// ========== switchTab ==========
function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const target = document.getElementById(tabId);
    target.classList.add('active');
}

async function updateClassStatusBadges() {
    const container = document.getElementById('classStatusContainer');
    if (!myClasses.length) return;

    const badgePromises = myClasses.map(async (cls) => {
        const { data: enrolls, count: n_std } = await db.from('student_enrollments')
            .select('student_id', { count: 'exact' })
            .eq('classroom_id', cls.id);
        if (!n_std || n_std === 0) return { cls, isComplete: false, isEmpty: true };

        const stdIds = enrolls.map(e => e.student_id);
        const [attRes, attrRes] = await Promise.all([
            db.from('guidance_attendance').select('*', { count: 'exact', head: true }).eq('classroom_id', cls.id),
            db.from('guidance_attributes').select('*', { count: 'exact', head: true }).in('student_id', stdIds)
        ]);

        const isComplete = (attRes.count >= n_std * 20) && (attrRes.count >= n_std * 12);
        return { cls, isComplete, isEmpty: false };
    });

    const results = await Promise.all(badgePromises);

    container.innerHTML = results.map(res => {
        let badgeClass = res.isEmpty
            ? 'bg-gray-100 text-gray-500'
            : (res.isComplete ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600');
        let icon = res.isEmpty ? '⚪' : (res.isComplete ? '🟢' : '🔴');
        return `<button onclick="classTomSelect.setValue('${res.cls.id}')" class="status-badge px-3 py-1.5 rounded-lg text-sm font-bold border ${badgeClass}">${icon} ม.${res.cls.grade}/${res.cls.room}</button>`;
    }).join('');
}

// ========== loadAllData ==========
async function loadAllData(classId = null) {
    if (!classId) classId = classTomSelect.getValue();
    if (!classId) return;

    const now = Date.now();
    const cacheKey = classId;

    if (dataCache.students[cacheKey] && cacheTimestamp[cacheKey] && (now - cacheTimestamp[cacheKey] < CACHE_EXPIRY)) {
        console.log('📦 ใช้ข้อมูลจาก Cache (', Math.round((now - cacheTimestamp[cacheKey]) / 1000), 'วินาทีที่แล้ว)');
        globalStudents = dataCache.students[cacheKey];
        globalAttendance = dataCache.attendance[cacheKey] || [];
        globalAttributes = dataCache.attributes[cacheKey] || [];
        renderAttendanceTab();
        renderAttributesTab();
        return;
    }

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    globalSelectedClass = myClasses.find(c => c.id === classId);
    const startDateDisplay = document.getElementById('startDateDisplay');

// ✅ ชื่อห้อง - ขนาดใหญ่ เด่นชัด
const classBadge = `<span class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-xl shadow-md">
    <i class="fa-solid fa-chalkboard text-lg"></i> ม.${globalSelectedClass.grade}/${globalSelectedClass.room}
</span>`;

// ✅ วันที่เริ่มสอน - อยู่บรรทัดใหม่ ขนาดเล็กกว่า
if (globalSelectedClass.start_date) {
    const dateLine = `<span class="inline-flex items-center gap-1.5 text-[12px] font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
        📅 วันที่เริ่มสอน: <b>${new Date(globalSelectedClass.start_date).toLocaleDateString('th-TH', { dateStyle: 'full' })}</b>
    </span>`;
    startDateDisplay.innerHTML = classBadge + dateLine;
    startDateDisplay.className = 'hidden md:flex flex-col items-end gap-1.5';
    const startObj = new Date(globalSelectedClass.start_date);
    weekDatesArray = Array.from({ length: 20 }, (_, i) => {
        let d = new Date(startObj);
        d.setDate(startObj.getDate() + (i * 7));
        return d;
    });
} else {
    const dateLine = `<span class="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-200">
        ⚠️ ยังไม่ได้กำหนดวันที่เริ่มสอน
    </span>`;
    startDateDisplay.innerHTML = classBadge + dateLine;
    startDateDisplay.className = 'hidden md:flex flex-col items-end gap-1.5';
    weekDatesArray = Array.from({ length: 20 }, () => null);
}

    try {
        const { data: stds } = await db.from('student_enrollments')
            .select(`id, student_number, status, student_id, core_students(student_id_card, prefix, first_name, last_name)`)
            .eq('classroom_id', classId)
            .order('student_number');

        globalStudents = stds ? stds.map(s => ({
            id: s.student_id,
            enrollment_id: s.id,
            student_number: s.student_number,
            student_id_card: s.core_students.student_id_card,
            prefix: s.core_students.prefix,
            first_name: s.core_students.first_name,
            last_name: s.core_students.last_name,
            student_status: s.status || 'ปกติ'
        })) : [];

        const stdIds = globalStudents.map(s => s.id);
        const { data: att } = await db.from('guidance_attendance').select('*').eq('classroom_id', classId);
        globalAttendance = att || [];

        if (stdIds.length > 0) {
            const { data: attrs } = await db.from('guidance_attributes').select('*').in('student_id', stdIds);
            globalAttributes = attrs || [];
        } else {
            globalAttributes = [];
        }

        dataCache.students[cacheKey] = globalStudents;
        dataCache.attendance[cacheKey] = globalAttendance;
        dataCache.attributes[cacheKey] = globalAttributes;
        cacheTimestamp[cacheKey] = now;

        renderAttendanceTab();
        renderAttributesTab();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', `โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    }
}

// ========== ฟังก์ชันจัดการ UI ==========
function selectColor(el) { 
    if (!el) return;
    el.setAttribute('data-val', el.value);
    applyAttendanceColor(el);
}

// ✅ onchange handler สำหรับ attributes
function selectAttrColor(el) {
    if (!el) return;
    el.setAttribute('data-val', el.value);
    applyAttributeColor(el);
}

// ✅ ฟังก์ชัน: ใส่สีพื้นหลังตามสถานะการเข้าเรียน
function applyAttendanceColor(el) {
    if (!el) return;
    const v = el.value;
    el.style.fontWeight = '600';
    el.style.transition = 'background-color 0.15s, color 0.15s';

    if (v === 'ป่วย') {
        el.style.backgroundColor = '#ffedd5';
        el.style.color = '#c2410c';
        el.style.borderColor = '#fdba74';
    } else if (v === 'ลา') {
        el.style.backgroundColor = '#fef9c3';
        el.style.color = '#a16207';
        el.style.borderColor = '#fde047';
    } else if (v === 'ขาด') {
        el.style.backgroundColor = '#fee2e2';
        el.style.color = '#b91c1c';
        el.style.borderColor = '#fca5a5';
    } else {
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.borderColor = '';
    }
}

// ✅ ฟังก์ชัน: ใส่สีพื้นหลังให้ dropdown คุณลักษณะ (มผ = แดงเข้ม)
function applyAttributeColor(el) {
    if (!el) return;
    const v = el.value;
    el.style.fontWeight = '600';
    el.style.transition = 'background-color 0.15s, color 0.15s';

    if (v === '0') {
        // 🔴 มผ - พื้นหลังสีแดงเข้ม
        el.style.backgroundColor = '#fecaca';
        el.style.color = '#991b1b';
        el.style.borderColor = '#f87171';
    } else {
        // ⚪ ผ - ไม่มีสี
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.borderColor = '';
    }
}

function calcAttTotal(stdId) {
    let total = 0;
    for (let w = 1; w <= 20; w++) {
        const s = document.getElementById(`att_${stdId}_w${w}`);
        if (s && s.value === 'มา') total++;
    }
    document.getElementById(`att_total_${stdId}`).innerText = total;
    calcAttr(stdId, total);
}

function calcAttr(stdId, attTotal) {
    let pass = true;
    ATTR_COLS.forEach(c => {
        const el = document.getElementById(`at_${stdId}_${c}`);
        if (el) { 
            // ✅ ใช้ applyAttributeColor แทน selectColor
            el.setAttribute('data-val', el.value);
            applyAttributeColor(el);
            if (el.value === "0") pass = false; 
        }
    });
    const p1 = document.getElementById(`at_sum1_${stdId}`);
    const p2 = document.getElementById(`at_sum2_${stdId}`);
    const p3 = document.getElementById(`at_sum3_${stdId}`);
    if (p1) p1.innerHTML = pass ? '<span class="text-blue-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if (p2) p2.innerHTML = attTotal >= 16 ? '<span class="text-indigo-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if (p3) p3.innerHTML = (pass && attTotal >= 16) ? '<span class="text-emerald-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
}

function renderAttendanceTab() {
    const tbody = document.getElementById('tb-attendance');
    const tr1 = document.getElementById('att-header-row-1');
    const tr2 = document.getElementById('att-header-row-2');
    if (!globalStudents.length) { tbody.innerHTML = '<tr><td colspan="24" class="p-8 text-center text-gray-400">ยังไม่มีนักเรียนในห้องนี้ (ติดต่อแอดมิน)</td></tr>'; return; }

    document.querySelectorAll('.dynamic-th').forEach(el => el.remove());
    const targetTh = tr1.children[2];
    weekDatesArray.forEach((d, i) => {
        const th1 = document.createElement('th'); th1.className = 'dynamic-th w-16 px-1'; th1.innerText = `ส.${i + 1}`; tr1.insertBefore(th1, targetTh);
        const th2 = document.createElement('th'); th2.className = 'dynamic-th p-1 text-[10px]'; th2.innerText = d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-รอตั้งค่า-'; tr2.appendChild(th2);
    });
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const myAtt = globalAttendance.filter(a => a.student_id === std.id);
        const drops = Array.from({ length: 20 }, (_, i) => {
            const w = i + 1, v = myAtt.find(a => a.week_number === w)?.status || 'มา';
            return `<td class="p-1"><select id="att_${std.id}_w${w}" class="tiny-select w-full" data-val="${v}" onchange="selectColor(this); calcAttTotal('${std.id}')" ${lockAttr}><option value="มา" ${v === 'มา' ? 'selected' : ''}>มา</option><option value="ป่วย" ${v === 'ป่วย' ? 'selected' : ''}>ป่วย</option><option value="ลา" ${v === 'ลา' ? 'selected' : ''}>ลา</option><option value="ขาด" ${v === 'ขาด' ? 'selected' : ''}>ขาด</option></select></td>`;
        }).join('');

        const curStatus = std.student_status || 'ปกติ';
        const statusOptions = STUDENT_STATUS_OPTIONS.map(opt =>
            `<option value="${opt}" ${curStatus === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        return `<tr>
            <td class="col-no">${std.student_number}</td>
            <td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>
            ${drops}
            <td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="att_total_${std.id}">0</td>
            <td class="p-1 bg-gray-50 border-l-2 border-gray-300 text-center">
                <select id="status_${std.id}" class="tiny-select w-full" ${lockAttr}>
                    ${statusOptions}
                </select>
            </td>
        </tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));

    // ✅ ใส่สีพื้นหลังให้กับ dropdown ทุกตัวหลัง render
    document.querySelectorAll('#tb-attendance .tiny-select').forEach(applyAttendanceColor);
}

function renderAttributesTab() {
    const tbody = document.getElementById('tb-attributes'); if (!globalStudents.length) return;
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const myAt = globalAttributes.filter(a => a.student_id === std.id);
        const drops = ATTR_COLS.map(c => {
            const v = myAt.find(a => a.attribute_name === c)?.score ?? 1;
            return `<td class="p-1"><select id="at_${std.id}_${c}" class="tiny-select w-full" data-val="${v}" onchange="selectAttrColor(this); calcAttTotal('${std.id}')" ${lockAttr}><option value="1" ${v === 1 ? 'selected' : ''}>ผ</option><option value="0" ${v === 0 ? 'selected' : ''}>มผ</option></select></td>`;
        }).join('');
        return `<tr>
            <td class="col-no">${std.student_number}</td>
            <td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>
            ${drops}
            <td class="bg-blue-50/50 border-l-2 border-gray-300 text-center" id="at_sum1_${std.id}"></td>
            <td class="bg-indigo-50/50 border-l border-gray-300 text-center" id="at_sum2_${std.id}"></td>
            <td class="bg-emerald-50/50 border-l-2 border-emerald-300 text-center" id="at_sum3_${std.id}"></td>
        </tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));

    // ✅ ใส่สีพื้นหลังให้กับ dropdown ทุกตัวหลัง render
    document.querySelectorAll('#tb-attributes .tiny-select').forEach(applyAttributeColor);
}

// ========== saveAllData - ใช้ RPC save_guidance_all ==========
async function saveAllData() {
    if (!globalIsSystemOpen) return Swal.fire('ผิดพลาด', 'ระบบถูกปิดการบันทึกแล้ว', 'error');
    if (!globalSelectedClass) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียน', 'warning');

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const startTime = performance.now();
    try {
        const classId = globalSelectedClass.id;
        const attendancePayload = [];
        const attributesPayload = [];
        const statusesPayload = [];

        // ✅ 1. เตรียมข้อมูลใน memory
        globalStudents.forEach(std => {
            for (let w = 1; w <= 20; w++) {
                const s = document.getElementById(`att_${std.id}_w${w}`);
                if (s && weekDatesArray[w - 1]) {
                    attendancePayload.push({
                        student_id: std.id,
                        week_number: w,
                        status: s.value,
                        check_date: weekDatesArray[w - 1].toISOString().split('T')[0]
                    });
                }
            }
            ATTR_COLS.forEach(c => {
                const s = document.getElementById(`at_${std.id}_${c}`);
                if (s) attributesPayload.push({
                    student_id: std.id,
                    attribute_name: c,
                    score: parseInt(s.value)
                });
            });

            const statusEl = document.getElementById(`status_${std.id}`);
            if (statusEl && std.enrollment_id) {
                statusesPayload.push({
                    enrollment_id: std.enrollment_id,
                    status: statusEl.value
                });
            }
        });

        // ✅ 2. ยิง RPC เดียว!
        const { data: result, error } = await db.rpc('save_guidance_all', {
            p_classroom_id: classId,
            p_attendance: attendancePayload,
            p_attributes: attributesPayload,
            p_statuses: statusesPayload
        });

        if (error) throw error;
        if (result && result.success === false) throw new Error(result.error);

        // ✅ 3. อัปเดต memory
        globalStudents = globalStudents.map(std => {
            const statusEl = document.getElementById(`status_${std.id}`);
            return { ...std, student_status: statusEl ? statusEl.value : std.student_status };
        });

        attendancePayload.forEach(row => {
            const existing = globalAttendance.find(a => a.student_id === row.student_id && a.week_number === row.week_number);
            if (existing) {
                existing.status = row.status;
                existing.check_date = row.check_date;
            } else {
                globalAttendance.push({ ...row, classroom_id: classId });
            }
        });

        attributesPayload.forEach(row => {
            const existing = globalAttributes.find(a => a.student_id === row.student_id && a.attribute_name === row.attribute_name);
            if (existing) {
                existing.score = row.score;
            } else {
                globalAttributes.push(row);
            }
        });

        // ✅ 4. อัปเดต Cache
        const cacheKey = classId;
        dataCache.students[cacheKey] = globalStudents;
        dataCache.attendance[cacheKey] = globalAttendance;
        dataCache.attributes[cacheKey] = globalAttributes;
        cacheTimestamp[cacheKey] = Date.now();

        // ✅ 5. Log (fire-and-forget)
        window.logUserAction(`บันทึกข้อมูลห้อง ${classId}`, 'guidance').catch(console.error);

        // ✅ 6. อัปเดต badge แบบ local
        updateClassStatusBadgesLight();

        const elapsed = Math.round(performance.now() - startTime);
        console.log(`⚡ บันทึกเสร็จใน ${elapsed}ms`, result);

        Swal.fire({
            icon: 'success',
            title: 'บันทึกเรียบร้อย!',
            text: `ใช้เวลา ${elapsed}ms`,
            timer: 1500,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Save error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันใหม่: อัปเดต badge แบบ local (ไม่ query DB)
function updateClassStatusBadgesLight() {
    if (!globalSelectedClass) return;
    const studentCount = globalStudents.length;

    let attCount = 0, attrCount = 0;
    globalStudents.forEach(std => {
        for (let w = 1; w <= 20; w++) {
            const s = document.getElementById(`att_${std.id}_w${w}`);
            if (s) attCount++;
        }
        ATTR_COLS.forEach(c => {
            const s = document.getElementById(`at_${std.id}_${c}`);
            if (s) attrCount++;
        });
    });

    const isComplete = (attCount >= studentCount * 20) && (attrCount >= studentCount * 12);
    const targetName = `ม.${globalSelectedClass.grade}/${globalSelectedClass.room}`;

    document.querySelectorAll('#classStatusContainer .status-badge').forEach(badge => {
        if (badge.innerText.includes(targetName)) {
            const icon = isComplete ? '🟢' : '🔴';
            const bgClass = isComplete ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600';
            badge.className = `status-badge px-3 py-1.5 rounded-lg text-sm font-bold border ${bgClass}`;
            badge.innerHTML = `${icon} ${targetName}`;
        }
    });
}

// ========== ฟังก์ชันช่วยเหลือสำหรับพิมพ์ PDF ==========
function formatThaiDateShort(dateInput) {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    if (isNaN(d)) return '-';
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatThaiDateFullStr(dateString) {
    if (!dateString) return '......../......../........';
    const d = new Date(dateString);
    if (isNaN(d)) return '......../......../........';
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ==========================================
// Print PDF v7 - พิมพ์ด้วย HTML
// ==========================================
async function printPDF_v7() {
    if (!globalSelectedClass) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนพิมพ์', 'warning');
    }
    Swal.fire({
        title: 'กำลังเตรียมหน้ากระดาษ...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const teacherFullName = currentUserProfile
        ? `${currentUserProfile.prefix || ''}${currentUserProfile.first_name} ${currentUserProfile.last_name}`.trim()
        : '-';

    const t_term = globalSystemSettings?.current_semester || '-';
    const t_year = globalSystemSettings?.current_academic_year || '-';
    const t_director = globalSystemSettings?.director_name || '(................................................)';
    const t_deputy = globalSystemSettings?.deputy_academic || '(................................................)';
    const t_head_eval = globalGuidanceSettings?.head_evaluation || '(................................................)';
    const t_head_std = globalGuidanceSettings?.head_student_dev || '(................................................)';
    const t_head_gui = globalGuidanceSettings?.head_guidance || '(................................................)';
    const t_teacher = teacherFullName;
    const approvalDateStr = formatThaiDateFullStr(globalGuidanceSettings?.approval_date);

    let subjectCode = "ก22901";
    const grade = globalSelectedClass.grade;
    if (grade === 1) subjectCode = t_term === "2" ? "ก21902" : "ก21901";
    else if (grade === 2) subjectCode = t_term === "2" ? "ก22902" : "ก22901";
    else if (grade === 3) subjectCode = t_term === "2" ? "ก23902" : "ก23901";
    else if (grade === 4) subjectCode = t_term === "2" ? "ก31903" : "ก31901";
    else if (grade === 5) subjectCode = t_term === "2" ? "ก32903" : "ก32901";
    else if (grade === 6) subjectCode = t_term === "2" ? "ก33903" : "ก33901";

    let totalStd = globalStudents.length;
    let passCount = 0, failCount = 0, absentCount = 0, suspendCount = 0, leaveCount = 0, transferCount = 0;

    let students40 = [...globalStudents];
    while (students40.length < 40) students40.push({ id: null, student_number: '', student_id_card: '', prefix: '', first_name: '', last_name: '', student_status: '' });

    const evaluatedStudents = students40.map(std => {
        if (!std.id) return { ...std, attTotal: '', isAttPass: false, isAttrPass: false, finalRes: '' };

        const st = std.student_status || 'ปกติ';
        if (st === 'ขาดนาน') absentCount++;
        else if (st === 'พักการเรียน') suspendCount++;
        else if (st === 'ลาออก') leaveCount++;
        else if (st === 'ย้ายสถานศึกษา') transferCount++;

        let attTotal = 0;
        const myAtt = globalAttendance.filter(a => a.student_id === std.id);
        for (let w = 1; w <= 20; w++) {
            const rec = myAtt.find(a => a.week_number === w);
            if (rec && rec.status === 'มา') attTotal++;
        }
        const isAttPass = attTotal >= 16;

        let allPassed = true;
        const myAttrs = globalAttributes.filter(a => a.student_id === std.id);
        ATTR_COLS.forEach(col => {
            const val = myAttrs.find(a => a.attribute_name === col)?.score ?? 1;
            if (val === 0) allPassed = false;
        });

        const finalRes = (isAttPass && allPassed) ? 'ผ' : 'มผ';
        const isSpecialStatus = ['ขาดนาน', 'พักการเรียน', 'ลาออก', 'ย้ายสถานศึกษา'].includes(st);
        if (!isSpecialStatus) {
            if (finalRes === 'ผ') passCount++;
            else failCount++;
        }
        return { ...std, attTotal, isAttPass, isAttrPass: allPassed, finalRes };
    });

    const classNameFull = `ชั้นมัธยมศึกษาปีที่ ${grade}/${globalSelectedClass.room}`;

    const page1 = `
    <div class="page-break" style="padding: 10mm 15mm; position:relative; height: 297mm; box-sizing:border-box; line-height: 1.4;">
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://i.ibb.co/94wLv5v/WRK-PNG-200px.png" style="height: 100px; margin: 0 auto 5px auto; display: block;">
            <div style="font-size: 16pt; font-weight: bold; margin-bottom: 10px;">แบบประเมินผลกิจกรรมพัฒนาผู้เรียน ( ปพ.5 )</div>
            <div style="font-size: 14pt; margin-bottom: 5px;">
                <span style="display:inline-block; width:300px; text-align:right;">รายวิชา กิจกรรมแนะแนว</span>
                <span style="display:inline-block; width:300px; text-align:left; margin-left:15px;">รหัสวิชา ${subjectCode}</span>
            </div>
            <div style="font-size: 14pt; margin-bottom: 5px;">โรงเรียนวัดไร่ขิงวิทยา อำเภอสามพราน อำเภอนครปฐม</div>
            <div style="font-size: 14pt; margin-bottom: 5px;">
                <span>${classNameFull}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 
                <span>ภาคเรียนที่ ${t_term}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 
                <span>ปีการศึกษา ${t_year}</span>
            </div>
            <div style="font-size: 14pt; margin-bottom: 15px;">จำนวน 20 ชั่วโมง / ภาคเรียน / ปีการศึกษา</div>
        </div>
        <div style="font-size: 14pt; margin-bottom: 10px; width: 95%; margin-left: auto; margin-right: auto; text-align: left; padding-left: 2.5%;">ครูผู้จัดกิจกรรมแนะแนว ${t_teacher}</div>
        <div style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 5px;">สรุปผลการจัดการเรียนรู้กิจกรรมแนะแนว</div>
        <table class="print-table" style="font-size: 12pt; margin-bottom: 15px; width: 95%; margin-left: auto; margin-right: auto;">
            <tr>
                <th rowspan="2" style="width: 18%; font-weight: normal;">จำนวนนักเรียนทั้งหมด</th>
                <th colspan="2" style="font-weight: normal;">สรุปผลการเรียนรู้</th>
                <th colspan="4" style="font-weight: normal;">หมายเหตุ</th>
            </tr>
            <tr>
                <th style="font-weight: normal;">ผ่าน</th>
                <th style="font-weight: normal;">ไม่ผ่าน</th>
                <th style="font-weight: normal;">ขาดนาน</th>
                <th style="font-weight: normal;">พักการเรียน</th>
                <th style="font-weight: normal;">ลาออก</th>
                <th style="font-weight: normal;">ย้ายสถานศึกษา</th>
            </tr>
            <tr style="height: 35px;">
                <td style="text-align: center; font-size: 14pt">${totalStd}</td>
                <td style="text-align: center; font-size: 14pt">${passCount}</td>
                <td style="text-align: center; font-size: 14pt">${failCount}</td>
                <td style="text-align: center; font-size: 14pt">${absentCount === 0 ? '-' : absentCount}</td>
                <td style="text-align: center; font-size: 14pt">${suspendCount === 0 ? '-' : suspendCount}</td>
                <td style="text-align: center; font-size: 14pt">${leaveCount === 0 ? '-' : leaveCount}</td>
                <td style="text-align: center; font-size: 14pt">${transferCount === 0 ? '-' : transferCount}</td>
            </tr>
        </table>
        <div style="text-align: center; font-size: 14pt; margin-bottom: 5px;">การอนุมัติผลการจัดการเรียนรู้กิจกรรมแนะแนว</div>
        <div style="border: 1px solid #000; padding: 15px 20px 30px 20px; font-size: 12pt; position: relative; width: 95%; margin: 0 auto; box-sizing: border-box;">
            <div style="position: absolute; top: 10px; left: 10px;">การอนุมัติผลการเรียน</div>
            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 40px;">
                <div style="width: 45%;">ลงชื่อ....................................................<br><div style="margin-top: 5px;">(${t_teacher})</div><div style="margin-top: 5px;">ผู้จัดกิจกรรมแนะแนว</div></div>
                <div style="width: 45%;">ลงชื่อ....................................................<br><div style="margin-top: 5px;">(${t_head_gui})</div><div style="margin-top: 5px;">หัวหน้างานแนะแนว</div></div>
            </div>
            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 30px;">
                <div style="width: 45%;">ลงชื่อ....................................................<br><div style="margin-top: 5px;">(${t_head_std})</div><div style="margin-top: 5px;">หัวหน้ากิจกรรมพัฒนาผู้เรียน</div></div>
                <div style="width: 45%;">ลงชื่อ....................................................<br><div style="margin-top: 5px;">(${t_head_eval})</div><div style="margin-top: 5px;">หัวหน้างานวัดผลและเทียบโอนความรู้</div></div>
            </div>
            <div style="margin-top: 20px; text-align: left;">เรียนเสนอเพื่อโปรดพิจารณา</div>
            <div style="text-align: center; margin-top: 5px;">
                ลงชื่อ..............................................................<br><div style="margin-top: 5px;">(${t_deputy})</div><div style="margin-top: 5px;">รองผู้อำนวยการกลุ่มบริหารวิชาการ</div>
                <div style="margin-top: 10px; display: flex; justify-content: center; gap: 40px; align-items: center;">
                    <span><span style="border: 1px solid #000; border-radius: 50%; display: inline-block; width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"></span> อนุมัติ</span>
                    <span><span style="border: 1px solid #000; border-radius: 50%; display: inline-block; width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"></span> ไม่อนุมัติ</span>
                </div>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                ลงชื่อ..............................................................<br><div style="margin-top: 5px;">(${t_director})</div><div style="margin-top: 5px;">ผู้อำนวยการโรงเรียนวัดไร่ขิงวิทยา</div><div style="margin-top: 5px;">${approvalDateStr}</div>
            </div>
        </div>
    </div>`;

    const page2 = `
    <div class="page-break" style="padding: 50px 40px; text-align:center; height:297mm; box-sizing:border-box;">
        <h2 style="font-size:18pt; font-weight:bold; margin-bottom:5px;">มาตรฐานกิจกรรมแนะแนว</h2>
        <h2 style="font-size:18pt; font-weight:bold; margin-bottom:40px;">โรงเรียนวัดไร่ขิงวิทยา</h2>
        <div style="position:relative; width: 100%; max-width: 650px; margin: 0 auto 50px auto; height: 350px;">
            <div style="position:absolute; top:0px; left:50%; transform:translateX(-50%); background-color:#ffc000; border-radius:30px; padding:10px 20px; font-size:13pt; width:420px; border: 1px solid #eab308;">1.กลุ่มกิจกรรมรู้จัก เข้าใจ เห็นคุณค่าในตนเองและผู้อื่น</div>
            <svg style="position:absolute; top:48px; left:50%; transform:translateX(-50%); width:30px; height:50px;" viewBox="0 0 40 50" preserveAspectRatio="none"><polygon points="20,0 40,25 30,25 30,50 10,50 10,25 0,25" fill="#ffc000" /></svg>
            <div style="position:absolute; top:110px; left:0px; background-color:#ff66cc; border-radius:30px; padding:15px 10px; font-size:12pt; width:170px; text-align:center; border: 1px solid #d946af;">4.กลุ่มกิจกรรมการ<br>ปรับตัวและดำรงชีวิต<br>อย่างมีความสุข</div>
            <svg style="position:absolute; top:140px; left:180px; width:45px; height:40px;" viewBox="0 0 50 40" preserveAspectRatio="none"><polygon points="50,10 25,10 25,0 0,20 25,40 25,30 50,30" fill="#ff66cc" /></svg>
            <div style="position:absolute; top:100px; left:50%; transform:translateX(-50%); width:120px; height:120px; background-color:#0070c0; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16pt; font-weight:bold; text-align:center; line-height:1.2; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">กิจกรรม<br>แนะแนว</div>
            <svg style="position:absolute; top:140px; right:180px; width:45px; height:40px;" viewBox="0 0 50 40" preserveAspectRatio="none"><polygon points="0,10 25,10 25,0 50,20 25,40 25,30 0,30" fill="#00b0f0" /></svg>
            <div style="position:absolute; top:110px; right:0px; background-color:#00b0f0; border-radius:30px; padding:15px 10px; font-size:12pt; width:170px; text-align:center; border: 1px solid #0284c7;">2.กลุ่มกิจกรรมการ<br>แสวงหาและใช้ข้อมูล<br>สารสนเทศ</div>
            <svg style="position:absolute; top:225px; left:50%; transform:translateX(-50%); width:30px; height:50px;" viewBox="0 0 40 50" preserveAspectRatio="none"><polygon points="10,0 30,0 30,25 40,25 20,50 0,25 10,25" fill="#92d050" /></svg>
            <div style="position:absolute; top:280px; left:50%; transform:translateX(-50%); background-color:#92d050; border-radius:30px; padding:12px 20px; font-size:13pt; width:420px; text-align:center; border: 1px solid #65a30d;">3.กลุ่มกิจกรรมการตัดสินใจและแก้ปัญหาได้อย่าง<br>เหมาะสม</div>
        </div>
        <div style="text-align:left; width:100%; max-width:680px; margin:0 auto; font-size:14pt; line-height:1.6;">
            <div style="font-weight:bold; text-align:center; margin-bottom:10px; font-size:15pt;">คุณลักษณะอันพึงประสงค์ของกิจกรรมแนะแนว</div>
            <div style="margin-left: 20px; margin-bottom: 25px; font-size: 12pt">
                <div>1. รักและเห็นคุณค่าในตนเองและผู้อื่น</div><div>2. รู้จักแสวงหาและใช้ข้อมูลสารสนเทศ</div><div>3. สามารถพัฒนาบุคลิกภาพและปรับตัวอยู่ในสังคมได้อย่างมีความสุข</div><div>4. มีเจตคติที่ดีต่ออาชีพสุจริต</div><div>5. มีค่านิยมที่ดี มีวินัย มีคุณธรรมจริยธรรม</div><div>6. มีจิตสำนึกรับผิดชอบต่อตนเอง ครอบครัว สังคม และประเทศไทย</div>
            </div>
            <div style="font-weight:bold; text-align:center; margin-bottom:10px; font-size:15pt;">คำชี้แจงในการทำประเมินผล กิจกรรมแนะแนว</div>
            <div style="margin-left: 20px; font-size: 12pt">
                <div style="display:flex; margin-bottom:8px;"><div style="min-width:25px;">1.</div><div>การนับเวลาเรียน เวลาเรียนเต็ม ภาคเรียนละ 20 ชั่วโมง นักเรียนเข้าเรียนให้เว้นว่างไว้ ถ้าขาดเรียนใส่ (ข) ด้วยปากกามึกสีแดง</div></div>
                <div style="display:flex; margin-bottom:8px;"><div style="min-width:25px;">2.</div><div>นักเรียนที่เวลาเรียนครบ 80% ใส่ตัวเลขด้วยปากกามึกสีน้ำเงิน ส่วนนักเรียนที่เวลาเรียนไม่ครบ80% ให้เขียนเวลาเรียนเป็นตัวเลขด้วยปากกามึกสีแดง</div></div>
                <div style="display:flex; margin-bottom:8px;"><div style="min-width:25px;">3.</div><div>ประเมินคุณลักษณะอันพึงประสงค์ของกิจกรรมแนะแนว ตามมาตรฐานทำเครื่องหมาย / ในช่อง ผ หรือ มผ</div></div>
                <div style="display:flex;"><div style="min-width:25px;">4.</div><div>สรุปประเมินผล เขียน ผ หรือ มผ</div></div>
            </div>
        </div>
    </div>`;

    let thDates = '';
    for (let i = 0; i < 20; i++) {
        let dStr = weekDatesArray[i] ? formatThaiDateShort(weekDatesArray[i]) : '-';
        thDates += `<th class="col-center"><div class="v-text" style="height: 70px; font-size: 8pt;">${dStr}</div></th>`;
    }

    let trRows3 = evaluatedStudents.map((std, i) => {
        if (std.id) {
            const sNum = std.student_number || (i + 1);
            const sCode = std.student_id_card || '';
            let cols = '';
            const myAtt = globalAttendance.filter(a => a.student_id === std.id);
            for (let w = 1; w <= 20; w++) {
                const rec = myAtt.find(a => a.week_number === w);
                const mark = (rec && rec.status !== 'มา') ? (rec.status === 'ขาด' ? 'ข' : (rec.status === 'ลา' ? 'ล' : (rec.status === 'ป่วย' ? 'ป' : '/'))) : '/';
                cols += `<td class="col-center" style="font-size:6.5pt; padding:1px 1px;">${mark}</td>`;
            }
            return `<tr>
                <td class="col-center" style="font-size:6.5pt; padding:1px 1px;">${sNum}</td>
                <td class="col-center" style="font-size:6.5pt; padding:1px 1px;">${sCode}</td>
                <td class="col-left" style="font-size:6.5pt; padding:1px 2px; white-space:nowrap; overflow:hidden; max-width:120px; text-overflow:ellipsis;">${std.prefix}${std.first_name} ${std.last_name}</td>
                ${cols}
                <td class="col-center" style="font-size:6.5pt; padding:1px 1px;">${std.attTotal}</td>
                <td class="col-center" style="font-size:6.5pt; padding:1px 1px; font-weight:bold;">${std.finalRes}</td>
            </tr>`;
        } else {
            return `<tr style="height:16px;">
                <td class="col-center" style="font-size:6.5pt; padding:1px 1px;">${i + 1}</td>
                <td></td><td></td>
                ${'<td class="col-center" style="padding:1px 1px;"></td>'.repeat(20)}
                <td></td><td></td>
            </tr>`;
        }
    }).join('');

    const page3 = `
    <div class="page-break page-break-attendance" style="position:relative; box-sizing:border-box;">
        <h3 style="text-align:center; font-weight:bold; font-size:12pt; margin-bottom:8px; margin-top:0;">
            บันทึกเวลาเรียนกิจกรรมแนะแนว ${classNameFull} ภาคเรียนที่ ${t_term} ปีการศึกษา ${t_year}
        </h3>
        <table class="print-table print-table-small" style="width:100%; table-layout:fixed; border-collapse:collapse;">
            <thead>
                <tr>
                    <th rowspan="3" class="col-no" style="width:20px;"><div class="v-text" style="height:45px; font-size:6pt;">เลขที่</div></th>
                    <th rowspan="3" class="col-id" style="width:45px;"><div class="v-text" style="height:60px; font-size:6pt;">เลขประจำตัว</div></th>
                    <th rowspan="3" class="col-name" style="width:160px; text-align:center !important; font-size:7pt;">ชื่อ-สกุล</th>
                    <th colspan="20" style="font-size:7pt; padding:1px 2px;">วัน เดือน ปี ที่จัดการเรียนการสอน</th>
                    <th rowspan="3" class="col-total" style="width:35px;"><div class="v-text" style="height:60px; font-size:6pt;">รวมเวลาเรียน</div></th>
                    <th rowspan="3" class="col-result" style="width:35px;"><div class="v-text" style="height:70px; font-size:6pt;">สรุปผลการประเมิน</div></th>
                </tr>
                <tr>${thDates}</tr>
                <tr style="font-size:6.5pt;">
                    ${Array.from({ length: 20 }, (_, i) => `<th class="col-center" style="width:16px; padding:1px 1px;">${i + 1}</th>`).join('')}
                </tr>
            </thead>
            <tbody>${trRows3}</tbody>
        </table>
    </div>`;

    const attrHeaders = [
        "1. รู้จัก เข้าใจ<br>ความต้องการและแก้ไขปัญหาในเวลาต่างๆ", "2. เข้าใจและยอมรับ<br>บุคลิกภาพของตนเองและผู้อื่น", "3. รู้ เข้าใจ<br>ลักษณะความแตกต่างของแต่ละบุคคล", "4. รักและเห็นคุณค่าของผู้อื่น",
        "1. สามารถค้นหา วิเคราะห์<br>ต้องการข้อมูลสารสนเทศที่ถูกต้อง", "2. สามารถนำข่าวสารข้อมูลมาใช้ในชีวิตประจำวัน<br>และสร้างงานเป็นอาชีพ",
        "1. สามารถตัดสินใจ<br>แก้ปัญหาของตนเองและอยู่ร่วมกับสังคมได้อย่างมีความสุข",
        "1. เข้าใจและปรับตัวให้เข้ากับสังคมและบุคลิก", "2. สามารถสร้างความคิด<br>ความเข้าใจในชีวิตและปรับตัวเข้ากับสังคมใหม่ได้", "3. สามารถจัดกิจกรรมอารมณ์<br>และแสดงออกได้อย่างเหมาะสมเป็นประโยชน์ต่อตนเองและผู้อื่น", "4. ปฏิบัติตนเป็นแบบอย่างที่ดี<br>เป็นประโยชน์ต่อสังคมและประเทศชาติ", "5. สามารถทำงานร่วมกับผู้อื่นได้อย่างมี<br>ประสิทธิภาพและอยู่ร่วมกับผู้อื่นอย่างมีความสุข"
    ];
    let thAttrs = attrHeaders.map(text => `<th class="col-center" style="padding:2px;"><div class="v-text" style="height: 250px; font-size: 7.5pt; line-height: 1.1;">${text}</div></th>`).join('');

    let trRows4 = evaluatedStudents.map((std, i) => {
        if (std.id) {
            const sNum = std.student_number || (i + 1);
            const sCode = std.student_id_card || '';
            const myAttrs = globalAttributes.filter(a => a.student_id === std.id);
            let cols = ATTR_COLS.map(col => {
                const val = myAttrs.find(a => a.attribute_name === col)?.score ?? 1;
                return `<td class="col-center">${val === 1 ? 'ผ' : 'มผ'}</td>`;
            }).join('');
            return `<tr><td class="col-center">${sNum}</td><td class="col-center">${sCode}</td><td class="col-left" style="white-space:nowrap; overflow:hidden; max-width:160px;">${std.prefix}${std.first_name} ${std.last_name}</td>${cols}<td class="col-center" style="font-weight:bold;">${std.finalRes}</td></tr>`;
        } else {
            return `<tr style="height:19px;"><td class="col-center">${i + 1}</td><td></td><td></td>${'<td class="col-center"></td>'.repeat(12)}<td></td></tr>`;
        }
    }).join('');

    const page4 = `
    <div style="padding: 20px 10px; position:relative; height: 297mm; box-sizing:border-box;">
        <h3 style="text-align:center; font-weight:bold; font-size:12pt; margin-bottom:10px;">
            บันทึกการประเมินกิจกรรมแนะแนว ${classNameFull} ภาคเรียนที่ ${t_term} ปีการศึกษา ${t_year}
        </h3>
        <table class="print-table print-table-small">
            <thead>
                <tr>
                    <th rowspan="2" style="width:25px;"><div class="v-text" style="height:50px;">เลขที่</div></th>
                    <th rowspan="2" style="width:55px;"><div class="v-text" style="height:70px;">เลขประจำตัว</div></th>
                    <th rowspan="2" style="width:160px; text-align:center !important;">ชื่อ-สกุล</th>
                    <th colspan="4">มาตรฐานที่ 1</th><th colspan="2">มาตรฐานที่ 2</th><th colspan="1">มาตรฐานที่ 3</th><th colspan="5">มาตรฐานที่ 4</th>
                    <th rowspan="2" style="width:30px;"><div class="v-text" style="height:90px; font-weight:bold; font-size:8pt;">สรุปผลการประเมิน</div></th>
                </tr>
                <tr>${thAttrs}</tr>
            </thead>
            <tbody>${trRows4}</tbody>
        </table>
    </div>`;

    const stylePrint = `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
        @page { size: A4 portrait; margin: 0; }
        * {
            font-family: 'Sarabun', 'TH Sarabun New', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
        }
        body { margin: 0; padding: 0; background: white; }
        #print-wrapper { background: white; width: 100%; height: auto; }
        .page-break {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            height: 297mm;
            min-height: 297mm;
            max-height: 297mm;
            padding: 10mm 15mm;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            background: white;
        }
        .page-break-attendance { padding: 8mm 5mm !important; }
        .page-break:last-child { page-break-after: avoid !important; break-after: avoid !important; }
        .col-center { text-align: center !important; vertical-align: middle !important; }
        .col-left { text-align: left !important; padding-left: 6px !important; vertical-align: middle !important; }
        .v-text { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; margin: 0 auto; display: block; }
        .print-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
        .print-table th, .print-table td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; }
        .print-table-small { font-size: 7pt; }
        .print-table-small th, .print-table-small td { padding: 1px 2px; font-size: 7pt; }
        .print-table-small .col-no { width: 20px; min-width: 20px; }
        .print-table-small .col-id { width: 45px; min-width: 45px; }
        .print-table-small .col-name { width: 160px; min-width: 160px; }
        .print-table-small .col-total { width: 35px; min-width: 35px; }
        .print-table-small .col-result { width: 35px; min-width: 35px; }
        @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
    </style>`;

    const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ปพ.5 แนะแนว ม.${grade}/${globalSelectedClass.room}</title>
            ${stylePrint}
        </head>
        <body>
            <div id="print-wrapper">${page1 + page2 + page3 + page4}</div>
            <script>
                window.onload = function() {
                    document.fonts.load('16px "Sarabun"')
                        .then(() => setTimeout(() => window.print(), 500))
                        .catch(() => setTimeout(() => window.print(), 500));
                };
            <\/script>
        </body>
        </html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        Swal.fire('แจ้งเตือน', 'กรุณาอนุญาตให้เปิดหน้าต่างป๊อปอัป (Pop-up) เพื่อพิมพ์', 'warning');
        return;
    }

    printWindow.document.write(printHtml);
    printWindow.document.close();

    Swal.close();
    Swal.fire({
        icon: 'info',
        title: 'กำลังเปิดหน้าต่างพิมพ์',
        text: 'กรุณารอสักครู่ ระบบจะเตรียมหน้ากระดาษและแสดงหน้าต่างพิมพ์',
        timer: 2000,
        showConfirmButton: false
    });
}

// ==========================================
// ฟังก์ชันนำเข้า-ส่งออก Excel
// ==========================================
function exportExcelAll() {
    if (!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและต้องมีนักเรียนก่อนทำการส่งออก', 'warning');
    const wb = XLSX.utils.book_new();

    const attData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...Array.from({ length: 20 }, (_, i) => `ส.${i + 1}`), 'สถานะ']];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        for (let w = 1; w <= 20; w++) {
            const el = document.getElementById(`att_${std.id}_w${w}`);
            row.push(el ? el.value : '');
        }
        const statusEl = document.getElementById(`status_${std.id}`);
        row.push(statusEl ? statusEl.value : 'ปกติ');
        attData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attData), "เวลาเรียน");

    const attrData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...ATTR_COLS]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        ATTR_COLS.forEach(c => {
            const el = document.getElementById(`at_${std.id}_${c}`);
            row.push(el ? (el.value === '1' ? 'ผ' : 'มผ') : '');
        });
        attrData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attrData), "คุณลักษณะ");

    XLSX.writeFile(wb, `ปพ5_แนะแนว_ม.${globalSelectedClass.grade}-${globalSelectedClass.room}.xlsx`);

    window.logUserAction(`ส่งออก Excel ห้อง ${globalSelectedClass.grade}/${globalSelectedClass.room}`, 'guidance');
}

async function importExcelAll(event) {
    const file = event.target.files[0]; if (!file) return;
    Swal.fire({ title: 'กำลังดึงข้อมูลจาก Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result), workbook = XLSX.read(data, { type: 'array' });

            if (workbook.Sheets["เวลาเรียน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["เวลาเรียน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if (std) {
                        for (let w = 1; w <= 20; w++) {
                            const el = document.getElementById(`att_${std.id}_w${w}`);
                            if (el && row[`ส.${w}`] !== undefined) { el.value = row[`ส.${w}`]; selectColor(el); }
                        }
                        const statusEl = document.getElementById(`status_${std.id}`);
                        if (statusEl && row['สถานะ']) statusEl.value = row['สถานะ'];
                        calcAttTotal(std.id);
                    }
                });
            }

            if (workbook.Sheets["คุณลักษณะ"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คุณลักษณะ"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if (std) {
                        ATTR_COLS.forEach(c => {
                            const el = document.getElementById(`at_${std.id}_${c}`);
                            if (el && row[c] !== undefined) { el.value = (row[c] === 'ผ' || row[c] == 1) ? '1' : '0'; selectAttrColor(el); }
                        });
                        calcAttTotal(std.id);
                    }
                });
            }

            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', text: 'ข้อมูลอยู่บนหน้าจอแล้ว กรุณากด "บันทึกข้อมูล" เพื่อเก็บลงฐานข้อมูล' });
        } catch (err) { Swal.fire('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง หรือหาชีตข้อมูลไม่พบ', 'error'); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// TOGGLE MODE
// ==========================================
async function toggleRoleView() {
    if (!window.isAdminUser(currentUserRole, isAdminMode) && !isModuleAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }
    isAdminMode = !isAdminMode;
    window.updateToggleModeUI(currentUserRole, isAdminMode, 'btnAdminMode');
    await window.logUserAction(`สลับโหมดเป็น ${isAdminMode ? 'Admin' : 'Teacher'} (แนะแนว)`, 'guidance');
    if (isAdminMode) {
        window.location.href = 'guidance_admin.html';
    } else {
        window.location.reload();
    }
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.logout = logout;
window.toggleRoleView = toggleRoleView;
window.switchTab = switchTab;
window.printPDF_v7 = printPDF_v7;
window.exportExcelAll = exportExcelAll;
window.importExcelAll = importExcelAll;
window.saveAllData = saveAllData;
window.selectColor = selectColor;
window.selectAttrColor = selectAttrColor;
window.applyAttendanceColor = applyAttendanceColor;
window.applyAttributeColor = applyAttributeColor;
window.calcAttTotal = calcAttTotal;
window.calcAttr = calcAttr;

console.log('✅ guidance_teacher.js loaded (สีสถานะ + สีคุณลักษณะ + RPC save)');
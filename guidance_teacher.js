// ==========================================
// ไฟล์ guidance_teacher.js (ระบบครูผู้สอนแนะแนว)
// ปรับปรุง: ใช้ Tom Select, แก้ calcScoreTotal, ปรับ switchTab ให้ถูกต้อง,
//           เพิ่ม UI สวยงาม, คงฟังก์ชัน printPDF_v7 ไว้เหมือนเดิม
// ==========================================

let currentUserProfile = null;
let globalSystemSettings = null;
let globalGuidanceSettings = null;
let myClasses = [];
let globalSelectedClass = null;
let globalStudents = [];
let globalAttendance = [];
let globalScores = [];
let globalAttributes = [];
let weekDatesArray = [];
let globalIsSystemOpen = true;

let classTomSelect = null;

const ATTR_COLS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5'];
const SCORE_COLS = ['ครั้งที่ 1', 'ครั้งที่ 2', 'ครั้งที่ 3', 'ครั้งที่ 4', 'ครั้งที่ 5', 'Pretest', 'Posttest'];

window.onload = async () => { await checkAuth(); };

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
        const { data: isGui } = await db.from('guidance_teachers').select('*').eq('teacher_id', session.user.id).single();
        const isTeacherMode = localStorage.getItem('activeMode') === 'teacher';

        let isGuidanceAdmin = false;
        if (profile && profile.role === 'super_admin') isGuidanceAdmin = true;
        if (profile && profile.role === 'admin') {
            const { data: modAdmin } = await db.from('core_module_admins')
                .select('module_id')
                .eq('user_id', session.user.id)
                .eq('module_id', 'guidance')
                .single();
            if (modAdmin) isGuidanceAdmin = true;
        }

        if (isGuidanceAdmin && !isTeacherMode) {
            window.location.replace('guidance_admin.html'); return;
        }

        if (!isGui) {
            await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณยังไม่ได้รับสิทธิ์เป็นครูแนะแนว', 'error');
            window.location.replace('index.html'); return;
        }

        document.getElementById('dashboardView').classList.remove('hidden');
        document.getElementById('dashboardMain').classList.remove('hidden');
        document.getElementById('dashboardMain').classList.add('flex');

        await initDashboard(session.user.id, profile);

        if (isGuidanceAdmin) {
            const btnAdmin = document.getElementById('btnAdminMode');
            if (btnAdmin) btnAdmin.classList.remove('hidden');
        }
    } else {
        window.location.replace('index.html');
    }
}

function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
        .then(async (result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('activeMode');
                await db.auth.signOut();
                window.location.replace('index.html');
            }
        });
}

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
            if (value) loadAllData(value);
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

// ========== แก้ไข switchTab ให้จัดการ hidden ถูกต้อง ==========
function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active', 'flex');
        content.classList.add('hidden');
    });
    const target = document.getElementById(tabId);
    target.classList.remove('hidden');
    target.classList.add('active', 'flex');
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

async function loadAllData(classId = null) {
    if (!classId) classId = classTomSelect.getValue();
    if (!classId) return;

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    globalSelectedClass = myClasses.find(c => c.id === classId);
    const startDateDisplay = document.getElementById('startDateDisplay');

    if (globalSelectedClass.start_date) {
        startDateDisplay.innerHTML = `📅 วันที่เริ่มสอน: <b>${new Date(globalSelectedClass.start_date).toLocaleDateString('th-TH', { dateStyle: 'full' })}</b>`;
        startDateDisplay.className = 'text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200';
        const startObj = new Date(globalSelectedClass.start_date);
        weekDatesArray = Array.from({ length: 20 }, (_, i) => {
            let d = new Date(startObj);
            d.setDate(startObj.getDate() + (i * 7));
            return d;
        });
    } else {
        startDateDisplay.innerHTML = `⚠️ ยังไม่ได้กำหนดวันที่เริ่มสอน`;
        startDateDisplay.className = 'text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200';
        weekDatesArray = Array.from({ length: 20 }, () => null);
    }

    try {
        const { data: stds } = await db.from('student_enrollments')
            .select(`id, student_number, status, student_id, core_students(student_id_card, prefix, first_name, last_name)`)
            .eq('classroom_id', classId)
            .order('student_number');

        globalStudents = stds ? stds.map(s => ({
            id: s.student_id,
            student_number: s.student_number,
            student_id_card: s.core_students.student_id_card,
            prefix: s.core_students.prefix,
            first_name: s.core_students.first_name,
            last_name: s.core_students.last_name,
            student_status: s.status
        })) : [];

        const stdIds = globalStudents.map(s => s.id);
        const { data: att } = await db.from('guidance_attendance').select('*').eq('classroom_id', classId);
        globalAttendance = att || [];

        if (stdIds.length > 0) {
            const { data: scrs } = await db.from('guidance_scores').select('*').in('student_id', stdIds);
            globalScores = scrs || [];
            const { data: attrs } = await db.from('guidance_attributes').select('*').in('student_id', stdIds);
            globalAttributes = attrs || [];
        } else {
            globalScores = [];
            globalAttributes = [];
        }

        renderAttendanceTab();
        renderScoresTab();
        renderAttributesTab();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', `โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    }
}

function selectColor(el) { if (el) el.setAttribute('data-val', el.value); }

function calcAttTotal(stdId) {
    let total = 0;
    for (let w = 1; w <= 20; w++) {
        const s = document.getElementById(`att_${stdId}_w${w}`);
        if (s && s.value === 'มา') total++;
    }
    document.getElementById(`att_total_${stdId}`).innerText = total;
    calcAttr(stdId, total);
}

// แก้ไข calcScoreTotal ให้รองรับค่าว่าง
function calcScoreTotal(stdId) {
    let total = 0;
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`sc_${stdId}_ครั้งที่ ${i}`);
        if (el && el.value.trim() !== '') {
            const num = parseFloat(el.value);
            if (!isNaN(num)) total += num;
        }
    }
    document.getElementById(`sc_total_${stdId}`).innerText = total.toFixed(2);
}

function calcAttr(stdId, attTotal) {
    let pass = true;
    ATTR_COLS.forEach(c => {
        const el = document.getElementById(`at_${stdId}_${c}`);
        if (el) {
            selectColor(el);
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
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="att_total_${std.id}">0</td><td class="p-1 bg-gray-50 border-l-2 border-gray-300 text-center font-bold text-sm">${std.student_status}</td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

function renderScoresTab() {
    const tbody = document.getElementById('tb-scores'); if (!globalStudents.length) return;
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const mySc = globalScores.filter(s => s.student_id === std.id);
        const inps = SCORE_COLS.map(c => {
            const v = mySc.find(s => s.column_name === c)?.score_value ?? '';
            return `<td><input type="number" id="sc_${std.id}_${c}" class="w-full text-center rounded-md border border-gray-200 p-1" value="${v}" oninput="calcScoreTotal('${std.id}')" ${lockAttr}></td>`;
        });
        inps.splice(5, 0, `<td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="sc_total_${std.id}">0</td>`);
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${inps.join('')}</tr>`;
    }).join('');
    globalStudents.forEach(std => calcScoreTotal(std.id));
}

function renderAttributesTab() {
    const tbody = document.getElementById('tb-attributes'); if (!globalStudents.length) return;
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const myAt = globalAttributes.filter(a => a.student_id === std.id);
        const drops = ATTR_COLS.map(c => {
            const v = myAt.find(a => a.attribute_name === c)?.score ?? 1;
            return `<td class="p-1"><select id="at_${std.id}_${c}" class="tiny-select w-full" data-val="${v}" onchange="calcAttTotal('${std.id}')" ${lockAttr}><option value="1" ${v === 1 ? 'selected' : ''}>ผ</option><option value="0" ${v === 0 ? 'selected' : ''}>มผ</option></select></td>`;
        }).join('');
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="bg-blue-50/50 border-l-2 border-gray-300 text-center" id="at_sum1_${std.id}"></td><td class="bg-indigo-50/50 border-l border-gray-300 text-center" id="at_sum2_${std.id}"></td><td class="bg-emerald-50/50 border-l-2 border-emerald-300 text-center" id="at_sum3_${std.id}"></td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

async function saveAllData() {
    if (!globalIsSystemOpen) return Swal.fire('ผิดพลาด', 'ระบบถูกปิดการบันทึกแล้ว', 'error');
    if (!globalSelectedClass) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียน', 'warning');
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const classId = globalSelectedClass.id;
        const attToUpsert = [], scToUpsert = [], atToUpsert = [];
        globalStudents.forEach(std => {
            for (let w = 1; w <= 20; w++) {
                const s = document.getElementById(`att_${std.id}_w${w}`);
                if (s && weekDatesArray[w - 1]) attToUpsert.push({ student_id: std.id, classroom_id: classId, week_number: w, status: s.value, check_date: weekDatesArray[w - 1].toISOString().split('T')[0] });
            }
            SCORE_COLS.forEach(c => { const v = document.getElementById(`sc_${std.id}_${c}`)?.value; if (v && v.trim() !== '') scToUpsert.push({ student_id: std.id, column_name: c, score_value: parseFloat(v) }); });
            ATTR_COLS.forEach(c => { const s = document.getElementById(`at_${std.id}_${c}`); if (s) atToUpsert.push({ student_id: std.id, attribute_name: c, score: parseInt(s.value) }); });
        });
        if (attToUpsert.length > 0) await db.from('guidance_attendance').upsert(attToUpsert, { onConflict: 'student_id, week_number' });
        if (scToUpsert.length > 0) await db.from('guidance_scores').upsert(scToUpsert, { onConflict: 'student_id, column_name' });
        if (atToUpsert.length > 0) await db.from('guidance_attributes').upsert(atToUpsert, { onConflict: 'student_id, attribute_name' });
        await updateClassStatusBadges();
        Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
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

// ========== พิมพ์ PDF (คงไว้เหมือนต้นฉบับทุกประการ) ==========
async function printPDF_v7() {
    if (!globalSelectedClass) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนพิมพ์', 'warning');
    Swal.fire({ title: 'กำลังเตรียมหน้ากระดาษ...', text: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    // 🔧 ใช้ fallback หากตาราง system_settings ไม่มี
    let sys = {};
    try {
        const { data } = await db.from('system_settings').select('*').limit(1).single();
        if (data) sys = data;
    } catch (e) { console.warn('ไม่พบตาราง system_settings, ใช้ fallback'); }

    // ✅ ใช้ชื่อเต็มจาก profile
    const teacherFullName = currentUserProfile
        ? `${currentUserProfile.prefix || ''}${currentUserProfile.first_name} ${currentUserProfile.last_name}`.trim()
        : '-';

    const t_subject = sys?.subject_name || 'กิจกรรมแนะแนว';
    const t_term = sys?.semester || globalSystemSettings?.current_semester || '-';
    const t_year = sys?.academic_year || globalSystemSettings?.current_academic_year || '-';
    const t_director = sys?.school_director || globalSystemSettings?.director_name || '(................................................)';
    const t_deputy = sys?.deputy_director_academic || '(................................................)';
    const t_head_eval = sys?.head_evaluation || '(................................................)';
    const t_head_std = sys?.head_student_dev || '(................................................)';
    const t_head_gui = sys?.head_guidance || globalGuidanceSettings?.head_guidance || '(................................................)';
    const t_teacher = teacherFullName;

    // ✅ สร้าง className จาก grade/room
    const className = `ม.${globalSelectedClass.grade}/${globalSelectedClass.room}`;
    const approvalDateStr = formatThaiDateFullStr(sys?.approval_date);

    let subjectCode = "ก22901";
    const grade = globalSelectedClass.grade;
    if (grade === 1) subjectCode = t_term === "2" ? "ก21902" : "ก21901";
    else if (grade === 2) subjectCode = t_term === "2" ? "ก22902" : "ก22901";
    else if (grade === 3) subjectCode = t_term === "2" ? "ก23902" : "ก23901";
    else if (grade === 4) subjectCode = t_term === "2" ? "ก31903" : "ก31901";
    else if (grade === 5) subjectCode = t_term === "2" ? "ก32903" : "ก32901";
    else if (grade === 6) subjectCode = t_term === "2" ? "ก33903" : "ก33901";

    let totalStd = globalStudents.length;
    let passCount = 0, failCount = 0, absentCount = 0, suspendCount = 0, dropCount = 0;

    let students40 = [...globalStudents];
    while (students40.length < 40) students40.push({ id: null, student_number: '', student_id_card: '', prefix: '', first_name: '', last_name: '', student_status: '' });

    const evaluatedStudents = students40.map(std => {
        if (!std.id) return { ...std, attTotal: '', isAttPass: false, isAttrPass: false, finalRes: '' };
        if (std.student_status === 'ขาดนาน') absentCount++;
        else if (std.student_status === 'พักการเรียน') suspendCount++;
        else if (std.student_status === 'ออก') dropCount++;

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
        if (std.student_status === 'ปกติ') {
            if (finalRes === 'ผ') passCount++;
            else failCount++;
        }
        return { ...std, attTotal, isAttPass, isAttrPass: allPassed, finalRes };
    });

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
                <span>ระดับชั้นมัธยมศึกษาปีที่ ${grade}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 
                <span>ภาคเรียนที่ ${t_term}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 
                <span>ปีการศึกษา ${t_year}</span>
            </div>
            <div style="font-size: 14pt; margin-bottom: 15px;">จำนวน 20 ชั่วโมง / ภาคเรียน / ปีการศึกษา</div>
        </div>
        <div style="font-size: 14pt; margin-bottom: 10px; width: 95%; margin-left: auto; margin-right: auto; text-align: left; padding-left: 2.5%;">ครูผู้จัดกิจกรรมแนะแนว ${t_teacher}</div>
        <div style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 5px;">สรุปผลการจัดการเรียนรู้กิจกรรมแนะแนว</div>
        <table class="print-table" style="font-size: 13pt; margin-bottom: 15px; width: 95%; margin-left: auto; margin-right: auto;">
            <tr>
                <th rowspan="2" style="width: 25%; font-weight: normal;">จำนวนนักเรียนทั้งหมด</th>
                <th colspan="2" style="font-weight: normal;">สรุปผลการเรียนรู้กิจกรรมแนะแนว</th>
                <th colspan="3" style="font-weight: normal;">หมายเหตุ</th>
            </tr>
            <tr>
                <th style="font-weight: normal;">ผ่าน</th><th style="font-weight: normal;">ไม่ผ่าน</th><th style="font-weight: normal;">ขาดนาน</th><th style="font-weight: normal;">พักการเรียน</th><th style="font-weight: normal;">ออก</th>
            </tr>
            <tr style="height: 35px;">
                <td style="text-align: center;">${totalStd}</td><td style="text-align: center;">${passCount}</td><td style="text-align: center;">${failCount}</td>
                <td style="text-align: center;">${absentCount === 0 ? '-' : absentCount}</td><td style="text-align: center;">${suspendCount === 0 ? '-' : suspendCount}</td><td style="text-align: center;">${dropCount === 0 ? '-' : dropCount}</td>
            </tr>
        </table>
        <div style="text-align: center; font-size: 14pt; margin-bottom: 5px;">การอนุมัติผลการจัดการเรียนรู้กิจกรรมแนะแนว</div>
        <div style="border: 1px solid #000; padding: 15px 20px 30px 20px; font-size: 14pt; position: relative; width: 95%; margin: 0 auto; box-sizing: border-box;">
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
            <div style="margin-left: 20px; margin-bottom: 25px;">
                <div>1. รักและเห็นคุณค่าในตนเองและผู้อื่น</div><div>2. รู้จักแสวงหาและใช้ข้อมูลสารสนเทศ</div><div>3. สามารถพัฒนาบุคลิกภาพและปรับตัวอยู่ในสังคมได้อย่างมีความสุข</div><div>4. มีเจตคติที่ดีต่ออาชีพสุจริต</div><div>5. มีค่านิยมที่ดี มีวินัย มีคุณธรรมจริยธรรม</div><div>6. มีจิตสำนึกรับผิดชอบต่อตนเอง ครอบครัว สังคม และประเทศไทย</div>
            </div>
            <div style="font-weight:bold; text-align:center; margin-bottom:10px; font-size:15pt;">คำชี้แจงในการทำประเมินผล กิจกรรมแนะแนว</div>
            <div style="margin-left: 20px;">
                <div style="display:flex; margin-bottom:8px;"><div style="min-width:25px;">1.</div><div>การนับเวลาเรียน เวลาเรียนเต็ม ภาคเรียนละ 20 ชั่วโมง นักเรียนเข้าเรียนให้เว้นว่างไว้ ถ้าขาด<br>เรียนใส่ (ข) ด้วยปากกามึกสีแดง</div></div>
                <div style="display:flex; margin-bottom:8px;"><div style="min-width:25px;">2.</div><div>นักเรียนที่เวลาเรียนครบ 80% ใส่ตัวเลขด้วยปากกามึกสีน้ำเงิน ส่วนนักเรียนที่เวลาเรียนไม่ครบ<br>80% ให้เขียนเวลาเรียนเป็นตัวเลขด้วยปากกามึกสีแดง</div></div>
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
                cols += `<td class="col-center" style="font-size:9pt;">${mark}</td>`;
            }
            const myScores = globalScores.filter(s => s.student_id === std.id);
            let s1 = myScores.find(s => s.column_name === 'ครั้งที่ 1')?.score_value ?? '';
            let s2 = myScores.find(s => s.column_name === 'ครั้งที่ 2')?.score_value ?? '';
            let s3 = myScores.find(s => s.column_name === 'ครั้งที่ 3')?.score_value ?? '';
            let s4 = myScores.find(s => s.column_name === 'ครั้งที่ 4')?.score_value ?? '';
            let s5 = myScores.find(s => s.column_name === 'ครั้งที่ 5')?.score_value ?? '';
            let pre = myScores.find(s => s.column_name === 'Pretest')?.score_value ?? '';
            let post = myScores.find(s => s.column_name === 'Posttest')?.score_value ?? '';
            let totalS = (Number(s1) + Number(s2) + Number(s3) + Number(s4) + Number(s5)) || '';

            return `<tr><td class="col-center">${sNum}</td><td class="col-center">${sCode}</td><td class="col-left" style="white-space:nowrap; overflow:hidden; max-width:160px;">${std.prefix}${std.first_name} ${std.last_name}</td>${cols}<td class="col-center">${std.attTotal}</td><td class="col-center">${s1}</td><td class="col-center">${s2}</td><td class="col-center">${s3}</td><td class="col-center">${s4}</td><td class="col-center">${s5}</td><td class="col-center">${totalS}</td><td class="col-center">${pre}</td><td class="col-center">${post}</td><td class="col-center" style="font-weight:bold;">${std.finalRes}</td></tr>`;
        } else {
            return `<tr style="height:19px;"><td class="col-center">${i + 1}</td><td class="col-center"></td><td class="col-center"></td>${'<td class="col-center"></td>'.repeat(20)}<td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td><td class="col-center"></td></tr>`;
        }
    }).join('');

    const page3 = `
    <div class="page-break" style="padding: 20px 10px; position:relative; height: 297mm; box-sizing:border-box;">
        <h3 style="text-align:center; font-weight:bold; font-size:14pt; margin-bottom:10px;">บันทึกเวลาเรียนกิจกรรมแนะแนว ชั้น มัธยมศึกษาปีที่ ${grade} ภาคเรียนที่ ${t_term} ปีการศึกษา ${t_year}</h3>
        <table class="print-table print-table-small">
            <thead>
                <tr>
                    <th rowspan="3" style="width:25px;"><div class="v-text" style="height:50px;">เลขที่</div></th>
                    <th rowspan="3" style="width:55px;"><div class="v-text" style="height:70px;">เลขประจำตัว</div></th>
                    <th rowspan="3" style="width:160px; text-align:center !important;">ชื่อ-สกุล</th>
                    <th colspan="20">วัน เดือน ปี ที่จัดการเรียนการสอน</th>
                    <th rowspan="3" style="width:30px;"><div class="v-text" style="height:70px;">รวมเวลาเรียน</div></th>
                    <th colspan="8" rowspan="2" style="vertical-align:middle; text-align:center;">ผลการประเมินกิจกรรมแนะแนวตาม<br>มาตรฐานการแนะแนว 4 กลุ่ม</th>
                    <th rowspan="3" style="width:35px;"><div class="v-text" style="height:80px;">สรุปผลการประเมิน</div></th>
                </tr>
                <tr>${thDates}</tr>
                <tr style="font-size:7.5pt;">
                    ${Array.from({ length: 20 }, (_, i) => `<th class="col-center">${i + 1}</th>`).join('')}
                    <th class="col-center">1</th><th class="col-center">2</th><th class="col-center">3</th><th class="col-center">4</th><th class="col-center">5</th><th class="col-center">รวม</th><th class="col-center">PRE</th><th class="col-center">OST</th>
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
            return `<tr style="height:19px;"><td class="col-center">${i + 1}</td><td class="col-center"></td><td class="col-center"></td>${'<td class="col-center"></td>'.repeat(12)}<td class="col-center"></td></tr>`;
        }
    }).join('');

    const page4 = `
    <div style="padding: 20px 10px; position:relative; height: 297mm; box-sizing:border-box;">
        <h3 style="text-align:center; font-weight:bold; font-size:14pt; margin-bottom:10px;">การประเมินคุณลักษณะอันพึงประสงค์ของกิจกรรมแนะแนว ชั้น ม.${grade} ภาคเรียนที่ ${t_term} ปีการศึกษา ${t_year}</h3>
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
            #print-wrapper { font-family: 'Sarabun', sans-serif !important; color: #000 !important; background: #fff !important; }
            #print-wrapper table, #print-wrapper th, #print-wrapper td, #print-wrapper tr { background-color: #ffffff !important; background: none !important; color: #000000 !important; }
            #print-wrapper .col-center { text-align: center !important; vertical-align: middle !important; }
            #print-wrapper .col-left { text-align: left !important; padding-left: 6px !important; vertical-align: middle !important; }
            #print-wrapper .v-text { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; margin: 0 auto; display: block;}
            .print-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
            .print-table th, .print-table td { border: 1px solid #000; }
            .print-table-small { font-size: 8pt; }
            .page-break { page-break-after: always; }
        </style>
    `;

    const printArea = document.getElementById('print-area');
    printArea.classList.add('visible');
    printArea.innerHTML = stylePrint + `<div id="print-wrapper">${page1 + page2 + page3 + page4}</div>`;

    document.fonts.ready.then(() => {
        setTimeout(() => {
            Swal.close();
            window.print();
            window.addEventListener('afterprint', () => {
                printArea.classList.remove('visible');
            }, { once: true });
        }, 800);
    }).catch(() => {
        setTimeout(() => {
            Swal.close();
            window.print();
            window.addEventListener('afterprint', () => {
                printArea.classList.remove('visible');
            }, { once: true });
        }, 800);
    });
}

function exportExcelAll() {
    if (!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและต้องมีนักเรียนก่อนทำการส่งออก', 'warning');
    const wb = XLSX.utils.book_new();
    const attData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...Array.from({ length: 20 }, (_, i) => `ส.${i + 1}`)]];
    globalStudents.forEach(std => { const row = [std.student_number, std.student_id_card, std.first_name, std.last_name]; for (let w = 1; w <= 20; w++) { const el = document.getElementById(`att_${std.id}_w${w}`); row.push(el ? el.value : ''); } attData.push(row); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attData), "เวลาเรียน");
    const scData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...SCORE_COLS]];
    globalStudents.forEach(std => { const row = [std.student_number, std.student_id_card, std.first_name, std.last_name]; SCORE_COLS.forEach(c => { const el = document.getElementById(`sc_${std.id}_${c}`); row.push(el ? el.value : ''); }); scData.push(row); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scData), "คะแนน");
    const attrData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...ATTR_COLS]];
    globalStudents.forEach(std => { const row = [std.student_number, std.student_id_card, std.first_name, std.last_name]; ATTR_COLS.forEach(c => { const el = document.getElementById(`at_${std.id}_${c}`); row.push(el ? (el.value === '1' ? 'ผ' : 'มผ') : ''); }); attrData.push(row); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attrData), "คุณลักษณะ");
    XLSX.writeFile(wb, `ปพ5_แนะแนว_ม.${globalSelectedClass.grade}-${globalSelectedClass.room}.xlsx`);
}

async function importExcelAll(event) {
    const file = event.target.files[0]; if (!file) return;
    Swal.fire({ title: 'กำลังดึงข้อมูลจาก Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result), workbook = XLSX.read(data, { type: 'array' });
            if (workbook.Sheets["เวลาเรียน"]) { const rows = XLSX.utils.sheet_to_json(workbook.Sheets["เวลาเรียน"]); rows.forEach(row => { const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']); if (std) { for (let w = 1; w <= 20; w++) { const el = document.getElementById(`att_${std.id}_w${w}`); if (el && row[`ส.${w}`] !== undefined) { el.value = row[`ส.${w}`]; selectColor(el); } } calcAttTotal(std.id); } }); }
            if (workbook.Sheets["คะแนน"]) { const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คะแนน"]); rows.forEach(row => { const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']); if (std) { SCORE_COLS.forEach(c => { const el = document.getElementById(`sc_${std.id}_${c}`); if (el && row[c] !== undefined) el.value = row[c]; }); calcScoreTotal(std.id); } }); }
            if (workbook.Sheets["คุณลักษณะ"]) { const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คุณลักษณะ"]); rows.forEach(row => { const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']); if (std) { ATTR_COLS.forEach(c => { const el = document.getElementById(`at_${std.id}_${c}`); if (el && row[c] !== undefined) { el.value = (row[c] === 'ผ' || row[c] == 1) ? '1' : '0'; selectColor(el); } }); calcAttTotal(std.id); } }); }
            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', text: 'ข้อมูลอยู่บนหน้าจอแล้ว กรุณากด "บันทึกข้อมูล" เพื่อเก็บลงฐานข้อมูล' });
        } catch (err) { Swal.fire('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง หรือหาชีตข้อมูลไม่พบ', 'error'); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}
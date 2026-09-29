// ==========================================
// guidance_admin.js — ระบบเครื่องมือผู้ดูแลระบบแนะแนว
// - ลบส่วนของคะแนน/ผลการเรียนออกทั้งหมด
// - ใช้ RPC get_guidance_progress (เร็วขึ้น 100 เท่า)
// - มี Dashboard สรุปความคืบหน้า
// - มีปุ่มพิมพ์ PDF สำหรับ Admin
// ==========================================

let currentUserProfile = null;
let globalSystemSettings = null;
let globalGuidanceSettings = null;
let allSystemClasses = [];
let allSystemTeachers = [];
let guidanceTeachersList = [];
let monitorData = [];

let globalSelectedClass = null;
let globalStudents = [];
let globalAttendance = [];
let globalAttributes = [];
let weekDatesArray = [];

let currentTeacherId = null;
let teacherModalData = [];
let tomSelectInstances = [];

let currentUserRole = 'admin';
let isAdminMode = true;
let currentUserId = null;
let isModuleAdmin = false;

const ATTR_COLS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5'];

// ==========================================
// ฟังก์ชันอัปเดต UI ตามสิทธิ์
// ==========================================
function applyAdminVisibility() {
    const isAdmin = window.isAdminUser(currentUserRole, isAdminMode);

    const btnSettings = document.getElementById('admin-settings-btn');
    if (btnSettings) btnSettings.classList.toggle('hidden', !isAdmin);

    const btnToggle = document.getElementById('btnAdminMode');
    if (btnToggle) {
        if (isAdmin) {
            btnToggle.classList.remove('hidden');
            btnToggle.classList.add('flex');
        } else {
            btnToggle.classList.add('hidden');
            btnToggle.classList.remove('flex');
        }
    }

    document.querySelectorAll('#btn-import, #btn-export-excel, .btn-import, .btn-export').forEach(btn => {
        if (btn) {
            btn.classList.remove('hidden');
            btn.classList.add('flex');
        }
    });

    window.updateToggleModeUI(currentUserRole, isAdminMode, 'btnAdminMode');
}

// ==========================================
// LOGOUT (มาตรฐานกลาง)
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
    const result = await window.checkSessionAndRole('guidance_admin');
    if (!result) return;

    const { user, personnel, role, isAdmin, isTeacher } = result;
    currentUserProfile = personnel;
    currentUserId = user.id;
    currentUserRole = role;
    isAdminMode = isAdmin;

    isModuleAdmin = await window.hasModuleAccess(role, 'guidance', user.id);
    if (!isAdmin && !isModuleAdmin) {
        window.location.replace('guidance_teacher.html');
        return;
    }

    if (isAdmin || isModuleAdmin) {
        document.getElementById('btnAdminMode')?.classList.remove('hidden');
    }

    document.getElementById('adminNameDisplay').innerText = `แอดมิน: ${personnel.first_name} ${personnel.last_name}`;
    applyAdminVisibility();

    await window.logUserAction('เข้าสู่ระบบแนะแนว (Admin)', 'guidance');

    await loadSystemSettings();
    await loadMonitoringData();
    await loadDashboardData();

    const { data: isGui } = await db.from('guidance_teachers').select('*').eq('teacher_id', user.id).single();
    if (isGui) {
        const btnAdmin = document.getElementById('btnAdminMode');
        if (btnAdmin) btnAdmin.classList.remove('hidden');
    }
};

// -----------------------------------
// 1. ตั้งค่าระบบ
// -----------------------------------
async function loadSystemSettings() {
    const { data: sys } = await db.from('core_school_info').select('*').eq('id', 1).single();
    globalSystemSettings = sys || { current_academic_year: '2569', current_semester: '1' };

    const { data: gui } = await db.from('guidance_settings').select('*').eq('id', 1).single();
    globalGuidanceSettings = gui || {};

    const toggle = document.getElementById('toggleSystemOpen');
    const label = document.getElementById('systemStatusLabel');
    if (toggle) {
        const { data: mod } = await db.from('core_system_modules').select('is_active').eq('module_id', 'guidance').single();
        const isOpen = mod ? mod.is_active : true;
        toggle.checked = isOpen;
        if (isOpen) { label.innerText = "ระบบเปิดอยู่"; label.classList.replace('text-gray-500', 'text-green-600'); }
        else { label.innerText = "ปิดระบบ"; label.classList.replace('text-green-600', 'text-gray-500'); }
    }

    const setVal = (id, val, isLocked = false) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val || '';
            if (isLocked) {
                el.disabled = true;
                el.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
            }
        }
    };

    setVal('set_subject', globalGuidanceSettings.subject_name);
    setVal('set_semester', globalSystemSettings.current_semester, true);
    setVal('set_year', globalSystemSettings.current_academic_year, true);
    setVal('set_term_start', globalSystemSettings.term_start_date, true);
    setVal('set_director', globalSystemSettings.director_name, true);
    setVal('set_deputy', globalSystemSettings.deputy_academic, true);
    setVal('set_eval', globalGuidanceSettings.head_evaluation);
    setVal('set_student_dev', globalGuidanceSettings.head_student_dev);
    setVal('set_guidance', globalGuidanceSettings.head_guidance);
    setVal('set_approval_date', globalGuidanceSettings.approval_date);
    setVal('set_gas_api_url', globalGuidanceSettings.gas_api_url);
    setVal('set_pdf_folder_id', globalGuidanceSettings.pdf_folder_id);
    setVal('set_slide_template_id', globalGuidanceSettings.slide_template_id);
}

async function saveSystemSettings(e) {
    e.preventDefault();
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    Swal.fire({ title: 'กำลังบันทึกการตั้งค่า...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const updates = {
        subject_name: document.getElementById('set_subject')?.value,
        head_evaluation: document.getElementById('set_eval')?.value,
        head_student_dev: document.getElementById('set_student_dev')?.value,
        head_guidance: document.getElementById('set_guidance')?.value,
        approval_date: document.getElementById('set_approval_date')?.value || null,
        gas_api_url: document.getElementById('set_gas_api_url')?.value,
        pdf_folder_id: document.getElementById('set_pdf_folder_id')?.value,
        slide_template_id: document.getElementById('set_slide_template_id')?.value
    };
    const { error } = await db.from('guidance_settings').update(updates).eq('id', 1);
    if (error) Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    else {
        globalGuidanceSettings = { ...globalGuidanceSettings, ...updates };
        await window.logUserAction('บันทึกการตั้งค่าระบบแนะแนว', 'guidance');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    }
}

async function toggleSystemStatus(el) {
    const isOpen = el.checked;
    const label = document.getElementById('systemStatusLabel');
    const { error } = await db.from('core_system_modules').update({ is_active: isOpen }).eq('module_id', 'guidance');
    if (!error) {
        await window.logUserAction(`${isOpen ? 'เปิด' : 'ปิด'}ระบบแนะแนว`, 'guidance');
        if (isOpen) { label.innerText = "ระบบเปิดอยู่"; label.classList.replace('text-gray-500', 'text-green-600'); Swal.fire({ icon: 'success', title: 'เปิดระบบแล้ว', timer: 1500, showConfirmButton: false }); }
        else { label.innerText = "ปิดระบบ"; label.classList.replace('text-green-600', 'text-gray-500'); Swal.fire({ icon: 'warning', title: 'ปิดระบบแล้ว', timer: 1500, showConfirmButton: false }); }
    }
}

// -----------------------------------
// 2. Monitoring & Teacher Management (OPTIMIZED - ใช้ RPC เดียว)
// -----------------------------------
async function loadMonitoringData() {
    Swal.fire({ title: 'กำลังดึงข้อมูลทั้งระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const currentSemester = globalSystemSettings.current_semester;
    const currentYear = globalSystemSettings.current_academic_year;

    try {
        // ✅ 1. ดึงทุกอย่างใน 1 RPC (ห้อง + นร. + att + attr)
        const { data: progress, error: rpcError } = await db.rpc('get_guidance_progress', {
            p_semester: currentSemester,
            p_year: currentYear
        });

        if (rpcError) throw rpcError;

        // ✅ 2. แปลงข้อมูล
        allSystemClasses = (progress || []).map(r => ({
            id: r.classroom_id,
            grade_level: r.grade_level,
            room_number: r.room_number,
            _studentCount: Number(r.n_std),
            _attCount: Number(r.att_count),
            _attrCount: Number(r.attr_count)
        }));

        // ✅ 3. ดึงครูแนะแนว + mapping (2 query)
        const [guiTeachersRes, mappedClassesRes] = await Promise.all([
            db.from('guidance_teachers')
                .select('teacher_id, core_personnel(id, first_name, last_name, email)'),
            db.from('guidance_classes').select('*')
        ]);

        guidanceTeachersList = guiTeachersRes.data 
            ? guiTeachersRes.data.map(gt => gt.core_personnel).filter(Boolean) 
            : [];
        const mappedClasses = mappedClassesRes.data || [];

        // ✅ 4. สร้าง monitorData
        monitorData = allSystemClasses.map(cls => {
            const mapping = mappedClasses.find(m => m.classroom_id === cls.id);
            let teacherName = 'ไม่ระบุครู';
            if (mapping) {
                const t = guidanceTeachersList.find(gt => gt.id === mapping.teacher_id);
                if (t) teacherName = `${t.first_name} ${t.last_name}`;
            }

            const n_std = cls._studentCount;
            const attCount = cls._attCount;
            const attrCount = cls._attrCount;
            let isComplete = false;

            if (n_std > 0 && attCount >= n_std * 20 && attrCount >= n_std * 12) {
                isComplete = true;
            }

            return {
                id: cls.id,
                grade: cls.grade_level,
                room: cls.room_number,
                name: `ม.${cls.grade_level}/${cls.room_number}`,
                teacherName,
                studentCount: n_std,
                isComplete
            };
        });

        renderMonitoringTable(monitorData);
        renderTeacherManageTable(mappedClasses);
        Swal.close();
    } catch (err) {
        console.error('loadMonitoringData Error:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function renderMonitoringTable(dataArray) {
    if ($.fn.DataTable.isDataTable('#monitoringTable')) $('#monitoringTable').DataTable().destroy();
    const tbody = document.getElementById('tb-monitoring');

    if (dataArray.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">ยังไม่มีข้อมูลห้องเรียนในระบบส่วนกลาง</td></tr>'; return; }

    tbody.innerHTML = dataArray.map(item => {
        let statusHtml = item.studentCount === 0 
            ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-500">ไม่มีเด็ก</span>' 
            : (item.isComplete 
                ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">🟢 เรียบร้อย</span>' 
                : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-600">🔴 ยังไม่ครบ</span>');
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-4 py-3 text-center font-bold text-gray-700">${item.name}</td>
            <td class="px-4 py-3 text-gray-600">${item.teacherName}</td>
            <td class="px-4 py-3 text-center">${item.studentCount}</td>
            <td class="px-4 py-3 text-center">${statusHtml}</td>
            <td class="px-4 py-3 text-center"><button onclick="openAdminEditor('${item.id}', '${item.name}')" class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition btn-hover-lift">จัดการ</button></td>
        </tr>`;
    }).join('');

    $('#monitoringTable').DataTable({ language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' }, pageLength: 15, order: [], columnDefs: [{ orderable: false, targets: 4 }], destroy: true });
}

// ==========================================
// Dashboard สรุปความคืบหน้า (OPTIMIZED)
// ==========================================
async function loadDashboardData() {
    Swal.fire({ title: 'กำลังคำนวณข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const currentSemester = globalSystemSettings.current_semester;
        const currentYear = globalSystemSettings.current_academic_year;

        // ✅ ใช้ RPC เดียวกัน (1 query)
        const { data: progress, error: rpcError } = await db.rpc('get_guidance_progress', {
            p_semester: currentSemester,
            p_year: currentYear
        });

        if (rpcError) throw rpcError;

        // ดึงครู-ห้อง (1 query)
        const { data: mappedClasses } = await db.from('guidance_classes').select('*');
        const { data: guiTeachers } = await db.from('guidance_teachers')
            .select('teacher_id, core_personnel(id, first_name, last_name)');

        const teacherMap = {};
        (guiTeachers || []).forEach(gt => {
            if (gt.core_personnel) teacherMap[gt.core_personnel.id] = gt.core_personnel;
        });

        // คำนวณสถานะแต่ละห้อง
        const rooms = (progress || []).map(c => {
            const n_std = Number(c.n_std);
            const attCount = Number(c.att_count);
            const attrCount = Number(c.attr_count);
            const needAtt = n_std * 20;
            const needAttr = n_std * 12;

            let status = 'empty';
            if (attCount > 0 || attrCount > 0) {
                if (attCount >= needAtt && attrCount >= needAttr) status = 'complete';
                else status = 'incomplete';
            }

            const mapping = (mappedClasses || []).find(m => m.classroom_id === c.classroom_id);
            const teacher = mapping ? teacherMap[mapping.teacher_id] : null;

            return {
                id: c.classroom_id,
                grade: c.grade_level,
                room: c.room_number,
                name: `ม.${c.grade_level}/${c.room_number}`,
                n_std, attCount, attrCount, needAtt, needAttr,
                status,
                teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : 'ไม่ระบุครู',
                teacherId: teacher?.id
            };
        });

        // สถิติรวม
        const total = rooms.length;
        const complete = rooms.filter(r => r.status === 'complete').length;
        const incomplete = rooms.filter(r => r.status === 'incomplete').length;
        const empty = rooms.filter(r => r.status === 'empty').length;
        const percent = total > 0 ? Math.round((complete / total) * 100) : 0;

        const elTotal = document.getElementById('dash-total');
        const elComplete = document.getElementById('dash-complete');
        const elIncomplete = document.getElementById('dash-incomplete');
        const elEmpty = document.getElementById('dash-empty');
        const elPercent = document.getElementById('dash-overall-percent');
        const elBar = document.getElementById('dash-overall-bar');

        if (elTotal) elTotal.innerText = total;
        if (elComplete) elComplete.innerText = complete;
        if (elIncomplete) elIncomplete.innerText = incomplete;
        if (elEmpty) elEmpty.innerText = empty;
        if (elPercent) elPercent.innerText = `${percent}%`;
        if (elBar) elBar.style.width = `${percent}%`;

        // แยกตามระดับชั้น
        const byGrade = {};
        rooms.forEach(r => {
            if (!byGrade[r.grade]) byGrade[r.grade] = { complete: 0, incomplete: 0, empty: 0, total: 0 };
            byGrade[r.grade][r.status]++;
            byGrade[r.grade].total++;
        });

        const gradeHtml = Object.keys(byGrade).sort((a, b) => Number(a) - Number(b)).map(grade => {
            const g = byGrade[grade];
            const gp = g.total > 0 ? Math.round((g.complete / g.total) * 100) : 0;
            return `
            <div class="bg-white/70 rounded-xl p-3 border border-gray-200">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-gray-700">ม.${grade}</span>
                    <span class="text-xs font-bold ${gp === 100 ? 'text-green-600' : (gp > 0 ? 'text-amber-600' : 'text-rose-600')}">${gp}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
                    <div class="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all" style="width: ${gp}%"></div>
                </div>
                <div class="flex gap-3 text-[10px] font-bold">
                    <span class="text-green-600">🟢 ${g.complete}</span>
                    <span class="text-amber-600">🟡 ${g.incomplete}</span>
                    <span class="text-rose-600">🔴 ${g.empty}</span>
                    <span class="text-gray-500 ml-auto">รวม ${g.total}</span>
                </div>
            </div>`;
        }).join('');
        const elByGrade = document.getElementById('dash-by-grade');
        if (elByGrade) elByGrade.innerHTML = gradeHtml;

        // ครูที่ยังต้องกรอก
        const teacherPending = {};
        rooms.forEach(r => {
            if (r.status !== 'complete' && r.teacherId) {
                if (!teacherPending[r.teacherId]) {
                    teacherPending[r.teacherId] = { name: r.teacherName, rooms: [] };
                }
                teacherPending[r.teacherId].rooms.push({ name: r.name, status: r.status });
            }
        });

        const pendingList = Object.values(teacherPending).sort((a, b) => b.rooms.length - a.rooms.length);
        const teacherHtml = pendingList.length > 0 ? pendingList.map(t => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 font-bold text-gray-700">${t.name}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex flex-wrap gap-1 justify-center">
                        ${t.rooms.map(r => {
                            const color = r.status === 'empty' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
                            return `<span class="px-2 py-0.5 rounded-lg text-xs font-bold ${color}">${r.name}</span>`;
                        }).join('')}
                    </div>
                </td>
                <td class="px-4 py-3 text-center font-bold text-rose-600">${t.rooms.length}</td>
            </tr>
        `).join('') : '<tr><td colspan="3" class="p-6 text-center text-green-600 font-bold">🎉 ครูทุกท่านกรอกข้อมูลครบถ้วนแล้ว!</td></tr>';
        const elPending = document.getElementById('dash-teachers-pending');
        if (elPending) elPending.innerHTML = teacherHtml;

        Swal.close();
    } catch (err) {
        console.error('Dashboard Error:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// -----------------------------------
// 3. ระบบจัดการครูแนะแนว
// -----------------------------------
function renderTeacherManageTable(mappedClasses) {
    const tbody = document.getElementById('tb-teachers-manage');
    let html = '';
    guidanceTeachersList.forEach(teacher => {
        const tMappings = mappedClasses.filter(m => m.teacher_id === teacher.id);
        let badgesHtml = '<div class="flex flex-wrap gap-2">';

        tMappings.forEach(tm => {
            const cls = allSystemClasses.find(c => c.id === tm.classroom_id);
            if (cls) {
                const mon = monitorData.find(m => m.id === cls.id);
                const color = (mon && mon.isComplete && mon.studentCount > 0) ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600';
                badgesHtml += `<button onclick="openAdminEditor('${cls.id}', 'ม.${cls.grade_level}/${cls.room_number}')" class="px-2.5 py-1.5 ${color} text-white text-xs font-bold rounded-lg shadow-sm transition">ม.${cls.grade_level}/${cls.room_number}</button>`;
            }
        });
        badgesHtml += '</div>';
        if (tMappings.length === 0) badgesHtml = '<span class="text-gray-400 italic">ยังไม่ได้จัดห้องสอน</span>';

        html += `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-5 py-4 w-4/12">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-blue-700">${teacher.first_name} ${teacher.last_name}</span>
                        <button onclick="removeGuidanceRole('${teacher.id}', '${teacher.first_name}')" class="text-gray-400 hover:text-red-500 transition" title="ถอดสิทธิ์วิชาแนะแนว"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <span class="text-[11px] text-gray-500">${teacher.email}</span>
                </div>
            </td>
            <td class="px-5 py-4 w-6/12">${badgesHtml}</td>
            <td class="px-5 py-4 text-center w-2/12"><button onclick="openTeacherModal('${teacher.id}', '${teacher.first_name} ${teacher.last_name}')" class="px-4 py-2 text-xs font-bold text-blue-600 border border-blue-400 rounded-lg hover:bg-blue-50 transition">จัดการห้องสอน</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="3" class="p-8 text-center text-gray-400">ยังไม่มีครูแนะแนวในระบบ</td></tr>';
}

async function openAddGuidanceTeacherModal() {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    Swal.fire({ title: 'กำลังดึงรายชื่อ...', didOpen: () => Swal.showLoading() });
    const { data: allPersonnel, error } = await db.from('core_personnel').select('id, first_name, last_name, email');

    if (error) return Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');

    const available = allPersonnel.filter(p => !guidanceTeachersList.find(gt => gt.id === p.id));
    if (available.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่พบรายชื่อครูจากส่วนกลาง หรือถูกดึงมาเป็นครูแนะแนวครบทุกคนแล้ว', 'info');

    available.sort((a, b) => a.first_name.localeCompare(b.first_name, 'th'));

    let optionsHtml = '';
    available.forEach(t => { optionsHtml += `<option value="${t.id}" class="p-2.5 border-b border-gray-100 hover:bg-indigo-50 cursor-pointer text-gray-700">${t.first_name} ${t.last_name} (${t.email})</option>`; });

    Swal.close();
    const { value: selectedId } = await Swal.fire({
        title: 'เพิ่มครูแนะแนว',
        html: `
            <div class="text-sm text-gray-500 mb-3 text-left">พิมพ์เพื่อค้นหา และคลิกเลือกรายชื่อที่ต้องการ</div>
            <div class="relative mb-2">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
                <input type="text" id="swal-search-teacher" class="w-full border border-gray-300 rounded-lg pl-9 p-2.5 outline-none focus:border-indigo-500 text-sm bg-gray-50 focus:bg-white transition-colors" placeholder="พิมพ์ชื่อเพื่อค้นหา...">
            </div>
            <select id="swal-select-teacher" class="w-full border border-gray-300 rounded-lg outline-none text-sm shadow-inner bg-white" size="6" style="overflow-y: auto;">
                ${optionsHtml}
            </select>
        `,
        showCancelButton: true, confirmButtonText: 'เพิ่มสิทธิ์ครูแนะแนว', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
        didOpen: () => {
            const searchInput = document.getElementById('swal-search-teacher');
            const selectBox = document.getElementById('swal-select-teacher');
            const options = selectBox.options;

            setTimeout(() => searchInput.focus(), 100);
            searchInput.addEventListener('input', function () {
                const filter = searchInput.value.toLowerCase().replace(/\s+/g, '');
                let firstVisibleOption = null;
                for (let i = 0; i < options.length; i++) {
                    const txtValue = options[i].text.toLowerCase().replace(/\s+/g, '');
                    if (txtValue.includes(filter)) { options[i].style.display = ""; if (!firstVisibleOption) firstVisibleOption = options[i]; }
                    else { options[i].style.display = "none"; }
                }
                if (firstVisibleOption && filter !== '') selectBox.value = firstVisibleOption.value;
            });
        },
        preConfirm: () => {
            const val = document.getElementById('swal-select-teacher').value;
            if (!val) Swal.showValidationMessage('กรุณาคลิกเลือกชื่อครูก่อนครับ');
            return val;
        }
    });

    if (selectedId) {
        Swal.fire({ title: 'กำลังแต่งตั้ง...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('guidance_teachers').insert({ teacher_id: selectedId });
        if (error) Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        else {
            await window.logUserAction(`แต่งตั้งครูแนะแนว: ${selectedId}`, 'guidance');
            await loadMonitoringData();
            await loadDashboardData();
            Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ!', timer: 1500, showConfirmButton: false });
        }
    }
}

async function removeGuidanceRole(teacherId, name) {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    const { isConfirmed } = await Swal.fire({ title: 'ถอดสิทธิ์ครูแนะแนว?', html: `ถอดสิทธิ์ <b>${name}</b> ใช่หรือไม่?<br><span class="text-red-500 text-sm">ห้องเรียนที่รับผิดชอบจะว่างลง</span>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยัน' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading() });
        await db.from('guidance_classes').delete().eq('teacher_id', teacherId);
        await db.from('guidance_teachers').delete().eq('teacher_id', teacherId);
        await window.logUserAction(`ถอดสิทธิ์ครูแนะแนว: ${name}`, 'guidance');
        await loadMonitoringData();
        await loadDashboardData();
        Swal.fire({ icon: 'success', title: 'ถอดสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
    }
}

async function openTeacherModal(teacherId, name) {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    currentTeacherId = teacherId;
    document.getElementById('modalTeacherName').innerText = name;

    const { data: tClasses } = await db.from('guidance_classes').select('*').eq('teacher_id', teacherId);
    const groups = {};
    (tClasses || []).forEach(c => {
        const d = c.start_date || '';
        if (!groups[d]) groups[d] = [];
        groups[d].push(c.classroom_id);
    });
    teacherModalData = Object.keys(groups).map(date => ({ date: date, classes: groups[date] }));

    const defaultDate = globalSystemSettings.term_start_date || '';
    if (teacherModalData.length === 0) teacherModalData.push({ date: defaultDate, classes: [] });

    renderModalRows();
    document.getElementById('teacherModal').classList.remove('hidden');
}

function renderModalRows() {
    const container = document.getElementById('modalRowsBody');
    if (tomSelectInstances.length) {
        tomSelectInstances.forEach(ts => ts.destroy());
        tomSelectInstances = [];
    }

    let optionsHtml = '';
    allSystemClasses.forEach(c => {
        optionsHtml += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
    });

    container.innerHTML = teacherModalData.map((row, idx) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
            <td class="p-4 align-middle border-r border-gray-200">
                <input type="date" value="${row.date}" onchange="teacherModalData[${idx}].date=this.value" class="w-full border border-gray-300 rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-200">
            </td>
            <td class="p-4 align-top">
                <div class="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-xl min-h-[80px] bg-gray-50 items-center" id="class-badge-container-${idx}">
                    ${row.classes.map((clsId, cIdx) => {
                        const cInfo = allSystemClasses.find(c => c.id === clsId);
                        const cName = cInfo ? `ม.${cInfo.grade_level}/${cInfo.room_number}` : 'ไม่ทราบ';
                        return `<span class="inline-flex bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                                    ${cName}
                                    <button onclick="teacherModalData[${idx}].classes.splice(${cIdx}, 1); renderModalRows();" class="ml-2 text-red-400 hover:text-red-600">&times;</button>
                                </span>`;
                    }).join('')}
                </div>
                <select id="class-select-${idx}" class="mt-2 w-full tom-selector" data-idx="${idx}">
                    <option value="">-- เลือกห้องเรียน --</option>
                    ${optionsHtml}
                </select>
            </td>
            <td class="p-4 text-center">
                <button onclick="teacherModalData.splice(${idx}, 1); renderModalRows();" class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl transition shadow-sm">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.tom-selector').forEach(select => {
        const idx = parseInt(select.getAttribute('data-idx'));
        const ts = new TomSelect(select, {
            create: false,
            placeholder: '-- เลือกห้องเรียน --',
            onChange: function (value) {
                if (value && !teacherModalData[idx].classes.includes(value)) {
                    teacherModalData[idx].classes.push(value);
                    renderModalRows();
                }
                this.clear();
            }
        });
        tomSelectInstances.push(ts);
    });
}

function addModalRow() {
    const defaultDate = globalSystemSettings.term_start_date || '';
    teacherModalData.push({ date: defaultDate, classes: [] });
    renderModalRows();
}

function closeTeacherModal() {
    document.getElementById('teacherModal').classList.add('hidden');
    if (tomSelectInstances.length) {
        tomSelectInstances.forEach(ts => ts.destroy());
        tomSelectInstances = [];
    }
}

async function saveTeacherClasses() {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        await db.from('guidance_classes').delete().eq('teacher_id', currentTeacherId);

        const toInsert = [];
        teacherModalData.forEach(row => {
            row.classes.forEach(clsId => {
                toInsert.push({
                    classroom_id: clsId,
                    teacher_id: currentTeacherId,
                    start_date: row.date || null
                });
            });
        });

        if (toInsert.length > 0) {
            const { error } = await db.from('guidance_classes').insert(toInsert);
            if (error) throw error;
        }

        await window.logUserAction(`บันทึกการจัดห้องสอนของครู ID ${currentTeacherId}`, 'guidance');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        closeTeacherModal();
        await loadMonitoringData();
        await loadDashboardData();
    } catch (error) {
        Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    }
}

// -----------------------------------
// 4. โหมดสวมรอยกรอกข้อมูล (Admin Editor)
// -----------------------------------
async function openAdminEditor(classId, classNameStr) {
    if (!window.isAdminUser(currentUserRole, isAdminMode) && !isModuleAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }

    document.getElementById('mainAdminView').classList.add('hidden');
    document.getElementById('adminEditorView').classList.remove('hidden');
    document.getElementById('adminEditTitle').innerText = `ห้อง: ${classNameStr}`;
    Swal.fire({ title: 'กำลังโหลดข้อมูลห้อง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    globalSelectedClass = allSystemClasses.find(c => c.id === classId);

    const { data: stds } = await db.from('student_enrollments')
        .select(`id, student_number, status, student_id, core_students(student_id_card, prefix, first_name, last_name)`)
        .eq('classroom_id', classId).order('student_number');

    globalStudents = stds ? stds.map(s => ({
        id: s.student_id, student_number: s.student_number, student_id_card: s.core_students.student_id_card,
        prefix: s.core_students.prefix, first_name: s.core_students.first_name, last_name: s.core_students.last_name, student_status: s.status
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

    const mapping = (await db.from('guidance_classes').select('start_date').eq('classroom_id', classId).single()).data;
    if (mapping && mapping.start_date) {
        const startObj = new Date(mapping.start_date);
        weekDatesArray = Array.from({ length: 20 }, (_, i) => { let d = new Date(startObj); d.setDate(startObj.getDate() + (i * 7)); return d; });
    } else { weekDatesArray = Array.from({ length: 20 }, () => null); }

    renderAttendanceTab(); renderAttributesTab();
    Swal.close();
}

function closeAdminEditor() {
    document.getElementById('adminEditorView').classList.add('hidden');
    document.getElementById('mainAdminView').classList.remove('hidden');
    loadMonitoringData();
    loadDashboardData();
}

function switchAdminTab(tabId, btnElement) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active', 'text-blue-700', 'border-b-2', 'border-blue-600', 'bg-white'));
    btnElement.classList.add('active', 'text-blue-700', 'border-b-2', 'border-blue-600', 'bg-white');
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
}

function selectColor(el) { if (el) el.setAttribute('data-val', el.value); }

function calcAttTotal(stdId) {
    let t = 0;
    for (let w = 1; w <= 20; w++) {
        const s = document.getElementById(`att_${stdId}_w${w}`);
        if (s && s.value === 'มา') t++;
    }
    document.getElementById(`att_total_${stdId}`).innerText = t;
    calcAttr(stdId, t);
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
    const p1 = document.getElementById(`at_sum1_${stdId}`), p2 = document.getElementById(`at_sum2_${stdId}`), p3 = document.getElementById(`at_sum3_${stdId}`);
    if (p1) p1.innerHTML = pass ? '<span class="text-blue-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if (p2) p2.innerHTML = attTotal >= 16 ? '<span class="text-indigo-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if (p3) p3.innerHTML = (pass && attTotal >= 16) ? '<span class="text-emerald-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
}

function renderAttendanceTab() {
    const tbody = document.getElementById('tb-attendance'), tr1 = document.getElementById('att-header-row-1'), tr2 = document.getElementById('att-header-row-2');
    if (!globalStudents.length) { tbody.innerHTML = '<tr><td colspan="24" class="p-8 text-center text-gray-400">ยังไม่มีรายชื่อนักเรียนจากส่วนกลาง</td></tr>'; return; }
    document.querySelectorAll('.dynamic-th').forEach(el => el.remove()); const targetTh = tr1.children[2];
    weekDatesArray.forEach((d, i) => {
        const th1 = document.createElement('th'); th1.className = 'dynamic-th w-16 px-1'; th1.innerText = `ส.${i + 1}`; tr1.insertBefore(th1, targetTh);
        const th2 = document.createElement('th'); th2.className = 'dynamic-th p-1 text-[10px]'; th2.innerText = d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-รอตั้งค่า-'; tr2.appendChild(th2);
    });
    tbody.innerHTML = globalStudents.map(std => {
        const myAtt = globalAttendance.filter(a => a.student_id === std.id);
        const drops = Array.from({ length: 20 }, (_, i) => {
            const w = i + 1, v = myAtt.find(a => a.week_number === w)?.status || 'มา';
            return `<td class="p-1"><select id="att_${std.id}_w${w}" class="tiny-select w-full" data-val="${v}" onchange="selectColor(this); calcAttTotal('${std.id}')"><option value="มา" ${v === 'มา' ? 'selected' : ''}>มา</option><option value="ป่วย" ${v === 'ป่วย' ? 'selected' : ''}>ป่วย</option><option value="ลา" ${v === 'ลา' ? 'selected' : ''}>ลา</option><option value="ขาด" ${v === 'ขาด' ? 'selected' : ''}>ขาด</option></select></td>`;
        }).join('');
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="att_total_${std.id}">0</td><td class="p-1 bg-gray-50 border-l-2 border-gray-300 text-center font-bold text-sm">${std.student_status}</td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

function renderAttributesTab() {
    const tbody = document.getElementById('tb-attributes'); if (!globalStudents.length) return;
    tbody.innerHTML = globalStudents.map(std => {
        const myAt = globalAttributes.filter(a => a.student_id === std.id);
        const drops = ATTR_COLS.map(c => {
            const v = myAt.find(a => a.attribute_name === c)?.score ?? 1;
            return `<td class="p-1"><select id="at_${std.id}_${c}" class="tiny-select w-full" data-val="${v}" onchange="calcAttTotal('${std.id}')"><option value="1" ${v === 1 ? 'selected' : ''}>ผ</option><option value="0" ${v === 0 ? 'selected' : ''}>มผ</option></select></td>`;
        }).join('');
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="bg-blue-50/50 border-l-2 border-gray-300 text-center" id="at_sum1_${std.id}"></td><td class="bg-indigo-50/50 border-l border-gray-300 text-center" id="at_sum2_${std.id}"></td><td class="bg-emerald-50/50 border-l-2 border-emerald-300 text-center" id="at_sum3_${std.id}"></td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

async function adminSaveAllData() {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;

    const classId = globalSelectedClass.id;
    Swal.fire({ title: 'กำลังบังคับบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const attToUpsert = [], atToUpsert = [];
        globalStudents.forEach(std => {
            for (let w = 1; w <= 20; w++) {
                const s = document.getElementById(`att_${std.id}_w${w}`);
                if (s && weekDatesArray[w - 1]) attToUpsert.push({ student_id: std.id, classroom_id: classId, week_number: w, status: s.value, check_date: weekDatesArray[w - 1].toISOString().split('T')[0] });
            }
            ATTR_COLS.forEach(c => { const s = document.getElementById(`at_${std.id}_${c}`); if (s) atToUpsert.push({ student_id: std.id, attribute_name: c, score: parseInt(s.value) }); });
        });

        if (attToUpsert.length > 0) await db.from('guidance_attendance').upsert(attToUpsert, { onConflict: 'student_id,week_number' });
        if (atToUpsert.length > 0) await db.from('guidance_attributes').upsert(atToUpsert, { onConflict: 'student_id,attribute_name' });

        // ✅ FIX: ดึงข้อมูลล่าสุดกลับมาเก็บใน memory ใหม่ เพื่อให้ PDF แสดงถูกต้องทันที
        const stdIds = globalStudents.map(s => s.id);
        const { data: att } = await db.from('guidance_attendance').select('*').eq('classroom_id', classId);
        globalAttendance = att || [];

        if (stdIds.length > 0) {
            const { data: attrs } = await db.from('guidance_attributes').select('*').in('student_id', stdIds);
            globalAttributes = attrs || [];
        } else {
            globalAttributes = [];
        }

        await window.logUserAction(`Admin บันทึกข้อมูลห้อง ${classId} (บังคับ)`, 'guidance');
        Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

// ==========================================
// 5. ระบบ นำเข้า/ส่งออก Excel (ไม่มีคะแนน)
// ==========================================
function exportExcelAll() {
    if (!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและต้องมีนักเรียนก่อนทำการส่งออก', 'warning');
    const wb = XLSX.utils.book_new();

    const attData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...Array.from({ length: 20 }, (_, i) => `ส.${i + 1}`)]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        for (let w = 1; w <= 20; w++) {
            const el = document.getElementById(`att_${std.id}_w${w}`);
            row.push(el ? el.value : '');
        }
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

    XLSX.writeFile(wb, `ปพ5_แนะแนว_ม.${globalSelectedClass.grade_level}-${globalSelectedClass.room_number}.xlsx`);

    window.logUserAction(`ส่งออก Excel ห้อง ${globalSelectedClass.grade_level}/${globalSelectedClass.room_number}`, 'guidance');
}

async function importExcelAll(event) {
    const file = event.target.files[0];
    if (!file) return;
    Swal.fire({ title: 'กำลังดึงข้อมูลจาก Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            if (workbook.Sheets["เวลาเรียน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["เวลาเรียน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if (std) {
                        for (let w = 1; w <= 20; w++) {
                            const el = document.getElementById(`att_${std.id}_w${w}`);
                            if (el && row[`ส.${w}`]) { el.value = row[`ส.${w}`]; selectColor(el); }
                        }
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
                            if (el && row[c] !== undefined) { el.value = (row[c] === 'ผ' || row[c] == 1) ? '1' : '0'; selectColor(el); }
                        });
                        calcAttTotal(std.id);
                    }
                });
            }

            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', text: 'ข้อมูลอยู่บนหน้าจอแล้ว กรุณากด "บันทึกข้อมูล" เพื่อเก็บลงฐานข้อมูล' });
        } catch (err) {
            Swal.fire('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง หรือหาชีตข้อมูลไม่พบ', 'error');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 6. PRINT PDF สำหรับ ADMIN
// ==========================================
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

async function printPDFAdmin() {
    if (!globalSelectedClass) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนพิมพ์', 'warning');
    }
    Swal.fire({
        title: 'กำลังเตรียมหน้ากระดาษ...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const teacherFullName = '...............................................';
    const t_term = globalSystemSettings?.current_semester || '-';
    const t_year = globalSystemSettings?.current_academic_year || '-';
    const t_director = globalSystemSettings?.director_name || '(................................................)';
    const t_deputy = globalSystemSettings?.deputy_academic || '(................................................)';
    const t_head_eval = globalGuidanceSettings?.head_evaluation || '(................................................)';
    const t_head_std = globalGuidanceSettings?.head_student_dev || '(................................................)';
    const t_head_gui = globalGuidanceSettings?.head_guidance || '(................................................)';
    const approvalDateStr = formatThaiDateFullStr(globalGuidanceSettings?.approval_date);

    const grade = globalSelectedClass.grade_level;
    const room = globalSelectedClass.room_number;

    let subjectCode = "ก22901";
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
        const isSpecialStatus = ['ขาดนาน', 'พักการเรียน', 'ออก'].includes(std.student_status);
        if (!isSpecialStatus) {
            if (finalRes === 'ผ') passCount++;
            else failCount++;
        }
        return { ...std, attTotal, isAttPass, isAttrPass: allPassed, finalRes };
    });

    const classNameFull = `ชั้นมัธยมศึกษาปีที่ ${grade}/${room}`;

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
        <div style="font-size: 14pt; margin-bottom: 10px; width: 95%; margin-left: auto; margin-right: auto; text-align: left; padding-left: 2.5%;">ครูผู้จัดกิจกรรมแนะแนว ${teacherFullName}</div>
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
                <td style="text-align: center; font-size: 14pt">${totalStd}</td>
                <td style="text-align: center; font-size: 14pt">${passCount}</td>
                <td style="text-align: center; font-size: 14pt">${failCount}</td>
                <td style="text-align: center; font-size: 14pt">${absentCount === 0 ? '-' : absentCount}</td>
                <td style="text-align: center; font-size: 14pt">${suspendCount === 0 ? '-' : suspendCount}</td>
                <td style="text-align: center; font-size: 14pt">${dropCount === 0 ? '-' : dropCount}</td>
            </tr>
        </table>
        <div style="text-align: center; font-size: 14pt; margin-bottom: 5px;">การอนุมัติผลการจัดการเรียนรู้กิจกรรมแนะแนว</div>
        <div style="border: 1px solid #000; padding: 15px 20px 30px 20px; font-size: 12pt; position: relative; width: 95%; margin: 0 auto; box-sizing: border-box;">
            <div style="position: absolute; top: 10px; left: 10px;">การอนุมัติผลการเรียน</div>
            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 40px;">
                <div style="width: 45%;">ลงชื่อ....................................................<br><div style="margin-top: 5px;">(${teacherFullName})</div><div style="margin-top: 5px;">ผู้จัดกิจกรรมแนะแนว</div></div>
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
            <title>ปพ.5 แนะแนว ม.${grade}/${room}</title>
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
// 7. TOGGLE MODE
// ==========================================
async function toggleRoleView() {
    if (!window.isAdminUser(currentUserRole, isAdminMode)) return;

    isAdminMode = !isAdminMode;
    applyAdminVisibility();
    await loadMonitoringData();
    await loadDashboardData();

    await window.logUserAction(`สลับโหมดเป็น ${isAdminMode ? 'Admin' : 'Teacher'}`, 'guidance');
}

// ==========================================
// 8. SETTINGS
// ==========================================
function openSettings() {
    if (!window.requireAdmin(currentUserRole, isAdminMode)) return;
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.logout = logout;
window.toggleRoleView = toggleRoleView;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.exportExcelAll = exportExcelAll;
window.importExcelAll = importExcelAll;
window.openAdminEditor = openAdminEditor;
window.closeAdminEditor = closeAdminEditor;
window.adminSaveAllData = adminSaveAllData;
window.switchAdminTab = switchAdminTab;
window.openAddGuidanceTeacherModal = openAddGuidanceTeacherModal;
window.openTeacherModal = openTeacherModal;
window.closeTeacherModal = closeTeacherModal;
window.addModalRow = addModalRow;
window.saveTeacherClasses = saveTeacherClasses;
window.loadMonitoringData = loadMonitoringData;
window.loadDashboardData = loadDashboardData;
window.printPDFAdmin = printPDFAdmin;

console.log('✅ guidance_admin.js loaded (OPTIMIZED + Dashboard + Print PDF Admin)');
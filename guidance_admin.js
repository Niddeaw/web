// ==========================================
// ไฟล์ guidance_admin.js (ระบบเครื่องมือผู้ดูแลระบบแนะแนว)
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
let globalScores = [];
let globalAttributes = [];
let weekDatesArray = [];

let currentTeacherId = null;
let teacherModalData = []; 

const ATTR_COLS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5'];
const SCORE_COLS = ['ครั้งที่ 1', 'ครั้งที่ 2', 'ครั้งที่ 3', 'ครั้งที่ 4', 'ครั้งที่ 5', 'Pretest', 'Posttest'];

window.onload = async () => { await checkAuth(); };

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
        if (!profile) { window.location.replace('index.html'); return; }

        localStorage.removeItem('activeMode');

        let isAuthorized = false;

        if (profile.role === 'super_admin') {
            isAuthorized = true;
        } else if (profile.role === 'admin') {
            const { data: moduleAdmin } = await db.from('core_module_admins')
                .select('module_id')
                .eq('user_id', session.user.id)
                .eq('module_id', 'guidance')
                .single();
            if (moduleAdmin) isAuthorized = true;
        }

        if (!isAuthorized) {
            window.location.replace('guidance_teacher.html');
            return;
        }

        currentUserProfile = profile;
        document.getElementById('adminNameDisplay').innerText = `แอดมิน: ${profile.first_name} ${profile.last_name}`;

        await loadSystemSettings();
        await loadMonitoringData();

        const { data: isGui } = await db.from('guidance_teachers').select('*').eq('teacher_id', session.user.id).single();
        if (isGui) {
            addTeacherSwitchButton();
        }

    } else {
        window.location.replace('index.html');
    }
}

function addTeacherSwitchButton() {
    const headerActions = document.querySelector('.flex.items-center.gap-2.md\\:gap-4');
    if(headerActions && !document.getElementById('btnSwitchTeacher')) {
        const btn = document.createElement('button');
        btn.id = 'btnSwitchTeacher';
        btn.className = 'bg-indigo-600 hover:bg-indigo-700 text-white px-3 md:px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors';
        btn.innerHTML = '<i class="fa-solid fa-user-pen"></i> <span class="hidden md:inline">โหมดครูผู้สอน</span>';
        btn.onclick = () => {
            localStorage.setItem('activeMode', 'teacher');
            window.location.replace('guidance_teacher.html');
        };
        headerActions.insertBefore(btn, headerActions.children[1]); 
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
        if(el) { 
            el.value = val || ''; 
            if(isLocked) { 
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
}

async function saveSystemSettings(e) {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกการตั้งค่า...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const updates = {
        subject_name: document.getElementById('set_subject')?.value,
        head_evaluation: document.getElementById('set_eval')?.value,
        head_student_dev: document.getElementById('set_student_dev')?.value,
        head_guidance: document.getElementById('set_guidance')?.value,
        approval_date: document.getElementById('set_approval_date')?.value || null
    };
    const { error } = await db.from('guidance_settings').update(updates).eq('id', 1);
    if (error) Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    else { 
        globalGuidanceSettings = { ...globalGuidanceSettings, ...updates }; 
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false }); 
    }
}

async function toggleSystemStatus(el) {
    const isOpen = el.checked;
    const label = document.getElementById('systemStatusLabel');
    const { error } = await db.from('core_system_modules').update({ is_active: isOpen }).eq('module_id', 'guidance');
    if (!error) {
        if (isOpen) { label.innerText = "ระบบเปิดอยู่"; label.classList.replace('text-gray-500', 'text-green-600'); Swal.fire({ icon: 'success', title: 'เปิดระบบแล้ว', timer: 1500, showConfirmButton: false}); } 
        else { label.innerText = "ปิดระบบ"; label.classList.replace('text-green-600', 'text-gray-500'); Swal.fire({ icon: 'warning', title: 'ปิดระบบแล้ว', timer: 1500, showConfirmButton: false}); }
    }
}

// -----------------------------------
// 2. Monitoring & Teacher Mngt
// -----------------------------------
async function loadMonitoringData() {
    Swal.fire({ title: 'กำลังดึงข้อมูลทั้งระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const currentSemester = globalSystemSettings.current_semester;
    const currentYear = globalSystemSettings.current_academic_year;

    const { data: classes } = await db.from('core_classrooms').select('*').eq('semester', currentSemester).eq('academic_year', currentYear);
    allSystemClasses = classes || [];
    allSystemClasses.sort((a, b) => a.grade_level - b.grade_level || a.room_number - b.room_number);

    const { data: guiTeachers } = await db.from('guidance_teachers').select('teacher_id, core_personnel(id, first_name, last_name, email)');
    guidanceTeachersList = guiTeachers ? guiTeachers.map(gt => gt.core_personnel) : [];

    const { data: mappedClasses } = await db.from('guidance_classes').select('*');

    const monitorPromises = allSystemClasses.map(async (cls) => {
        const mapping = mappedClasses.find(m => m.classroom_id === cls.id);
        let teacherName = 'ไม่ระบุครู';
        if (mapping) {
            const t = guidanceTeachersList.find(gt => gt.id === mapping.teacher_id);
            if(t) teacherName = `${t.first_name} ${t.last_name}`;
        }

        const { data: enrolls, count: n_std } = await db.from('student_enrollments').select('student_id', { count: 'exact' }).eq('classroom_id', cls.id);
        let isComplete = false;

        if (n_std > 0) {
            const stdIds = enrolls.map(e => e.student_id);
            const [attRes, attrRes] = await Promise.all([
                db.from('guidance_attendance').select('*', { count: 'exact', head: true }).eq('classroom_id', cls.id),
                db.from('guidance_attributes').select('*', { count: 'exact', head: true }).in('student_id', stdIds)
            ]);
            if ((attRes.count || 0) >= n_std * 20 && (attrRes.count || 0) >= n_std * 12) isComplete = true;
        }
        return { id: cls.id, grade: cls.grade_level, room: cls.room_number, name: `ม.${cls.grade_level}/${cls.room_number}`, teacherName, studentCount: n_std || 0, isComplete };
    });

    monitorData = await Promise.all(monitorPromises);
    renderMonitoringTable(monitorData);
    renderTeacherManageTable(mappedClasses);
    Swal.close();
}

function renderMonitoringTable(dataArray) {
    if ($.fn.DataTable.isDataTable('#monitoringTable')) $('#monitoringTable').DataTable().destroy();
    const tbody = document.getElementById('tb-monitoring');
    
    if(dataArray.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">ยังไม่มีข้อมูลห้องเรียนในระบบส่วนกลาง</td></tr>'; return; }

    tbody.innerHTML = dataArray.map(item => {
        let statusHtml = item.studentCount === 0 ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-500">ไม่มีเด็ก</span>' : (item.isComplete ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">🟢 เรียบร้อย</span>' : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-600">🔴 ยังไม่ครบ</span>');
        return `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-center font-bold text-gray-700">${item.name}</td>
            <td class="px-4 py-3 text-gray-600">${item.teacherName}</td>
            <td class="px-4 py-3 text-center">${item.studentCount}</td>
            <td class="px-4 py-3 text-center">${statusHtml}</td>
            <td class="px-4 py-3 text-center"><button onclick="openAdminEditor('${item.id}', '${item.name}')" class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm">จัดการ</button></td>
        </tr>`;
    }).join('');

    $('#monitoringTable').DataTable({ language: { url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' }, pageLength: 15, order: [], columnDefs: [ { orderable: false, targets: 4 } ], destroy: true });
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
            if(cls) {
                const mon = monitorData.find(m => m.id === cls.id);
                const color = (mon && mon.isComplete && mon.studentCount > 0) ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600';
                badgesHtml += `<button onclick="openAdminEditor('${cls.id}', 'ม.${cls.grade_level}/${cls.room_number}')" class="px-2.5 py-1.5 ${color} text-white text-xs font-bold rounded-lg shadow-sm">ม.${cls.grade_level}/${cls.room_number}</button>`;
            }
        });
        badgesHtml += '</div>';
        if(tMappings.length === 0) badgesHtml = '<span class="text-gray-400 italic">ยังไม่ได้จัดห้องสอน</span>';

        html += `
        <tr class="hover:bg-gray-50">
            <td class="px-5 py-4 w-4/12">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-blue-700">${teacher.first_name} ${teacher.last_name}</span>
                        <button onclick="removeGuidanceRole('${teacher.id}', '${teacher.first_name}')" class="text-gray-400 hover:text-red-500" title="ถอดสิทธิ์วิชาแนะแนว"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <span class="text-[11px] text-gray-500">${teacher.email}</span>
                </div>
            </td>
            <td class="px-5 py-4 w-6/12">${badgesHtml}</td>
            <td class="px-5 py-4 text-center w-2/12"><button onclick="openTeacherModal('${teacher.id}', '${teacher.first_name}')" class="px-4 py-2 text-xs font-bold text-blue-600 border border-blue-400 rounded-lg hover:bg-blue-50">จัดการห้องสอน</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="3" class="p-8 text-center text-gray-400">ยังไม่มีครูแนะแนวในระบบ</td></tr>';
}

async function openAddGuidanceTeacherModal() {
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
            searchInput.addEventListener('input', function() {
                const filter = searchInput.value.toLowerCase().replace(/\s+/g, '');
                let firstVisibleOption = null;
                for (let i = 0; i < options.length; i++) {
                    const txtValue = options[i].text.toLowerCase().replace(/\s+/g, '');
                    if (txtValue.includes(filter)) { options[i].style.display = ""; if(!firstVisibleOption) firstVisibleOption = options[i]; } 
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
        else { await loadMonitoringData(); Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ!', timer: 1500, showConfirmButton: false }); }
    }
}

async function removeGuidanceRole(teacherId, name) {
    const { isConfirmed } = await Swal.fire({ title: 'ถอดสิทธิ์ครูแนะแนว?', html: `ถอดสิทธิ์ <b>${name}</b> ใช่หรือไม่?<br><span class="text-red-500 text-sm">ห้องเรียนที่รับผิดชอบจะว่างลง</span>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยัน' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading() });
        await db.from('guidance_classes').delete().eq('teacher_id', teacherId);
        await db.from('guidance_teachers').delete().eq('teacher_id', teacherId);
        await loadMonitoringData();
        Swal.fire({ icon: 'success', title: 'ถอดสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
    }
}

async function openTeacherModal(teacherId, name) {
    currentTeacherId = teacherId;
    document.getElementById('modalTeacherName').innerText = name;
    
    const { data: tClasses } = await db.from('guidance_classes').select('*').eq('teacher_id', teacherId);
    const groups = {};
    (tClasses || []).forEach(c => {
        const d = c.start_date || '';
        if(!groups[d]) groups[d] = [];
        groups[d].push(c.classroom_id);
    });
    teacherModalData = Object.keys(groups).map(date => ({ date: date, classes: groups[date] }));
    
    const defaultDate = globalSystemSettings.term_start_date || '';
    if(teacherModalData.length === 0) teacherModalData.push({ date: defaultDate, classes: [] }); 

    renderModalRows();
    document.getElementById('teacherModal').classList.remove('hidden');
}

function renderModalRows() {
    let optionsHtml = '<option value="" disabled selected>+ เลือกห้องเรียน...</option>';
    allSystemClasses.forEach(c => { optionsHtml += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`; });
    
    const container = document.getElementById('modalRowsBody');
    container.innerHTML = teacherModalData.map((row, idx) => `
        <tr>
            <td class="p-4 align-middle border-r border-gray-200">
                <input type="date" value="${row.date}" onchange="teacherModalData[${idx}].date=this.value" class="w-full border border-gray-300 rounded p-2 outline-none">
            </td>
            <td class="p-4 align-top">
                <div class="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg min-h-[50px] bg-gray-50 items-center">
                    ${row.classes.map((clsId, cIdx) => {
                        const cInfo = allSystemClasses.find(c => c.id === clsId);
                        const cName = cInfo ? `ม.${cInfo.grade_level}/${cInfo.room_number}` : 'ไม่ทราบ';
                        return `<span class="inline-flex bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm font-bold">${cName}<button onclick="teacherModalData[${idx}].classes.splice(${cIdx}, 1); renderModalRows();" class="ml-2 text-red-400 hover:text-red-600">&times;</button></span>`;
                    }).join('')}
                    <select onchange="if(this.value && !teacherModalData[${idx}].classes.includes(this.value)){ teacherModalData[${idx}].classes.push(this.value); renderModalRows(); }" class="flex-1 min-w-[150px] border border-gray-300 rounded px-2 py-1 outline-none text-sm">${optionsHtml}</select>
                </div>
            </td>
            <td class="p-4 text-center"><button onclick="teacherModalData.splice(${idx}, 1); renderModalRows();" class="bg-red-500 text-white p-2 rounded">ลบ</button></td>
        </tr>
    `).join('');
}

function addModalRow() { 
    const defaultDate = globalSystemSettings.term_start_date || '';
    teacherModalData.push({ date: defaultDate, classes: [] }); 
    renderModalRows(); 
}

function closeTeacherModal() { document.getElementById('teacherModal').classList.add('hidden'); }

async function saveTeacherClasses() {
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        await db.from('guidance_classes').delete().eq('teacher_id', currentTeacherId);
        const toInsert = [];
        teacherModalData.forEach(row => {
            row.classes.forEach(clsId => { toInsert.push({ classroom_id: clsId, teacher_id: currentTeacherId, start_date: row.date || null }); });
        });
        if (toInsert.length > 0) {
            const { error } = await db.from('guidance_classes').insert(toInsert);
            if(error) throw error;
        }
        Swal.fire({icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false});
        closeTeacherModal(); await loadMonitoringData(); 
    } catch (error) { Swal.fire('เกิดข้อผิดพลาด', error.message, 'error'); }
}

// -----------------------------------
// 4. โหมดสวมรอยกรอกข้อมูล (Admin Editor)
// -----------------------------------
async function openAdminEditor(classId, classNameStr) {
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
        const { data: scrs } = await db.from('guidance_scores').select('*').in('student_id', stdIds); globalScores = scrs || [];
        const { data: attrs } = await db.from('guidance_attributes').select('*').in('student_id', stdIds); globalAttributes = attrs || [];
    } else { globalScores = []; globalAttributes = []; }
    
    const mapping = (await db.from('guidance_classes').select('start_date').eq('classroom_id', classId).single()).data;
    if (mapping && mapping.start_date) {
        const startObj = new Date(mapping.start_date);
        weekDatesArray = Array.from({length: 20}, (_, i) => { let d = new Date(startObj); d.setDate(startObj.getDate() + (i * 7)); return d; });
    } else { weekDatesArray = Array.from({length: 20}, () => null); }

    renderAttendanceTab(); renderScoresTab(); renderAttributesTab();
    Swal.close();
}

function closeAdminEditor() {
    document.getElementById('adminEditorView').classList.add('hidden');
    document.getElementById('mainAdminView').classList.remove('hidden');
    loadMonitoringData();
}

function switchAdminTab(tabId, btnElement) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.className = "admin-tab-btn px-6 py-3 font-bold text-gray-500 bg-gray-50");
    btnElement.className = "admin-tab-btn px-6 py-3 font-bold text-blue-700 border-b-2 border-blue-600 bg-white";
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
}

function selectColor(el) { if(el) el.setAttribute('data-val', el.value); }
function calcAttTotal(stdId) { let t = 0; for(let w=1;w<=20;w++){ const s = document.getElementById(`att_${stdId}_w${w}`); if(s && s.value==='มา') t++; } document.getElementById(`att_total_${stdId}`).innerText = t; calcAttr(stdId, t); }
function calcScoreTotal(stdId) { let t = 0; for(let i=1;i<=5;i++){ const v = document.getElementById(`sc_${stdId}_ครั้งที่ ${i}`)?.value; if(v) t += parseFloat(v); } document.getElementById(`sc_total_${stdId}`).innerText = t; }
function calcAttr(stdId, attTotal) {
    let pass = true; ATTR_COLS.forEach(c => { const el=document.getElementById(`at_${stdId}_${c}`); if(el){ selectColor(el); if(el.value==="0") pass=false; } });
    const p1 = document.getElementById(`at_sum1_${stdId}`), p2 = document.getElementById(`at_sum2_${stdId}`), p3 = document.getElementById(`at_sum3_${stdId}`);
    if(p1) p1.innerHTML = pass ? '<span class="text-blue-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if(p2) p2.innerHTML = attTotal>=16 ? '<span class="text-indigo-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if(p3) p3.innerHTML = (pass && attTotal>=16) ? '<span class="text-emerald-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
}

function renderAttendanceTab() {
    const tbody = document.getElementById('tb-attendance'), tr1 = document.getElementById('att-header-row-1'), tr2 = document.getElementById('att-header-row-2');
    if(!globalStudents.length) { tbody.innerHTML = '<tr><td colspan=\"24\" class=\"p-8 text-center text-gray-400\">ยังไม่มีรายชื่อนักเรียนจากส่วนกลาง</td></tr>'; return; }
    document.querySelectorAll('.dynamic-th').forEach(el => el.remove()); const targetTh = tr1.children[2]; 
    weekDatesArray.forEach((d, i) => {
        const th1 = document.createElement('th'); th1.className = 'dynamic-th w-16 px-1'; th1.innerText = `ส.${i+1}`; tr1.insertBefore(th1, targetTh); 
        const th2 = document.createElement('th'); th2.className = 'dynamic-th p-1 text-[10px]'; th2.innerText = d ? d.toLocaleDateString('th-TH',{day:'numeric',month:'short'}) : '-รอตั้งค่า-'; tr2.appendChild(th2);
    });
    tbody.innerHTML = globalStudents.map(std => {
        const myAtt = globalAttendance.filter(a => a.student_id === std.id);
        const drops = Array.from({length:20}, (_,i) => {
            const w=i+1, v = myAtt.find(a=>a.week_number===w)?.status || 'มา';
            return `<td class=\"p-1\"><select id=\"att_${std.id}_w${w}\" class=\"tiny-select w-full\" data-val=\"${v}\" onchange=\"selectColor(this); calcAttTotal('${std.id}')\"><option value=\"มา\" ${v==='มา'?'selected':''}>มา</option><option value=\"ป่วย\" ${v==='ป่วย'?'selected':''}>ป่วย</option><option value=\"ลา\" ${v==='ลา'?'selected':''}>ลา</option><option value=\"ขาด\" ${v==='ขาด'?'selected':''}>ขาด</option></select></td>`;
        }).join('');
        return `<tr><td class=\"col-no\">${std.student_number}</td><td class=\"col-name\">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class=\"font-bold text-green-700 bg-green-50 border-l-2 border-green-200\" id=\"att_total_${std.id}\">0</td><td class=\"p-1 bg-gray-50 border-l-2 border-gray-300 text-center font-bold text-sm\">${std.student_status}</td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

function renderScoresTab() {
    const tbody = document.getElementById('tb-scores'); if(!globalStudents.length) return;
    tbody.innerHTML = globalStudents.map(std => {
        const mySc = globalScores.filter(s => s.student_id === std.id);
        const inps = SCORE_COLS.map(c => {
            const v = mySc.find(s=>s.column_name===c)?.score_value ?? '';
            return `<td><input type=\"number\" id=\"sc_${std.id}_${c}\" class=\"w-full text-center\" value=\"${v}\" oninput=\"calcScoreTotal('${std.id}')\"></td>`;
        });
        inps.splice(5, 0, `<td class=\"font-bold text-green-700 bg-green-50 border-l-2 border-green-200\" id=\"sc_total_${std.id}\">0</td>`);
        return `<tr><td class=\"col-no\">${std.student_number}</td><td class=\"col-name\">${std.prefix}${std.first_name} ${std.last_name}</td>${inps.join('')}</tr>`;
    }).join('');
    globalStudents.forEach(std => calcScoreTotal(std.id));
}

function renderAttributesTab() {
    const tbody = document.getElementById('tb-attributes'); if(!globalStudents.length) return;
    tbody.innerHTML = globalStudents.map(std => {
        const myAt = globalAttributes.filter(a => a.student_id === std.id);
        const drops = ATTR_COLS.map(c => {
            const v = myAt.find(a=>a.attribute_name===c)?.score ?? 1;
            return `<td class=\"p-1\"><select id=\"at_${std.id}_${c}\" class=\"tiny-select w-full\" data-val=\"${v}\" onchange=\"calcAttTotal('${std.id}')\"><option value=\"1\" ${v===1?'selected':''}>ผ</option><option value=\"0\" ${v===0?'selected':''}>มผ</option></select></td>`;
        }).join('');
        return `<tr><td class=\"col-no\">${std.student_number}</td><td class=\"col-name\">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class=\"bg-blue-50/50 border-l-2 border-gray-300 text-center\" id=\"at_sum1_${std.id}\"></td><td class=\"bg-indigo-50/50 border-l border-gray-300 text-center\" id=\"at_sum2_${std.id}\"></td><td class=\"bg-emerald-50/50 border-l-2 border-emerald-300 text-center\" id=\"at_sum3_${std.id}\"></td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

async function adminSaveAllData() {
    const classId = globalSelectedClass.id;
    Swal.fire({ title: 'กำลังบังคับบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const attToUpsert = [], scToUpsert = [], atToUpsert = [];
        globalStudents.forEach(std => {
            for(let w=1; w<=20; w++) {
                const s = document.getElementById(`att_${std.id}_w${w}`);
                if(s && weekDatesArray[w-1]) attToUpsert.push({ student_id: std.id, classroom_id: classId, week_number: w, status: s.value, check_date: weekDatesArray[w-1].toISOString().split('T')[0] });
            }
            SCORE_COLS.forEach(c => { const v = document.getElementById(`sc_${std.id}_${c}`)?.value; if(v!=='') scToUpsert.push({ student_id: std.id, column_name: c, score_value: parseFloat(v) }); });
            ATTR_COLS.forEach(c => { const s = document.getElementById(`at_${std.id}_${c}`); if(s) atToUpsert.push({ student_id: std.id, attribute_name: c, score: parseInt(s.value) }); });
        });

        if(attToUpsert.length > 0) await db.from('guidance_attendance').upsert(attToUpsert, { onConflict: 'student_id, week_number' });
        if(scToUpsert.length > 0) await db.from('guidance_scores').upsert(scToUpsert, { onConflict: 'student_id, column_name' });
        if(atToUpsert.length > 0) await db.from('guidance_attributes').upsert(atToUpsert, { onConflict: 'student_id, attribute_name' });

        Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

// ==========================================
// 5. ระบบ นำเข้า/ส่งออก Excel (Offline) สำหรับ Admin
// ==========================================
function exportExcelAll() {
    if(!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและต้องมีนักเรียนก่อนทำการส่งออก', 'warning');
    const wb = XLSX.utils.book_new();

    const attData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...Array.from({length:20}, (_,i)=>`ส.${i+1}`)]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        for(let w=1; w<=20; w++) {
            const el = document.getElementById(`att_${std.id}_w${w}`);
            row.push(el ? el.value : '');
        }
        attData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attData), "เวลาเรียน");

    const scData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...SCORE_COLS]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        SCORE_COLS.forEach(c => {
            const el = document.getElementById(`sc_${std.id}_${c}`);
            row.push(el ? el.value : '');
        });
        scData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scData), "คะแนน");

    const attrData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...ATTR_COLS]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        ATTR_COLS.forEach(c => {
            const el = document.getElementById(`at_${std.id}_${c}`);
            row.push(el ? (el.value==='1'?'ผ':'มผ') : '');
        });
        attrData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attrData), "คุณลักษณะ");

    XLSX.writeFile(wb, `ปพ5_แนะแนว_ม.${globalSelectedClass.grade}-${globalSelectedClass.room}.xlsx`);
}

async function importExcelAll(event) {
    const file = event.target.files[0];
    if(!file) return;
    Swal.fire({ title: 'กำลังดึงข้อมูลจาก Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});

            if(workbook.Sheets["เวลาเรียน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["เวลาเรียน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        for(let w=1; w<=20; w++) {
                            const el = document.getElementById(`att_${std.id}_w${w}`);
                            if(el && row[`ส.${w}`]) { el.value = row[`ส.${w}`]; selectColor(el); }
                        }
                        calcAttTotal(std.id);
                    }
                });
            }

            if(workbook.Sheets["คะแนน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คะแนน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        SCORE_COLS.forEach(c => {
                            const el = document.getElementById(`sc_${std.id}_${c}`);
                            if(el && row[c] !== undefined) el.value = row[c];
                        });
                        calcScoreTotal(std.id);
                    }
                });
            }

            if(workbook.Sheets["คุณลักษณะ"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คุณลักษณะ"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        ATTR_COLS.forEach(c => {
                            const el = document.getElementById(`at_${std.id}_${c}`);
                            if(el && row[c] !== undefined) { el.value = (row[c] === 'ผ' || row[c] == 1) ? '1' : '0'; selectColor(el); }
                        });
                        calcAttTotal(std.id);
                    }
                });
            }

            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', text: 'ข้อมูลอยู่บนหน้าจอแล้ว กรุณากด "บันทึกข้อมูล" เพื่อเก็บลงฐานข้อมูล' });
        } catch(err) {
            Swal.fire('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง หรือหาชีตข้อมูลไม่พบ', 'error');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}
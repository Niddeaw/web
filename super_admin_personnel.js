// ==========================================
// super_admin_personnel.js
// จัดการบุคลากร, สิทธิ์แอดมินระบบย่อย, หัวหน้ากลุ่มสาระ, หัวหน้าระดับชั้น, หัวหน้างานปกครอง
// ==========================================

// รายชื่อกลุ่มสาระสำหรับตั้งหัวหน้ากลุ่มสาระ
const DEPARTMENTS = [
    { id: 'dept_thai', name: 'ภาษาไทย' },
    { id: 'dept_math', name: 'คณิตศาสตร์' },
    { id: 'dept_sci', name: 'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)' },
    { id: 'dept_tech', name: 'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)' },
    { id: 'dept_soc', name: 'สังคมศึกษา ศาสนา และวัฒนธรรม' },
    { id: 'dept_health', name: 'สุขศึกษาและพลศึกษา' },
    { id: 'dept_art', name: 'ศิลปะ' },
    { id: 'dept_career', name: 'การงานอาชีพ' },
    { id: 'dept_lang', name: 'ภาษาต่างประเทศ (ภาษาอังกฤษ)' },
    { id: 'dept_chinese', name: 'ภาษาต่างประเทศ (ภาษาจีน)' },
    { id: 'dept_guidance', name: 'แนะแนว' }
];

// ==========================================
// จัดการบุคลากร (Personnel)
// ==========================================
async function loadPersonnel() {
    try {
        if ($.fn.DataTable.isDataTable('#personnelTable')) $('#personnelTable').DataTable().destroy();

        const { data, error } = await db.from('core_personnel').select('*').order('first_name');
        const tbody = document.getElementById('tb-personnel');

        if (error) throw error;

        globalPersonnelList = data || [];

        if (data && data.length > 0) {
            tbody.innerHTML = data.map((p, index) => {
                let roleBadge = '';
                if (p.role === 'super_admin') roleBadge = '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-purple-100 text-purple-700 border border-purple-200">Super Admin</span>';
                else if (p.role === 'admin') roleBadge = '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-blue-100 text-blue-700 border border-blue-200">Admin</span>';
                else roleBadge = '<span class="px-2 py-1 text-[11px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200">Teacher</span>';

                return `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-4 text-center text-gray-500">${index + 1}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-gray-800">${p.prefix || ''}${p.first_name} ${p.last_name}</div>
                        <div class="text-[11px] text-gray-500 mt-0.5">เลข ปชช: ${p.national_id || '-'}</div>
                    </td>
                    <td class="py-3 px-4">
                        <div class="text-gray-700 font-medium">${p.position || '-'}</div>
                        <div class="text-[11px] text-gray-500 mt-0.5">${p.academic_standing || 'ไม่มีวิทยฐานะ'}</div>
                    </td>
                    <td class="py-3 px-4 text-blue-800 font-medium">${p.department || '-'}</td>
                    <td class="py-3 px-4 text-gray-600 font-medium">${p.email}</td>
                    <td class="py-3 px-4 text-center">${roleBadge}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="manageModuleAdmins('${p.id}', '${p.first_name} ${p.last_name}')" class="text-emerald-600 hover:text-emerald-800 text-sm font-bold px-2 py-1 rounded hover:bg-emerald-100 transition-colors" title="แต่งตั้งแอดมินระบบย่อย"><i class="fa-solid fa-user-shield"></i></button>
                        <button onclick="resetTeacherPassword('${p.id}', '${p.first_name} ${p.last_name}')" class="text-orange-500 hover:text-orange-700 text-sm font-bold px-2 py-1 rounded hover:bg-orange-100 transition-colors" title="รีเซ็ตรหัสผ่าน"><i class="fa-solid fa-key"></i></button>
                        <button onclick="editPersonnel('${p.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-bold px-2 py-1 rounded hover:bg-blue-100 transition-colors"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                        <button onclick="deletePersonnel('${p.id}', '${p.first_name} ${p.last_name}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 py-1 ml-1 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                    </td>
                </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '';
        }

        $('#personnelTable').DataTable({
            scrollX: true,
            responsive: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 10,
            lengthMenu: [[10, 20, 50, -1], [10, 20, 50, "ทั้งหมด"]],
            order: [],
            columnDefs: [{ orderable: false, targets: -1 },{ responsivePriority: 1, targets: -1 }],
            destroy: true
        });

    } catch (err) {
        console.error(err);
        document.getElementById('tb-personnel').innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
}

function closePersonnelModal() { document.getElementById('personnelModal').classList.add('hidden'); }

async function editPersonnel(id) {
    currentEditPersonnelId = id;
    document.getElementById('modalPersonnelTitle').innerHTML = '<i class="fa-solid fa-user-pen mr-2 text-blue-600"></i>แก้ไขข้อมูลบุคลากร';
    document.getElementById('p_auth_fields').classList.add('hidden');
    document.getElementById('p_email').required = false;
    document.getElementById('p_password').required = false;

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading() });
    const { data, error } = await db.from('core_personnel').select('*').eq('id', id).single();
    Swal.close();

    if (data) {
        document.getElementById('p_national_id').value = data.national_id || '';
        document.getElementById('p_prefix').value = data.prefix || '';
        document.getElementById('p_first_name').value = data.first_name || '';
        document.getElementById('p_last_name').value = data.last_name || '';
        document.getElementById('p_position').value = data.position || '';
        document.getElementById('p_academic').value = data.academic_standing || '';
        document.getElementById('p_department').value = data.department || '';
        document.getElementById('p_role').value = data.role || 'teacher';
        document.getElementById('personnelModal').classList.remove('hidden');
    }
}

async function savePersonnel(e) {
    e.preventDefault();
    const nationalId = document.getElementById('p_national_id').value;
    const prefix = document.getElementById('p_prefix').value;
    const fName = document.getElementById('p_first_name').value;
    const lName = document.getElementById('p_last_name').value;
    const position = document.getElementById('p_position').value;
    const academic = document.getElementById('p_academic').value;
    const department = document.getElementById('p_department').value;
    const role = document.getElementById('p_role').value;

    if (!currentEditPersonnelId) {
        return Swal.fire('ไม่อนุญาต', 'การเพิ่มบุคลากรใหม่ต้องทำผ่านเครื่องมือ Ninja Bypass เท่านั้น', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { error } = await db.from('core_personnel').update({
        national_id: nationalId, prefix: prefix, first_name: fName, last_name: lName,
        position: position, academic_standing: academic, department: department, role: role
    }).eq('id', currentEditPersonnelId);

    if (error) return Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');

    closePersonnelModal();
    await loadPersonnel();
    Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลสำเร็จ!', timer: 1500, showConfirmButton: false });
}

async function deletePersonnel(id, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        html: `คุณต้องการลบคุณครู <b>${name}</b> ใช่หรือไม่?<br><span class="text-sm text-red-500">หมายเหตุ: ข้อมูลทั้งหมดจะถูกลบอย่างถาวร</span>`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูลเลย', cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data, error } = await db.rpc('admin_delete_user', { p_user_id: id });
        if (error || (data && !data.success)) { Swal.fire('ลบข้อมูลไม่สำเร็จ', error?.message || data?.message, 'error'); }
        else { await loadPersonnel(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ!', timer: 1500, showConfirmButton: false }); }
    }
}

async function resetTeacherPassword(teacherId, teacherName) {
    const { value: newPassword } = await Swal.fire({
        title: 'ตั้งรหัสผ่านใหม่',
        html: `คุณกำลังตั้งรหัสผ่านใหม่ให้กับ<br><b class="text-blue-600">${teacherName}</b>`,
        input: 'text',
        inputPlaceholder: 'พิมพ์รหัสผ่านใหม่ที่นี่ (ขั้นต่ำ 6 ตัว)',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: '<i class="fa-solid fa-key mr-1"></i> บันทึกรหัสผ่าน',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value || value.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร!';
        }
    });

    if (newPassword) {
        Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { data, error } = await db.rpc('admin_reset_password', {
                p_user_id: teacherId,
                p_new_password: newPassword
            });
            if (error) throw error;
            Swal.fire('สำเร็จ!', `รีเซ็ตรหัสผ่านให้ ${teacherName} เรียบร้อยแล้ว`, 'success');
        } catch (err) {
            console.error(err);
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

// ==========================================
// สิทธิ์แอดมินระบบย่อย (Module Admins)
// ==========================================
function closeModuleAdminModal() {
    document.getElementById('moduleAdminModal').classList.add('hidden');
}

async function manageModuleAdmins(userId, userName) {
    currentModuleAdminUserId = userId;
    document.getElementById('ma_teacher_name').innerText = userName;
    document.getElementById('moduleAdminModal').classList.remove('hidden');

    Swal.fire({ title: 'กำลังโหลดข้อมูลสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: modules, error: modErr } = await db.from('core_system_modules').select('*').order('module_id');
        if (modErr) throw modErr;

        const { data: userAdmins, error: uaErr } = await db.from('core_module_admins').select('module_id').eq('user_id', userId);
        if (uaErr) throw uaErr;

        const authorizedModules = userAdmins ? userAdmins.map(ua => ua.module_id) : [];

        const container = document.getElementById('ma_modules_list');
        if (modules && modules.length > 0) {
            container.innerHTML = modules.map(mod => {
                const isChecked = authorizedModules.includes(mod.module_id) ? 'checked' : '';
                return `
                <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow transition-shadow">
                    <div>
                        <div class="font-bold text-gray-800 text-base">${mod.module_name}</div>
                        <div class="text-[11px] text-gray-500 font-mono mt-0.5">Module ID: ${mod.module_id}</div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${isChecked} onchange="toggleModuleAdminRole('${mod.module_id}', '${mod.module_name}', this.checked)">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<div class="text-center text-gray-500 p-4">ไม่พบระบบย่อยในฐานข้อมูล (เพิ่มโมดูลใหม่ที่ส่วนกลางก่อน)</div>';
        }
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        closeModuleAdminModal();
    }
}

async function toggleModuleAdminRole(moduleId, moduleName, isGranted) {
    if (!currentModuleAdminUserId) return;

    try {
        if (isGranted) {
            const { error } = await db.from('core_module_admins').insert({
                user_id: currentModuleAdminUserId,
                module_id: moduleId
            });
            if (error) throw error;
            showToast('success', `แต่งตั้งให้เป็นแอดมินระบบ ${moduleName} แล้ว`, 1500);
        } else {
            const { error } = await db.from('core_module_admins')
                .delete()
                .eq('user_id', currentModuleAdminUserId)
                .eq('module_id', moduleId);
            if (error) throw error;
            showToast('warning', `ถอดสิทธิ์แอดมินระบบ ${moduleName} แล้ว`, 1500);
        }
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        manageModuleAdmins(currentModuleAdminUserId, document.getElementById('ma_teacher_name').innerText);
    }
}

// ==========================================
// ตั้งค่าหัวหน้ากลุ่มสาระการเรียนรู้
// ==========================================
async function openDeptHeadModal() {
    const container = document.getElementById('dept_heads_container');
    container.innerHTML = '';

    let optionsHtml = '<option value="">-- ไม่ระบุ / ว่าง --</option>';
    globalPersonnelList.forEach(p => {
        optionsHtml += `<option value="${p.id}">${p.first_name} ${p.last_name} (${p.department || 'ไม่ระบุ'})</option>`;
    });

    DEPARTMENTS.forEach(dept => {
        container.innerHTML += `
      <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
        <label class="block text-sm font-bold text-gray-800 mb-2">
          <i class="fa-solid fa-layer-group text-blue-500 mr-1"></i> ${dept.name}
        </label>
        <select id="${dept.id}" class="select2-dept-head w-full">
          ${optionsHtml}
        </select>
      </div>
    `;
    });

    document.getElementById('deptHeadModal').classList.remove('hidden');
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading() });

    try {
        const { data, error } = await db.from('core_department_heads').select('*');
        if (!error && data) {
            data.forEach(row => {
                const select = document.getElementById(row.department_id);
                if (select) select.value = row.personnel_id;
            });
        }

        document.querySelectorAll('.select2-dept-head').forEach(el => {
            new TomSelect(el, {
                placeholder: 'พิมพ์เพื่อค้นหาชื่อครู...',
                allowEmptyOption: true,
                render: {
                    no_results: function () { return 'ไม่พบครู'; }
                }
            });
        });

        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function closeDeptHeadModal() {
    document.getElementById('deptHeadModal').classList.add('hidden');
    document.querySelectorAll('.select2-dept-head').forEach(el => {
        if (el.tomselect) el.tomselect.destroy();
    });
}

async function saveDeptHeads(e) {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const updates = [];
    DEPARTMENTS.forEach(dept => {
        const selectVal = document.getElementById(dept.id).value;
        if (selectVal) {
            updates.push({
                department_id: dept.id,
                department_name: dept.name,
                personnel_id: selectVal
            });
        }
    });

    try {
        await db.from('core_department_heads').delete().neq('department_id', 'dummy_value');

        if (updates.length > 0) {
            const { error } = await db.from('core_department_heads').insert(updates);
            if (error) throw error;
        }

        closeDeptHeadModal();
        Swal.fire({ icon: 'success', title: 'แต่งตั้งหัวหน้ากลุ่มสาระเรียบร้อย!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// แต่งตั้งหัวหน้าระดับชั้น
// ==========================================
async function openGradeHeadModal() {
    document.getElementById('gradeHeadModal').classList.remove('hidden');
    document.getElementById('gradeHeadModal').classList.add('flex');

    if (!tsGradeModal) {
        const { data: personnel } = await db.from('core_personnel').select('id, prefix, first_name, last_name').order('first_name');
        tsGradeModal = new TomSelect('#modal_select_grade_head_user', {
            options: personnel.map(p => ({ id: p.id, name: `${p.prefix || ''}${p.first_name} ${p.last_name}` })),
            valueField: 'id', labelField: 'name', searchField: 'name', placeholder: '-- ค้นหาชื่อครู --'
        });
    }
    renderGradeHeadsList();
}

function closeGradeHeadModal() {
    document.getElementById('gradeHeadModal').classList.add('hidden');
    document.getElementById('gradeHeadModal').classList.remove('flex');
}

async function renderGradeHeadsList() {
    const { data } = await db.from('behavior_grade_heads').select('id, grade_level, core_personnel(prefix, first_name, last_name)').order('grade_level');
    const tbody = document.getElementById('modal_list_grade_heads');
    tbody.innerHTML = data?.map(h => `
        <tr class="hover:bg-slate-50">
            <td class="p-3 font-black text-purple-700">ม.${h.grade_level}</td>
            <td class="p-3 font-bold text-slate-600">${h.core_personnel?.prefix || ''}${h.core_personnel?.first_name} ${h.core_personnel?.last_name}</td>
            <td class="p-3 text-center">
                <button onclick="removeGradeHead('${h.id}')" class="text-rose-500 hover:bg-rose-100 p-2 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>';
}

async function assignGradeHead() {
    const userId = tsGradeModal.getValue();
    const level = document.getElementById('modal_select_grade_level').value;
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชื่อครู', 'warning');

    const { error } = await db.from('behavior_grade_heads').insert({ teacher_id: userId, grade_level: parseInt(level) });
    if (error) return Swal.fire('ผิดพลาด', 'ระดับชั้นนี้มีหัวหน้าอยู่แล้วครับ', 'error');

    tsGradeModal.clear();
    renderGradeHeadsList();
    Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1000, showConfirmButton: false });
}

async function removeGradeHead(id) {
    if (!confirm('ยืนยันการลบสิทธิ์?')) return;
    await db.from('behavior_grade_heads').delete().eq('id', id);
    renderGradeHeadsList();
}

// ==========================================
// แต่งตั้งหัวหน้างานปกครอง
// ==========================================
async function openDisciplineHeadModal() {
    document.getElementById('disciplineHeadModal').classList.remove('hidden');
    document.getElementById('disciplineHeadModal').classList.add('flex');

    if (!tsDiscModal) {
        const { data: personnel } = await db.from('core_personnel').select('id, prefix, first_name, last_name').order('first_name');
        tsDiscModal = new TomSelect('#modal_select_discipline_head_user', {
            options: personnel.map(p => ({ id: p.id, name: `${p.prefix || ''}${p.first_name} ${p.last_name}` })),
            valueField: 'id', labelField: 'name', searchField: 'name', placeholder: '-- ค้นหาชื่อครู --'
        });
    }
    renderDisciplineHeadsList();
}

function closeDisciplineHeadModal() {
    document.getElementById('disciplineHeadModal').classList.add('hidden');
    document.getElementById('disciplineHeadModal').classList.remove('flex');
}

async function renderDisciplineHeadsList() {
    const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
    const { data } = await db.from('core_discipline_heads')
        .select('id, core_personnel(prefix, first_name, last_name)')
        .eq('academic_year', sInfo?.current_academic_year);

    const tbody = document.getElementById('modal_list_discipline_heads');
    tbody.innerHTML = data?.map(h => `
        <tr class="hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-600">${h.core_personnel?.prefix || ''}${h.core_personnel?.first_name} ${h.core_personnel?.last_name}</td>
            <td class="p-3 text-center">
                <button onclick="removeDisciplineHead('${h.id}')" class="text-rose-500 hover:bg-rose-100 p-2 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="2" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>';
}

async function assignDisciplineHead() {
    const userId = tsDiscModal.getValue();
    const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชื่อครู', 'warning');

    const { error } = await db.from('core_discipline_heads').insert({ personnel_id: userId, academic_year: sInfo.current_academic_year });
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    tsDiscModal.clear();
    renderDisciplineHeadsList();
    Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1000, showConfirmButton: false });
}

async function removeDisciplineHead(id) {
    if (!confirm('ยืนยันการลบสิทธิ์?')) return;
    await db.from('core_discipline_heads').delete().eq('id', id);
    renderDisciplineHeadsList();
}
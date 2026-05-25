// ==========================================
// super_admin_portal.js
// จัดการ Student Portal Modules และ GAS Avatar Upload Settings
// ==========================================

let currentEditStudentModuleId = null;

// ==========================================
// Student Portal Modules
// ==========================================
async function loadStudentModules() {
    const tbody = document.getElementById('student-modules-list');
    if (!tbody) return;
    try {
        const { data, error } = await db.from('student_portal_modules')
            .select('*')
            .order('display_order', { ascending: true });
        if (error) throw error;

        if (data && data.length > 0) {
            tbody.innerHTML = data.map(mod => `
                <tr data-id="${mod.id}" class="hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-2 text-center drag-handle text-gray-400 hover:text-gray-600 cursor-grab">
                        <i class="fa-solid fa-grip-vertical"></i>
                    </td>
                    <td class="py-3 px-4 text-lg text-gray-600"><i class="${mod.icon}"></i></td>
                    <td class="py-3 px-4 font-bold text-gray-700">${mod.title}</td>
                    <td class="py-3 px-4 text-blue-600 underline truncate max-w-[200px]">${mod.url}</td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2 py-1 text-xs font-bold rounded-full ${mod.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${mod.is_active ? 'เปิด' : 'ปิด'}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editStudentModule('${mod.id}')" class="text-blue-600 hover:text-blue-800 font-bold px-2"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="deleteStudentModule('${mod.id}')" class="text-red-600 hover:text-red-800 font-bold px-2"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');

            new Sortable(tbody, {
                handle: '.drag-handle',
                animation: 150,
                onEnd: async function (evt) {
                    const rows = evt.from.querySelectorAll('tr');
                    const updates = [];
                    rows.forEach((row, index) => {
                        const id = row.getAttribute('data-id');
                        if (id) updates.push({ id: id, display_order: index + 1 });
                    });
                    for (let u of updates) {
                        await db.from('student_portal_modules').update({ display_order: u.display_order }).eq('id', u.id);
                    }
                    loadStudentModules();
                }
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">ยังไม่มีระบบสำหรับนักเรียน</td></tr>';
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Error: ${err.message}</td></tr>`;
    }
}

function clearStudentModuleForm() {
    document.getElementById('studentModuleForm').reset();
    document.getElementById('sm_id').value = '';
    document.getElementById('sm_icon_bg').value = '#3b82f6';
    document.getElementById('sm_icon_bg_text').value = '#3b82f6';
    document.getElementById('sm_icon_text').value = '#ffffff';
    document.getElementById('sm_icon_text_text').value = '#ffffff';
    currentEditStudentModuleId = null;
}

async function editStudentModule(id) {
    try {
        const { data, error } = await db.from('student_portal_modules').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('sm_id').value = data.id;
        document.getElementById('sm_module_key').value = data.module_key;
        document.getElementById('sm_title').value = data.title;
        document.getElementById('sm_description').value = data.description || '';
        document.getElementById('sm_icon').value = data.icon;
        document.getElementById('sm_icon_bg').value = data.icon_bg_color || '#3b82f6';
        document.getElementById('sm_icon_bg_text').value = data.icon_bg_color || '#3b82f6';
        document.getElementById('sm_icon_text').value = data.icon_text_color || '#ffffff';
        document.getElementById('sm_icon_text_text').value = data.icon_text_color || '#ffffff';
        document.getElementById('sm_url').value = data.url;
        document.getElementById('sm_is_active').checked = data.is_active;
        document.getElementById('sm_target_blank').checked = data.target_blank || false;
        document.getElementById('sm_display_order').value = data.display_order || 0;
        currentEditStudentModuleId = id;
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function saveStudentModule(e) {
    e.preventDefault();
    const formData = {
        module_key: document.getElementById('sm_module_key').value.trim(),
        title: document.getElementById('sm_title').value.trim(),
        description: document.getElementById('sm_description').value.trim(),
        icon: document.getElementById('sm_icon').value.trim(),
        icon_bg_color: document.getElementById('sm_icon_bg_text').value.trim() || '#3b82f6',
        icon_text_color: document.getElementById('sm_icon_text_text').value.trim() || '#ffffff',
        url: document.getElementById('sm_url').value.trim(),
        is_active: document.getElementById('sm_is_active').checked,
        target_blank: document.getElementById('sm_target_blank').checked,
        display_order: parseInt(document.getElementById('sm_display_order').value) || 0
    };
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (currentEditStudentModuleId) {
            const { error } = await db.from('student_portal_modules').update(formData).eq('id', currentEditStudentModuleId);
            if (error) throw error;
        } else {
            const { error } = await db.from('student_portal_modules').insert([formData]);
            if (error) throw error;
        }
        clearStudentModuleForm();
        loadStudentModules();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function deleteStudentModule(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ระบบนี้จะหายไปจากหน้าของนักเรียนทันที',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบ'
    });
    if (isConfirmed) {
        const { error } = await db.from('student_portal_modules').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { loadStudentModules(); Swal.fire('ลบสำเร็จ', '', 'success'); }
    }
}

// ==========================================
// GAS Avatar Upload Settings
// ==========================================
async function loadGasAvatarSettings() {
    const { data, error } = await db.from('core_school_info').select('id, gas_avatar_api_url, gas_avatar_folder_id').single();
    if (error || !data) return;
    _schoolInfoId = data.id;
    if (data.gas_avatar_api_url) document.getElementById('inp_gas_avatar_url').value = data.gas_avatar_api_url;
    if (data.gas_avatar_folder_id) document.getElementById('inp_gas_avatar_folder').value = data.gas_avatar_folder_id;
}

async function saveGasAvatarSettings() {
    const apiUrl = document.getElementById('inp_gas_avatar_url').value.trim();
    const folderId = document.getElementById('inp_gas_avatar_folder').value.trim();
    const status = document.getElementById('gas-save-status');
    if (!apiUrl) return Swal.fire('แจ้งเตือน', 'กรุณากรอก GAS URL', 'warning');
    if (!_schoolInfoId) await loadGasAvatarSettings();
    if (!_schoolInfoId) return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลโรงเรียนใน core_school_info', 'error');

    const { error } = await db.from('core_school_info').update({ gas_avatar_api_url: apiUrl, gas_avatar_folder_id: folderId || null }).eq('id', _schoolInfoId);
    if (error) return Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    status.textContent = '✅ บันทึกแล้ว';
    status.classList.remove('hidden', 'text-red-500');
    status.classList.add('text-green-600');
    setTimeout(() => status.classList.add('hidden'), 3000);
}

// Sync color inputs สำหรับ Student Module
document.addEventListener('DOMContentLoaded', () => {
    const smBgColor = document.getElementById('sm_icon_bg');
    const smBgText = document.getElementById('sm_icon_bg_text');
    const smTextColor = document.getElementById('sm_icon_text');
    const smTextText = document.getElementById('sm_icon_text_text');
    if (smBgColor && smBgText) {
        smBgColor.addEventListener('input', () => { smBgText.value = smBgColor.value; });
        smBgText.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(smBgText.value)) smBgColor.value = smBgText.value; });
    }
    if (smTextColor && smTextText) {
        smTextColor.addEventListener('input', () => { smTextText.value = smTextColor.value; });
        smTextText.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(smTextText.value)) smTextColor.value = smTextText.value; });
    }
});
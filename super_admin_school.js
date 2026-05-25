// ==========================================
// super_admin_school.js
// จัดการข้อมูลโรงเรียน และระบบย่อย (Micro-services)
// ==========================================

// ข้อมูลเริ่มต้นของระบบย่อย (Master)
const MASTER_MODULES = [
    { module_id: 'attendance', title: 'ระบบเช็คชื่อนักเรียน', category: 'academic', icon: 'fa-solid fa-clipboard-user', description: 'เช็คชื่อนักเรียนรายวัน', url: 'attendance.html', display_order: 1, is_active: true, icon_bg_color: '#3b82f6', icon_text_color: '#ffffff' },
    { module_id: 'behavior', title: 'ระบบคะแนนความประพฤติ', category: 'academic', icon: 'fa-solid fa-star', description: 'บันทึกคะแนนความประพฤติ', url: 'behavior_teacher.html', display_order: 2, is_active: true, icon_bg_color: '#ef4444', icon_text_color: '#ffffff' },
    { module_id: 'eq', title: 'ระบบประเมิน EQ', category: 'academic', icon: 'fa-solid fa-brain', description: 'แบบประเมินความฉลาดทางอารมณ์', url: 'eq_admin.html', display_order: 3, is_active: true, icon_bg_color: '#ec4899', icon_text_color: '#ffffff' },
    { module_id: 'guidance', title: 'ระบบ ปพ.5 - แนะแนว', category: 'academic', icon: 'fa-solid fa-compass', description: 'บันทึกกิจกรรมแนะแนว ปพ.5', url: 'guidance_teacher.html', display_order: 4, is_active: true, icon_bg_color: '#10b981', icon_text_color: '#ffffff' },
    { module_id: 'homevisit', title: 'ระบบเยี่ยมบ้านนักเรียน', category: 'academic', icon: 'fa-solid fa-house-chimney', description: 'บันทึกข้อมูลการเยี่ยมบ้าน', url: 'homevisit.html', display_order: 5, is_active: true, icon_bg_color: '#14b8a6', icon_text_color: '#ffffff' },
    { module_id: 'personnel', title: 'ระบบบริหารจัดการบุคลากร', category: 'personnel', icon: 'fa-solid fa-id-card', description: 'ข้อมูลครูและบุคลากร', url: 'personnel.html', display_order: 1, is_active: true, icon_bg_color: '#8b5cf6', icon_text_color: '#ffffff' },
    { module_id: 'leave', title: 'ระบบการลา', category: 'personnel', icon: 'fa-solid fa-envelope-open-text', description: 'ระบบลาสำหรับครู', url: 'leave_teacher.html', display_order: 2, is_active: true, icon_bg_color: '#f43f5e', icon_text_color: '#ffffff' },
    { module_id: 'scholarship', title: 'ระบบทุนการศึกษา', category: 'budget', icon: 'fa-solid fa-hand-holding-heart', description: 'จัดการทุนการศึกษา', url: 'scholarship.html', display_order: 1, is_active: true, icon_bg_color: '#eab308', icon_text_color: '#ffffff' },
    { module_id: 'sdq', title: 'ระบบประเมิน SDQ', category: 'general', icon: 'fa-solid fa-clipboard-list', description: 'แบบประเมิน SDQ', url: 'sdq_admin.html', display_order: 1, is_active: true, icon_bg_color: '#6366f1', icon_text_color: '#ffffff' },
];

// ==========================================
// ข้อมูลโรงเรียน
// ==========================================
async function loadSchoolInfo() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await db.from('core_school_info').select('*').eq('id', 1).single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
            document.getElementById('inp_current_year').value = data.current_academic_year || (new Date().getFullYear() + 543).toString();
            document.getElementById('inp_current_term').value = data.current_semester || '1';
            document.getElementById('inp_term_start_date').value = data.term_start_date || '';
            document.getElementById('inp_school').value = data.school_name || '';
            document.getElementById('inp_dir').value = data.director_name || '';
            document.getElementById('inp_dep_acad').value = data.deputy_academic || '';
            document.getElementById('inp_dep_budg').value = data.deputy_budget || '';
            document.getElementById('inp_dep_hr').value = data.deputy_hr || '';
            document.getElementById('inp_dep_gen').value = data.deputy_general || '';
        }
        Swal.close();
    } catch (err) { console.error(err); Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function saveSchoolInfo(e) {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const updates = {
        current_academic_year: document.getElementById('inp_current_year').value.trim(),
        current_semester: document.getElementById('inp_current_term').value,
        term_start_date: document.getElementById('inp_term_start_date').value || null,
        school_name: document.getElementById('inp_school').value.trim(),
        director_name: document.getElementById('inp_dir').value.trim(),
        deputy_academic: document.getElementById('inp_dep_acad').value.trim(),
        deputy_budget: document.getElementById('inp_dep_budg').value.trim(),
        deputy_hr: document.getElementById('inp_dep_hr').value.trim(),
        deputy_general: document.getElementById('inp_dep_gen').value.trim(),
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await db.from('core_school_info').update(updates).eq('id', 1);
        if (error) throw error;
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: 'อัปเดตข้อมูลโรงเรียนเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

// ==========================================
// จัดการระบบย่อย (Micro-services)
// ==========================================
async function loadMicroServices() {
    const tbody = document.getElementById('micro-modules-list');
    try {
        // Seed
        const { data: existing, error: fetchErr } = await db.from('core_system_modules').select('module_id');
        if (fetchErr) throw fetchErr;
        const existingIds = new Set((existing || []).map(m => m.module_id));
        const missing = MASTER_MODULES.filter(m => !existingIds.has(m.module_id));
        if (missing.length > 0) {
            const { error: seedErr } = await db.from('core_system_modules').upsert(
                missing.map(m => ({
                    module_id: m.module_id,
                    module_name: m.title,
                    description: m.description,
                    icon: m.icon,
                    url: m.url,
                    category: m.category,
                    display_order: m.display_order,
                    is_active: m.is_active,
                    icon_bg_color: m.icon_bg_color,
                    icon_text_color: m.icon_text_color,
                    updated_at: new Date().toISOString()
                })),
                { onConflict: 'module_id' }
            );
            if (seedErr) console.warn('Seed warning:', seedErr.message);
        }

        // Load all
        const { data, error } = await db.from('core_system_modules').select('*').order('display_order', { ascending: true });
        if (error) throw error;

        const categoryMap = {
            academic: 'กลุ่มบริหารวิชาการ',
            budget: 'กลุ่มบริหารงบประมาณ',
            personnel: 'กลุ่มบริหารงานบุคคล',
            general: 'กลุ่มบริหารทั่วไป'
        };

        if (data && data.length > 0) {
            tbody.innerHTML = data.map(mod => `
                <tr data-module-id="${mod.module_id}" class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-2 text-center drag-handle text-gray-400 hover:text-gray-600">
                        <i class="fa-solid fa-grip-vertical"></i>
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div style="background-color:${mod.icon_bg_color || '#e2e8f0'}; color:${mod.icon_text_color || '#475569'};" class="w-10 h-10 rounded-full flex items-center justify-center mx-auto">
                            <i class="${mod.icon || 'fa-solid fa-gear'} text-lg"></i>
                        </div>
                    </td>
                    <td class="py-3 px-4 font-bold text-gray-700">${mod.module_name}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-1 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700">
                            ${categoryMap[mod.category] || mod.category}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-gray-500 text-sm">${mod.description || '-'}</td>
                    <td class="py-3 px-4 text-center">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer" ${mod.is_active ? 'checked' : ''} onchange="toggleMicroService('${mod.module_id}', this.checked)">
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editMicroService('${mod.module_id}')" class="text-blue-600 hover:text-blue-800 font-bold px-2"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="deleteMicroService('${mod.module_id}')" class="text-red-600 hover:text-red-800 font-bold px-2"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');

            // Make sortable
            new Sortable(tbody, {
                handle: '.drag-handle',
                animation: 150,
                onEnd: async function (evt) {
                    const rows = evt.from.querySelectorAll('tr');
                    const updates = [];
                    rows.forEach((row, index) => {
                        const moduleId = row.getAttribute('data-module-id');
                        if (moduleId) updates.push({ module_id: moduleId, display_order: index + 1 });
                    });
                    showToast('info', 'กำลังบันทึกลำดับ...');
                    for (let u of updates) {
                        await db.from('core_system_modules').update({ display_order: u.display_order }).eq('module_id', u.module_id);
                    }
                    showToast('success', 'บันทึกลำดับสำเร็จ!');
                    loadMicroServices();
                }
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">ไม่พบรายการระบบย่อย</td></tr>';
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${err.message}</td></tr>`;
    }
}

async function toggleMicroService(moduleId, isChecked) {
    try {
        const { error } = await db.from('core_system_modules').update({ is_active: isChecked, updated_at: new Date().toISOString() }).eq('module_id', moduleId);
        if (error) throw error;
        showToast(isChecked ? 'success' : 'warning', isChecked ? 'เปิดใช้งานระบบแล้ว' : 'ปิดระบบชั่วคราว');
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        loadMicroServices();
    }
}

function clearMicroServiceForm() {
    document.getElementById('microServiceForm').reset();
    document.getElementById('ms_id').value = '';
    document.getElementById('ms_module_key').disabled = false;
    document.getElementById('ms_icon_bg').value = '#3b82f6';
    document.getElementById('ms_icon_bg_text').value = '#3b82f6';
    document.getElementById('ms_icon_text').value = '#ffffff';
    document.getElementById('ms_icon_text_text').value = '#ffffff';
    document.getElementById('ms_target_blank').checked = false;
    currentEditServiceId = null;
}

async function editMicroService(moduleId) {
    try {
        const { data, error } = await db.from('core_system_modules').select('*').eq('module_id', moduleId).single();
        if (error) throw error;
        document.getElementById('ms_id').value = data.id;
        document.getElementById('ms_module_key').value = data.module_id;
        document.getElementById('ms_module_key').disabled = true;
        document.getElementById('ms_title').value = data.module_name;
        document.getElementById('ms_description').value = data.description || '';
        document.getElementById('ms_category').value = data.category || 'academic';
        document.getElementById('ms_icon').value = data.icon || '';
        document.getElementById('ms_icon_bg').value = data.icon_bg_color || '#3b82f6';
        document.getElementById('ms_icon_bg_text').value = data.icon_bg_color || '#3b82f6';
        document.getElementById('ms_icon_text').value = data.icon_text_color || '#ffffff';
        document.getElementById('ms_icon_text_text').value = data.icon_text_color || '#ffffff';
        document.getElementById('ms_url').value = data.url || '';
        document.getElementById('ms_display_order').value = data.display_order || 0;
        document.getElementById('ms_is_active').checked = data.is_active;
        document.getElementById('ms_target_blank').checked = data.target_blank || false;
        currentEditServiceId = moduleId;
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function saveMicroService(e) {
    e.preventDefault();
    const formData = {
        module_id: document.getElementById('ms_module_key').value.trim(),
        module_name: document.getElementById('ms_title').value.trim(),
        description: document.getElementById('ms_description').value.trim(),
        category: document.getElementById('ms_category').value,
        icon: document.getElementById('ms_icon').value.trim(),
        icon_bg_color: document.getElementById('ms_icon_bg_text').value.trim() || '#3b82f6',
        icon_text_color: document.getElementById('ms_icon_text_text').value.trim() || '#ffffff',
        url: document.getElementById('ms_url').value.trim(),
        display_order: parseInt(document.getElementById('ms_display_order').value) || 0,
        is_active: document.getElementById('ms_is_active').checked,
        target_blank: document.getElementById('ms_target_blank').checked,
        updated_at: new Date().toISOString()
    };
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (currentEditServiceId) {
            const { error } = await db.from('core_system_modules').update(formData).eq('module_id', currentEditServiceId);
            if (error) throw error;
        } else {
            const { data: check } = await db.from('core_system_modules').select('module_id').eq('module_id', formData.module_id).maybeSingle();
            if (check) throw new Error('Module Key นี้มีอยู่แล้ว');
            const { error } = await db.from('core_system_modules').insert([formData]);
            if (error) throw error;
        }
        clearMicroServiceForm();
        loadMicroServices();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function deleteMicroService(moduleId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        html: `ต้องการลบระบบ <b>${moduleId}</b> ออกจากฐานข้อมูลใช่หรือไม่?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบเลย'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_system_modules').delete().eq('module_id', moduleId);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { loadMicroServices(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
    }
}

// Sync color inputs สำหรับ Micro-service form
document.addEventListener('DOMContentLoaded', () => {
    const msBgColor = document.getElementById('ms_icon_bg');
    const msBgText = document.getElementById('ms_icon_bg_text');
    const msTextColor = document.getElementById('ms_icon_text');
    const msTextText = document.getElementById('ms_icon_text_text');
    if (msBgColor && msBgText) {
        msBgColor.addEventListener('input', () => { msBgText.value = msBgColor.value; });
        msBgText.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(msBgText.value)) msBgColor.value = msBgText.value; });
    }
    if (msTextColor && msTextText) {
        msTextColor.addEventListener('input', () => { msTextText.value = msTextColor.value; });
        msTextText.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(msTextText.value)) msTextColor.value = msTextText.value; });
    }
});
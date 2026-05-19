// ==========================================
// ไฟล์ super_admin.js (จัดการข้อมูลส่วนกลาง)
// ==========================================

let globalPersonnelList = [];
let currentEditClassId = null;
let currentModuleAdminUserId = null;
let currentEditServiceId = null; // สำหรับฟอร์ม Micro-services
let currentEditPersonnelId = null; // 👈 เพิ่มบรรทัดนี้

window.onload = async () => {
    await checkAuth();
    await updateUnassignedBadge();
};

// ==========================================
// ระบบตรวจสอบสิทธิ์
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        const { data: profile } = await db.from('core_personnel').select('role, first_name, last_name').eq('id', session.user.id).single();
        if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
            window.location.replace('index.html');
            return;
        }
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        await loadSchoolInfo();
        await loadMicroServices(); // เปลี่ยนจาก loadSystemModules
        await loadPersonnel();
    } else {
        window.location.replace('index.html');
    }
}

function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
        .then(async (result) => {
            if (result.isConfirmed) {
                await db.auth.signOut();
                window.location.replace('index.html');
            }
        });
}

// ==========================================
// Helper: แสดง Toast notification
// ==========================================
function showToast(icon, title, timer = 2000) {
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer }).fire({ icon, title });
}

// ==========================================
// 1. ระบบจัดการเมนู
// ==========================================
function switchMenu(menuId) {
    document.getElementById('menu-school').classList.add('hidden');
    document.getElementById('menu-personnel').classList.add('hidden');
    document.getElementById('menu-students').classList.add('hidden');
    document.getElementById('menu-student-portal').classList.add('hidden');

    const btns = ['btn-menu-school', 'btn-menu-personnel', 'btn-menu-students', 'btn-menu-student-portal'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:bg-gray-800 font-medium transition-all";
    });

    document.getElementById(menuId).classList.remove('hidden');
    const activeBtn = document.getElementById('btn-' + menuId);
    if (activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold transition-all";

    const titles = {
        'menu-school': '<i class="fa-solid fa-gear text-gray-500 mr-2"></i>ข้อมูลโรงเรียนและการตั้งค่าระบบ',
        'menu-personnel': '<i class="fa-solid fa-address-book text-gray-500 mr-2"></i>จัดการบุคลากรและข้าราชการครู',
        'menu-students': '<i class="fa-solid fa-users-rectangle text-gray-500 mr-2"></i>จัดการห้องเรียนและรายชื่อนักเรียน',
        'menu-student-portal': '<i class="fa-solid fa-graduation-cap text-gray-500 mr-2"></i>ตั้งค่าระบบสำหรับนักเรียน (Student Portal)'
    };
    document.getElementById('pageTitle').innerHTML = titles[menuId];

    // 🌟 เรียกโหลดข้อมูลตามเมนูที่กด
    if (menuId === 'menu-school') {
        loadSchoolInfo();
        loadMicroServices();
    }
    if (menuId === 'menu-students') loadClassrooms();
    if (menuId === 'menu-student-portal') loadStudentModules();
}

// ==========================================
// 2. ข้อมูลโรงเรียน
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
// 3. จัดการระบบย่อย (Micro-services) แบบเต็ม + ลากวาง
// ==========================================
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

async function loadMicroServices() {
    const tbody = document.getElementById('micro-modules-list');
    try {
        // 1. Seed
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

        // 2. Load all
        // 🌟 โค้ดใหม่: ให้เรียงตามลำดับที่เราลากวางเพียงอย่างเดียว
        const { data, error } = await db.from('core_system_modules').select('*')
            .order('display_order', { ascending: true });
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

                    // แจ้งเตือนว่ากำลังบันทึก
                    showToast('info', 'กำลังบันทึกลำดับ...');

                    for (let u of updates) {
                        await db.from('core_system_modules').update({ display_order: u.display_order }).eq('module_id', u.module_id);
                    }

                    showToast('success', 'บันทึกลำดับสำเร็จ!');

                    loadMicroServices(); // refresh
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
    document.getElementById('ms_target_blank').checked = false; // 🌟 เคลียร์ค่า Checkbox ให้เป็น false
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
        document.getElementById('ms_target_blank').checked = data.target_blank || false; // 🌟 ดึงค่ามาแสดง
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
        target_blank: document.getElementById('ms_target_blank').checked, // 🌟 ส่งค่าไปบันทึกลง Database
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

// Sync color inputs สำหรับ Micro-service form และ Student module form
// (รวมไว้ใน DOMContentLoaded เดียวที่ท้ายไฟล์)

// ==========================================
// 4. ระบบจัดการบุคลากร (Personnel)
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

        // 🌟 เปลี่ยนจาก responsive เป็น scrollX เพื่อให้ตารางเลื่อนซ้าย-ขวาได้ และไม่ซ่อนปุ่มจัดการ
        $('#personnelTable').DataTable({
            scrollX: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 10,
            lengthMenu: [[10, 20, 50, -1], [10, 20, 50, "ทั้งหมด"]],
            order: [],
            columnDefs: [{ orderable: false, targets: -1 }],
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
            // ✅ ไม่แสดงรหัสผ่านอีกต่อไป
            Swal.fire('สำเร็จ!', `รีเซ็ตรหัสผ่านให้ ${teacherName} เรียบร้อยแล้ว`, 'success');
        } catch (err) {
            console.error(err);
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

// ==========================================
// 5. ระบบจัดการห้องเรียน (Classrooms)
// ==========================================
async function loadClassrooms() {
    try {
        if ($.fn.DataTable.isDataTable('#classroomsTable')) $('#classroomsTable').DataTable().destroy();

        // 🌟 1. ดึงข้อมูลปีการศึกษาและภาคเรียนปัจจุบันจากระบบส่วนกลาง
        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        const currentYear = schoolInfo ? schoolInfo.current_academic_year : '';
        const currentTerm = schoolInfo ? schoolInfo.current_semester : '';

        // 🌟 2. กรองข้อมูลให้แสดงเฉพาะเทอมปัจจุบัน
        let query = db.from('core_classrooms')
            .select(`*, adv1:core_personnel!adviser_id_1(first_name, last_name), adv2:core_personnel!adviser_id_2(first_name, last_name)`)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });

        if (currentYear) query = query.eq('academic_year', currentYear);
        if (currentTerm) query = query.eq('semester', currentTerm);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('tb-classrooms');
        const select = document.getElementById('filterStudentClass');
        select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';

        if (data && data.length > 0) {
            tbody.innerHTML = data.map(cls => {
                const adv1 = cls.adv1 ? `${cls.adv1.first_name} ${cls.adv1.last_name}` : '<span class="text-red-500 text-sm">ยังไม่ระบุ</span>';
                const adv2 = cls.adv2 ? `${cls.adv2.first_name} ${cls.adv2.last_name}` : '<span class="text-gray-400 italic">-</span>';

                select.innerHTML += `<option value="${cls.id}">ม.${cls.grade_level}/${cls.room_number} (เทอม ${cls.semester}/${cls.academic_year})</option>`;

                return `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-4 text-center font-bold text-gray-700">${cls.semester}/${cls.academic_year}</td>
                    <td class="py-3 px-4 text-center font-bold text-blue-700">ม.${cls.grade_level}/${cls.room_number}</td>
                    <td class="py-3 px-4 text-gray-600">${cls.study_plan || '-'}</td>
                    <td class="py-3 px-4 text-gray-700 font-medium">${adv1}</td>
                    <td class="py-3 px-4 text-gray-600 text-sm">${adv2}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editClassroom('${cls.id}', '${cls.academic_year}', '${cls.semester}', '${cls.grade_level}', '${cls.room_number}', '${cls.study_plan || ''}', '${cls.adviser_id_1 || ''}', '${cls.adviser_id_2 || ''}')" class="text-yellow-600 hover:text-yellow-800 text-sm font-bold px-2 rounded hover:bg-yellow-100 transition-colors"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                        <button onclick="deleteClassroom('${cls.id}', 'ม.${cls.grade_level}/${cls.room_number}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 ml-1 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                    </td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">ไม่พบข้อมูลห้องเรียนในภาคเรียนปัจจุบัน</td></tr>';
        }

        $('#classroomsTable').DataTable({
            scrollX: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 10,
            destroy: true
        });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

// เพิ่มฟังก์ชันโหลดรายชื่อครูกรณีจำเป็น
async function ensurePersonnelListLoaded() {
    if (globalPersonnelList.length === 0) {
        const { data, error } = await db.from('core_personnel')
            .select('id, first_name, last_name, department')
            .order('first_name');
        if (error) throw error;
        globalPersonnelList = data || [];
    }
}

// ==========================================
// ส่วนของการเปิด Modal สร้างห้องเรียนใหม่
// ==========================================
// ==========================================
// 🌟 Tom Select สำหรับ Modal ห้องเรียน
// ==========================================
function initAdviserSelect2() {
    const adv1 = document.getElementById('c_adv1');
    const adv2 = document.getElementById('c_adv2');
    // ลบ instance เดิมถ้ามี
    if (adv1.tomselect) adv1.tomselect.destroy();
    if (adv2.tomselect) adv2.tomselect.destroy();

    new TomSelect(adv1, {
        placeholder: '-- พิมพ์เพื่อค้นหาชื่อครู --',
        allowEmptyOption: true,
        render: {
            no_results: function () { return '<div class="no-results">ไม่พบครู</div>'; }
        }
    });
    new TomSelect(adv2, {
        placeholder: '-- พิมพ์เพื่อค้นหาชื่อครู --',
        allowEmptyOption: true,
        render: {
            no_results: function () { return '<div class="no-results">ไม่พบครู</div>'; }
        }
    });
}

// เปิด Modal เพิ่มห้องเรียนใหม่
async function openClassModal() {
    currentEditClassId = null;
    document.getElementById('classForm').reset();
    document.getElementById('modalClassTitle').innerHTML = 'เพิ่มห้องเรียนใหม่';

    try {
        Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading() });
        await ensurePersonnelListLoaded();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดรายชื่อครูได้', 'error');
        return;
    }

    // สร้าง options สำหรับ select
    const adv1El = document.getElementById('c_adv1');
    const adv2El = document.getElementById('c_adv2');
    let options = '<option value="">-- ไม่ระบุครูที่ปรึกษา --</option>';
    globalPersonnelList.forEach(p => {
        options += `<option value="${p.id}">${p.first_name} ${p.last_name} (${p.department || ''})</option>`;
    });
    adv1El.innerHTML = options;
    adv2El.innerHTML = options;

    document.getElementById('c_year').value = (new Date().getFullYear() + 543).toString();
    document.getElementById('c_term').value = '1';
    document.getElementById('classroomModal').classList.remove('hidden');

    initAdviserSelect2(); // สร้าง Tom Select
    // Clear ค่าเริ่มต้น
    adv1El.tomselect?.clear();
    adv2El.tomselect?.clear();
}

// แก้ไขห้องเรียน
async function editClassroom(id, year, semester, grade, room, plan, adv1, adv2) {
    currentEditClassId = id;
    document.getElementById('modalClassTitle').innerHTML = 'แก้ไขห้องเรียน';

    try {
        Swal.fire({ title: 'กำลังโหลด...', didOpen: () => Swal.showLoading() });
        await ensurePersonnelListLoaded();
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
        return;
    }

    const adv1El = document.getElementById('c_adv1');
    const adv2El = document.getElementById('c_adv2');
    let options = '<option value="">-- ไม่ระบุครูที่ปรึกษา --</option>';
    globalPersonnelList.forEach(p => {
        options += `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`;
    });
    adv1El.innerHTML = options;
    adv2El.innerHTML = options;

    document.getElementById('c_year').value = year;
    document.getElementById('c_term').value = semester || '1';
    document.getElementById('c_grade').value = grade;
    document.getElementById('c_room').value = room;
    document.getElementById('c_plan').value = plan;
    document.getElementById('classroomModal').classList.remove('hidden');

    initAdviserSelect2(); // สร้าง Tom Select พร้อมตัวเลือก
    // ตั้งค่าเดิม
    if (adv1) adv1El.tomselect?.setValue(adv1);
    else adv1El.tomselect?.clear();
    if (adv2) adv2El.tomselect?.setValue(adv2);
    else adv2El.tomselect?.clear();
}

function closeClassModal() {
    document.getElementById('classroomModal').classList.add('hidden');
    const adv1 = document.getElementById('c_adv1');
    const adv2 = document.getElementById('c_adv2');
    if (adv1?.tomselect) adv1.tomselect.destroy();
    if (adv2?.tomselect) adv2.tomselect.destroy();
}

// บันทึกห้องเรียน
async function saveClassroom(e) {
    e.preventDefault();
    const year = document.getElementById('c_year').value.trim();
    const term = document.getElementById('c_term').value;
    const grade = document.getElementById('c_grade').value;
    const room = document.getElementById('c_room').value;
    const plan = document.getElementById('c_plan').value.trim();
    const adv1 = document.getElementById('c_adv1').value || null;
    const adv2 = document.getElementById('c_adv2').value || null;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (!currentEditClassId) {
            const { data: existing } = await db.from('core_classrooms').select('id').eq('academic_year', year).eq('semester', term).eq('grade_level', grade).eq('room_number', room);
            if (existing && existing.length > 0) throw new Error(`ห้อง ม.${grade}/${room} เทอม ${term}/${year} มีอยู่ในระบบแล้ว!`);

            const { error } = await db.from('core_classrooms').insert([{ academic_year: year, semester: term, grade_level: grade, room_number: room, study_plan: plan, adviser_id_1: adv1, adviser_id_2: adv2 }]);
            if (error) throw error;
        } else {
            const { error } = await db.from('core_classrooms').update({
                academic_year: year, semester: term, grade_level: grade, room_number: room, study_plan: plan, adviser_id_1: adv1, adviser_id_2: adv2
            }).eq('id', currentEditClassId);
            if (error) throw error;
        }

        closeClassModal(); await loadClassrooms();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function deleteClassroom(id, name) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบห้องเรียน?', html: `ลบห้อง <b>${name}</b> ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบห้องเรียน' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_classrooms').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { await loadClassrooms(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
    }
}

// ==========================================
// 6. ระบบจัดการนักเรียน (Students & Bulk Actions)
// ==========================================
async function loadStudents() {
    const classId = document.getElementById('filterStudentClass').value;
    const tbody = document.getElementById('tb-students');

    document.getElementById('bulk-action-bar').classList.add('hidden');
    if (document.getElementById('selectAll')) document.getElementById('selectAll').checked = false;

    if (!classId) return;

    Swal.fire({ title: 'กำลังดึงรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if ($.fn.DataTable.isDataTable('#studentsTable')) $('#studentsTable').DataTable().destroy();

        const { data, error } = await db.from('student_enrollments')
            .select(`id, student_number, status, classroom_id, core_students!inner(id, student_id_card, national_id, prefix, first_name, last_name)`)
            .eq('classroom_id', classId)
            .order('student_number', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            tbody.innerHTML = data.map((enr) => {
                let std = enr.core_students;
                let stBadge = enr.status === 'เรียนปกติ' ? '<span class="px-2 py-1 text-[11px] font-bold rounded bg-green-100 text-green-700">เรียนปกติ</span>' : `<span class="px-2 py-1 text-[11px] font-bold rounded bg-red-100 text-red-700">${enr.status}</span>`;
                const safeFname = std.first_name ? std.first_name.replace(/'/g, "\\'") : '';
                const safeLname = std.last_name ? std.last_name.replace(/'/g, "\\'") : '';

                return `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="py-3 px-4 text-center">
                        <input type="checkbox" class="student-chk w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded cursor-pointer focus:ring-blue-500" value="${enr.id}" onchange="updateSelectedCount()">
                    </td>
                    <td class="py-3 px-4 text-center font-bold text-gray-700">${enr.student_number || '-'}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-blue-700">${std.student_id_card || '-'}</div>
                        <div class="text-[11px] text-gray-500">ปชช: ${std.national_id || '-'}</div>
                    </td>
                    <td class="py-3 px-4 text-gray-800 font-medium">${std.prefix || ''}${std.first_name} ${std.last_name}</td>
                    <td class="py-3 px-4 text-center">${stBadge}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editSingleStudent('${enr.id}', '${enr.student_number || ''}', '${std.student_id_card || ''}', '${std.national_id || ''}', '${std.prefix || ''}', '${safeFname}', '${safeLname}', '${enr.status || 'เรียนปกติ'}')" class="text-yellow-600 hover:text-yellow-800 text-sm font-bold px-2 rounded hover:bg-yellow-100"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                        <button onclick="deleteSingleStudent('${enr.id}', '${safeFname}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 ml-1 rounded hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                    </td>
                </tr>`;
            }).join('');
        } else { tbody.innerHTML = ''; }

        // 🌟 เปลี่ยนจาก responsive เป็น scrollX
        $('#studentsTable').DataTable({
            scrollX: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 50,
            lengthMenu: [
                [5, 10, 25, 50, -1],
                [5, 10, 25, 50, "ทั้งหมด"],
            ],
            columnDefs: [{ orderable: false, targets: [0, 5] }],
            destroy: true
        });
        Swal.close();
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

function openAddStudentModal() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนเพิ่มนักเรียน', 'warning');

    document.getElementById('studentDetailForm').reset();
    document.getElementById('s_id').value = '';
    document.getElementById('modalStudentTitle').innerHTML = '<i class="fa-solid fa-user-plus text-green-600 mr-2"></i>เพิ่มนักเรียนใหม่';
    document.getElementById('studentDetailModal').classList.remove('hidden');
}

function editSingleStudent(id, number, student_id, national_id, prefix, fname, lname, status) {
    document.getElementById('s_id').value = id;
    document.getElementById('s_number').value = number;
    document.getElementById('s_student_id').value = student_id;
    document.getElementById('s_national_id').value = national_id;
    document.getElementById('s_prefix').value = prefix;
    document.getElementById('s_fname').value = fname;
    document.getElementById('s_lname').value = lname;
    document.getElementById('s_status').value = status;

    document.getElementById('modalStudentTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-yellow-600 mr-2"></i>แก้ไขข้อมูลนักเรียน';
    document.getElementById('studentDetailModal').classList.remove('hidden');
}

function closeStudentModal() { document.getElementById('studentDetailModal').classList.add('hidden'); }

// ป้องกันการเพิ่มนักเรียนซ้ำในห้องเดียวกัน
async function saveSingleStudent(e) {
    e.preventDefault();
    const classId = document.getElementById('filterStudentClass').value;
    const enrollmentId = document.getElementById('s_id').value;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: stdData, error: stdErr } = await db.from('core_students').upsert({
            student_id_card: document.getElementById('s_student_id').value,
            national_id: document.getElementById('s_national_id').value || null,
            prefix: document.getElementById('s_prefix').value,
            first_name: document.getElementById('s_fname').value,
            last_name: document.getElementById('s_lname').value
        }, { onConflict: 'student_id_card' }).select().single();

        if (stdErr) throw stdErr;

        if (!enrollmentId) {
            // ✅ ตรวจสอบว่านักเรียนคนนี้มีในห้องนี้แล้วหรือไม่
            const { data: existingEnroll } = await db.from('student_enrollments')
                .select('id')
                .eq('student_id', stdData.id)
                .eq('classroom_id', classId)
                .maybeSingle();

            if (existingEnroll) {
                Swal.fire('ข้อมูลซ้ำ', 'นักเรียนคนนี้มีรายชื่อในห้องนี้แล้ว', 'warning');
                return;
            }

            await db.from('student_enrollments').insert({
                student_id: stdData.id,
                classroom_id: classId,
                student_number: document.getElementById('s_number').value || null,
                status: document.getElementById('s_status').value
            });
        } else {
            await db.from('student_enrollments').update({
                student_number: document.getElementById('s_number').value || null,
                status: document.getElementById('s_status').value
            }).eq('id', enrollmentId);
        }

        closeStudentModal();
        await loadStudents();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function deleteSingleStudent(id, fname) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', html: `ต้องการลบข้อมูลการจัดห้องของ <b>${fname}</b> ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูล' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('student_enrollments').delete().eq('id', id);
        if (error) Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        else { await loadStudents(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
    }
}

// ==========================================
// 7. จัดการนักเรียนแบบกลุ่ม (Bulk Actions)
// ==========================================
function toggleSelectAll() {
    const isChecked = document.getElementById('selectAll').checked;
    const checkboxes = document.querySelectorAll('.student-chk');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.student-chk:checked').length;
    document.getElementById('selected-count').innerText = selectedCount;

    if (selectedCount > 0) {
        document.getElementById('bulk-action-bar').classList.remove('hidden');
    } else {
        document.getElementById('bulk-action-bar').classList.add('hidden');
        document.getElementById('selectAll').checked = false;
    }
}

async function bulkMoveStudents() {
    const selectedIds = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return;

    const currentClassId = document.getElementById('filterStudentClass').value;
    const selectObj = document.getElementById('filterStudentClass');
    let optionsHtml = '<select id="targetClassId" class="w-full border border-gray-300 rounded-lg px-4 py-3 mt-4 text-gray-700 outline-none focus:border-indigo-500">';
    optionsHtml += '<option value="">-- กรุณาเลือกระดับชั้น/ห้องปลายทาง --</option>';

    for (let i = 1; i < selectObj.options.length; i++) {
        if (selectObj.options[i].value !== currentClassId && selectObj.options[i].value !== "") {
            optionsHtml += `<option value="${selectObj.options[i].value}">${selectObj.options[i].text}</option>`;
        }
    }
    optionsHtml += '</select>';

    const { isConfirmed, value: targetId } = await Swal.fire({
        title: `ย้ายนักเรียน ${selectedIds.length} คน`,
        html: `<div class="text-left text-sm text-gray-600">เลือกห้องเรียนเป้าหมาย:<br>${optionsHtml}</div>`,
        icon: 'info', showCancelButton: true, confirmButtonColor: '#4f46e5', confirmButtonText: '<i class="fa-solid fa-truck-fast mr-1"></i> ย้ายห้อง', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const val = document.getElementById('targetClassId').value;
            if (!val) Swal.showValidationMessage('กรุณาเลือกห้องปลายทาง');
            return val;
        }
    });

    if (isConfirmed && targetId) {
        Swal.fire({ title: 'กำลังย้ายห้อง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await db.from('student_enrollments').update({ classroom_id: targetId }).in('id', selectedIds);
            if (error) throw error;

            await loadStudents();
            Swal.fire({ icon: 'success', title: 'ย้ายห้องสำเร็จ!', text: `จำนวน ${selectedIds.length} คน`, timer: 2000, showConfirmButton: false });
        } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    }
}

async function bulkDeleteStudents() {
    const selectedIds = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบแบบกลุ่ม?',
        html: `ลบนักเรียน <b>${selectedIds.length}</b> คน ออกจากห้องนี้ใช่หรือไม่?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยันการลบ', cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await db.from('student_enrollments').delete().in('id', selectedIds);
            if (error) throw error;

            await loadStudents();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ!', text: `จำนวน ${selectedIds.length} คน`, timer: 1500, showConfirmButton: false });
        } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    }
}

// ==========================================
// 8. ระบบนำเข้านักเรียนด้วย Excel และ Google Sheet
// ==========================================
function downloadStudentTemplate() {
    const ws_data = [['เลขที่', 'เลขประจำตัวนักเรียน', 'เลขประจำตัวประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'สถานะ']];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อนักเรียน");
    XLSX.writeFile(wb, "ต้นแบบรายชื่อนักเรียน.xlsx");
}

function triggerImportStudents() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนก่อนทำการนำเข้า Excel', 'warning');
    document.getElementById('excelUploadStudents').click();
}

// ==========================================
// ส่งออก Excel รายชื่อนักเรียนทั้งหมด (ภาคเรียนปัจจุบัน)
// ==========================================
async function exportAllStudentsExcel() {
    Swal.fire({
        title: 'กำลังดึงข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. อ่านปีการศึกษาและภาคเรียนจากตั้งค่าส่วนกลาง
        const { data: schoolInfo } = await db.from('core_school_info')
            .select('current_academic_year, current_semester')
            .single();

        const year = schoolInfo?.current_academic_year;
        const term = schoolInfo?.current_semester;

        if (!year) throw new Error('ยังไม่ได้ตั้งค่าปีการศึกษาในระบบ');

        // 2. ดึงข้อมูลนักเรียนที่ลงทะเบียนในปีการศึกษาปัจจุบัน พร้อมห้องเรียน
        let query = db.from('student_enrollments')
            .select(`
                student_number,
                status,
                core_students!inner( student_id_card, national_id, prefix, first_name, last_name ),
                core_classrooms!inner( grade_level, room_number, academic_year, semester )
            `);

        if (year) query = query.eq('core_classrooms.academic_year', year);
        if (term) query = query.eq('core_classrooms.semester', term);

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบรายชื่อนักเรียนในภาคเรียนปัจจุบัน', 'info');
            return;
        }

        // ==========================================
        // เพิ่มส่วนนี้: เรียงลำดับข้อมูล (ชั้นเรียน -> ห้อง -> เลขที่)
        // ==========================================
        data.sort((a, b) => {
            const classA = a.core_classrooms;
            const classB = b.core_classrooms;

            // แปลงเป็นตัวเลขเผื่อกรณีที่ข้อมูลใน DB เก็บเป็น String (เช่น "1", "2") เพื่อให้ 10 ไม่มาก่อน 2
            const gradeA = Number(classA.grade_level) || 0;
            const gradeB = Number(classB.grade_level) || 0;
            
            if (gradeA !== gradeB) {
                return gradeA - gradeB; // เรียงตามชั้นเรียน
            }

            const roomA = Number(classA.room_number) || 0;
            const roomB = Number(classB.room_number) || 0;
            
            if (roomA !== roomB) {
                return roomA - roomB; // ถ้าชั้นเรียนเท่ากัน ให้เรียงตามห้อง
            }

            const numA = Number(a.student_number) || 0;
            const numB = Number(b.student_number) || 0;
            
            return numA - numB; // ถ้าชั้นเรียนและห้องเท่ากัน ให้เรียงตามเลขที่
        });
        // ==========================================

        // 3. สร้างข้อมูลสำหรับ Excel
        const wsData = [
            ['ห้อง', 'เลขที่', 'รหัสนักเรียน', 'เลขประจำตัวประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'สถานะ']
        ];

        data.forEach(row => {
            const s = row.core_students;
            const c = row.core_classrooms;
            wsData.push([
                `ม.${c.grade_level}/${c.room_number}`,
                row.student_number || '',
                s.student_id_card || '',
                s.national_id || '',
                s.prefix || '',
                s.first_name || '',
                s.last_name || '',
                row.status || 'เรียนปกติ'
            ]);
        });

        // 4. สร้างและดาวน์โหลดไฟล์ Excel
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 12 },  // ห้อง
            { wch: 8 },   // เลขที่
            { wch: 15 },  // รหัสนักเรียน
            { wch: 15 },  // เลขประจำตัวประชาชน
            { wch: 10 },  // คำนำหน้า
            { wch: 20 },  // ชื่อ
            { wch: 25 },  // นามสกุล
            { wch: 12 }   // สถานะ
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "รายชื่อนักเรียนทั้งหมด");
        XLSX.writeFile(wb, `รายชื่อนักเรียน_เทอม${term}_${year}.xlsx`);

        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// นำเข้าผ่าน Excel Local
async function processImportStudents(event) {
    const classId = document.getElementById('filterStudentClass').value;
    const file = event.target.files[0];
    if (!file || !classId) return;

    Swal.fire({
        title: 'กำลังนำเข้ารายชื่อ...',
        html: 'ระบบกำลังประมวลผลแยกข้อมูล<br><span class="text-sm text-red-500">*ห้ามปิดหน้าต่างนี้*</span>',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            // 🌟 เพิ่มโค้ดส่วนนี้: กรองและแปลงเลขประชาชนก่อนส่งเข้าฐานข้อมูล
            rows = rows.map(row => {
                // รองรับทั้งหัวคอลัมน์แบบภาษาไทยและภาษาอังกฤษ
                let rawNationalId = row['เลขประจำตัวประชาชน'] || row.national_id || '';
                rawNationalId = String(rawNationalId).trim();

                // หากไม่มีข้อมูล หรือกรอก 9999999999999 มา ให้บังคับเป็น null
                if (rawNationalId === '' || rawNationalId === '-' || rawNationalId === '9999999999999') {
                    row['เลขประจำตัวประชาชน'] = null;
                    row.national_id = null;
                } else {
                    // ถ้ามีเลข ปชช จริง ให้เก็บเป็น String ที่ไม่มีช่องว่าง
                    row['เลขประจำตัวประชาชน'] = rawNationalId;
                    row.national_id = rawNationalId;
                }

                return row;
            });
            // 🌟 สิ้นสุดการเพิ่มโค้ด

            // ส่งข้อมูลที่ถูกแปลงค่า (null) เรียบร้อยแล้วไปบันทึก
            await insertStudentDataToDB(rows, classId);
            event.target.value = '';
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message || 'รูปแบบไฟล์ไม่ถูกต้อง', 'error');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// นำเข้าผ่าน Google Sheet (รองรับไฟล์รวมนักเรียนทั้งโรงเรียน แยกตามห้องได้)
async function triggerImportGoogleSheet() {
    const classId = document.getElementById('filterStudentClass').value;
    if (!classId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือก "ห้องเรียนปลายทาง" ในระบบก่อนทำการดึงข้อมูล', 'warning');

    const { value: formValues } = await Swal.fire({
        title: 'ดึงข้อมูลจาก Google Sheet',
        html: `
            <div class="text-sm text-left text-gray-600 mb-4 space-y-2 bg-green-50 p-4 rounded-xl border border-green-200">
                <p class="font-bold text-green-800"><i class="fa-solid fa-circle-info"></i> วิธีดึงจากไฟล์รวม (Database เดียว):</p>
                <ol class="list-decimal ml-5 space-y-1">
                    <li>วางลิงก์ไฟล์ Google Sheet (แบบ Anyone with the link)</li>
                    <li>ในไฟล์ Sheet ต้องมีคอลัมน์ชื่อ <b>"ห้อง"</b> หรือ <b>"ห้องเรียน"</b></li>
                    <li>พิมพ์ระบุชื่อห้องที่ต้องการนำเข้า (เพื่อให้ระบบกรองเฉพาะห้องนี้)</li>
                </ol>
            </div>
            <input id="swal-gsheet-url" class="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 outline-none focus:border-green-500 font-medium" placeholder="วางลิงก์ Google Sheet ที่นี่...">
            <input id="swal-gsheet-room" class="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-blue-500 font-medium" placeholder="ตัวกรอง: เช่น 1/1, ม.1/1 (ปล่อยว่างเท่านำเข้าทั้งหมด)">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#0f9d58',
        confirmButtonText: '<i class="fa-solid fa-filter"></i> ดึงและกรองข้อมูล',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const url = document.getElementById('swal-gsheet-url').value.trim();
            const roomFilter = document.getElementById('swal-gsheet-room').value.trim();
            if (!url) Swal.showValidationMessage('กรุณาวางลิงก์ Google Sheet ก่อนครับ');
            return { url, roomFilter };
        }
    });

    if (formValues && formValues.url) {
        Swal.fire({ title: 'กำลังดึงและกรองข้อมูล...', html: 'กรุณารอสักครู่ ระบบกำลังค้นหาห้องที่คุณระบุ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const match = formValues.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!match) throw new Error("รูปแบบลิงก์ Google Sheet ไม่ถูกต้องครับ");
            const sheetId = match[1];

            // 1. ดึงข้อมูล CSV
            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
            const response = await fetch(csvUrl);
            if (!response.ok) throw new Error("ไม่สามารถเข้าถึงไฟล์ได้ (โปรดตรวจสอบว่าเปิดแชร์ Anyone with the link แล้ว)");
            const csvText = await response.text();

            // 2. แปลงข้อความ CSV เป็นตาราง
            const workbook = XLSX.read(csvText, { type: 'string' });
            const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (!rawRows || rawRows.length === 0) throw new Error("ไม่พบข้อมูลใน Google Sheet หรือรูปแบบตารางไม่ถูกต้อง");

            // 3. ล้างหัวคอลัมน์และกรองเลข ปชช. (เหมือนเดิม)
            let rows = rawRows.map(row => {
                let cleanRow = {};
                for (let key in row) {
                    const cleanKey = key.replace(/"/g, '').trim();
                    cleanRow[cleanKey] = row[key];
                }

                let rawNationalId = cleanRow['เลขประจำตัวประชาชน'] || cleanRow.national_id || '';
                rawNationalId = String(rawNationalId).trim();

                if (rawNationalId === '' || rawNationalId === '-' || rawNationalId === '9999999999999') {
                    cleanRow['เลขประจำตัวประชาชน'] = null;
                    cleanRow.national_id = null;
                } else {
                    cleanRow['เลขประจำตัวประชาชน'] = rawNationalId;
                    cleanRow.national_id = rawNationalId;
                }
                return cleanRow;
            });

            // 🌟 4. จุดที่เพิ่มเข้ามา: กรองข้อมูลเฉพาะห้องที่ระบุ
            if (formValues.roomFilter) {
                rows = rows.filter(row => {
                    // รองรับหัวคอลัมน์ที่อาจจะตั้งชื่อว่า ห้อง, ห้องเรียน, หรือ ชั้นเรียน
                    const sheetRoom = row['ห้อง'] || row['ห้องเรียน'] || row['ชั้นเรียน'] || row['room'] || '';
                    return String(sheetRoom).trim() === formValues.roomFilter;
                });

                if (rows.length === 0) {
                    throw new Error(`ไม่พบรายชื่อนักเรียนห้อง "${formValues.roomFilter}" ในไฟล์เลยครับ (เช็กชื่อคอลัมน์ใน Sheet ว่าตั้งเป็น "ห้อง" หรือไม่)`);
                }
            }

            // 5. ส่งข้อมูลที่กรองแล้วเข้าฐานข้อมูล
            await insertStudentDataToDB(rows, classId);

            // แจ้งเตือนความสำเร็จพร้อมบอกจำนวน
            Swal.fire('นำเข้าสำเร็จ!', `ดึงรายชื่อนักเรียนห้อง ${formValues.roomFilter || 'ทั้งหมด'} จำนวน ${rows.length} คน เรียบร้อยแล้ว`, 'success');

        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

// Core Function: นำข้อมูล Array ใส่ฐานข้อมูล (ใช้ร่วมกันทั้ง Excel และ Google Sheet)
async function insertStudentDataToDB(rows, classId) {
    if (!rows || rows.length === 0) throw new Error("ไม่พบข้อมูลที่จะนำเข้า");

    let successCount = 0;
    let errorList = [];

    // ดึงรายชื่อ student_id ที่มีอยู่ในห้องนี้แล้ว (สำหรับตรวจสอบภายหลัง)
    const { data: existingEnrollments } = await db.from('student_enrollments')
        .select('student_id, id')
        .eq('classroom_id', classId);
    const existingMap = new Map();
    if (existingEnrollments) {
        existingEnrollments.forEach(e => existingMap.set(e.student_id, e.id));
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const stdIdCard = (row['เลขประจำตัวนักเรียน'] || row['เลขประจำตัว'] || '')?.toString().trim();
        const fName = (row['ชื่อ'] || row['ชื่อจริง'] || '')?.toString().trim();

        if (!stdIdCard || !fName) {
            errorList.push(`แถวที่ ${i + 2}: ขาดข้อมูลสำคัญ (เลขประจำตัว หรือ ชื่อ)`);
            continue;
        }

        // อัปเดต/เพิ่มข้อมูลนักเรียนลง core_students
        const { data: stdData, error: stdErr } = await db.from('core_students').upsert({
            student_id_card: stdIdCard,
            national_id: row['เลขประจำตัวประชาชน']?.toString().trim() || null,
            prefix: row['คำนำหน้า']?.toString().trim() || '',
            first_name: fName,
            last_name: row['นามสกุล']?.toString().trim() || ''
        }, { onConflict: 'student_id_card' }).select('id').single();

        if (stdErr) {
            errorList.push(`แถวที่ ${i + 2}: ข้อผิดพลาดประวัติ (${stdErr.message})`);
            continue;
        }

        const studentId = stdData.id;
        const studentNumber = parseInt(row['เลขที่']) || null;
        const status = row['สถานะ']?.toString().trim() || 'เรียนปกติ';

        // ตรวจสอบว่านักเรียนคนนี้มี enrollment ในห้องนี้อยู่แล้วหรือไม่
        if (existingMap.has(studentId)) {
            // มีอยู่แล้ว → อัปเดตเฉพาะข้อมูลเลขที่และสถานะ
            const enrollId = existingMap.get(studentId);
            const { error: updateErr } = await db.from('student_enrollments')
                .update({ student_number: studentNumber, status })
                .eq('id', enrollId);

            if (updateErr) {
                errorList.push(`แถวที่ ${i + 2}: อัปเดตเลขที่/สถานะไม่สำเร็จ (${updateErr.message})`);
            } else {
                successCount++;
            }
        } else {
            // ยังไม่มี → เพิ่มใหม่
            const { error: insertErr } = await db.from('student_enrollments').insert({
                student_id: studentId,
                classroom_id: classId,
                student_number: studentNumber,
                status
            });

            if (insertErr) {
                errorList.push(`แถวที่ ${i + 2}: เพิ่มลงห้องไม่สำเร็จ (${insertErr.message})`);
            } else {
                successCount++;
            }
        }
    }

    if (errorList.length > 0) {
        let errHtml = `<div class="text-left text-sm text-red-600 max-h-40 overflow-y-auto mt-2 bg-red-50 p-2 border border-red-200 rounded-lg">` + errorList.map(err => `<div>- ${err}</div>`).join('') + `</div>`;
        Swal.fire({ icon: 'warning', title: `นำเข้าสำเร็จ ${successCount} รายการ`, html: `แต่พบข้อผิดพลาดบางส่วน:<br>${errHtml}`, confirmButtonText: 'รับทราบ' });
    } else {
        Swal.fire({ icon: 'success', title: 'นำเข้ารายชื่อสำเร็จ!', text: `จำนวน ${successCount} คน เข้าสู่ระบบเรียบร้อยแล้ว`, timer: 2000, showConfirmButton: false });
    }

    await loadStudents();
}

// 🌟 1. ฟังก์ชันค้นหาเด็กซ้ำ
async function checkDuplicateStudents() {
    Swal.fire({ title: 'กำลังสแกนฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        // ดึงปีการศึกษาปัจจุบัน
        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        if (!schoolInfo) throw new Error('ไม่พบข้อมูลปีการศึกษา');

        // ดึงรายชื่อการจัดห้องทั้งหมด พร้อมข้อมูลเด็กและห้องเรียน
        const { data: enrolls, error } = await db.from('student_enrollments').select(`
            id, student_number,
            core_students ( id, student_id_card, prefix, first_name, last_name ),
            core_classrooms ( id, grade_level, room_number, academic_year, semester )
        `);

        if (error) throw error;

        // กรองเอาเฉพาะข้อมูลของเทอมปัจจุบัน
        const currentEnrolls = enrolls.filter(e =>
            e.core_classrooms &&
            e.core_classrooms.academic_year === schoolInfo.current_academic_year &&
            e.core_classrooms.semester === schoolInfo.current_semester &&
            e.core_students // ต้องมีข้อมูลเด็ก
        );

        // จัดกลุ่มตาม ID เด็ก
        const studentMap = {};
        currentEnrolls.forEach(e => {
            const sid = e.core_students.id;
            if (!studentMap[sid]) studentMap[sid] = [];
            studentMap[sid].push(e);
        });

        // คัดเฉพาะคนที่มีชื่อมากกว่า 1 ห้อง
        const duplicates = Object.values(studentMap).filter(arr => arr.length > 1);

        Swal.close();

        if (duplicates.length === 0) {
            return Swal.fire({ icon: 'success', title: 'ยอดเยี่ยม!', text: 'ไม่พบนักเรียนที่มีรายชื่อซ้ำซ้อนในเทอมปัจจุบันครับ' });
        }

        // วาดตารางแสดงผล
        let html = `
        <div class="bg-rose-50 text-rose-700 p-4 rounded-2xl mb-4 text-sm border border-rose-200 shadow-sm flex gap-3 items-start">
            <i class="fas fa-exclamation-triangle text-xl mt-0.5"></i>
            <div>
                <p class="font-bold text-base">พบนักเรียนมีรายชื่อซ้ำซ้อน ${duplicates.length} คน</p>
                <p class="text-rose-600 mt-1">ระบบพบนักเรียนที่มีรายชื่อผูกอยู่กับหลายห้องในเทอมปัจจุบัน กรุณาลบรายชื่อออกจากห้องที่ผิดครับ</p>
            </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="bg-slate-100 text-slate-600">
                    <tr>
                        <th class="p-3 border-b font-bold w-1/4">เลขประจำตัว</th>
                        <th class="p-3 border-b font-bold w-1/3">ชื่อ-นามสกุล</th>
                        <th class="p-3 border-b font-bold">ห้องเรียนที่มีชื่ออยู่</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
        `;

        duplicates.forEach(arr => {
            const stu = arr[0].core_students;
            html += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 align-top font-medium text-slate-600">${stu.student_id_card || '-'}</td>
                <td class="p-3 align-top font-bold text-blue-700">${stu.prefix || ''}${stu.first_name} ${stu.last_name}</td>
                <td class="p-3 align-top">
                    <div class="space-y-2">
            `;
            // ลูปแสดงห้องเรียนที่เด็กคนนี้ไปโผล่
            arr.forEach(enroll => {
                const cr = enroll.core_classrooms;
                html += `
                        <div class="flex items-center justify-between bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm">
                            <span class="font-bold text-slate-700"><i class="fas fa-door-open text-slate-400 mr-1"></i> ม.${cr.grade_level}/${cr.room_number} <span class="text-xs text-slate-400 font-normal ml-1">(เลขที่ ${enroll.student_number || '-'})</span></span>
                            <button onclick="removeDuplicateEnrollment('${enroll.id}')" class="text-xs font-bold bg-red-50 text-red-600 border border-red-100 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition shadow-sm">
                                <i class="fas fa-trash-alt mr-1"></i> ลบออก
                            </button>
                        </div>
                `;
            });
            html += `
                    </div>
                </td>
            </tr>
            `;
        });

        html += `</tbody></table></div>`;

        document.getElementById('duplicate-content').innerHTML = html;
        document.getElementById('modal-duplicates').classList.remove('hidden');
        document.getElementById('modal-duplicates').classList.add('flex');

    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// 🌟 2. ฟังก์ชันปิด Modal
function closeDuplicateModal() {
    document.getElementById('modal-duplicates').classList.add('hidden');
    document.getElementById('modal-duplicates').classList.remove('flex');
}

// 🌟 3. ฟังก์ชันลบรายชื่อออกจากห้อง
async function removeDuplicateEnrollment(enrollId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบรายชื่อ?',
        html: '<p class="text-sm text-red-500">รายชื่อนี้จะถูกนำออกจากห้องเรียนนี้เท่านั้น<br>(ข้อมูลประวัติเด็กยังอยู่ครบ)</p>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบรายชื่อนี้',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('student_enrollments').delete().eq('id', enrollId);

        if (error) {
            Swal.fire('ผิดพลาด', error.message, 'error');
        } else {
            Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1500, showConfirmButton: false });

            // สั่งให้สแกนใหม่เพื่อรีเฟรชหน้าต่าง Modal
            checkDuplicateStudents();

            // รีเฟรชตารางรายชื่อด้านหลังให้เป็นข้อมูลล่าสุดด้วย
            loadStudents();
        }
    }
}

// ==========================================
// 🌟 ระบบค้นหานักเรียนอิสระ (ค้นหาทั้งระบบ / จัดการเด็กตกหล่น)
// ==========================================
function openGlobalStudentSearch() {
    Swal.fire({
        title: 'ค้นหาและจัดการนักเรียนทั้งระบบ',
        html: '<p class="text-sm text-gray-500 mb-4">ค้นหาเพื่อแก้ไขชื่อ, ย้ายห้อง หรือลบนักเรียนที่ซ้ำซ้อน</p>',
        input: 'text',
        inputPlaceholder: 'พิมพ์ชื่อ, นามสกุล หรือเลขประจำตัว...',
        showCancelButton: true,
        confirmButtonColor: '#9333ea',
        confirmButtonText: '<i class="fas fa-search"></i> ค้นหา',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value) return 'กรุณาพิมพ์คำค้นหาด้วยครับ!';
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            searchGlobalStudents(result.value.trim());
        }
    });
}

async function searchGlobalStudents(keyword) {
    Swal.fire({
        title: 'กำลังค้นหา...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        // 1. ค้นหานักเรียน (ใช้ ilike หลายฟิลด์)
        const { data: students, error: stuErr } = await db
            .from('core_students')
            .select(`
                id,
                student_id_card,
                first_name,
                last_name,
                student_enrollments!student_id (
                    id,
                    student_number,
                    classroom_id,
                    core_classrooms (
                        id,
                        grade_level,
                        room_number,
                        academic_year,
                        semester
                    )
                )
            `)
            .or(`student_id_card.ilike.%${keyword}%,first_name.ilike.%${keyword}%,last_name.ilike.%${keyword}%`)
            .limit(50);

        if (stuErr) throw stuErr;
        if (!students || students.length === 0) {
            Swal.fire('ไม่พบข้อมูล', `ไม่พบนักเรียนที่ตรงกับ "${keyword}"`, 'info');
            return;
        }

        // 2. โหลดห้องเรียนทั้งหมด (เฉพาะปีการศึกษาปัจจุบัน เพื่อไม่ให้ตัวเลือกเยอะ)
        const { data: schoolInfo } = await db.from('core_school_info').select('current_academic_year').single();
        const currentYear = schoolInfo?.current_academic_year || (new Date().getFullYear() + 543).toString();
        const { data: classrooms } = await db
            .from('core_classrooms')
            .select('id, grade_level, room_number, semester, academic_year')
            .eq('academic_year', currentYear)
            .order('grade_level')
            .order('room_number');
        
        const roomOptions = (classrooms || []).map(c => ({
            value: c.id,
            text: `ม.${c.grade_level}/${c.room_number} (เทอม ${c.semester}/${c.academic_year})`
        }));

        // 3. สร้าง HTML ตาราง
        let html = `<div class="overflow-x-auto max-h-[60vh] text-left">
            <table class="w-full text-sm border-collapse">
                <thead class="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th class="p-2 border border-gray-300">รหัส</th>
                        <th class="p-2 border border-gray-300">ชื่อ - นามสกุล</th>
                        <th class="p-2 border border-gray-300 text-center">ห้องปัจจุบัน</th>
                        <th class="p-2 border border-gray-300 text-center">เปลี่ยนห้อง</th>
                        <th class="p-2 border border-gray-300 text-center">ลบ</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const s of students) {
            // student_enrollments เป็น array (one-to-many) เราจะเอาตัวแรก (หรือจะแสดงหลายห้องก็ได้)
            const enroll = s.student_enrollments && s.student_enrollments.length > 0 ? s.student_enrollments[0] : null;
            const currentRoomId = enroll?.classroom_id || '';
            const enrollId = enroll?.id || '';
            
            let roomText = '<span class="text-rose-500 font-bold">ไม่มีห้อง</span>';
            if (enroll && enroll.core_classrooms) {
                const cr = enroll.core_classrooms;
                roomText = `<span class="font-bold text-indigo-700">ม.${cr.grade_level}/${cr.room_number}</span><br>
                            <span class="text-[10px] text-gray-500">(เทอม ${cr.semester}/${cr.academic_year})</span>`;
            }

            html += `
                <tr class="hover:bg-purple-50 transition-colors">
                    <td class="p-2 border border-gray-300 font-medium text-gray-700">${s.student_id_card || '-'}</td>
                    <td class="p-2 border border-gray-300 min-w-[150px]">
                        <input type="text" id="fname_${s.id}" value="${escapeHtml(s.first_name)}" class="border rounded p-1 w-full text-xs mb-1 outline-none focus:border-purple-500" placeholder="ชื่อ">
                        <input type="text" id="lname_${s.id}" value="${escapeHtml(s.last_name)}" class="border rounded p-1 w-full text-xs outline-none focus:border-purple-500" placeholder="นามสกุล">
                        <button onclick="saveGlobalStudentName('${s.id}')" class="w-full mt-1 text-[10px] bg-purple-100 text-purple-700 py-1 rounded hover:bg-purple-200 font-bold">บันทึกชื่อ</button>
                    </td>
                    <td class="p-2 border border-gray-300 text-center whitespace-nowrap">${roomText}</td>
                    <td class="p-2 border border-gray-300 text-center min-w-[200px]">
                        <select class="room-select" data-student-id="${s.id}" data-enroll-id="${enrollId}" data-current-room="${currentRoomId}"></select>
                    </td>
                    <td class="p-2 border border-gray-300 text-center">
                        <button onclick="deleteGlobalStudent('${s.id}', '${escapeHtml(s.first_name)}')" class="bg-red-50 text-red-600 hover:bg-red-500 hover:text-white h-8 w-8 rounded-full transition-colors"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }
        html += `</tbody></table></div>`;

        Swal.fire({
            title: 'ผลการค้นหานักเรียน',
            html: html,
            width: '1000px',
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'ปิด',
            didOpen: () => {
                // สร้าง TomSelect ให้แต่ละ select
                document.querySelectorAll('.room-select').forEach(select => {
                    const studentId = select.dataset.studentId;
                    const enrollId = select.dataset.enrollId;
                    const currentRoomId = select.dataset.currentRoom;

                    new TomSelect(select, {
                        options: roomOptions,
                        valueField: 'value',
                        labelField: 'text',
                        searchField: ['text'],
                        placeholder: currentRoomId ? '-- ถอดออกจากห้อง --' : '-- เลือกห้องเพื่อเพิ่ม --',
                        allowEmptyOption: true,
                        onChange: (value) => {
                            changeStudentGlobalRoom(studentId, enrollId, value || '');
                        }
                    });
                    if (currentRoomId) {
                        select.tomselect.setValue(currentRoomId);
                    }
                });
            },
            willClose: () => {
                document.querySelectorAll('.room-select').forEach(select => {
                    if (select.tomselect) select.tomselect.destroy();
                });
            }
        });
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// Helper escape HTML เพื่อป้องกัน XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// 🌟 ฟังก์ชันย่อยสำหรับแก้ไขและลบ
async function saveGlobalStudentName(studentId) {
    const fname = document.getElementById(`fname_${studentId}`).value.trim();
    const lname = document.getElementById(`lname_${studentId}`).value.trim();

    if (!fname || !lname) return Swal.fire({ toast: true, position: 'top-end', title: 'กรุณากรอกชื่อและสกุล', icon: 'warning', showConfirmButton: false, timer: 1500 });

    const { error } = await db.from('core_students').update({ first_name: fname, last_name: lname }).eq('id', studentId);
    if (error) Swal.fire({ toast: true, position: 'top-end', title: 'อัปเดตชื่อผิดพลาด', icon: 'error', showConfirmButton: false, timer: 1500 });
    else Swal.fire({ toast: true, position: 'top-end', title: 'อัปเดตชื่อสำเร็จ', icon: 'success', showConfirmButton: false, timer: 1500 });
}

async function changeStudentGlobalRoom(studentId, currentEnrollId, newRoomId) {
    Swal.fire({ title: 'กำลังอัปเดตห้องเรียน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (!newRoomId) {
            // ถอดออกจากห้อง
            if (currentEnrollId) {
                await db.from('student_enrollments').delete().eq('id', currentEnrollId);
            }
        } else {
            // ย้ายไปห้องใหม่
            if (currentEnrollId) {
                await db.from('student_enrollments').update({ classroom_id: newRoomId }).eq('id', currentEnrollId);
            } else {
                // เพิ่มเข้าห้อง
                await db.from('student_enrollments').insert({ student_id: studentId, classroom_id: newRoomId });
            }
        }
        Swal.fire({ icon: 'success', title: 'อัปเดตห้องเรียนสำเร็จ', timer: 1500, showConfirmButton: false });
        // รีเฟรชตารางนักเรียนในเมนูหลัก (ถ้ากำลังดูห้องอยู่)
        if (typeof loadStudents === 'function') loadStudents();
        // อัปเดต badge นักเรียนไร้ห้อง
        if (typeof updateUnassignedBadge === 'function') updateUnassignedBadge();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deleteGlobalStudent(studentId, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบถาวร?',
        html: `<p class="text-sm text-red-500">คุณกำลังลบ <b>${name}</b> ออกจากระบบ<br>ข้อมูลการเข้าเรียน, พฤติกรรม <b>จะถูกลบทั้งหมด</b></p>`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูลถาวร'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_students').delete().eq('id', studentId);
        if (!error) {
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
            const row = document.getElementById(`fname_${studentId}`).closest('tr');
            if (row) row.remove();
        } else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

// 🌟 ฟังก์ชันตรวจสอบนักเรียนที่ยังไม่ได้จัดห้อง
async function checkUnassignedStudents() {
    Swal.fire({ title: 'กำลังตรวจสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        // 1. ดึงปีการศึกษาปัจจุบัน
        const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
        const activeYear = sInfo?.current_academic_year;
        if (!activeYear) throw new Error("ไม่พบข้อมูลปีการศึกษาปัจจุบัน");

        // 2. ดึงรายชื่อนักเรียนทั้งหมด (id, รหัส, ชื่อ)
        const { data: allStudents, error: allErr } = await db
            .from('core_students')
            .select('id, student_id_card, first_name, last_name');

        if (allErr) throw allErr;

        // 3. ดึง student_id ที่ถูกจัดห้องแล้วในปีนี้ (deduplicate ด้วย Set)
        const { data: enrolledData, error: enrErr } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms!inner(academic_year)')
            .eq('core_classrooms.academic_year', activeYear);

        if (enrErr) throw enrErr;

        const enrolledIds = new Set(enrolledData ? enrolledData.map(e => e.student_id) : []);

        // 4. คัดเฉพาะนักเรียนที่ไม่อยู่ใน enrolledIds
        const unassignedStudents = allStudents.filter(s => !enrolledIds.has(s.id));

        if (!unassignedStudents || unassignedStudents.length === 0) {
            return Swal.fire({
                icon: 'success',
                title: 'ข้อมูลเรียบร้อย!',
                text: `นักเรียนทุกคนในปีการศึกษา ${activeYear} มีห้องเรียนครบถ้วนแล้ว`,
                confirmButtonColor: '#10b981'
            });
        }

        // 5. แสดงผล (เหมือนเดิม)
        let studentListHtml = `
            <div class="overflow-x-auto max-h-[60vh] text-left border rounded-2xl shadow-sm bg-white">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-rose-50 sticky top-0 z-10">
                        <tr class="text-rose-700">
                            <th class="p-3 border-b border-rose-100 w-20 text-center">ลำดับ</th>
                            <th class="p-3 border-b border-rose-100">รหัสประจำตัว</th>
                            <th class="p-3 border-b border-rose-100">ชื่อ - นามสกุล</th>
                            <th class="p-3 border-b border-rose-100 text-center w-40 whitespace-nowrap">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${unassignedStudents.map((s, index) => `
                            <tr class="hover:bg-rose-50/50 transition-colors">
                                <td class="p-3 text-center text-slate-400 font-medium">${index + 1}</td>
                                <td class="p-3 font-mono font-bold text-blue-600">${s.student_id_card || '-'}</td>
                                <td class="p-3 font-bold text-slate-700">${s.first_name} ${s.last_name}</td>
                                <td class="p-3 text-center">
                                    <button onclick="Swal.close(); searchGlobalStudents('${s.student_id_card}')" 
                                        class="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-black shadow-sm transition-all">
                                        <i class="fas fa-plus mr-1"></i> จัดเข้าห้อง
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="mt-4 p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3">
                <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center text-rose-500 shadow-sm shrink-0">
                    <i class="fas fa-user-slash"></i>
                </div>
                <div class="text-left">
                    <p class="text-sm font-black text-rose-700">พบนร. ยังไม่มีห้อง ${unassignedStudents.length} คน</p>
                    <p class="text-[11px] text-rose-500 font-bold">กรุณาคลิกปุ่ม "จัดเข้าห้อง" เพื่อเลือกห้องเรียนให้เด็ก</p>
                </div>
            </div>
        `;

        Swal.fire({
            title: `นักเรียนตกหล่น (ปี ${activeYear})`,
            html: studentListHtml,
            width: '960px',
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'ปิดหน้าต่าง'
        });

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถตรวจสอบได้: ' + err.message, 'error');
    }
}

// ลบนักเรียนตกหล่นออกจากระบบถาวร
async function deleteUnassignedStudent(studentId, studentName) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        html: `ต้องการลบ <b>${studentName}</b> ออกจากระบบถาวรใช่หรือไม่?<br><span class="text-sm text-red-500">ใช้สำหรับนักเรียนที่ย้ายออกหรือไม่มีตัวตนในระบบแล้ว</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '<i class="fas fa-trash-alt mr-1"></i> ลบถาวร',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_students').delete().eq('id', studentId);

    if (error) {
        Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    } else {
        await updateUnassignedBadge();
        Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1500, showConfirmButton: false })
            .then(() => checkUnassignedStudents()); // รีเฟรช Modal
    }
}

// ฟังก์ชันนับจำนวน Badge นักเรียนที่ยังไม่มีห้องเรียนในปีปัจจุบัน
async function updateUnassignedBadge() {
    try {
        const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();
        if (!sInfo) return;

        // ดึงนักเรียนทั้งหมด
        const { data: allStudents, error: allErr } = await db.from('core_students').select('id');
        if (allErr) throw allErr;

        // ดึง student_id ที่ถูกจัดห้องแล้วในปีปัจจุบัน (ใช้ logic เดียวกับ checkUnassignedStudents)
        const { data: enrolledData, error: enrErr } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms!inner(academic_year)')
            .eq('core_classrooms.academic_year', sInfo.current_academic_year);
        if (enrErr) throw enrErr;

        const enrolledIds = new Set((enrolledData || []).map(e => e.student_id));
        const unassignedCount = (allStudents || []).filter(s => !enrolledIds.has(s.id)).length;

        const badge = document.getElementById('unassigned_badge');
        if (!badge) return;
        if (unassignedCount > 0) {
            badge.textContent = unassignedCount;
            badge.classList.remove('hidden');
            badge.classList.add('inline-block');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('inline-block');
        }
    } catch (e) {
        console.warn("Badge error:", e);
    }
}

// ==========================================
// ระบบจัดการคัดลอกและเลื่อนชั้นเรียน (Enrollment Manager)
// ==========================================
async function copyToTerm2() {
    Swal.fire({ title: 'กำลังตรวจสอบระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: sysSettings } = await db.from('core_school_info').select('*').eq('id', 1).single();
        const currentYear = sysSettings.current_academic_year;
        const currentTerm = sysSettings.current_semester;

        Swal.close();

        if (currentTerm !== '2') {
            return Swal.fire('แจ้งเตือน', 'ฟังก์ชันนี้ใช้สำหรับคัดลอกข้อมูลเข้าสู่ "เทอม 2" เท่านั้น<br>กรุณาเปลี่ยนการตั้งค่าระบบเป็นเทอม 2 ก่อนครับ', 'warning');
        }

        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการคัดลอกรายชื่อ?',
            html: `ระบบจะคัดลอกรายชื่อนักเรียนทั้งหมดจาก <b>เทอม 1 / ${currentYear}</b><br>มายัง <b>เทอม 2 / ${currentYear}</b> (ห้องเรียนเดิม เลขที่เดิม)`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'ยืนยันการคัดลอก',
            cancelButtonText: 'ยกเลิก'
        });

        if (!isConfirmed) return;
        Swal.fire({ title: 'กำลังดึงและจัดสรรข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: sourceClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '1');
        const { data: destClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '2');

        if (!sourceClasses || sourceClasses.length === 0) throw new Error('ไม่พบข้อมูลโครงสร้างห้องเรียนของเทอม 1 ในระบบ');
        if (!destClasses || destClasses.length === 0) throw new Error('ไม่พบข้อมูลโครงสร้างห้องเรียนของเทอม 2 (กรุณาสร้างห้องเรียนส่วนกลางก่อน)');

        let enrollmentsToInsert = [];

        for (let destClass of destClasses) {
            const sourceClass = sourceClasses.find(c => c.grade_level === destClass.grade_level && c.room_number === destClass.room_number);

            if (sourceClass) {
                const { data: students } = await db.from('student_enrollments').select('student_id, student_number, status').eq('classroom_id', sourceClass.id);
                const { data: existing } = await db.from('student_enrollments').select('student_id').eq('classroom_id', destClass.id);
                const existingIds = existing ? existing.map(e => e.student_id) : [];

                if (students) {
                    students.forEach(std => {
                        if (!existingIds.includes(std.student_id)) {
                            enrollmentsToInsert.push({
                                classroom_id: destClass.id,
                                student_id: std.student_id,
                                student_number: std.student_number,
                                status: std.status || 'ปกติ'
                            });
                        }
                    });
                }
            }
        }

        if (enrollmentsToInsert.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่มีรายชื่อนักเรียนใหม่ให้คัดลอก<br>(หรือนักเรียนทั้งหมดถูกคัดลอกมาครบแล้ว)', 'info');
        }

        const { error } = await db.from('student_enrollments').insert(enrollmentsToInsert);
        if (error) throw error;

        Swal.fire('สำเร็จ!', `คัดลอกนักเรียนจำนวน ${enrollmentsToInsert.length} รายการ เข้าสู่เทอม 2 เรียบร้อยแล้ว`, 'success');
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function promoteStudents() {
    Swal.fire({ title: 'กำลังตรวจสอบระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: sysSettings } = await db.from('core_school_info').select('*').eq('id', 1).single();
        const currentYear = sysSettings.current_academic_year;
        const currentTerm = sysSettings.current_semester;
        const prevYear = (parseInt(currentYear) - 1).toString();

        Swal.close();

        if (currentTerm !== '1') {
            return Swal.fire('แจ้งเตือน', 'ฟังก์ชันเลื่อนชั้นใช้สำหรับ "เทอม 1" ของปีการศึกษาใหม่เท่านั้น<br>กรุณาเปลี่ยนการตั้งค่าระบบเป็นเทอม 1 ก่อนครับ', 'warning');
        }

        const { isConfirmed } = await Swal.fire({
            title: 'ยืนยันการเลื่อนชั้นเรียน?',
            html: `ระบบจะดึงรายชื่อจาก <b>เทอม 2 / ${prevYear}</b><br>เลื่อนระดับชั้นมายัง <b>เทอม 1 / ${currentYear}</b><br><br><span class="text-sm text-red-500">*หมายเหตุ: ระบบจะเลื่อนชั้นอัตโนมัติ (เช่น ม.1->ม.2)<br>และจะข้ามการเลื่อนชั้นของ ม.3 และ ม.6 (จบการศึกษา)</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#9333ea',
            confirmButtonText: 'ยืนยันการเลื่อนชั้น',
            cancelButtonText: 'ยกเลิก'
        });

        if (!isConfirmed) return;
        Swal.fire({ title: 'กำลังประมวลผลเลื่อนชั้น...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: sourceClasses } = await db.from('core_classrooms').select('*').eq('academic_year', prevYear).eq('semester', '2');
        const { data: destClasses } = await db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', '1');

        if (!sourceClasses || sourceClasses.length === 0) throw new Error(`ไม่พบโครงสร้างห้องเรียนของเทอม 2 ปีการศึกษา ${prevYear}`);
        if (!destClasses || destClasses.length === 0) throw new Error(`ไม่พบโครงสร้างห้องเรียนของเทอม 1 ปีการศึกษา ${currentYear} (กรุณาสร้างก่อน)`);

        let enrollmentsToInsert = [];

        for (let destClass of destClasses) {
            if (destClass.grade_level === 1 || destClass.grade_level === 4) continue;

            const sourceGrade = destClass.grade_level - 1;
            const sourceClass = sourceClasses.find(c => c.grade_level === sourceGrade && c.room_number === destClass.room_number);

            if (sourceClass) {
                const { data: students } = await db.from('student_enrollments').select('student_id, student_number, status').eq('classroom_id', sourceClass.id);
                const { data: existing } = await db.from('student_enrollments').select('student_id').eq('classroom_id', destClass.id);
                const existingIds = existing ? existing.map(e => e.student_id) : [];

                if (students) {
                    students.forEach(std => {
                        if (!existingIds.includes(std.student_id)) {
                            enrollmentsToInsert.push({
                                classroom_id: destClass.id,
                                student_id: std.student_id,
                                student_number: std.student_number,
                                status: std.status || 'ปกติ'
                            });
                        }
                    });
                }
            }
        }

        if (enrollmentsToInsert.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรายชื่อนักเรียนที่จะสามารถเลื่อนชั้นได้<br>(หรือคุณยังไม่มีข้อมูลของปีการศึกษาที่แล้ว หรือเลื่อนชั้นเสร็จหมดแล้ว)', 'info');
        }

        const { error } = await db.from('student_enrollments').insert(enrollmentsToInsert);
        if (error) throw error;

        Swal.fire('สำเร็จ!', `เลื่อนชั้นนักเรียนจำนวน ${enrollmentsToInsert.length} รายการ เข้าสู่ปีการศึกษา ${currentYear} เรียบร้อยแล้ว`, 'success');
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 9. ระบบจัดการสิทธิ์แอดมินประจำระบบย่อย (Module Admins)
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
// 10. ระบบจัดการ Student Portal Modules
// ==========================================
let currentEditStudentModuleId = null;

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
                    <!-- 🌟 เพิ่มคอลัมน์ Drag Handle -->
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

            // 🌟 ใช้งาน SortableJS สำหรับลาก-วาง
            new Sortable(tbody, {
                handle: '.drag-handle',
                animation: 150,
                onEnd: async function (evt) {
                    const rows = evt.from.querySelectorAll('tr');
                    const updates = [];
                    // อ่านค่าไอดีและลำดับใหม่ของแต่ละแถว
                    rows.forEach((row, index) => {
                        const id = row.getAttribute('data-id');
                        if (id) updates.push({ id: id, display_order: index + 1 });
                    });

                    // นำลำดับใหม่ไปบันทึกลง Database
                    for (let u of updates) {
                        await db.from('student_portal_modules')
                            .update({ display_order: u.display_order })
                            .eq('id', u.id);
                    }
                    // รีโหลดตารางให้แสดงผลข้อมูลที่ถูกต้อง
                    loadStudentModules();
                }
            });

        } else {
            // แก้ไข colspan เป็น 6 เพราะเราเพิ่มคอลัมน์มา 1 คอลัมน์
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
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
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
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deleteStudentModule(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ระบบนี้จะหายไปจากหน้าของนักเรียนทันที',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ'
    });
    if (isConfirmed) {
        const { error } = await db.from('student_portal_modules').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            loadStudentModules();
            Swal.fire('ลบสำเร็จ', '', 'success');
        }
    }
}

// (color sync รวมอยู่ใน DOMContentLoaded เดียวที่ท้ายไฟล์)

// ==========================================
// 🌟 ระบบตั้งค่าหัวหน้ากลุ่มสาระการเรียนรู้
// ==========================================
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
// 🌟 Tom Select สำหรับ Modal แต่งตั้งหัวหน้ากลุ่มสาระ
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

        // เริ่มต้น Tom Select ทุกอัน
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
        // เคลียร์ข้อมูลเดิมทิ้งทั้งหมด แล้วบันทึกชุดใหม่เข้าไป (ลบคนที่ไม่ระบุออกไปด้วย)
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
// 🌟 ระบบจัดการหัวหน้าระดับและหัวหน้างานปกครอง
// ==========================================

// 🔴 ตัวแปรสำหรับ Tom Select
let tsGradeModal = null;
let tsDiscModal = null;

// --- ฟังก์ชันสำหรับหัวหน้าระดับชั้น ---
async function openGradeHeadModal() {
    document.getElementById('gradeHeadModal').classList.remove('hidden');
    document.getElementById('gradeHeadModal').classList.add('flex');

    // โหลดรายชื่อใส่ Tom Select (ทำครั้งเดียว)
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

// --- ฟังก์ชันสำหรับหัวหน้างานปกครอง ---
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

// ฟังก์ชันลบสิทธิ์
async function removeGradeHead(id) {
    if (!confirm('ยืนยันการลบสิทธิ์?')) return;
    await db.from('behavior_grade_heads').delete().eq('id', id);
    renderGradeHeadsList();
}

async function removeDisciplineHead(id) {
    if (!confirm('ยืนยันการลบสิทธิ์?')) return;
    await db.from('core_discipline_heads').delete().eq('id', id);
    renderDisciplineHeadsList();
}

// ==========================================
// 🌟 ระบบจัดการ Sidebar (ย่อ-ขยาย) และ Theme
// ==========================================
let isSidebarCollapsed = false;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const texts = document.querySelectorAll('.sidebar-text');

    isSidebarCollapsed = !isSidebarCollapsed;

    if (isSidebarCollapsed) {
        sidebar.classList.remove('w-64');
        sidebar.classList.add('w-20'); // ขนาดตอนย่อ
        texts.forEach(txt => txt.classList.add('hidden'));
    } else {
        sidebar.classList.remove('w-20');
        sidebar.classList.add('w-64'); // ขนาดตอนขยาย
        texts.forEach(txt => txt.classList.remove('hidden'));
    }
}

// ==========================================
// 🌟 ระบบจัดการ Theme และปุ่มสลับโหมด
// ==========================================
function toggleThemeManually() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';

    changeTheme(newTheme);
}

function changeTheme(theme) {
    const html = document.documentElement;
    const btnIcon = document.querySelector('#theme-toggle-btn i');

    html.classList.add('theme-transitioning');

    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
        if (btnIcon) {
            btnIcon.classList.remove('fa-moon');
            btnIcon.classList.add('fa-sun', 'text-amber-500'); // เปลี่ยนไอคอนเป็นพระอาทิตย์สีเหลือง
        }
    } else {
        html.classList.remove('dark');
        if (btnIcon) {
            btnIcon.classList.remove('fa-sun', 'text-amber-500');
            btnIcon.classList.add('fa-moon'); // คืนค่าเป็นพระจันทร์
        }
    }

    setTimeout(() => html.classList.remove('theme-transitioning'), 80);
    localStorage.setItem('super_admin_theme', theme);
}

// ==========================================
// Initialization: รวม DOMContentLoaded ทั้งหมดไว้ที่จุดเดียว
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // --- Theme ---
    const savedTheme = localStorage.getItem('super_admin_theme') || 'auto';
    changeTheme(savedTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('super_admin_theme') === 'auto') changeTheme('auto');
    });

    // --- Sync color inputs: Micro-service form ---
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

    // --- Sync color inputs: Student module form ---
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

async function openRoomStudentOrder(classroomId) {
    // 1. โหลดข้อมูลนักเรียนในห้อง
    const { data: enrollments, error } = await db
        .from('student_enrollments')
        .select(`
      id,
      class_order,
      core_students ( id, student_id_card, first_name, last_name )
    `)
        .eq('core_classroom_id', classroomId)
        .order('class_order', { ascending: true, nullsFirst: false });

    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    if (!enrollments || enrollments.length === 0) {
        return Swal.fire('ไม่มีข้อมูล', 'ไม่พบนักเรียนในห้องนี้', 'info');
    }

    // 2. สร้าง HTML ตาราง
    let rowsHtml = '';
    enrollments.forEach((enr, idx) => {
        const s = enr.core_students;
        const order = enr.class_order ?? idx + 1;
        rowsHtml += `
      <tr data-enrollment-id="${enr.id}" class="sortable-row bg-white hover:bg-gray-50 cursor-grab active:cursor-grabbing">
        <td class="p-2 border text-center font-mono font-bold text-indigo-600 order-number">${order}</td>
        <td class="p-2 border">${s.student_id_card}</td>
        <td class="p-2 border">${s.first_name} ${s.last_name}</td>
        <td class="p-2 border text-center text-gray-400"><i class="fas fa-grip-vertical"></i></td>
      </tr>`;
    });

    const html = `
    <div class="text-sm text-gray-500 mb-2">🖱️ ลากแถวเพื่อจัดลำดับ เลขที่จะอัปเดตอัตโนมัติ</div>
    <div class="overflow-auto max-h-[60vh]">
      <table class="w-full border-collapse bg-white" id="sortable-table">
        <thead class="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th class="p-2 border w-16">เลขที่</th>
            <th class="p-2 border">รหัสนักเรียน</th>
            <th class="p-2 border">ชื่อ - นามสกุล</th>
            <th class="p-2 border w-10"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

    // 3. แสดง SweetAlert2 และตั้งค่า Sortable ใน didOpen
    const { isConfirmed } = await Swal.fire({
        title: 'จัดลำดับเลขที่นักเรียน',
        html,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> บันทึกเลขที่',
        cancelButtonText: 'ปิด',
        didOpen: () => {
            const tbody = document.querySelector('#sortable-table tbody');
            if (!tbody) return;

            // ทำให้ tbody ลากได้
            new Sortable(tbody, {
                animation: 150,
                handle: '.sortable-row', // ลากได้ทั้งแถว (หรือจะใช้เฉพาะ icon ก็เปลี่ยนเป็น '.fa-grip-vertical')
                onEnd: function () {
                    // หลังจากลากเสร็จ -> คำนวณเลขที่ใหม่ให้ทุกแถว
                    updateOrderNumbers();
                }
            });
        },
        preConfirm: () => {
            // 4. รวบรวมลำดับใหม่จาก DOM และบันทึกลง Supabase
            const rows = document.querySelectorAll('#sortable-table tbody tr');
            const updates = [];

            rows.forEach((row, index) => {
                const enrollmentId = row.dataset.enrollmentId;
                const newOrder = index + 1; // ลำดับใหม่ 1,2,3,...
                updates.push(
                    db.from('student_enrollments')
                        .update({ class_order: newOrder })
                        .eq('id', enrollmentId)
                );
            });

            return Promise.all(updates)
                .then(() => true)
                .catch(err => {
                    Swal.showValidationMessage(`บันทึกไม่สำเร็จ: ${err.message}`);
                    return false;
                });
        }
    });

    if (isConfirmed) {
        Swal.fire('สำเร็จ', 'บันทึกลำดับเลขที่เรียบร้อย', 'success');
    }
}

// ฟังก์ชันช่วย: อัปเดตตัวเลขแสดงผลในแถวหลังจากลาก (สำหรับ openRoomStudentOrder เดิม)
function updateOrderNumbers() {
    const rows = document.querySelectorAll('#sortable-table tbody tr');
    rows.forEach((row, i) => {
        const orderCell = row.querySelector('.order-number');
        if (orderCell) orderCell.textContent = i + 1;
    });
}

// ====================================================================
// จัดลำดับเลขที่นักเรียน (ลาก-วาง) — อัปเดต student_number จริง
// ====================================================================
async function openStudentNumberReorder() {
    const classId = document.getElementById('filterStudentClass').value;
    const classSelect = document.getElementById('filterStudentClass');
    const className = classSelect.options[classSelect.selectedIndex]?.text || '';

    if (!classId) {
        return Swal.fire({ icon: 'warning', title: 'กรุณาเลือกห้องเรียนก่อน', timer: 2000, showConfirmButton: false });
    }

    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: enrollments, error } = await db
        .from('student_enrollments')
        .select(`id, student_number, status, core_students!inner(student_id_card, prefix, first_name, last_name)`)
        .eq('classroom_id', classId)
        .order('student_number', { ascending: true });

    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    if (!enrollments || enrollments.length === 0) {
        return Swal.fire('ไม่มีข้อมูล', 'ไม่พบนักเรียนในห้องนี้', 'info');
    }

    Swal.close();

    let rowsHtml = '';
    enrollments.forEach((enr, idx) => {
        const s = enr.core_students;
        const num = enr.student_number ?? idx + 1;
        const stBadge = enr.status === 'เรียนปกติ'
            ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">เรียนปกติ</span>'
            : `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">${enr.status || '-'}</span>`;
        rowsHtml += `
      <tr data-enrollment-id="${enr.id}"
          class="reorder-row bg-white hover:bg-blue-50 border-b border-gray-100 cursor-grab active:cursor-grabbing transition-colors">
        <td class="p-2 text-center font-mono font-bold text-indigo-600 order-number w-12 select-none">${num}</td>
        <td class="p-2 text-sm font-bold text-blue-700 select-none">${s.student_id_card || '-'}</td>
        <td class="p-2 text-sm text-gray-800 select-none">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
        <td class="p-2 text-center select-none">${stBadge}</td>
        <td class="p-2 text-center text-gray-300 select-none drag-handle-cell">
          <i class="fas fa-grip-vertical"></i>
        </td>
      </tr>`;
    });

    const html = `
    <div class="flex items-center gap-2 text-xs text-blue-700 mb-3 bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
      <i class="fas fa-hand-pointer text-blue-500"></i>
      <span>ลากแถวขึ้น-ลงเพื่อจัดลำดับ — เลขที่จะอัปเดตอัตโนมัติ — กด <b>บันทึก</b> เพื่อยืนยัน</span>
    </div>
    <div class="overflow-auto rounded-xl border border-gray-200" style="max-height:55vh;">
      <table class="w-full border-collapse bg-white text-left" id="reorder-student-table">
        <thead class="bg-gray-50 sticky top-0 z-10">
          <tr class="text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <th class="p-2 text-center w-12">เลขที่</th>
            <th class="p-2">รหัสนักเรียน</th>
            <th class="p-2">ชื่อ-สกุล</th>
            <th class="p-2 text-center">สถานะ</th>
            <th class="p-2 w-10"></th>
          </tr>
        </thead>
        <tbody id="reorder-student-tbody">${rowsHtml}</tbody>
      </table>
    </div>`;

    const { isConfirmed } = await Swal.fire({
        title: `<span class="text-indigo-700"><i class="fas fa-sort-numeric-up-alt mr-2"></i>จัดลำดับเลขที่</span><span class="text-base font-normal text-gray-500 ml-2">${className}</span>`,
        html,
        width: '720px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึกเลขที่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#6b7280',
        showLoaderOnConfirm: true,
        didOpen: () => {
            const tbody = document.getElementById('reorder-student-tbody');
            if (!tbody || typeof Sortable === 'undefined') return;
            new Sortable(tbody, {
                animation: 180,
                ghostClass: 'opacity-30',
                chosenClass: 'bg-indigo-50',
                dragClass: 'shadow-lg',
                handle: '.reorder-row',
                onEnd: () => { _updateStudentOrderNumbers(); }
            });
        },
        preConfirm: async () => {
            const rows = document.querySelectorAll('#reorder-student-tbody tr');
            const updates = Array.from(rows).map((row, index) =>
                db.from('student_enrollments')
                    .update({ student_number: index + 1 })
                    .eq('id', row.dataset.enrollmentId)
            );
            try {
                const results = await Promise.all(updates);
                const failed = results.filter(r => r.error);
                if (failed.length > 0) {
                    Swal.showValidationMessage(`บันทึกไม่สำเร็จ: ${failed[0].error.message}`);
                    return false;
                }
                return true;
            } catch (err) {
                Swal.showValidationMessage(`เกิดข้อผิดพลาด: ${err.message}`);
                return false;
            }
        },
        allowOutsideClick: () => !Swal.isLoading()
    });

    if (isConfirmed) {
        await loadStudents();
        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ',
            text: 'อัปเดตลำดับเลขที่นักเรียนเรียบร้อยแล้ว',
            timer: 2000,
            showConfirmButton: false
        });
    }
}

// อัปเดตตัวเลขใน modal หลังจากลาก
function _updateStudentOrderNumbers() {
    document.querySelectorAll('#reorder-student-tbody tr').forEach((row, i) => {
        const cell = row.querySelector('.order-number');
        if (cell) cell.textContent = i + 1;
    });
}
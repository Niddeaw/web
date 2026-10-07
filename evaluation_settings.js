// ==========================================
// evaluation_settings.js
// ตั้งค่าระบบประเมินผล (super_admin เท่านั้น)
// ใช้ initModuleSidebar() จาก dashboard_ui.js + dashboard_sidebar.js
// ==========================================

// ==========================================
// ตัวแปรระบบ (Global)
// ==========================================
let currentUser = null;
let allPersonnel = [];
let isSuperAdmin = false;

// ==========================================
// Init
// ==========================================
$(document).ready(async function () {
    const t0 = performance.now();
    try {
        await checkAuth();
        if (isSuperAdmin) {
            await loadAdmins();
            await loadConfigs();
            document.getElementById('settingsContent').classList.remove('hidden');
        } else {
            document.getElementById('permissionDenied').classList.remove('hidden');
        }
        console.log(`⚡ Settings init: ${Math.round(performance.now() - t0)} ms`);
    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    }
});

// ==========================================
// ตรวจสอบสิทธิ์ (เฉพาะ super_admin)
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: profile } = await db
        .from('core_personnel')
        .select('*')
        .eq('id', session.user.id)
        .single();

    currentUser = profile;

    // ✅ [สำคัญ] ตั้ง window.currentUserRole เพื่อให้ dashboard_sidebar.js
    //    role filter ทำงาน (initModuleSidebar จะรอค่านี้)
    if (profile && profile.role) {
        window.currentUserRole = profile.role;
    }

    // ✅ UI มาตรฐานจาก dashboard_ui.js
    if (profile) {
        setUserDisplayName(profile);
        updateUserRoleLabel(profile.role);
        renderUserAvatar(profile);
    }

    // ✅ ตรวจสอบสิทธิ์
    if (profile && profile.role === 'super_admin') {
        isSuperAdmin = true;
        // หมายเหตุ: ไม่ต้อง $('nav-settings').removeClass('hidden') อีก
        //          เพราะ role filter ใน dashboard_sidebar.js จัดการให้แล้ว
    } else {
        isSuperAdmin = false;
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าใช้งาน',
            text: 'หน้านี้สำหรับ super_admin เท่านั้น',
            confirmButtonText: 'ตกลง'
        });
    }

    // ✅ Refresh topbar UI หลังโหลดโปรไฟล์
    if (typeof window.refreshEvaluationTopbarUI === 'function') {
        try { window.refreshEvaluationTopbarUI(); } catch (e) { /* ignore */ }
    }
}

// ==========================================
// แสดงรายชื่อ Admin ปัจจุบัน
// ==========================================
function displayAdminList() {
    const container = document.getElementById('admin_list_items');
    const countEl = document.getElementById('admin_count');
    if (!container) return;

    const admins = allPersonnel.filter(p => ['admin', 'super_admin'].includes(p.role));

    if (admins.length === 0) {
        container.innerHTML = `<span class="text-xs text-gray-400">ยังไม่มี Admin</span>`;
        if (countEl) countEl.textContent = '0 คน';
        return;
    }

    if (countEl) countEl.textContent = `${admins.length} คน`;

    let html = '';
    admins.forEach(p => {
        const isSuper = p.role === 'super_admin';
        const isCurrentUser = currentUser && p.id === currentUser.id;
        const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;

        const removeBtn = (!isSuper || !isCurrentUser) ? `
            <button onclick="removeAdmin('${p.id}', '${p.first_name} ${p.last_name}', ${isSuper})"
                    class="remove-btn" title="${isSuper ? 'ถอดถอน super_admin' : 'ลบ Admin'}">
                <i class="fa-solid fa-xmark"></i>
            </button>` : '';

        const youBadge = isCurrentUser ? '<span class="text-xs text-gray-400 ml-0.5">(คุณ)</span>' : '';

        html += `
            <span class="admin-pill ${isSuper ? 'super' : ''}">
                ${isSuper ? '👑' : '🛡️'} ${name}
                <span class="badge">${p.role}</span>
                ${removeBtn}
                ${youBadge}
            </span>`;
    });

    container.innerHTML = html;
}

// ==========================================
// ลบ/ถอดถอน Admin
// ==========================================
async function removeAdmin(userId, userName, isSuper) {
    if (isSuper) {
        const superAdmins = allPersonnel.filter(p => p.role === 'super_admin');
        if (superAdmins.length <= 1) {
            return Swal.fire({
                icon: 'error',
                title: '⚠️ ไม่สามารถถอดถอนได้',
                text: 'ต้องมี super_admin อย่างน้อย 1 คน',
                confirmButtonText: 'ตกลง'
            });
        }
    }
    if (currentUser && userId === currentUser.id) {
        return Swal.fire({
            icon: 'warning',
            title: '⚠️ ไม่สามารถถอดถอนตัวเองได้',
            text: 'คุณไม่สามารถถอดถอนตัวเองออกจาก Admin ได้',
            confirmButtonText: 'ตกลง'
        });
    }

    const result = await Swal.fire({
        icon: 'warning',
        title: `ยืนยันการ${isSuper ? 'ถอดถอน' : 'ลบ'} Admin`,
        html: `<p>คุณต้องการ${isSuper ? 'ถอดถอน' : 'ลบ'} <strong>${userName}</strong> ${isSuper ? '(super_admin)' : '(admin)'} ออกจากระบบใช่หรือไม่?</p>
               <p class="text-sm text-red-500 mt-2">⚠️ ผู้ใช้รายนี้จะเปลี่ยนเป็น <strong>teacher</strong></p>`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: `ใช่, ${isSuper ? 'ถอดถอน' : 'ลบ'}`,
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        await db.from('core_personnel').update({ role: 'teacher' }).eq('id', userId);
        Swal.close();
        showSaveStatus('saved', `✅ ถอดถอน ${userName} สำเร็จ`);
        await loadAdmins();
        Swal.fire({ icon: 'success', title: '✅ ถอดถอนสำเร็จ!', text: `${userName} ถูกเปลี่ยนเป็น teacher แล้ว`, timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('Error removing admin:', err);
        Swal.close();
        showSaveStatus('error', '❌ ' + err.message);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// โหลดรายชื่อ Admin
// ==========================================
async function loadAdmins() {
    try {
        const { data, error } = await db.from('core_personnel')
            .select('id, prefix, first_name, last_name, role')
            .in('role', ['super_admin', 'admin', 'director', 'deputy', 'teacher'])
            .order('first_name', { ascending: true });
        if (error) { console.error('Error loading personnel:', error); return; }

        allPersonnel = data || [];
        const select = document.getElementById('admin_user_select');
        const selectedValues = allPersonnel.filter(p => ['admin', 'super_admin'].includes(p.role)).map(p => p.id);

        select.innerHTML = '';
        allPersonnel.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            const roleMap = { 'super_admin': '👑 super_admin', 'admin': '🛡️ admin', 'director': '📋 director', 'deputy': '📋 deputy', 'teacher': '👨‍🏫 teacher' };
            opt.textContent = `${name} (${roleMap[p.role] || p.role})`;
            if (selectedValues.includes(p.id)) opt.selected = true;
            select.appendChild(opt);
        });

        if (select.tomselect) { select.tomselect.destroy(); select.tomselect = null; }

        setTimeout(() => {
            try {
                const ts = new TomSelect(select, {
                    plugins: ['remove_button', 'dropdown_input'],
                    maxItems: null,
                    placeholder: 'พิมพ์ค้นหาชื่อผู้ใช้...',
                    create: false,
                    sortField: 'text',
                    searchField: ['text'],
                    onChange: () => showSaveStatus('unsaved', '⏳ ยังไม่ได้บันทึกการเปลี่ยนแปลง')
                });
                select.tomselect = ts;
            } catch (err) { console.error('Error creating Tom Select:', err); }
        }, 100);

        displayAdminList();
    } catch (err) { console.error('Error in loadAdmins:', err); }
}

// ==========================================
// บันทึก Admin
// ==========================================
async function saveAdmins() {
    const select = document.getElementById('admin_user_select');
    let selectedValues = [];
    if (select.tomselect) {
        const values = select.tomselect.getValue();
        if (Array.isArray(values)) selectedValues = values.map(id => String(id));
        else if (typeof values === 'string' && values) selectedValues = values.split(',').filter(id => id.trim() !== '');
    } else {
        selectedValues = Array.from(select.selectedOptions).map(opt => opt.value);
    }

    if (selectedValues.length === 0) {
        return Swal.fire({ icon: 'warning', title: '⚠️ ต้องมี Admin อย่างน้อย 1 คน', text: 'กรุณาเลือกผู้ใช้เป็น Admin อย่างน้อย 1 คน', confirmButtonText: 'ตกลง' });
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const superAdmins = allPersonnel.filter(p => p.role === 'super_admin');
        const superAdminIds = superAdmins.map(p => p.id);
        const remainingSuperAdmins = superAdminIds.filter(id => selectedValues.includes(id));

        if (remainingSuperAdmins.length === 0 && superAdmins.length > 0) {
            Swal.close();
            await Swal.fire({ icon: 'warning', title: '⚠️ ต้องมี super_admin อย่างน้อย 1 คน', text: 'คุณกำลังจะลบ super_admin ทั้งหมด', confirmButtonText: 'ตกลง' });
            return;
        }

        for (const id of selectedValues) {
            const user = allPersonnel.find(p => p.id === id);
            if (user && user.role !== 'super_admin') {
                await db.from('core_personnel').update({ role: 'admin' }).eq('id', id);
            }
        }
        const allAdminIds = allPersonnel.filter(p => ['admin', 'super_admin'].includes(p.role)).map(p => p.id);
        for (const id of allAdminIds) {
            if (!selectedValues.includes(id)) {
                const user = allPersonnel.find(p => p.id === id);
                if (user && user.role !== 'super_admin') {
                    await db.from('core_personnel').update({ role: 'teacher' }).eq('id', id);
                }
            }
        }

        Swal.close();
        showSaveStatus('saved', `✅ เลือก Admin ${selectedValues.length} คน`);
        await loadAdmins();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('Error saving admins:', err);
        Swal.close();
        showSaveStatus('error', '❌ ' + err.message);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Debug Admins
// ==========================================
async function debugAdmins() {
    const { data, error } = await db.from('core_personnel').select('id, first_name, last_name, role').in('role', ['admin', 'super_admin']);
    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    let msg = '📊 Admin ในระบบ:\n';
    if (data.length === 0) msg += 'ไม่มี Admin';
    else data.forEach(p => { msg += `- ${p.first_name} ${p.last_name} (${p.role})\n`; });
    Swal.fire({ title: '📊 Admin ในระบบ', text: msg, confirmButtonText: 'ตกลง' });
}

// ==========================================
// Force Reload
// ==========================================
async function forceReloadAdmins() {
    Swal.fire({ title: 'กำลังโหลดใหม่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    await loadAdmins();
    Swal.close();
    Swal.fire({ icon: 'success', title: 'โหลดใหม่สำเร็จ!', timer: 1000, showConfirmButton: false });
}

// ==========================================
// โหลดการตั้งค่า
// ==========================================
async function loadConfigs() {
    try {
        const { data, error } = await db.from('system_configs').select('*').eq('category', 'evaluation').maybeSingle();
        if (error) { console.warn('system_configs table may not exist yet:', error); return; }
        if (data) {
            const config = data.config || {};
            document.getElementById('gas_api_url').value = config.gas_api_url || '';
            document.getElementById('gas_api_key').value = config.gas_api_key || '';
            document.getElementById('drive_folder_id').value = config.drive_folder_id || '';
            document.getElementById('slide_template_1').value = config.slide_template_1 || '';
            document.getElementById('slide_template_2').value = config.slide_template_2 || '';
            document.getElementById('slide_template_3').value = config.slide_template_3 || '';
            document.getElementById('slide_template_4').value = config.slide_template_4 || '';
            document.getElementById('allow_self_edit').checked = config.allow_self_edit !== false;
            document.getElementById('allow_committee_edit').checked = config.allow_committee_edit !== false;
            const editMode = config.edit_mode || 'all';
            document.querySelectorAll('input[name="edit_mode"]').forEach(input => { input.checked = input.value === editMode; });
            updateToggleUI(editMode);
        }
        showSaveStatus('saved', '✅ โหลดข้อมูลสำเร็จ');
    } catch (err) { console.error('Error loading configs:', err); showSaveStatus('error', '❌ โหลดข้อมูลล้มเหลว'); }
}

// ==========================================
// UI Toggle
// ==========================================
function updateToggleUI(value) {
    document.querySelectorAll('.toggle-option').forEach(el => { el.classList.toggle('active', el.dataset.value === value); });
}

document.querySelectorAll('input[name="edit_mode"]').forEach(input => {
    input.addEventListener('change', function () { updateToggleUI(this.value); });
});

// ==========================================
// Save Status
// ==========================================
function showSaveStatus(type, message) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    const badges = {
        saved: '<span class="status-badge saved">✅ บันทึกแล้ว</span>',
        unsaved: '<span class="status-badge unsaved">⏳ ยังไม่บันทึก</span>',
        error: '<span class="status-badge error">❌ ผิดพลาด</span>'
    };
    el.innerHTML = `${badges[type] || ''} <span class="text-sm text-gray-500 ml-2">${message || ''}</span>`;
    if (type === 'saved') { setTimeout(() => { el.innerHTML = ''; }, 3000); }
}

// ==========================================
// Save Functions
// ==========================================
async function saveGASConfig() {
    await saveSystemConfig({
        gas_api_url: document.getElementById('gas_api_url').value.trim(),
        gas_api_key: document.getElementById('gas_api_key').value.trim()
    }, 'บันทึก GAS API สำเร็จ');
}
async function saveDriveConfig() {
    await saveSystemConfig({
        drive_folder_id: document.getElementById('drive_folder_id').value.trim()
    }, 'บันทึก Drive Config สำเร็จ');
}
async function saveSlideTemplates() {
    await saveSystemConfig({
        slide_template_1: document.getElementById('slide_template_1').value.trim(),
        slide_template_2: document.getElementById('slide_template_2').value.trim(),
        slide_template_3: document.getElementById('slide_template_3').value.trim(),
        slide_template_4: document.getElementById('slide_template_4').value.trim()
    }, 'บันทึก Slide Templates สำเร็จ');
}
async function saveGeneralSettings() {
    await saveSystemConfig({
        allow_self_edit: document.getElementById('allow_self_edit').checked,
        allow_committee_edit: document.getElementById('allow_committee_edit').checked,
        edit_mode: document.querySelector('input[name="edit_mode"]:checked')?.value || 'all'
    }, 'บันทึกตั้งค่าทั่วไปสำเร็จ');
}

// ==========================================
// Save System Config (กลาง)
// ==========================================
async function saveSystemConfig(newConfig, successMessage = 'บันทึกสำเร็จ!') {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: existing, error: loadError } = await db.from('system_configs').select('*').eq('category', 'evaluation').maybeSingle();
        if (loadError && loadError.code !== 'PGRST116') throw loadError;

        const config = existing?.config || {};
        Object.assign(config, newConfig);

        let result;
        if (existing) {
            const { data, error } = await db.from('system_configs').update({ config, updated_at: new Date().toISOString() }).eq('id', existing.id).select();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await db.from('system_configs').insert([{ category: 'evaluation', config, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]).select();
            if (error) throw error;
            result = data;
        }

        Swal.close();
        showSaveStatus('saved', `✅ ${successMessage}`);
        await loadConfigs();
        Swal.fire({ icon: 'success', title: '✅ ' + successMessage, timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('Error saving config:', err);
        Swal.close();
        if (err.message?.includes('relation "system_configs" does not exist')) {
            const confirm = await Swal.fire({
                icon: 'info',
                title: 'ต้องสร้างตาราง system_configs',
                text: 'ต้องการสร้างหรือไม่?',
                showCancelButton: true,
                confirmButtonText: 'สร้างเลย',
                cancelButtonText: 'ยกเลิก'
            });
            if (confirm.isConfirmed) {
                await createSystemConfigsTable();
                await saveSystemConfig(newConfig, successMessage);
            }
        } else {
            showSaveStatus('error', '❌ ' + err.message);
            Swal.fire('ผิดพลาด', err.message, 'error');
        }
    }
}

// ==========================================
// สร้างตาราง system_configs
// ==========================================
async function createSystemConfigsTable() {
    const sql = `
        DROP TABLE IF EXISTS system_configs CASCADE;
        CREATE TABLE system_configs (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            category TEXT NOT NULL,
            config JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX idx_system_configs_category ON system_configs(category);
        ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow admins full access" ON system_configs;
        CREATE POLICY "Allow admins full access" ON system_configs FOR ALL
        USING (EXISTS (SELECT 1 FROM core_personnel WHERE core_personnel.id = auth.uid() AND core_personnel.role IN ('admin', 'super_admin')));
        DROP POLICY IF EXISTS "Allow users view" ON system_configs;
        CREATE POLICY "Allow users view" ON system_configs FOR SELECT USING (true);
        INSERT INTO system_configs (category, config) VALUES ('evaluation', '{}'::jsonb);
    `;
    try {
        const { error } = await db.rpc('exec_sql', { query: sql });
        if (error) throw error;
        Swal.fire('สำเร็จ', 'สร้างตาราง system_configs เรียบร้อย', 'success');
    } catch (err) {
        console.error('Error creating table:', err);
        Swal.fire('ผิดพลาด', 'กรุณาสร้างตาราง system_configs ด้วย SQL ใน Supabase Dashboard', 'error');
    }
}

// ==========================================
// Expose Globals (สำหรับ onclick="...")
// ==========================================
window.saveAdmins = saveAdmins;
window.saveGASConfig = saveGASConfig;
window.saveDriveConfig = saveDriveConfig;
window.saveSlideTemplates = saveSlideTemplates;
window.saveGeneralSettings = saveGeneralSettings;
window.debugAdmins = debugAdmins;
window.forceReloadAdmins = forceReloadAdmins;
window.removeAdmin = removeAdmin;

console.log('✅ evaluation_settings.js loaded successfully');
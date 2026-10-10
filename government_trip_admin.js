// ============================================================
// government_trip_admin.js — ระบบขอไปราชการ (ฝ่ายบริหาร) ฉบับสมบูรณ์
// ============================================================

let tripCurrentUser = null;
let tripCurrentProfile = null;
let tripCurrentUserRole = '';
let tripIsAdminMode = false;
let tripIsModuleAdmin = false;
let tripDataTable = null;
let tripSystemSettings = null;
let allTripsData = [];
let allPersonnelData = [];
let tripAcademicPersonnelId = null;
window.academicPersonnelId = null;

// ==========================================
// Nav buttons
// ==========================================
window.refreshTripAdminNavButtons = function () {
    const role = tripCurrentUserRole || sessionStorage.getItem('wrk_trip_role') || '';
    const allowedRoles = ['super_admin', 'admin', 'director', 'deputy'];
    const canSee = allowedRoles.includes(role) || tripIsModuleAdmin;
    if (canSee) {
        document.getElementById('btnNavTeacher')?.classList.remove('hidden');
        document.getElementById('btnNavDeptHead')?.classList.remove('hidden');
    }
};

// ==========================================
// Default settings
// ==========================================
function getDefaultTripSettings() {
    return {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        sign_admin: '',
        gas_url: '', slide_template_id: '', pdf_folder_id: '', 
        evidence_folder_id: '', signature_folder_id: ''
    };
}

// ==========================================
// Helper: needs ack
// ==========================================
function needsTripHeadAck(t) {
    if (typeof window.needsTripHeadAckByDept === 'function') {
        return window.needsTripHeadAckByDept(t, window.allDeptHeads);
    }
    return false;
}

function needsTripAcademicAck(t) {
    if (typeof window.needsTripAcademicAckByLeave === 'function') {
        return window.needsTripAcademicAckByLeave(t, window.allDeptHeads);
    }
    return false;
}

function getTripHeadAckStatus(t) {
    if (t.ack_head) return { icon: '✅', color: 'emerald', label: 'รับทราบแล้ว' };
    if (!needsTripHeadAck(t)) return { icon: '—', color: 'slate', label: 'ไม่ต้องรับทราบ' };
    return { icon: '⏳', color: 'amber', label: 'รอรับทราบ' };
}

// ==========================================
// INIT
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const session = await checkSessionAndRole('government_trip_admin');
        if (!session) return;
        const { user, personnel, role, isAdmin } = session;

        tripCurrentUser = user;
        tripCurrentProfile = personnel;
        tripCurrentUserRole = role;
        tripIsAdminMode = isAdmin;

        window.currentUser = user;
        window.currentProfile = personnel;
        window.currentUserRole = role;

        tripIsModuleAdmin = await hasModuleAccess(role, 'government_trip', user.id);

        sessionStorage.setItem('wrk_trip_role', role);
        sessionStorage.setItem('wrk_trip_is_module_admin', tripIsModuleAdmin ? '1' : '0');

        if (!isAdmin && !tripIsModuleAdmin) {
            await Swal.fire({
                icon: 'warning', title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้ระบบนี้',
                confirmButtonText: 'กลับหน้าหลัก'
            });
            window.location.href = 'index.html';
            return;
        }

        await logUserAction('เข้าสู่ระบบจัดการขอไปราชการ (Admin)', 'government_trip');

        const [_, deptHeads] = await Promise.all([
            loadTripPersonnelSearch(),
            db.from('core_department_heads').select('personnel_id, department_id, department_name')
                .then(({ data }) => data || [])
                .catch(err => { console.warn(err); return []; }),
            loadTripSystemSettings()
        ]);
        window.allDeptHeads = deptHeads;

        // ✅ หา academicPersonnelId
        try {
            const { data: school } = await db.from('core_school_info').select('deputy_academic').single();
            if (school?.deputy_academic) {
                const cleanName = school.deputy_academic.replace(
                    /^(นาย|นาง|นางสาว|ด.ต.|ร.ต.|ว่าที่ ร\.ต\.|พระ|สามเณร|หม่อมหลวง|หม่อมหลวงหญิง)\s*/, ''
                ).trim();
                const parts = cleanName.split(/\s+/);
                if (parts.length >= 2) {
                    const { data: person } = await db.from('core_personnel')
                        .select('id').ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts[1]}%`)
                        .maybeSingle();
                    if (person) {
                        tripAcademicPersonnelId = person.id;
                        window.academicPersonnelId = person.id;
                        console.log('✅ รองวิชาการ ID:', person.id);
                    }
                }
            }
        } catch (err) {
            console.warn('⚠️ หา academicPersonnelId ไม่สำเร็จ:', err);
        }

        await loadTripDashboardStats();
        updateTripUI();
        initAdminTripFlatpickr();

        window.refreshTripAdminNavButtons();

        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// Update UI
// ==========================================
function updateTripUI() {
    setUserDisplayName(tripCurrentProfile);
    updateUserRoleLabel(tripCurrentUserRole);
    renderUserAvatar(tripCurrentProfile);

    const isSuperAdmin = canManageSettings(tripCurrentUserRole);
    if (isSuperAdmin) {
        $('#trip_fiscal_year, #trip_evaluation_round, #btn-save-trip-settings, #select-new-trip-admin, #btn-add-trip-admin, #trip_sign_admin').prop('disabled', false);
    } else {
        $('#trip_fiscal_year, #trip_evaluation_round, #btn-save-trip-settings, #select-new-trip-admin, #btn-add-trip-admin, #trip_sign_admin').prop('disabled', true);
    }
    window.refreshTripAdminNavButtons();
}

// ==========================================
// Tab switch
// ==========================================
window.switchTripAdminTab = function (tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');

    const navMap = { 'dashboard': 'btn-dashboard', 'manage': 'btn-manage', 'settings': 'btn-settings' };
    if (navMap[tabId] && typeof setActiveNavItem === 'function') setActiveNavItem(navMap[tabId]);

    const titles = {
        'dashboard': 'แดชบอร์ดขอไปราชการ',
        'manage': 'จัดการรายการขอไปราชการ',
        'settings': 'ตั้งค่าระบบ & แอดมิน'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || 'แดชบอร์ด';

    if (window.innerWidth < 761 && typeof toggleSidebar === 'function') toggleSidebar(false);
    if (tabId === 'manage' && tripDataTable) tripDataTable.columns.adjust().draw();
};

// ==========================================
// System settings
// ==========================================
async function loadTripSystemSettings() {
    const DEFAULT = getDefaultTripSettings();
    try {
        const { data, error } = await db.from('core_system_modules').select('settings').eq('module_id', 'government_trip').maybeSingle();
        if (error) console.warn('loadTripSystemSettings query error:', error);

        const dbSettings = data?.settings || {};
        tripSystemSettings = { ...DEFAULT, ...dbSettings };

        if (!tripSystemSettings.fiscal_year) tripSystemSettings.fiscal_year = DEFAULT.fiscal_year;
        if (!tripSystemSettings.eval_round) tripSystemSettings.eval_round = DEFAULT.eval_round;

        const noRow = !data;
        if (noRow) {
            await db.from('core_system_modules').insert({
                module_id: 'government_trip',
                module_name: 'ระบบขออนุญาตไปราชการ',
                description: 'ระบบยื่นใบขออนุญาตไปราชการ',
                icon: 'fa-solid fa-plane-departure',
                url: 'government_trip_teacher.html',
                category: 'personnel',
                is_active: true,
                settings: tripSystemSettings,
                updated_at: new Date().toISOString()
            });
        }

        const fiscalEl = document.getElementById('trip_fiscal_year');
        if (fiscalEl) fiscalEl.value = tripSystemSettings.fiscal_year;
        const roundEl = document.getElementById('trip_evaluation_round');
        if (roundEl) roundEl.value = tripSystemSettings.eval_round;
        const badge = document.getElementById('dash-fiscal-badge');
        if (badge) badge.textContent = `ปีงบประมาณ ${tripSystemSettings.fiscal_year} (รอบที่ ${tripSystemSettings.eval_round})`;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        setVal('trip_gas_url', tripSystemSettings.gas_url);
        setVal('trip_slide_template_id', tripSystemSettings.slide_template_id);
        setVal('trip_pdf_folder_id', tripSystemSettings.pdf_folder_id);
        setVal('trip_evidence_folder_id', tripSystemSettings.evidence_folder_id);
        setVal('trip_signature_folder_id', tripSystemSettings.signature_folder_id);

        const sigDisplay = document.getElementById('trip-sig-folder-id-display');
        if (sigDisplay) sigDisplay.textContent = tripSystemSettings.signature_folder_id || 'ยังไม่ได้ตั้งค่า';

        const signAdminEl = document.getElementById('trip_sign_admin');
        if (signAdminEl) {
            if (signAdminEl.tomselect) { try { signAdminEl.tomselect.setValue(tripSystemSettings.sign_admin || ''); } catch (e) { } }
            else signAdminEl.value = tripSystemSettings.sign_admin || '';
        }

        const { data: schoolData } = await db.from('core_school_info').select('*').single();
        if (schoolData) {
            const dirEl = document.getElementById('display_trip_director');
            if (dirEl) dirEl.textContent = schoolData.director_name || 'ไม่ได้ตั้งค่าในส่วนกลาง';
            const hrEl = document.getElementById('display_trip_deputy_hr');
            if (hrEl) hrEl.textContent = schoolData.deputy_hr || 'ไม่ได้ตั้งค่าในส่วนกลาง';
            const acadEl = document.getElementById('display_trip_deputy_academic');
            if (acadEl) acadEl.textContent = schoolData.deputy_academic || 'ไม่ได้ตั้งค่าในส่วนกลาง';
        }

        return tripSystemSettings;
    } catch (err) {
        console.error('loadTripSystemSettings error:', err);
        tripSystemSettings = { ...DEFAULT };
        return tripSystemSettings;
    }
}

window.saveTripSystemSettings = async function (e) {
    e.preventDefault();
    if (!requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น')) return;

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const newSettings = {
        fiscal_year: $('#trip_fiscal_year').val().trim(),
        eval_round: $('#trip_evaluation_round').val(),
        sign_admin: $('#trip_sign_admin').val() || '',
        gas_url: $('#trip_gas_url').val().trim(),
        slide_template_id: $('#trip_slide_template_id').val().trim(),
        pdf_folder_id: $('#trip_pdf_folder_id').val().trim(),
        evidence_folder_id: $('#trip_evidence_folder_id').val().trim(),
        signature_folder_id: $('#trip_signature_folder_id').val().trim()
    };

    try {
        const { error } = await db.from('core_system_modules').upsert({
            module_id: 'government_trip',
            module_name: 'ระบบขออนุญาตไปราชการ',
            description: 'ระบบยื่นใบขออนุญาตไปราชการ',
            icon: 'fa-solid fa-plane-departure',
            url: 'government_trip_teacher.html',
            category: 'personnel',
            is_active: true,
            settings: newSettings,
            updated_at: new Date().toISOString()
        }, { onConflict: 'module_id' });

        if (error) throw error;

        tripSystemSettings = newSettings;
        window.systemSettings = newSettings;

        const badge = document.getElementById('dash-fiscal-badge');
        if (badge) badge.textContent = `ปีงบประมาณ ${tripSystemSettings.fiscal_year} (รอบที่ ${tripSystemSettings.eval_round})`;

        const sigDisplay = document.getElementById('trip-sig-folder-id-display');
        if (sigDisplay) sigDisplay.textContent = tripSystemSettings.signature_folder_id || 'ยังไม่ได้ตั้งค่า';

        await logUserAction(`บันทึกการตั้งค่าระบบไปราชการ (ปี ${tripSystemSettings.fiscal_year})`, 'government_trip');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        loadTripDashboardStats();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// Load personnel
// ==========================================
async function loadTripPersonnelSearch() {
    const { data } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, department, position, academic_standing')
        .order('first_name');
    allPersonnelData = data || [];

    if (data) {
        let htmlSearch = '<option value="">-- พิมพ์เพื่อค้นหา --</option>';
        data.forEach(p => {
            const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            htmlSearch += `<option value="${p.id}">${name}</option>`;
        });

        const initTS = (selector, options = {}) => {
            const el = document.querySelector(selector);
            if (!el) return;
            if (el.tomselect) el.tomselect.destroy();
            el.innerHTML = htmlSearch;
            new TomSelect(el, { create: false, dropdownParent: 'body', ...options });
        };

        initTS('#select-new-trip-admin', { placeholder: '-- พิมพ์ค้นหาชื่อบุคลากร --' });
        initTS('#filter-trip-personnel', { placeholder: '-- ดูข้อมูลทุกคน --', allowEmptyOption: true });
        initTS('#trip_sign_admin', { placeholder: '-- เลือกผู้รับผิดชอบ --' });
        initTS('#admin_trip_personnel_id', { placeholder: '-- เลือกบุคลากร --' });
    }
    if (tripCurrentUserRole === 'super_admin' || tripIsModuleAdmin) loadTripAdminList();
}

// ==========================================
// Module Admins
// ==========================================
async function loadTripAdminList() {
    const tbody = document.getElementById('trip-admin-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">กำลังโหลด...</td></tr>';

    const { data: admins, error } = await db.from('core_module_admins')
        .select('id, user_id').eq('module_id', 'government_trip');

    if (error || !admins || admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบ</td></tr>';
        return;
    }

    const userIds = admins.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel').select('id, prefix, first_name, last_name').in('id', userIds);
    const map = {};
    (personnel || []).forEach(p => { map[p.id] = p; });

    tbody.innerHTML = admins.map(a => {
        const p = map[a.user_id];
        const name = p ? `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() : `(ID: ${a.user_id})`;
        return `<tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="p-3 font-bold text-slate-700">${name}</td>
            <td class="p-3 text-center"><button onclick="removeTripModuleAdmin('${a.id}')" class="text-rose-500 hover:text-white hover:bg-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    }).join('');
}

window.addTripModuleAdmin = async function () {
    if (!requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    const userId = $('#select-new-trip-admin').val();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากรก่อนครับ', 'warning');

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('core_module_admins').insert({ user_id: userId, module_id: 'government_trip' });
    if (error) {
        if (error.code === '23505') Swal.fire('ซ้ำซ้อน', 'บุคลากรท่านนี้เป็นแอดมินอยู่แล้ว', 'warning');
        else Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        await logUserAction(`แต่งตั้ง Module Admin ไปราชการ (ID: ${userId})`, 'government_trip');
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
        const el = document.getElementById('select-new-trip-admin');
        if (el && el.tomselect) el.tomselect.clear();
        loadTripAdminList();
    }
};

window.removeTripModuleAdmin = async function (id) {
    if (!requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    Swal.fire({ title: 'กำลังลบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('core_module_admins').delete().eq('id', id);
    if (!error) {
        await logUserAction(`ถอดถอน Module Admin ไปราชการ (ID: ${id})`, 'government_trip');
        Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ', timer: 1500, showConfirmButton: false });
        loadTripAdminList();
    } else Swal.fire('ผิดพลาด', error.message, 'error');
};

// ==========================================
// Dashboard Stats
// ==========================================
async function loadTripDashboardStats() {
    try {
        if (!tripSystemSettings || !tripSystemSettings.fiscal_year) {
            await loadTripSystemSettings();
        }

        const { data, error } = await db.from('government_trip_requests')
            .select('*, core_personnel!personnel_id(prefix, first_name, last_name, department, position, role)')
            .eq('fiscal_year', tripSystemSettings.fiscal_year)
            .eq('eval_round', tripSystemSettings.eval_round);

        if (error) {
            console.error('Query error:', error);
            // Fallback
            const { data: fallbackData } = await db.from('government_trip_requests')
                .select('*')
                .eq('fiscal_year', tripSystemSettings.fiscal_year)
                .eq('eval_round', tripSystemSettings.eval_round);

            if (fallbackData && fallbackData.length > 0) {
                const pids = [...new Set(fallbackData.map(t => t.personnel_id))];
                const { data: personnel } = await db.from('core_personnel')
                    .select('id, prefix, first_name, last_name, department, position, role')
                    .in('id', pids);
                const pmap = {};
                (personnel || []).forEach(p => { pmap[p.id] = p; });
                fallbackData.forEach(t => { t.core_personnel = pmap[t.personnel_id] || {}; });
            }
            allTripsData = fallbackData || [];
        } else {
            allTripsData = data || [];
        }

        console.log('✅ Loaded trips:', allTripsData.length);

        const approved = allTripsData.filter(t => t.status === 'อนุมัติ');
        const pending = allTripsData.filter(t => t.status === 'รออนุมัติ');
        const rejected = allTripsData.filter(t => t.status === 'ไม่อนุมัติ');

        $('#total-all').html(`${allTripsData.length} <span class="text-sm font-medium text-slate-500">รายการ</span>`);
        $('#total-pending').html(`${pending.length}`);
        $('#total-approved').html(`${approved.length}`);
        $('#total-rejected').html(`${rejected.length}`);

        renderTripAlerts(pending);
        renderTripTable();

    } catch (err) {
        console.error('loadTripDashboardStats error:', err);
        $('#alert-zone').html(`<div class="text-red-500 text-sm">${err.message}</div>`);
        allTripsData = [];
        try { renderTripTable(); } catch (e) { console.error(e); }
    }
}

// ==========================================
// Alert Zone (5 stages)
// ==========================================
function renderTripAlerts(pending) {
    const alertZone = $('#alert-zone');
    alertZone.empty();

    if (pending.length === 0) {
        alertZone.html('<div class="text-center text-emerald-500 py-4 text-sm font-bold"><i class="fas fa-check-circle mr-2"></i> ไม่มีรายการที่รอดำเนินการ</div>');
        return;
    }

    const grouped = {
        academic: [], head: [], admin: [], deputy_hr: [], director: []
    };

    pending.forEach(t => {
        const needsAcademic = needsTripAcademicAck(t);
        const needsHead = needsTripHeadAck(t);

        if (needsAcademic && !t.ack_academic) { grouped.academic.push(t); return; }
        if (needsHead && !t.ack_head) { grouped.head.push(t); return; }
        if (!t.ack_admin) { grouped.admin.push(t); return; }
        if (!t.ack_deputy_hr) { grouped.deputy_hr.push(t); return; }
        grouped.director.push(t);
    });

    const stages = [
        { key: 'academic', label: 'รอรอง ผอ.กลุ่มบริหารวิชาการ รับทราบ', color: 'rose', icon: 'fa-user-graduate' },
        { key: 'head', label: 'รอหัวหน้ากลุ่มสาระฯ รับทราบ', color: 'purple', icon: 'fa-users' },
        { key: 'admin', label: 'รอแอดมินรับทราบ', color: 'amber', icon: 'fa-user-shield' },
        { key: 'deputy_hr', label: 'รอรอง ผอ.กลุ่มบริหารงานบุคคล รับทราบ', color: 'indigo', icon: 'fa-user-tie' },
        { key: 'director', label: 'รอผู้อำนวยการอนุมัติ', color: 'sky', icon: 'fa-crown' }
    ];

    stages.forEach(stage => {
        const list = grouped[stage.key];
        if (list.length === 0) return;

        const rowsHtml = list.map(t => {
            const name = t.core_personnel
                ? `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`
                : '-';

            let actionBtns = '';
            if (stage.key === 'academic') {
                actionBtns = `<button onclick="window.acknowledgeTripAcademic('${t.id}')" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-user-graduate mr-1"></i> รับทราบ</button>`;
            } else if (stage.key === 'head') {
                actionBtns = `<button onclick="window.acknowledgeTripHead('${t.id}')" class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-user-check mr-1"></i> รับทราบ</button>`;
            } else if (stage.key === 'admin') {
                actionBtns = `<button onclick="window.acknowledgeTripAdmin('${t.id}')" class="bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-check mr-1"></i> รับทราบ</button>`;
            } else if (stage.key === 'deputy_hr') {
                actionBtns = `<button onclick="window.acknowledgeTripDeputyHR('${t.id}')" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-user-tie mr-1"></i> รับทราบ</button>`;
            } else {
                actionBtns = `<button onclick="window.updateTripStatus('${t.id}', 'อนุมัติ')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-thumbs-up mr-1"></i> อนุมัติ</button>
                              <button onclick="window.rejectTrip('${t.id}')" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"><i class="fas fa-thumbs-down mr-1"></i> ไม่อนุมัติ</button>`;
            }

            return `
                <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:shadow-sm transition">
                    <button onclick="window.viewAdminTrip('${t.id}')" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition flex-shrink-0" title="ดูรายละเอียด"><i class="fas fa-eye text-xs"></i></button>
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-slate-800 truncate">${name}</div>
                        <div class="text-[11px] text-slate-500 truncate" title="${t.title}">${t.title}</div>
                    </div>
                    <div class="flex gap-1 flex-shrink-0">${actionBtns}</div>
                </div>`;
        }).join('');

        alertZone.append(`
            <div class="p-3 bg-${stage.color}-50 border border-${stage.color}-200 rounded-xl shadow-sm mb-2">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fas ${stage.icon} text-${stage.color}-500"></i>
                    <span class="font-bold text-slate-800 text-sm">${stage.label}</span>
                    <span class="ml-auto text-xs bg-${stage.color}-100 text-${stage.color}-700 font-bold px-2 py-0.5 rounded-full">${list.length} รายการ</span>
                </div>
                <div class="space-y-1.5">${rowsHtml}</div>
            </div>
        `);
    });
}

// ==========================================
// Render table
// ==========================================
function renderTripTable() {
    if ($.fn.DataTable.isDataTable('#adminTripTable')) $('#adminTripTable').DataTable().destroy();
    const tbody = document.getElementById('tb-admin-trip');
    const role = tripCurrentUserRole;
    const isSuperAdmin = role === 'super_admin';
    const isDirector = role === 'director';
    const isDeputy = role === 'deputy';
    const isAdmin = role === 'admin';

    const canApprove = isSuperAdmin || isDirector;

    if (allTripsData.length > 0) {
        tbody.innerHTML = allTripsData.map(t => {
            const fullName = `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`;
            const safeName = fullName.replace(/'/g, "\\'");
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };

            const isRejected = t.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : t.total_days;

            let statusHtml = '';
            if (t.status === 'รออนุมัติ') statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>';
            else if (t.status === 'อนุมัติ') statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>';
            else {
                const safeComment = t.reject_comment ? t.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showTripRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ</button>`;
            }

            const headStatus = getTripHeadAckStatus(t);
            const needsAcademic = needsTripAcademicAck(t);

            const ackHtml = `
                <div class="flex flex-col items-start text-xs space-y-0.5">
                    ${needsAcademic
                        ? `<span class="font-medium ${t.ack_academic ? 'text-emerald-600' : 'text-amber-600'}">รองวิชาการ: ${t.ack_academic ? '✅' : '⏳'}</span>`
                        : `<span class="font-medium text-${headStatus.color}-600">หัวหน้ากลุ่มฯ: ${headStatus.icon}</span>`
                    }
                    <span class="font-medium text-slate-600">แอดมิน: ${t.ack_admin ? '✅' : '⏳'}</span>
                    <span class="font-medium text-slate-600">รอง ผอ.บุคคล: ${t.ack_deputy_hr ? '✅' : '⏳'}</span>
                    ${t.status === 'อนุมัติ' ? '<span class="font-bold text-emerald-600">ผอ.: ✅</span>' : ''}
                </div>
            `;

            let pdfHtml = '';
            if (t.pdf_url) {
                pdfHtml = `<a href="${t.pdf_url}" target="_blank" class="btn-icon bg-green-50 text-green-600 hover:bg-green-500 hover:text-white" title="เปิด PDF"><i class="fas fa-file-pdf"></i></a>
                           <button onclick="window.generateTripPDF('${t.id}', tripSystemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้างใหม่"><i class="fas fa-sync-alt"></i></button>`;
            } else {
                pdfHtml = `<button onclick="window.generateTripPDF('${t.id}', tripSystemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้าง PDF"><i class="fas fa-print"></i></button>`;
            }

            const viewBtn = `<button onclick="viewAdminTrip('${t.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="ดู"><i class="fas fa-eye"></i></button>`;

            let ackBtn = '';

            // ปุ่มรับทราบแทนรองวิชาการ
            const isAcademicUser = (tripCurrentUser?.id === window.academicPersonnelId);
            if (needsTripAcademicAck(t) && !t.ack_academic) {
                if (isSuperAdmin) {
                    ackBtn += `<button onclick="window.acknowledgeTripAcademic('${t.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="รับทราบแทนรองวิชาการ"><i class="fas fa-user-graduate"></i></button>`;
                } else if (isAcademicUser) {
                    ackBtn += `<button onclick="window.acknowledgeTripAcademic('${t.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="รับทราบ"><i class="fas fa-check"></i></button>`;
                }
            }

            // ปุ่มหัวหน้ากลุ่มฯ
            if (isSuperAdmin && needsTripHeadAck(t) && !t.ack_head) {
                ackBtn += `<button onclick="window.acknowledgeTripHead('${t.id}')" class="btn-icon bg-purple-50 text-purple-600 hover:bg-purple-500 hover:text-white" title="รับทราบแทนหัวหน้ากลุ่มฯ"><i class="fas fa-user-check"></i></button>`;
            }

            // ปุ่มแอดมิน
            if (isSuperAdmin && !t.ack_admin) {
                ackBtn += `<button onclick="acknowledgeTripAdmin('${t.id}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="รับทราบแทนแอดมิน"><i class="fas fa-check"></i></button>`;
            } else if (isAdmin && !t.ack_admin) {
                ackBtn += `<button onclick="acknowledgeTripAdmin('${t.id}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="รับทราบ"><i class="fas fa-check"></i></button>`;
            }

            // ปุ่มรอง ผอ.บุคคล
            if (isSuperAdmin && !t.ack_deputy_hr) {
                ackBtn += `<button onclick="acknowledgeTripDeputyHR('${t.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="รับทราบแทนรอง ผอ.บุคคล"><i class="fas fa-user-tie"></i></button>`;
            } else if (isDeputy && !t.ack_deputy_hr) {
                ackBtn += `<button onclick="acknowledgeTripDeputyHR('${t.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="รับทราบ"><i class="fas fa-user-tie"></i></button>`;
            }

            const approveBtn = (canApprove && t.status === 'รออนุมัติ')
                ? `<button onclick="updateTripStatus('${t.id}', 'อนุมัติ')" class="btn-icon bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white" title="อนุมัติ"><i class="fas fa-thumbs-up"></i></button>
                   <button onclick="rejectTrip('${t.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="ไม่อนุมัติ"><i class="fas fa-thumbs-down"></i></button>`
                : '';

            const editBtn = `<button onclick="editAdminTrip('${t.id}')" class="btn-icon bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white" title="แก้ไข"><i class="fas fa-edit"></i></button>`;

            const canDelete = isSuperAdmin || (t.status !== 'อนุมัติ' && tripIsModuleAdmin);
            const deleteBtn = canDelete
                ? `<button onclick="deleteTrip('${t.id}', '${safeName}')" class="btn-icon text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="ลบ"><i class="fas fa-trash-alt"></i></button>`
                : '';

            const dateDisplay = t.submitted_date ? fmt(t.submitted_date) : new Date(t.created_at).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
            const dateOrder = t.submitted_date || t.created_at || '';

            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-600 text-sm font-medium" data-order="${dateOrder}">${dateDisplay}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="font-bold text-sky-700 text-sm">${t.trip_type || '-'}</td>
                <td class="text-slate-700 text-sm max-w-[200px] truncate" title="${t.title}">${t.title}</td>
                <td class="text-slate-600 text-sm" data-order="${t.start_date}">${fmt(t.start_date)} - ${fmt(t.end_date)}</td>
                <td class="text-center font-black text-sky-600">${displayDays}</td>
                <td class="text-center">${statusHtml}</td>
                <td class="text-center">${ackHtml}</td>
                <td class="text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-1">
                        ${pdfHtml}${viewBtn}${ackBtn}${approveBtn}${editBtn}${deleteBtn}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    tripDataTable = $('#adminTripTable').DataTable({
        scrollX: true,
        scrollCollapse: true,
        autoWidth: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[4, 'desc']],
        columnDefs: [
            { orderable: false, targets: [8] },
            { width: '200px', targets: [8] }
        ],
        pageLength: 20,
        lengthMenu: [[10, 20, 50, -1], [10, 20, 50, "ทั้งหมด"]]
    });
}

// ==========================================
// Acknowledge actions
// ==========================================
window.acknowledgeTripAdmin = async function (id) {
    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customDate } = await Swal.fire({
        title: 'วันที่รับทราบ (แอดมิน)',
        input: 'date', inputValue: today,
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customDate === undefined) return;

    const finalDate = customDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').update({
        ack_admin: true, ack_admin_at: finalDateTime, updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    await logUserAction(`รับทราบใบไปราชการ (แอดมิน) ID: ${id}`, 'government_trip');
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: 'บันทึกการรับทราบแล้ว' });
    await loadTripDashboardStats();
};

window.acknowledgeTripDeputyHR = async function (id) {
    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customDate } = await Swal.fire({
        title: 'วันที่รับทราบ (รอง ผอ.บุคคล)',
        input: 'date', inputValue: today,
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customDate === undefined) return;

    const finalDate = customDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').update({
        ack_deputy_hr: true, ack_deputy_hr_at: finalDateTime,
        deputy_hr_personnel_id: tripCurrentUser.id,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    await logUserAction(`รับทราบใบไปราชการ (รอง ผอ.บุคคล) ID: ${id}`, 'government_trip');
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: 'บันทึกการรับทราบแล้ว' });
    await loadTripDashboardStats();
};

// ==========================================
// Approve / Reject
// ==========================================
window.updateTripStatus = async function (id, newStatus) {
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: trip } = await db.from('government_trip_requests')
        .select('ack_head, ack_academic, ack_admin, ack_deputy_hr, status, personnel_id')
        .eq('id', id).single();
    if (!trip) return;

    if (tripCurrentUserRole !== 'super_admin' && trip.status === 'รออนุมัติ') {
        const full = allTripsData.find(x => x.id === id);
        if (full && needsTripAcademicAck(full) && !trip.ack_academic) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอรอง ผอ.กลุ่มบริหารวิชาการ รับทราบก่อน' });
            return;
        }
        if (full && needsTripHeadAck(full) && !trip.ack_head) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอหัวหน้ากลุ่มสาระฯ รับทราบก่อน' });
            return;
        }
        if (!trip.ack_admin) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอแอดมินรับทราบก่อน' });
            return;
        }
        if (!trip.ack_deputy_hr) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอรอง ผอ.กลุ่มบริหารงานบุคคล รับทราบก่อน' });
            return;
        }
    }

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customApprovedDate } = await Swal.fire({
        title: 'วันที่อนุมัติ',
        input: 'date', inputValue: today,
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customApprovedDate === undefined) return;

    const finalDate = customApprovedDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();
    const now = new Date().toISOString();

    let updateData = {
        status: newStatus, reject_comment: null,
        updated_at: now, approved_at: now, approved_date: finalDate,
        director_personnel_id: tripCurrentUser.id
    };

    if (tripCurrentUserRole === 'super_admin' && newStatus === 'อนุมัติ') {
        updateData.ack_admin = true; updateData.ack_admin_at = finalDateTime;
        updateData.ack_deputy_hr = true; updateData.ack_deputy_hr_at = finalDateTime;

        const full = allTripsData.find(x => x.id === id);
        if (full && needsTripAcademicAck(full) && !full.ack_academic) {
            updateData.ack_academic = true;
            updateData.ack_academic_at = finalDateTime;
            updateData.academic_personnel_id = window.academicPersonnelId || null;
        }
        if (full && needsTripHeadAck(full) && !full.ack_head) {
            updateData.ack_head = true; updateData.ack_head_at = finalDateTime;
            const dept = full.core_personnel?.department;
            const head = (window.allDeptHeads || []).find(h => h.department_name === dept);
            if (head) {
                updateData.head_personnel_id = head.personnel_id;
                updateData.head_department = head.department_name;
            }
        }
    }

    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').update(updateData).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    await logUserAction(`อนุมัติใบไปราชการ ID: ${id} (${newStatus})`, 'government_trip');
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: `ปรับสถานะเป็น "${newStatus}" แล้ว` });
    await loadTripDashboardStats();
};

window.rejectTrip = async function (id) {
    if (!requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { value: comment } = await Swal.fire({
        title: 'ไม่อนุมัติ',
        html: '<p class="text-sm text-slate-500 mb-3">ระบุเหตุผลที่ไม่อนุมัติ</p>',
        input: 'textarea', inputPlaceholder: 'พิมพ์เหตุผล...',
        showCancelButton: true,
        confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยันไม่อนุมัติ', cancelButtonText: 'ยกเลิก',
        inputValidator: (v) => { if (!v) return 'กรุณาระบุเหตุผล'; }
    });
    if (!comment) return;

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customRejectDate } = await Swal.fire({
        title: 'วันที่ไม่อนุมัติ',
        input: 'date', inputValue: today,
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customRejectDate === undefined) return;

    const finalDate = customRejectDate || today;
    const now = new Date().toISOString();

    let updateData = {
        status: 'ไม่อนุมัติ', reject_comment: comment.trim(),
        updated_at: now, approved_at: now, approved_date: finalDate,
        director_personnel_id: tripCurrentUser.id
    };

    if (tripCurrentUserRole === 'super_admin') {
        const full = allTripsData.find(x => x.id === id);
        updateData.ack_admin = true; updateData.ack_admin_at = now;
        updateData.ack_deputy_hr = true; updateData.ack_deputy_hr_at = now;
        if (full && needsTripAcademicAck(full) && !full.ack_academic) {
            updateData.ack_academic = true; updateData.ack_academic_at = now;
        }
        if (full && needsTripHeadAck(full) && !full.ack_head) {
            updateData.ack_head = true; updateData.ack_head_at = now;
        }
    }

    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').update(updateData).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    await logUserAction(`ไม่อนุมัติใบไปราชการ ID: ${id}`, 'government_trip');
    Swal.fire({ icon: 'success', title: 'ไม่อนุมัติเรียบร้อย', timer: 1500, showConfirmButton: false });
    await loadTripDashboardStats();
};

// ==========================================
// Delete
// ==========================================
window.deleteTrip = async function (id, name) {
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: trip } = await db.from('government_trip_requests').select('status').eq('id', id).single();
    if (trip?.status === 'อนุมัติ' && !canManageSettings(tripCurrentUserRole)) {
        Swal.fire('ไม่สามารถลบได้', 'รายการที่อนุมัติแล้วไม่สามารถลบได้ กรุณาติดต่อ Super Admin', 'warning');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ลบรายการนี้?',
        html: `ต้องการลบรายการของ <b>${name}</b> หรือไม่?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบ'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').delete().eq('id', id);
    if (!error) {
        await logUserAction(`ลบใบไปราชการ ID: ${id} (${name})`, 'government_trip');
        await loadTripDashboardStats();
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
    } else Swal.fire('ผิดพลาด', error.message, 'error');
};

window.showTripRejectComment = function (comment) {
    Swal.fire({ icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ', html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`, confirmButtonText: 'ปิด' });
};

// ==========================================
// View
// ==========================================
window.viewAdminTrip = function (id) {
    const t = allTripsData.find(x => x.id === id);
    if (!t) return;
    const fullName = `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`;
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const needsAcademic = needsTripAcademicAck(t);

    const html = `
        <div class="space-y-4">
            <div class="border border-slate-200 rounded-xl p-3 space-y-2">
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ชื่อ</span><span class="font-bold text-slate-800">${fullName}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">กลุ่มสาระฯ</span><span class="font-bold text-slate-800">${t.core_personnel.department || '-'}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ประเภท</span><span class="font-bold text-slate-800">${t.trip_type || '-'}</span></div>
                <div class="flex justify-between items-start gap-2"><span class="text-sm font-bold text-slate-600 flex-shrink-0">เรื่อง</span><span class="font-bold text-slate-800 text-right">${t.title}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">สถานที่</span><span class="font-bold text-slate-800">${t.location || '-'}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ช่วงวันที่</span><span class="font-bold text-slate-800">${fmt(t.start_date)} - ${fmt(t.end_date)}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">จำนวนวัน</span><span class="font-bold text-slate-800">${t.total_days} วัน</span></div>
                ${t.attachment_file_id ? `<div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ไฟล์แนบ</span><a href="https://lh5.googleusercontent.com/d/${t.attachment_file_id}" target="_blank" class="text-blue-600 hover:underline text-sm">ดูไฟล์</a></div>` : ''}
            </div>

            <div class="border border-slate-200 rounded-xl p-3 space-y-2">
                <p class="text-xs font-bold text-slate-500 mb-2"><i class="fas fa-signature mr-1 text-indigo-400"></i>สถานะการรับทราบ/อนุมัติ</p>
                <div class="space-y-1.5 text-xs">
                    ${needsAcademic ? `
                    <div class="flex items-center justify-between">
                        <span><i class="fas fa-user-graduate text-rose-400 mr-1.5"></i>รอง ผอ.กลุ่มบริหารวิชาการ</span>
                        ${t.ack_academic
                            ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-double"></i> รับทราบแล้ว${t.ack_academic_at ? ' (' + window.formatTripDateThai(t.ack_academic_at) + ')' : ''}</span>`
                            : `<span class="text-slate-400 font-bold">ยังไม่รับทราบ</span>`}
                    </div>` : ''}
                    ${!needsAcademic ? `
                    <div class="flex items-center justify-between">
                        <span><i class="fas fa-users text-purple-400 mr-1.5"></i>หัวหน้ากลุ่มสาระฯ</span>
                        ${t.ack_head
                            ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-double"></i> รับทราบแล้ว${t.ack_head_at ? ' (' + window.formatTripDateThai(t.ack_head_at) + ')' : ''}</span>`
                            : `<span class="text-slate-400 font-bold">ยังไม่รับทราบ</span>`}
                    </div>` : ''}
                    <div class="flex items-center justify-between">
                        <span><i class="fas fa-user-shield text-teal-400 mr-1.5"></i>แอดมิน</span>
                        ${t.ack_admin
                            ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-double"></i> รับทราบแล้ว${t.ack_admin_at ? ' (' + window.formatTripDateThai(t.ack_admin_at) + ')' : ''}</span>`
                            : `<span class="text-slate-400 font-bold">ยังไม่รับทราบ</span>`}
                    </div>
                    <div class="flex items-center justify-between">
                        <span><i class="fas fa-user-tie text-indigo-400 mr-1.5"></i>รอง ผอ.กลุ่มบุคคล</span>
                        ${t.ack_deputy_hr
                            ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-double"></i> รับทราบแล้ว${t.ack_deputy_hr_at ? ' (' + window.formatTripDateThai(t.ack_deputy_hr_at) + ')' : ''}</span>`
                            : `<span class="text-slate-400 font-bold">ยังไม่รับทราบ</span>`}
                    </div>
                    <div class="flex items-center justify-between">
                        <span><i class="fas fa-crown text-amber-400 mr-1.5"></i>ผู้อำนวยการ</span>
                        ${t.status === 'อนุมัติ'
                            ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-double"></i> อนุมัติแล้ว${t.approved_date ? ' (' + fmt(t.approved_date) + ')' : ''}</span>`
                            : (t.status === 'ไม่อนุมัติ'
                                ? `<span class="text-rose-600 font-bold"><i class="fas fa-times"></i> ไม่อนุมัติ</span>`
                                : `<span class="text-slate-400 font-bold">รออนุมัติ</span>`)}
                    </div>
                </div>
            </div>

            ${t.reject_comment ? `<div class="bg-rose-50 border border-rose-200 p-3 rounded-xl text-sm"><b class="text-rose-700">เหตุผลที่ไม่อนุมัติ:</b><br><span class="text-rose-800">${t.reject_comment}</span></div>` : ''}
        </div>
    `;
    document.getElementById('viewTripContent').innerHTML = html;
    document.getElementById('viewTripModal').classList.remove('hidden');
    document.getElementById('viewTripModal').classList.add('flex');
};

window.closeViewTripModal = function () {
    document.getElementById('viewTripModal').classList.add('hidden');
    document.getElementById('viewTripModal').classList.remove('flex');
};

// ==========================================
// Admin: เขียนใบแทน
// ==========================================
function initAdminTripFlatpickr() {
    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }
    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                $(`#${id}_iso`).val(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
            }
            adminTripCalculateDays();
        },
        onReady: (_, __, inst) => updateYear(inst),
        onMonthChange: (_, __, inst) => updateYear(inst),
        onYearChange: (_, __, inst) => updateYear(inst)
    };
    flatpickr("#admin_trip_start_date", config);
    flatpickr("#admin_trip_end_date", config);
    flatpickr("#admin_trip_submitted_date", config);
}

window.adminTripCalculateDays = function () {
    const start = $('#admin_trip_start_date_iso').val();
    const end = $('#admin_trip_end_date_iso').val();
    const days = window.calculateTripDays(start, end);
    $('#admin_trip_calc_days').text(days);
};

window.openAdminTripModal = function () {
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    $('#adminTripForm')[0].reset();
    $('#admin_trip_id').val('');
    $('#admin_trip_start_date_iso, #admin_trip_end_date_iso, #admin_trip_submitted_date_iso').val('');
    $('#admin_trip_calc_days').text('0');

    const el = document.getElementById('admin_trip_personnel_id');
    if (el && el.tomselect) el.tomselect.clear();

    $('#adminTripModal').removeClass('hidden').addClass('flex');
};

window.closeAdminTripModal = function () {
    $('#adminTripModal').addClass('hidden').removeClass('flex');
};

window.saveTripForAdmin = async function (e) {
    e.preventDefault();
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const id = $('#admin_trip_id').val();
    const personnelId = $('#admin_trip_personnel_id').val();
    if (!personnelId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากร', 'warning');

    const trip_type = $('#admin_trip_type').val();
    const title = $('#admin_trip_title').val().trim();
    const location = $('#admin_trip_location').val().trim();
    const startDate = $('#admin_trip_start_date_iso').val();
    const endDate = $('#admin_trip_end_date_iso').val();
    const totalDays = parseFloat($('#admin_trip_calc_days').text());
    const travel_by = $('#admin_trip_travel_by').val();
    const budget_source = $('#admin_trip_budget_source').val();
    const budget_amount = $('#admin_trip_budget_amount').val();
    const contact_phone = $('#admin_trip_phone').val().trim();
    const contact_address = $('#admin_trip_contact_address').val().trim();
    const submittedDateIso = $('#admin_trip_submitted_date_iso').val() || null;

    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันต้องมากกว่า 0', 'warning');

    let attachmentFileId = null;
    const fileInput = document.getElementById('admin_trip_attachment');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) return Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'warning');
        try {
            attachmentFileId = await window.uploadTripFile(file, tripSystemSettings.evidence_folder_id, tripSystemSettings.gas_url);
        } catch (err) {
            Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error'); return;
        }
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const payload = {
        personnel_id: personnelId,
        fiscal_year: tripSystemSettings.fiscal_year,
        eval_round: tripSystemSettings.eval_round,
        trip_type, title, location,
        start_date: startDate, end_date: endDate, total_days: totalDays,
        travel_by, budget_source,
        budget_amount: budget_amount ? parseFloat(budget_amount) : null,
        contact_phone, contact_address,
        attachment_file_id: attachmentFileId,
        submitted_date: submittedDateIso,
        status: 'รออนุมัติ'
    };

    try {
        if (id) {
            const { error } = await db.from('government_trip_requests').update(payload).eq('id', id);
            if (error) throw error;
            await logUserAction(`แก้ไขใบไปราชการ ${id}`, 'government_trip');
        } else {
            const { error } = await db.from('government_trip_requests').insert([payload]);
            if (error) throw error;
            await logUserAction(`บันทึกใบไปราชการให้ ${personnelId} (${title})`, 'government_trip');
        }
        window.closeAdminTripModal();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        await loadTripDashboardStats();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// Edit (from admin table)
// ==========================================
window.editAdminTrip = function (id) {
    const t = allTripsData.find(x => x.id === id);
    if (!t) return;

    $('#adminTripForm')[0].reset();
    $('#admin_trip_id').val(t.id);
    $('#admin_trip_calc_days').text(t.total_days);

    const el = document.getElementById('admin_trip_personnel_id');
    if (el && el.tomselect) el.tomselect.setValue(t.personnel_id);

    $('#admin_trip_type').val(t.trip_type || '');
    $('#admin_trip_title').val(t.title);
    $('#admin_trip_location').val(t.location || '');
    $('#admin_trip_travel_by').val(t.travel_by || '');
    $('#admin_trip_budget_source').val(t.budget_source || '');
    $('#admin_trip_budget_amount').val(t.budget_amount || '');
    $('#admin_trip_phone').val(t.contact_phone || '');
    $('#admin_trip_contact_address').val(t.contact_address || '');

    const setFp = (iso, idDisplay) => {
        if (!iso) return;
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        if (fp) {
            fp.setDate(new Date(y, m - 1, d), false);
            $(`#${idDisplay}`).val(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`);
            $(`#${idDisplay}_iso`).val(iso);
        }
    };
    setFp(t.start_date, 'admin_trip_start_date');
    setFp(t.end_date, 'admin_trip_end_date');
    if (t.submitted_date) setFp(t.submitted_date, 'admin_trip_submitted_date');

    $('#adminTripModal').removeClass('hidden').addClass('flex');
};

// ==========================================
// Filter
// ==========================================
window.filterTripTableByPerson = function () {
    const personId = $('#filter-trip-personnel').val();
    if (personId) {
        const personName = $('#filter-trip-personnel option:selected').text();
        tripDataTable.search(personName).draw();
    } else tripDataTable.search('').draw();
};

// ==========================================
// Export Excel
// ==========================================
window.exportTripReport = function () {
    if (allTripsData.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };

    const exportData = allTripsData.map(t => ({
        'วันที่ยื่น': new Date(t.created_at).toLocaleDateString('th-TH'),
        'ชื่อ-สกุล': `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`,
        'กลุ่มสาระฯ': t.core_personnel.department || '-',
        'ปีงบประมาณ': t.fiscal_year,
        'รอบ': t.eval_round,
        'ประเภท': t.trip_type || '-',
        'เรื่อง': t.title,
        'สถานที่': t.location || '-',
        'เริ่ม': fmt(t.start_date),
        'สิ้นสุด': fmt(t.end_date),
        'จำนวนวัน': t.status === 'ไม่อนุมัติ' ? 0 : t.total_days,
        'เดินทางโดย': t.travel_by || '-',
        'งบประมาณ': t.budget_source || '-',
        'จำนวนเงิน': t.budget_amount || 0,
        'สถานะ': t.status,
        'หัวหน้ารับทราบ': t.ack_head ? '✓' : '-',
        'รองวิชาการ': t.ack_academic ? '✓' : '-',
        'แอดมิน': t.ack_admin ? '✓' : '-',
        'รองบุคคล': t.ack_deputy_hr ? '✓' : '-',
        'ผู้อำนวยการ': t.status === 'อนุมัติ' ? '✓' : (t.status === 'ไม่อนุมัติ' ? '✗' : '-'),
        'เหตุผล': t.reject_comment || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายงานขอไปราชการ");
    XLSX.writeFile(wb, `รายงานขอไปราชการ_ปี_${tripSystemSettings.fiscal_year}_รอบ${tripSystemSettings.eval_round}.xlsx`);
    logUserAction('ส่งออกรายงานขอไปราชการ (Excel)', 'government_trip');
};

// ==========================================
// Signature Management
// ==========================================
window.openTripSignatureModal = async function () {
    if (!requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะ Super Admin')) return;
    if (!tripSystemSettings.signature_folder_id) {
        Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนดโฟลเดอร์ลายเซ็นใน "ตั้งค่าระบบ" ก่อน', 'warning'); return;
    }
    if (!tripSystemSettings.gas_url) {
        Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนด GAS URL ก่อน', 'warning'); return;
    }
    $('#tripSignatureModal').removeClass('hidden').addClass('flex');
    await loadTripSignatureList();
};

window.closeTripSignatureModal = function () {
    $('#tripSignatureModal').addClass('hidden').removeClass('flex');
};

async function loadTripSignatureList() {
    const { data: personnel } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, position, department, signature_file_id')
        .order('first_name');

    const tbody = document.getElementById('trip-signature-tbody');
    if (!tbody) return;

    if ($.fn.DataTable.isDataTable('#tripSignatureTable')) $('#tripSignatureTable').DataTable().destroy();

    tbody.innerHTML = (personnel || []).map(p => {
        const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const hasSig = !!p.signature_file_id;
        const fileId = p.signature_file_id || '';
        return `<tr class="border-b border-slate-100">
            <td class="p-2 font-medium">${name}</td>
            <td class="p-2 text-slate-600">${p.position || '-'}</td>
            <td class="p-2 text-slate-600">${p.department || '-'}</td>
            <td class="p-2 text-center">${hasSig ? '<span class="text-emerald-600 font-bold"><i class="fas fa-check-circle"></i> มี</span>' : '<span class="text-slate-400">ไม่มี</span>'}</td>
            <td class="p-2 text-center">
                <label class="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition inline-flex items-center gap-1">
                    <i class="fas fa-upload"></i> อัปโหลด
                    <input type="file" accept="image/*" class="hidden" onchange="uploadTripSignature('${p.id}', this)">
                </label>
                ${hasSig ? `<button onclick="removeTripSignature('${p.id}')" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition ml-1"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');

    $('#tripSignatureTable').DataTable({
        responsive: true, pageLength: 10, order: [[0, 'asc']],
        columnDefs: [{ orderable: false, targets: [3, 4] }],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

window.uploadTripSignature = async function (personnelId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 2MB', 'warning'); fileInput.value = ''; return; }

    Swal.fire({ title: 'กำลังอัปโหลด...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1];
            const payload = {
                action: 'upload',
                folderId: tripSystemSettings.signature_folder_id,
                fileName: `signature_${personnelId}_${Date.now()}.${file.name.split('.').pop()}`,
                base64, mimeType: file.type
            };
            const response = await fetch(tripSystemSettings.gas_url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status === 'success' && result.fileId) {
                await db.from('core_personnel').update({ signature_file_id: result.fileId }).eq('id', personnelId);
                Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
                fileInput.value = '';
                await loadTripSignatureList();
            } else throw new Error(result.message || 'อัปโหลดไม่สำเร็จ');
        };
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
        fileInput.value = '';
    }
};

window.removeTripSignature = async function (personnelId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ลบลายเซ็น?', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบ'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('core_personnel').update({ signature_file_id: null }).eq('id', personnelId);
    if (!error) {
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        await loadTripSignatureList();
    } else Swal.fire('ผิดพลาด', error.message, 'error');
};

// ==========================================
// Expose globals
// ==========================================
window.switchTripAdminTab = window.switchTripAdminTab;
window.loadTripDashboardStats = loadTripDashboardStats;
window.getDefaultTripSettings = getDefaultTripSettings;
window.loadTripSystemSettings = loadTripSystemSettings;
window.saveTripSystemSettings = saveTripSystemSettings;
window.addTripModuleAdmin = window.addTripModuleAdmin;
window.removeTripModuleAdmin = window.removeTripModuleAdmin;
window.acknowledgeTripAdmin = window.acknowledgeTripAdmin;
window.acknowledgeTripDeputyHR = window.acknowledgeTripDeputyHR;
window.updateTripStatus = window.updateTripStatus;
window.rejectTrip = window.rejectTrip;
window.deleteTrip = window.deleteTrip;
window.viewAdminTrip = window.viewAdminTrip;
window.closeViewTripModal = window.closeViewTripModal;
window.editAdminTrip = window.editAdminTrip;
window.openAdminTripModal = window.openAdminTripModal;
window.closeAdminTripModal = window.closeAdminTripModal;
window.saveTripForAdmin = window.saveTripForAdmin;
window.exportTripReport = window.exportTripReport;
window.filterTripTableByPerson = window.filterTripTableByPerson;
window.openTripSignatureModal = window.openTripSignatureModal;
window.closeTripSignatureModal = window.closeTripSignatureModal;
window.uploadTripSignature = window.uploadTripSignature;
window.removeTripSignature = window.removeTripSignature;
window.adminTripCalculateDays = window.adminTripCalculateDays;
window.showTripRejectComment = window.showTripRejectComment;
window.acknowledgeTripHead = window.acknowledgeTripHead;
window.acknowledgeTripAcademic = window.acknowledgeTripAcademic;

// Trip state globals
window.allTripsData = allTripsData;
window.allPersonnelData = allPersonnelData;

console.log('✅ government_trip_admin.js loaded (ฉบับสมบูรณ์ + academic ack)');
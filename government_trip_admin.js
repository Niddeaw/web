// ============================================================
// government_trip_admin.js — ระบบขอไปราชการ (ฝ่ายบริหาร) v2.0
// ✅ ฟอร์มเขียนใบแทนเหมือนกับ teacher.html ทุกจุด
// ✅ เพิ่ม Companion (ครู/นักเรียน), purpose radio, travel_vehicle, req_*
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

// ✅ Admin Trip TomSelect (สำหรับผู้ร่วมเดินทาง)
let adminTsTeachers = null;
let adminTsStudents = null;

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

    const navMap = {
        'dashboard': 'trip-btn-dashboard',
        'manage': 'trip-btn-manage',
        'settings': 'trip-btn-settings'
    };
    if (navMap[tabId] && typeof setActiveNavItem === 'function')
        setActiveNavItem(navMap[tabId]);

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

        allTripsData = (data || []).filter(t => t.status !== 'ไม่อนุมัติ');
        window.allTripsData = allTripsData;

        const pending = allTripsData.filter(t => t.status === 'รออนุมัติ');
        const approved = allTripsData.filter(t => t.status === 'อนุมัติ');
        const rejected = (data || []).filter(t => t.status === 'ไม่อนุมัติ');

        let tripDays = 0, tripPending = 0;
        let meetingDays = 0, meetingPending = 0;
        const peopleSet = new Set();
        const pendingPeopleSet = new Set();

        allTripsData.forEach(t => {
            const days = parseFloat(t.total_days) || 0;
            const purpose = t.purpose || t.trip_type || '';
            const isPending = t.status === 'รออนุมัติ';

            if (purpose === 'ไปราชการ') {
                tripDays += days;
                if (isPending) tripPending += days;
            } else if (purpose.includes('ประชุม') || purpose.includes('อบรม') || purpose.includes('สัมมนา')) {
                meetingDays += days;
                if (isPending) meetingPending += days;
            }

            peopleSet.add(t.personnel_id);
            if (isPending) pendingPeopleSet.add(t.personnel_id);
        });

        document.getElementById('stat-trip-days').textContent = tripDays;
        document.getElementById('stat-trip-pending').textContent = tripPending;
        document.getElementById('stat-meeting-days').textContent = meetingDays;
        document.getElementById('stat-meeting-pending').textContent = meetingPending;
        document.getElementById('total-pending').textContent = pending.length;
        document.getElementById('stat-total-people').textContent = peopleSet.size;
        document.getElementById('stat-pending-people').textContent = pendingPeopleSet.size;

        renderTripAlerts(pending);
        renderTripTable();

    } catch (err) {
        console.error('loadTripDashboardStats error:', err);
        document.getElementById('alert-zone').innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`;
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

            const isAcademicUser = (tripCurrentUser?.id === window.academicPersonnelId);
            if (needsTripAcademicAck(t) && !t.ack_academic) {
                if (isSuperAdmin) {
                    ackBtn += `<button onclick="window.acknowledgeTripAcademic('${t.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="รับทราบแทนรองวิชาการ"><i class="fas fa-user-graduate"></i></button>`;
                } else if (isAcademicUser) {
                    ackBtn += `<button onclick="window.acknowledgeTripAcademic('${t.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="รับทราบ"><i class="fas fa-check"></i></button>`;
                }
            }

            if (isSuperAdmin && needsTripHeadAck(t) && !t.ack_head) {
                ackBtn += `<button onclick="window.acknowledgeTripHead('${t.id}')" class="btn-icon bg-purple-50 text-purple-600 hover:bg-purple-500 hover:text-white" title="รับทราบแทนหัวหน้ากลุ่มฯ"><i class="fas fa-user-check"></i></button>`;
            }

            if (isSuperAdmin && !t.ack_admin) {
                ackBtn += `<button onclick="acknowledgeTripAdmin('${t.id}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="รับทราบแทนแอดมิน"><i class="fas fa-check"></i></button>`;
            } else if (isAdmin && !t.ack_admin) {
                ackBtn += `<button onclick="acknowledgeTripAdmin('${t.id}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="รับทราบ"><i class="fas fa-check"></i></button>`;
            }

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
            const purposeLabel = t.purpose || t.trip_type || '-';

            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-600 text-sm font-medium" data-order="${dateOrder}">${dateDisplay}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="font-bold text-sky-700 text-sm">${purposeLabel}</td>
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
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ประเภท</span><span class="font-bold text-slate-800">${t.purpose || t.trip_type || '-'}</span></div>
                <div class="flex justify-between items-start gap-2"><span class="text-sm font-bold text-slate-600 flex-shrink-0">เรื่อง</span><span class="font-bold text-slate-800 text-right">${t.title}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">สถานที่</span><span class="font-bold text-slate-800">${t.location || '-'}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ช่วงวันที่</span><span class="font-bold text-slate-800">${fmt(t.start_date)} - ${fmt(t.end_date)}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">จำนวนวัน</span><span class="font-bold text-slate-800">${t.total_days} วัน</span></div>
                ${t.attachment_file_id ? `<div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ไฟล์แนบ</span><a href="https://lh5.googleusercontent.com/d/${t.attachment_file_id}" target="_blank" class="text-blue-600 hover:underline text-sm">ดูไฟล์</a></div>` : ''}
            </div>

            ${(t.companion_count > 1) ? `
                <div class="border border-indigo-200 bg-indigo-50/50 rounded-xl p-3">
                    <p class="text-xs font-bold text-indigo-700 mb-2">
                        <i class="fas fa-users mr-1"></i>ผู้ร่วมเดินทาง (รวม ${t.companion_count} คน)
                    </p>
                    <div id="view-trip-companions-${t.id}" class="text-sm">
                        <div class="text-center text-slate-400 py-2 text-xs"><i class="fas fa-spinner fa-spin mr-1"></i>กำลังโหลด...</div>
                    </div>
                </div>
            ` : ''}

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

    if (t.companion_count > 1 && typeof window.fetchTripCompanions === 'function') {
        window.fetchTripCompanions(t).then(comp => {
            const container = document.getElementById(`view-trip-companions-${t.id}`);
            if (!container) return;

            let innerHtml = '';

            if (comp.teachers.length > 0) {
                innerHtml += `<div class="mb-2">
                    <div class="text-xs font-bold text-sky-700 mb-1">👨‍🏫 ครู (${comp.teachers.length} คน)</div>
                    <ul class="ml-4 text-xs space-y-0.5">
                        ${comp.teachers.map((tc, i) => `<li>${i + 1}. ${tc.name} <span class="text-slate-500">${tc.department ? `(${tc.department})` : ''}</span></li>`).join('')}
                    </ul>
                </div>`;
            }

            if (comp.students.length > 0) {
                innerHtml += `<div>
                    <div class="text-xs font-bold text-emerald-700 mb-1">🎓 นักเรียน (${comp.students.length} คน)</div>
                    <ul class="ml-4 text-xs space-y-0.5">
                        ${comp.students.map((s, i) => `<li>${i + 1}. ${s.name} <span class="text-slate-500">(${s.class_text} เลขที่ ${s.student_number})</span></li>`).join('')}
                    </ul>
                </div>`;
            }

            container.innerHTML = innerHtml || '<div class="text-xs text-slate-400 text-center">ไม่มีข้อมูล</div>';
        });
    }
};

window.closeViewTripModal = function () {
    document.getElementById('viewTripModal').classList.add('hidden');
    document.getElementById('viewTripModal').classList.remove('flex');
};

// ==========================================
// Flatpickr (Admin Trip — Extended)
// ==========================================
function initAdminTripFlatpickr() {
    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }

    const makeCfg = (hiddenId) => ({
        locale: 'th',
        dateFormat: 'd/m/Y',
        onChange: function (dates, str, inst) {
            if (dates[0]) {
                const d = dates[0];
                if (hiddenId) {
                    $(`#${hiddenId}`).val(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                }
                inst.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
                if (hiddenId === 'admin_trip_start_date_iso' || hiddenId === 'admin_trip_end_date_iso') {
                    window.adminTripCalculateDays();
                }
            }
        },
        onReady: (_, __, inst) => updateYear(inst),
        onMonthChange: (_, __, inst) => updateYear(inst),
        onYearChange: (_, __, inst) => updateYear(inst)
    });

    ['start_date', 'end_date', 'submitted_date', 'doc_date', 'depart_from_date', 'return_to_date'].forEach(field => {
        const el = document.getElementById(`admin_trip_${field}`);
        if (el && !el._flatpickr) {
            flatpickr(el, makeCfg(`admin_trip_${field}_iso`));
        }
    });
}

window.adminTripCalculateDays = function () {
    const start = $('#admin_trip_start_date_iso').val();
    const end = $('#admin_trip_end_date_iso').val();
    const days = window.calculateTripDays(start, end);
    $('#admin_trip_calc_days').text(days);
};

// ==========================================
// TomSelect — Companion pickers (Admin)
// ==========================================
async function initAdminTripCompanionSelects() {
    // ---- ครู ----
    const teacherEl = document.getElementById('admin_companion_teachers');
    if (teacherEl && !adminTsTeachers) {
        adminTsTeachers = new TomSelect(teacherEl, {
            valueField: 'id',
            labelField: 'name',
            searchField: ['name'],
            plugins: ['remove_button'],
            placeholder: 'พิมพ์ชื่อครูอย่างน้อย 2 ตัวอักษร...',
            dropdownParent: 'body',
            maxItems: null,
            preload: false,
            load: async function (query, callback) {
                if (query.length < 2) return callback();
                try {
                    const { data } = await db.from('core_personnel')
                        .select('id, prefix, first_name, last_name, department, position')
                        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
                        .order('first_name').limit(30);

                    callback((data || []).map(t => ({
                        id: t.id,
                        name: `${t.prefix || ''}${t.first_name} ${t.last_name}`,
                        department: t.department || '',
                        position: t.position || ''
                    })));
                } catch (err) { console.error(err); callback(); }
            },
            render: {
                option: (data, escape) => `<div class="p-2 border-b border-slate-50">
                    <div class="font-bold text-slate-800">${escape(data.name)}</div>
                    <div class="text-xs text-slate-500">${escape(data.position)} ${data.department ? `• ${escape(data.department)}` : ''}</div>
                </div>`,
                item: (data, escape) => `<div class="text-xs">${escape(data.name)}</div>`
            },
            onChange: () => updateAdminTotalCompanions()
        });
    }

    // ---- นักเรียน ----
    const studentEl = document.getElementById('admin_companion_students');
    if (studentEl && !adminTsStudents) {
        adminTsStudents = new TomSelect(studentEl, {
            valueField: 'id',
            labelField: 'display',
            searchField: ['display', 'name', 'student_id_card'],
            plugins: ['remove_button'],
            placeholder: 'พิมพ์ชื่อ/รหัส/เลขที่นักเรียน...',
            dropdownParent: 'body',
            maxItems: null,
            preload: false,
            load: async function (query, callback) {
                if (query.length < 2) return callback();
                try {
                    const { data: school } = await db.from('core_school_info')
                        .select('current_academic_year, current_semester').single();
                    const acadYear = String(school?.current_academic_year || '');
                    const sem = String(school?.current_semester || '1');

                    const { data: students } = await db.from('core_students')
                        .select(`id, prefix, first_name, last_name, student_id_card,
                            student_enrollments(student_number, academic_year, semester,
                                core_classrooms(grade_level, room_number))`)
                        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,student_id_card.ilike.%${query}%`)
                        .order('first_name').limit(30);

                    callback((students || []).map(s => {
                        const enrList = s.student_enrollments || [];
                        const current = enrList.find(e =>
                            String(e.academic_year) === acadYear && String(e.semester) === sem
                        ) || enrList[0];
                        const cls = current?.core_classrooms;
                        const classText = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';
                        const numText = current?.student_number ? `เลขที่ ${current.student_number}` : '';
                        const name = `${s.prefix || ''}${s.first_name} ${s.last_name}`;

                        return {
                            id: s.id,
                            name: name,
                            display: `${name} (${classText} ${numText}) - ${s.student_id_card}`,
                            class_text: classText,
                            student_number: current?.student_number || '-',
                            student_id_card: s.student_id_card
                        };
                    }));
                } catch (err) { console.error(err); callback(); }
            },
            render: {
                option: (data, escape) => `<div class="p-2 border-b border-slate-50">
                    <div class="font-bold text-slate-800">${escape(data.name)}</div>
                    <div class="text-xs text-slate-500">${escape(data.class_text)} • เลขที่ ${escape(data.student_number)} • ${escape(data.student_id_card)}</div>
                </div>`,
                item: (data, escape) => `<div class="text-xs">${escape(data.name)} <span class="text-slate-400">(${escape(data.class_text)})</span></div>`
            },
            onChange: () => updateAdminTotalCompanions()
        });
    }
}

// ==========================================
// Toggle / Update Companions (Admin)
// ==========================================
window.toggleAdminCompanions = function () {
    const checked = document.getElementById('admin_trip_has_companions').checked;
    const panel = document.getElementById('adminCompanionsPanel');
    if (checked) {
        panel.classList.remove('hidden');
        if (!adminTsTeachers) initAdminTripCompanionSelects();
        updateAdminTotalCompanions();
    } else {
        panel.classList.add('hidden');
        if (adminTsTeachers) adminTsTeachers.clear();
        if (adminTsStudents) adminTsStudents.clear();
        updateAdminTotalCompanions();
    }
};

window.updateAdminTotalCompanions = function () {
    const tc = adminTsTeachers ? adminTsTeachers.items.length : 0;
    const sc = adminTsStudents ? adminTsStudents.items.length : 0;
    const el = document.getElementById('admin_total_companions');
    if (el) el.textContent = 1 + tc + sc;
};

// ==========================================
// Purpose / Req toggles (Admin)
// ==========================================
window.onAdminPurposeChange = function () {
    const selected = document.querySelector('input[name="admin_purpose"]:checked');
    const wrap = document.getElementById('adminPurposeOtherWrap');
    if (selected?.value === 'อื่นๆ') wrap.classList.remove('hidden');
    else {
        wrap.classList.add('hidden');
        document.getElementById('admin_trip_purpose_other').value = '';
    }
};

window.toggleAdminExpenseAmount = function () {
    const checked = document.getElementById('admin_trip_req_travel_expense').checked;
    const wrap = document.getElementById('adminExpenseAmountWrap');
    if (checked) wrap.classList.remove('hidden');
    else {
        wrap.classList.add('hidden');
        document.getElementById('admin_trip_travel_expense_amount').value = '';
    }
};

window.toggleAdminOtherReq = function () {
    const checked = document.getElementById('admin_trip_req_other').checked;
    const wrap = document.getElementById('adminOtherReqWrap');
    if (checked) wrap.classList.remove('hidden');
    else {
        wrap.classList.add('hidden');
        document.getElementById('admin_trip_req_other_text').value = '';
    }
};

// ==========================================
// Open Modal (Admin)
// ==========================================
window.openAdminTripModal = function () {
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    document.getElementById('adminTripForm').reset();
    $('#admin_trip_id').val('');

    // ล้าง hidden ISO
    ['start_date_iso', 'end_date_iso', 'submitted_date_iso', 'doc_date_iso', 'depart_from_date_iso', 'return_to_date_iso'].forEach(f => {
        const el = document.getElementById(`admin_trip_${f}`);
        if (el) el.value = '';
    });

    // ล้าง flatpickr
    ['start_date', 'end_date', 'submitted_date', 'doc_date', 'depart_from_date', 'return_to_date'].forEach(f => {
        const fp = $(`#admin_trip_${f}`)[0]?._flatpickr;
        if (fp) fp.clear();
    });

    // Reset ชื่อผู้ขอ
    const reqNameEl = document.getElementById('admin_trip_requester_name');
    if (reqNameEl) reqNameEl.value = '';

    // Reset companions
    document.getElementById('admin_trip_has_companions').checked = false;
    document.getElementById('adminCompanionsPanel').classList.add('hidden');
    if (adminTsTeachers) adminTsTeachers.clear();
    if (adminTsStudents) adminTsStudents.clear();
    updateAdminTotalCompanions();

    // Reset purpose
    document.querySelectorAll('input[name="admin_purpose"]').forEach(r => r.checked = false);
    document.getElementById('adminPurposeOtherWrap').classList.add('hidden');

    // Reset reqs
    ['req_official_letter', 'req_parent_notice', 'req_travel_expense', 'req_school_car', 'req_other'].forEach(f => {
        const el = document.getElementById(`admin_trip_${f}`);
        if (el) el.checked = false;
    });
    document.getElementById('adminExpenseAmountWrap').classList.add('hidden');
    document.getElementById('adminOtherReqWrap').classList.add('hidden');
    document.getElementById('admin_trip_calc_days').textContent = '0';
    document.getElementById('admin_existing_attachment').classList.add('hidden');

    // Clear TomSelect personnel
    const personnelEl = document.getElementById('admin_trip_personnel_id');
    if (personnelEl && personnelEl.tomselect) {
        personnelEl.tomselect.clear();
    }

    // ✅ Set listener: เลือกบุคลากร → แสดงชื่อผู้ขอ
    if (personnelEl && !personnelEl._requesterListener) {
        personnelEl.addEventListener('change', function () {
            const id = this.value;
            const p = allPersonnelData.find(x => x.id === id);
            const nameEl = document.getElementById('admin_trip_requester_name');
            if (p && nameEl) {
                nameEl.value = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            }
        });
        personnelEl._requesterListener = true;
    }

    initAdminTripFlatpickr();

    $('#adminTripModal').removeClass('hidden').addClass('flex');
};

window.closeAdminTripModal = function () {
    $('#adminTripModal').addClass('hidden').removeClass('flex');
};

// ==========================================
// Save Trip (Admin) — ใช้ Schema ใหม่
// ==========================================
window.saveTripForAdmin = async function (e) {
    e.preventDefault();
    if (!tripIsModuleAdmin && !requireAdmin(tripCurrentUserRole, tripIsAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const id = $('#admin_trip_id').val();
    const personnelId = $('#admin_trip_personnel_id').val();
    if (!personnelId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากร', 'warning');

    // ---------- Section 2 ----------
    const purposeRadio = document.querySelector('input[name="admin_purpose"]:checked');
    const purpose = purposeRadio?.value || '';
    const purposeOther = purpose === 'อื่นๆ' ? document.getElementById('admin_trip_purpose_other').value.trim() : '';
    if (!purpose) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกความประสงค์', 'warning');
    if (purpose === 'อื่นๆ' && !purposeOther) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุความประสงค์อื่นๆ', 'warning');

    const title = $('#admin_trip_title').val().trim();
    const location = $('#admin_trip_location').val().trim();
    if (!title || !location) return Swal.fire('ข้อมูลไม่ครบ', 'กรอกเรื่องและสถานที่', 'warning');

    const docNumber = $('#admin_trip_doc_number').val().trim();
    const docDateIso = $('#admin_trip_doc_date_iso').val() || null;

    // ---------- Section 3 ----------
    const startDate = $('#admin_trip_start_date_iso').val();
    const endDate = $('#admin_trip_end_date_iso').val();
    const totalDays = parseFloat($('#admin_trip_calc_days').text());
    if (!startDate || !endDate) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกวันที่ไป-กลับ', 'warning');
    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันต้องมากกว่า 0', 'warning');

    const travelVehicle = $('#admin_trip_travel_vehicle').val().trim();
    const departFromDateIso = $('#admin_trip_depart_from_date_iso').val() || null;
    const departFromTime = $('#admin_trip_depart_from_time').val() || null;
    const returnToDateIso = $('#admin_trip_return_to_date_iso').val() || null;
    const returnToTime = $('#admin_trip_return_to_time').val() || null;

    // ---------- Section 4 ----------
    const reqOfficial = document.getElementById('admin_trip_req_official_letter').checked;
    const reqParent = document.getElementById('admin_trip_req_parent_notice').checked;
    const reqSchoolCar = document.getElementById('admin_trip_req_school_car').checked;
    const reqExpense = document.getElementById('admin_trip_req_travel_expense').checked;
    const expenseAmount = reqExpense ? parseFloat($('#admin_trip_travel_expense_amount').val()) || null : null;
    const reqOther = document.getElementById('admin_trip_req_other').checked;
    const reqOtherText = reqOther ? $('#admin_trip_req_other_text').val().trim() : '';

    // ---------- Section 5 ----------
    const contact_phone = $('#admin_trip_contact_phone').val().trim();
    const contact_address = $('#admin_trip_contact_address').val().trim();
    const submittedDateIso = $('#admin_trip_submitted_date_iso').val() || null;

    // ---------- Companions ----------
    const companionsChecked = document.getElementById('admin_trip_has_companions').checked;
    const companionTeachers = companionsChecked && adminTsTeachers ? adminTsTeachers.getValue() : [];
    const companionStudents = companionsChecked && adminTsStudents ? adminTsStudents.getValue() : [];
    const companionCount = 1 + companionTeachers.length + companionStudents.length;

    // ---------- File upload ----------
    let attachmentFileId = null;
    const fileInput = document.getElementById('admin_trip_attachment');
    const existingFileId = $('#admin_existing_attachment').data('fileId') || null;

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) return Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'warning');
        try {
            attachmentFileId = await window.uploadTripFile(file, tripSystemSettings.evidence_folder_id, tripSystemSettings.gas_url);
        } catch (err) {
            Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error'); return;
        }
    } else if (existingFileId) {
        attachmentFileId = existingFileId;
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // ✅ Payload — ใช้ field ใหม่ทั้งหมด เหมือน teacher
    const payload = {
        personnel_id: personnelId,
        fiscal_year: tripSystemSettings.fiscal_year,
        eval_round: tripSystemSettings.eval_round,
        purpose: purpose,
        purpose_other: purposeOther || null,
        title, location,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        contact_phone, contact_address,
        attachment_file_id: attachmentFileId,
        pdf_url: null,
        submitted_date: submittedDateIso,
        status: 'รออนุมัติ',
        // Companion
        companion_teachers: companionTeachers,
        companion_students: companionStudents,
        companion_count: companionCount,
        // Doc
        doc_number: docNumber || null,
        doc_date: docDateIso,
        // Travel
        travel_vehicle: travelVehicle || null,
        depart_from_date: departFromDateIso,
        depart_from_time: departFromTime,
        return_to_date: returnToDateIso,
        return_to_time: returnToTime,
        // Req
        req_official_letter: reqOfficial,
        req_parent_notice: reqParent,
        req_travel_expense: reqExpense,
        travel_expense_amount: expenseAmount,
        req_school_car: reqSchoolCar,
        req_other: reqOther,
        req_other_text: reqOtherText || null
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
// Edit (from admin table) — Extended
// ==========================================
window.editAdminTrip = async function (id) {
    const t = allTripsData.find(x => x.id === id);
    if (!t) return;

    document.getElementById('adminTripForm').reset();
    $('#admin_trip_id').val(t.id);

    // Personnel
    const personnelEl = document.getElementById('admin_trip_personnel_id');
    if (personnelEl && personnelEl.tomselect) personnelEl.tomselect.setValue(t.personnel_id);

    // ชื่อผู้ขอ
    const p = allPersonnelData.find(x => x.id === t.personnel_id);
    const reqNameEl = document.getElementById('admin_trip_requester_name');
    if (p && reqNameEl) reqNameEl.value = `${p.prefix || ''}${p.first_name} ${p.last_name}`;

    // Purpose
    if (t.purpose) {
        const radio = document.querySelector(`input[name="admin_purpose"][value="${t.purpose}"]`);
        if (radio) radio.checked = true;
        if (t.purpose === 'อื่นๆ' && t.purpose_other) {
            document.getElementById('adminPurposeOtherWrap').classList.remove('hidden');
            $('#admin_trip_purpose_other').val(t.purpose_other);
        }
    }

    // Section 2
    $('#admin_trip_title').val(t.title);
    $('#admin_trip_location').val(t.location || '');
    $('#admin_trip_doc_number').val(t.doc_number || '');

    // Section 3
    $('#admin_trip_travel_vehicle').val(t.travel_vehicle || '');
    if (t.depart_from_time) $('#admin_trip_depart_from_time').val(t.depart_from_time);
    if (t.return_to_time) $('#admin_trip_return_to_time').val(t.return_to_time);

    // Section 4
    if (t.req_official_letter) document.getElementById('admin_trip_req_official_letter').checked = true;
    if (t.req_parent_notice) document.getElementById('admin_trip_req_parent_notice').checked = true;
    if (t.req_school_car) document.getElementById('admin_trip_req_school_car').checked = true;
    if (t.req_travel_expense) {
        document.getElementById('admin_trip_req_travel_expense').checked = true;
        document.getElementById('adminExpenseAmountWrap').classList.remove('hidden');
        $('#admin_trip_travel_expense_amount').val(t.travel_expense_amount || '');
    }
    if (t.req_other) {
        document.getElementById('admin_trip_req_other').checked = true;
        document.getElementById('adminOtherReqWrap').classList.remove('hidden');
        $('#admin_trip_req_other_text').val(t.req_other_text || '');
    }

    // Section 5
    $('#admin_trip_contact_phone').val(t.contact_phone || '');
    $('#admin_trip_contact_address').val(t.contact_address || '');

    if (t.attachment_file_id) {
        $('#admin_existing_attachment').removeClass('hidden');
        $('#admin_existing_attachment_name').text(`ไฟล์เดิม ID: ${t.attachment_file_id}`);
        $('#admin_existing_attachment').data('fileId', t.attachment_file_id);
    }

    // ---------- วันที่ (flatpickr) ----------
    const setFp = (iso, fieldId) => {
        if (!iso) return;
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#admin_trip_${fieldId}`)[0]?._flatpickr;
        if (fp) {
            fp.setDate(new Date(y, m - 1, d), false);
            $(`#admin_trip_${fieldId}`).val(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`);
            $(`#admin_trip_${fieldId}_iso`).val(iso);
        }
    };
    setFp(t.start_date, 'start_date');
    setFp(t.end_date, 'end_date');
    if (t.submitted_date) setFp(t.submitted_date, 'submitted_date');
    if (t.doc_date) setFp(t.doc_date, 'doc_date');
    if (t.depart_from_date) setFp(t.depart_from_date, 'depart_from_date');
    if (t.return_to_date) setFp(t.return_to_date, 'return_to_date');
    adminTripCalculateDays();

    // ---------- Companions ----------
    const compTeachers = Array.isArray(t.companion_teachers) ? t.companion_teachers : [];
    const compStudents = Array.isArray(t.companion_students) ? t.companion_students : [];

    if (compTeachers.length > 0 || compStudents.length > 0) {
        document.getElementById('admin_trip_has_companions').checked = true;
        document.getElementById('adminCompanionsPanel').classList.remove('hidden');
        if (!adminTsTeachers || !adminTsStudents) await initAdminTripCompanionSelects();

        // ครู
        if (compTeachers.length > 0 && adminTsTeachers) {
            const { data: teachers } = await db.from('core_personnel')
                .select('id, prefix, first_name, last_name, department, position').in('id', compTeachers);
            (teachers || []).forEach(tc => adminTsTeachers.addOption({
                id: tc.id,
                name: `${tc.prefix || ''}${tc.first_name} ${tc.last_name}`,
                department: tc.department || '',
                position: tc.position || ''
            }));
            adminTsTeachers.setValue(compTeachers);
        }

        // นักเรียน
        if (compStudents.length > 0 && adminTsStudents) {
            const { data: school } = await db.from('core_school_info')
                .select('current_academic_year, current_semester').single();
            const acadYear = String(school?.current_academic_year || '');
            const sem = String(school?.current_semester || '1');

            const { data: students } = await db.from('core_students')
                .select(`id, prefix, first_name, last_name, student_id_card,
                    student_enrollments(student_number, academic_year, semester,
                        core_classrooms(grade_level, room_number))`)
                .in('id', compStudents);

            (students || []).forEach(s => {
                const enrList = s.student_enrollments || [];
                const current = enrList.find(e =>
                    String(e.academic_year) === acadYear && String(e.semester) === sem
                ) || enrList[0];
                const cls = current?.core_classrooms;
                const classText = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';
                const numText = current?.student_number ? `เลขที่ ${current.student_number}` : '';
                const name = `${s.prefix || ''}${s.first_name} ${s.last_name}`;

                adminTsStudents.addOption({
                    id: s.id,
                    name: name,
                    display: `${name} (${classText} ${numText}) - ${s.student_id_card}`,
                    class_text: classText,
                    student_number: current?.student_number || '-',
                    student_id_card: s.student_id_card
                });
            });
            adminTsStudents.setValue(compStudents);
        }
        updateAdminTotalCompanions();
    } else {
        document.getElementById('admin_trip_has_companions').checked = false;
        document.getElementById('adminCompanionsPanel').classList.add('hidden');
        if (adminTsTeachers) adminTsTeachers.clear();
        if (adminTsStudents) adminTsStudents.clear();
        updateAdminTotalCompanions();
    }

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
        'ประเภท': t.purpose || t.trip_type || '-',
        'เรื่อง': t.title,
        'สถานที่': t.location || '-',
        'เริ่ม': fmt(t.start_date),
        'สิ้นสุด': fmt(t.end_date),
        'จำนวนวัน': t.status === 'ไม่อนุมัติ' ? 0 : t.total_days,
        'เดินทางโดย': t.travel_by || t.travel_vehicle || '-',
        'งบประมาณ': t.budget_source || '-',
        'จำนวนเงิน': t.budget_amount || 0,
        'ผู้ร่วมเดินทาง': t.companion_count || 1,
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

// ✅ NEW: Companion + Purpose + Req
window.toggleAdminCompanions = window.toggleAdminCompanions;
window.updateAdminTotalCompanions = window.updateAdminTotalCompanions;
window.onAdminPurposeChange = window.onAdminPurposeChange;
window.toggleAdminExpenseAmount = window.toggleAdminExpenseAmount;
window.toggleAdminOtherReq = window.toggleAdminOtherReq;

// Trip state globals
window.allTripsData = allTripsData;
window.allPersonnelData = allPersonnelData;

console.log('✅ government_trip_admin.js v2.0 loaded (Form เหมือน teacher + Companion + Purpose + Req)');
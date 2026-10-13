// ==========================================================================
// regis_teacher.js — ระบบบริหารงานทะเบียน (Admin)
// v3.0 — Soft Delete + Super Admin Only + Restore
// --------------------------------------------------------------------------
// ✅ Soft Delete: ข้อมูลไม่หายถาวร (deleted_at column)
// ✅ ปุ่มลบแสดงเฉพาะ Super Admin
// ✅ Super Admin ดูรายการที่ซ่อนได้ + กู้คืนได้
// ✅ Dashboard แสดงเฉพาะรายการ active
// ✅ Template-compliant: WRKModuleAdmin bootstrap + sync + onSidebarRendered
// ==========================================================================

// ==========================================
// 🚀 Bootstrap Module Admin
// ==========================================
if (typeof WRKModuleAdmin !== 'undefined') {
    WRKModuleAdmin.bootstrap('regis', 'regis_auth_cache', 'isRegisModuleAdmin');
}

// ==========================================
// State
// ==========================================
let tableInstance = null;
let allRequests = [];        // ข้อมูลที่แสดงในตาราง (ตาม showDeleted)
let sysSettings = null;
let currentUser = null;
let currentProfile = null;
let currentUserRole = null;
let isAdminMode = false;
let isModuleAdmin = false;

// ✅ Soft Delete state
let showDeleted = false;      // toggle แสดงรายการที่ถูกลบ
let deletedCount = 0;         // จำนวนรายการที่ถูกลบ
let activeCount = 0;          // จำนวนรายการ active (ไม่ถูกลบ)

// ==========================================
// ✅ ปุ่มนำทาง — regis
// ==========================================
window.refreshNavButtons = function () {
    const role = window.currentUserRole || currentUserRole || '';
    const allowedRoles = ['super_admin', 'admin', 'director', 'deputy'];

    const isModuleAdminEffective = isModuleAdmin
        || (typeof WRKModuleAdmin !== 'undefined' && WRKModuleAdmin.has('regis'));

    if (typeof WRKModuleAdmin !== 'undefined') {
        WRKModuleAdmin.sync('regis', isModuleAdminEffective, false);
    }

    console.log('🔘 refreshNavButtons (regis):', { role, isModuleAdmin: isModuleAdminEffective });
};

// ==========================================
// INIT
// ==========================================
$(document).ready(async function () {
    try {
        await checkAuth();
    } catch (error) {
        console.error('❌ Unhandled error:', error);
        Swal.fire('เกิดข้อผิดพลาดร้ายแรง', error.message, 'error').then(() => {
            window.location.href = 'index.html';
        });
    }
});

// ==========================================
// ตรวจสอบสิทธิ์
// ==========================================
async function checkAuth() {
    console.log('🔍 checkAuth เริ่มทำงาน');

    try {
        if (typeof Swal === 'undefined') {
            console.error('❌ SweetAlert2 (Swal) ไม่ถูกโหลด');
            alert('เกิดข้อผิดพลาด: SweetAlert2 ไม่ถูกโหลด กรุณาติดต่อผู้ดูแลระบบ');
            window.location.replace('index.html');
            return;
        }

        const result = await window.checkSessionAndRole('ระบบงานทะเบียน', WRK_ROLES.ALLOWED);
        if (!result) return;

        const { user, personnel, role } = result;
        currentUser = user;
        currentProfile = personnel;
        currentUserRole = role;

        window.currentUser = currentUser;
        window.currentProfile = currentProfile;
        window.currentUserRole = currentUserRole;

        setUserDisplayName(currentProfile);
        updateUserRoleLabel(role);
        renderUserAvatar(currentProfile);

        console.log('✅ User:', currentProfile.first_name, 'Role:', role);

        const allowedRoles = ['super_admin', 'admin', 'director', 'deputy', 'office'];
        const isDirectlyAllowed = allowedRoles.includes(role);

        isModuleAdmin = await hasModuleAccess(role, 'regis', user.id);

        if (typeof WRKModuleAdmin !== 'undefined') {
            WRKModuleAdmin.sync('regis', isModuleAdmin, false);
        }
        window.isModuleAdmin = isModuleAdmin;

        const isTeacherOrStaff = ['teacher', 'staff'].includes(role);
        const canAccess = isDirectlyAllowed || (isTeacherOrStaff && isModuleAdmin);

        if (!canAccess) {
            await Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้งานระบบงานทะเบียน กรุณาติดต่อผู้ดูแลระบบ',
                confirmButtonText: 'ตกลง'
            });
            window.location.replace('index.html');
            return;
        }

        isAdminMode = isDirectlyAllowed || isModuleAdmin;

        if (isTeacherOrStaff && isModuleAdmin) {
            const roleEl = document.getElementById('userRole');
            if (roleEl) roleEl.innerText = 'แอดมินโมดูลงานทะเบียน';
        }

        if (typeof window.refreshNavButtons === 'function') window.refreshNavButtons();

        await logUserAction('เข้าสู่ระบบงานทะเบียน', 'regis');

        const mainBody = document.getElementById('mainBody');
        if (mainBody) mainBody.classList.replace('opacity-0', 'opacity-100');

        // ✅ Inject ปุ่ม "ดูรายการที่ซ่อน" (Super Admin เท่านั้น)
        injectToggleButton();

        // โหลดข้อมูล
        await loadSettings();
        await loadData();

        console.log('✅ checkAuth สำเร็จ');

    } catch (error) {
        console.error('❌ checkAuth error:', error);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: error.message || 'กรุณาติดต่อผู้ดูแลระบบ',
            confirmButtonText: 'ตกลง'
        }).then(() => {
            window.location.replace('index.html');
        });
    }
}

// ==========================================
// ✅ Inject ปุ่ม "ดูรายการที่ซ่อน" (Super Admin Only)
// ==========================================
function injectToggleButton() {
    if (document.getElementById('btn-show-deleted')) return; // inject แล้ว

    const table = document.getElementById('requestsTable');
    if (!table) {
        console.warn('⚠️ ไม่พบ #requestsTable');
        return;
    }

    // ✅ หา header container
    let headerContainer = null;

    const card = table.closest('.bg-white');
    if (card) {
        headerContainer = card.querySelector(':scope > .flex.justify-between');
    }

    if (!headerContainer) {
        // fallback: walk up หา div ที่มี class "flex justify-between"
        let node = table;
        for (let i = 0; i < 5 && node; i++) {
            node = node.parentElement;
            if (node && node.classList && 
                node.classList.contains('flex') && 
                node.classList.contains('justify-between')) {
                headerContainer = node;
                break;
            }
        }
    }

    if (!headerContainer) {
        console.warn('⚠️ injectToggleButton: ไม่พบ header container');
        return;
    }

    const btn = document.createElement('button');
    btn.id = 'btn-show-deleted';
    btn.className = 'hidden bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-xl text-sm transition flex items-center gap-2 shadow-sm';
    btn.onclick = toggleShowDeleted;
    btn.innerHTML = '<i class="fa-solid fa-trash-restore"></i> <span id="deleted-btn-text">ดูรายการที่ซ่อน</span>';
    headerContainer.appendChild(btn);
    console.log('✅ injectToggleButton: ใส่ปุ่มเรียบร้อย');
}

// ==========================================
// ✅ Toggle แสดง/ซ่อนรายการที่ถูกลบ
// ==========================================
async function toggleShowDeleted() {
    if (currentUserRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้น', 'error');
        return;
    }

    showDeleted = !showDeleted;
    console.log(`🔄 Toggle showDeleted → ${showDeleted}`);

    await loadData();
}

// ==========================================
// ✅ Update ปุ่ม toggle (label + style)
// ==========================================
function updateToggleButton() {
    const btn = document.getElementById('btn-show-deleted');
    if (!btn) return;

    // ✅ แสดงเฉพาะ super_admin
    if (currentUserRole !== 'super_admin') {
        btn.classList.add('hidden');
        return;
    }
    btn.classList.remove('hidden');

    if (showDeleted) {
        btn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition flex items-center gap-2 shadow-sm';
        btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> กลับไปดูรายการปกติ';
    } else {
        btn.className = 'bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-xl text-sm transition flex items-center gap-2 shadow-sm';
        const countLabel = deletedCount > 0 ? ` (${deletedCount})` : '';
        btn.innerHTML = `<i class="fa-solid fa-trash-restore"></i> ดูรายการที่ซ่อน${countLabel}`;
    }
}

// ==========================================
// LOGOUT
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        if (typeof WRKModuleAdmin !== 'undefined') WRKModuleAdmin.reset();
        await db.auth.signOut();
        window.location.href = 'login.html';
    }
}

// ==========================================
// โหลดการตั้งค่าระบบ
// ==========================================
async function loadSettings() {
    try {
        const { data, error } = await db.from('regis_settings').select('*').maybeSingle();
        if (error && error.code !== 'PGRST116') {
            console.error('❌ loadSettings error:', error);
            return;
        }
        if (data) {
            sysSettings = data;
            document.getElementById('gasApiUrl').value = data.gas_api_url || '';
            document.getElementById('slideTemplateId').value = data.slide_template_id || '';
            document.getElementById('pdfFolderId').value = data.pdf_folder_id || '';
        } else {
            sysSettings = { gas_api_url: '', slide_template_id: '', pdf_folder_id: '' };
            document.getElementById('gasApiUrl').value = '';
            document.getElementById('slideTemplateId').value = '';
            document.getElementById('pdfFolderId').value = '';
        }
    } catch (err) {
        console.error('loadSettings error:', err);
    }
}

// ==========================================
// บันทึกการตั้งค่า
// ==========================================
async function saveSettings(e) {
    e.preventDefault();

    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) {
        return;
    }

    const gas = document.getElementById('gasApiUrl').value;
    const template = document.getElementById('slideTemplateId').value;
    const folder = document.getElementById('pdfFolderId').value;

    Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const { data: existing, error: checkError } = await db.from('regis_settings')
            .select('id')
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        let error;
        if (existing) {
            const { error: updateError } = await db.from('regis_settings')
                .update({ gas_api_url: gas, slide_template_id: template, pdf_folder_id: folder })
                .eq('id', existing.id);
            error = updateError;
        } else {
            const { error: insertError } = await db.from('regis_settings')
                .insert({ gas_api_url: gas, slide_template_id: template, pdf_folder_id: folder });
            error = insertError;
        }

        Swal.close();

        if (error) {
            Swal.fire('Error', error.message, 'error');
            return;
        }

        await logUserAction('บันทึกการตั้งค่าระบบงานทะเบียน', 'regis');
        Swal.fire('สำเร็จ', 'อัปเดตการตั้งค่าเรียบร้อย', 'success');
        closeSettingsModal();
        await loadSettings();

    } catch (error) {
        Swal.close();
        console.error('saveSettings error:', error);
        Swal.fire('Error', error.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    }
}

// ==========================================
// Modal Settings
// ==========================================
function openSettingsModal() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('settingsModal').classList.add('flex');
}
function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('settingsModal').classList.remove('flex');
}

// ==========================================
// ✅ loadData — แยก active / deleted
// ==========================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        console.log('🔍 loadData: เริ่ม query (showDeleted =', showDeleted, ')');

        const { data, error, count } = await db.from('regis_requests')
            .select(`*, core_students(student_id_card, prefix, first_name, last_name, avatar_students_url, student_enrollments(core_classrooms(grade_level, room_number)))`, { count: 'exact' })
            .order('created_at', { ascending: false });

        Swal.close();

        if (error) {
            console.error('❌ loadData error:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                html: `<div class="text-left text-sm">
                    <p class="font-bold text-rose-600 mb-2">${error.message}</p>
                    ${error.code ? `<p class="text-xs text-slate-500">Code: <code>${error.code}</code></p>` : ''}
                    ${error.code === '42703' ? `<p class="text-xs text-amber-600 mt-2 font-bold">⚠️ กรุณารัน SQL: ALTER TABLE regis_requests ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;</p>` : ''}
                </div>`
            });
            return;
        }

        const allData = data || [];

        // ✅ แยก active / deleted
        const activeData = allData.filter(r => !r.deleted_at);
        const deletedData = allData.filter(r => r.deleted_at);

        activeCount = activeData.length;
        deletedCount = deletedData.length;

        // ✅ เลือกข้อมูลที่จะแสดง
        allRequests = showDeleted ? deletedData : activeData;

        console.log(`📊 active: ${activeCount}, deleted: ${deletedCount}, showDeleted: ${showDeleted}`);

        updateDashboard();
        updateToggleButton();
        renderTable();

        if (allRequests.length === 0) {
            const msg = showDeleted 
                ? { title: 'ไม่มีรายการที่ถูกซ่อน', text: 'ยังไม่มีคำขอที่ถูกลบ' }
                : { title: 'ไม่มีรายการคำขอ', text: 'ยังไม่มีคำขอเอกสารในระบบ' };
            
            Swal.fire({
                icon: 'info',
                title: msg.title,
                text: msg.text,
                timer: 2500,
                showConfirmButton: false
            });
        }

    } catch (err) {
        Swal.close();
        console.error('❌ loadData catch error:', err);
        Swal.fire('Error', err.message || 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

// ==========================================
// ✅ Dashboard — แสดงเฉพาะ active
// ==========================================
function updateDashboard() {
    // Dashboard ใช้ข้อมูล active เท่านั้น ไม่ว่า showDeleted จะเปิด/ปิด
    // (เพราะ dashboard แสดงภาพรวมของงานที่ต้องทำ)
    // โดย query เฉพาะ active count แยก

    // ใช้ allRequests ถ้า showDeleted=false (ซึ่งเป็น default)
    // ถ้า showDeleted=true → ต้องใช้ตัวเลขที่คำนวณไว้แล้ว

    const activeTotal = activeCount; // จาก loadData

    // แต่นับ pending/completed ต้องดูจาก active data
    // ถ้า showDeleted=true → allRequests คือ deleted → ต้องดึง active จากตรงไหน?
    // Solution: ให้ loadData เก็บ activeData ไว้ใน global ด้วย

    const activeData = window._activeData || [];

    const pending = activeData.filter(r => r.status === 'กำลังดำเนินการ').length;
    const completed = activeData.filter(r => r.status === 'ดำเนินการเรียบร้อย').length;

    const totalEl = document.getElementById('dashTotal');
    if (totalEl) totalEl.innerText = activeTotal;
    const pendingEl = document.getElementById('dashPending');
    if (pendingEl) pendingEl.innerText = pending;
    const completedEl = document.getElementById('dashCompleted');
    if (completedEl) completedEl.innerText = completed;
}

// ==========================================
// ✅ renderTable — แสดงตาม showDeleted + ปุ่มจัดการตาม role
// ==========================================
function renderTable() {
    if (tableInstance) {
        try { tableInstance.destroy(); } catch (e) { }
        tableInstance = null;
    }

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (allRequests.length > 0) {
        const isOffice = (currentUserRole === 'office');
        const isSuperAdmin = (currentUserRole === 'super_admin');

        allRequests.forEach(req => {
            const std = req.core_students;
            let classStr = '-';
            if (std && std.student_enrollments && std.student_enrollments.length > 0) {
                const cls = std.student_enrollments[0].core_classrooms;
                if (cls) classStr = `${cls.grade_level}/${cls.room_number}`;
            }

            const dateObj = new Date(req.created_at);
            const dateStr = dateObj.toLocaleDateString('th-TH');
            const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const timestamp = dateObj.getTime();
            const isDeleted = !!req.deleted_at;

            const badgeColor = req.status === 'กำลังดำเนินการ'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700';

            // ✅ Action buttons — ตามสถานะ + role
            let actionButtons = '';

            if (isDeleted) {
                // ✅ รายการที่ถูกลบ
                actionButtons = `
                    <button onclick="viewRequestDetail('${req.id}')" class="text-blue-500 hover:text-blue-700 transition" title="ดูรายละเอียด">
                        <i class="fa-solid fa-eye text-lg"></i>
                    </button>
                `;
                if (isSuperAdmin) {
                    actionButtons += `
                        <button onclick="restoreRequest('${req.id}')" class="text-emerald-500 hover:text-emerald-700 transition" title="กู้คืน">
                            <i class="fa-solid fa-trash-restore text-lg"></i>
                        </button>
                    `;
                }
            } else {
                // ✅ รายการปกติ
                actionButtons = `
                    <button onclick="viewRequestDetail('${req.id}')" class="text-blue-500 hover:text-blue-700 transition" title="ดูรายละเอียด">
                        <i class="fa-solid fa-eye text-lg"></i>
                    </button>
                `;

                if (req.status === 'กำลังดำเนินการ') {
                    actionButtons += `
                        <button onclick="approveRequest('${req.id}')" class="text-emerald-500 hover:text-emerald-700 transition" title="ปรับสถานะเรียบร้อย">
                            <i class="fa-solid fa-circle-check text-lg"></i>
                        </button>
                    `;
                }

                // ✅ ปุ่มลบ — เฉพาะ super_admin เท่านั้น
                if (isSuperAdmin) {
                    actionButtons += `
                        <button onclick="deleteRequest('${req.id}')" class="text-red-400 hover:text-red-600 transition" title="ซ่อน (Soft Delete)">
                            <i class="fa-solid fa-trash text-lg"></i>
                        </button>
                    `;
                }
            }

            // ✅ Row class ตามสถานะ
            const rowClass = isDeleted
                ? 'border-b border-slate-100 bg-slate-50/60 text-slate-400 opacity-80'
                : 'border-b border-slate-100 hover:bg-slate-50 transition text-slate-700';

            const deletedBadge = isDeleted
                ? '<span class="ml-2 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-bold">ถูกลบ</span>'
                : '';

            const nameClass = isDeleted ? 'line-through' : '';

            const tr = `
                <tr class="${rowClass}">
                    <td class="px-4 py-3 font-mono text-xs">
                        ${req.id.substring(0, 8).toUpperCase()}
                        ${deletedBadge}
                    </td>
                    <td class="px-4 py-3" data-order="${timestamp}">${dateStr}</td>
                    <td class="px-4 py-3 ${isDeleted ? 'text-slate-400' : 'text-slate-400'}">${timeStr} น.</td>
                    <td class="px-4 py-3">${std ? std.student_id_card : '-'}</td>
                    <td class="px-4 py-3 font-medium ${nameClass}">${std ? `${std.prefix || ''}${std.first_name} ${std.last_name} (${classStr})` : 'ไม่พบข้อมูล'}</td>
                    <td class="px-4 py-3">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}">${req.status}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex items-center justify-center gap-3">
                            ${actionButtons}
                        </div>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', tr);
        });
    }

    // ✅ Init DataTable
    const emptyTableMsg = showDeleted
        ? '<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-trash-restore text-3xl block mb-2"></i>ยังไม่มีรายการที่ถูกซ่อน</div>'
        : '<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-inbox text-3xl block mb-2"></i>ยังไม่มีคำขอเอกสาร</div>';

    tableInstance = $('#requestsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json',
            emptyTable: emptyTableMsg,
            zeroRecords: '<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-magnifying-glass text-3xl block mb-2"></i>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>'
        },
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4"Bf>rt<"flex justify-between items-center mt-4"ip>',
        buttons: [
            {
                extend: 'excelHtml5',
                text: '<i class="fa-solid fa-file-excel mr-1"></i> ส่งออก Excel',
                className: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-xl text-sm border-none shadow',
                exportOptions: { columns: [0, 1, 2, 3, 4, 5] }
            }
        ],
        order: [[1, 'desc']],
        columnDefs: [
            { targets: [0, 2, 5, 6], orderable: false, searchable: false },
            { targets: [1, 3, 4], orderable: true },
            { targets: 1, type: 'num' }
        ],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]]
    });
}

// ==========================================
// View Request Detail
// ==========================================
function viewRequestDetail(id) {
    const req = allRequests.find(r => r.id === id);
    if (!req) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลคำขอ', 'error');
        return;
    }

    const std = req.core_students;
    let classInfo = '-';
    if (std && std.student_enrollments && std.student_enrollments.length > 0) {
        const cls = std.student_enrollments[0].core_classrooms;
        if (cls) classInfo = `ชั้น ${cls.grade_level}/${cls.room_number}`;
    }

    const requestDate = req.request_date ? new Date(req.request_date).toLocaleDateString('th-TH') : '-';
    const createdDate = req.created_at ? new Date(req.created_at).toLocaleString('th-TH') : '-';
    const deletedDate = req.deleted_at ? new Date(req.deleted_at).toLocaleString('th-TH') : null;

    const fullName = std ? `${std.prefix || ''}${std.first_name} ${std.last_name}` : 'นักเรียน';
    let avatarUrl = std?.avatar_students_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=256&font-size=0.4`;

    const shortId = req.id.substring(0, 8).toUpperCase();
    const isDeleted = !!req.deleted_at;

    const detailHTML = `
        <div class="flex flex-col md:flex-row gap-6 items-start">
            <div class="flex-shrink-0 flex flex-col items-center">
                <img src="${avatarUrl}" 
                     alt="รูปนักเรียน" 
                     class="w-32 h-32 rounded-full object-cover border-4 border-blue-200 shadow-lg cursor-pointer hover:shadow-xl transition-shadow duration-200"
                     onclick="openLightbox('${avatarUrl}', '${fullName}')"
                     title="คลิกเพื่อดูรูปขนาดใหญ่">
                <p class="text-xs text-slate-400 mt-1">คลิกที่รูปเพื่อขยาย</p>
            </div>

            <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-left w-full">
                ${isDeleted ? `
                    <div class="bg-rose-50 p-3 rounded-xl border border-rose-200 md:col-span-2">
                        <p class="text-xs text-rose-600 font-bold uppercase">
                            <i class="fa-solid fa-trash mr-1"></i> รายการนี้ถูกลบแล้ว
                        </p>
                        <p class="text-sm text-rose-700 mt-1">ลบเมื่อ: ${deletedDate || '-'}</p>
                    </div>
                ` : ''}

                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">รหัสคำขอ</p>
                    <p class="text-sm font-mono font-bold text-slate-800">${shortId}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">สถานะ</p>
                    <p class="text-sm font-bold ${req.status === 'กำลังดำเนินการ' ? 'text-amber-600' : 'text-emerald-600'}">
                        ${req.status}
                    </p>
                </div>

                <div class="bg-blue-50 p-3 rounded-xl md:col-span-2">
                    <p class="text-xs text-blue-500 font-bold uppercase">ข้อมูลนักเรียน</p>
                    <p class="text-sm font-semibold text-slate-800">${std ? `${std.prefix || ''}${std.first_name} ${std.last_name}` : 'ไม่พบข้อมูล'}</p>
                    <p class="text-sm text-slate-600">รหัสประจำตัว: ${std ? std.student_id_card : '-'} | ${classInfo}</p>
                </div>

                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">วันที่ยื่นคำขอ</p>
                    <p class="text-sm font-semibold">${requestDate}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">วันที่บันทึกในระบบ</p>
                    <p class="text-sm font-semibold">${createdDate}</p>
                </div>

                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">ชื่อบิดา</p>
                    <p class="text-sm font-semibold">${req.father_name || '-'}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl">
                    <p class="text-xs text-slate-500 font-bold uppercase">ชื่อมารดา</p>
                    <p class="text-sm font-semibold">${req.mother_name || '-'}</p>
                </div>

                <div class="bg-slate-50 p-3 rounded-xl md:col-span-2">
                    <p class="text-xs text-slate-500 font-bold uppercase">เบอร์โทรติดต่อ</p>
                    <p class="text-sm font-semibold">${req.phone || '-'}</p>
                </div>

                <div class="bg-emerald-50 p-3 rounded-xl md:col-span-2">
                    <p class="text-xs text-emerald-500 font-bold uppercase">เอกสารที่ขอ</p>
                    <ul class="text-sm space-y-1 mt-1">
                        ${req.doc_pp1_qty > 0 ? `<li class="flex items-center gap-2"><i class="fa-regular fa-file-pdf text-emerald-600"></i> ใบแสดงผลการเรียน (ปพ.1) จำนวน ${req.doc_pp1_qty} ฉบับ</li>` : ''}
                        ${req.doc_pp7_qty > 0 ? `<li class="flex items-center gap-2"><i class="fa-regular fa-file-pdf text-emerald-600"></i> ใบรับรองการเป็นนักเรียน (ปพ.7) จำนวน ${req.doc_pp7_qty} ฉบับ</li>` : ''}
                        ${req.doc_other_qty > 0 ? `<li class="flex items-center gap-2"><i class="fa-regular fa-file-pdf text-emerald-600"></i> ${req.doc_other_text} จำนวน ${req.doc_other_qty} ฉบับ</li>` : ''}
                    </ul>
                    ${req.doc_pp1_qty === 0 && req.doc_pp7_qty === 0 && req.doc_other_qty === 0 ? '<p class="text-sm text-slate-500">- ไม่มีรายการเอกสาร -</p>' : ''}
                </div>

                <div class="bg-indigo-50 p-3 rounded-xl md:col-span-2">
                    <p class="text-xs text-indigo-500 font-bold uppercase">วัตถุประสงค์</p>
                    <p class="text-sm font-semibold">${req.purpose || '-'}</p>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        title: `📄 รายละเอียดคำขอ`,
        html: detailHTML,
        width: 850,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#4f46e5',
        showCloseButton: true,
        customClass: {
            popup: 'rounded-2xl',
            confirmButton: 'font-bold px-6 py-2.5'
        }
    });
}

// ==========================================
// Approve Request
// ==========================================
async function approveRequest(id) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติคำขอได้')) {
        return;
    }
    const { error } = await db.from('regis_requests').update({ status: 'ดำเนินการเรียบร้อย' }).eq('id', id);
    if (!error) {
        await logUserAction(`อนุมัติคำขอทะเบียน ID: ${id}`, 'regis');
        Swal.fire('สำเร็จ', 'อัปเดตสถานะคำขอแล้ว', 'success');
        loadData();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

// ==========================================
// ✅ Delete Request — Soft Delete (Super Admin Only)
// ==========================================
async function deleteRequest(id) {
    // ✅ 1. Super Admin เท่านั้น
    if (currentUserRole !== 'super_admin') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์',
            text: 'เฉพาะ Super Admin เท่านั้นที่ลบข้อมูลได้',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    // ✅ 2. ยืนยัน
    const { isConfirmed } = await Swal.fire({
        title: '⚠️ ซ่อนคำขอนี้?',
        html: `<div class="text-left text-sm space-y-2">
            <p class="text-slate-700">คำขอจะถูกซ่อนจากรายการหลัก (Soft Delete)</p>
            <p class="text-emerald-600 text-xs">
                <i class="fa-solid fa-check-circle mr-1"></i>
                Super Admin สามารถกู้คืนได้ทุกเมื่อ
            </p>
            <p class="text-slate-500 text-xs mt-3">
                ID: <code class="bg-slate-100 px-1 rounded">${id.substring(0, 8)}</code>
            </p>
        </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ซ่อนคำขอ',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('regis_requests')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

    Swal.close();

    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }

    await logUserAction(`[SOFT DELETE] ซ่อนคำขอทะเบียน ID: ${id}`, 'regis');

    Swal.fire({
        icon: 'success',
        title: 'ซ่อนเรียบร้อย',
        text: 'คำขอถูกซ่อนจากรายการหลัก แต่ยังกู้คืนได้',
        timer: 1800,
        showConfirmButton: false
    });

    loadData();
}

// ==========================================
// ✅ Restore Request — กู้คืน (Super Admin Only)
// ==========================================
async function restoreRequest(id) {
    if (currentUserRole !== 'super_admin') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์',
            text: 'เฉพาะ Super Admin เท่านั้นที่กู้คืนได้',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'กู้คืนคำขอนี้?',
        html: `<div class="text-sm space-y-2">
            <p>คำขอจะกลับไปแสดงในรายการปกติ</p>
            <p class="text-slate-500 text-xs">
                ID: <code class="bg-slate-100 px-1 rounded">${id.substring(0, 8)}</code>
            </p>
        </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: '<i class="fa-solid fa-trash-restore mr-1"></i> กู้คืน',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังกู้คืน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('regis_requests')
        .update({ deleted_at: null })
        .eq('id', id);

    Swal.close();

    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }

    await logUserAction(`[RESTORE] กู้คืนคำขอทะเบียน ID: ${id}`, 'regis');

    Swal.fire({
        icon: 'success',
        title: 'กู้คืนสำเร็จ',
        text: 'คำขอกลับไปแสดงในรายการปกติแล้ว',
        timer: 1800,
        showConfirmButton: false
    });

    loadData();
}

// ==========================================
// Lightbox รูปนักเรียน
// ==========================================
function openLightbox(imgSrc, studentName) {
    if (!imgSrc) {
        Swal.fire('ไม่มีรูป', 'ไม่พบรูปนักเรียน', 'info');
        return;
    }
    Swal.fire({
        imageUrl: imgSrc,
        imageWidth: '80%',
        imageHeight: 'auto',
        imageAlt: `รูปของ ${studentName}`,
        title: `รูปของ ${studentName}`,
        showCloseButton: true,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#4f46e5',
        customClass: {
            popup: 'rounded-2xl',
            image: 'rounded-xl shadow-lg max-h-[80vh] object-contain'
        }
    });
}

// ==========================================
// จัดการผู้ดูแลระบบโมดูล
// ==========================================
function openAdminModal() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการผู้ดูแลระบบได้')) {
        return;
    }
    document.getElementById('adminModal').classList.remove('hidden');
    document.getElementById('adminModal').classList.add('flex');
    ensureModuleExists().then(() => {
        loadModuleAdmins();
        loadPersonnelOptions();
    });
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('adminModal').classList.remove('flex');
    if (window.tomSelectInstance) {
        window.tomSelectInstance.destroy();
        window.tomSelectInstance = null;
    }
}

async function ensureModuleExists() {
    const { data, error } = await db.from('core_system_modules')
        .select('module_id')
        .eq('module_id', 'regis')
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking module:', error);
        Swal.fire('Error', 'ไม่สามารถตรวจสอบโมดูลในระบบ', 'error');
        return false;
    }

    if (!data) {
        const { error: insertError } = await db.from('core_system_modules')
            .insert([{
                module_id: 'regis',
                module_name: 'งานทะเบียน',
                description: 'ระบบบริหารจัดการงานทะเบียน',
                settings: {}
            }]);
        if (insertError) {
            console.error('Error creating module:', insertError);
            Swal.fire('Error', 'ไม่สามารถสร้างโมดูลงานทะเบียนในระบบ', 'error');
            return false;
        }
    }
    return true;
}

async function loadModuleAdmins() {
    const { data: adminRecords, error } = await db
        .from('core_module_admins')
        .select('id, user_id')
        .eq('module_id', 'regis');

    if (error) {
        console.error(error);
        Swal.fire('Error', 'ไม่สามารถโหลดรายชื่อผู้ดูแลระบบ', 'error');
        return;
    }

    const tbody = document.getElementById('adminTableBody');
    if (!adminRecords || adminRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-slate-400">ยังไม่มีผู้ดูแลระบบในโมดูลนี้</td></tr>`;
        return;
    }

    const userIds = adminRecords.map(a => a.user_id);
    const { data: personnel, error: personError } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, role')
        .in('id', userIds);

    if (personError) {
        console.error(personError);
        Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลบุคลากร', 'error');
        return;
    }

    const personMap = {};
    personnel.forEach(p => personMap[p.id] = p);

    tbody.innerHTML = adminRecords.map(admin => {
        const p = personMap[admin.user_id];
        if (!p) return '';
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        return `
            <tr class="border-b border-slate-100">
                <td class="px-3 py-2">${fullName}</td>
                <td class="px-3 py-2">${p.role || '-'}</td>
                <td class="px-3 py-2 text-center">
                    <button onclick="removeModuleAdmin('${admin.user_id}')" class="text-rose-500 hover:text-rose-700 transition" title="ลบออก">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadPersonnelOptions() {
    const { data: admins } = await db.from('core_module_admins')
        .select('user_id')
        .eq('module_id', 'regis');
    const adminIds = admins ? admins.map(a => a.user_id) : [];

    const { data: personnel, error } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, role')
        .in('role', WRK_ROLES.ALLOWED)
        .order('first_name');

    if (error) {
        console.error(error);
        return;
    }

    const select = document.getElementById('adminUserSelect');
    select.innerHTML = '<option value="">-- เลือกบุคลากร --</option>';

    personnel.forEach(p => {
        if (adminIds.includes(p.id)) return;
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name} (${p.role || 'ไม่มีบทบาท'})`;
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = fullName;
        select.appendChild(option);
    });

    initTomSelect();
}

function initTomSelect() {
    const selectEl = document.getElementById('adminUserSelect');
    if (!selectEl) return;

    if (window.tomSelectInstance) {
        window.tomSelectInstance.destroy();
        window.tomSelectInstance = null;
    }

    window.tomSelectInstance = new TomSelect(selectEl, {
        maxItems: 1,
        placeholder: '-- ค้นหาชื่อบุคลากร --',
        searchField: ['text'],
        sortField: 'text',
        create: false,
        dropdownParent: 'body',
        render: {
            option: function (data, escape) {
                return '<div class="py-1 px-2 hover:bg-indigo-50 cursor-pointer">' + escape(data.text) + '</div>';
            }
        }
    });
}

async function addModuleAdmin() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มผู้ดูแลระบบได้')) {
        return;
    }

    const userId = document.getElementById('adminUserSelect').value;
    if (!userId) {
        Swal.fire('กรุณาเลือกบุคลากร', '', 'warning');
        return;
    }

    const moduleExists = await ensureModuleExists();
    if (!moduleExists) return;

    Swal.fire({ title: 'กำลังเพิ่ม...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('core_module_admins').insert([{
        user_id: userId,
        module_id: 'regis'
    }]);

    Swal.close();
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }

    const { data: person } = await db.from('core_personnel')
        .select('prefix, first_name, last_name')
        .eq('id', userId)
        .single();
    const fullName = person ? `${person.prefix || ''}${person.first_name} ${person.last_name}` : userId;

    await logUserAction(`เพิ่มผู้ดูแลระบบงานทะเบียน: ${fullName}`, 'regis');
    Swal.fire('สำเร็จ', 'เพิ่มผู้ดูแลระบบเรียบร้อยแล้ว', 'success');
    loadModuleAdmins();
    loadPersonnelOptions();
}

async function removeModuleAdmin(userId) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบผู้ดูแลระบบได้')) {
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ',
        text: 'คุณต้องการลบผู้ดูแลระบบท่านนี้ออกจากโมดูลนี้ใช่หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบเลย'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db
        .from('core_module_admins')
        .delete()
        .eq('user_id', userId)
        .eq('module_id', 'regis');

    Swal.close();
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }

    const { data: person } = await db.from('core_personnel')
        .select('prefix, first_name, last_name')
        .eq('id', userId)
        .single();
    const fullName = person ? `${person.prefix || ''}${person.first_name} ${person.last_name}` : userId;

    await logUserAction(`ลบผู้ดูแลระบบงานทะเบียน: ${fullName}`, 'regis');
    Swal.fire('สำเร็จ', 'ลบผู้ดูแลระบบเรียบร้อยแล้ว', 'success');
    loadModuleAdmins();
    loadPersonnelOptions();
}

// ==========================================
// ประกาศ global
// ==========================================
window.logout = logout;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.viewRequestDetail = viewRequestDetail;
window.approveRequest = approveRequest;
window.deleteRequest = deleteRequest;
window.restoreRequest = restoreRequest;          // ✅ NEW
window.toggleShowDeleted = toggleShowDeleted;    // ✅ NEW
window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.openLightbox = openLightbox;

// ==========================================
// ✅ Hook: re-apply UI หลัง sidebar render ใหม่
// ==========================================
window.onSidebarRendered = function () {
    if (typeof window.refreshNavButtons === 'function') window.refreshNavButtons();
    console.log('🔄 onSidebarRendered: re-applied for regis');
};

console.log('✅ regis_teacher.js loaded (v3.0 — Soft Delete + Super Admin Only)');
// ==========================================
// portfolio.js — ระบบแฟ้มสะสมผลงานครู (ปรับปรุง: ใช้ SearchBuilder)
// ==========================================

let currentUser = null;
let currentPersonnel = null;
let currentRole = null;
let currentSchoolInfo = null;
let allEntries = [];
let currentTab = 'dashboard';
let currentEntryType = 'work';
let forceTeacherMode = false;
let actualIsAdmin = false;
let moduleAdminChecked = false;
let isModuleAdmin = false;
let personnelCache = new Map();
let tomSelectInstance = null;

const MODULE_KEY = 'portfolio';
let charts = {};
let dtInstance = null;
let dtInstanceType = null;
let currentTableData = [];

// เพิ่มตัวแปร global สำหรับเก็บข้อมูลทั้งหมด (Dashboard)
let globalEntries = [];
// ==========================================
// 1. ระบบรักษาความปลอดภัย & ตั้งค่าเริ่มต้น
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof flatpickr !== 'undefined') {
        flatpickr.localize(flatpickr.l10ns.th);
    }
    await initPortfolio();
});

/**
 * initPortfolio — ฟังก์ชันเริ่มต้นระบบ
 * แก้ไข: เรียก applyRoleUI และ loadInitialData ตามลำดับ
 */
async function initPortfolio() {
    Swal.fire({
        title: 'กำลังตรวจสอบสิทธิ์...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const result = await checkSessionAndRole('portfolio', WRK_ROLES.ALLOWED);
    if (!result) return;

    currentUser = result.user;
    currentPersonnel = result.personnel;
    currentRole = result.role;

    if (!WRK_ROLES.ALLOWED.includes(currentRole)) {
        Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'ระบบนี้สงวนสิทธิ์สำหรับบุคลากรทางการศึกษาเท่านั้น',
            confirmButtonText: 'กลับหน้าหลัก'
        }).then(() => window.location.replace('index.html'));
        return;
    }

    moduleAdminChecked = true;
    isModuleAdmin = await hasModuleAccess(currentRole, MODULE_KEY, currentUser.id);
    actualIsAdmin = WRK_ROLES.ADMIN.includes(currentRole) || isModuleAdmin;

    if (typeof applyVisibilityByRole === 'function') {
        applyVisibilityByRole(currentRole, actualIsAdmin, {
            settingsBtn: null,
            toggleBtn: 'btnToggleMode'
        });
    }

    const toggleBtn = document.getElementById('btnToggleMode');
    if (toggleBtn) {
        if (actualIsAdmin) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
            if (typeof updateToggleModeUI === 'function') {
                updateToggleModeUI(currentRole, forceTeacherMode, 'btnToggleMode');
            } else {
                toggleBtn.innerHTML = forceTeacherMode ?
                    '<i class="fa-solid fa-chalkboard-user"></i><span class="hidden sm:inline">โหมดครู</span>' :
                    '<i class="fa-solid fa-user-shield"></i><span class="hidden sm:inline">โหมดแอดมิน</span>';
            }
        } else {
            toggleBtn.classList.add('hidden');
            toggleBtn.classList.remove('flex');
        }
    }

    document.getElementById('userFullName').innerText =
        `${currentPersonnel.prefix || ''}${currentPersonnel.first_name} ${currentPersonnel.last_name}`;
    document.getElementById('userRoleBadge').innerText = currentPersonnel.department || 'ไม่ระบุกลุ่มสาระฯ';

    renderSidebar();

    const { data: schoolInfo } = await db.from('core_school_info')
        .select('current_academic_year, current_semester')
        .eq('id', 1)
        .single();
    currentSchoolInfo = schoolInfo || {
        current_academic_year: (new Date().getFullYear() + 543).toString(),
        current_semester: '1'
    };

    await logUserAction('เข้าสู่ระบบ Portfolio', 'portfolio');

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

    applyRoleUI();

    // ✅ โหลดข้อมูลและแสดงหน้า Dashboard โดยอัตโนมัติ
    await loadInitialData();
}

// ==========================================
// 2. ฟังก์ชันตรวจสอบสิทธิ์
// ==========================================

function isAdminView() {
    if (forceTeacherMode) return false;
    return WRK_ROLES.ADMIN.includes(currentRole) || isModuleAdmin;
}

function canManagePortfolioSettings() {
    if (forceTeacherMode) return false;
    return window.canManageSettings ? window.canManageSettings(currentRole) : currentRole === 'super_admin';
}

async function toggleRoleView() {
    if (!actualIsAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ใช่ผู้ดูแลระบบ', 'warning');
        return;
    }
    forceTeacherMode = !forceTeacherMode;

    const toggleBtn = document.getElementById('btnToggleMode');
    if (toggleBtn) {
        if (typeof updateToggleModeUI === 'function') {
            updateToggleModeUI(currentRole, forceTeacherMode, 'btnToggleMode');
        } else {
            toggleBtn.innerHTML = forceTeacherMode ?
                '<i class="fa-solid fa-chalkboard-user"></i><span class="hidden sm:inline">โหมดครู</span>' :
                '<i class="fa-solid fa-user-shield"></i><span class="hidden sm:inline">โหมดแอดมิน</span>';
        }
    }

    logUserAction(`สลับโหมดเป็น ${forceTeacherMode ? 'Teacher' : 'Admin'}`, 'portfolio');
    applyRoleUI();
    renderSidebar();

    await loadInitialData();

    Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: forceTeacherMode ? 'info' : 'success',
        title: forceTeacherMode ? 'โหมดมุมมองครู' : 'มุมมอง Admin',
        showConfirmButton: false,
        timer: 1500
    });
}

// ==========================================
// 3. UI & Navigation
// ==========================================

function applyRoleUI() {
    if (typeof applyVisibilityByRole === 'function') {
        applyVisibilityByRole(currentRole, isAdminView(), {
            settingsBtn: null,
            toggleBtn: 'btnToggleMode'
        });
    }

    let addBtn = document.getElementById('btn-add-entry');
    if (!addBtn) {
        addBtn = document.querySelector('button[onclick="openEntryFormModal()"]');
        if (addBtn) addBtn.id = 'btn-add-entry';
    }
    if (addBtn) addBtn.style.display = !isAdminView() ? '' : 'none';

    const chartsArea = document.getElementById('adminChartsArea');
    if (chartsArea) chartsArea.classList.remove('hidden');

    // ใช้ SearchBuilder แทน filter dropdowns
}

function logout() {
    Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await db.auth.signOut();
            window.location.replace('index.html');
        }
    });
}

function renderSidebar() {
    const menu = document.getElementById('sidebarMenu');
    let html = `
        <button onclick="switchTab('dashboard')" id="btn-tab-dashboard" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold transition-all">
            <i class="fa-solid fa-chart-pie w-5 text-center text-lg"></i> <span class="sidebar-text">แดชบอร์ดภาพรวม</span>
        </button>
        <button onclick="switchTab('work')" id="btn-tab-work" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-all">
            <i class="fa-solid fa-trophy w-5 text-center text-lg"></i> <span class="sidebar-text">ผลงาน/รางวัล</span>
        </button>
        <button onclick="switchTab('training')" id="btn-tab-training" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-all">
            <i class="fa-solid fa-chalkboard-user w-5 text-center text-lg"></i> <span class="sidebar-text">ประวัติการอบรม</span>
        </button>
        <hr class="border-gray-200 my-2">
        <button onclick="openExportModal()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-emerald-600 hover:bg-emerald-50 font-bold transition-all">
            <i class="fa-solid fa-file-excel w-5 text-center text-lg"></i> <span class="sidebar-text">ส่งออก Excel</span>
        </button>
    `;

    if (canManagePortfolioSettings()) {
        html += `
        <!-- hidden file input สำหรับ Excel import -->
        <input type="file" id="hidden-import-file" accept=".xlsx,.xls" class="hidden" onchange="importFromExcel(event)">
        <div class="space-y-1.5 mt-1">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1"><span class="sidebar-text">นำเข้าข้อมูล (Super Admin)</span></p>
            <button onclick="triggerImportExcel()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-indigo-600 hover:bg-indigo-50 font-bold transition-all border border-indigo-200 bg-indigo-50/40">
                <i class="fa-solid fa-file-import w-5 text-center text-lg"></i>
                <span class="sidebar-text text-sm">นำเข้าจาก Excel</span>
            </button>
            <button onclick="downloadImportTemplate()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 font-medium transition-all">
                <i class="fa-solid fa-download w-5 text-center"></i>
                <span class="sidebar-text text-sm">ดาวน์โหลด Template</span>
            </button>
            <button onclick="importFromGoogleSheets()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-green-600 hover:bg-green-50 font-bold transition-all border border-green-200 bg-green-50/40">
                <i class="fa-brands fa-google-drive w-5 text-center text-lg"></i>
                <span class="sidebar-text text-sm">นำเข้าจาก Google Sheets</span>
            </button>
        </div>`;
    }

    if (canManagePortfolioSettings()) {
        html += `
        <hr class="border-gray-200 my-2">
        <button onclick="openSettingsModal()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-amber-600 hover:bg-amber-50 font-bold transition-all border border-amber-200 bg-amber-50/50">
            <i class="fa-solid fa-gear w-5 text-center text-lg"></i> <span class="sidebar-text">ตั้งค่าระบบ</span>
        </button>`;
    }

    menu.innerHTML = html;
}

/**
 * switchTab — เปลี่ยนหน้า และโหลดข้อมูลตาม tab
 * แก้ไข: เมื่อไป Dashboard ให้โหลดข้อมูลทั้งหมดใหม่ (ไม่กรอง entry_type)
 */
// ==========================================
// แก้ไข switchTab — Dashboard ใช้ loadDashboardData เสมอ
// ==========================================

function switchTab(tab) {
    currentTab = tab;

    // อัปเดตปุ่ม Active
    ['dashboard', 'work', 'training'].forEach(t => {
        const btn = document.getElementById(`btn-tab-${t}`);
        if (btn) {
            btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-all";
        }
    });
    const activeBtn = document.getElementById(`btn-tab-${tab}`);
    if (activeBtn) {
        activeBtn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold transition-all";
    }

    const dashboardSection = document.getElementById('section-dashboard');
    const datatableSection = document.getElementById('section-datatable');
    if (dashboardSection) dashboardSection.classList.add('hidden');
    if (datatableSection) datatableSection.classList.add('hidden');

    if (tab === 'dashboard') {
        // ✅ แสดง Dashboard
        if (dashboardSection) dashboardSection.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = 'ภาพรวมผลงาน (Dashboard)';
        const chartsArea = document.getElementById('adminChartsArea');
        if (chartsArea) chartsArea.classList.remove('hidden');

        // ✅ โหลดข้อมูลทั้งหมด (ไม่กรอง) สำหรับ Dashboard เสมอ
        // ใช้ setTimeout เพื่อไม่ให้ค้าง UI
        setTimeout(async () => {
            try {
                await loadDashboardData();
            } catch (err) {
                console.error('❌ Dashboard load error:', err);
            }
        }, 50);

    } else {
        // Tab: work หรือ training
        currentEntryType = tab;
        if (datatableSection) datatableSection.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = tab === 'work' ? 'จัดการผลงานและรางวัล' : 'จัดการประวัติการอบรม';
        document.getElementById('tableHeaderTitle').innerText = tab === 'work' ? 'รายการผลงาน/รางวัล' : 'รายการหลักสูตรที่อบรม';

        applyRoleUI();
        // โหลดข้อมูลเฉพาะ entry_type ที่เลือก (จะกรองตามสิทธิ์)
        loadTableData();
    }
}

let isSidebarCollapsed = false;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (window.innerWidth < 768) {
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (backdrop) backdrop.classList.toggle('show');
    } else {
        const texts = document.querySelectorAll('.sidebar-text');
        isSidebarCollapsed = !isSidebarCollapsed;
        if (sidebar) {
            if (isSidebarCollapsed) {
                sidebar.classList.remove('w-64');
                sidebar.classList.add('w-20');
                texts.forEach(txt => txt.classList.add('hidden'));
            } else {
                sidebar.classList.remove('w-20');
                sidebar.classList.add('w-64');
                texts.forEach(txt => txt.classList.remove('hidden'));
            }
        }
    }
}

// ==========================================
// 4. Data Fetching & Rendering
// ==========================================

/**
 * fetchPersonnelData — ดึงข้อมูลบุคลากร (ปรับปรุงให้ใช้ cache)
 */
async function fetchPersonnelData(userIds) {
    if (!userIds || userIds.length === 0) {
        console.log('📭 ไม่มี userIds ให้ดึงบุคลากร');
        return new Map();
    }

    const cached = new Map();
    const missingIds = [];

    for (const id of userIds) {
        if (personnelCache.has(id)) {
            cached.set(id, personnelCache.get(id));
        } else {
            missingIds.push(id);
        }
    }

    if (missingIds.length > 0) {
        console.log(`🔍 ดึงข้อมูลบุคลากร ${missingIds.length} รายการ`);
        try {
            const { data, error } = await db.from('core_personnel')
                .select('id, first_name, last_name, department')
                .in('id', missingIds);

            if (error) {
                console.error('❌ Error fetching personnel:', error);
                return cached;
            }

            if (data) {
                data.forEach(p => {
                    personnelCache.set(p.id, p);
                    cached.set(p.id, p);
                });
            }
        } catch (err) {
            console.error('❌ fetchPersonnelData error:', err);
        }
    }

    return cached;
}

// ==========================================
// แก้ไข loadInitialData — โหลด Dashboard ครั้งแรก
// ==========================================

async function loadInitialData() {
    try {
        console.log('🔍 loadInitialData เริ่มต้น');

        // ✅ โหลดข้อมูลทั้งหมด (ไม่กรอง) สำหรับ Dashboard ครั้งแรก
        await loadDashboardData();

        // ✅ แสดงหน้า Dashboard
        // ใช้ setTimeout ให้ UI พร้อมก่อน
        setTimeout(() => {
            switchTab('dashboard');
        }, 50);

        Swal.close();
    } catch (err) {
        console.error('❌ loadInitialData error:', err);
        Swal.close();
        if (err.message) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

/**
 * loadAllData — โหลดข้อมูลทั้งหมดตามสิทธิ์ (ไม่กรอง entry_type)
 * ใช้สำหรับ Dashboard และเมื่อต้องการข้อมูลรวมทั้งหมด
 */
async function loadAllData() {
    try {
        console.log('🔍 loadAllData กำลังโหลดข้อมูลทั้งหมด (ไม่กรองประเภท)');

        let query = db.from('portfolio_entries')
            .select('*');

        // loadAllData ใช้โดย super_admin (toggleEntryType) — ดึงทั้งหมดเสมอ

        const { data: entries, error } = await query;
        if (error) {
            console.error('❌ loadAllData query error:', error);
            throw error;
        }

        console.log(`📊 loadAllData ได้ข้อมูล ${entries?.length || 0} รายการ (raw)`);

        // ถ้าไม่มีข้อมูล ให้คงค่าเดิม (ป้องกันการหาย)
        if (!entries || entries.length === 0) {
            console.warn('⚠️ loadAllData: ไม่มีข้อมูลในฐานข้อมูล');
            // ยังคงใช้ currentTableData เดิม (ถ้ามี)
            return;
        }

        // ดึงข้อมูลบุคลากร
        const userIds = [...new Set(entries.map(e => e.user_id).filter(Boolean))];
        const personnelMap = await fetchPersonnelData(userIds);

        // รวมข้อมูลบุคลากร
        const enrichedData = entries.map(e => ({
            ...e,
            core_personnel: personnelMap.get(e.user_id) || null
        }));

        console.log(`✅ loadAllData: ได้ข้อมูล ${enrichedData.length} รายการ (enriched)`);

        // ✅ ตั้งค่า currentTableData และ allEntries เป็นข้อมูลทั้งหมด
        currentTableData = enrichedData;
        allEntries = enrichedData;

        // ถ้าอยู่ในหน้า datatable (work/training) และมีการเรียก loadAllData
        // เราไม่ควร render DataTable เพราะจะแสดงข้อมูลทั้งหมด (ไม่กรอง)
        // แต่ถ้าอยู่ใน dashboard ให้ render อย่างเดียว
        // เราไม่ render DataTable ที่นี่ เพราะ switchTab จะจัดการ
        // updateDashboardStats และ renderAdminCharts จะถูกเรียกจาก switchTab

    } catch (err) {
        console.error('❌ loadAllData error:', err);
        // ไม่ throw เพื่อไม่ให้หน้า crash
    }
}

/**
 * loadTableData — โหลดข้อมูลสำหรับตารางตาม entry_type
 */
/**
 * loadTableData — โหลดข้อมูลตาราง
 * สิทธิ์ DataTable:
 *   admin roles → เห็นและจัดการได้ทั้งหมด
 *   teacher/staff → เห็นเฉพาะของตนเอง
 */
async function loadTableData() {
    if (!currentUser) return;

    try {
        let query = db.from('portfolio_entries')
            .select('*')
            .eq('entry_type', currentEntryType)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: true });

        // teacher / staff (โหมดครู) เห็นเฉพาะของตนเอง
        // admin roles และ forceTeacherMode=false เห็นทั้งหมด
        const isTeacherMode = !isAdminView() || forceTeacherMode;
        if (isTeacherMode) {
            query = query.eq('user_id', currentUser.id);
        }

        const { data: entries, error } = await query;
        if (error) throw error;

        const userIds = [...new Set((entries || []).map(e => e.user_id))];
        const personnelMap = await fetchPersonnelData(userIds);
        const enrichedData = (entries || []).map(e => ({
            ...e,
            core_personnel: personnelMap.get(e.user_id) || null
        }));

        currentTableData = enrichedData;
        allEntries       = enrichedData;

        renderDataTable(enrichedData);

    } catch (err) {
        console.error('❌ loadTableData error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * renderDataTable — สร้าง DataTable พร้อม SearchBuilder
 */
function renderDataTable(data) {
    const isWork = currentEntryType === 'work';
    const colCount = isWork ? 8 : 9;

    // ทำลาย instance เดิม
    if (dtInstance) {
        try { dtInstance.destroy(); } catch (_) { }
        dtInstance = null;
        dtInstanceType = null;
    }

    const thead = document.querySelector('#dataTable thead tr');
    if (thead) {
        thead.innerHTML = isWork
            ? `<th>ปีการศึกษา</th>
               <th>ภาคเรียน</th>
               <th>ชื่อครู / กลุ่มสาระ</th>
               <th>ชื่อผลงาน / รางวัล</th>
               <th>หน่วยงานที่มอบ</th>
               <th class="text-center">วันที่</th>
               <th class="text-center">ไฟล์</th>
               <th class="text-center">จัดการ</th>`
            : `<th>ปีการศึกษา</th>
               <th>ภาคเรียน</th>
               <th>ชื่อครู / กลุ่มสาระ</th>
               <th>ชื่อหลักสูตรที่อบรม</th>
               <th>จัดโดย</th>
               <th class="text-center">วันที่</th>
               <th class="text-center">ชม.</th>
               <th class="text-center">ไฟล์</th>
               <th class="text-center">จัดการ</th>`;
    }

    const tbody = document.getElementById('tb-data');
    if (tbody) {
        tbody.innerHTML = data.length === 0
            ? `<tr><td colspan="${colCount}" class="text-center py-12 text-gray-400">
                   <i class="fa-solid fa-inbox text-4xl mb-3 block opacity-30"></i>
                   ไม่มีข้อมูล${isAdminView() ? '' : ' (ยังไม่ได้บันทึกรายการ)'}
               </td></tr>`
            : data.map(e => buildRowHtml(e, isWork)).join('');
    }

    // ถ้าไม่มีข้อมูล ไม่ต้อง init DataTable
    if (data.length === 0) return;

    // กำหนดประเภทคอลัมน์สำหรับ SearchBuilder
    const columnDefs = [
        { responsivePriority: 1, targets: -1 },
        { responsivePriority: 2, targets: -2 },
        { targets: colCount - 1, orderable: false, searchable: false }, // จัดการ
        { targets: colCount - 2, orderable: false, searchable: false }, // ไฟล์
    ];

    // DataTable 2.x ใช้ layout แทน dom
    dtInstance = $('#dataTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        pageLength: 25,
        lengthMenu: [10, 25, 50, 100],
        responsive: true,
        ordering: true,
        order: [[0, 'desc'], [1, 'asc']],
        columnDefs: columnDefs,
        // layout: {
        //     top1: {
        //         searchBuilder: {
        //             columns: [0, 1, 2],
        //             greyscale: false
        //         }
        //     },
        //     topStart: 'pageLength',
        //     topEnd: 'search',
        //     bottomStart: 'info',
        //     bottomEnd: 'paging'
        // },
        // ใช้ dom สำหรับ fallback (ถ้า layout ไม่ทำงานในบางเวอร์ชัน)
        // dom: 'Qlfrtip'
        layout: {
            topStart: 'searchBuilder'
        },
    });

    dtInstanceType = currentEntryType;
}

// function buildRowHtml(e, isWork) {
//     const name = `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ';
//     const dept = e.core_personnel?.department || '-';
//     const dateStr = e.entry_date ? dayjs(e.entry_date).locale('th').format('DD MMM YYYY') : '-';
//     const docLink = e.document_url
//         ? `<a href="${e.document_url}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold text-xs"><i class="fa-solid fa-file-pdf text-red-500"></i> เปิดดู</a>`
//         : '<span class="text-gray-300 text-xs">-</span>';

//     const canManage = e.user_id === currentUser.id || isAdminView();
//     const manageBtns = canManage ? `
//         <div class="flex items-center justify-center gap-1">
//             <button type="button" onclick="openEditEntryModal('${e.id}')" class="text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 whitespace-nowrap"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
//             <button type="button" onclick="deleteEntry('${e.id}')" class="text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 whitespace-nowrap"><i class="fa-solid fa-trash-can"></i> ลบ</button>
//         </div>` : '';

//     const titleText = e.title || '-';
//     const titleCell = `<td class="px-3 py-2.5 text-sm text-gray-800 max-w-xs truncate" title="${titleText}">${titleText}</td>`;

//     const extraCol = isWork ? '' : `<td class="px-3 py-2.5 text-center font-bold text-indigo-600">${e.hours || 0}</td>`;

//     return `<tr class="hover:bg-slate-50 transition-colors border-b border-gray-100">
//         <td class="px-3 py-2.5 font-bold text-gray-700">${e.academic_year || '-'}</td>
//         <td class="px-3 py-2.5 text-center text-gray-600">${e.semester || '-'}</td>
//         <td class="px-3 py-2.5"><div class="font-bold text-blue-700 text-sm">${name}</div><div class="text-[11px] text-gray-400">${dept}</div></td>
//         ${titleCell}
//         <td class="px-3 py-2.5 text-sm text-gray-500">${e.organizer || '-'}</td>
//         <td class="px-3 py-2.5 text-center text-sm text-gray-600 whitespace-nowrap">${dateStr}</td>
//         ${extraCol}
//         <td class="px-3 py-2.5 text-center">${docLink}</td>
//         <td class="px-3 py-2.5 text-center">${manageBtns}</td>
//     </tr>`;
// }

// ==========================================
// 5. Charts
// ==========================================

// ==========================================
// แก้ไข buildRowHtml — เพิ่มปุ่มสลับประเภท (เฉพาะ super_admin)
// ==========================================

function buildRowHtml(e, isWork) {
    const name = `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ';
    const dept = e.core_personnel?.department || '-';
    const dateStr = e.entry_date ? dayjs(e.entry_date).locale('th').format('DD MMM YYYY') : '-';
    const docLink = e.document_url
        ? `<a href="${e.document_url}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold text-xs"><i class="fa-solid fa-file-pdf text-red-500"></i> เปิดดู</a>`
        : '<span class="text-gray-300 text-xs">-</span>';

    const canManage = e.user_id === currentUser.id || isAdminView();
    
    // ✅ ปุ่มจัดการพื้นฐาน
    let manageBtns = '';
    if (canManage) {
        manageBtns = `
            <div class="flex items-center justify-center gap-1 flex-wrap">
                <button type="button" onclick="openEditEntryModal('${e.id}')" class="text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 whitespace-nowrap"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                <button type="button" onclick="deleteEntry('${e.id}')" class="text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 whitespace-nowrap"><i class="fa-solid fa-trash-can"></i> ลบ</button>
    `;
        // ✅ ปุ่มสลับประเภท (เฉพาะ super_admin)
        if (currentRole === 'super_admin') {
            manageBtns += `
                <button type="button" onclick="toggleEntryType('${e.id}')" class="text-xs font-bold px-2 py-1 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200 whitespace-nowrap"><i class="fa-solid fa-arrows-rotate"></i> สลับประเภท</button>
            `;
        }
        manageBtns += `</div>`;
    }

    const titleText = e.title || '-';
    const titleCell = `<td class="px-3 py-2.5 text-sm text-gray-800 max-w-xs truncate" title="${titleText}">${titleText}</td>`;

    const extraCol = isWork ? '' : `<td class="px-3 py-2.5 text-center font-bold text-indigo-600">${e.hours || 0}</td>`;

    return `<tr class="hover:bg-slate-50 transition-colors border-b border-gray-100">
        <td class="px-3 py-2.5 font-bold text-gray-700">${e.academic_year || '-'}</td>
        <td class="px-3 py-2.5 text-center text-gray-600">${e.semester || '-'}</td>
        <td class="px-3 py-2.5"><div class="font-bold text-blue-700 text-sm">${name}</div><div class="text-[11px] text-gray-400">${dept}</div></td>
        ${titleCell}
        <td class="px-3 py-2.5 text-sm text-gray-500">${e.organizer || '-'}</td>
        <td class="px-3 py-2.5 text-center text-sm text-gray-600 whitespace-nowrap">${dateStr}</td>
        ${extraCol}
        <td class="px-3 py-2.5 text-center">${docLink}</td>
        <td class="px-3 py-2.5 text-center">${manageBtns}</td>
    </tr>`;
}

// ==========================================
// ฟังก์ชันสลับประเภท (เฉพาะ super_admin)
// ==========================================

async function toggleEntryType(id) {
    // ตรวจสอบสิทธิ์ super_admin
    if (currentRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่สลับประเภทได้', 'error');
        return;
    }

    const entry = allEntries.find(e => e.id === id || e.id === Number(id));
    if (!entry) {
        Swal.fire('ไม่พบข้อมูล', 'ไม่พบรายการที่ต้องการสลับ', 'error');
        return;
    }

    const currentType = entry.entry_type;
    const newType = currentType === 'work' ? 'training' : 'work';
    const currentTypeName = currentType === 'work' ? 'ผลงาน/รางวัล' : 'การอบรม';
    const newTypeName = newType === 'work' ? 'ผลงาน/รางวัล' : 'การอบรม';

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการสลับประเภท?',
        html: `<div class="text-left">
            <p><b>รายการ:</b> ${entry.title || '-'}</p>
            <p><b>จาก:</b> ${currentTypeName}</p>
            <p><b>เป็น:</b> ${newTypeName}</p>
            <p class="text-xs text-gray-500 mt-2">⚠️ การดำเนินการนี้จะย้ายรายการไปยังอีกตารางหนึ่ง</p>
        </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#7c3aed',
        confirmButtonText: 'ใช่, สลับประเภท',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    try {
        // อัปเดต entry_type
        const { error } = await db.from('portfolio_entries')
            .update({ entry_type: newType })
            .eq('id', id);

        if (error) throw error;

        // บันทึก Log
        await logUserAction(
            `สลับประเภทข้อมูล portfolio ID=${id} จาก ${currentType} เป็น ${newType}`,
            'portfolio'
        );

        // โหลดข้อมูลใหม่ทั้งหมด
        await loadAllData();

        // ถ้าอยู่ในหน้า datatable → re-render DataTable ตามประเภทปัจจุบัน
        if (currentTab !== 'dashboard') {
            renderDataTable(currentTableData);
        }

        Swal.fire({
            icon: 'success',
            title: `สลับประเภทเป็น "${newTypeName}" สำเร็จ`,
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('❌ toggleEntryType error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * renderAdminCharts — แสดงกราฟ (ใช้ globalEntries)
 */
function renderAdminCharts() {
    // ✅ ใช้ globalEntries (ข้อมูลทั้งหมด)
    const works = globalEntries.filter(e => e.entry_type === 'work');
    const trainings = globalEntries.filter(e => e.entry_type === 'training');

    const countBy = (arr, keyFn) => {
        return arr.reduce((acc, curr) => {
            const key = keyFn(curr);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    };

    // ── 1. สัดส่วนประเภทผลงาน กับ การอบรม ──
    const ctxRatio = document.getElementById('chartRatio');
    if (ctxRatio) {
        const ctx = ctxRatio.getContext('2d');
        if (charts.ratio) charts.ratio.destroy();
        charts.ratio = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['ผลงาน/รางวัล', 'การอบรม'],
                datasets: [{
                    data: [works.length || 0, trainings.length || 0],
                    backgroundColor: ['#3b82f6', '#10b981']
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                return `${label}: ${value} รายการ (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ── 2. กลุ่มสาระฯ ที่มีผลงาน/รางวัลสูงสุด ──
    const deptWorksCount = countBy(works, e => e.core_personnel?.department || 'ไม่ระบุ');
    const sortedDeptWorks = Object.entries(deptWorksCount).sort((a, b) => b[1] - a[1]).slice(0, 7);

    const ctxDeptWorks = document.getElementById('chartDeptWorks');
    if (ctxDeptWorks) {
        const ctx = ctxDeptWorks.getContext('2d');
        if (charts.deptWorks) charts.deptWorks.destroy();
        charts.deptWorks = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedDeptWorks.map(i => i[0]),
                datasets: [{
                    label: 'จำนวนผลงาน/รางวัล',
                    data: sortedDeptWorks.map(i => i[1]),
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // ── 3. ครูที่มีผลงาน/รางวัลสูงสุด ──
    const teacherWorksCount = countBy(
        works,
        e => `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ'
    );
    const sortedTeacherWorks = Object.entries(teacherWorksCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const ctxTeacherWorks = document.getElementById('chartTeacherWorks');
    if (ctxTeacherWorks) {
        const ctx = ctxTeacherWorks.getContext('2d');
        if (charts.teacherWorks) charts.teacherWorks.destroy();
        charts.teacherWorks = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedTeacherWorks.map(i => i[0]),
                datasets: [{
                    label: 'จำนวนผลงาน/รางวัล',
                    data: sortedTeacherWorks.map(i => i[1]),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 6
                }]
            },
            options: {
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // ── 4. กลุ่มสาระฯ ที่มีการอบรมสูงสุด ──
    const deptTrainCount = countBy(trainings, e => e.core_personnel?.department || 'ไม่ระบุ');
    const sortedDeptTrain = Object.entries(deptTrainCount).sort((a, b) => b[1] - a[1]).slice(0, 7);

    const ctxDeptTrain = document.getElementById('chartDeptTrainings');
    if (ctxDeptTrain) {
        const ctx = ctxDeptTrain.getContext('2d');
        if (charts.deptTrain) charts.deptTrain.destroy();
        charts.deptTrain = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedDeptTrain.map(i => i[0]),
                datasets: [{
                    label: 'จำนวนครั้งที่อบรม',
                    data: sortedDeptTrain.map(i => i[1]),
                    backgroundColor: '#10b981',
                    borderRadius: 6
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // ── 5. ลบกราฟ ครูที่มีชั่วโมงอบรมสูงสุด ──
    const teacherTrainContainer = document.getElementById('chartTeacherTrainings')?.closest('.lg\\:col-span-2');
    if (teacherTrainContainer) {
        teacherTrainContainer.style.display = 'none';
    }
}

// ==========================================
// 6. Dashboard Stats
// ==========================================
// ==========================================
// portfolio.js — แก้ไขฟังก์ชัน switchTab, loadInitialData และ loadDashboardData เพื่อให้ Dashboard ครูเห็นสถิติรวม

/**
 * loadDashboardData — โหลดข้อมูลทั้งหมด (ไม่กรอง user_id / entry_type)
 * ทุก role เห็นสถิติรวมทั้งโรงเรียน
 * - super_admin / admin / director / deputy → เห็นทั้งหมด (isAdminView = true)
 * - teacher / staff → เห็นสถิติรวมเหมือนกัน (Dashboard ดูภาพรวม ไม่ใช่ DataTable)
 */
async function loadDashboardData() {
    try {
        // ดึงข้อมูลทั้งหมด ไม่มีเงื่อนไข user_id ทุก role เห็นเหมือนกัน
        const { data: entries, error } = await db
            .from('portfolio_entries')
            .select('*')
            .order('academic_year', { ascending: false });

        if (error) throw error;

        // ดึงข้อมูลบุคลากรแยก (ไม่มี FK join)
        const userIds = [...new Set((entries || []).map(e => e.user_id).filter(Boolean))];
        const personnelMap = await fetchPersonnelData(userIds);

        globalEntries = (entries || []).map(e => ({
            ...e,
            core_personnel: personnelMap.get(e.user_id) || null
        }));

        updateDashboardStats();
        renderAdminCharts();

    } catch (err) {
        console.error('❌ loadDashboardData error:', err);
    }
}

/**
 * updateDashboardStats — อัปเดตการ์ดสถิติ (ใช้ globalEntries)
 */
/**
 * updateDashboardStats — อัปเดตการ์ดสถิติ
 * ใช้ globalEntries (ข้อมูลทั้งหมด ทุก role เห็นเหมือนกัน)
 */
function updateDashboardStats() {
    try {
        const works     = globalEntries.filter(e => e.entry_type === 'work');
        const trainings = globalEntries.filter(e => e.entry_type === 'training');
        const totalHours = trainings.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
        const uniqueTeachers = new Set(globalEntries.map(e => e.user_id));

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setEl('count-works',    works.length);
        setEl('count-trainings', trainings.length);
        setEl('count-hours',    totalHours);
        setEl('count-teachers', uniqueTeachers.size);

        // stat cards สำรอง (กรณี HTML ใช้ชื่อ id ต่างกัน)
        setEl('stat-works',    works.length);
        setEl('stat-trainings', trainings.length);
        setEl('stat-total',    globalEntries.length);
        setEl('stat-hours',    totalHours);

    } catch (err) {
        console.warn('⚠️ updateDashboardStats error:', err);
    }
}

// ==========================================
// 7. Form Management (Add/Edit)
// ==========================================

function openEntryFormModal() {
    const form = document.getElementById('entryForm');
    if (form) form.reset();

    document.getElementById('entry_id').value = '';
    document.getElementById('entry_type_hidden').value = currentEntryType;

    document.getElementById('f_year').value = currentSchoolInfo.current_academic_year;
    document.getElementById('f_term').value = currentSchoolInfo.current_semester;

    const labelTitle = document.getElementById('label_title');
    if (labelTitle) {
        labelTitle.innerText = currentEntryType === 'work' ? 'ชื่อผลงาน / รางวัล *' : 'ชื่อหลักสูตรที่อบรม *';
    }

    if (typeof flatpickr !== 'undefined') {
        flatpickr(".flatpickr", { locale: "th", dateFormat: "Y-m-d" });
    }

    // ✅ เคลียร์ preview
    clearFilePreview();

    document.getElementById('entryModal').classList.remove('hidden');
}

function openEditEntryModal(entryId) {
    const entry = allEntries.find(e => e.id === entryId || e.id === Number(entryId));
    if (!entry) {
        Swal.fire('ไม่พบข้อมูล', 'ไม่สามารถโหลดข้อมูลที่ต้องการแก้ไขได้', 'error');
        return;
    }

    document.getElementById('entry_id').value = entry.id;
    document.getElementById('entry_type_hidden').value = entry.entry_type;
    document.getElementById('f_year').value = entry.academic_year || '';
    document.getElementById('f_term').value = entry.semester || '';
    document.getElementById('f_title').value = entry.title || '';
    document.getElementById('f_organizer').value = entry.organizer || '';
    document.getElementById('f_date').value = entry.entry_date || '';
    document.getElementById('f_hours').value = entry.hours || 0;

    const labelTitle = document.getElementById('label_title');
    if (labelTitle) {
        labelTitle.innerText = entry.entry_type === 'work' ? 'ชื่อผลงาน / รางวัล *' : 'ชื่อหลักสูตรที่อบรม *';
    }
    const modalTitle = document.getElementById('entryModalTitle');
    if (modalTitle) modalTitle.innerText = entry.entry_type === 'work' ? 'แก้ไขผลงาน/รางวัล' : 'แก้ไขประวัติการอบรม';

    // ✅ แสดงลิงก์ไฟล์ปัจจุบัน
    const currentLinkContainer = document.getElementById('current-file-link-container');
    const currentLinkInput = document.getElementById('current-file-link');
    if (currentLinkContainer && currentLinkInput) {
        if (entry.document_url) {
            currentLinkInput.value = entry.document_url;
            currentLinkContainer.style.display = 'block';
        } else {
            currentLinkContainer.style.display = 'none';
            currentLinkInput.value = '';
        }
    }

    // ✅ เคลียร์ preview
    clearFilePreview();

    document.getElementById('f_file').value = '';
    if (typeof flatpickr !== 'undefined') {
        flatpickr('#f_date', { locale: 'th', dateFormat: 'Y-m-d' });
    }

    document.getElementById('entryModal').classList.remove('hidden');
}

function closeEntryModal() {
    document.getElementById('entryModal').classList.add('hidden');
    clearFilePreview(); // ✅ เคลียร์ preview เมื่อปิด modal
}

function copyCurrentFileLink() {
    const linkInput = document.getElementById('current-file-link');
    if (linkInput && linkInput.value) {
        navigator.clipboard.writeText(linkInput.value).then(() => {
            Swal.fire({ toast: true, icon: 'success', title: 'คัดลอกลิงก์แล้ว', timer: 1500, showConfirmButton: false });
        }).catch(() => {
            linkInput.select();
            document.execCommand('copy');
            Swal.fire({ toast: true, icon: 'success', title: 'คัดลอกลิงก์แล้ว', timer: 1500, showConfirmButton: false });
        });
    }
}

// ==========================================
// ฟังก์ชันจัดการ Preview รูปภาพ
// ==========================================

/**
 * แสดง preview ของไฟล์ที่เลือก (รูปภาพ หรือ PDF)
 */
function previewFile(input) {
    const container = document.getElementById('file-preview-container');
    const img = document.getElementById('file-preview');
    const nameDisplay = document.getElementById('file-name-display');

    if (!container || !img || !nameDisplay) return;

    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        const fileType = file.type;
        const fileSize = (file.size / 1024 / 1024).toFixed(2);

        nameDisplay.textContent = `${file.name} (${fileSize} MB)`;
        container.classList.remove('hidden');

        if (fileType.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                img.src = e.target.result;
                img.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            // PDF หรือไฟล์อื่น — ไม่แสดงรูป
            img.classList.add('hidden');
            img.src = '';
        }
    } else {
        container.classList.add('hidden');
        img.classList.add('hidden');
        img.src = '';
        nameDisplay.textContent = '';
    }
}

/**
 * ลบไฟล์ที่เลือก (เคลียร์ input file และซ่อน preview)
 */
function removeFile() {
    const input = document.getElementById('f_file');
    if (input) {
        input.value = '';
        previewFile(input);
    }
}

/**
 * เคลียร์ preview (ใช้เมื่อเปิด/ปิด modal)
 */
function clearFilePreview() {
    const container = document.getElementById('file-preview-container');
    const img = document.getElementById('file-preview');
    const nameDisplay = document.getElementById('file-name-display');

    if (container) container.classList.add('hidden');
    if (img) { img.classList.add('hidden'); img.src = ''; }
    if (nameDisplay) nameDisplay.textContent = '';
    const input = document.getElementById('f_file');
    if (input) input.value = '';
}

// ==========================================
// ฟังก์ชันบันทึกข้อมูล (เพิ่ม/แก้ไข) — ฉบับเต็ม
// ==========================================

async function saveEntry(e) {
    e.preventDefault();

    Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const title = document.getElementById('f_title').value.trim();
        const organizer = document.getElementById('f_organizer').value.trim();
        const date = document.getElementById('f_date').value;
        const hours = document.getElementById('f_hours').value || 0;
        const fileInput = document.getElementById('f_file');
        const entryId = document.getElementById('entry_id').value;

        let docUrl = null;
        let updateDocUrl = false;

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `portfolio_${currentUser.id}_${Date.now()}_${file.name}`;
            try {
                docUrl = await uploadFileToDrive(file, fileName);
                updateDocUrl = true;
            } catch (uploadErr) {
                Swal.fire('อัปโหลดไฟล์ล้มเหลว', uploadErr.message, 'error');
                return;
            }
        }

        const payload = {
            user_id: currentUser.id,
            academic_year: document.getElementById('f_year').value,
            semester: document.getElementById('f_term').value,
            entry_type: document.getElementById('entry_type_hidden').value,
            title: title,
            organizer: organizer,
            entry_date: date,
            hours: hours,
        };

        if (updateDocUrl || !entryId) {
            payload.document_url = docUrl;
        }

        let dbError;
        if (entryId) {
            const { error } = await db.from('portfolio_entries')
                .update(payload)
                .eq('id', entryId);
            dbError = error;
        } else {
            if (!payload.document_url) payload.document_url = null;
            const { error } = await db.from('portfolio_entries').insert([payload]);
            dbError = error;
        }

        if (dbError) throw dbError;

        await logUserAction(
            `${entryId ? 'แก้ไข' : 'เพิ่ม'}ข้อมูล portfolio (${payload.entry_type})`,
            'portfolio'
        );

        closeEntryModal();

        // โหลดข้อมูลใหม่ทั้งหมด
        await loadAllData();

        // ถ้าอยู่ในหน้า datatable → re-render DataTable
        if (currentTab !== 'dashboard') {
            renderDataTable(currentTableData);
        }

        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ!',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('❌ saveEntry error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันลบข้อมูล — ฉบับเต็ม
// ==========================================

async function deleteEntry(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ข้อมูลจะไม่สามารถกู้คืนได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบข้อมูล',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({
        title: 'กำลังลบ...',
        didOpen: () => Swal.showLoading()
    });

    try {
        const { error } = await db.from('portfolio_entries')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await logUserAction(`ลบข้อมูล portfolio ID=${id}`, 'portfolio');

        // โหลดข้อมูลใหม่ทั้งหมด
        await loadAllData();

        if (currentTab !== 'dashboard') {
            renderDataTable(currentTableData);
        }

        Swal.fire({
            icon: 'success',
            title: 'ลบสำเร็จ',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('❌ deleteEntry error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 8. File Upload (GAS Integration)
// ==========================================

async function getPortfolioSettings() {
    try {
        const { data, error } = await db
            .from('portfolio_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.warn('portfolio_settings error:', error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('getPortfolioSettings error:', e);
        return null;
    }
}

function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = width * ratio;
                    height = height * ratio;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), file.type, 0.85);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadFileToDrive(file, fileName) {
    const settings = await getPortfolioSettings();
    const folderId = settings?.drive_folder_id;
    const gasUrl = settings?.gas_api_url;

    if (!folderId || !gasUrl) {
        throw new Error('ยังไม่ตั้งค่าระบบอัปโหลด กรุณาติดต่อผู้ดูแลระบบ');
    }

    const progressEl = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    if (progressEl) progressEl.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';

    try {
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
            fileToUpload = await resizeImage(file, 800);
        }

        const reader = new FileReader();
        const base64Data = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result.split(',')[1]);
            reader.readAsDataURL(fileToUpload);
        });

        if (progressBar) progressBar.style.width = '50%';

        const response = await fetch(gasUrl, {
            method: "POST",
            body: JSON.stringify({
                action: 'upload',
                base64: base64Data,
                fileName: fileName,
                folderId: folderId
            })
        });

        const result = await response.json();
        if (progressBar) progressBar.style.width = '100%';

        if (result.status === "success") {
            return result.url;
        } else {
            throw new Error(result.message || 'อัปโหลดไม่สำเร็จ');
        }
    } catch (err) {
        throw err;
    } finally {
        setTimeout(() => {
            if (progressEl) progressEl.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
        }, 1000);
    }
}

// ==========================================
// 9. Export Excel (SheetJS)
// ==========================================

function openExportModal() {
    const expDeptGroup = document.getElementById('exp_dept_group');
    if (isAdminView() && expDeptGroup) {
        expDeptGroup.classList.remove('hidden');
        const selectDept = document.getElementById('exp_dept');
        if (selectDept) {
            selectDept.innerHTML = '<option value="all">ทั้งหมดทุกกลุ่มสาระ</option>';
            const depts = ['ภาษาไทย', 'คณิตศาสตร์',
                'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)', 'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
                'สังคมศึกษา ศาสนาและวัฒนธรรม', 'สุขศึกษาและพลศึกษา',
                'ศิลปะ', 'การงานอาชีพ',
                'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)',
                'แนะแนว'
            ];
            depts.forEach(d => {
                selectDept.innerHTML += `<option value="${d}">${d}</option>`;
            });
        }
    } else if (expDeptGroup) {
        expDeptGroup.classList.add('hidden');
    }
    document.getElementById('exportModal').classList.remove('hidden');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.add('hidden');
}

async function processExport() {
    const type = document.getElementById('exp_type').value;
    const year = document.getElementById('exp_year').value.trim();
    const term = document.getElementById('exp_term').value;
    const dept = isAdminView() ? document.getElementById('exp_dept').value : null;

    let query = db.from('portfolio_entries').select('*');

    if (!isAdminView() || forceTeacherMode) {
        query = query.eq('user_id', currentUser.id);
    }

    if (type !== 'all') {
        query = query.eq('entry_type', type);
    }
    if (year) {
        query = query.eq('academic_year', year);
    }
    if (term !== 'all') {
        query = query.eq('semester', term);
    }

    const { data: entries, error } = await query;
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
        return;
    }

    if (!entries || entries.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลตามเงื่อนไขที่เลือก', 'info');
        return;
    }

    const userIds = [...new Set(entries.map(e => e.user_id))];
    const personnelMap = await fetchPersonnelData(userIds);

    let exportData = entries.map(e => ({
        ...e,
        core_personnel: personnelMap.get(e.user_id) || null
    }));

    if (isAdminView() && dept && dept !== 'all') {
        exportData = exportData.filter(e => e.core_personnel?.department === dept);
    }

    if (exportData.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลตามเงื่อนไขที่เลือก', 'info');
        return;
    }

    const ws_data = [
        ['ปีการศึกษา', 'ภาคเรียน', 'ประเภท', 'ชื่อ-สกุล', 'กลุ่มสาระฯ', 'รายละเอียด (ผลงาน/หลักสูตร)', 'หน่วยงานที่จัด', 'วันที่', 'ชั่วโมง']
    ];

    exportData.forEach(e => {
        ws_data.push([
            e.academic_year,
            e.semester,
            e.entry_type === 'work' ? 'ผลงาน/รางวัล' : 'การอบรม',
            `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim(),
            e.core_personnel?.department || '-',
            e.title,
            e.organizer || '-',
            dayjs(e.entry_date).locale('th').format('DD MMM YYYY'),
            e.hours
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio_Report");
    XLSX.writeFile(wb, `รายงานผลงานบุคลากร_${dayjs().format('YYYYMMDD')}.xlsx`);

    closeExportModal();
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', timer: 1500, showConfirmButton: false });
}

// ==========================================
// 10. Import Functions (Excel & Google Sheets)
// ==========================================

async function processImportRows(rows, foundHeaders) {
    const pad2 = n => String(n).padStart(2, '0');

    function parseDate(val) {
        if (!val || val === '' || val === '-' || val === 0) return null;
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return null;
            let y = val.getFullYear();
            const m = pad2(val.getMonth() + 1);
            const d = pad2(val.getDate());
            if (y >= 2400) y = y - 543;
            return `${y}-${m}-${d}`;
        }
        const s = String(val).trim();
        if (!s || s === '-' || s === '0') return null;

        const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoM) {
            let y = parseInt(isoM[1]);
            if (y < 2400) y = y + 543;
            const ceY = y - 543;
            return `${ceY}-${isoM[2]}-${isoM[3]}`;
        }
        const dmyM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmyM) {
            let y = parseInt(dmyM[3]);
            if (y >= 2400) y = y - 543;
            return `${y}-${pad2(parseInt(dmyM[2]))}-${pad2(parseInt(dmyM[1]))}`;
        }
        const num = Number(s);
        if (!isNaN(num) && num > 20000 && num < 300000) {
            try {
                const dd = XLSX.SSF.parse_date_code(num);
                if (dd && dd.y > 1900) {
                    let y = dd.y;
                    if (y < 2400) y = y + 543;
                    return `${y - 543}-${pad2(dd.m)}-${pad2(dd.d)}`;
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    function splitFullName(full) {
        if (!full) return { prefix: '', first_name: '', last_name: '' };
        const pfx = ['นางสาว', 'นาย', 'นาง', 'ด.ช.', 'ด.ญ.', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยเอก'];
        let prefix = '',
            name = String(full).trim();
        for (const p of pfx) {
            if (name.startsWith(p)) {
                prefix = p;
                name = name.slice(p.length).trim();
                break;
            }
        }
        if (!prefix) {
            const parts = name.split(/\s+/);
            if (parts.length >= 2) {
                return { prefix: '', first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
            }
            return { prefix: '', first_name: name, last_name: '' };
        }
        const parts = name.split(/\s+/);
        return { prefix, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
    }

    function getValue(row, ...keys) {
        for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return row[k];
            }
            for (const [col, val] of Object.entries(row)) {
                if (col.trim() === k.trim()) {
                    return val;
                }
            }
        }
        return null;
    }

    const headerMap = {
        'ชื่อ - สกุล': 'full_name',
        'กลุ่มสาระ': 'department',
        'ภาคเรียนที่': 'semester',
        'ปีการศึกษา': 'academic_year',
        'ประเภท': 'entry_type_raw',
        'รายการ': 'title',
        'เมื่อวันที่': 'start_date',
        'ถึงวันที่': 'end_date',
        'จัดโดย': 'organizer',
        'ไฟล์': 'file_url'
    };

    const headerMapping = {};
    foundHeaders.forEach(h => {
        const trimmed = h.trim();
        if (headerMap[trimmed]) {
            headerMapping[h] = headerMap[trimmed];
        } else {
            for (const [key, value] of Object.entries(headerMap)) {
                if (trimmed.includes(key) || key.includes(trimmed)) {
                    headerMapping[h] = value;
                    break;
                }
            }
        }
    });

    const payloads = rows.map(row => {
        const fullName = getValue(row, 'ชื่อ - สกุล', 'ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'full_name');
        const nameParts = splitFullName(fullName);

        let entryType = 'work';
        const typeRaw = getValue(row, 'ประเภท', 'entry_type_raw');
        if (typeRaw) {
            const typeStr = String(typeRaw).trim();
            if (typeStr.includes('อบรม') || typeStr.includes('สัมมนา') || typeStr.includes('ประชุม')) {
                entryType = 'training';
            } else if (typeStr.includes('รางวัล') || typeStr.includes('เกียรติบัตร') || typeStr.includes('ชนะเลิศ')) {
                entryType = 'work';
            }
        }

        const startDate = getValue(row, 'เมื่อวันที่', 'start_date');
        const endDate = getValue(row, 'ถึงวันที่', 'end_date');
        const entryDate = parseDate(startDate) || parseDate(endDate) || null;

        let semester = getValue(row, 'ภาคเรียนที่', 'semester');
        if (semester) {
            semester = String(semester).trim().replace(/[^0-9]/g, '');
            if (semester === '') semester = '1';
        } else {
            semester = '1';
        }

        let academicYear = getValue(row, 'ปีการศึกษา', 'academic_year');
        if (academicYear) {
            academicYear = String(academicYear).trim().replace(/[^0-9]/g, '');
            if (academicYear.length === 2) academicYear = '25' + academicYear;
            if (academicYear === '') academicYear = (new Date().getFullYear() + 543).toString();
        } else {
            academicYear = (new Date().getFullYear() + 543).toString();
        }

        return {
            first_name: nameParts.first_name,
            last_name: nameParts.last_name,
            prefix: nameParts.prefix,
            department: getValue(row, 'กลุ่มสาระ', 'department') || '',
            semester: semester,
            academic_year: academicYear,
            entry_type: entryType,
            title: getValue(row, 'รายการ', 'title') || '',
            organizer: getValue(row, 'จัดโดย', 'organizer') || '',
            entry_date: entryDate,
            document_url: getValue(row, 'ไฟล์', 'file_url') || null
        };
    }).filter(p => p.first_name || p.title);

    if (!payloads.length) {
        return Swal.fire({
            title: 'ไม่พบข้อมูลที่ใช้ได้',
            html: `<div class="text-left text-sm">
                <p class="text-red-500 font-bold mb-2">ระบบไม่สามารถอ่านข้อมูลได้</p>
                <p class="text-slate-500 text-xs mb-1">Header ที่พบ (${foundHeaders.length} คอลัมน์):</p>
                <pre class="text-xs bg-slate-100 p-2 rounded-lg overflow-auto max-h-32 text-slate-600">${(foundHeaders || []).join('\n')}</pre>
                <p class="text-indigo-500 text-xs mt-2">💡 ดาวน์โหลดไฟล์ต้นแบบเพื่อดูรูปแบบ header ที่ถูกต้อง</p>
            </div>`,
            icon: 'warning',
            confirmButtonText: 'รับทราบ'
        });
    }

    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

    const { data: existingList } = await db.from('core_personnel')
        .select('id, first_name, last_name, prefix, department');
    Swal.close();

    const nameMap = {};
    (existingList || []).forEach(p => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const fullNameWithPrefix = `${p.prefix || ''}${p.first_name} ${p.last_name}`.toLowerCase();
        nameMap[fullName] = p.id;
        nameMap[fullNameWithPrefix] = p.id;
        if (p.first_name && !p.last_name) {
            nameMap[p.first_name.toLowerCase()] = p.id;
        }
    });

    const matched = [],
        unmatched = [];
    payloads.forEach(p => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const id = nameMap[fullName] || nameMap[`${p.prefix}${p.first_name} ${p.last_name}`.toLowerCase()];
        if (id) {
            matched.push({ ...p, user_id: id });
        } else {
            unmatched.push(p);
        }
    });

    const confirmRes = await Swal.fire({
        title: `พบข้อมูล ${payloads.length} รายการ`,
        html: `<div class="text-left text-sm space-y-2">
            <div class="flex gap-3">
                <div class="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p class="text-2xl font-bold text-green-600">${matched.length}</p>
                    <p class="text-xs text-green-700 font-bold">จับคู่ชื่อพบ → อัปเดต</p>
                </div>
                <div class="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p class="text-2xl font-bold text-amber-600">${unmatched.length}</p>
                    <p class="text-xs text-amber-700 font-bold">ไม่พบในระบบ → ข้ามไป</p>
                </div>
            </div>
            ${unmatched.length > 0 ? `<p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-lg">⚠️ ไม่พบ: ${unmatched.slice(0, 5).map(p => `${p.prefix || ''}${p.first_name} ${p.last_name}`).join(', ')}${unmatched.length > 5 ? ` ...+${unmatched.length - 5}` : ''}</p>` : ''}
            ${matched.length > 0 ? `<p class="text-xs text-slate-400">ตัวอย่าง: <b>${matched[0].prefix || ''}${matched[0].first_name} ${matched[0].last_name}</b> | ${matched[0].title || '-'} | ${matched[0].entry_date || '(ไม่มีวันที่)'}</p>` : ''}
        </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        confirmButtonText: matched.length > 0 ? `นำเข้า ${matched.length} รายการ` : 'ไม่มีรายการที่จะนำเข้า',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirmRes.isConfirmed || matched.length === 0) return;

    Swal.fire({ title: 'กำลังตรวจสอบข้อมูลซ้ำ...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

    const importUserIds = [...new Set(matched.map(m => m.user_id))];
    const { data: existingRows } = await db
        .from('portfolio_entries')
        .select('user_id, academic_year, semester, title, document_url')
        .in('user_id', importUserIds);

    const makeKey = (r) =>
        `${r.academic_year}|${r.semester}|${r.user_id}|${String(r.title || '').trim()}|${String(r.document_url || '').trim()}`;
    const existingKeys = new Set((existingRows || []).map(makeKey));

    const toInsert = [],
        toSkip = [];
    matched.forEach(m => {
        const key = makeKey({ ...m, document_url: m.document_url || '' });
        if (existingKeys.has(key)) {
            toSkip.push(m);
        } else {
            toInsert.push(m);
        }
    });

    Swal.close();

    if (toInsert.length === 0) {
        return Swal.fire({
            icon: 'info',
            title: 'ข้อมูลซ้ำทั้งหมด',
            html: `<p class="text-sm text-slate-600">พบข้อมูลซ้ำ <b>${toSkip.length} รายการ</b> — ทุกรายการมีอยู่ในระบบแล้ว ไม่มีการนำเข้า</p>
                   <p class="text-xs text-slate-400 mt-1">ตรวจจาก: ปีการศึกษา + ภาคเรียน + ชื่อครู + รายการ + ไฟล์</p>`,
            confirmButtonText: 'รับทราบ'
        });
    }

    if (toSkip.length > 0) {
        const dupRes = await Swal.fire({
            icon: 'warning',
            title: `พบข้อมูลซ้ำ ${toSkip.length} รายการ`,
            html: `<div class="text-sm space-y-2">
                <div class="flex gap-3">
                    <div class="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <p class="text-2xl font-bold text-green-600">${toInsert.length}</p>
                        <p class="text-xs text-green-700 font-bold">รายการใหม่ → เพิ่ม</p>
                    </div>
                    <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                        <p class="text-2xl font-bold text-slate-400">${toSkip.length}</p>
                        <p class="text-xs text-slate-500 font-bold">ซ้ำทุกฟิลด์ → ข้ามไป</p>
                    </div>
                </div>
                <p class="text-xs text-slate-400">ตรวจจาก: ปีการศึกษา + ภาคเรียน + ชื่อครู + รายการ + ไฟล์</p>
            </div>`,
            showCancelButton: true,
            confirmButtonColor: '#6366f1',
            confirmButtonText: `เพิ่ม ${toInsert.length} รายการใหม่`,
            cancelButtonText: 'ยกเลิก'
        });
        if (!dupRes.isConfirmed) return;
    }

    Swal.fire({ title: `กำลังนำเข้า ${toInsert.length} รายการ...`, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

    const insertPayloads = toInsert.map(({ user_id, semester, academic_year, entry_type, title, organizer, entry_date, document_url }) => ({
        user_id,
        academic_year,
        semester,
        entry_type,
        title: title || 'ไม่ระบุรายละเอียด',
        organizer: organizer || '',
        entry_date: entry_date || new Date().toISOString().split('T')[0],
        hours: 0,
        document_url: document_url || null
    }));

    let success = 0,
        failed = 0,
        errors = [];
    const BATCH = 200;
    for (let i = 0; i < insertPayloads.length; i += BATCH) {
        Swal.update({ title: `กำลังนำเข้า ${Math.min(i + BATCH, insertPayloads.length)}/${insertPayloads.length}...` });
        const { data: inserted, error } = await db
            .from('portfolio_entries')
            .insert(insertPayloads.slice(i, i + BATCH))
            .select('id');
        if (error) {
            failed += insertPayloads.slice(i, i + BATCH).length;
            errors.push(error.message);
        } else {
            success += inserted?.length || 0;
        }
    }

    Swal.close();
    await logUserAction(`นำเข้าข้อมูล Portfolio (เพิ่ม ${success}, ซ้ำข้าม ${toSkip.length}, ล้มเหลว ${failed})`, 'portfolio');

    await Swal.fire({
        icon: failed === 0 ? 'success' : 'warning',
        title: 'ผลการนำเข้า',
        html: `<div class="text-left text-sm space-y-1">
            <p class="text-green-600 font-bold">✅ เพิ่มสำเร็จ: ${success} รายการ</p>
            ${toSkip.length > 0 ? `<p class="text-slate-400">⏭️ ซ้ำ ข้ามไป: ${toSkip.length} รายการ</p>` : ''}
            ${failed > 0 ? `<p class="text-red-500 font-bold">❌ ล้มเหลว: ${failed} รายการ</p>
            <details><summary class="text-xs cursor-pointer text-slate-400">ดูรายละเอียด</summary>
            <pre class="text-xs text-red-400 mt-1 max-h-24 overflow-y-auto">${errors.slice(0, 10).join('\n')}</pre></details>` : ''}
            ${unmatched.length > 0 ? `<p class="text-amber-600 text-xs mt-2">⚠️ ไม่พบในระบบ: ${unmatched.length} รายการ</p>` : ''}
        </div>`
    });

    await loadAllData();
}

function triggerImportExcel() {
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้น', 'error');
        return;
    }
    const input = document.getElementById('hidden-import-file');
    if (input) input.click();
}

function downloadImportTemplate() {
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้น', 'error');
        return;
    }

    const headers = [
        'ชื่อ - สกุล',
        'กลุ่มสาระ',
        'ภาคเรียนที่',
        'ปีการศึกษา',
        'ประเภท',
        'รายการ',
        'เมื่อวันที่',
        'ถึงวันที่',
        'จัดโดย',
        'ไฟล์'
    ];

    const exampleRows = [
        [
            'นางสาวสมใจ รักเรียน',
            'ภาษาไทย',
            1,
            2568,
            'รางวัลที่ได้รับ',
            'ครูดีเด่นระดับจังหวัด ประจำปี 2568',
            new Date(2025, 6, 23),
            new Date(2025, 6, 23),
            'สพม.เขต 9',
            ''
        ],
        [
            'นายสมชาย ใจดี',
            'คณิตศาสตร์',
            1,
            2568,
            'อบรม,ประชุม,สัมมนา',
            'การพัฒนาทักษะ AI สำหรับครูยุคใหม่',
            new Date(2025, 8, 15),
            new Date(2025, 8, 16),
            'สพฐ.',
            ''
        ],
        [
            'นางมาลี สุขสันต์',
            'วิทยาศาสตร์และเทคโนโลยี',
            2,
            2568,
            'รางวัลที่ได้รับ',
            'ชนะเลิศการแข่งขันสื่อนวัตกรรมการสอนระดับเขต',
            new Date(2025, 11, 10),
            new Date(2025, 11, 10),
            'สพม.เขต 9',
            'https://drive.google.com/...'
        ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);

    ['G2', 'G3', 'G4', 'H2', 'H3', 'H4'].forEach(cell => {
        if (ws[cell]) ws[cell].z = 'dd/mm/yyyy';
    });

    ws['!cols'] = [
        { wch: 28 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
        { wch: 22 }, { wch: 55 }, { wch: 14 }, { wch: 14 },
        { wch: 30 }, { wch: 45 }
    ];

    const infoHeaders = ['คอลัมน์', 'คำอธิบาย', 'ตัวอย่าง / ค่าที่รับได้'];
    const infoRows = [
        ['ชื่อ - สกุล', 'ชื่อ-นามสกุลพร้อมคำนำหน้า (ต้องตรงกับข้อมูลในระบบ)', 'นางสาวสมใจ รักเรียน'],
        ['กลุ่มสาระ', 'กลุ่มสาระการเรียนรู้', 'ภาษาไทย, คณิตศาสตร์, ...'],
        ['ภาคเรียนที่', 'เลขภาคเรียน', '1 หรือ 2'],
        ['ปีการศึกษา', 'ปีการศึกษา (พ.ศ.)', '2568'],
        ['ประเภท', 'ประเภทของผลงาน', '"รางวัลที่ได้รับ" → ผลงาน / "อบรม" → การอบรม'],
        ['รายการ', 'ชื่อผลงาน / ชื่อหลักสูตรอบรม', 'รางวัลครูดีเด่นระดับจังหวัด'],
        ['เมื่อวันที่', 'วันที่เริ่มต้น', '23/07/2568 หรือ 2025-07-23'],
        ['ถึงวันที่', 'วันที่สิ้นสุด (ไม่บังคับ)', '24/07/2568'],
        ['จัดโดย', 'หน่วยงานที่จัด / มอบรางวัล', 'สพม.เขต 9, สพฐ.'],
        ['ไฟล์', 'URL ไฟล์เอกสาร (ไม่บังคับ)', 'https://lh5.googleusercontent.com/d/...'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet([infoHeaders, ...infoRows]);
    wsInfo['!cols'] = [{ wch: 16 }, { wch: 45 }, { wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Portfolio_Data');
    XLSX.utils.book_append_sheet(wb, wsInfo, 'คำอธิบายคอลัมน์');

    XLSX.writeFile(wb, 'Portfolio_Import_Template.xlsx');

    Swal.fire({
        icon: 'success',
        title: 'ดาวน์โหลด Template สำเร็จ',
        html: `<div class="text-sm text-left space-y-1 text-slate-600">
            <p>ไฟล์ <b>Portfolio_Import_Template.xlsx</b> มี 2 sheets:</p>
            <p>📋 <b>Portfolio_Data</b> — กรอกข้อมูลตามตัวอย่าง</p>
            <p>ℹ️ <b>คำอธิบายคอลัมน์</b> — อ่านก่อนกรอกข้อมูล</p>
            <p class="text-amber-600 text-xs mt-2">⚠️ ห้ามเปลี่ยนชื่อ header แถวที่ 1</p>
        </div>`,
        confirmButtonText: 'รับทราบ',
        timer: 4000
    });
}

async function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!requireAdmin(currentRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้')) {
        event.target.value = '';
        return;
    }

    event.target.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '', cellDates: true, raw: true });
            if (!rows.length) return Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลในชีตแรก', 'warning');
            const headers = Object.keys(rows[0]);
            await processImportRows(rows, headers);
        } catch (err) {
            Swal.close();
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function convertSheetToCsvUrl(url) {
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return null;
    const sheetId = m[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseCsv(text) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        const cols = [];
        let cur = '',
            inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else { inQ = !inQ; }
            } else if (ch === ',' && !inQ) {
                cols.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur);
        rows.push(cols);
    }
    return rows;
}

async function importFromGoogleSheets() {
    if (!requireAdmin(currentRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้')) {
        return;
    }

    const { value: sheetUrl } = await Swal.fire({
        title: '<i class="fab fa-google-drive text-green-600 mr-2"></i>นำเข้าจาก Google Sheets',
        html: `<div class="text-left text-sm space-y-3">
            <p class="text-slate-600">วาง URL ของ Google Sheets ที่ต้องการนำเข้า</p>
            <input id="swal-sheet-url" type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                class="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-green-500 text-sm">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                <p class="font-bold">⚠️ ข้อกำหนด:</p>
                <p>1. ต้องตั้งค่าการแชร์ชีตเป็น <b>"ทุกคนที่มีลิงก์"</b></p>
                <p>2. ใช้โครงสร้างตามไฟล์ต้นแบบ</p>
                <p>3. ชีตแรกเท่านั้นที่จะถูกนำเข้า</p>
            </div>
            <p class="text-[10px] text-slate-400">วันที่ใน Google Sheets จะถูกอ่านเป็น Text ตรงๆ</p>
        </div>`,
        showCancelButton: true,
        confirmButtonText: 'นำเข้าข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        focusConfirm: false,
        preConfirm: () => {
            const v = document.getElementById('swal-sheet-url').value.trim();
            if (!v) Swal.showValidationMessage('กรุณาวาง URL ของ Google Sheets');
            return v;
        }
    });

    if (!sheetUrl) return;

    const csvUrl = convertSheetToCsvUrl(sheetUrl);
    if (!csvUrl) {
        return Swal.fire('URL ไม่ถูกต้อง',
            'กรุณาใช้ URL จาก Google Sheets เช่น https://docs.google.com/spreadsheets/d/...',
            'error');
    }

    Swal.fire({
        title: 'กำลังดึงข้อมูลจาก Google Sheets...',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} — ตรวจสอบว่าได้แชร์ชีตเป็นสาธารณะแล้ว`);
        const csvText = await res.text();
        Swal.close();

        const rows = parseCsv(csvText);
        if (rows.length < 2) return Swal.fire('ไม่พบข้อมูล', 'ไม่พบแถวข้อมูลในชีต', 'warning');

        const headers = rows[0];
        const dataRows = rows.slice(1).filter(r => r.some(v => v.trim()));

        const objRows = dataRows.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i] || ''; });
            return obj;
        });

        await processImportRows(objRows, headers);

    } catch (err) {
        Swal.close();
        if (err.message === 'Failed to fetch') {
            Swal.fire({
                title: 'เข้าถึงไฟล์ไม่ได้!',
                html: 'ระบบถูกบล็อกการดึงข้อมูล กรุณาตรวจสอบว่าไฟล์ Google Sheets ได้เปิดสิทธิ์การแชร์เป็น <br><b class="text-green-600">"ทุกคนที่มีลิงก์ (Anyone with the link)"</b> หรือยัง?',
                icon: 'error'
            });
        } else {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

// ==========================================
// 11. Settings & Module Admin Management
// ==========================================

async function ensureModuleExists() {
    try {
        const { data, error } = await db
            .from('core_system_modules')
            .select('module_id')
            .eq('module_id', MODULE_KEY)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Error checking module existence:', error);
            return;
        }

        if (!data) {
            const { error: insertError } = await db
                .from('core_system_modules')
                .insert({
                    module_id: MODULE_KEY,
                    module_name: 'ระบบแฟ้มสะสมผลงาน (Portfolio)',
                    is_active: true,
                    settings: {}
                });
            if (insertError) {
                console.warn('Could not create module entry:', insertError);
            }
        }
    } catch (e) {
        console.warn('Error in ensureModuleExists:', e);
    }
}

async function openSettingsModal() {
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าได้', 'error');
        return;
    }
    Swal.fire({ title: 'กำลังโหลด...', didOpen: () => Swal.showLoading() });

    try {
        await ensureModuleExists();

        const settings = await getPortfolioSettings();
        if (settings) {
            document.getElementById('set_gas_url').value = settings.gas_api_url || '';
            document.getElementById('set_folder_id').value = settings.drive_folder_id || '';
        } else {
            document.getElementById('set_gas_url').value = '';
            document.getElementById('set_folder_id').value = '';
        }

        const { data: personnelList } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, prefix')
            .order('first_name');

        await loadModuleAdmins();
        await initTomSelect(personnelList || []);

        Swal.close();
        document.getElementById('settingsModal').classList.remove('hidden');
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function loadModuleAdmins() {
    try {
        const { data: adminData, error: adminError } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', MODULE_KEY);

        const listEl = document.getElementById('list-module-admins');
        if (!listEl) return;

        if (adminError) {
            console.error('loadModuleAdmins error:', adminError);
            listEl.innerHTML = `<div class="text-sm text-red-500 text-center py-4">เกิดข้อผิดพลาด: ${adminError.message}</div>`;
            return;
        }

        if (!adminData || adminData.length === 0) {
            listEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">ยังไม่มีแอดมินโมดูล</div>';
            return;
        }

        const userIds = adminData.map(item => item.user_id);
        const { data: personnelData, error: personnelError } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, prefix')
            .in('id', userIds);

        if (personnelError) {
            listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลบุคลากร</div>';
            return;
        }

        const personnelMap = {};
        personnelData.forEach(p => {
            personnelMap[p.id] = p;
        });

        listEl.innerHTML = adminData.map(item => {
            const p = personnelMap[item.user_id];
            const name = p ? `${p.prefix || ''}${p.first_name} ${p.last_name}` : 'ไม่ระบุ';
            return `
                <div class="admin-item">
                    <span class="text-sm font-medium text-gray-700">${name}</span>
                    <button type="button" onclick="removeModuleAdmin('${item.user_id}')" 
                        class="text-red-500 hover:text-red-700 text-sm font-bold px-2 py-1 rounded hover:bg-red-50 transition-colors">
                        <i class="fa-solid fa-trash-can"></i> ลบ
                    </button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('loadModuleAdmins error:', err);
        const listEl = document.getElementById('list-module-admins');
        if (listEl) {
            listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
        }
    }
}

async function refreshModuleAdmins() {
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadModuleAdmins();
}

async function initTomSelect(personnelList) {
    const selectEl = document.getElementById('sel-module-admin');
    if (!selectEl) return;

    if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
    }

    if (selectEl.tomselect) {
        selectEl.tomselect.destroy();
    }

    const options = personnelList.map(p => ({
        value: p.id,
        text: `${p.prefix || ''}${p.first_name} ${p.last_name}`
    }));

    tomSelectInstance = new TomSelect(selectEl, {
        options: options,
        placeholder: '-- เลือกบุคลากร --',
        create: false,
        searchField: ['text'],
        maxItems: 1,
        render: {
            option: function (data, escape) {
                return `<div class="py-1 px-2">${escape(data.text)}</div>`;
            },
            item: function (data, escape) {
                return `<div class="py-1 px-2">${escape(data.text)}</div>`;
            }
        }
    });
}

async function addModuleAdmin() {
    if (!tomSelectInstance) {
        Swal.fire('เกิดข้อผิดพลาด', 'กรุณาลองเปิดหน้าใหม่อีกครั้ง', 'error');
        return;
    }

    const userId = tomSelectInstance.getValue();
    if (!userId) {
        Swal.fire('กรุณาเลือกบุคลากร', '', 'warning');
        return;
    }

    try {
        const { data: existing, error: checkError } = await db
            .from('core_module_admins')
            .select('id')
            .eq('module_id', MODULE_KEY)
            .eq('user_id', userId)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existing) {
            Swal.fire('มีอยู่แล้ว', 'บุคลากรนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
            return;
        }

        await ensureModuleExists();

        const { error } = await db.from('core_module_admins').insert({
            module_id: MODULE_KEY,
            user_id: userId
        });

        if (error) {
            if (error.code === '23505') {
                Swal.fire('มีอยู่แล้ว', 'บุคลากรนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
                return;
            }
            throw error;
        }

        await logUserAction(`เพิ่มแอดมินโมดูล Portfolio: ${userId}`, 'portfolio');
        await refreshModuleAdmins();

        if (tomSelectInstance) {
            tomSelectInstance.clear();
        }

        Swal.fire({ icon: 'success', title: 'เพิ่มแอดมินสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function removeModuleAdmin(userId) {
    if (!userId) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        text: 'บุคลากรนี้จะไม่สามารถจัดการระบบ Portfolio ได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ถอดถอน',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    try {
        const { data, error } = await db
            .from('core_module_admins')
            .delete()
            .eq('module_id', MODULE_KEY)
            .eq('user_id', userId)
            .select();

        if (error) {
            if (error.code === '42501') {
                throw new Error('ไม่มีสิทธิ์ลบแอดมินโมดูล กรุณาติดต่อผู้ดูแลระบบ');
            }
            throw error;
        }

        await logUserAction(`ถอดถอนแอดมินโมดูล Portfolio: ${userId}`, 'portfolio');
        await refreshModuleAdmins();

        Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error('removeModuleAdmin error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
    if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
    }
}

async function saveSettings(e) {
    e.preventDefault();
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าได้', 'error');
        return;
    }
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    const payload = {
        gas_api_url: document.getElementById('set_gas_url').value.trim(),
        drive_folder_id: document.getElementById('set_folder_id').value.trim()
    };

    try {
        const { error } = await db
            .from('portfolio_settings')
            .upsert({
                id: 1,
                ...payload
            }, { onConflict: 'id' });

        if (error) throw error;

        await logUserAction('บันทึกการตั้งค่า Portfolio', 'portfolio');
        closeSettingsModal();
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 12. ประกาศฟังก์ชัน Global (ที่ใช้ใน HTML)
// ==========================================

window.logout = logout;
window.toggleRoleView = toggleRoleView;
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.openEntryFormModal = openEntryFormModal;
window.closeEntryModal = closeEntryModal;
window.saveEntry = saveEntry;
window.deleteEntry = deleteEntry;
window.openExportModal = openExportModal;
window.closeExportModal = closeExportModal;
window.processExport = processExport;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.loadTableData = loadTableData;
window.loadInitialData = loadInitialData;
window.canManagePortfolioSettings = canManagePortfolioSettings;
window.isAdminView = isAdminView;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.loadModuleAdmins = loadModuleAdmins;
window.refreshModuleAdmins = refreshModuleAdmins;
window.openEditEntryModal = openEditEntryModal;
window.copyCurrentFileLink = copyCurrentFileLink;
window.populateFilterOptions = function () { };
window.importFromExcel = importFromExcel;
window.triggerImportExcel = triggerImportExcel;
window.downloadImportTemplate = downloadImportTemplate;
window.importFromGoogleSheets = importFromGoogleSheets;
window.processImportRows = processImportRows;
window.convertSheetToCsvUrl = convertSheetToCsvUrl;
window.parseCsv = parseCsv;
window.loadAllData = loadAllData;
window.toggleEntryType = toggleEntryType;
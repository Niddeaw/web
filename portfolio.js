// ==========================================
// portfolio.js — ระบบแฟ้มสะสมผลงานครู (ฉบับสมบูรณ์)
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

// ==========================================
// 1. ระบบรักษาความปลอดภัย & ตั้งค่าเริ่มต้น
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof flatpickr !== 'undefined') {
        flatpickr.localize(flatpickr.l10ns.th);
    }
    await initPortfolio();
});

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

    await loadInitialData();

    // โหลด dashboard เป็น tab เริ่มต้นและอัปเดต UI ตามสิทธิ์
    switchTab('dashboard');
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

function toggleRoleView() {
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
    loadInitialData();

    Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: forceTeacherMode ? 'info' : 'success',
        title: forceTeacherMode ? 'สลับเป็นมุมมองครู' : 'สลับเป็นมุมมอง Admin',
        showConfirmButton: false,
        timer: 1500
    });
}

function applyRoleUI() {
    if (typeof applyVisibilityByRole === 'function') {
        applyVisibilityByRole(currentRole, isAdminView(), {
            settingsBtn: null,
            toggleBtn: 'btnToggleMode'
        });
    }

    const menuItems = document.querySelectorAll('#sidebarMenu button');
    menuItems.forEach(btn => {
        if (btn.textContent.includes('ตั้งค่าระบบ')) {
            btn.style.display = canManagePortfolioSettings() ? '' : 'none';
        }
        if (btn.textContent.includes('นำเข้า Excel')) {
            btn.style.display = canManagePortfolioSettings() ? '' : 'none';
        }
    });

    // ปุ่มเพิ่มข้อมูล: แสดงเฉพาะโหมดครู (ไม่แสดงในโหมดแอดมิน)
    // หา id ก่อน ถ้าไม่เจอให้หาจาก onclick attribute
    let addBtn = document.getElementById('btn-add-entry');
    if (!addBtn) {
        addBtn = document.querySelector('button[onclick="openEntryFormModal()"]');
        if (addBtn) addBtn.id = 'btn-add-entry'; // ผูก id ไว้สำหรับครั้งต่อไป
    }
    if (addBtn) {
        // แสดงเมื่อไม่ใช่โหมดแอดมิน (= โหมดครู)
        const canAdd = !isAdminView();
        addBtn.style.display = canAdd ? '' : 'none';
    }

    const filterDept = document.getElementById('filterDept');
    if (filterDept) {
        filterDept.classList.toggle('hidden', !isAdminView());
    }

    const chartsArea = document.getElementById('adminChartsArea');
    if (chartsArea) {
        chartsArea.classList.toggle('hidden', !isAdminView());
    }
}

// ==========================================
// 3. UI & Navigation
// ==========================================

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

    // ปุ่มนำเข้า Excel: เฉพาะ super_admin เท่านั้น
    if (canManagePortfolioSettings()) {
        html += `
        <button onclick="openImportModal()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-blue-700 hover:bg-blue-50 font-bold transition-all border border-blue-200 bg-blue-50/50">
            <i class="fa-solid fa-file-import w-5 text-center text-lg"></i> <span class="sidebar-text">นำเข้า Excel</span>
        </button>`;
    }

    if (canManagePortfolioSettings()) {
        html += `
        <button onclick="openSettingsModal()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-amber-600 hover:bg-amber-50 font-bold transition-all mt-2 border border-amber-200 bg-amber-50/50">
            <i class="fa-solid fa-gear w-5 text-center text-lg"></i> <span class="sidebar-text">ตั้งค่าระบบ</span>
        </button>`;
    }

    menu.innerHTML = html;

    if (isAdminView()) {
        const depts = [
            "ภาษาไทย",
            "คณิตศาสตร์",
            "วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)",
            "วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)",
            "สังคมศึกษา ศาสนาและวัฒนธรรม",
            "สุขศึกษาและพลศึกษา",
            "ศิลปะ",
            "การงานอาชีพ",
            "ภาษาต่างประเทศ (ภาษาอังกฤษ)",
            "ภาษาต่างประเทศ (ภาษาจีน)",
            "แนะแนว"];
        const filterEl = document.getElementById('filterDept');
        if (filterEl) {
            filterEl.classList.remove('hidden');
            filterEl.innerHTML = '<option value="">-- ทุกกลุ่มสาระฯ --</option>';
            depts.forEach(d => {
                filterEl.innerHTML += `<option value="${d}">${d}</option>`;
            });
        }
    }
}

function switchTab(tab) {
    currentTab = tab;
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
        if (dashboardSection) dashboardSection.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = 'ภาพรวมผลงาน (Dashboard)';
        if (isAdminView()) renderAdminCharts();
    } else {
        currentEntryType = tab;
        if (datatableSection) datatableSection.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = tab === 'work' ? 'จัดการผลงานและรางวัล' : 'จัดการประวัติการอบรม';
        document.getElementById('tableHeaderTitle').innerText = tab === 'work' ? 'รายการผลงาน/รางวัล' : 'รายการหลักสูตรที่อบรม';
        loadTableData();
    }

    // อัปเดต UI ปุ่มเพิ่มข้อมูลทุกครั้งที่สลับแท็บ
    applyRoleUI();
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

async function fetchPersonnelData(userIds) {
    if (!userIds.length) return new Map();
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
        const { data, error } = await db.from('core_personnel')
            .select('id, first_name, last_name, department')
            .in('id', missingIds);
        if (error) {
            console.error('Error fetching personnel:', error);
            return cached;
        }
        data.forEach(p => {
            personnelCache.set(p.id, p);
            cached.set(p.id, p);
        });
    }
    return cached;
}

async function loadInitialData() {
    try {
        let query = db.from('portfolio_entries').select('*');

        if (!isAdminView() || forceTeacherMode) {
            query = query.eq('user_id', currentUser.id);
        }

        const { data: entries, error } = await query;
        if (error) throw error;

        const userIds = [...new Set(entries.map(e => e.user_id))];
        const personnelMap = await fetchPersonnelData(userIds);

        allEntries = entries.map(e => ({
            ...e,
            core_personnel: personnelMap.get(e.user_id) || null
        }));

        updateDashboard();
        if (currentTab === 'dashboard' && isAdminView()) {
            renderAdminCharts();
        }
        if (currentTab !== 'dashboard') {
            loadTableData();
        }
        Swal.close();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function updateDashboard() {
    const works = allEntries.filter(e => e.entry_type === 'work');
    const trainings = allEntries.filter(e => e.entry_type === 'training');
    const totalHours = trainings.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const teachers = new Set(allEntries.map(e => e.user_id));

    const countWorks = document.getElementById('count-works');
    const countTrainings = document.getElementById('count-trainings');
    const countHours = document.getElementById('count-hours');
    const countTeachers = document.getElementById('count-teachers');

    if (countWorks) countWorks.innerText = works.length;
    if (countTrainings) countTrainings.innerText = trainings.length;
    if (countHours) countHours.innerText = totalHours;
    if (countTeachers) countTeachers.innerText = teachers.size;
}

// ==========================================
// 5. Charts (Chart.js)
// ==========================================

function renderAdminCharts() {
    const works = allEntries.filter(e => e.entry_type === 'work');
    const trainings = allEntries.filter(e => e.entry_type === 'training');

    const countBy = (arr, keyFn) => {
        return arr.reduce((acc, curr) => {
            const key = keyFn(curr);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    };

    const ctxRatio = document.getElementById('chartRatio');
    if (ctxRatio) {
        const ctx = ctxRatio.getContext('2d');
        if (charts.ratio) charts.ratio.destroy();
        charts.ratio = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['ผลงาน/รางวัล', 'การอบรม'],
                datasets: [{ data: [works.length, trainings.length], backgroundColor: ['#3b82f6', '#10b981'] }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    const deptWorksCount = countBy(works, e => e.core_personnel?.department || 'ไม่ระบุ');
    const ctxDeptWorks = document.getElementById('chartDeptWorks');
    if (ctxDeptWorks) {
        const ctx = ctxDeptWorks.getContext('2d');
        if (charts.deptWorks) charts.deptWorks.destroy();
        charts.deptWorks = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(deptWorksCount),
                datasets: [{ label: 'จำนวนผลงาน', data: Object.values(deptWorksCount), backgroundColor: '#3b82f6' }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    const teacherWorksCount = countBy(works, e => `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ');
    const sortedTeacherWorks = Object.entries(teacherWorksCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ctxTeacherWorks = document.getElementById('chartTeacherWorks');
    if (ctxTeacherWorks) {
        const ctx = ctxTeacherWorks.getContext('2d');
        if (charts.teacherWorks) charts.teacherWorks.destroy();
        charts.teacherWorks = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedTeacherWorks.map(i => i[0]),
                datasets: [{ label: 'จำนวนผลงาน', data: sortedTeacherWorks.map(i => i[1]), backgroundColor: '#8b5cf6' }]
            },
            options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
        });
    }

    const deptTrainCount = countBy(trainings, e => e.core_personnel?.department || 'ไม่ระบุ');
    const ctxDeptTrain = document.getElementById('chartDeptTrainings');
    if (ctxDeptTrain) {
        const ctx = ctxDeptTrain.getContext('2d');
        if (charts.deptTrain) charts.deptTrain.destroy();
        charts.deptTrain = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(deptTrainCount),
                datasets: [{ label: 'จำนวนครั้งที่อบรม', data: Object.values(deptTrainCount), backgroundColor: '#10b981' }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    const teacherHours = trainings.reduce((acc, curr) => {
        const name = `${curr.core_personnel?.first_name || ''} ${curr.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ';
        acc[name] = (acc[name] || 0) + Number(curr.hours);
        return acc;
    }, {});
    const sortedTeacherHours = Object.entries(teacherHours).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ctxTeacherTrain = document.getElementById('chartTeacherTrainings');
    if (ctxTeacherTrain) {
        const ctx = ctxTeacherTrain.getContext('2d');
        if (charts.teacherTrain) charts.teacherTrain.destroy();
        charts.teacherTrain = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedTeacherHours.map(i => i[0]),
                datasets: [{ label: 'ชั่วโมงอบรมรวม', data: sortedTeacherHours.map(i => i[1]), backgroundColor: '#f59e0b' }]
            },
            options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
        });
    }
}

// ==========================================
// 6. DataTables
// ==========================================

function loadTableData() {
    if ($.fn.DataTable.isDataTable('#dataTable')) {
        $('#dataTable').DataTable().destroy();
    }

    const filterDept = document.getElementById('filterDept');
    const filterValue = filterDept ? filterDept.value : '';
    const tbody = document.getElementById('tb-data');

    let filteredData = allEntries.filter(e => e.entry_type === currentEntryType);
    if (isAdminView() && filterValue) {
        filteredData = filteredData.filter(e => e.core_personnel?.department === filterValue);
    }

    if (tbody) {
        tbody.innerHTML = filteredData.map(e => {
            const name = `${e.core_personnel?.first_name || ''} ${e.core_personnel?.last_name || ''}`.trim() || 'ไม่ระบุ';
            const dept = e.core_personnel?.department || '-';
            const dateStr = dayjs(e.entry_date).locale('th').format('DD MMM YYYY');

            let docLink = '-';
            if (e.document_url) {
                docLink = `<a href="${e.document_url}" target="_blank" class="text-blue-600 hover:underline font-bold"><i class="fa-solid fa-file-pdf text-red-500"></i> เปิดดู</a>`;
            }

            let manageBtns = '';
            if (e.user_id === currentUser.id || isAdminView()) {
                manageBtns = `
                    <button onclick="deleteEntry('${e.id}')" class="text-red-600 hover:text-red-800 text-sm font-bold px-2 py-1 rounded hover:bg-red-100"><i class="fa-solid fa-trash-can"></i> ลบ</button>
                `;
            }

            return `
                <tr>
                    <td class="py-3 px-4 font-bold text-gray-700">${e.semester}/${e.academic_year}</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-blue-700">${name}</div>
                        <div class="text-[11px] text-gray-500">${dept}</div>
                    </td>
                    <td class="py-3 px-4 font-medium">${e.title}</td>
                    <td class="py-3 px-4 text-gray-600">${e.organizer || '-'}</td>
                    <td class="py-3 px-4 text-center text-sm">${dateStr}</td>
                    <td class="py-3 px-4 text-center font-bold text-indigo-600">${e.hours}</td>
                    <td class="py-3 px-4 text-center">${docLink}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">${manageBtns}</td>
                </tr>
            `;
        }).join('');
    }

    $('#dataTable').DataTable({
        scrollX: true,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        pageLength: 10,
        responsive: true
    });
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

    document.getElementById('entryModal').classList.remove('hidden');
}

function closeEntryModal() {
    document.getElementById('entryModal').classList.add('hidden');
}

async function saveEntry(e) {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const title = document.getElementById('f_title').value.trim();
        const organizer = document.getElementById('f_organizer').value.trim();
        const date = document.getElementById('f_date').value;
        const hours = document.getElementById('f_hours').value || 0;
        const fileInput = document.getElementById('f_file');

        let docUrl = null;

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `portfolio_${currentUser.id}_${Date.now()}_${file.name}`;
            try {
                docUrl = await uploadFileToDrive(file, fileName);
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
            document_url: docUrl
        };

        const { error } = await db.from('portfolio_entries').insert([payload]);
        if (error) throw error;

        await logUserAction(`เพิ่มข้อมูล portfolio (${payload.entry_type})`, 'portfolio');

        closeEntryModal();
        await loadInitialData();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });

    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deleteEntry(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ข้อมูลจะไม่สามารถกู้คืนได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบข้อมูล'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('portfolio_entries').delete().eq('id', id);
        if (error) {
            Swal.fire('ผิดพลาด', error.message, 'error');
        } else {
            await logUserAction(`ลบข้อมูล portfolio ID=${id}`, 'portfolio');
            await loadInitialData();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        }
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
            const depts = [
                "ภาษาไทย",
                "คณิตศาสตร์",
                "วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)",
                "วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)",
                "สังคมศึกษา ศาสนาและวัฒนธรรม",
                "สุขศึกษาและพลศึกษา",
                "ศิลปะ",
                "การงานอาชีพ",
                "ภาษาต่างประเทศ (ภาษาอังกฤษ)",
                "ภาษาต่างประเทศ (ภาษาจีน)",
                "แนะแนว"];
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

function processExport() {
    const type = document.getElementById('exp_type').value;
    const year = document.getElementById('exp_year').value.trim();
    const term = document.getElementById('exp_term').value;
    const dept = isAdminView() ? document.getElementById('exp_dept').value : null;

    let exportData = allEntries;

    if (type !== 'all') exportData = exportData.filter(e => e.entry_type === type);
    if (year) exportData = exportData.filter(e => e.academic_year === year);
    if (term !== 'all') exportData = exportData.filter(e => e.semester === term);
    if (dept && dept !== 'all') exportData = exportData.filter(e => e.core_personnel?.department === dept);

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
// 10. Settings & Module Admin Management
// ==========================================

/**
 * ตรวจสอบและสร้างโมดูลใน core_system_modules ถ้ายังไม่มี
 * (ใช้ใน openSettingsModal และ addModuleAdmin)
 */
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
        // ตรวจสอบและสร้างโมดูลถ้ายังไม่มี (ป้องกัน foreign key)
        await ensureModuleExists();

        // ✅ ใช้ getPortfolioSettings() ที่มีการจัดการ error
        const settings = await getPortfolioSettings();
        if (settings) {
            document.getElementById('set_gas_url').value = settings.gas_api_url || '';
            document.getElementById('set_folder_id').value = settings.drive_folder_id || '';
        } else {
            // กรณียังไม่มีข้อมูล ให้เว้นว่าง
            document.getElementById('set_gas_url').value = '';
            document.getElementById('set_folder_id').value = '';
        }

        // โหลดรายชื่อบุคลากรทั้งหมดสำหรับ dropdown
        const { data: personnelList } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, prefix')
            .order('first_name');

        // โหลดรายชื่อแอดมินโมดูลปัจจุบัน
        await loadModuleAdmins();

        // ตั้งค่า TomSelect
        await initTomSelect(personnelList || []);

        Swal.close();
        document.getElementById('settingsModal').classList.remove('hidden');
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * โหลดรายชื่อแอดมินโมดูล (ปรับปรุงให้ใช้ query แยก)
 */
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
            if (adminError.code === '42501') {
                listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-4">ไม่มีสิทธิ์เข้าถึงข้อมูลแอดมินโมดูล</div>';
            } else {
                listEl.innerHTML = `<div class="text-sm text-red-500 text-center py-4">เกิดข้อผิดพลาด: ${adminError.message}</div>`;
            }
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
            console.error('Error loading personnel:', personnelError);
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

/**
 * รีเฟรชรายการแอดมินโมดูล (ใช้หลังเพิ่ม/ลบ)
 */
async function refreshModuleAdmins() {
    // รอให้ database commit ก่อนโหลดใหม่
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadModuleAdmins();
}

async function initTomSelect(personnelList) {
    const selectEl = document.getElementById('sel-module-admin');
    if (!selectEl) return;

    // ทำลาย instance เดิมถ้ามี
    if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
    }

    // ตรวจสอบว่าไม่ได้ถูกใช้แล้ว
    if (selectEl.tomselect) {
        selectEl.tomselect.destroy();
    }

    // สร้าง options
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

/**
 * เพิ่มแอดมินโมดูล (ตรวจสอบ duplicate ก่อน insert)
 */
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
        // ตรวจสอบว่ามีคู่นี้อยู่แล้วหรือไม่ (ป้องกัน duplicate key)
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

        // ตรวจสอบและสร้างโมดูลถ้ายังไม่มี (ป้องกัน foreign key)
        await ensureModuleExists();

        const { error } = await db.from('core_module_admins').insert({
            module_id: MODULE_KEY,
            user_id: userId
        });

        if (error) {
            // ถ้า error เป็น duplicate key อีกครั้ง (ป้องกัน race condition)
            if (error.code === '23505') {
                Swal.fire('มีอยู่แล้ว', 'บุคลากรนี้เป็นแอดมินโมดูลอยู่แล้ว', 'info');
                return;
            }
            throw error;
        }

        await logUserAction(`เพิ่มแอดมินโมดูล Portfolio: ${userId}`, 'portfolio');

        // ✅ รีเฟรชรายการ
        await refreshModuleAdmins();

        if (tomSelectInstance) {
            tomSelectInstance.clear();
        }

        Swal.fire({ icon: 'success', title: 'เพิ่มแอดมินสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * ลบแอดมินโมดูล (แก้ไขให้ทำงานได้จริง)
 */
/**
 * ลบแอดมินโมดูล — ใช้ service-role RPC ถ้า regular delete ถูก RLS บล็อก
 */
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

    Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        console.log('กำลังลบแอดมิน:', userId, 'โมดูล:', MODULE_KEY);

        // วิธีที่ 1: ลบตรงผ่าน Supabase client (ต้องการ RLS policy ที่อนุญาต)
        const { data, error } = await db
            .from('core_module_admins')
            .delete()
            .eq('module_id', MODULE_KEY)
            .eq('user_id', userId)
            .select();

        console.log('ผลลัพธ์การลบ:', data, error);

        if (error) {
            console.error('Delete error:', error);

            // วิธีที่ 2: ถ้า RLS บล็อก (42501) — ลอง RPC function ที่มี SECURITY DEFINER
            if (error.code === '42501') {
                const { error: rpcError } = await db.rpc('delete_module_admin', {
                    p_module_id: MODULE_KEY,
                    p_user_id: userId
                });
                if (rpcError) {
                    // แจ้ง super_admin ให้เพิ่ม RLS policy หรือ RPC function
                    throw new Error(
                        'ไม่มีสิทธิ์ลบผ่าน RLS โดยตรง\n\n' +
                        'กรุณาเพิ่ม Supabase Policy:\n' +
                        '"DELETE on core_module_admins FOR super_admin"\n' +
                        'หรือสร้าง RPC function delete_module_admin()'
                    );
                }
            } else if (error.code === '42P01') {
                throw new Error('ไม่พบตาราง core_module_admins กรุณาติดต่อผู้ดูแลระบบ');
            } else {
                throw error;
            }
        }

        // ถ้า delete สำเร็จแต่ไม่มีแถวที่ถูกลบ — อาจ RLS silently block
        if (data && data.length === 0) {
            console.warn('RLS อาจบล็อก: ไม่มีแถวที่ถูกลบ — ตรวจสอบ Supabase RLS policy');
            Swal.fire({
                icon: 'warning',
                title: 'ลบไม่สำเร็จ',
                html: 'ระบบส่งคำสั่งลบแล้ว แต่ไม่มีข้อมูลถูกลบ<br>' +
                    '<small class="text-gray-500">กรณีนี้มักเกิดจาก RLS Policy ใน Supabase<br>' +
                    'กรุณาเพิ่ม Policy: <code>DELETE for super_admin/admin</code><br>' +
                    'บนตาราง <code>core_module_admins</code></small>',
                confirmButtonText: 'รับทราบ'
            });
            await refreshModuleAdmins();
            return;
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

/**
 * บันทึกการตั้งค่าระบบ (ใช้ upsert และจัดการ error)
 */
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
        // ✅ ไม่ต้องส่ง updated_at ด้วย database จะจัดการผ่าน trigger
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
// 11. นำเข้าข้อมูลจาก Excel (Super Admin เท่านั้น)
// ==========================================

/**
 * Inject Import Modal เข้า DOM ถ้ายังไม่มี
 */
function ensureImportModalExists() {
    if (document.getElementById('importModal')) return;

    const modal = document.createElement('div');
    modal.id = 'importModal';
    modal.className = 'fixed inset-0 bg-black/60 z-50 hidden flex items-center justify-center backdrop-blur-sm p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 bg-blue-700 flex justify-between items-center">
                <h3 class="text-lg font-bold text-white"><i class="fa-solid fa-file-import mr-2"></i>นำเข้าข้อมูลจาก Excel</h3>
                <button onclick="closeImportModal()" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="p-6 space-y-5">

                <!-- ดาวน์โหลด Template -->
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p class="text-sm font-bold text-blue-800 mb-2"><i class="fa-solid fa-circle-info mr-1"></i> วิธีใช้งาน</p>
                    <ol class="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                        <li>ดาวน์โหลดไฟล์ Template Excel ด้านล่าง</li>
                        <li>กรอกข้อมูลตามรูปแบบที่กำหนด (ห้ามเปลี่ยนหัวคอลัมน์)</li>
                        <li>คอลัมน์ <strong>entry_type</strong>: ใส่ <code>work</code> หรือ <code>training</code></li>
                        <li>คอลัมน์ <strong>entry_date</strong>: รูปแบบ <code>YYYY-MM-DD</code> เช่น 2025-11-01</li>
                        <li>คอลัมน์ <strong>user_id</strong>: UUID ของบุคลากรจาก Supabase Auth</li>
                        <li>อัปโหลดไฟล์และกด "นำเข้าข้อมูล"</li>
                    </ol>
                    <button onclick="downloadImportTemplate()" class="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                        <i class="fa-solid fa-download mr-1"></i> ดาวน์โหลด Template
                    </button>
                </div>

                <!-- อัปโหลดไฟล์ -->
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">เลือกไฟล์ Excel (.xlsx)</label>
                    <input type="file" id="import_file" accept=".xlsx,.xls"
                        class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all cursor-pointer border border-gray-300 rounded-lg p-1"
                        onchange="previewImportData()">
                </div>

                <!-- Preview ข้อมูล -->
                <div id="importPreviewArea" class="hidden">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-sm font-bold text-gray-700">ตัวอย่างข้อมูลที่จะนำเข้า (<span id="importRowCount">0</span> แถว)</p>
                        <span id="importStatusBadge" class="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700"></span>
                    </div>
                    <div class="overflow-x-auto max-h-64 border border-gray-200 rounded-lg">
                        <table class="w-full text-xs text-left">
                            <thead class="bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="px-3 py-2 font-bold text-gray-600">#</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">ประเภท</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">ปีการศึกษา</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">ภาคเรียน</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">ชื่อผลงาน/หลักสูตร</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">หน่วยงาน</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">วันที่</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">ชั่วโมง</th>
                                    <th class="px-3 py-2 font-bold text-gray-600">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody id="importPreviewBody" class="divide-y divide-gray-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Error Summary -->
                <div id="importErrorArea" class="hidden bg-red-50 border border-red-200 rounded-xl p-4">
                    <p class="text-sm font-bold text-red-700 mb-2"><i class="fa-solid fa-triangle-exclamation mr-1"></i> พบข้อผิดพลาด</p>
                    <ul id="importErrorList" class="text-xs text-red-600 space-y-1 list-disc list-inside"></ul>
                </div>

                <div class="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button onclick="closeImportModal()" class="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">ยกเลิก</button>
                    <button id="btn-do-import" onclick="processImport()" disabled
                        class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-md transition-colors">
                        <i class="fa-solid fa-file-import mr-1"></i> นำเข้าข้อมูล
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

let importRows = []; // เก็บข้อมูลที่อ่านจาก Excel ไว้ใช้ตอน processImport

function openImportModal() {
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่สามารถนำเข้าข้อมูลได้', 'error');
        return;
    }
    ensureImportModalExists();
    importRows = [];
    // Reset UI
    const fileInput = document.getElementById('import_file');
    if (fileInput) fileInput.value = '';
    const previewArea = document.getElementById('importPreviewArea');
    if (previewArea) previewArea.classList.add('hidden');
    const errorArea = document.getElementById('importErrorArea');
    if (errorArea) errorArea.classList.add('hidden');
    const importBtn = document.getElementById('btn-do-import');
    if (importBtn) importBtn.disabled = true;

    document.getElementById('importModal').classList.remove('hidden');
}

function closeImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) modal.classList.add('hidden');
    importRows = [];
}

/**
 * ดาวน์โหลด Template Excel สำหรับนำเข้าข้อมูล
 */
function downloadImportTemplate() {
    const headers = ['user_id', 'entry_type', 'academic_year', 'semester', 'title', 'organizer', 'entry_date', 'hours'];
    const exampleRows = [
        ['xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'work', '2568', '1', 'รางวัลครูดีเด่น', 'สพม.เขต 9', '2025-11-01', '0'],
        ['xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'training', '2568', '1', 'การอบรม AI สำหรับครู', 'สพฐ.', '2025-10-15', '6'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);

    // ตั้งความกว้างคอลัมน์
    ws['!cols'] = [
        { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 8 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Portfolio_Import');
    XLSX.writeFile(wb, 'Portfolio_Import_Template.xlsx');
}

/**
 * อ่าน Excel และแสดง Preview ก่อนนำเข้า
 */
function previewImportData() {
    const fileInput = document.getElementById('import_file');
    const previewArea = document.getElementById('importPreviewArea');
    const errorArea = document.getElementById('importErrorArea');
    const importBtn = document.getElementById('btn-do-import');

    // Reset
    importRows = [];
    if (previewArea) previewArea.classList.add('hidden');
    if (errorArea) errorArea.classList.add('hidden');
    if (importBtn) importBtn.disabled = true;

    if (!fileInput || !fileInput.files.length) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (!rows.length) {
                Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลในไฟล์ Excel', 'warning');
                return;
            }

            const errors = [];
            const validRows = [];

            // Required columns
            const requiredCols = ['user_id', 'entry_type', 'academic_year', 'semester', 'title', 'entry_date'];

            rows.forEach((row, idx) => {
                const rowNum = idx + 2; // +2 เพราะ row 1 คือ header
                const rowErrors = [];

                // ตรวจสอบ required fields
                requiredCols.forEach(col => {
                    if (!row[col] || String(row[col]).trim() === '') {
                        rowErrors.push(`แถว ${rowNum}: คอลัมน์ "${col}" ต้องไม่ว่าง`);
                    }
                });

                // ตรวจสอบ entry_type
                if (row.entry_type && !['work', 'training'].includes(String(row.entry_type).trim())) {
                    rowErrors.push(`แถว ${rowNum}: entry_type ต้องเป็น "work" หรือ "training" เท่านั้น`);
                }

                // ตรวจสอบ entry_date (YYYY-MM-DD)
                if (row.entry_date) {
                    const dateStr = String(row.entry_date).trim();
                    // handle Excel numeric date
                    let parsedDate;
                    if (/^\d{5}$/.test(dateStr)) {
                        // Excel serial date
                        parsedDate = XLSX.SSF.parse_date_code(Number(dateStr));
                        row.entry_date = `${parsedDate.y}-${String(parsedDate.m).padStart(2, '0')}-${String(parsedDate.d).padStart(2, '0')}`;
                    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        rowErrors.push(`แถว ${rowNum}: entry_date ต้องเป็นรูปแบบ YYYY-MM-DD`);
                    }
                }

                if (rowErrors.length > 0) {
                    errors.push(...rowErrors);
                } else {
                    validRows.push({
                        user_id: String(row.user_id).trim(),
                        entry_type: String(row.entry_type).trim(),
                        academic_year: String(row.academic_year).trim(),
                        semester: String(row.semester).trim(),
                        title: String(row.title).trim(),
                        organizer: String(row.organizer || '').trim(),
                        entry_date: String(row.entry_date).trim(),
                        hours: Number(row.hours) || 0,
                        document_url: null
                    });
                }
            });

            // แสดง Error
            if (errors.length > 0) {
                const errorList = document.getElementById('importErrorList');
                if (errorList) {
                    errorList.innerHTML = errors.slice(0, 20).map(e => `<li>${e}</li>`).join('');
                    if (errors.length > 20) {
                        errorList.innerHTML += `<li>...และอีก ${errors.length - 20} รายการ</li>`;
                    }
                }
                if (errorArea) errorArea.classList.remove('hidden');
            }

            // แสดง Preview
            if (validRows.length > 0) {
                importRows = validRows;

                const previewBody = document.getElementById('importPreviewBody');
                const rowCount = document.getElementById('importRowCount');
                const statusBadge = document.getElementById('importStatusBadge');

                if (rowCount) rowCount.textContent = validRows.length;
                if (statusBadge) {
                    statusBadge.textContent = errors.length > 0
                        ? `${errors.length} รายการมีข้อผิดพลาด (ไม่นำเข้า)`
                        : 'ข้อมูลถูกต้องทั้งหมด';
                    statusBadge.className = errors.length > 0
                        ? 'text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700'
                        : 'text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700';
                }

                if (previewBody) {
                    previewBody.innerHTML = validRows.map((r, i) => `
                        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                            <td class="px-3 py-1.5 text-gray-500">${i + 1}</td>
                            <td class="px-3 py-1.5">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.entry_type === 'work' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}">
                                    ${r.entry_type === 'work' ? 'ผลงาน/รางวัล' : 'การอบรม'}
                                </span>
                            </td>
                            <td class="px-3 py-1.5">${r.academic_year}</td>
                            <td class="px-3 py-1.5">${r.semester}</td>
                            <td class="px-3 py-1.5 max-w-[180px] truncate" title="${r.title}">${r.title}</td>
                            <td class="px-3 py-1.5 max-w-[120px] truncate" title="${r.organizer}">${r.organizer || '-'}</td>
                            <td class="px-3 py-1.5">${r.entry_date}</td>
                            <td class="px-3 py-1.5 text-center">${r.hours}</td>
                            <td class="px-3 py-1.5"><span class="text-green-600 font-bold text-[10px]">✓ พร้อม</span></td>
                        </tr>
                    `).join('');
                }

                if (previewArea) previewArea.classList.remove('hidden');
                if (importBtn) importBtn.disabled = false;
            } else {
                Swal.fire('ไม่มีข้อมูลที่ถูกต้อง', 'กรุณาตรวจสอบข้อผิดพลาดด้านล่างและแก้ไขไฟล์', 'warning');
            }

        } catch (err) {
            console.error('previewImportData error:', err);
            Swal.fire('อ่านไฟล์ล้มเหลว', 'ไฟล์อาจเสียหายหรือรูปแบบไม่ถูกต้อง: ' + err.message, 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

/**
 * นำเข้าข้อมูลจาก importRows เข้า Supabase
 */
async function processImport() {
    if (!canManagePortfolioSettings()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้น', 'error');
        return;
    }

    if (!importRows.length) {
        Swal.fire('ไม่มีข้อมูล', 'กรุณาเลือกไฟล์และตรวจสอบข้อมูลก่อน', 'warning');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: `ยืนยันการนำเข้า ${importRows.length} แถว?`,
        html: 'ข้อมูลจะถูกเพิ่มเข้าระบบทันที<br><small class="text-gray-500">ข้อมูลที่มีอยู่แล้วจะไม่ถูกลบ</small>',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'นำเข้าข้อมูล',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: `กำลังนำเข้า ${importRows.length} รายการ...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // Insert เป็น batch สูงสุด 500 แถวต่อครั้ง เพื่อหลีกเลี่ยง payload limit
        const BATCH_SIZE = 500;
        let totalInserted = 0;
        const insertErrors = [];

        for (let i = 0; i < importRows.length; i += BATCH_SIZE) {
            const batch = importRows.slice(i, i + BATCH_SIZE);
            const { data, error } = await db
                .from('portfolio_entries')
                .insert(batch)
                .select('id');

            if (error) {
                insertErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
            } else {
                totalInserted += data?.length || 0;
            }
        }

        await logUserAction(`นำเข้าข้อมูล Portfolio ${totalInserted} รายการ`, 'portfolio');

        closeImportModal();
        await loadInitialData();

        if (insertErrors.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: `นำเข้าสำเร็จ ${totalInserted} รายการ`,
                html: `มีข้อผิดพลาด ${insertErrors.length} batch:<br><small>${insertErrors.join('<br>')}</small>`
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: `นำเข้าสำเร็จ ${totalInserted} รายการ`,
                timer: 2000,
                showConfirmButton: false
            });
        }

    } catch (err) {
        console.error('processImport error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 12. ประกาศฟังก์ชัน Global
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
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.downloadImportTemplate = downloadImportTemplate;
window.previewImportData = previewImportData;
window.processImport = processImport;
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
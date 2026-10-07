// ==========================================================================
// sarabun.js — ระบบสารบรรณ (Optimized)
// - ใช้ $(document).ready + Promise.all + fire-and-forget
// - Dashboard Stats ผ่าน RPC + sessionStorage cache
// - Settings cache 10 นาที
// - Lazy Load DataTables (teacher/admin)
// - count: 'estimated' เพื่อความเร็ว
// ==========================================================================

// ==========================================
// State
// ==========================================
let currentUser = null;
let currentProfile = null;
let userRole = null;
let isSarabunAdmin = false;
let isAdminMode = false;
let systemSettings = {};
let settingsCache = null;
let appointTomSelect = null;
let teacherTable = null;
let adminTable = null;

// ==========================================
// ⚡ INIT
// ==========================================
$(document).ready(async () => {
    const t0 = performance.now();
    console.time('⏱️ Sarabun โหลด');

    try {
        // 1. Auth ก่อน (ต้องรู้ role)
        await checkAuth();
        console.log(`✅ Auth: ${Math.round(performance.now() - t0)} ms`);

        // 2. โชว์ UI ทันที — ไม่รอ data
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
        console.log(`👁️ UI แสดง: ${Math.round(performance.now() - t0)} ms`);

        // 3. Fire-and-forget: Settings + Stats (มี cache)
        loadSettings();
        loadDashboardStats();

        // 4. Init DataTable teacher (fire-and-forget)
        setTimeout(() => {
            initUIComponents();
            loadDocuments('teacher');
            console.log(`📊 DataTable init: ${Math.round(performance.now() - t0)} ms`);
        }, 0);

        // 5. Log (fire-and-forget)
        logUserAction('เข้าสู่ระบบสารบรรณ', 'sarabun');

        console.timeEnd('⏱️ Sarabun โหลด');
        console.log(`⚡ Total (UI ready): ${Math.round(performance.now() - t0)} ms`);

    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// ✅ ปุ่มนำทาง — sarabun
// ==========================================
window.refreshNavButtons = function () {
    const toggleBtn = document.getElementById('btnToggleMode');
    if (!toggleBtn) return;

    if (isAdminMode) {
        toggleBtn.classList.remove('hidden');
        toggleBtn.classList.add('flex');
        if (typeof updateToggleModeUI === 'function') {
            updateToggleModeUI(userRole, isAdminMode, 'btnToggleMode');
        }
    } else {
        toggleBtn.classList.add('hidden');
        toggleBtn.classList.remove('flex');
    }
};

// ==========================================
// 1. Auth
// ==========================================
async function checkAuth() {
    try {
        const result = await checkSessionAndRole('sarabun', WRK_ROLES.ALLOWED);
        if (!result) return;

        currentUser = result.user;
        currentProfile = result.personnel;
        userRole = currentProfile.role;

        // ✅ FIX: Expose to window for topbar re-render
        window.currentUser = currentUser;
        window.currentProfile = currentProfile;
        window.currentUserRole = userRole;

        // UI มาตรฐานจาก dashboard_ui.js
        setUserDisplayName(currentProfile);
        renderUserAvatar(currentProfile);

        const recorderDisplay = document.getElementById('recorder_name_display');
        if (recorderDisplay) {
            recorderDisplay.innerText = `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;
        }

        // ตรวจสอบสิทธิ์
        const isGlobalAdmin = isAdminUser(userRole, false);
        let isModuleAdmin = false;
        if (!isGlobalAdmin) {
            isModuleAdmin = await hasModuleAccess(userRole, 'sarabun', currentUser.id);
        }

        const isOffice = isOfficeUser(userRole);
        isSarabunAdmin = isModuleAdmin || isGlobalAdmin;
        isAdminMode = isSarabunAdmin;

        // ปุ่ม Settings (sidebar)
        if (canManageSettings(userRole)) {
            $('#btn-settings').removeClass('hidden');
        }

        // ปุ่ม Toggle Mode (topbar)
        const toggleBtn = document.getElementById('btnToggleMode');
        if (toggleBtn && isAdminMode) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
            updateToggleModeUI(userRole, isAdminMode, 'btnToggleMode');
        }

        // Sidebar nav
        if (isAdminMode) {
            $('#nav-admin-view').removeClass('hidden');
            $('#nav-new-doc').removeClass('hidden');
        }

        // Role label
        let roleText = 'Teacher';
        if (isOffice) roleText = 'เจ้าหน้าที่สำนักงาน';
        else if (isAdminMode) {
            if (userRole === 'super_admin') roleText = 'Super Admin';
            else if (userRole === 'admin') roleText = 'Admin';
            else if (userRole === 'director') roleText = 'ผู้อำนวยการ';
            else if (userRole === 'deputy') roleText = 'รองผู้อำนวยการ';
            else if (isModuleAdmin) roleText = 'Sarabun Admin';
        }
        updateUserRoleLabel(roleText);

        updatePageTitle('teacherView');

    } catch (error) {
        console.error('❌ checkAuth error:', error);
        Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    }
}

// ==========================================
// 2. Logout
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
        try { sessionStorage.clear(); } catch (e) {}
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}

// ==========================================
// 3. Toggle Role View
// ==========================================
async function toggleRoleView() {
    const isAdmin = isAdminUser(userRole, false) || isSarabunAdmin;
    if (!isAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ใช่ผู้ดูแลระบบ', 'warning');
        return;
    }

    isAdminMode = !isAdminMode;
    updateToggleModeUI(userRole, isAdminMode, 'btnToggleMode');

    // Sidebar nav
    if (isAdminMode) {
        $('#nav-admin-view').removeClass('hidden');
        $('#nav-new-doc').removeClass('hidden');
    } else {
        $('#nav-admin-view').addClass('hidden');
        $('#nav-new-doc').addClass('hidden');
        if ($('#adminView').hasClass('block')) {
            switchSidebarView('teacherView');
        }
    }

    if (teacherTable) teacherTable.ajax.reload(null, false);
    if (adminTable) adminTable.ajax.reload(null, false);

    logUserAction(`สลับโหมดเป็น ${isAdminMode ? 'Admin' : 'Teacher'}`, 'sarabun');

    Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: 'info',
        title: isAdminMode ? 'เปลี่ยนเป็นโหมด Admin' : 'เปลี่ยนเป็นโหมดครู',
        showConfirmButton: false,
        timer: 2000
    });
}

// ==========================================
// 4. Sidebar Navigation
// ==========================================
window.switchSidebarView = function (viewId, panel = null) {
    if (viewId === 'adminView' && !isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }

    // ✅ Sidebar active (ใช้ฟังก์ชันจาก dashboard_sidebar.js)
    let activeId = 'nav-teacher-view';
    if (viewId === 'teacherView') activeId = 'nav-teacher-view';
    else if (panel === 'form') activeId = 'nav-new-doc';
    else activeId = 'nav-admin-view';

    if (typeof setActiveNavItem === 'function') {
        setActiveNavItem(activeId);
    }

    // Tab content
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('block');
        el.classList.add('hidden');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }

    // Admin panel + Lazy load
    if (viewId === 'adminView') {
        if (panel === 'form') {
            document.getElementById('adminTablePanel').classList.add('hidden');
            document.getElementById('adminFormPanel').classList.remove('hidden');
        } else {
            document.getElementById('adminTablePanel').classList.remove('hidden');
            document.getElementById('adminFormPanel').classList.add('hidden');
            if (!adminTable) {
                _initAdminTable();
            } else {
                setTimeout(() => adminTable.ajax.reload(null, false), 50);
            }
        }
    }

    updatePageTitle(viewId, panel);
    if (window.innerWidth < 761) toggleSidebar(false);
};

function updatePageTitle(viewId, panel = null) {
    const titles = {
        'teacherView': 'ทะเบียนหนังสือรับ',
        'adminView': panel === 'form' ? 'ลงรับหนังสือใหม่' : 'จัดการหนังสือ'
    };
    const title = titles[viewId] || 'ระบบสารบรรณ';
    const el = document.getElementById('pageTitle');
    if (el) el.textContent = title;
}

// ==========================================
// 5. UI Components
// ==========================================
function initUIComponents() {
    // TomSelect Single
    document.querySelectorAll('.tom-select-single').forEach(el => {
        if (el.id === 'doc_speed' || el.id === 'doc_secret' ||
            el.id === 'edit_speed_level' || el.id === 'edit_secret_level') {
            return;
        }
        if (el.tomselect) el.tomselect.destroy();
        new TomSelect(el, {
            create: true,
            dropdownParent: 'body',
            plugins: ['clear_button']
        });
    });

    // TomSelect Multi
    document.querySelectorAll('.tom-select-multi').forEach(el => {
        if (el.tomselect) el.tomselect.destroy();
        new TomSelect(el, {
            plugins: ['remove_button'],
            dropdownParent: 'body',
            create: function (input, callback) {
                if (input && input.trim().length > 0) {
                    callback({ value: input.trim(), text: input.trim() });
                } else {
                    callback(null);
                }
            },
            createFilter: null,
            persist: true,
            delimiter: ',',
            createOnBlur: true,
            maxItems: null,
            placeholder: 'พิมพ์และกด Enter หรือ , เพื่อเพิ่ม...'
        });
    });

    flatpickr(".thai-datepicker", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d F Y"
    });
}

// ==========================================
// 6. Helpers
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function compressImage(file, maxSizeMB = 2) {
    if (!file.type.startsWith('image/')) return file;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let width = img.width, height = img.height;
                const MAX_WIDTH = 2000, MAX_HEIGHT = 2000;
                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
        };
        reader.onerror = error => reject(error);
    });
}

// ==========================================
// 7. Submit Document
// ==========================================
async function submitDocument(e) {
    e.preventDefault();

    if (!isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถบันทึกหนังสือได้', 'warning');
        return;
    }

    const receiveDate = document.getElementById('doc_receive_date').value;
    const docDate = document.getElementById('doc_date').value;

    if (!receiveDate || !docDate) {
        Swal.fire('กรุณากรอกวันที่', 'ต้องระบุทั้ง "วันที่ลงรับ" และ "วันที่บนหนังสือ"', 'warning');
        return;
    }

    if (isNaN(new Date(receiveDate).getTime()) || isNaN(new Date(docDate).getTime())) {
        Swal.fire('รูปแบบวันที่ไม่ถูกต้อง', 'กรุณาเลือกวันที่ที่ถูกต้องจากปฎิทิน', 'warning');
        return;
    }

    const fileInput = document.getElementById('doc_file');
    let fileUrl = null;
    const speedLevel = document.getElementById('doc_speed').value;
    const secretLevel = document.getElementById('doc_secret').value;

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                file = await compressImage(file);
            }
            fileUrl = await uploadToGAS(file);
        }

        const relatedSelectEl = document.getElementById('doc_related');
        const relatedTomSelect = relatedSelectEl && relatedSelectEl.tomselect;
        const relatedDepts = relatedTomSelect ? relatedTomSelect.getValue() : [];

        const docData = {
            receive_number: document.getElementById('doc_receive_number').value,
            receive_date: document.getElementById('doc_receive_date').value,
            speed_level: speedLevel,
            secret_level: secretLevel,
            doc_number: document.getElementById('doc_number').value,
            doc_date: document.getElementById('doc_date').value,
            doc_from: document.getElementById('doc_from').value,
            doc_to: document.getElementById('doc_to').value,
            doc_subject: document.getElementById('doc_subject').value,
            doc_action: document.getElementById('doc_action').value,
            related_depts: JSON.stringify(relatedDepts),
            file_url: fileUrl,
            recorder_id: currentUser.id
        };

        const { error } = await db.from('module_sarabun_docs').insert([docData]);
        if (error) {
            console.error('Insert error:', error);
            Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
            return;
        }

        logUserAction(`บันทึกหนังสือรับ เรื่อง: ${docData.doc_subject}`, 'sarabun');

        // ✅ Fire-and-forget: Telegram
        if (systemSettings.telegram_token && systemSettings.telegram_chat_id) {
            const telegramData = {
                ...docData,
                receive_date: formatThaiDate(docData.receive_date),
                recorder_name: `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`
            };
            sendTelegram(telegramData);   // ไม่ await
        }

        // ✅ Reset cache + stats
        clearStatsCache();

        Swal.fire('สำเร็จ', 'บันทึกหนังสือรับเข้าระบบเรียบร้อย', 'success').then(() => {
            document.getElementById('sarabunForm').reset();
            document.getElementById('doc_speed').value = 'ปกติ';
            document.getElementById('doc_secret').value = 'ปกติ';
            document.getElementById('doc_action').value = 'มอบหมาย';
            const relatedSelect = document.getElementById('doc_related');
            if (relatedSelect && relatedSelect.tomselect) {
                relatedSelect.tomselect.clear();
            }
            toggleAdminPanel('table');
            if (teacherTable) teacherTable.ajax.reload(null, false);
            if (adminTable) adminTable.ajax.reload(null, false);
            loadDashboardStats();
        });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function uploadToGAS(file) {
    if (!systemSettings.gas_api_url) throw new Error('ยังไม่ได้ตั้งค่า GAS API URL');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            try {
                const response = await fetch(systemSettings.gas_api_url, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'upload',
                        fileName: file.name,
                        mimeType: file.type,
                        folderId: systemSettings.gas_folder_id,
                        base64: base64Data
                    })
                });
                const result = await response.json();
                if (result.status === 'success' && result.url) resolve(result.url);
                else reject(new Error(result.message || 'อัปโหลดไม่สำเร็จ'));
            } catch (err) { reject(err); }
        };
    });
}

// ==========================================
// 8. Load Documents (Lazy Load)
// ==========================================
function loadDocuments(which = 'both') {
    if (which === 'teacher' || which === 'both') _initTeacherTable();
    if ((which === 'admin' || which === 'both') && isAdminMode && !adminTable) {
        _initAdminTable();
    }
}

function _initTeacherTable() {
    if ($.fn.DataTable.isDataTable('#teacherDocsTable')) return;

    teacherTable = $('#teacherDocsTable').DataTable({
        responsive: true,
        processing: true,
        serverSide: true,
        deferRender: true,
        ajax: (dtParams, callback) => loadTableDataServerSide(dtParams, callback, 'teacher'),
        columns: [
            { data: 'receive_date', render: (d) => formatThaiDate(d), className: 'whitespace-nowrap' },
            { data: 'receive_number', className: 'whitespace-nowrap' },
            { data: 'doc_number', className: 'whitespace-nowrap' },
            {
                data: 'doc_subject', render: (d) => {
                    if (!d) return '-';
                    return d.length > 40
                        ? `<span title="${escapeHtml(d)}">${escapeHtml(d.substring(0, 40))}...</span>`
                        : escapeHtml(d);
                }, className: 'max-w-[200px] truncate'
            },
            {
                data: 'speed_level', render: (d) => {
                    const color = d && d.includes('ด่วน') ? 'red' : 'green';
                    return `<span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-lg text-[11px] font-bold border border-${color}-200 whitespace-nowrap">${escapeHtml(d || 'ปกติ')}</span>`;
                }, className: 'whitespace-nowrap'
            },
            {
                data: 'secret_level', render: (d) => {
                    const color = d && (d === 'ลับ' || d === 'ลับมาก' || d === 'ลับที่สุด') ? 'purple' : 'gray';
                    return `<span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-lg text-[11px] font-bold border border-${color}-200 whitespace-nowrap">${escapeHtml(d || 'ปกติ')}</span>`;
                }, className: 'whitespace-nowrap'
            },
            {
                data: 'id', orderable: false, render: (id) =>
                    `<button onclick="viewDoc('${id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-sm text-xs font-bold transition whitespace-nowrap">
                        <i class="fa-solid fa-eye mr-1 text-slate-500"></i> ดู
                    </button>`, className: 'whitespace-nowrap'
            }
        ],
        order: [[0, 'desc'], [1, 'desc']],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

function _initAdminTable() {
    if ($.fn.DataTable.isDataTable('#adminDocsTable')) return;

    adminTable = $('#adminDocsTable').DataTable({
        responsive: true,
        processing: true,
        serverSide: true,
        deferRender: true,
        ajax: (dtParams, callback) => loadTableDataServerSide(dtParams, callback, 'admin'),
        columns: [
            { data: 'receive_date', render: (d) => formatThaiDate(d), className: 'whitespace-nowrap' },
            { data: 'receive_number', className: 'whitespace-nowrap' },
            {
                data: 'doc_subject', render: (d) => {
                    if (!d) return '-';
                    return d.length > 40
                        ? `<span title="${escapeHtml(d)}">${escapeHtml(d.substring(0, 40))}...</span>`
                        : escapeHtml(d);
                }, className: 'max-w-[200px] truncate'
            },
            {
                data: 'speed_level', render: (d) => {
                    const color = d && d.includes('ด่วน') ? 'red' : 'green';
                    return `<span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-lg text-[11px] font-bold border border-${color}-200 whitespace-nowrap">${escapeHtml(d || 'ปกติ')}</span>`;
                }, className: 'whitespace-nowrap'
            },
            {
                data: 'secret_level', render: (d) => {
                    const color = d && (d === 'ลับ' || d === 'ลับมาก' || d === 'ลับที่สุด') ? 'purple' : 'gray';
                    return `<span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-lg text-[11px] font-bold border border-${color}-200 whitespace-nowrap">${escapeHtml(d || 'ปกติ')}</span>`;
                }, className: 'whitespace-nowrap'
            },
            { data: 'recorder_name', defaultContent: '-', className: 'whitespace-nowrap', orderable: false },
            {
                data: 'id', orderable: false,
                render: (id) => `
                    <div class="flex gap-1 justify-center flex-wrap">
                        <button onclick="viewDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="ดู"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="editDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="ลบ"><i class="fa-solid fa-trash"></i></button>
                    </div>`,
                className: 'whitespace-nowrap'
            }
        ],
        order: [[0, 'desc'], [1, 'desc']],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

// ==========================================
// 9. Dashboard Stats — RPC + Cache
// ==========================================
const _STATS_CACHE_KEY = 'sarabun_stats_cache';
const _STATS_TTL = 2 * 60 * 1000;

function _renderStats(s) {
    document.getElementById('stat-total').textContent = Number(s.total || 0).toLocaleString();
    document.getElementById('stat-urgent-most').textContent = Number(s.urgent_most || 0).toLocaleString();
    document.getElementById('stat-urgent').textContent = Number(s.urgent || 0).toLocaleString();
    document.getElementById('stat-normal').textContent = Number(s.normal || 0).toLocaleString();
    document.getElementById('stat-spm').textContent = Number(s.spm || 0).toLocaleString();
    document.getElementById('stat-other').textContent = Number(s.other || 0).toLocaleString();
}

function _readStatsCache() {
    try {
        const raw = sessionStorage.getItem(_STATS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.ts || Date.now() - parsed.ts > _STATS_TTL) return null;
        return parsed.data;
    } catch (e) { return null; }
}

function _writeStatsCache(data) {
    try {
        sessionStorage.setItem(_STATS_CACHE_KEY, JSON.stringify({
            ts: Date.now(), data
        }));
    } catch (e) {}
}

function clearStatsCache() {
    try { sessionStorage.removeItem(_STATS_CACHE_KEY); } catch (e) {}
}

async function loadDashboardStats() {
    const t0 = performance.now();

    const cached = _readStatsCache();
    if (cached) {
        _renderStats(cached);
        console.log(`⚡ Stats จาก cache ใน ${Math.round(performance.now() - t0)} ms`);
        return;
    }

    try {
        const { data, error } = await db.rpc('sarabun_stats');
        if (error) throw error;

        const stats = Array.isArray(data) ? data[0] : data;
        if (stats) {
            _renderStats(stats);
            _writeStatsCache(stats);
        }
        console.log(`✅ Stats RPC ใน ${Math.round(performance.now() - t0)} ms`);

    } catch (err) {
        console.warn('⚠️ RPC ไม่พร้อม → fallback:', err.message);
        await _loadStatsFallback();
    }
}

async function _loadStatsFallback() {
    try {
        const { data } = await db.from('module_sarabun_docs')
            .select('speed_level, doc_from')
            .limit(10000);
        if (!data) return;
        let urgentMost = 0, urgent = 0, normal = 0, spm = 0, other = 0;
        data.forEach(d => {
            const s = d.speed_level || 'ปกติ';
            if (s === 'ด่วนที่สุด') urgentMost++;
            else if (s === 'ด่วน') urgent++;
            else if (s === 'ปกติ') normal++;
            const from = (d.doc_from || '').toLowerCase();
            if (from.includes('สพม.นครปฐม') || from.includes('สพม นครปฐม')) spm++;
            else other++;
        });
        const stats = { total: data.length, urgent_most: urgentMost, urgent, normal, spm, other };
        _renderStats(stats);
        _writeStatsCache(stats);
    } catch (e) { console.error(e); }
}

// ==========================================
// 10. Server-side Load — estimated count
// ==========================================
async function loadTableDataServerSide(dtParams, callback, tableType) {
    const { start, length, search, order, draw } = dtParams;

    try {
        let selectCols = 'id, receive_number, receive_date, doc_number, doc_subject, speed_level, secret_level, doc_from, doc_to, doc_action, related_depts, file_url, recorder_id';
        if (tableType === 'admin') {
            selectCols += ', core_personnel ( prefix, first_name, last_name )';
        }

        // ✅ estimated count → เร็วกว่า exact 10 เท่า
        let query = db.from('module_sarabun_docs').select(selectCols, { count: 'estimated' });

        if (search.value) {
            const term = `%${search.value}%`;
            query = query.or(
                `receive_number.ilike.${term},` +
                `doc_number.ilike.${term},` +
                `doc_subject.ilike.${term},` +
                `doc_from.ilike.${term}`
            );
        }

        if (order && order.length > 0) {
            const colMap = tableType === 'teacher'
                ? ['receive_date', 'receive_number', 'doc_number', 'doc_subject', 'speed_level', 'secret_level']
                : ['receive_date', 'receive_number', 'doc_subject', 'speed_level', 'secret_level'];
            for (const ord of order) {
                const colName = colMap[ord.column] || 'receive_date';
                query = query.order(colName, { ascending: ord.dir === 'asc' });
            }
        } else {
            query = query.order('receive_date', { ascending: false });
        }

        const { data, error, count } = await query.range(start, start + length - 1);

        if (error) throw error;

        const formattedData = (data || []).map(row => {
            const recorderName = row.core_personnel
                ? `${row.core_personnel.prefix || ''}${row.core_personnel.first_name} ${row.core_personnel.last_name}`
                : '-';
            return {
                id: row.id,
                receive_date: row.receive_date,
                receive_number: row.receive_number,
                doc_number: row.doc_number,
                doc_subject: row.doc_subject,
                speed_level: row.speed_level || 'ปกติ',
                secret_level: row.secret_level || 'ปกติ',
                doc_from: row.doc_from,
                doc_to: row.doc_to,
                doc_action: row.doc_action,
                related_depts: row.related_depts,
                file_url: row.file_url,
                recorder_name: recorderName
            };
        });

        callback({
            draw: draw,
            recordsTotal: count || 0,
            recordsFiltered: count || 0,
            data: formattedData
        });

    } catch (err) {
        console.error('Server-side error:', err);
        callback({ draw: dtParams.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
}

// ==========================================
// 11. View/Edit/Delete
// ==========================================
async function viewDoc(id) {
    const { data } = await db.from('module_sarabun_docs')
        .select('*, core_personnel(prefix, first_name, last_name)')
        .eq('id', id)
        .single();
    if (!data) return;

    let relatedArray = [];
    try {
        relatedArray = JSON.parse(data.related_depts || '[]');
    } catch (e) {
        relatedArray = [data.related_depts];
    }

    let html = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">เลขทะเบียนรับ</span> <strong class="text-blue-700 text-base">${escapeHtml(data.receive_number)}</strong></div>
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">วันที่ลงรับ</span> <strong class="text-slate-800">${escapeHtml(formatThaiDate(data.receive_date))}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ที่หนังสือ:</span> <strong class="text-slate-800">${escapeHtml(data.doc_number)}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ลงวันที่:</span> <strong class="text-slate-800">${escapeHtml(formatThaiDate(data.doc_date))}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">จาก:</span> <strong class="text-slate-800">${escapeHtml(data.doc_from)}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">เรื่อง:</span> <strong class="text-slate-800 text-base">${escapeHtml(data.doc_subject)}</strong></div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">กลุ่มที่เกี่ยวข้อง:</span> 
                <div class="flex flex-wrap gap-2">
                    ${relatedArray.map(r => `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg text-xs font-bold">${escapeHtml(r)}</span>`).join('')}
                </div>
            </div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">ผู้ลงรับ:</span> 
                <strong class="text-slate-800">${escapeHtml(data.core_personnel ? `${data.core_personnel.prefix || ''}${data.core_personnel.first_name} ${data.core_personnel.last_name}` : '-')}</strong>
            </div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">ชั้นความเร็ว:</span> <strong class="text-slate-800">${escapeHtml(data.speed_level || 'ปกติ')}</strong></div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">ชั้นความลับ:</span> <strong class="text-slate-800">${escapeHtml(data.secret_level || 'ปกติ')}</strong></div>
        </div>
    `;
    if (data.file_url) {
        html += `<div class="mt-6 pt-6 border-t border-slate-100"><a href="${escapeHtml(data.file_url)}" target="_blank" class="flex w-full items-center justify-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl shadow-md transition font-bold"><i class="fa-solid fa-file-pdf mr-2 text-xl"></i> เปิดดูไฟล์แนบ / ต้นฉบับ</a></div>`;
    }
    document.getElementById('docModalBody').innerHTML = html;
    const modal = document.getElementById('docDetailModal');
    const content = document.getElementById('docModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('docDetailModal');
    const content = document.getElementById('docModalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function editDoc(id) {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขหนังสือได้')) return;
    try {
        if (!isAdminMode) {
            Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขหนังสือได้', 'warning');
            return;
        }

        const { data, error } = await db.from('module_sarabun_docs').select('*').eq('id', id).single();
        if (error || !data) {
            Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลหนังสือ', 'error');
            return;
        }

        document.getElementById('edit_doc_id').value = data.id || '';
        document.getElementById('edit_receive_number').value = data.receive_number || '';
        document.getElementById('edit_doc_number').value = data.doc_number || '';
        document.getElementById('edit_doc_from').value = data.doc_from || '';
        document.getElementById('edit_doc_subject').value = data.doc_subject || '';
        document.getElementById('edit_doc_to').value = data.doc_to || 'ผู้อำนวยการโรงเรียน';
        document.getElementById('edit_speed_level').value = data.speed_level || 'ปกติ';
        document.getElementById('edit_secret_level').value = data.secret_level || 'ปกติ';

        const keepInput = document.getElementById('edit_file_url_keep');
        const currentWrap = document.getElementById('edit_current_file_wrap');
        const newWrap = document.getElementById('edit_new_file_wrap');
        const fileLink = document.getElementById('edit_current_file_link');
        const fileInput = document.getElementById('edit_doc_file');
        if (fileInput) fileInput.value = '';
        if (data.file_url) {
            keepInput.value = data.file_url;
            fileLink.href = data.file_url;
            try {
                const urlParts = data.file_url.split('/');
                fileLink.textContent = decodeURIComponent(urlParts[urlParts.length - 1]) || 'ดูไฟล์เดิม';
            } catch(e) { fileLink.textContent = 'ดูไฟล์เดิม'; }
            currentWrap.classList.remove('hidden');
            newWrap.classList.add('hidden');
        } else {
            keepInput.value = '';
            currentWrap.classList.add('hidden');
            newWrap.classList.remove('hidden');
        }

        const receiveDateFormatted = formatDateForInput(data.receive_date);
        const docDateFormatted = formatDateForInput(data.doc_date);
        document.getElementById('edit_receive_date').value = receiveDateFormatted;
        document.getElementById('edit_doc_date').value = docDateFormatted;

        const modal = document.getElementById('editDocModal');
        const content = document.getElementById('editModalContent');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);

        setTimeout(() => {
            try {
                const receiveInput = document.getElementById('edit_receive_date');
                const docInput = document.getElementById('edit_doc_date');

                if (receiveInput) {
                    if (receiveInput._flatpickr) receiveInput._flatpickr.destroy();
                    flatpickr(receiveInput, {
                        locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "d F Y",
                        defaultDate: receiveDateFormatted || null
                    });
                }
                if (docInput) {
                    if (docInput._flatpickr) docInput._flatpickr.destroy();
                    flatpickr(docInput, {
                        locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "d F Y",
                        defaultDate: docDateFormatted || null
                    });
                }

                const actionSelect = document.getElementById('edit_doc_action');
                if (actionSelect) {
                    if (actionSelect.tomselect) actionSelect.tomselect.destroy();
                    const ts = new TomSelect(actionSelect, { create: true, dropdownParent: 'body', plugins: ['clear_button'] });
                    ts.setValue(data.doc_action || 'มอบหมาย');
                }

                const relatedSelect = document.getElementById('edit_related_depts');
                if (relatedSelect) {
                    if (relatedSelect.tomselect) relatedSelect.tomselect.destroy();

                    let relatedDepts = [];
                    const raw = data.related_depts;
                    if (raw) {
                        try {
                            if (typeof raw === 'string') {
                                const trimmed = raw.trim();
                                if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                                    const parsed = JSON.parse(trimmed);
                                    if (Array.isArray(parsed)) relatedDepts = parsed;
                                    else if (typeof parsed === 'object') relatedDepts = Object.values(parsed);
                                } else {
                                    relatedDepts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
                                }
                            } else if (Array.isArray(raw)) relatedDepts = raw;
                            else if (typeof raw === 'object' && raw !== null) relatedDepts = Object.values(raw);
                        } catch (e) { relatedDepts = []; }
                    }
                    if (!Array.isArray(relatedDepts)) relatedDepts = [];
                    relatedDepts = relatedDepts.map(v => typeof v === 'string' ? v.trim() : String(v).trim()).filter(Boolean);

                    const defaultOptions = [
                        'เก็บเข้าแฟ้ม', 'ทุกกลุ่มสาระฯ', 'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์',
                        'เทคโนโลยี', 'สังคมศึกษาฯ', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
                        'ภาษาอังกฤษ', 'ภาษาจีน', 'IS', 'กิจกรรมพัฒนาผู้เรียน',
                        'งานทะเบียนนักเรียน', 'งานวัดผลและเทียบโอนความรู้', 'งานห้องสมุดและแหล่งเรียนรู้',
                        'งานแนะแนว', 'งานพัฒนาและใช้สื่อเทคโนโลยีเพื่อการศึกษา', 'งานจัดการเรียนรวม',
                        'งานบริหารหลักสูตรสถานศึกษา', 'งานห้องเรียนพิเศษ', 'งานห้องเรียนวิทยาศาสตร์พลังสิบ',
                        'งานสร้างเครือข่ายความร่วมมือทางวิชาการ', 'งานรับนักเรียน',
                        'งานส่งเสริมและประสานความร่วมมือทางวิชาการ', 'งานนิเทศการศึกษา',
                        'งานชมรม TO BE NUMBER ONE', 'งานธนาคารโรงเรียน',
                        'งานติดตามและประเมินผลการจัดการศึกษา', 'งานบริการสำเนาเอกสาร',
                        'สำนักงานกลุ่มบริหารวิชาการ'
                    ];

                    const allOptions = [...new Set([...defaultOptions, ...relatedDepts])];

                    relatedSelect.innerHTML = '';
                    allOptions.forEach(val => {
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.text = val;
                        if (relatedDepts.includes(val)) opt.selected = true;
                        relatedSelect.appendChild(opt);
                    });

                    const ts = new TomSelect(relatedSelect, {
                        plugins: ['remove_button'],
                        dropdownParent: 'body',
                        create: function (input, callback) {
                            if (input && input.trim().length > 0) {
                                callback({ value: input.trim(), text: input.trim() });
                            } else {
                                callback(null);
                            }
                        },
                        createFilter: null,
                        persist: true,
                        delimiter: ',',
                        createOnBlur: true,
                        maxItems: null,
                        placeholder: 'พิมพ์และกด Enter หรือ , เพื่อเพิ่ม...'
                    });

                    if (relatedDepts.length > 0) {
                        relatedDepts.forEach(val => {
                            if (!ts.options[val]) ts.addOption({ value: val, text: val });
                        });
                        ts.setValue(relatedDepts);
                        ts.refreshItems();
                    }
                }
            } catch (err) {
                console.error('❌ Error in UI setup:', err);
            }
        }, 300);

    } catch (err) {
        console.error('❌ Error in editDoc:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function clearEditFile() {
    document.getElementById('edit_file_url_keep').value = '';
    document.getElementById('edit_current_file_wrap').classList.add('hidden');
    document.getElementById('edit_new_file_wrap').classList.remove('hidden');
    document.getElementById('edit_doc_file').value = '';
}

function closeEditModal() {
    const modal = document.getElementById('editDocModal');
    const content = document.getElementById('editModalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function saveEditDoc(e) {
    e.preventDefault();
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขหนังสือได้')) return;

    const id = document.getElementById('edit_doc_id').value;
    if (!id) return Swal.fire('ผิดพลาด', 'ไม่พบ ID หนังสือ', 'error');

    const receiveDate = document.getElementById('edit_receive_date').value;
    const docDate = document.getElementById('edit_doc_date').value;

    if (!receiveDate || !docDate) {
        Swal.fire('กรุณากรอกวันที่', 'ต้องระบุทั้ง "วันที่ลงรับ" และ "วันที่บนหนังสือ"', 'warning');
        return;
    }
    if (isNaN(new Date(receiveDate).getTime()) || isNaN(new Date(docDate).getTime())) {
        Swal.fire('รูปแบบวันที่ไม่ถูกต้อง', 'กรุณาเลือกวันที่ที่ถูกต้องจากปฎิทิน', 'warning');
        return;
    }

    const receiveNumber = document.getElementById('edit_receive_number').value.trim();
    const docNumber = document.getElementById('edit_doc_number').value.trim();
    const docFrom = document.getElementById('edit_doc_from').value.trim();
    const docSubject = document.getElementById('edit_doc_subject').value.trim();
    const speedLevel = document.getElementById('edit_speed_level').value;
    const secretLevel = document.getElementById('edit_secret_level').value;
    const docAction = document.getElementById('edit_doc_action').value;
    const docTo = document.getElementById('edit_doc_to').value.trim();

    const relatedSelect = document.getElementById('edit_related_depts');
    const relatedDepts = relatedSelect && relatedSelect.tomselect
        ? relatedSelect.tomselect.getValue()
        : [];

    if (!receiveNumber || !docNumber || !docFrom || !docSubject) {
        return Swal.fire('กรุณากรอกข้อมูล', 'เลขทะเบียนรับ, ที่หนังสือ, จาก และเรื่อง เป็นข้อมูลจำเป็น', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกการแก้ไข...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const updateData = {
        receive_number: receiveNumber,
        receive_date: receiveDate,
        doc_number: docNumber,
        doc_date: docDate,
        doc_from: docFrom,
        doc_subject: docSubject,
        speed_level: speedLevel,
        secret_level: secretLevel,
        doc_action: docAction,
        doc_to: docTo,
        related_depts: JSON.stringify(relatedDepts)
    };

    try {
        const { error } = await db.from('module_sarabun_docs').update(updateData).eq('id', id);
        if (error) throw error;

        logUserAction(`แก้ไขหนังสือรับ ID: ${id}`, 'sarabun');
        Swal.fire('สำเร็จ', 'แก้ไขหนังสือเรียบร้อย', 'success');
        closeEditModal();
        if (teacherTable) teacherTable.ajax.reload(null, false);
        if (adminTable) adminTable.ajax.reload(null, false);
        clearStatsCache();
        loadDashboardStats();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function deleteDoc(id) {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบหนังสือได้')) return;

    Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "คุณต้องการลบหนังสือรับรายการนี้ใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ใช่, ลบเลย!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { error } = await db.from('module_sarabun_docs').delete().eq('id', id);
            if (error) Swal.fire('Error', error.message, 'error');
            else {
                logUserAction(`ลบหนังสือรับ ID: ${id}`, 'sarabun');
                Swal.fire('ลบแล้ว!', 'ลบหนังสือรับเรียบร้อย', 'success');
                if (teacherTable) teacherTable.ajax.reload(null, false);
                if (adminTable) adminTable.ajax.reload(null, false);
                clearStatsCache();
                loadDashboardStats();
            }
        }
    });
}

// ==========================================
// 12. Panel/Tab Switch (ใช้ sidebar)
// ==========================================
function toggleAdminPanel(panel) {
    if (panel === 'form') {
        switchSidebarView('adminView', 'form');
    } else {
        switchSidebarView('adminView', 'table');
    }
}

function switchTab(tabId) {
    if (tabId === 'teacherView') switchSidebarView('teacherView');
    else if (tabId === 'adminView') switchSidebarView('adminView');
}

// ==========================================
// 13. Settings Modal
// ==========================================
async function openSettingsModal() {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) return;
    await loadSettings(true);
    await loadTeachersForAppoint();
    await loadModuleAdmins();
    const modal = document.getElementById('adminSettingsModal');
    const content = document.getElementById('adminSettingsContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeSettingsModal() {
    const modal = document.getElementById('adminSettingsModal');
    const content = document.getElementById('adminSettingsContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// ==========================================
// 14. Settings — Cache 10 นาที
// ==========================================
const _SETTINGS_CACHE_KEY = 'sarabun_settings_cache';
const _SETTINGS_TTL = 10 * 60 * 1000;

function _readSettingsCache() {
    try {
        const raw = sessionStorage.getItem(_SETTINGS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.ts || Date.now() - parsed.ts > _SETTINGS_TTL) return null;
        return parsed.data;
    } catch (e) { return null; }
}

function _writeSettingsCache(data) {
    try {
        sessionStorage.setItem(_SETTINGS_CACHE_KEY, JSON.stringify({
            ts: Date.now(), data
        }));
    } catch (e) {}
}

function _fillSettingsForm(data) {
    const urlEl = document.getElementById('set_gas_url');
    if (urlEl) urlEl.value = data.gas_api_url || '';
    const folderEl = document.getElementById('set_folder_id');
    if (folderEl) folderEl.value = data.gas_folder_id || '';
    const tokenEl = document.getElementById('set_telegram_token');
    if (tokenEl) tokenEl.value = data.telegram_token || '';
    const chatEl = document.getElementById('set_telegram_chat');
    if (chatEl) chatEl.value = data.telegram_chat_id || '';
}

async function loadSettings(forceRefresh = false) {
    if (!forceRefresh && settingsCache) {
        systemSettings = settingsCache;
        _fillSettingsForm(settingsCache);
        return;
    }

    const cached = !forceRefresh ? _readSettingsCache() : null;
    if (cached) {
        systemSettings = cached;
        settingsCache = cached;
        _fillSettingsForm(cached);
        console.log('⚡ Settings จาก cache');
        return;
    }

    try {
        const { data, error } = await db.from('module_sarabun_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
        if (error) throw error;

        systemSettings = data || {};
        settingsCache = data || {};
        _writeSettingsCache(data || {});
        _fillSettingsForm(data || {});
    } catch (e) {
        console.error("System Error:", e);
        systemSettings = {};
        settingsCache = {};
    }
}

async function saveSettings() {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) return;

    const updates = {
        id: 1,
        gas_api_url: document.getElementById('set_gas_url').value,
        gas_folder_id: document.getElementById('set_folder_id').value,
        telegram_token: document.getElementById('set_telegram_token').value,
        telegram_chat_id: document.getElementById('set_telegram_chat').value
    };
    const { error } = await db.from('module_sarabun_settings').upsert(updates);
    if (error) return Swal.fire('Error', error.message, 'error');

    logUserAction('บันทึกการตั้งค่าระบบสารบรรณ', 'sarabun');

    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกการตั้งค่าระบบเรียบร้อย', timer: 1500, showConfirmButton: false });
    systemSettings = updates;
    settingsCache = updates;
    _writeSettingsCache(updates);
}

// ==========================================
// 15. Module Admin Management
// ==========================================
async function ensureModuleExists(moduleId) {
    const { data, error } = await db.from('core_system_modules')
        .select('module_id')
        .eq('module_id', moduleId)
        .maybeSingle();
    if (error) {
        console.error('Error checking module:', error);
        return false;
    }
    if (!data) {
        const { error: insertError } = await db.from('core_system_modules')
            .insert({
                module_id: moduleId,
                module_name: 'ระบบสารบรรณ',
                is_active: true,
                updated_at: new Date()
            });
        if (insertError) {
            console.error('Error inserting module:', insertError);
            return false;
        }
        return true;
    }
    return true;
}

async function loadTeachersForAppoint() {
    const { data: personnel } = await db.from('core_personnel')
        .select('id, first_name, last_name, prefix, role')
        .in('role', ['teacher', 'staff', 'office'])
        .order('first_name', { ascending: true });

    const { data: currentAdmins } = await db.from('core_module_admins')
        .select('user_id')
        .eq('module_id', 'sarabun');

    const adminIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];
    const available = personnel ? personnel.filter(p => !adminIds.includes(p.id)) : [];

    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาและเลือกรายชื่อ --</option>';
    available.forEach(p => {
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const roleLabel = p.role === 'office' ? ' [เจ้าหน้าที่]' : '';
        select.innerHTML += `<option value="${p.id}">${escapeHtml(fullName)}${roleLabel}</option>`;
    });

    if (appointTomSelect) appointTomSelect.destroy();
    appointTomSelect = new TomSelect(select, { create: false, sortField: { field: "text", direction: "asc" } });
}

async function loadModuleAdmins() {
    const { data, error } = await db.from('core_module_admins')
        .select('id, user_id')
        .eq('module_id', 'sarabun');

    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '';

    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบเพิ่มเติม</td></tr>';
        return;
    }

    const userIds = data.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, role')
        .in('id', userIds);

    const personnelMap = {};
    if (personnel) personnel.forEach(p => { personnelMap[p.id] = p; });

    data.forEach(admin => {
        const person = personnelMap[admin.user_id] || {};
        const fullName = person.first_name ?
            `${person.prefix || ''}${escapeHtml(person.first_name)} ${escapeHtml(person.last_name)}` :
            `(id: ${admin.user_id})`;
        const isOfficePerson = person.role === 'office';
        const roleBadge = isOfficePerson
            ? `<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-100 text-teal-700 border border-teal-200">เจ้าหน้าที่</span>`
            : `<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700 border border-blue-200">ครู/บุคลากร</span>`;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2.5 px-4 font-bold text-slate-700">${fullName}${roleBadge}</td>
                <td class="py-2.5 px-4 text-center">
                    <button onclick="removeModuleAdmin('${admin.id}')" class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition flex items-center justify-center mx-auto" title="ถอดถอน">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

async function appointModuleAdmin() {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แต่งตั้งผู้ดูแลระบบได้')) return;

    const userId = appointTomSelect.getValue();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากรที่ต้องการแต่งตั้ง', 'warning');

    const moduleExists = await ensureModuleExists('sarabun');
    if (!moduleExists) {
        return Swal.fire('Error', 'ไม่สามารถตรวจสอบหรือเพิ่มโมดูลได้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
    }

    const { data: existing } = await db.from('core_module_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('module_id', 'sarabun')
        .maybeSingle();

    if (existing) {
        return Swal.fire('แจ้งเตือน', 'บุคลากรนี้เป็นผู้ดูแลระบบอยู่แล้ว', 'info');
    }

    const { error } = await db.from('core_module_admins')
        .insert([{ user_id: userId, module_id: 'sarabun' }]);

    if (error) {
        console.error('Insert error:', error);
        return Swal.fire('Error', error.message, 'error');
    }

    const { data: person } = await db.from('core_personnel')
        .select('prefix, first_name, last_name')
        .eq('id', userId)
        .single();
    const fullName = person ? `${person.prefix || ''}${person.first_name} ${person.last_name}` : userId;

    logUserAction(`แต่งตั้งผู้ดูแลระบบสารบรรณ: ${fullName}`, 'sarabun');

    Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
    await loadTeachersForAppoint();
    await loadModuleAdmins();
}

async function removeModuleAdmin(recordId) {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอดถอนผู้ดูแลระบบได้')) return;

    Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        text: "ผู้ใช้นี้จะหมดสิทธิ์ในการจัดการหนังสือรับทันที",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ถอดถอน'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { error } = await db.from('core_module_admins').delete().eq('id', recordId);
            if (error) return Swal.fire('Error', error.message, 'error');

            const row = document.querySelector(`button[onclick="removeModuleAdmin('${recordId}')"]`)?.closest('tr');
            const nameCell = row?.querySelector('td:first-child');
            const adminName = nameCell ? nameCell.textContent.trim() : recordId;

            logUserAction(`ถอดถอนผู้ดูแลระบบสารบรรณ: ${adminName}`, 'sarabun');

            Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadTeachersForAppoint();
            await loadModuleAdmins();
        }
    });
}

// ==========================================
// 16. Export Excel
// ==========================================
async function exportToExcel() {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ส่งออกข้อมูลได้')) return;

    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { data, error } = await db.from('module_sarabun_docs')
            .select('*, core_personnel(prefix, first_name, last_name)')
            .order('receive_date', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบหนังสือรับในระบบ', 'info');
            return;
        }

        const rows = data.map(d => ({
            'วันที่ลงรับ': formatThaiDate(d.receive_date),
            'เลขทะเบียนรับ': d.receive_number,
            'ที่หนังสือ': d.doc_number,
            'ลงวันที่': formatThaiDate(d.doc_date),
            'จาก': d.doc_from,
            'ถึง': d.doc_to,
            'เรื่อง': d.doc_subject,
            'ชั้นความเร็ว': d.speed_level || 'ปกติ',
            'ชั้นความลับ': d.secret_level || 'ปกติ',
            'การดำเนินการ': d.doc_action,
            'ผู้ลงรับ': `${d.core_personnel.prefix || ''}${d.core_personnel.first_name} ${d.core_personnel.last_name}`,
            'กลุ่มที่เกี่ยวข้อง': d.related_depts ? JSON.parse(d.related_depts).join(', ') : '',
            'ไฟล์แนบ': d.file_url || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
            { wch: 30 }, { wch: 20 }, { wch: 40 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'หนังสือรับ');
        XLSX.writeFile(wb, `หนังสือรับ_${new Date().toISOString().slice(0, 10)}.xlsx`);

        logUserAction('ส่งออกข้อมูลหนังสือรับ (Excel)', 'sarabun');

        Swal.close();
        Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 17. Import Excel
// ==========================================
async function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้')) {
        event.target.value = '';
        return;
    }

    const confirm = await Swal.fire({
        title: 'ยืนยันการนำเข้า?',
        html: `<p class="text-sm">คุณต้องการนำเข้าข้อมูลจากไฟล์ <b>${escapeHtml(file.name)}</b> ใช่หรือไม่?</p>
               <p class="text-xs text-amber-600 mt-2">⚠️ ระบบจะเพิ่มข้อมูลใหม่เท่านั้น ไม่มีการอัปเดตข้อมูลเดิม</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'นำเข้าเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirm.isConfirmed) {
        event.target.value = '';
        return;
    }

    Swal.fire({ title: 'กำลังอ่านไฟล์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);

            if (!rows || rows.length === 0) {
                Swal.fire('ไฟล์ว่าง', 'ไม่พบข้อมูลในไฟล์ Excel', 'warning');
                event.target.value = '';
                return;
            }

            const { data: personnelList, error: personnelErr } = await db.from('core_personnel')
                .select('id, prefix, first_name, last_name')
                .order('first_name', { ascending: true });
            if (personnelErr) console.warn('ไม่สามารถโหลดรายชื่อบุคลากรเพื่อ map ผู้ลงรับ', personnelErr);

            const nameToId = {};
            if (personnelList) {
                personnelList.forEach(p => {
                    const fullName = `${p.first_name} ${p.last_name}`.trim();
                    const fullNameWithPrefix = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                    nameToId[fullName] = p.id;
                    nameToId[fullNameWithPrefix] = p.id;
                });
            }

            let success = 0, fail = 0, errors = [];

            for (const row of rows) {
                try {
                    if (!row['เลขทะเบียนรับ'] || !row['ที่หนังสือ'] || !row['จาก'] || !row['เรื่อง']) {
                        fail++;
                        errors.push(`ขาดข้อมูล: ${row['เลขทะเบียนรับ'] || '(ไม่ระบุ)'}`);
                        continue;
                    }

                    const receiveDate = parseThaiDate(row['วันที่ลงรับ']) || new Date().toISOString().slice(0, 10);
                    const docDate = parseThaiDate(row['ลงวันที่']) || new Date().toISOString().slice(0, 10);

                    let relatedDepts = [];
                    if (row['กลุ่มที่เกี่ยวข้อง']) {
                        if (typeof row['กลุ่มที่เกี่ยวข้อง'] === 'string') {
                            relatedDepts = row['กลุ่มที่เกี่ยวข้อง'].split(',').map(s => s.trim()).filter(Boolean);
                        } else {
                            relatedDepts = [String(row['กลุ่มที่เกี่ยวข้อง'])];
                        }
                    }

                    let recorderId = currentUser.id;
                    let recorderName = row['ผู้ลงรับ'] || row['ผู้บันทึก'] || row['บันทึกโดย'] || row['recorder'] || '';
                    let recorderFound = false;
                    if (recorderName && typeof recorderName === 'string' && recorderName.trim() !== '') {
                        const trimmedName = recorderName.trim();
                        if (nameToId[trimmedName]) {
                            recorderId = nameToId[trimmedName];
                            recorderFound = true;
                        } else {
                            const parts = trimmedName.split(/\s+/);
                            if (parts.length >= 2) {
                                const firstName = parts[0];
                                const lastName = parts.slice(1).join(' ');
                                const fullNameNoPrefix = `${firstName} ${lastName}`;
                                if (nameToId[fullNameNoPrefix]) {
                                    recorderId = nameToId[fullNameNoPrefix];
                                    recorderFound = true;
                                }
                            }
                        }
                    }

                    const docData = {
                        receive_number: String(row['เลขทะเบียนรับ']).trim(),
                        receive_date: receiveDate,
                        speed_level: row['ชั้นความเร็ว'] || 'ปกติ',
                        secret_level: row['ชั้นความลับ'] || 'ปกติ',
                        doc_number: String(row['ที่หนังสือ']).trim(),
                        doc_date: docDate,
                        doc_from: String(row['จาก']).trim(),
                        doc_to: row['ถึง'] || 'ผู้อำนวยการโรงเรียน',
                        doc_subject: String(row['เรื่อง']).trim(),
                        doc_action: row['การดำเนินการ'] || 'มอบหมาย',
                        related_depts: JSON.stringify(relatedDepts),
                        file_url: row['ไฟล์แนบ'] || null,
                        recorder_id: recorderId
                    };

                    const { error } = await db.from('module_sarabun_docs').insert([docData]);
                    if (error) {
                        fail++;
                        errors.push(`ID: ${docData.receive_number} - ${error.message}`);
                    } else {
                        success++;
                    }
                } catch (err) {
                    fail++;
                    errors.push(`แถว: ${row['เลขทะเบียนรับ'] || '(ไม่ระบุ)'} - ${err.message}`);
                }
            }

            event.target.value = '';

            logUserAction(`นำเข้าข้อมูลหนังสือรับ (สำเร็จ ${success}, ล้มเหลว ${fail})`, 'sarabun');

            let msg = `✅ นำเข้าสำเร็จ ${success} รายการ`;
            if (fail > 0) {
                msg += `\n❌ ล้มเหลว ${fail} รายการ`;
                if (errors.length <= 10) msg += `\n\n${errors.join('\n')}`;
                else msg += `\n\n${errors.slice(0, 10).join('\n')}\n... และอีก ${errors.length - 10} รายการ`;
            }

            Swal.fire({
                icon: fail === 0 ? 'success' : 'warning',
                title: 'ผลการนำเข้า',
                text: msg,
                confirmButtonText: 'ตกลง'
            });

            if (teacherTable) teacherTable.ajax.reload(null, false);
            if (adminTable) adminTable.ajax.reload(null, false);
            clearStatsCache();
            loadDashboardStats();

        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 18. Helpers (Date)
// ==========================================
function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
}

function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseThaiDate(thaiDateStr) {
    if (!thaiDateStr) return null;
    const str = String(thaiDateStr).trim();
    if (str === '') return null;

    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    let day, month, year;
    let parts = str.split(' ');
    if (parts.length === 3) {
        day = parseInt(parts[0]);
        month = months.indexOf(parts[1]);
        if (month === -1) {
            const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            month = shortMonths.indexOf(parts[1]);
        }
        year = parseInt(parts[2]);
        if (year > 2500) year -= 543;
        if (!isNaN(day) && month !== -1 && !isNaN(year)) {
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        let y = parseInt(isoMatch[1]);
        const m = parseInt(isoMatch[2]);
        const d = parseInt(isoMatch[3]);
        if (y > 2500) y -= 543;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return null;
}

// ==========================================
// 19. Telegram
// ==========================================
async function sendTelegram(docData) {
    if (!systemSettings.telegram_token || !systemSettings.telegram_chat_id) return;
    if (!systemSettings.gas_api_url) return;

    try {
        const response = await fetch(systemSettings.gas_api_url, {
            method: 'POST',
            body: JSON.stringify({
                action: 'notify_telegram',
                token: systemSettings.telegram_token,
                chatId: systemSettings.telegram_chat_id,
                webUrl: window.location.href,
                doc: docData
            })
        });
        const text = await response.text();
        try {
            const result = JSON.parse(text);
            if (result.status === 'success') console.log('✅ Telegram ส่งสำเร็จ');
            else console.error('❌ Telegram error:', result.message);
        } catch (e) {
            console.error('❌ GAS ตอบกลับไม่ใช่ JSON:', text);
        }
    } catch (err) {
        console.error('❌ Fetch error:', err);
    }
}

// ==========================================
// 20. Expose global
// ==========================================
window.logout = logout;
window.toggleRoleView = toggleRoleView;
window.switchTab = switchTab;
window.toggleAdminPanel = toggleAdminPanel;
window.viewDoc = viewDoc;
window.closeModal = closeModal;
window.editDoc = editDoc;
window.clearEditFile = clearEditFile;
window.closeEditModal = closeEditModal;
window.saveEditDoc = saveEditDoc;
window.deleteDoc = deleteDoc;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.appointModuleAdmin = appointModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.submitDocument = submitDocument;
window.exportToExcel = exportToExcel;
window.importFromExcel = importFromExcel;
window.loadDashboardStats = loadDashboardStats;
window.switchSidebarView = switchSidebarView;

console.log('✅ sarabun.js loaded (Optimized)');
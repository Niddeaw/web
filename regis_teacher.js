// regis_teacher.js - ระบบบริหารงานทะเบียน (Admin) ใช้ config.js มาตรฐาน
// สิทธิ์: super_admin, admin, director, deputy, office เท่านั้น
// teacher, staff ถูกปฏิเสธ (alert + redirect index.html)

let tableInstance = null;
let allRequests = [];
let sysSettings = null;
let currentUser = null;
let currentProfile = null;
let currentUserRole = null;
let isAdminMode = false;
let isModuleAdmin = false;

// ==========================================
// INIT
// ==========================================
window.onload = async () => {
    try {
        await checkAuth();
    } catch (error) {
        console.error('❌ Unhandled error:', error);
        alert('เกิดข้อผิดพลาดร้ายแรง: ' + error.message);
        window.location.href = 'index.html';
    }
};

// ==========================================
// ตรวจสอบสิทธิ์ (ใช้ config.js)
// ==========================================
async function checkAuth() {
    console.log('🔍 checkAuth เริ่มทำงาน');

    try {
        // ตรวจสอบว่า Swal โหลดแล้ว
        if (typeof Swal === 'undefined') {
            console.error('❌ SweetAlert2 (Swal) ไม่ถูกโหลด');
            alert('เกิดข้อผิดพลาด: SweetAlert2 ไม่ถูกโหลด กรุณาติดต่อผู้ดูแลระบบ');
            window.location.replace('index.html');
            return;
        }

        // ✅ ส่ง allowedRoles ที่ถูกต้องเข้าไปเลย — checkSessionAndRole จะ block teacher/staff เอง
        //    ไม่ต้องเช็คซ้ำอีกรอบหลัง return
        const allowedRolesForThisModule = ['super_admin', 'admin', 'director', 'deputy', 'office'];
        const result = await window.checkSessionAndRole('ระบบงานทะเบียน', allowedRolesForThisModule);
        if (!result) {
            // null = ไม่มี session (→ login.html) หรือ role ไม่ผ่าน (→ Swal + index.html)
            // config.js จัดการทั้งหมดแล้ว หยุดทำงานได้เลย
            return;
        }

        const { user, personnel, role } = result;
        currentUser = user;
        currentProfile = personnel;
        currentUserRole = role;

        console.log('✅ User:', currentProfile.first_name, 'Role:', role);

        // 2. ตรวจสอบ admin mode
        isAdminMode = isAdminUser(role, false);

        // 4. ใช้ applyVisibilityByRole (ป้องกัน error)
        try {
            applyVisibilityByRole(role, isAdminMode, {
                settingsBtn: 'btnSettings',
                toggleBtn: null
            });
        } catch (e) {
            console.warn('⚠️ applyVisibilityByRole error:', e);
        }

        // 5. แสดงชื่อและสิทธิ์ (ป้องกัน error)
        try {
            updateUIRole();
        } catch (e) {
            console.warn('⚠️ updateUIRole error:', e);
        }

        // 6. บันทึก Log
        await logUserAction('เข้าสู่ระบบงานทะเบียน', 'regis');

        // 7. แสดงเนื้อหา
        const mainBody = document.getElementById('mainBody');
        if (mainBody) mainBody.classList.remove('hidden');

        // 8. โหลดข้อมูล
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
// แสดงชื่อผู้ใช้และสิทธิ์บน Navbar
// ==========================================
function updateUIRole() {
    if (!currentProfile) {
        console.warn('⚠️ updateUIRole: currentProfile is null');
        return;
    }

    // แสดงชื่อ
    const nameEl = document.getElementById('display-name');
    if (nameEl) {
        nameEl.textContent = `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;
    } else {
        console.warn('⚠️ ไม่พบ element #display-name');
    }

    // แสดงสิทธิ์
    const roleMap = {
        'super_admin': 'ผู้ดูแลระบบสูงสุด',
        'admin': 'ผู้ดูแลระบบ',
        'director': 'ผู้อำนวยการ',
        'deputy': 'รองผู้อำนวยการ',
        'office': 'เจ้าหน้าที่สำนักงาน'
    };

    const roleEl = document.getElementById('userRoleBadge');
    if (roleEl) {
        const roleText = roleMap[currentUserRole] || currentUserRole || 'ไม่ระบุ';
        roleEl.textContent = roleText;
        roleEl.className = `text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700`;
    } else {
        console.warn('⚠️ ไม่พบ element #userRoleBadge');
    }
}

// ==========================================
// LOGOUT (มาตรฐานกลาง)
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
// บันทึกการตั้งค่า (ใช้ requireAdmin)
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

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

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
}
function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// ==========================================
// โหลดข้อมูลคำขอ
// ==========================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { data, error } = await db.from('regis_requests')
            .select(`*, core_students(student_id_card, prefix, first_name, last_name, avatar_students_url, student_enrollments(core_classrooms(grade_level, room_number)))`)
            .order('created_at', { ascending: false });

        Swal.close();

        if (error) {
            console.error('loadData error:', error);
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้', 'error');
            return;
        }

        allRequests = data || [];
        updateDashboard();
        renderTable();

        if (allRequests.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่มีรายการคำขอ',
                timer: 2000,
                showConfirmButton: false
            });
        }

        console.log(`✅ โหลดข้อมูลสำเร็จ: ${allRequests.length} รายการ`);

    } catch (err) {
        Swal.close();
        console.error('loadData error:', err);
        Swal.fire('Error', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันอื่นๆ (เหมือนเดิม)
// ==========================================
function updateDashboard() {
    const total = allRequests.length;
    const pending = allRequests.filter(r => r.status === 'กำลังดำเนินการ').length;
    const completed = allRequests.filter(r => r.status === 'ดำเนินการเรียบร้อย').length;
    document.getElementById('dashTotal').innerText = total;
    document.getElementById('dashPending').innerText = pending;
    document.getElementById('dashCompleted').innerText = completed;
}

function renderTable() {
    if (tableInstance) tableInstance.destroy();

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (allRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-slate-400">
                    <i class="fa-solid fa-inbox text-3xl block mb-2"></i>
                    ยังไม่มีคำขอเอกสาร
                </td>
            </tr>
        `;
        tableInstance = $('#requestsTable').DataTable({
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
            dom: '<"flex flex-col md:flex-row justify-between items-center mb-4"Bf>rt<"flex justify-between items-center mt-4"ip>',
            buttons: [
                {
                    extend: 'excelHtml5',
                    text: '<i class="fa-solid fa-file-excel mr-1"></i> ปุ่มส่งออกไฟล์ Excel',
                    className: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-xl text-sm border-none shadow'
                }
            ]
        });
        return;
    }

    allRequests.forEach(req => {
        const std = req.core_students;
        let classStr = '-';
        if (std && std.student_enrollments && std.student_enrollments.length > 0) {
            const cls = std.student_enrollments[0].core_classrooms;
            classStr = `${cls.grade_level}/${cls.room_number}`;
        }

        const dateObj = new Date(req.created_at);
        const dateStr = dateObj.toLocaleDateString('th-TH');
        const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const badgeColor = req.status === 'กำลังดำเนินการ' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
        const timestamp = dateObj.getTime();

        const tr = `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-slate-700">
                <td class="px-4 py-3 font-mono text-xs">${req.id.substring(0, 8).toUpperCase()}</td>
                <td class="px-4 py-3" data-order="${timestamp}">${dateStr}</td>
                <td class="px-4 py-3 text-slate-400">${timeStr} น.</td>
                <td class="px-4 py-3">${std ? std.student_id_card : '-'}</td>
                <td class="px-4 py-3 font-medium">${std ? `${std.prefix || ''}${std.first_name} ${std.last_name} (${classStr})` : 'ไม่พบข้อมูล'}</td>
                <td class="px-4 py-3">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}">${req.status}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-3">
                        <button onclick="viewRequestDetail('${req.id}')" class="text-blue-500 hover:text-blue-700 transition" title="ดูรายละเอียดคำขอ">
                            <i class="fa-solid fa-eye text-lg"></i>
                        </button>
                        ${req.status === 'กำลังดำเนินการ' ?
                          `<button onclick="approveRequest('${req.id}')" class="text-emerald-500 hover:text-emerald-700 transition" title="ปรับสถานะเรียบร้อย">
                              <i class="fa-solid fa-circle-check text-lg"></i>
                          </button>` : ''}
                        <button onclick="deleteRequest('${req.id}')" class="text-red-400 hover:text-red-600 transition" title="ลบข้อมูล">
                            <i class="fa-solid fa-trash text-lg"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', tr);
    });

    tableInstance = $('#requestsTable').DataTable({
        language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4"Bf>rt<"flex justify-between items-center mt-4"ip>',
        buttons: [
            {
                extend: 'excelHtml5',
                text: '<i class="fa-solid fa-file-excel mr-1"></i> ปุ่มส่งออกไฟล์ Excel',
                className: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-xl text-sm border-none shadow'
            }
        ],
        order: [[1, 'desc']],
        columnDefs: [{ targets: 1, type: 'num' }]
    });
}

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
        classInfo = `ชั้น ${cls.grade_level}/${cls.room_number}`;
    }

    const requestDate = req.request_date ? new Date(req.request_date).toLocaleDateString('th-TH') : '-';
    const createdDate = req.created_at ? new Date(req.created_at).toLocaleString('th-TH') : '-';

    const fullName = std ? `${std.prefix || ''}${std.first_name} ${std.last_name}` : 'นักเรียน';
    let avatarUrl = std?.avatar_students_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=256&font-size=0.4`;

    const shortId = req.id.substring(0, 8).toUpperCase();

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

async function deleteRequest(id) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบคำขอได้')) {
        return;
    }
    const { isConfirmed } = await Swal.fire({
        title: 'คุณแน่ใจหรือไม่?',
        text: 'การลบคำขอนี้จะหายไปถาวรจากฐานข้อมูล',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันลบ',
        confirmButtonColor: '#dc2626'
    });
    if (!isConfirmed) return;
    const { error } = await db.from('regis_requests').delete().eq('id', id);
    if (!error) {
        await logUserAction(`ลบคำขอทะเบียน ID: ${id}`, 'regis');
        loadData();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

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
// จัดการผู้ดูแลระบบโมดูล (ใช้ requireAdmin)
// ==========================================
function openAdminModal() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการผู้ดูแลระบบได้')) {
        return;
    }
    document.getElementById('adminModal').classList.remove('hidden');
    ensureModuleExists().then(() => {
        loadModuleAdmins();
        loadPersonnelOptions();
    });
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
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
            option: function(data, escape) {
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
window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.openLightbox = openLightbox;
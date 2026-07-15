let tableInstance = null;
let allRequests = [];
let sysSettings = null;
let currentUser = null;
let currentProfile = null;
let tomSelectInstance = null;

window.onload = async () => {
    await checkAuth();
};

// ==========================================
// การันตีความปลอดภัย: เช็คสิทธิ์ 2 ชั้น
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const userId = session.user.id;
    let hasAccess = false;

    currentUser = session.user;

    const { data: userProfile } = await db.from('core_personnel').select('*').eq('id', userId).single();
    if (userProfile) {
        currentProfile = userProfile;
        if (userProfile.role === 'super_admin') {
            hasAccess = true;
        } else {
            const { data: modAdminCheck } = await db.from('core_module_admins')
                .select('id')
                .eq('user_id', userId)
                .eq('module_id', 'regis')
                .single();
            if (modAdminCheck) {
                hasAccess = true;
            }
        }
    }

    if (!hasAccess) {
        Swal.fire({
            icon: 'error',
            title: 'การเข้าถึงถูกปฏิเสธ',
            text: 'ระบบนี้เข้าถึงได้แค่ super_admin และ admin โมดูลงานทะเบียนเท่านั้น'
        }).then(() => {
            window.location.replace('index.html');
        });
        return;
    }

    const displayName = document.getElementById('display-name');
    if (displayName && currentProfile) {
        displayName.textContent = `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;
    }

    document.getElementById('mainBody').classList.remove('hidden');
    await loadSettings();
    await loadData();
}

// ==========================================
// ออกจากระบบ (logout)
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
        window.location.replace('login.html');
    }
}

// ==========================================
// โหลดการตั้งค่าระบบ (รองรับกรณีไม่มีข้อมูล)
// ==========================================
async function loadSettings() {
    const { data, error } = await db.from('regis_settings').select('*').maybeSingle();

    if (error && error.code === 'PGRST116') {
        // ยังไม่มีข้อมูล สร้าง default
        const { data: newData, error: insertError } = await db.from('regis_settings')
            .insert([{
                gas_api_url: '',
                slide_template_id: '',
                pdf_folder_id: ''
            }])
            .select()
            .single();

        if (!insertError) {
            sysSettings = newData;
            document.getElementById('gasApiUrl').value = '';
            document.getElementById('slideTemplateId').value = '';
            document.getElementById('pdfFolderId').value = '';
        } else {
            console.error('insert settings error:', insertError);
            Swal.fire('Error', 'ไม่สามารถสร้างการตั้งค่าระบบ', 'error');
        }
        return;
    }

    if (data) {
        sysSettings = data;
        document.getElementById('gasApiUrl').value = data.gas_api_url || '';
        document.getElementById('slideTemplateId').value = data.slide_template_id || '';
        document.getElementById('pdfFolderId').value = data.pdf_folder_id || '';
    }
}

// ==========================================
// โหลดข้อมูลคำขอ
// ==========================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูลงานทะเบียน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { data, error } = await db.from('regis_requests')
        .select(`*, core_students(student_id_card, prefix, first_name, last_name, student_enrollments(core_classrooms(grade_level, room_number)))`)
        .order('created_at', { ascending: false });

    Swal.close();
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }

    allRequests = data;
    updateDashboard();
    renderTable();
}

function updateDashboard() {
    const total = allRequests.length;
    const pending = allRequests.filter(r => r.status === 'กำลังดำเนินการ').length;
    const completed = allRequests.filter(r => r.status === 'ดำเนินการเรียบร้อย').length;

    document.getElementById('dashTotal').innerText = total;
    document.getElementById('dashPending').innerText = pending;
    document.getElementById('dashCompleted').innerText = completed;
}

// ==========================================
// แสดงตาราง
// ==========================================
function renderTable() {
    if (tableInstance) tableInstance.destroy();

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    allRequests.forEach(req => {
        const std = req.core_students;
        let classStr = '-';
        if (std.student_enrollments && std.student_enrollments.length > 0) {
            const cls = std.student_enrollments[0].core_classrooms;
            classStr = `${cls.grade_level}/${cls.room_number}`;
        }

        const dateObj = new Date(req.created_at);
        const dateStr = dateObj.toLocaleDateString('th-TH');
        const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const badgeColor = req.status === 'กำลังดำเนินการ' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';

        const tr = `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-slate-700">
                <td class="px-4 py-3 font-mono text-xs">${req.id.substring(0, 8).toUpperCase()}</td>
                <td class="px-4 py-3">${dateStr}</td>
                <td class="px-4 py-3 text-slate-400">${timeStr} น.</td>
                <td class="px-4 py-3">${std.student_id_card}</td>
                <td class="px-4 py-3 font-medium">${std.prefix}${std.first_name} ${std.last_name} (${classStr})</td>
                <td class="px-4 py-3">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}">${req.status}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center gap-3">
                        <button onclick="requestGASPDF('${req.id}')" class="text-blue-500 hover:text-blue-700" title="พิมพ์ PDF ผ่าน GAS"><i class="fa-solid fa-cloud-arrow-down"></i></button>
                        ${req.status === 'กำลังดำเนินการ' ?
                          `<button onclick="approveRequest('${req.id}')" class="text-emerald-500 hover:text-emerald-700" title="ปรับสถานะเรียบร้อย"><i class="fa-solid fa-circle-check"></i></button>` : ''}
                        <button onclick="deleteRequest('${req.id}')" class="text-red-400 hover:text-red-600" title="ลบข้อมูล"><i class="fa-solid fa-trash"></i></button>
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
        ]
    });
}

// ==========================================
// สร้าง PDF ผ่าน GAS API
// ==========================================
async function requestGASPDF(id) {
    const req = allRequests.find(r => r.id === id);
    if (!req || !sysSettings || !sysSettings.gas_api_url) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบการตั้งค่าเครือข่าย GAS API ในระบบ', 'warning');
        return;
    }

    Swal.fire({ title: 'ระบบคลาวด์กำลังประมวลผล...', text: 'กำลังเขียนข้อมูลแทนที่ลงบน Template สไลด์', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    let classInfo = '-';
    if (req.core_students.student_enrollments && req.core_students.student_enrollments.length > 0) {
        classInfo = `${req.core_students.student_enrollments[0].core_classrooms.grade_level}/${req.core_students.student_enrollments[0].core_classrooms.room_number}`;
    }

    const requestBody = {
        templateId: sysSettings.slide_template_id,
        folderId: sysSettings.pdf_folder_id,
        filename: `คำขอที่อนุมัติ_${req.core_students.student_id_card}`,
        dataPairs: {
            "schoolName": "ข้อมูลโรงเรียนส่วนกลาง",
            "reqDate": new Date(req.request_date).toLocaleDateString('th-TH'),
            "fullName": `${req.core_students.prefix}${req.core_students.first_name} ${req.core_students.last_name}`,
            "studentId": req.core_students.student_id_card,
            "classroom": classInfo,
            "fatherName": req.father_name,
            "motherName": req.mother_name,
            "phone": req.phone,
            "pp1Qty": req.doc_pp1_qty > 0 ? `${req.doc_pp1_qty} ฉบับ` : "-",
            "pp7Qty": req.doc_pp7_qty > 0 ? `${req.doc_pp7_qty} ฉบับ` : "-",
            "otherText": req.doc_other_qty > 0 ? `${req.doc_other_text} (${req.doc_other_qty} ฉบับ)` : "-",
            "purpose": req.purpose
        }
    };

    try {
        const response = await fetch(sysSettings.gas_api_url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(requestBody)
        });
        const resJson = await response.json();
        Swal.close();

        if (resJson.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: 'ประมวลผลเอกสารสำเร็จ',
                html: `<a href="${resJson.pdfUrl}" target="_blank" class="text-blue-600 font-bold underline"><i class="fa-solid fa-eye"></i> คลิกเพื่อเปิดดูพิมพ์ไฟล์ PDF ข้อมูลบน Drive</a>`
            });
        } else {
            throw new Error(resJson.message);
        }
    } catch (err) {
        Swal.fire('GAS Integration Error', err.message, 'error');
    }
}

// ==========================================
// อนุมัติคำขอ
// ==========================================
async function approveRequest(id) {
    const { error } = await db.from('regis_requests').update({ status: 'ดำเนินการเรียบร้อย' }).eq('id', id);
    if (!error) {
        Swal.fire('สำเร็จ', 'อัปเดตสถานะคำขอแล้ว', 'success');
        loadData();
    }
}

// ==========================================
// ลบคำขอ
// ==========================================
async function deleteRequest(id) {
    Swal.fire({ title: 'คุณแน่ใจหรือไม่?', text: 'การลบคำขอนี้จะหายไปถาวรจากฐานข้อมูลส่วนกลาง', icon: 'warning', showCancelButton: true, confirmButtonText: 'ยืนยันลบ' }).then(async (res) => {
        if (res.isConfirmed) {
            await db.from('regis_requests').delete().eq('id', id);
            loadData();
        }
    });
}

// ==========================================
// Modal Settings
// ==========================================
function openSettingsModal() { document.getElementById('settingsModal').classList.remove('hidden'); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

// ==========================================
// บันทึกการตั้งค่า
// ==========================================
async function saveSettings(e) {
    e.preventDefault();
    const gas = document.getElementById('gasApiUrl').value;
    const template = document.getElementById('slideTemplateId').value;
    const folder = document.getElementById('pdfFolderId').value;

    const { error } = await db.from('regis_settings')
        .update({ gas_api_url: gas, slide_template_id: template, pdf_folder_id: folder })
        .eq('id', sysSettings.id);

    if (!error) {
        Swal.fire('สำเร็จ', 'อัปเดตโทเคนการตั้งค่าส่วนคลาวด์สำเร็จ', 'success');
        closeSettingsModal();
        loadSettings();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

// ==========================================
// ตรวจสอบและสร้างโมดูล 'regis' ถ้ายังไม่มี (แก้ไข foreign key constraint)
// ==========================================
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
        // ยังไม่มีโมดูลนี้ ต้องสร้าง
        const { error: insertError } = await db.from('core_system_modules')
            .insert([{
                module_id: 'regis',
                module_name: 'งานทะเบียน',
                description: 'ระบบบริหารจัดการงานทะเบียน',
                settings: {}
            }]);
        if (insertError) {
            console.error('Error creating module:', insertError);
            Swal.fire('Error', 'ไม่สามารถสร้างโมดูลงานทะเบียนในระบบ กรุณาติดต่อผู้ดูแลระบบ', 'error');
            return false;
        }
    }
    return true;
}

// ==========================================
// จัดการผู้ดูแลระบบโมดูล (Tom Select)
// ==========================================
function openAdminModal() {
    document.getElementById('adminModal').classList.remove('hidden');
    // ก่อนโหลดข้อมูล admin ให้ตรวจสอบโมดูล (เผื่อไว้)
    ensureModuleExists().then(() => {
        loadModuleAdmins();
        loadPersonnelOptions();
    });
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
    if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
    }
}

// ==========================================
// โหลดรายชื่อ Admin ปัจจุบัน (ไม่ใช้ join)
// ==========================================
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

// ==========================================
// โหลดตัวเลือกบุคลากร (พร้อม Tom Select)
// ==========================================
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

// ==========================================
// เริ่มต้น Tom Select
// ==========================================
function initTomSelect() {
    const selectEl = document.getElementById('adminUserSelect');
    if (!selectEl) return;

    if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
    }

    tomSelectInstance = new TomSelect(selectEl, {
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

// ==========================================
// เพิ่มผู้ดูแลระบบ (เรียก ensureModuleExists ก่อน insert)
// ==========================================
async function addModuleAdmin() {
    const userId = document.getElementById('adminUserSelect').value;
    if (!userId) {
        Swal.fire('กรุณาเลือกบุคลากร', '', 'warning');
        return;
    }

    // ตรวจสอบและสร้างโมดูล (ถ้ายังไม่มี)
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

    Swal.fire('สำเร็จ', 'เพิ่มผู้ดูแลระบบเรียบร้อยแล้ว', 'success');
    loadModuleAdmins();
    loadPersonnelOptions(); // re-load options และ re-init Tom Select
}

// ==========================================
// ลบผู้ดูแลระบบ
// ==========================================
async function removeModuleAdmin(userId) {
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

    Swal.fire('สำเร็จ', 'ลบผู้ดูแลระบบเรียบร้อยแล้ว', 'success');
    loadModuleAdmins();
    loadPersonnelOptions(); // re-load options และ re-init Tom Select
}
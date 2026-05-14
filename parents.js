/**
 * WRK System - Parent Network Logic (Complete CRUD)
 * Updated: 2024-05-14
 */

let currentUser = null;
let currentYear = '';
let currentTerm = '';
let currentStep = 1;
let actualRole = ''; // Role จริงจาก DB
let currentViewRole = ''; // Role ที่กำลังแสดงผล (Admin หรือ Teacher)
let moduleSettings = {};
let tsClassroom = null;

const FORM_ROLES = [
    { id: 'president', title: 'ประธาน' },
    { id: 'vp', title: 'รองประธาน' },
    { id: 'secretary', title: 'เลขานุการ' },
    { id: 'registrar', title: 'นายทะเบียน' },
    { id: 'pr', title: 'ประชาสัมพันธ์' }
];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    generateStepper();
});

// 1. Authentication & Role Switcher Logic
async function checkAuth() {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('login.html');

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    if (!profile) return window.location.replace('login.html');

    currentUser = profile;
    actualRole = profile.role; // เช่น 'super_admin' หรือ 'teacher'
    currentViewRole = actualRole; 

    // แสดงปุ่มตั้งค่าและปุ่มสลับโหมดเฉพาะแอดมิน
    if (actualRole === 'super_admin') {
        document.getElementById('admin-settings-btn').classList.remove('hidden');
        document.getElementById('role-toggle-btn').classList.remove('hidden');
    }

    updateUIByRole();
    await loadSchoolInfo();
    await loadClassrooms();
    await loadAdminSettings();
    
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    Swal.close();
}

function toggleViewRole() {
    currentViewRole = (currentViewRole === 'super_admin') ? 'teacher' : 'super_admin';
    const btn = document.getElementById('role-toggle-btn');
    
    if (currentViewRole === 'teacher') {
        btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> โหมดแอดมิน';
        btn.className = "px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-[11px] font-black uppercase tracking-tighter hover:bg-blue-100 transition-all";
    } else {
        btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> โหมดครู';
        btn.className = "px-3 py-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl text-[11px] font-black uppercase tracking-tighter hover:bg-purple-100 transition-all";
    }
    
    updateUIByRole();
    loadClassrooms(); // รีโหลดห้องเรียนตามสิทธิ์ที่สลับ
}

function updateUIByRole() {
    document.getElementById('userNameDisplay').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('userRoleDisplay').innerText = currentViewRole === 'super_admin' ? 'ผู้ดูแลระบบ' : 'ครูที่ปรึกษา';
}

// 2. Data Loading
async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').eq('id', 1).single();
    if (data) {
        currentYear = data.current_academic_year;
        currentTerm = data.current_semester;
        document.getElementById('term-display').innerText = `${currentTerm}/${currentYear}`;
    }
}

async function loadClassrooms() {
    let query = db.from('core_classrooms')
        .select('*')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level', { ascending: true })
        .order('room_number', { ascending: true });

    // ถ้าอยู่ในโหมดครู ให้เห็นแค่ห้องตัวเอง
    if (currentViewRole !== 'super_admin') {
        query = query.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
    }

    const { data } = await query;
    const select = document.getElementById('select-classroom');

    // 1. เคลียร์ Tom Select Instance เดิมทิ้งก่อน (จำเป็นมากกรณีสลับ Role หรือรีโหลดหน้า)
    if (tsClassroom) {
        tsClassroom.destroy();
    }

    // 2. เติมข้อมูล Option กลับเข้าไปใน DOM
    select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
    if (data) {
        data.forEach(cls => {
            select.innerHTML += `<option value="${cls.id}">ม.${cls.grade_level}/${cls.room_number}</option>`;
        });
    }

    // 3. ผูก Tom Select เข้ากับ <select> พร้อมตั้งค่าการค้นหาและ Event
    tsClassroom = new TomSelect("#select-classroom", {
        create: false,
        placeholder: "-- ค้นหาและเลือกห้องเรียน --",
        maxOptions: null, // แสดงผลการค้นหาทั้งหมดโดยไม่จำกัดจำนวน
        onChange: function(value) {
            // เมื่อมีการเลือกห้องเรียน ให้เรียกใช้ฟังก์ชันดึงข้อมูลฟอร์ม
            if (value) {
                loadClassroomData();
            } else {
                // กรณีผู้ใช้กดปุ่ม x ล้างข้อมูล (ถ้าเปิดใช้งาน)
                document.getElementById('status-text').innerText = "ยังไม่เลือกห้องเรียน";
            }
        }
    });
}

// 3. Form Management (CRUD)
function generateStepper() {
    const stepper = document.getElementById('stepper');
    stepper.innerHTML = FORM_ROLES.map((role, idx) => `
        <button type="button" onclick="goToStep(${idx + 1})" id="step-btn-${idx + 1}" 
            class="step-btn step-${idx + 1} ${idx === 0 ? 'active' : ''}">
            ${idx + 1}. ${role.title}
        </button>
    `).join('');
}

function generateForm() {
    const container = document.getElementById('form-container');
    container.innerHTML = FORM_ROLES.map((role, idx) => `
        <div id="step-content-${idx + 1}" class="${idx === 0 ? 'block' : 'hidden'} animate-fade-in">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center font-black">${idx+1}</div>
                <h3 class="font-bold text-slate-800 uppercase tracking-tight">ข้อมูลส่วนที่ ${idx+1}: ${role.title}</h3>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                <div class="md:col-span-3 flex items-center gap-6 mb-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div class="relative w-24 h-24 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                        <img id="img-preview-${role.id}" class="w-full h-full object-cover hidden">
                        <i class="fas fa-camera text-slate-300 text-2xl" id="img-icon-${role.id}"></i>
                        <input type="file" onchange="previewImg(this, '${role.id}')" class="absolute inset-0 opacity-0 cursor-pointer">
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-800">อัปโหลดรูปถ่าย${role.title}</p>
                        <p class="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Required • Square Ratio</p>
                    </div>
                </div>

                <div class="field-box">
                    <label class="field-label">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_name" class="field-input" required placeholder="ระบุชื่อ-สกุล">
                </div>
                <div class="field-box">
                    <label class="field-label">เบอร์โทรศัพท์ <span class="text-red-500">*</span></label>
                    <input type="tel" id="${role.id}_phone" class="field-input" required maxlength="10" placeholder="08XXXXXXXX">
                </div>
                <div class="field-box">
                    <label class="field-label">ความเกี่ยวข้อง <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_relation" class="field-input" required placeholder="เช่น บิดา, มารดา">
                </div>
                <div class="field-box">
                    <label class="field-label">ชื่อนักเรียนในปกครอง <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_student_name" class="field-input" required placeholder="ระบุชื่อนักเรียน">
                </div>
                <div class="field-box">
                    <label class="field-label">อาชีพ <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_job" class="field-input" required placeholder="ระบุอาชีพ">
                </div>

                <div class="md:col-span-3 h-px bg-slate-200 my-2"></div>

                <div class="field-box">
                    <label class="field-label">บ้านเลขที่/ที่อยู่ <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_address" class="field-input" required placeholder="เลขที่, หมู่">
                </div>
                <div class="field-box">
                    <label class="field-label">ตำบล <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_district" class="field-input" required>
                </div>
                <div class="field-box">
                    <label class="field-label">อำเภอ <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_amphoe" class="field-input" required>
                </div>
                <div class="field-box">
                    <label class="field-label">จังหวัด <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_province" class="field-input" required>
                </div>
                <div class="field-box">
                    <label class="field-label">รหัสไปรษณีย์ <span class="text-red-500">*</span></label>
                    <input type="text" id="${role.id}_zip" class="field-input" required>
                </div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('form-actions').classList.remove('hidden');
    initJqueryThailand();
}

function initJqueryThailand() {
    FORM_ROLES.forEach(role => {
        $.Thailand({
            database: 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/database/db.json',
            $district: $(`#${role.id}_district`),
            $amphoe: $(`#${role.id}_amphoe`),
            $province: $(`#${role.id}_province`),
            $zipcode: $(`#${role.id}_zip`),
        });
    });
}

// 4. CRUD Actions
async function loadClassroomData() {
    const classId = document.getElementById('select-classroom').value;
    if (!classId) return;

    Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading() });
    generateForm();

    const { data, error } = await db.from('module_parent_network')
        .select('*')
        .eq('classroom_id', classId)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .maybeSingle();

    if (data) {
        // Map ข้อมูลลงฟอร์ม
        FORM_ROLES.forEach(role => {
            const rData = data[`${role.id}_data`];
            if (rData) {
                document.getElementById(`${role.id}_name`).value = rData.name || '';
                document.getElementById(`${role.id}_phone`).value = rData.phone || '';
                document.getElementById(`${role.id}_relation`).value = rData.relation || '';
                document.getElementById(`${role.id}_student_name`).value = rData.student_name || '';
                document.getElementById(`${role.id}_job`).value = rData.job || '';
                document.getElementById(`${role.id}_address`).value = rData.address || '';
                document.getElementById(`${role.id}_district`).value = rData.district || '';
                document.getElementById(`${role.id}_amphoe`).value = rData.amphoe || '';
                document.getElementById(`${role.id}_province`).value = rData.province || '';
                document.getElementById(`${role.id}_zip`).value = rData.zip || '';
                if (rData.image_url) {
                    const img = document.getElementById(`img-preview-${role.id}`);
                    img.src = rData.image_url;
                    img.classList.remove('hidden');
                    document.getElementById(`img-icon-${role.id}`).classList.add('hidden');
                }
            }
        });
        updateStatusBadge('completed');
    } else {
        updateStatusBadge('empty');
    }
    
    goToStep(1);
    Swal.close();
}

async function saveNetworkData(e) {
    e.preventDefault();
    const classId = document.getElementById('select-classroom').value;
    
    // ตรวจสอบความครบถ้วน (HTML5 Required handle ให้แล้ว แต่เรา double-check)
    let isComplete = true;
    for (const role of FORM_ROLES) {
        if (!document.getElementById(`${role.id}_name`).value) {
            isComplete = false;
            goToStep(FORM_ROLES.indexOf(role) + 1);
            Swal.fire('ข้อมูลไม่ครบ', `กรุณากรอกข้อมูลของ ${role.title} ให้ครบถ้วนครับ`, 'warning');
            return;
        }
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = {
        classroom_id: classId,
        academic_year: currentYear,
        semester: currentTerm,
        updated_at: new Date()
    };

    FORM_ROLES.forEach(role => {
        payload[`${role.id}_data`] = {
            name: document.getElementById(`${role.id}_name`).value,
            phone: document.getElementById(`${role.id}_phone`).value,
            relation: document.getElementById(`${role.id}_relation`).value,
            student_name: document.getElementById(`${role.id}_student_name`).value,
            job: document.getElementById(`${role.id}_job`).value,
            address: document.getElementById(`${role.id}_address`).value,
            district: document.getElementById(`${role.id}_district`).value,
            amphoe: document.getElementById(`${role.id}_amphoe`).value,
            province: document.getElementById(`${role.id}_province`).value,
            zip: document.getElementById(`${role.id}_zip`).value,
            image_url: document.getElementById(`img-preview-${role.id}`).src || ''
        };
    });

    const { error } = await db.from('module_parent_network').upsert(payload, { onConflict: 'classroom_id,academic_year,semester' });

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเครือข่ายเรียบร้อยแล้ว', 'success');
        updateStatusBadge('completed');
    }
}

async function clearRoomData() {
    const classId = document.getElementById('select-classroom').value;
    if (!classId) return;

    const result = await Swal.fire({
        title: 'ยืนยันการล้างข้อมูล?',
        text: "ข้อมูลเครือข่ายผู้ปกครองของห้องนี้จะถูกลบออกทั้งหมด",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'ล้างข้อมูลทันที'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('module_parent_network')
            .delete()
            .eq('classroom_id', classId)
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm);
        
        if (!error) {
            document.getElementById('network-form').reset();
            FORM_ROLES.forEach(role => {
                document.getElementById(`img-preview-${role.id}`).classList.add('hidden');
                document.getElementById(`img-icon-${role.id}`).classList.remove('hidden');
            });
            updateStatusBadge('empty');
            Swal.fire('สำเร็จ', 'ล้างข้อมูลเรียบร้อย', 'success');
        }
    }
}

// 5. Admin Settings Logic
async function loadAdminSettings() {
    const { data } = await db.from('module_parent_network_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
        moduleSettings = data;
        document.getElementById('set-api-url').value = data.gd_api_url || '';
        document.getElementById('set-folder-id').value = data.gd_folder_id || '';
        document.getElementById('set-slide-id').value = data.slide_template_url || '';
    }
}

async function saveAdminSettings() {
    const payload = {
        id: 1,
        gd_api_url: document.getElementById('set-api-url').value,
        gd_folder_id: document.getElementById('set-folder-id').value,
        slide_template_url: document.getElementById('set-slide-id').value,
        updated_at: new Date()
    };

    const { error } = await db.from('module_parent_network_settings').upsert(payload);
    if (!error) {
        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าระบบเรียบร้อย', 'success');
        closeAdminModal();
    }
}

// 6. Utility Functions
function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (status === 'completed') {
        badge.className = "px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-center border border-emerald-100 animate-pulse";
        text.innerHTML = '<i class="fas fa-check-circle mr-1"></i> บันทึกข้อมูลแล้ว';
    } else {
        badge.className = "px-3 py-2 bg-amber-50 text-amber-600 rounded-xl text-center border border-amber-100";
        text.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> ยังไม่มีข้อมูล';
    }
}

function goToStep(step) {
    currentStep = step;
    FORM_ROLES.forEach((_, i) => {
        const content = document.getElementById(`step-content-${i + 1}`);
        const btn = document.getElementById(`step-btn-${i + 1}`);
        if(content) content.classList.toggle('hidden', i + 1 !== step);
        if(btn) btn.classList.toggle('active', i + 1 === step);
    });
    document.getElementById('btn-next').classList.toggle('hidden', step === 5);
    document.getElementById('btn-submit').classList.toggle('hidden', step !== 5);
}

function nextStep() { if (currentStep < 5) goToStep(currentStep + 1); }
function prevStep() { if (currentStep > 1) goToStep(currentStep - 1); }

function previewImg(input, roleId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = document.getElementById(`img-preview-${roleId}`);
            img.src = e.target.result;
            img.classList.remove('hidden');
            document.getElementById(`img-icon-${roleId}`).classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// ==========================================
// 7. DataTables & Dashboard (ภาพรวมข้อมูล)
// ==========================================

async function loadDataTable() {
    const tbody = document.getElementById('tb-network');
    if (!tbody) return;

    // แสดงสถานะกำลังโหลด
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังดึงข้อมูล...</td></tr>';

    // ดึงข้อมูลทั้งหมดของเทอมนี้ พร้อมจอยตารางห้องเรียน
    let query = db.from('module_parent_network')
        .select(`
            id,
            classroom_id,
            president_data,
            updated_at,
            core_classrooms (grade_level, room_number)
        `)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm);

    // ถ้าเป็นครู ให้เห็นแค่ห้องที่ตัวเองรับผิดชอบ
    if (currentViewRole !== 'super_admin') {
        const { data: myRooms } = await db.from('core_classrooms')
            .select('id')
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
            
        const myRoomIds = myRooms ? myRooms.map(r => r.id) : [];
        if (myRoomIds.length > 0) {
            query = query.in('classroom_id', myRoomIds);
        } else {
            // ถ้าไม่มีห้องเลย
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-rose-400 font-bold">คุณยังไม่มีห้องเรียนที่รับผิดชอบในเทอมนี้</td></tr>';
            renderDashboard(0, 0);
            return;
        }
    }

    const { data, error } = await query;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-rose-500 font-bold">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400 font-bold"><i class="fas fa-folder-open text-3xl block mb-2"></i>ยังไม่มีการบันทึกข้อมูลเครือข่ายผู้ปกครอง</td></tr>';
        renderDashboard(0, 0); // ไม่มีข้อมูล
        return;
    }

    // วาดตารางข้อมูล
    tbody.innerHTML = data.map(row => {
        const presName = row.president_data?.name || '-';
        const presPhone = row.president_data?.phone || '-';
        const roomName = row.core_classrooms ? `ม.${row.core_classrooms.grade_level}/${row.core_classrooms.room_number}` : 'ไม่ระบุ';
        
        return `
        <tr class="hover:bg-blue-50/50 transition-colors">
            <td class="py-4 px-4 font-black text-slate-700">${roomName}</td>
            <td class="py-4 px-4 font-bold text-blue-700">${presName}</td>
            <td class="py-4 px-4 text-slate-600">${presPhone}</td>
            <td class="py-4 px-4 text-center">
                <span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                    <i class="fas fa-check mr-1"></i> สมบูรณ์
                </span>
            </td>
            <td class="py-4 px-4 text-right">
                <button onclick="editFromTable('${row.classroom_id}')" class="text-blue-500 hover:text-blue-700 p-2 transition-colors tooltip" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
            </td>
        </tr>`;
    }).join('');

    // เรียกใช้ Dashboard Stats
    renderDashboard(data.length, data.length); // สมมติว่าห้องที่ query มาคือบันทึกสมบูรณ์แล้วทั้งหมด

    // Re-initialize DataTable (ถ้าโหลด library DataTables ไว้)
    if ($.fn.DataTable && $.fn.DataTable.isDataTable('#networkTable')) {
        $('#networkTable').DataTable().destroy();
    }
    
    if ($.fn.DataTable) {
        $('#networkTable').DataTable({
            responsive: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
            pageLength: 25,
            dom: '<"flex justify-between items-center mb-4"f>rt<"flex justify-between items-center mt-4"ip>'
        });
    }
}

function renderDashboard(completedCount, totalCount) {
    const dashContainer = document.getElementById('dashboard-stats');
    if (!dashContainer) return;

    // ถ้าเป็นแอดมิน โชว์จำนวนห้องทั้งหมด (สมมติ 50 ห้อง) ถ้าเป็นครู โชว์แค่ห้องตัวเอง
    let displayTotal = currentViewRole === 'super_admin' ? 'ทั้งหมด' : 'ที่รับผิดชอบ';

    dashContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-5 border-l-4 border-blue-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">ห้องเรียน${displayTotal}</p>
            <h3 class="text-3xl font-black text-blue-700">${completedCount} <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
        <div class="glass-card rounded-2xl p-5 border-l-4 border-emerald-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">บันทึกสมบูรณ์แล้ว</p>
            <h3 class="text-3xl font-black text-emerald-600">${completedCount} <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
        <div class="glass-card rounded-2xl p-5 border-l-4 border-amber-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">รอการบันทึก</p>
            <h3 class="text-3xl font-black text-amber-600">0 <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
    `;
}

// ฟังก์ชันสำหรับกดปุ่ม Edit จากในตาราง
function editFromTable(classroomId) {
    // เซ็ตค่า Tom Select ให้เป็นห้องที่เลือก
    if(tsClassroom) {
        tsClassroom.setValue(classroomId);
    } else {
        document.getElementById('select-classroom').value = classroomId;
    }
    // สลับหน้าไปที่ฟอร์ม (จะ Trigger loadClassroomData อัตโนมัติถ้าใช้ Tom Select)
    switchTab('form');
}

// ฟังก์ชัน Export Excel แบบง่าย
function exportToExcel() {
    Swal.fire({
        title: 'กำลังสร้างไฟล์ Excel...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    setTimeout(() => {
        // ใช้ SheetJS (ถ้ามี) หรือแค่ DataTables Export Button
        if ($.fn.DataTable && $.fn.DataTable.isDataTable('#networkTable')) {
            // ถ้า DataTables มีปุ่ม Excel ให้คลิกปุ่มซ่อนนั้น (ถ้าตั้งค่าปุ่มไว้)
            // หรือใช้โครงสร้างพื้นฐาน
            let table = document.getElementById("networkTable");
            let html = table.outerHTML;
            let url = 'data:application/vnd.ms-excel;charset=utf-8,%EF%BB%BF' + encodeURIComponent(html);
            let a = document.createElement('a');
            a.href = url;
            a.download = `Parent_Network_${currentTerm}_${currentYear}.xls`;
            a.click();
            Swal.fire('สำเร็จ', 'ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
        } else {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบไลบรารีส่งออกข้อมูล', 'error');
        }
    }, 1000);
}

function switchTab(tabId) {
    document.getElementById('tab-form').classList.toggle('hidden', tabId !== 'form');
    document.getElementById('tab-data').classList.toggle('hidden', tabId !== 'data');
    
    // ถ้าสลับมาหน้า data ให้โหลดตารางใหม่
    if (tabId === 'data') {
        loadDataTable();
    }
}

function openAdminModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function closeAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }
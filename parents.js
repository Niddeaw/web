// ตัวแปร Global สำหรับสถานะ
let currentUser = null;
let currentRole = null;
let viewAsAdmin = false;
let currentStep = 1;
let currentYear = '';
let currentTerm = '';

// โครงสร้าง Roles ในฟอร์ม
const FORM_ROLES = [
    { id: 'president', title: 'ประธาน' },
    { id: 'vp', title: 'รองประธาน' },
    { id: 'secretary', title: 'เลขานุการ' },
    { id: 'registrar', title: 'นายทะเบียน' },
    { id: 'pr', title: 'ประชาสัมพันธ์' }
];

document.addEventListener('DOMContentLoaded', async () => {
    generateFormSteps();
    await checkAuth();
});

// ==========================================
// 1. ระบบ Authentication & RBAC (ตรวจสอบสิทธิ์ 2 ชั้น)
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'ตรวจสอบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    // ดึง Session จาก Supabase อ้างอิงตัวแปร db จาก config.js[cite: 1]
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    // ตรวจสอบ Role จาก core_personnel
    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;

    // เช็คสิทธิ์ 2 ชั้น สำหรับ Admin โมดูล
    let isAdmin = false;
    if (profile.role === 'super_admin') {
        isAdmin = true;
    } else {
        const { data: modAdmin } = await db.from('core_module_admins')
            .select('module_id')
            .eq('user_id', profile.id)
            .eq('module_id', 'parent_network')
            .maybeSingle();
        if (modAdmin) isAdmin = true;
    }

    currentRole = isAdmin ? 'admin' : 'teacher';
    
    if (isAdmin) {
        document.getElementById('tab-btn-admin').classList.remove('hidden');
        document.getElementById('role-toggle-btn').classList.remove('hidden');
        viewAsAdmin = true;
    }

    await loadSchoolInfo();
    await loadClassroomsDropdown();
    initJqueryThailand(); // เริ่มระบบ Auto-complete
    
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    Swal.close();
}

async function loadSchoolInfo() {
    // ดึงข้อมูลปี/เทอม จากส่วนกลาง (Single Source of Truth)[cite: 5]
    const { data } = await db.from('core_school_info').select('current_academic_year, current_semester').eq('id', 1).single();
    if (data) {
        currentYear = data.current_academic_year;
        currentTerm = data.current_semester;
        document.getElementById('school-term-badge').innerText = `เทอม ${currentTerm}/${currentYear}`;
    }
}

// ==========================================
// 2. ดึงข้อมูลห้องเรียน (Teacher ดึงเฉพาะห้องตัวเอง, Admin ดึงทั้งหมด)
// ==========================================
async function loadClassroomsDropdown() {
    let query = db.from('core_classrooms')
        .select('*')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level', { ascending: true })
        .order('room_number', { ascending: true });

    // ถ้าไม่ใช่ Admin แบบดูทั้งหมด ให้แสดงแค่ห้องที่ตัวเองเป็นที่ปรึกษา[cite: 5]
    if (currentRole === 'teacher' || !viewAsAdmin) {
        query = query.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
    }

    const { data, error } = await query;
    if (error) return console.error(error);

    const select = document.getElementById('select-classroom');
    select.innerHTML = '<option value="">-- เลือกระดับชั้น/ห้องเรียน --</option>';
    
    data.forEach(cls => {
        select.innerHTML += `<option value="${cls.id}">ม.${cls.grade_level}/${cls.room_number}</option>`;
    });
}

function toggleRoleView() {
    viewAsAdmin = !viewAsAdmin;
    const btn = document.getElementById('role-toggle-btn');
    btn.innerHTML = viewAsAdmin ? '<i class="fa-solid fa-user-shield"></i> มุมมอง Admin' : '<i class="fa-solid fa-user"></i> มุมมอง Teacher';
    btn.className = viewAsAdmin ? 'px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg font-bold' : 'px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg font-bold';
    loadClassroomsDropdown(); // รีโหลด Dropdown ใหม่ตามสิทธิ์
}

// ==========================================
// 3. UI Multi-Step Form & Auto Complete
// ==========================================
function generateFormSteps() {
    const container = document.getElementById('form-container');
    let html = '';
    
    FORM_ROLES.forEach((role, idx) => {
        const stepNum = idx + 1;
        html += `
        <div id="step-content-${stepNum}" class="${stepNum === 1 ? 'block' : 'hidden'} fade-in">
            <h4 class="font-bold text-blue-600 mb-4 border-b pb-2">${stepNum}. ข้อมูล${role.title}เครือข่ายผู้ปกครอง</h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2 flex items-center gap-4 mb-4">
                    <div class="relative w-24 h-24 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                        <img id="img-preview-${role.id}" class="w-full h-full object-cover hidden">
                        <i class="fa-solid fa-camera text-gray-400 text-2xl absolute" id="img-icon-${role.id}"></i>
                    </div>
                    <div>
                        <label class="field-label block mb-1">อัปโหลดรูปถ่าย</label>
                        <input type="file" id="file-${role.id}" accept="image/*" class="text-sm" onchange="previewImage(this, '${role.id}')">
                    </div>
                </div>

                <div class="field-group"><label class="field-label required">ชื่อ-สกุล ผู้ปกครอง</label>
                    <input type="text" id="${role.id}_name" class="field-input" required></div>
                <div class="field-group"><label class="field-label required">เบอร์โทรศัพท์</label>
                    <input type="tel" id="${role.id}_phone" class="field-input" required maxlength="10"></div>
                <div class="field-group"><label class="field-label required">ความเกี่ยวข้องกับนักเรียน</label>
                    <input type="text" id="${role.id}_relation" class="field-input" required placeholder="เช่น บิดา, มารดา"></div>
                <div class="field-group"><label class="field-label required">ชื่อ-สกุล นักเรียนในปกครอง</label>
                    <input type="text" id="${role.id}_student_name" class="field-input" required></div>
                <div class="field-group md:col-span-2"><label class="field-label">อาชีพ</label>
                    <input type="text" id="${role.id}_occupation" class="field-input"></div>
                
                <!-- ชุดที่อยู่ (รองรับ JQuery Thailand) -->
                <div class="field-group"><label class="field-label required">บ้านเลขที่</label>
                    <input type="text" id="${role.id}_address" class="field-input" required></div>
                <div class="field-group"><label class="field-label">หมู่ที่</label>
                    <input type="text" id="${role.id}_moo" class="field-input"></div>
                <div class="field-group"><label class="field-label required">ตำบล/แขวง</label>
                    <input type="text" id="${role.id}_district" class="field-input thai-district" required></div>
                <div class="field-group"><label class="field-label required">อำเภอ/เขต</label>
                    <input type="text" id="${role.id}_amphoe" class="field-input thai-amphoe" required></div>
                <div class="field-group"><label class="field-label required">จังหวัด</label>
                    <input type="text" id="${role.id}_province" class="field-input thai-province" required></div>
                <div class="field-group"><label class="field-label required">รหัสไปรษณีย์</label>
                    <input type="text" id="${role.id}_zipcode" class="field-input thai-zipcode" required></div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function initJqueryThailand() {
    FORM_ROLES.forEach(role => {
        $.Thailand({
            database: 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/database/db.json',
            $district: $(`#${role.id}_district`),
            $amphoe: $(`#${role.id}_amphoe`),
            $province: $(`#${role.id}_province`),
            $zipcode: $(`#${role.id}_zipcode`),
        });
    });
}

function previewImage(input, roleId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(`img-preview-${roleId}`).src = e.target.result;
            document.getElementById(`img-preview-${roleId}`).classList.remove('hidden');
            document.getElementById(`img-icon-${roleId}`).classList.add('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function goToStep(step) {
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`step-content-${i}`).classList.add('hidden');
        document.querySelector(`.step-btn[data-step="${i}"]`).classList.remove('active');
    }
    document.getElementById(`step-content-${step}`).classList.remove('hidden');
    document.querySelector(`.step-btn[data-step="${step}"]`).classList.add('active');
    currentStep = step;

    document.getElementById('btn-next').classList.toggle('hidden', currentStep === 5);
    document.getElementById('btn-submit').classList.toggle('hidden', currentStep !== 5);
}

function nextStep() { if (currentStep < 5) goToStep(currentStep + 1); }
function prevStep() { if (currentStep > 1) goToStep(currentStep - 1); }

// ==========================================
// 4. การจัดการฐานข้อมูล CRUD
// ==========================================
async function saveNetworkData(e) {
    e.preventDefault();
    const classId = document.getElementById('select-classroom').value;
    if (!classId) return Swal.fire('เตือน', 'กรุณาเลือกระดับชั้นก่อนบันทึก', 'warning');

    Swal.fire({ title: 'กำลังบันทึกและอัปโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        let payload = {
            classroom_id: classId,
            academic_year: currentYear,
            semester: currentTerm
        };

        // วนเก็บข้อมูลทีละ Role
        for (const role of FORM_ROLES) {
            payload[`${role.id}_data`] = {
                name: document.getElementById(`${role.id}_name`).value,
                phone: document.getElementById(`${role.id}_phone`).value,
                relation: document.getElementById(`${role.id}_relation`).value,
                student_name: document.getElementById(`${role.id}_student_name`).value,
                occupation: document.getElementById(`${role.id}_occupation`).value,
                address: document.getElementById(`${role.id}_address`).value,
                moo: document.getElementById(`${role.id}_moo`).value,
                district: document.getElementById(`${role.id}_district`).value,
                amphoe: document.getElementById(`${role.id}_amphoe`).value,
                province: document.getElementById(`${role.id}_province`).value,
                zipcode: document.getElementById(`${role.id}_zipcode`).value,
                image_url: '' // เตรียมรับค่าหลัง Upload
            };
        }

        // Upsert Database ข้อมูลเครือข่าย
        const { error } = await db.from('module_parent_network').upsert(payload, { onConflict: 'classroom_id,academic_year,semester' });
        if (error) throw error;

        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเครือข่ายเรียบร้อย', 'success');
        
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 5. DataTables สำหรับดูรายการทั้งหมด (Export Excel)
// ==========================================
async function loadDataTable() {
    if ($.fn.DataTable.isDataTable('#networkTable')) $('#networkTable').DataTable().destroy();
    
    let query = db.from('module_parent_network')
        .select(`*, core_classrooms(grade_level, room_number)`)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm);

    const { data, error } = await query;
    const tbody = document.getElementById('tb-network');
    
    if (data && data.length > 0) {
        tbody.innerHTML = data.map(row => {
            const pres = row.president_data ? row.president_data.name : '-';
            const phone = row.president_data ? row.president_data.phone : '-';
            const roomName = `ม.${row.core_classrooms.grade_level}/${row.core_classrooms.room_number}`;
            return `
            <tr>
                <td>${roomName}</td>
                <td class="font-bold text-blue-700">${pres}</td>
                <td>${phone}</td>
                <td><span class="badge badge-green">บันทึกแล้ว</span></td>
                <td>
                    <button class="text-blue-600 px-2" onclick="editData('${row.classroom_id}')"><i class="fa-solid fa-edit"></i></button>
                    <!-- ปุ่ม Export PDF จะเชื่อมกับ html2pdf[cite: 2] -->
                    <button class="text-emerald-600 px-2" onclick="exportPDF('${row.id}')"><i class="fa-solid fa-file-pdf"></i></button>
                </td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    // เรียกใช้ DataTables พร้อม Extension ส่งออกข้อมูล[cite: 2]
    $('#networkTable').DataTable({
        responsive: true,
        dom: 'Bfrtip',
        buttons: ['excelHtml5'], // ใช้งาน SheetJS
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

// ==========================================
// 6. แท็บ Navigation
// ==========================================
function switchTab(tabId) {
    ['dashboard', 'form', 'data', 'admin'].forEach(id => {
        const el = document.getElementById(`tab-${id}`);
        const btn = document.getElementById(`tab-btn-${id}`);
        if(el) el.classList.add('hidden');
        if(btn) {
            btn.classList.remove('bg-blue-50', 'text-blue-700', 'font-bold');
            btn.classList.add('text-slate-600');
        }
    });

    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tabId}`).classList.add('bg-blue-50', 'text-blue-700', 'font-bold');

    if (tabId === 'data') loadDataTable();
}
/**
 * WRK System - Parent Network Logic (Complete CRUD)
 * Updated: 2024-05-16 (Performance Optimized)
 */

let currentUser = null;
let currentYear = '';
let currentTerm = '';
let currentStep = 1;
let actualRole = '';               // Role จริงจาก DB
let currentViewRole = '';          // Role ที่กำลังแสดงผล
let moduleSettings = {};
let tsClassroom = null;
let tsTeacherAppoint = null;
let isReadOnly = false;
let thailandLoaded = false;       // กันโหลดซ้ำ
let allClassrooms = [];

const FORM_ROLES = [
    { id: 'president', title: 'ประธาน' },
    { id: 'vp', title: 'รองประธาน' },
    { id: 'secretary', title: 'เลขานุการ' },
    { id: 'registrar', title: 'นายทะเบียน' },
    { id: 'pr', title: 'ประชาสัมพันธ์' }
];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
});

// ==========================================
// 1. ระบบ Authentication & Role Detection (Parallel)
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return window.location.replace('login.html');

        // ✅ รอบ 1: personnel + school_info พร้อมกัน
        const [{ data: profile }, { data: sInfo }] = await Promise.all([
            db.from('core_personnel').select('*').eq('id', session.user.id).single(),
            db.from('core_school_info').select('current_academic_year, current_semester').single()
        ]);

        if (!profile) return window.location.replace('login.html');
        currentUser = profile;
        actualRole = profile.role;
        isReadOnly = false;

        if (sInfo) {
            currentYear = sInfo.current_academic_year;
            currentTerm = sInfo.current_semester;
            const termEl = document.getElementById('term-display');
            if (termEl) termEl.innerText = `${currentTerm}/${currentYear}`;
        }

        // ✅ รอบ 2: 3 queries permission พร้อมกัน (รอ school_info ก่อนเพื่อได้ currentYear)
        const [{ data: modAdmin }, { data: discHeadData }, { data: gradeHead }] = await Promise.all([
            db.from('core_module_admins')
                .select('id').eq('user_id', currentUser.id).eq('module_id', 'parent_network').maybeSingle(),
            currentYear
                ? db.from('core_discipline_heads')
                    .select('id').eq('personnel_id', currentUser.id).eq('academic_year', currentYear).maybeSingle()
                : Promise.resolve({ data: null }),
            db.from('behavior_grade_heads')
                .select('grade_level').eq('teacher_id', currentUser.id).maybeSingle()
        ]);

        // Role mapping (ส่วนนี้เหมือนเดิม)
        if (actualRole === 'super_admin') {
            currentViewRole = 'super_admin';
            document.getElementById('admin-settings-btn')?.classList.remove('hidden');
        } else if (modAdmin) {
            currentViewRole = actualRole = 'module_admin';
        } else if (discHeadData) {
            currentViewRole = actualRole = 'head_discipline';
            isReadOnly = true;
        } else if (gradeHead) {
            currentViewRole = actualRole = 'head_grade';
            isReadOnly = true;
        } else {
            currentViewRole = actualRole = 'teacher';
        }

        if (actualRole !== 'teacher') {
            document.getElementById('role-toggle-btn')?.classList.remove('hidden');
        }

        generateStepper();
        updateUIByRole();

        // ✅ รอบ 3: loadClassrooms + loadAdminSettings พร้อมกัน
        const promises = [loadClassrooms()];
        if (actualRole === 'super_admin') {
            promises.push(loadAdminSettings());
        }
        await Promise.all(promises);

        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        Swal.close();
    } catch (error) {
        console.error("Auth Error:", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง', 'error');
    }
}

// ==========================================
// 2. UI & Stepper (คงเดิม)
// ==========================================
function updateUIByRole() {
    if (!currentUser) return;
    document.getElementById('userNameDisplay').innerText = `ครู${currentUser.first_name} ${currentUser.last_name}`;

    let roleText = 'ครูที่ปรึกษา';
    let badgeClass = "text-slate-400";
    if (currentViewRole === 'super_admin') { roleText = 'ผู้ดูแลระบบสูงสุด'; badgeClass = "text-purple-600 font-black"; }
    else if (currentViewRole === 'module_admin') { roleText = 'แอดมินเครือข่าย'; badgeClass = "text-blue-600 font-black"; }
    else if (currentViewRole === 'head_discipline') { roleText = 'หัวหน้างานปกครอง (Viewer)'; badgeClass = "text-rose-600 font-black"; }
    else if (currentViewRole === 'head_grade') { roleText = 'หัวหน้าระดับชั้น (Viewer)'; badgeClass = "text-orange-600 font-black"; }

    const roleEl = document.getElementById('userRoleDisplay');
    if (roleEl) {
        roleEl.innerText = roleText;
        roleEl.className = `text-[10px] mt-1 uppercase ${badgeClass}`;
    }
}

function generateStepper() {
    const stepper = document.getElementById('stepper');
    if (!stepper) return;
    stepper.innerHTML = FORM_ROLES.map((role, idx) => `
        <button type="button" onclick="goToStep(${idx + 1})" id="step-btn-${idx + 1}"
            class="step-btn step-${idx + 1} ${idx === 0 ? 'active' : ''}">
            ${idx + 1}. ${role.title}
        </button>
    `).join('');
}

function toggleViewRole() {
    if (actualRole === 'teacher') return;
    currentViewRole = (currentViewRole === 'teacher') ? actualRole : 'teacher';
    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);

    const btn = document.getElementById('role-toggle-btn');
    if (!btn) return;

    if (currentViewRole === 'teacher') {
        btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Switch to Admin';
        btn.className = "px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-[11px] font-black uppercase tracking-tighter hover:bg-blue-100 transition-all shadow-sm";
    } else {
        btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Switch to Teacher';
        btn.className = "px-3 py-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl text-[11px] font-black uppercase tracking-tighter hover:bg-purple-100 transition-all shadow-sm";
    }

    updateUIByRole();
    loadClassrooms();

    const modeName = currentViewRole === 'teacher' ? 'โหมดครูที่ปรึกษา' : 'โหมดผู้ดูแลระบบ';
    Swal.fire({
        toast: true, position: 'top-end', icon: 'info',
        title: `สลับเป็น${modeName}`, showConfirmButton: false, timer: 2000
    });
}

// ==========================================
// 3. โหลดห้องเรียน (คงเดิม)
// ==========================================
async function loadClassrooms() {
    console.log('[loadClassrooms] currentViewRole:', currentViewRole, '| actualRole:', actualRole, '| year:', currentYear, '| term:', currentTerm);
    let query = db.from('core_classrooms')
        .select('*')
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .order('grade_level', { ascending: true })
        .order('room_number', { ascending: true });

    const isHighLevel = ['super_admin', 'module_admin', 'head_grade', 'head_discipline'].includes(currentViewRole);
    if (!isHighLevel) {
        query = query.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
    }

    const { data, error } = await query;
    if (error) return console.error("Load Classrooms Error:", error);

    allClassrooms = data || [];

    const select = document.getElementById('select-classroom');
    if (tsClassroom) tsClassroom.destroy();

    select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
    data.forEach(cls => {
        select.innerHTML += `<option value="${cls.id}">ม.${cls.grade_level}/${cls.room_number}</option>`;
    });

    tsClassroom = new TomSelect("#select-classroom", {
        create: false,
        placeholder: "-- ค้นหาและเลือกห้องเรียน --",
        onChange: (val) => { if (val) loadClassroomData(); }
    });
}

// ==========================================
// 4. โหลดไลบรารี Thailand แบบ Async (เมื่อจำเป็น) – คงไว้เพียงครั้งเดียว
// ==========================================
async function loadThailandLibrary() {
    if (thailandLoaded) return;
    // ถ้าใน HTML มี script ของ Thailand อยู่แล้ว เราจะไม่โหลดซ้ำ (เช็ค typeof $)
    if (typeof $ !== 'undefined' && $.Thailand) {
        thailandLoaded = true;
        return;
    }
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/dependencies/JQL.min.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
    });
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/dependencies/typeahead.bundle.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
    });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/dist/jquery.Thailand.min.css';
    document.head.appendChild(link);
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://earthchie.github.io/jquery.Thailand.js/jquery.Thailand.js/dist/jquery.Thailand.min.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
    });
    thailandLoaded = true;
}

// ==========================================
// 5. สร้างฟอร์ม (Dynamic) + init Thailand เมื่อพร้อม
// ==========================================
async function generateForm() {
    const container = document.getElementById('form-container');
    container.innerHTML = FORM_ROLES.map((role, idx) => `
        <div id="step-content-${idx + 1}" class="${idx === 0 ? 'block' : 'hidden'} animate-fade-in">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center font-black">${idx + 1}</div>
                <h3 class="font-bold text-slate-800 uppercase tracking-tight">ข้อมูลส่วนที่ ${idx + 1}: ${role.title}</h3>
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
                <div class="field-box"><label class="field-label">ชื่อ-นามสกุล <span class="text-red-500">*</span></label><input type="text" id="${role.id}_name" class="field-input" required placeholder="ระบุชื่อ-สกุล"></div>
                <div class="field-box"><label class="field-label">เบอร์โทรศัพท์ <span class="text-red-500">*</span></label><input type="tel" id="${role.id}_phone" class="field-input" required maxlength="10" placeholder="08XXXXXXXX"></div>
                <div class="field-box"><label class="field-label">ความเกี่ยวข้อง <span class="text-red-500">*</span></label><input type="text" id="${role.id}_relation" class="field-input" required placeholder="เช่น บิดา, มารดา"></div>
                <div class="field-box"><label class="field-label">ชื่อนักเรียนในปกครอง <span class="text-red-500">*</span></label><input type="text" id="${role.id}_student_name" class="field-input" required placeholder="ระบุชื่อนักเรียน"></div>
                <div class="field-box"><label class="field-label">อาชีพ <span class="text-red-500">*</span></label><input type="text" id="${role.id}_job" class="field-input" required placeholder="ระบุอาชีพ"></div>
                <div class="md:col-span-3 h-px bg-slate-200 my-2"></div>
                <div class="field-box"><label class="field-label">บ้านเลขที่ <span class="text-red-500">*</span></label><input type="text" id="${role.id}_address" class="field-input" required placeholder="เลขที่"></div>
                <div class="field-box"><label class="field-label">หมู่ที่</label><input type="text" id="${role.id}_village" class="field-input" placeholder="หมู่ที่"></div>
                <div class="field-box"><label class="field-label">ตำบล <span class="text-red-500">*</span></label><input type="text" id="${role.id}_district" class="field-input" required></div>
                <div class="field-box"><label class="field-label">อำเภอ <span class="text-red-500">*</span></label><input type="text" id="${role.id}_amphoe" class="field-input" required></div>
                <div class="field-box"><label class="field-label">จังหวัด <span class="text-red-500">*</span></label><input type="text" id="${role.id}_province" class="field-input" required></div>
                <div class="field-box"><label class="field-label">รหัสไปรษณีย์ <span class="text-red-500">*</span></label><input type="text" id="${role.id}_zip" class="field-input" required></div>
            </div>
        </div>
    `).join('');

    document.getElementById('form-actions').classList.remove('hidden');
    await loadThailandLibrary();   // รอให้ library พร้อมก่อน
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

// ==========================================
// 6. โหลด / บันทึก / ล้างข้อมูลห้องเรียน (เพิ่ม await generateForm)
// ==========================================
async function loadClassroomData() {
    const classId = document.getElementById('select-classroom').value;
    if (!classId) return;
    Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    await generateForm();  // ต้องรอให้ฟอร์มและ Thailand พร้อม

    const { data, error } = await db.from('module_parent_network')
        .select('*')
        .eq('classroom_id', classId)
        .eq('academic_year', currentYear)
        .eq('semester', currentTerm)
        .maybeSingle();

    if (data) {
        FORM_ROLES.forEach(role => {
            const rData = data[`${role.id}_data`];
            if (!rData) return;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            set(`${role.id}_name`, rData.name); set(`${role.id}_phone`, rData.phone);
            set(`${role.id}_relation`, rData.relation); set(`${role.id}_student_name`, rData.student_name);
            set(`${role.id}_job`, rData.job); set(`${role.id}_address`, rData.address);
            set(`${role.id}_village`, rData.village); set(`${role.id}_district`, rData.district);
            set(`${role.id}_amphoe`, rData.amphoe); set(`${role.id}_province`, rData.province);
            set(`${role.id}_zip`, rData.zip);
            if (rData.image_url) {
                const img = document.getElementById(`img-preview-${role.id}`);
                img.src = getGoogleDriveDirectUrl(rData.image_url);
                img.classList.remove('hidden');
                document.getElementById(`img-icon-${role.id}`)?.classList.add('hidden');
            }
        });
        updateStatusBadge('completed');
    } else {
        updateStatusBadge('empty');
    }

    // จัดการ Read-Only
    const submitBtn = document.getElementById('btn-submit');
    const clearBtn = document.querySelector('button[onclick="clearRoomData()"]');
    const allInputs = document.querySelectorAll('#network-form input, #network-form select');
    if (isReadOnly) {
        if (submitBtn) submitBtn.classList.add('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
        allInputs.forEach(input => { input.disabled = true; input.classList.add('bg-slate-50', 'cursor-not-allowed'); });
        document.getElementById('status-text').innerHTML = '<i class="fas fa-eye mr-1"></i> โหมดอ่านอย่างเดียว';
    } else {
        if (submitBtn) submitBtn.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.remove('hidden');
        allInputs.forEach(input => { input.disabled = false; input.classList.remove('bg-slate-50', 'cursor-not-allowed'); });
    }

    goToStep(1);
    Swal.close();
}

async function clearRoomData() {
    const classId = document.getElementById('select-classroom').value;
    if (!classId) return;
    const result = await Swal.fire({
        title: 'ยืนยันการล้างข้อมูล?', text: "ข้อมูลเครือข่ายผู้ปกครองของห้องนี้จะถูกลบออกทั้งหมด",
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ล้างข้อมูลทันที'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('module_parent_network').delete()
            .eq('classroom_id', classId).eq('academic_year', currentYear).eq('semester', currentTerm);
        if (!error) {
            document.getElementById('network-form').reset();
            FORM_ROLES.forEach(role => {
                document.getElementById(`img-preview-${role.id}`).classList.add('hidden');
                document.getElementById(`img-icon-${role.id}`)?.classList.remove('hidden');
            });
            updateStatusBadge('empty');
            Swal.fire('สำเร็จ', 'ล้างข้อมูลเรียบร้อย', 'success');
        }
    }
}

// ==========================================
// 7. บันทึกข้อมูล & อัปโหลดรูปไป Google Drive
// ==========================================
async function saveNetworkData(e) {
    e.preventDefault();
    const classId = document.getElementById('select-classroom').value;
    const classroomText = tsClassroom.getItem(classId).innerText;
    const roomFormat = classroomText.replace('ม.', '').replace('/', '-');

    for (const role of FORM_ROLES) {
        if (!document.getElementById(`${role.id}_name`).value) {
            goToStep(FORM_ROLES.indexOf(role) + 1);
            Swal.fire('ข้อมูลไม่ครบ', `กรุณากรอกข้อมูลของ ${role.title} ให้ครบถ้วนครับ`, 'warning');
            return;
        }
    }

// ----------------------------------------------------------------
    // 🔥 แก้ไขปัญหาครูบันทึกไม่ได้: ยิงตรงไปดึงค่า Settings จากฐานข้อมูล
    // ----------------------------------------------------------------
    if (!moduleSettings || !moduleSettings.gd_api_url) {
        try {
            // อ้างอิงชื่อตารางจากภาพ Supabase ของคุณ (module_parent_network_settings)
            const { data: settingsData, error: settingsError } = await db
                .from('module_parent_network_settings')
                .select('*')
                .single();

            if (settingsData && !settingsError) {
                moduleSettings = settingsData;
            }
        } catch (err) {
            console.error("Fetch Settings Error:", err);
        }
    }
    // ----------------------------------------------------------------

    if (!moduleSettings || !moduleSettings.gd_api_url || !moduleSettings.gd_folder_id) {
        return Swal.fire(
            'ไม่สามารถบันทึกได้', 
            'แอดมินตั้งค่าแล้ว แต่สิทธิ์ฐานข้อมูล (RLS) ของตารางตั้งค่าใน Supabase ปิดกั้นไม่ให้ครูมองเห็น กรุณาเปิดสิทธิ์ให้อ่านได้', 
            'error'
        );
    }

    Swal.fire({ title: 'กำลังบันทึกและอัปโหลด...', html: 'กระบวนการนี้อาจใช้เวลาสักครู่ กรุณาอย่าปิดหน้าต่าง', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    
    try {
        const payload = { classroom_id: classId, academic_year: currentYear, semester: currentTerm, updated_at: new Date() };
        for (const role of FORM_ROLES) {
            const imgElement = document.getElementById(`img-preview-${role.id}`);
            let finalImageUrl = imgElement.src || '';
            
            if (finalImageUrl.startsWith('data:image')) {
                Swal.update({ html: `กำลังอัปโหลดรูปภาพ ${role.title}...` });
                finalImageUrl = await uploadImageToDrive(finalImageUrl, `${roomFormat}_${role.title}`);
            }
            
            finalImageUrl = getGoogleDriveDirectUrl(finalImageUrl);
            
            payload[`${role.id}_data`] = {
                name: document.getElementById(`${role.id}_name`).value,
                phone: document.getElementById(`${role.id}_phone`).value,
                relation: document.getElementById(`${role.id}_relation`).value,
                student_name: document.getElementById(`${role.id}_student_name`).value,
                job: document.getElementById(`${role.id}_job`).value,
                address: document.getElementById(`${role.id}_address`).value,
                village: document.getElementById(`${role.id}_village`).value,
                district: document.getElementById(`${role.id}_district`).value,
                amphoe: document.getElementById(`${role.id}_amphoe`).value,
                province: document.getElementById(`${role.id}_province`).value,
                zip: document.getElementById(`${role.id}_zip`).value,
                image_url: finalImageUrl
            };
        }
        
        Swal.update({ html: 'กำลังบันทึกข้อมูลลงฐานระบบ...' });
        const { error } = await db.from('module_parent_network').upsert(payload, { onConflict: 'classroom_id,academic_year,semester' });
        
        if (error) throw error;
        
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลและอัปโหลดรูปภาพเรียบร้อยแล้ว', 'success');
        updateStatusBadge('completed');
        
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function uploadImageToDrive(base64String, fileName) {
    const cleanBase64 = base64String.split(',')[1];
    const response = await fetch(moduleSettings.gd_api_url, {
        method: 'POST',
        body: JSON.stringify({ base64: cleanBase64, fileName, folderId: moduleSettings.gd_folder_id })
    });
    const result = await response.json();
    if (result.status === 'success') return getGoogleDriveDirectUrl(result.url);
    throw new Error(result.message);
}

// ==========================================
// 8. ตั้งค่าระบบ & Module Admin (Modal)
// ==========================================
async function loadAdminSettings() {
    const { data } = await db.from('module_parent_network_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
        moduleSettings = data;
        document.getElementById('set-upload-api-url').value = data.gd_api_url || '';
        document.getElementById('set-folder-id').value = data.gd_folder_id || '';
        document.getElementById('set-pdf-api-url').value = data.pdf_api_url || '';
        document.getElementById('set-slide-id').value = data.slide_template_url || '';
    }
    // ✅ โหลดทั้ง 2 พร้อมกัน แทนที่จะเรียก sequential
    await Promise.all([loadTeachersForAppoint(), loadModuleAdminsList()]);
}

async function openAdminModal() {
    document.getElementById('admin-modal').classList.remove('hidden');
    await loadTeachersForAppoint();
    await loadModuleAdminsList();
}

function closeAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function saveAdminSettings() {
    const payload = {
        id: 1,
        gd_api_url: document.getElementById('set-upload-api-url').value.trim(),
        gd_folder_id: document.getElementById('set-folder-id').value.trim(),
        pdf_api_url: document.getElementById('set-pdf-api-url').value.trim(),
        slide_template_url: document.getElementById('set-slide-id').value.trim(),
        updated_at: new Date()
    };
    const { error } = await db.from('module_parent_network_settings').upsert(payload);
    if (!error) {
        moduleSettings = payload;
        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าระบบเรียบร้อย', 'success');
        closeAdminModal();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกได้: ' + error.message, 'error');
    }
}

async function loadTeachersForAppoint() {
    const { data } = await db.from('core_personnel').select('id, first_name, last_name').order('first_name');
    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาชื่อครู --</option>';
    if (data) data.forEach(teacher => select.innerHTML += `<option value="${teacher.id}">${teacher.first_name} ${teacher.last_name}</option>`);
    if (tsTeacherAppoint) tsTeacherAppoint.destroy();
    tsTeacherAppoint = new TomSelect("#select-teacher-appoint", { create: false, placeholder: "ค้นหาชื่อครู..." });
}

async function loadModuleAdminsList() {
    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400">กำลังโหลด...</td></tr>';
    const { data } = await db.from('core_module_admins').select(`id, core_personnel (id, first_name, last_name)`).eq('module_id', 'parent_network');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400 text-xs">ยังไม่มีการแต่งตั้งผู้ดูแลระบบ</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(admin => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 font-bold text-slate-700 flex items-center gap-2">
                <div class="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px]"><i class="fas fa-user-shield"></i></div>
                ${admin.core_personnel.first_name} ${admin.core_personnel.last_name}
            </td>
            <td class="py-3 px-4 text-center">
                <button onclick="removeModuleAdmin('${admin.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');
}

async function appointModuleAdmin() {
    const teacherId = document.getElementById('select-teacher-appoint').value;
    if (!teacherId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชื่อครูที่ต้องการแต่งตั้ง', 'warning');
    Swal.fire({ title: 'กำลังแต่งตั้ง...', didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_module_admins').insert({ user_id: teacherId, module_id: 'parent_network' });
    if (error) {
        if (error.code === '23505') return Swal.fire('แจ้งเตือน', 'ครูท่านนี้เป็นแอดมินอยู่แล้ว', 'info');
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }
    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'แต่งตั้งแอดมินโมดูลเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
    tsTeacherAppoint.clear();
    loadModuleAdminsList();
}

async function removeModuleAdmin(recordId) {
    const result = await Swal.fire({
        title: 'ยืนยันการปลดสิทธิ์?', text: "ครูท่านนี้จะกลับไปเห็นข้อมูลเฉพาะห้องประจำชั้นของตนเอง",
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ปลดสิทธิ์'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('core_module_admins').delete().eq('id', recordId);
        if (!error) {
            Swal.fire({ icon: 'success', title: 'ปลดสิทธิ์เรียบร้อย', timer: 1500, showConfirmButton: false });
            loadModuleAdminsList();
        }
    }
}

// ==========================================
// 9. ฟังก์ชันช่วยเหลือ (Status, Steps, Image)
// ==========================================
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
        document.getElementById(`step-content-${i + 1}`)?.classList.toggle('hidden', i + 1 !== step);
        document.getElementById(`step-btn-${i + 1}`)?.classList.toggle('active', i + 1 === step);
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
            document.getElementById(`img-icon-${roleId}`)?.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function getGoogleDriveDirectUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:image') || url.includes('googleusercontent.com/d/')) return url;
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return `https://lh5.googleusercontent.com/d/${match[1]}`;
    return url;
}

// ==========================================
// 10. DataTable & Dashboard (แก้ไขแล้ว ไม่มี SyntaxError)
// ==========================================
// Cache ระดับ module เพื่อไม่ต้อง query ซ้ำ
let personnelCache = null;

async function getPersonnelMap() {
    // ถ้ายิงดึงข้อมูลมาแล้ว ให้ใช้แคชเดิมได้เลย
    if (personnelCache) return personnelCache;
    
    // 1. เพิ่ม avatar_url ในการ select ข้อมูล
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name, avatar_url');
    
    personnelCache = {};
    (data || []).forEach(p => {
        if (p?.id) {
            // 2. เก็บเป็น Object แทน String ธรรมดา
            // (และเพิ่ม .toString() เผื่อระบบอื่นดึงไปใช้แบบ String จะได้ไม่พังครับ)
            personnelCache[p.id] = {
                name: `${p.prefix || ''}${p.first_name} ${p.last_name}`,
                avatar_url: p.avatar_url || '',
                toString: function() { return this.name; } // ป้องกัน Error กับโค้ดส่วนอื่น
            };
        }
    });
    return personnelCache;
}

async function loadDataTable() {
    const tbody = document.getElementById('tb-network');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังดึงข้อมูล...</td></tr>';

    try {
        // ---------------------------------------------------------
        // 1. สร้าง Query ดึงรายชื่อห้องเรียนตามสิทธิ์ และกรองเทอม/ปีปัจจุบัน
        // ---------------------------------------------------------
        let classQuery = db.from('core_classrooms')
            .select('*')
            .eq('academic_year', currentYear)
            .eq('semester', currentTerm)
            .order('grade_level')
            .order('room_number');

        if (currentViewRole === 'teacher') {
            classQuery = classQuery.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
            
        } else if (currentViewRole === 'head_grade') {
            const { data: gh } = await db.from('behavior_grade_heads')
                .select('grade_level')
                .eq('teacher_id', currentUser.id)
                .maybeSingle();
                
            if (gh && gh.grade_level) {
                classQuery = classQuery.eq('grade_level', gh.grade_level);
            } else {
                classQuery = classQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
        }

        // ---------------------------------------------------------
        // 2. ดึงข้อมูล 3 ส่วนพร้อมกัน (เพิ่มการดึง pdf_url)
        // ---------------------------------------------------------
        const [
            { data: classrooms, error: classErr },
            { data: networks, error: netErr },
            staffMap
        ] = await Promise.all([
            classQuery,
            db.from('module_parent_network')
                .select('classroom_id, pdf_url') // 🔥 เพิ่ม pdf_url
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm),
            getPersonnelMap()
        ]);

        if (classErr) throw classErr;
        if (netErr) throw netErr;

        if (!classrooms || classrooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400">ไม่พบข้อมูลห้องเรียนในความรับผิดชอบของภาคเรียนนี้</td></tr>';
            renderDashboard(0, 0);
            return;
        }

        // 🔥 สร้าง Map เพื่อเก็บข้อมูลเครือข่ายและลิงก์ PDF ของแต่ละห้องให้ค้นหาง่ายขึ้น
        const networkMap = {};
        (networks || []).forEach(n => {
            networkMap[n.classroom_id] = n;
        });
        
        let actualCompletedCount = 0; 

        // ---------------------------------------------------------
        // 3. วาดตาราง (Render Table)
        // ---------------------------------------------------------
        tbody.innerHTML = classrooms.map(cls => {
            const room = `ม.${cls.grade_level}/${cls.room_number}`;
            
            const adv1 = staffMap[cls.adviser_id_1];
            const adv2 = staffMap[cls.adviser_id_2];
            const adviser1 = adv1 ? (typeof adv1 === 'object' ? adv1.name : adv1) : '-';
            const adviser2 = adv2 ? (typeof adv2 === 'object' ? adv2.name : adv2) : '-';
            
            // ตรวจสอบข้อมูลจาก networkMap
            const networkData = networkMap[cls.id];
            const isRecorded = !!networkData;
            const existingPdfUrl = networkData?.pdf_url || '';
            
            if (isRecorded) {
                actualCompletedCount++;
            }
            
            const canEdit = currentViewRole !== 'head_discipline';

            const statusBadge = isRecorded 
                ? `<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase"><i class="fas fa-check mr-1"></i> บันทึกแล้ว</span>`
                : `<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase"><i class="fas fa-times mr-1"></i> ยังไม่บันทึก</span>`;

            const editBtn = canEdit
                ? `<button onclick="editFromTable('${cls.id}')" class="text-blue-500 hover:text-blue-700 p-2 transition-all" title="แก้ไข/บันทึกข้อมูล"><i class="fas fa-edit"></i></button>`
                : `<button onclick="editFromTable('${cls.id}')" class="text-slate-400 hover:text-blue-600 p-2 transition-all" title="ดูข้อมูล"><i class="fas fa-eye"></i></button>`;

            // 🔥 ปรับปรุงปุ่ม PDF ให้รองรับรูปดวงตาและปุ่มรีเฟรช
            let printBtn = '';
            if (isRecorded) {
                if (existingPdfUrl) {
                    printBtn = `
                        <a href="${existingPdfUrl}" target="_blank" class="text-blue-500 hover:text-blue-700 p-2 transition-all" title="เปิดดู PDF เดิม">
                            <i class="fas fa-eye"></i>
                        </a>
                        <button onclick="printPDF('${cls.id}', true)" class="text-slate-400 hover:text-green-600 p-2 transition-all" title="สร้าง PDF ใหม่ทดแทนไฟล์เดิม">
                            <i class="fas fa-sync-alt text-xs"></i>
                        </button>
                    `;
                } else {
                    printBtn = `
                        <button onclick="printPDF('${cls.id}')" class="text-green-500 hover:text-green-700 p-2 transition-all" title="สร้างไฟล์ PDF">
                            <i class="fas fa-file-pdf"></i>
                        </button>
                    `;
                }
            } else {
                printBtn = `
                    <button disabled class="text-slate-200 p-2 cursor-not-allowed" title="ต้องบันทึกข้อมูลก่อนพิมพ์">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                `;
            }

            return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="py-4 px-4 font-black text-slate-700">${room}</td>
                <td class="py-4 px-4 font-bold text-blue-800">${adviser1}</td>
                <td class="py-4 px-4 text-slate-600">${adviser2}</td>
                <td class="py-4 px-4 text-center">${statusBadge}</td>
                <td class="py-4 px-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        ${editBtn}
                        ${printBtn}
                    </div>
                </td>
            </tr>`;
        }).join('');

        // ส่งจำนวนที่นับได้จริงๆ ไปให้ Dashboard แสดงผล
        renderDashboard(classrooms.length, actualCompletedCount);

    } catch (error) {
        console.error("Table Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-10"><i class="fas fa-exclamation-triangle mr-2"></i>เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
        renderDashboard(0, 0);
    }
}

function renderDashboard(totalClassrooms, completedCount) {
    const container = document.getElementById('dashboard-stats');
    if (!container) return;

    // 🔍 เช็คว่าตอนนี้ระบบมองเห็นสิทธิ์เป็นอะไร
    console.log("👉 สิทธิ์ตอนนี้คือ:", currentViewRole);

    let displayTotal = 'ที่รับผิดชอบ';
    
    // 🔥 ปรับเงื่อนไขให้ยืดหยุ่นขึ้น เผื่อมีช่องว่างหรือตัวพิมพ์เล็ก/ใหญ่
    const role = (currentViewRole || '').trim().toLowerCase();
    
    if (['super_admin', 'module_admin', 'head_discipline'].includes(role)) {
        displayTotal = 'ทั้งหมด'; 
    } else if (role === 'head_grade') {
        displayTotal = 'ในระดับชั้น'; 
    }

    const remaining = Math.max(0, totalClassrooms - completedCount);

    container.innerHTML = `
        <div class="glass-card rounded-2xl p-5 border-l-4 border-blue-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">ห้องเรียน${displayTotal}</p>
            <h3 class="text-3xl font-black text-blue-700">${totalClassrooms} <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
        <div class="glass-card rounded-2xl p-5 border-l-4 border-emerald-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">บันทึกสมบูรณ์แล้ว</p>
            <h3 class="text-3xl font-black text-emerald-600">${completedCount} <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
        <div class="glass-card rounded-2xl p-5 border-l-4 border-amber-500">
            <p class="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">รอการบันทึก</p>
            <h3 class="text-3xl font-black text-amber-600">${remaining} <span class="text-sm font-bold text-slate-400">ห้อง</span></h3>
        </div>
    `;
}

function editFromTable(classroomId) {
    if (tsClassroom) tsClassroom.setValue(classroomId);
    else document.getElementById('select-classroom').value = classroomId;
    switchTab('form');
}

// ==========================================
// 11. Export Excel
// ==========================================
async function exportToExcel() {
    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', text: 'ระบบกำลังดึงข้อมูลเครือข่าย ครูที่ปรึกษา และหัวหน้าระดับชั้น', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        // ✅ รัน 3 queries พร้อมกัน
        const [
            { data: networkData, error: netError },
            { data: ghData },
            staffMap
        ] = await Promise.all([
            db.from('module_parent_network')
                .select('*, core_classrooms(id, grade_level, room_number, adviser_id_1, adviser_id_2)')
                .eq('academic_year', currentYear).eq('semester', currentTerm),
            db.from('behavior_grade_heads').select('grade_level, teacher_id'),
            getPersonnelMap()
        ]);

        if (netError) throw netError;
        if (!networkData?.length) return Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลการบันทึกในเทอม/ปีการศึกษานี้', 'info');

        const gradeHeadMap = {};
        (ghData || []).forEach(gh => {
            if (gh?.grade_level != null && gh.teacher_id)
                gradeHeadMap[String(gh.grade_level)] = staffMap[gh.teacher_id] || '-';
        });

        // ✅ อัปเดต Headers เพิ่มคอลัมน์ อาชีพ
        const headers = [
            "ห้องเรียน", 
            "ประธานเครือข่าย", "ที่อยู่", "เบอร์โทรประธาน", "อาชีพ(ประธาน)", "ชื่อนักเรียน (บุตรประธาน)",
            "รองประธาน", "ที่อยู่", "เบอร์โทรรองฯ", "อาชีพ(รองฯ)", "ชื่อนักเรียน (บุตรรองประธาน)",
            "เลขานุการ", "ที่อยู่", "เบอร์โทรเลขาฯ", "อาชีพ(เลขาฯ)", "ชื่อนักเรียน (บุตรเลขานุการ)",
            "นายทะเบียน", "ที่อยู่", "เบอร์โทรนายทะเบียน", "อาชีพ(นายทะเบียน)", "ชื่อนักเรียน (บุตรนายทะเบียน)",
            "ประชาสัมพันธ์", "ที่อยู่", "เบอร์โทรประชาสัมพันธ์", "อาชีพ(ประชาสัมพันธ์)", "ชื่อนักเรียน (บุตรประชาสัมพันธ์)",
            "ครูที่ปรึกษาคนที่ 1", "ครูที่ปรึกษาคนที่ 2", "หัวหน้าระดับชั้น"
        ];
        
        const excelRows = [headers];
        
        const buildAddress = (data) => {
            if (!data) return '-';
            const parts = [data.address || '', data.village || '', data.district ? `ต.${data.district}` : '', data.amphoe ? `อ.${data.amphoe}` : '', data.province ? `จ.${data.province}` : '', data.zip || ''].filter(p => p).join(' ');
            return parts || '-';
        };
        
        // ✅ อัปเดตการดึงข้อมูล แทรก item.[role]_data?.job เข้าไปตามลำดับ
        networkData.forEach(item => {
            const cls = item.core_classrooms;
            if (!cls) return;
            excelRows.push([
                `ม.${cls.grade_level}/${cls.room_number}`,
                
                // ประธาน
                item.president_data?.name || '-', buildAddress(item.president_data), item.president_data?.phone || '-', item.president_data?.job || '-', item.president_data?.student_name || '-',
                
                // รองประธาน
                item.vp_data?.name || '-', buildAddress(item.vp_data), item.vp_data?.phone || '-', item.vp_data?.job || '-', item.vp_data?.student_name || '-',
                
                // เลขานุการ
                item.secretary_data?.name || '-', buildAddress(item.secretary_data), item.secretary_data?.phone || '-', item.secretary_data?.job || '-', item.secretary_data?.student_name || '-',
                
                // นายทะเบียน
                item.registrar_data?.name || '-', buildAddress(item.registrar_data), item.registrar_data?.phone || '-', item.registrar_data?.job || '-', item.registrar_data?.student_name || '-',
                
                // ประชาสัมพันธ์
                item.pr_data?.name || '-', buildAddress(item.pr_data), item.pr_data?.phone || '-', item.pr_data?.job || '-', item.pr_data?.student_name || '-',
                
                staffMap[cls.adviser_id_1] || '-', staffMap[cls.adviser_id_2] || '-', gradeHeadMap[String(cls.grade_level)] || '-'
            ]);
        });
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelRows);
        ws['!cols'] = headers.map(() => ({ wch: 25 }));
        XLSX.utils.book_append_sheet(wb, ws, "NetworkReport");
        XLSX.writeFile(wb, `รายงานเครือข่ายผู้ปกครอง_${currentTerm}_${currentYear}.xlsx`);
        Swal.fire('สำเร็จ', 'ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
        
    } catch (err) {
        console.error("Export Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้: ' + err.message, 'error');
    }
}

// ==========================================
// 12. Navigation
// ==========================================
function switchTab(tabId) {
    document.getElementById('tab-form').classList.toggle('hidden', tabId !== 'form');
    document.getElementById('tab-data').classList.toggle('hidden', tabId !== 'data');
    if (tabId === 'data') loadDataTable();
}

// ==========================================
// 13. พิมพ์ PDF (แก้ prefix)
// ==========================================
async function printPDF(classroomId, forceGenerate = false) {
    if (!moduleSettings || !moduleSettings.pdf_api_url || !moduleSettings.slide_template_url) {
        try {
            const { data: settingsData, error: settingsError } = await db
                .from('module_parent_network_settings')
                .select('*')
                .single();

            if (settingsData && !settingsError) moduleSettings = settingsData;
        } catch (err) {
            console.error("Fetch Settings Error:", err);
        }
    }

    if (!moduleSettings || !moduleSettings.pdf_api_url || !moduleSettings.slide_template_url) {
        return Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณาระบุ PDF API URL และ Slide ID ในเมนู "ตั้งค่าระบบ"', 'warning');
    }

    // 💡 ปรับปรุงข้อความให้ผู้ใช้ทราบกรณีสั่งทำใหม่
    const loadingText = forceGenerate 
        ? 'ระบบกำลังลบไฟล์ PDF เดิม และกำลังประมวลผลไฟล์ใหม่ซ้ำอีกครั้ง...' 
        : 'ระบบกำลังดึงข้อมูลและประมวลผลผ่าน Google Apps Script<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>';

    Swal.fire({ 
        title: forceGenerate ? 'กำลังสร้างไฟล์ PDF ใหม่...' : 'กำลังสร้างไฟล์ PDF...', 
        html: loadingText, 
        didOpen: () => Swal.showLoading(), 
        allowOutsideClick: false,
        showConfirmButton: false 
    });

    try {
        const [{ data: network, error }, staffMap] = await Promise.all([
            db.from('module_parent_network')
                .select('*, core_classrooms(grade_level, room_number, adviser_id_1, adviser_id_2)')
                .eq('classroom_id', classroomId)
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm)
                .single(),
            getPersonnelMap()
        ]);

        if (error || !network) throw new Error('ไม่พบข้อมูลเครือข่ายของห้องนี้');
        
        // ❌ นำเงื่อนไขช็อตคัตเดิมออก เพื่อให้กรณี forceGenerate = true วิ่งทะลุไปสั่งลบและสร้างใหม่ที่ฝั่ง GAS เสมอ
        if (!forceGenerate && network.pdf_url) {
            Swal.close();
            window.open(network.pdf_url, '_blank');
            return;
        }

        const cls = network.core_classrooms;
        const room = `${cls.grade_level}/${cls.room_number}`;
        const adviser1Obj = staffMap[cls.adviser_id_1];
        const adviser1Name = adviser1Obj ? adviser1Obj.name : '-';
        const adviser1Image = adviser1Obj?.avatar_url || '';
        const adviser2Obj = staffMap[cls.adviser_id_2];
        const adviser2Name = adviser2Obj ? adviser2Obj.name : '-';
        const adviser2Image = adviser2Obj?.avatar_url || '';

        const { data: gradeHead } = await db.from('behavior_grade_heads')
            .select('teacher_id').eq('grade_level', cls.grade_level).maybeSingle();
            
        let gradeHeadName = '-';
        let gradeHeadImage = '';
        if (gradeHead?.teacher_id && staffMap[gradeHead.teacher_id]) {
            const ghObj = staffMap[gradeHead.teacher_id];
            gradeHeadName = ghObj.name;
            gradeHeadImage = ghObj.avatar_url || '';
        }

        const replacements = {
            "{{CLASSROOM}}": room, "{{TERM}}": currentTerm, "{{YEAR}}": currentYear,
            "{{ADVISER1}}": adviser1Name, "{{ADVISER2}}": adviser2Name, "{{GRADE_HEAD}}": gradeHeadName,
            "{{ADVISER1_IMAGE}}": adviser1Image, "{{ADVISER2_IMAGE}}": adviser2Image, "{{GRADE_HEAD_IMAGE}}": gradeHeadImage
        };

        FORM_ROLES.forEach(role => {
            const roleData = network[`${role.id}_data`] || {};
            const PREFIX = role.id.toUpperCase();
            replacements[`{{${PREFIX}_NAME}}`] = roleData.name || '-';
            replacements[`{{${PREFIX}_PHONE}}`] = roleData.phone || '-';
            replacements[`{{${PREFIX}_RELATION}}`] = roleData.relation || '-';
            replacements[`{{${PREFIX}_STUDENT_NAME}}`] = roleData.student_name || '-';
            replacements[`{{${PREFIX}_JOB}}`] = roleData.job || '-';
            replacements[`{{${PREFIX}_ADDRESS}}`] = roleData.address || '-';
            replacements[`{{${PREFIX}_VILLAGE}}`] = roleData.village || '-';
            replacements[`{{${PREFIX}_DISTRICT}}`] = roleData.district || '-';
            replacements[`{{${PREFIX}_AMPHOE}}`] = roleData.amphoe || '-';
            replacements[`{{${PREFIX}_PROVINCE}}`] = roleData.province || '-';
            replacements[`{{${PREFIX}_ZIP}}`] = roleData.zip || '-';
            replacements[`{{${PREFIX}_IMAGE}}`] = roleData.image_url || '';
        });

        const payload = {
            templateId: moduleSettings.slide_template_url,
            pdfFolderId: moduleSettings.gd_pdf_folder_id, 
            fileName: `เครือข่าย_${room}_${currentTerm}_${currentYear}`,
            replacements
        };

        const response = await fetch(moduleSettings.pdf_api_url, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success' && result.url) {
            // อัปเดตข้อมูลลิงก์ใหม่ลงฐานข้อมูล (กรณีบังคับเจน ลิงก์จาก Google Drive จะเปลี่ยนไปตาม ID ใหม่)
            await db.from('module_parent_network')
                .update({ pdf_url: result.url })
                .eq('classroom_id', classroomId)
                .eq('academic_year', currentYear)
                .eq('semester', currentTerm);

            Swal.close();
            window.open(result.url, '_blank');
            loadDataTable(); // รีเฟรชตารางใหม่
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}
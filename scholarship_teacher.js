// ==========================================
// scholarship_teacher.js (ฉบับสมบูรณ์ แก้ไขล่าสุด)
// - ย้ายปุ่มบันทึกทุนขึ้น Nav Bar
// - แท็บผู้รับทุน (DataTable) เป็นแท็บแรก
// - ปุ่มโหมดตัวหนาตลอด
// - ครูที่ปรึกษามีคำนำหน้า "ครู"
// - รองรับกรณีไม่มีคอลัมน์ note
// - แก้ไข switchTab ใช้ active class
// - ลบฟังก์ชันซ้ำซ้อน
// ==========================================

// ===== STATE VARIABLES =====
let currentUser = null;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let currentYear = '';
let currentTerm = '';
let currentClassroomId = null;
let studentTomSelect = null;
let tsClassroom = null;
let recordStudentTomSelect = null;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_id: "" };
let currentStudentForForm = null;
let _scholarshipTableWarningShown = false;
let recordSearchCache = {};

// ========== AUTH & INIT ==========
$(document).ready(async () => {
    try {
        await checkAuth();
        await loadModuleSettings();
        initTomSelects();
        await loadClassrooms();
        applyAdminVisibility();
        document.getElementById('mainBody').classList.add('loaded');

        // ✅ ตั้งค่าแท็บเริ่มต้น (ผู้รับทุน)
        switchTab('recipients');
    } catch (err) { console.error(err); }
});

async function checkAuth() {
    Swal.fire({ title: 'กำลังตรวจสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('login.html');
    const [{ data: profile }, { data: sInfo }] = await Promise.all([
        db.from('core_personnel').select('*').eq('id', session.user.id).single(),
        db.from('core_school_info').select('current_academic_year, current_semester').single()
    ]);
    if (!profile) return window.location.replace('login.html');
    currentUser = profile;
    actualRole = profile.role;
    if (sInfo) {
        currentYear = sInfo.current_academic_year;
        currentTerm = sInfo.current_semester;
        document.getElementById('term-display').innerText = `${currentTerm}/${currentYear}`;
    }
    const { data: modAdmin } = await db.from('core_scholarship_admins').select('id').eq('user_id', currentUser.id).maybeSingle();
    const { data: discHead } = await db.from('core_discipline_heads').select('id').eq('personnel_id', currentUser.id).eq('academic_year', currentYear).maybeSingle();
    const { data: gradeHead } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).maybeSingle();
    if (actualRole === 'super_admin') currentViewRole = 'super_admin';
    else if (modAdmin) currentViewRole = 'module_admin';
    else if (discHead) currentViewRole = 'head_discipline';
    else if (gradeHead) currentViewRole = 'head_grade';
    else currentViewRole = 'teacher';
    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);
    updateUIByRole();
    if (actualRole !== 'teacher') {
        document.getElementById('btnAdminMode')?.classList.remove('hidden');
    }
    updateAdminModeButton();
    Swal.close();
}

function updateUIByRole() {
    document.getElementById('userNameDisplay').innerText = `ครู${currentUser.first_name} ${currentUser.last_name}`;
    let roleText = 'ครูที่ปรึกษา';
    if (currentViewRole === 'super_admin') roleText = 'ผู้ดูแลระบบสูงสุด';
    else if (currentViewRole === 'module_admin') roleText = 'แอดมินโมดูลทุน';
    else if (currentViewRole === 'head_discipline') roleText = 'หัวหน้างานปกครอง (ดูอย่างเดียว)';
    else if (currentViewRole === 'head_grade') roleText = 'หัวหน้าระดับชั้น (ดูอย่างเดียว)';
    document.getElementById('userRoleDisplay').innerText = roleText;
    applyAdminVisibility();
}

function updateAdminModeButton() {
    const btn = document.getElementById('btnAdminMode');
    if (!btn) return;
    if (currentViewRole === 'teacher') {
        btn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i><span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
        btn.className = 'flex h-8 md:h-10 px-2 md:px-3 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition border border-purple-200 shadow-sm text-xs md:text-sm font-bold whitespace-nowrap';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i><span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
        btn.className = 'flex h-8 md:h-10 px-2 md:px-3 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200 shadow-sm text-xs md:text-sm font-bold whitespace-nowrap';
    }
}

window.toggleRoleView = function() {
    if (actualRole === 'teacher') return;
    currentViewRole = (currentViewRole === 'teacher') ? actualRole : 'teacher';
    isReadOnly = ['head_grade', 'head_discipline'].includes(currentViewRole);
    updateAdminModeButton();
    updateUIByRole();
    loadClassrooms();
    Swal.fire({
        toast: true,
        icon: 'info',
        title: `สลับเป็น${currentViewRole === 'teacher' ? 'โหมดครู' : 'โหมดผู้ดูแล'}`,
        timer: 1500
    });
};

function applyAdminVisibility() {
    const isAdmin = ['super_admin', 'module_admin'].includes(currentViewRole);
    document.getElementById('admin-settings-btn')?.classList.toggle('hidden', !isAdmin);
    const recordBtnNav = document.getElementById('btnRecordScholarshipNav');
    if (recordBtnNav) {
        if (isAdmin) {
            recordBtnNav.classList.add('visible');
            recordBtnNav.classList.remove('admin-only');
        } else {
            recordBtnNav.classList.remove('visible');
            recordBtnNav.classList.add('admin-only');
        }
    }
    const recordBtn = document.getElementById('btnRecordScholarship');
    if (recordBtn) {
        recordBtn.style.display = 'none !important';
    }
}

async function loadModuleSettings() {
    try {
        const { data } = await db.from('core_scholarship_settings').select('settings').single();
        if (data?.settings) moduleSettings = data.settings;
    } catch (e) {
        console.warn('Settings table not ready yet:', e.message);
        moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_id: "" };
    }
}

async function loadClassrooms() {
    let query = db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', currentTerm)
        .order('grade_level').order('room_number');
    const isHighLevel = ['super_admin', 'module_admin', 'head_discipline'].includes(currentViewRole);
    if (currentViewRole === 'head_grade') {
        const { data: gh } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).single();
        if (gh) query = query.eq('grade_level', gh.grade_level);
        else query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else if (!isHighLevel) {
        query = query.or(`adviser_id_1.eq.${currentUser.id},adviser_id_2.eq.${currentUser.id}`);
    }
    const { data: classrooms } = await query;
    const select = document.getElementById('select-classroom');
    if (tsClassroom) tsClassroom.destroy();
    select.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
    (classrooms || []).forEach(c => {
        select.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
    });
    tsClassroom = new TomSelect("#select-classroom", {
        create: false,
        placeholder: "ค้นหาห้องเรียน",
        onChange: (val) => { if (val) onClassroomSelected(val); else clearClassroomSelection(); }
    });
    if (currentViewRole === 'teacher' && classrooms && classrooms.length === 1) tsClassroom.setValue(classrooms[0].id);
}

async function onClassroomSelected(classroomId) {
    currentClassroomId = classroomId;
    await loadStudentsForTable(classroomId);
    await loadStudentSelectForForm(classroomId);
    document.getElementById('status-badge').innerHTML = `<i class="fas fa-check-circle text-emerald-500"></i> ห้องเรียนถูกเลือกแล้ว`;
    if ($('#tab-list').hasClass('active')) {
        loadStudentsForTable(classroomId);
    }
}

function clearClassroomSelection() {
    currentClassroomId = null;
    document.getElementById('status-badge').innerHTML = '<i class="fas fa-circle text-slate-300 text-[8px]"></i> ยังไม่เลือกห้องเรียน';
    document.getElementById('tb-students').innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียน</td></tr>';
}

// ===== TAB: รายการทุน (ห้องเรียน) =====
async function loadStudentsForTable(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments').select(
        'student_number, student_id, core_students(id, student_id_card, prefix, first_name, last_name, avatar_students_url)'
    ).eq('classroom_id', classroomId).order('student_number');
    if (!enrolls?.length) {
        document.getElementById('tb-students').innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-400">ไม่มีนักเรียน</td></tr>';
        return;
    }
    const studentIds = enrolls.map(e => e.student_id);
    let schMap = {};
    try {
        const { data: scholarships, error } = await db.from('core_scholarships').select('student_id, amount')
            .in('student_id', studentIds).eq('academic_year', currentYear);
        if (error) throw error;
        (scholarships || []).forEach(s => { schMap[s.student_id] = true; });
    } catch (err) {
        console.warn('core_scholarships table missing or error:', err);
        if (!_scholarshipTableWarningShown) {
            _scholarshipTableWarningShown = true;
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่พบตาราง core_scholarships',
                html: `<p>กรุณาสร้างตารางใน Supabase SQL Editor ด้วยคำสั่ง:</p>
                       <pre style="text-align:left;background:#1e293b;color:#e2e8f0;padding:12px;border-radius:12px;font-size:12px;overflow-x:auto;">
CREATE TABLE IF NOT EXISTS public.core_scholarships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.core_students(id) ON DELETE CASCADE,
    scholarship_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    academic_year TEXT NOT NULL,
    semester TEXT NOT NULL,
    scholarship_type TEXT DEFAULT 'ทุนทั่วไป',
    created_by UUID REFERENCES public.core_personnel(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    note TEXT
);
ALTER TABLE public.core_scholarships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all authenticated users" ON public.core_scholarships;
CREATE POLICY "Allow all authenticated users" ON public.core_scholarships
    FOR ALL USING (auth.role() = 'authenticated');</pre>`,
                confirmButtonText: 'เข้าใจแล้ว',
                width: 700
            });
        }
    }
    let html = '';
    for (let e of enrolls) {
        const s = e.core_students;
        const hasSch = schMap[s.id] ? 'เคยได้รับทุน' : 'ไม่เคยได้รับทุน';
        const avatar = s.avatar_students_url ?
            `<img src="${s.avatar_students_url}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-200">` :
            '<div class="w-10 h-10 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center text-slate-500"><i class="fas fa-user"></i></div>';
        html += `<tr class="hover:bg-slate-50/60 transition">
            <td class="p-3">${avatar}</td>
            <td class="p-3 font-medium">${e.student_number}</td>
            <td class="p-3">${s.student_id_card}</td>
            <td class="p-3 font-bold text-slate-800">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
            <td class="p-3"><span class="px-3 py-1 rounded-full text-xs font-bold ${hasSch==='เคยได้รับทุน'?'bg-emerald-100 text-emerald-700':'bg-slate-100'}">${hasSch}</span></td>
            <td class="p-3 text-center">
                <button onclick="viewStudentDetail('${s.id}')" class="action-btn view-btn" title="ดูประวัติ"><i class="fas fa-eye"></i></button>
                <button onclick="requestScholarship('${s.id}')" class="action-btn request-btn" title="ขอทุน"><i class="fas fa-hand-holding-heart"></i><span>ขอทุน</span></button>
            </td>
        </tr>`;
    }
    document.getElementById('tb-students').innerHTML = html;
}

// ===== TAB: ฟอร์มขอรับทุน =====
async function loadStudentSelectForForm(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments').select(
        'student_id, core_students(id, student_id_card, prefix, first_name, last_name)'
    ).eq('classroom_id', classroomId).order('student_number');
    const options = (enrolls || []).map(e => ({
        value: e.core_students.id,
        text: `${e.core_students.student_id_card} - ${e.core_students.prefix || ''}${e.core_students.first_name} ${e.core_students.last_name}`
    }));
    if (studentTomSelect) studentTomSelect.destroy();
    studentTomSelect = new TomSelect('#student_select', {
        create: false,
        placeholder: 'เลือกนักเรียน',
        options,
        onChange: (val) => { if (val) loadStudentDataForForm(val); }
    });
}

async function loadStudentDataForForm(studentId) {
    currentStudentForForm = studentId;
    const { data: enroll } = await db.from('student_enrollments').select(
        'student_number, classroom_id, core_students(*), core_classrooms(grade_level, room_number)'
    ).eq('student_id', studentId).eq('classroom_id', currentClassroomId).single();
    if (!enroll) return;
    const s = enroll.core_students;
    document.getElementById('student_id_card').value = s.student_id_card;
    document.getElementById('student_fullname').value = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
    document.getElementById('student_grade').value = `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}`;
    const { data: classroom } = await db.from('core_classrooms').select('adviser_id_1, adviser_id_2').eq('id', currentClassroomId).single();
    let teacherName = '';
    if (classroom?.adviser_id_1) {
        const { data: t } = await db.from('core_personnel').select('first_name, last_name').eq('id', classroom.adviser_id_1).single();
        if (t) teacherName = `${t.first_name} ${t.last_name}`;
    }
    document.getElementById('teacher_name').value = teacherName;
    const { data: homevisit } = await db.from('module_home_visits').select('*').eq('student_id', studentId).eq('academic_year', currentYear).eq('semester', currentTerm).single();
    if (homevisit) {
        document.getElementById('father_name').value = homevisit.father_name || '';
        document.getElementById('father_job').value = homevisit.father_job || '';
        document.getElementById('father_phone').value = homevisit.father_phone || '';
        document.getElementById('mother_name').value = homevisit.mother_name || '';
        document.getElementById('mother_job').value = homevisit.mother_job || '';
        document.getElementById('mother_phone').value = homevisit.mother_phone || '';
        document.getElementById('guardian_name').value = homevisit.guardian_name || '';
        document.getElementById('guardian_job').value = homevisit.guardian_job || '';
        document.getElementById('guardian_phone').value = homevisit.guardian_phone || '';
        document.getElementById('parents_status').value = homevisit.parents_status || 'อยู่ด้วยกัน';
        document.getElementById('addr_house').value = homevisit.house_number || '';
        document.getElementById('addr_moo').value = homevisit.village_no || '';
        document.getElementById('addr_subdistrict').value = homevisit.sub_district || '';
        document.getElementById('addr_district').value = homevisit.district || '';
        document.getElementById('addr_province').value = homevisit.province || '';
        document.getElementById('addr_zipcode').value = homevisit.zipcode || '';
        if (homevisit.latitude && homevisit.longitude) {
            document.getElementById('map_link').value = `https://www.google.com/maps?q=${homevisit.latitude},${homevisit.longitude}`;
        }
        document.getElementById('preview_outside').src = homevisit.photo_outside || '';
        document.getElementById('preview_inside').src = homevisit.photo_inside || '';
        document.getElementById('preview_teacher').src = homevisit.photo_teacher || '';
        document.getElementById('family_income').value = homevisit.economic_data?.income || '';
    }
}

function copyParentData(type) {
    if (type === 'father') {
        document.getElementById('guardian_name').value = document.getElementById('father_name').value;
        document.getElementById('guardian_job').value = document.getElementById('father_job').value;
        document.getElementById('guardian_phone').value = document.getElementById('father_phone').value;
    } else if (type === 'mother') {
        document.getElementById('guardian_name').value = document.getElementById('mother_name').value;
        document.getElementById('guardian_job').value = document.getElementById('mother_job').value;
        document.getElementById('guardian_phone').value = document.getElementById('mother_phone').value;
    }
}

function openMapFromLink() {
    const link = document.getElementById('map_link').value;
    if (link) window.open(link, '_blank');
    else Swal.fire('ไม่มีพิกัด', 'กรุณาเลือกนักเรียนที่มีข้อมูลพิกัดจากระบบเยี่ยมบ้าน', 'info');
}

async function submitApplication() {
    if (!currentStudentForForm) return Swal.fire('ผิดพลาด', 'กรุณาเลือกนักเรียน', 'error');
    const formData = {
        student_id: currentStudentForForm,
        teacher_id: currentUser.id,
        father: { name: $('#father_name').val(), job: $('#father_job').val(), income: $('#father_income').val(), phone: $('#father_phone').val() },
        mother: { name: $('#mother_name').val(), job: $('#mother_job').val(), income: $('#mother_income').val(), phone: $('#mother_phone').val() },
        guardian: { name: $('#guardian_name').val(), job: $('#guardian_job').val(), income: $('#guardian_income').val(), phone: $('#guardian_phone').val(), workplace: $('#guardian_workplace').val() },
        parents_status: $('#parents_status').val(),
        siblings: { total: $('#siblings_total').val(), study: $('#siblings_study').val(), work: $('#siblings_work').val(), notwork: $('#siblings_notwork').val() },
        dependents: Array.from(document.querySelectorAll('input[name="dependents"]:checked')).map(cb => cb.value),
        address: { house: $('#addr_house').val(), moo: $('#addr_moo').val(), subdistrict: $('#addr_subdistrict').val(), district: $('#addr_district').val(), province: $('#addr_province').val(), zipcode: $('#addr_zipcode').val() },
        map_link: $('#map_link').val(),
        economy: { family_income: $('#family_income').val(), travel_expense: $('#travel_expense').val(), food_expense: $('#food_expense').val(), other_expense: $('#other_expense').val() },
        disease: { has: $('input[name="has_disease"]:checked').val(), name: $('#disease_name').val(), medicine: $('#disease_medicine').val(), hospital: $('#disease_hospital').val() },
        reason: $('#reason').val(),
        usage_plan: $('#usage_plan').val()
    };
    const { error } = await db.from('core_scholarship_applications').insert([{
        student_id: currentStudentForForm,
        teacher_id: currentUser.id,
        form_data: formData,
        status: 'pending',
        reason: formData.reason,
        usage_plan: formData.usage_plan
    }]);
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else Swal.fire('สำเร็จ', 'ส่งคำขอรับทุนเรียบร้อย', 'success').then(() => switchTab('list'));
}

// ===== ดูประวัติรายบุคคล =====
window.viewStudentDetail = async function(studentId) {
    let scholarships = [];
    let hasNote = true;
    try {
        const { data, error } = await db.from('core_scholarships')
            .select('*')
            .eq('student_id', studentId)
            .order('academic_year', { ascending: false });
        if (error) throw error;
        scholarships = data || [];
    } catch (e) {
        if (e.message?.includes('column "note" does not exist')) {
            hasNote = false;
            const { data, error } = await db.from('core_scholarships')
                .select('id, student_id, scholarship_name, amount, academic_year, semester, scholarship_type, created_by, created_at, updated_at')
                .eq('student_id', studentId)
                .order('academic_year', { ascending: false });
            if (error) throw error;
            scholarships = data || [];
        } else {
            throw e;
        }
    }

    const { data: applications } = await db.from('core_scholarship_applications')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

    const totalAmount = scholarships.reduce((sum, s) => sum + (s.amount || 0), 0);

    let html = `<div class="space-y-4">
        <div class="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between">
            <div>
                <span class="text-sm font-bold text-indigo-700"><i class="fas fa-coins mr-1"></i> รวมทุนทั้งหมด</span>
                <p class="text-2xl font-extrabold text-indigo-800">${totalAmount.toLocaleString()} บาท</p>
            </div>
            <div class="text-sm text-indigo-600 bg-white/60 px-4 py-2 rounded-xl shadow-sm">
                <i class="fas fa-trophy mr-1"></i> จำนวนครั้งที่ได้รับทุน: ${scholarships.length}
            </div>
        </div>
        <h4 class="font-bold text-indigo-700"><i class="fas fa-trophy mr-2"></i>ประวัติทุนที่ได้รับ</h4>`;

    if (scholarships.length === 0) {
        html += `<p class="text-slate-400 text-sm">ยังไม่มีประวัติทุน</p>`;
    } else {
        html += `<div class="overflow-x-auto"><table class="w-full text-sm border rounded-xl">
            <thead class="bg-slate-50">
                <tr>
                    <th class="p-2 text-left">ปี</th>
                    <th class="p-2 text-left">ชื่อทุน</th>
                    <th class="p-2 text-left">จำนวนเงิน</th>
                    <th class="p-2 text-left">ภาคเรียน</th>
                    ${hasNote ? '<th class="p-2 text-left">หมายเหตุ</th>' : ''}
                </tr>
            </thead>
            <tbody>`;
        scholarships.forEach(s => {
            html += `<tr class="border-t">
                <td class="p-2">${s.academic_year}</td>
                <td class="p-2 font-medium">${s.scholarship_name}</td>
                <td class="p-2">${s.amount.toLocaleString()} บาท</td>
                <td class="p-2">${s.semester}</td>
                ${hasNote ? `<td class="p-2 text-sm text-slate-500">${s.note || '-'}</td>` : ''}
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `<h4 class="mt-4 font-bold text-indigo-700"><i class="fas fa-file-alt mr-2"></i>คำขอทุนล่าสุด</h4>
        <div class="border rounded-xl p-4 bg-slate-50">${applications?.[0]?.reason || 'ไม่มีคำขอทุน'}</div></div>`;

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailModal').classList.add('flex');
};

window.closeDetailModal = () => {
    document.getElementById('detailModal').classList.add('hidden');
    document.getElementById('detailModal').classList.remove('flex');
};

window.requestScholarship = function(studentId) {
    if (studentTomSelect) studentTomSelect.setValue(studentId);
    switchTab('form');
    goToStep(1);
};

// ===== Navigation Steps =====
let currentStep = 1;

function goToStep(step) {
    currentStep = step;
    $('.step-content').removeClass('active');
    $(`#step-${step}`).addClass('active');
    const progress = (step - 1) * 33.33;
    $('#progressBar').css('width', `${progress}%`);
    for (let i = 1; i <= 4; i++) {
        if (i <= step) {
            $(`#circle-${i}`).removeClass('bg-slate-100 text-slate-400').addClass('bg-amber-600 text-white');
            $(`#text-step-${i}`).removeClass('text-slate-400').addClass('text-amber-700');
        } else {
            $(`#circle-${i}`).removeClass('bg-amber-600 text-white').addClass('bg-slate-100 text-slate-400');
            $(`#text-step-${i}`).removeClass('text-amber-700').addClass('text-slate-400');
        }
    }
}

function nextStep(step) { goToStep(step); }
function prevStep(step) { goToStep(step); }

// ===== SWITCH TAB (แก้ไขแล้ว ใช้ active class) =====
function switchTab(tabId) {
    // 1. ลบ active class ออกจากทุกแท็บ
    $('#tab-recipients, #tab-list, #tab-form').removeClass('active');

    // 2. เพิ่ม active class ให้แท็บที่เลือก
    $(`#tab-${tabId}`).addClass('active');

    // 3. รีเซ็ตคลาสปุ่มทั้งหมด
    $('#tab-recipients-btn, #tab-list-btn, #tab-form-btn').removeClass(
        'active-recipients active-list active-form inactive-recipients inactive-list inactive-form'
    );

    // 4. กำหนดคลาสปุ่มตามแท็บที่เลือก
    if (tabId === 'recipients') {
        $('#tab-recipients-btn').addClass('active-recipients');
        // โหลดข้อมูลผู้รับทุน
        if (!$.fn.DataTable.isDataTable('#recipientTable')) {
            loadRecipientsTabData();
        } else {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } else if (tabId === 'list') {
        $('#tab-list-btn').addClass('active-list');
        if (currentClassroomId) {
            loadStudentsForTable(currentClassroomId);
        } else {
            $('#tb-students').html('<tr><td colspan="6" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียน</td></tr>');
        }
    } else if (tabId === 'form') {
        $('#tab-form-btn').addClass('active-form');
        if (currentClassroomId) {
            loadStudentSelectForForm(currentClassroomId);
        }
    }
}

function loadDataTable() {
    if (currentClassroomId && $('#tab-list').hasClass('active')) {
        loadStudentsForTable(currentClassroomId);
    } else if (!currentClassroomId) {
        $('#tb-students').html('<tr><td colspan="6" class="text-center py-10 text-slate-400">กรุณาเลือกห้องเรียน</td></tr>');
    }
}

function exportToExcel() {
    Swal.fire('ส่งออก Excel', 'กำลังพัฒนาฟังก์ชันส่งออก', 'info');
}

// ===== TAB: ผู้รับทุน (DataTable) =====
function loadRecipientsTabData() {
    if ($.fn.DataTable.isDataTable('#recipientTable')) {
        $('#recipientTable').DataTable().ajax.reload(null, false);
        return;
    }

    // ดึงข้อมูลปีและภาคเรียนเพื่อใส่ dropdown filter
    fetchRecipientsData().then(result => {
        const years = [...new Set(result.data.map(s => s.academic_year).filter(y => y && y !== '-'))];
        const semesters = [...new Set(result.data.map(s => s.semester).filter(s => s))];
        $('#filter-academic-year').html('<option value="">ปีการศึกษา (ทั้งหมด)</option>' + years.map(y => `<option value="${y}">${y}</option>`).join(''));
        $('#filter-semester').html('<option value="">ภาคเรียน (ทั้งหมด)</option>' + semesters.map(s => `<option value="${s}">เทอม ${s}</option>`).join(''));
    });

    $('#recipientTable').DataTable({
        responsive: {
            details: {
                display: $.fn.dataTable.Responsive.display.modal({
                    header: function(row) { return 'รายละเอียดข้อมูล'; }
                }),
                renderer: $.fn.dataTable.Responsive.renderer.tableAll({ tableClass: 'table' })
            }
        },
        pageLength: 15,
        lengthMenu: [
            [10, 15, 25, 50, 100, -1],
            [10, 15, 25, 50, 100, 'ทั้งหมด']
        ],
        order: [[2, 'asc']],
        columnDefs: [
            { targets: 'no-sort', orderable: false },
            { targets: '_all', orderable: true }
        ],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
        },
        ajax: function(data, callback, settings) {
            fetchRecipientsData()
                .then(result => {
                    callback({ data: result.data, recordsTotal: result.total, recordsFiltered: result.total });
                })
                .catch(err => {
                    console.error('Error loading recipients data:', err);
                    callback({ data: [], recordsTotal: 0, recordsFiltered: 0 });
                });
        },
        columns: [
            { data: 'grade', className: 'text-center font-semibold text-slate-600' },
            { data: 'code', className: 'font-mono text-slate-600' },
            { data: 'name', className: 'font-medium text-slate-800' },
            { data: 'scholarship_name', className: 'font-medium text-emerald-700' },
            { data: 'amount', className: 'text-center font-bold text-slate-700', render: d => d ? d.toLocaleString() : 0 },
            { data: 'academic_year', className: 'text-center' },
            { data: 'semester', className: 'text-center', render: d => d ? 'เทอม ' + d : '-' },
            { data: 'note', className: 'text-sm text-slate-500', render: d => d || '-' },
            {
                data: 'id',
                className: 'text-center whitespace-nowrap',
                render: function(id, type, row) {
                    const isAdmin = ['super_admin', 'module_admin'].includes(currentViewRole);
                    let html = `<button onclick="viewScholarshipDetail('${id}')" class="action-btn view-btn" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>`;
                    if (isAdmin) {
                        html += `<button onclick="openEditScholarshipModal('${id}')" class="action-btn text-amber-600 hover:bg-amber-50" title="แก้ไข"><i class="fas fa-edit"></i></button>`;
                        html += `<button onclick="deleteScholarshipRecord('${id}')" class="action-btn text-rose-600 hover:bg-rose-50" title="ลบ"><i class="fas fa-trash"></i></button>`;
                    }
                    return html;
                }
            }
        ],
        drawCallback: function() {
            $('.action-btn').tooltip ? $('.action-btn').tooltip() : null;
            const info = this.api().page.info();
            const isAdmin = ['super_admin', 'module_admin'].includes(currentViewRole);
            $('#recipient-footer').html(
                `<i class="fas fa-database mr-1"></i> พบข้อมูลทั้งหมด ${info.recordsDisplay} รายการ` +
                (!isAdmin ? ' <span class="text-amber-600"><i class="fas fa-info-circle mr-1"></i> เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไข/ลบได้</span>' : '')
            );
        }
    });
}

async function fetchRecipientsData() {
    try {
        let scholarships = [];
        let hasNote = true;
        try {
            const { data, error } = await db.from('core_scholarships')
                .select(`
                    id,
                    student_id,
                    scholarship_name,
                    amount,
                    academic_year,
                    semester,
                    note,
                    created_at,
                    core_students!inner (
                        id,
                        student_id_card,
                        prefix,
                        first_name,
                        last_name
                    )
                `)
                .order('created_at', { ascending: false });
            if (error) throw error;
            scholarships = data || [];
        } catch (e) {
            if (e.message?.includes('column "note" does not exist')) {
                hasNote = false;
                const { data, error } = await db.from('core_scholarships')
                    .select(`
                        id,
                        student_id,
                        scholarship_name,
                        amount,
                        academic_year,
                        semester,
                        created_at,
                        core_students!inner (
                            id,
                            student_id_card,
                            prefix,
                            first_name,
                            last_name
                        )
                    `)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                scholarships = data || [];
            } else {
                throw e;
            }
        }

        if (!scholarships || scholarships.length === 0) {
            return { data: [], total: 0 };
        }

        let classroomMap = {};
        try {
            const studentIds = [...new Set(scholarships.map(s => s.student_id))];
            const { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
                .select('student_id, core_classrooms!inner(grade_level, room_number, academic_year, semester)')
                .in('student_id', studentIds)
                .eq('core_classrooms.academic_year', currentYear)
                .eq('core_classrooms.semester', currentTerm);
            if (enrollErr) throw enrollErr;
            (enrolls || []).forEach(e => {
                const c = e.core_classrooms;
                if (c) classroomMap[e.student_id] = `ม.${c.grade_level}/${c.room_number}`;
            });
        } catch (e) {
            console.warn('Error loading classroom info for recipients:', e.message);
        }

        const data = scholarships.map(s => {
            const student = s.core_students;
            return {
                id: s.id,
                student_id: s.student_id,
                grade: classroomMap[s.student_id] || '-',
                code: student ? student.student_id_card : '-',
                name: student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล',
                scholarship_name: s.scholarship_name,
                amount: s.amount || 0,
                academic_year: s.academic_year || '-',
                semester: s.semester || '',
                note: s.note || '-'
            };
        });

        return { data: data, total: data.length };
    } catch (err) {
        console.error('Error fetching recipients data:', err);
        throw err;
    }
}

// ===== ฟังก์ชันกรองข้อมูลผู้รับทุน =====
function applyRecipientFilters() {
    const year = $('#filter-academic-year').val();
    const semester = $('#filter-semester').val();

    const table = $('#recipientTable').DataTable();
    $.fn.dataTable.ext.search.push(
        function(settings, data, dataIndex) {
            const rowData = table.row(dataIndex).data();
            if (!rowData) return true;
            let match = true;
            if (year && rowData.academic_year !== year) match = false;
            if (semester && rowData.semester !== semester) match = false;
            return match;
        }
    );
    table.draw();
    $.fn.dataTable.ext.search.pop();
}

function clearRecipientFilters() {
    $('#filter-academic-year').val('');
    $('#filter-semester').val('');
    const table = $('#recipientTable').DataTable();
    table.search('').columns().search('').draw();
    table.draw();
}

// ==========================================
// ฟังก์ชันจัดการปุ่มใน DataTable ผู้รับทุน
// ==========================================

window.viewScholarshipDetail = async function(scholarshipId) {
    try {
        const { data, error } = await db.from('core_scholarships')
            .select(`
                *,
                core_students (
                    student_id_card,
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .eq('id', scholarshipId)
            .single();
        if (error) throw error;

        const student = data.core_students;
        const studentName = student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล';
        const studentCode = student ? student.student_id_card : '-';

        let html = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
                    <div><span class="text-sm text-slate-500">รหัสประจำตัว</span><p class="font-bold">${studentCode}</p></div>
                    <div><span class="text-sm text-slate-500">ชื่อ-สกุล</span><p class="font-bold">${studentName}</p></div>
                    <div><span class="text-sm text-slate-500">ชื่อทุน</span><p class="font-bold text-emerald-700">${data.scholarship_name}</p></div>
                    <div><span class="text-sm text-slate-500">จำนวนเงิน</span><p class="font-bold">${data.amount.toLocaleString()} บาท</p></div>
                    <div><span class="text-sm text-slate-500">ปีการศึกษา</span><p class="font-bold">${data.academic_year}</p></div>
                    <div><span class="text-sm text-slate-500">ภาคเรียน</span><p class="font-bold">${data.semester}</p></div>
                    ${data.note ? `<div class="col-span-2"><span class="text-sm text-slate-500">หมายเหตุ</span><p>${data.note}</p></div>` : ''}
                    <div class="col-span-2"><span class="text-sm text-slate-500">บันทึกเมื่อ</span><p class="text-sm">${new Date(data.created_at).toLocaleString('th-TH')}</p></div>
                </div>
            </div>
        `;
        document.getElementById('modalContent').innerHTML = html;
        document.getElementById('detailModal').classList.remove('hidden');
        document.getElementById('detailModal').classList.add('flex');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

window.openEditScholarshipModal = async function(scholarshipId) {
    try {
        const { data, error } = await db.from('core_scholarships')
            .select('*')
            .eq('id', scholarshipId)
            .single();
        if (error) throw error;

        document.getElementById('edit_record_id').value = data.id;
        document.getElementById('edit_scholarship_name').value = data.scholarship_name;
        document.getElementById('edit_amount').value = data.amount;
        document.getElementById('edit_academic_year').value = data.academic_year;
        document.getElementById('edit_semester').value = data.semester;
        document.getElementById('edit_note').value = data.note || '';

        $('#editScholarshipModal').removeClass('hidden').addClass('flex');
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้', 'error');
    }
};

window.closeEditScholarshipModal = function() {
    const modal = document.getElementById('editScholarshipModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    $('#editScholarshipModal').addClass('hidden').removeClass('flex');
};

window.updateScholarshipRecord = async function() {
    const id = document.getElementById('edit_record_id').value;
    const scholarshipName = document.getElementById('edit_scholarship_name').value.trim();
    const amount = parseFloat(document.getElementById('edit_amount').value);
    const academicYear = document.getElementById('edit_academic_year').value.trim();
    const semester = document.getElementById('edit_semester').value;
    const note = document.getElementById('edit_note').value.trim();

    if (!scholarshipName || !amount || !academicYear || !semester) {
        return Swal.fire('กรุณากรอกข้อมูลให้ครบถ้วน', '', 'error');
    }

    try {
        const updateData = {
            scholarship_name: scholarshipName,
            amount: amount,
            academic_year: academicYear,
            semester: semester,
            updated_at: new Date().toISOString()
        };
        if (note) updateData.note = note;

        const { error } = await db.from('core_scholarships')
            .update(updateData)
            .eq('id', id);
        if (error) throw error;

        window.closeEditScholarshipModal();
        await Swal.fire('สำเร็จ', 'อัปเดตข้อมูลทุนเรียบร้อย', 'success');

        if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
        if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } catch (err) {
        console.error(err);
        window.closeEditScholarshipModal();

        if (err.code === '42703' || err.message?.includes('column "note" does not exist')) {
            try {
                const updateData = {
                    scholarship_name: scholarshipName,
                    amount: amount,
                    academic_year: academicYear,
                    semester: semester,
                    updated_at: new Date().toISOString()
                };
                const { error } = await db.from('core_scholarships')
                    .update(updateData)
                    .eq('id', id);
                if (error) throw error;
                window.closeEditScholarshipModal();
                await Swal.fire('สำเร็จ', 'อัปเดตข้อมูลทุนเรียบร้อย', 'success');
                if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
                if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                    $('#recipientTable').DataTable().ajax.reload(null, false);
                }
            } catch (e2) {
                Swal.fire('ผิดพลาด', e2.message || 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
            }
        } else {
            Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
        }
    }
};

window.deleteScholarshipRecord = async function(scholarshipId) {
    const isAdmin = ['super_admin', 'module_admin'].includes(currentViewRole);
    if (!isAdmin) {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบข้อมูลได้', 'error');
    }

    try {
        const { data, error } = await db.from('core_scholarships')
            .select(`
                scholarship_name,
                amount,
                core_students (
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .eq('id', scholarshipId)
            .single();
        if (error) throw error;

        const student = data.core_students;
        const studentName = student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล';

        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            html: `
                <div style="text-align:left;">
                    <p><strong>นักเรียน:</strong> ${studentName}</p>
                    <p><strong>ชื่อทุน:</strong> ${data.scholarship_name}</p>
                    <p><strong>จำนวนเงิน:</strong> ${data.amount.toLocaleString()} บาท</p>
                </div>
                <p style="color:#dc2626; margin-top:12px;">⚠️ ข้อมูลนี้จะถูกลบอย่างถาวร ไม่สามารถกู้คืนได้</p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ลบเลย',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            const { error: deleteErr } = await db.from('core_scholarships')
                .delete()
                .eq('id', scholarshipId);
            if (deleteErr) throw deleteErr;

            await Swal.fire('ลบสำเร็จ', 'ลบข้อมูลทุนเรียบร้อย', 'success');
            if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
            if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                $('#recipientTable').DataTable().ajax.reload(null, false);
            }
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถลบข้อมูลได้', 'error');
    }
};

// ==========================================
// ADMIN SETTINGS
// ==========================================

window.openAdminModal = async function() {
    await loadModuleSettings();
    $('#set-gas-url').val(moduleSettings.gas_url || '');
    $('#set-drive-folder-id').val(moduleSettings.drive_folder_id || '');
    $('#set-pdf-api-url').val(moduleSettings.pdf_api_url || '');
    $('#set-slide-id').val(moduleSettings.slide_template_id || '');
    await loadTeachersForAppoint();
    await loadModuleAdminsList();
    $('#admin-modal').removeClass('hidden').addClass('flex');
};

function closeAdminModal() {
    $('#admin-modal').addClass('hidden').removeClass('flex');
}

async function saveAdminSettings() {
    const settings = {
        gas_url: $('#set-gas-url').val(),
        drive_folder_id: $('#set-drive-folder-id').val(),
        pdf_api_url: $('#set-pdf-api-url').val(),
        slide_template_id: $('#set-slide-id').val()
    };
    try {
        const { error } = await db.from('core_scholarship_settings').update({ settings }).eq('id', (await db.from('core_scholarship_settings').select('id').single()).data.id);
        if (error) throw error;
        moduleSettings = settings;
        Swal.fire('สำเร็จ', 'บันทึกเรียบร้อย', 'success');
        closeAdminModal();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message || 'ไม่สามารถบันทึกได้', 'error');
    }
}

async function loadTeachersForAppoint() {
    const { data } = await db.from('core_personnel').select('id, first_name, last_name');
    const select = $('#select-teacher-appoint');
    select.html('<option value="">-- เลือกครู --</option>');
    data?.forEach(t => select.append(`<option value="${t.id}">${t.first_name} ${t.last_name}</option>`));
    if (typeof TomSelect !== 'undefined') {
        new TomSelect("#select-teacher-appoint", { create: false });
    }
}

async function loadModuleAdminsList() {
    try {
        const { data } = await db.from('core_scholarship_admins').select('id, core_personnel(first_name, last_name)')
            .eq('module_id', 'scholarship');
        const container = $('#module-admin-list');
        if (!data?.length) {
            container.html('<p class="text-slate-400">ไม่มีผู้ดูแลระบบ</p>');
            return;
        }
        let html = '<table class="w-full text-sm"><thead class="bg-slate-50"><tr><th class="p-2 text-left">ชื่อ</th><th class="p-2 text-right"></th></tr></thead><tbody>';
        data.forEach(a => {
            html += `<tr class="border-t"><td class="p-2">${a.core_personnel.first_name} ${a.core_personnel.last_name}</td><td class="p-2 text-right"><button onclick="removeModuleAdmin('${a.id}')" class="text-rose-500 hover:text-rose-700 transition"><i class="fas fa-trash"></i></button></td></tr>`;
        });
        html += '</tbody></table>';
        container.html(html);
    } catch (e) {
        $('#module-admin-list').html('<p class="text-slate-400">ไม่สามารถโหลดรายการได้</p>');
    }
}

window.appointModuleAdmin = async function() {
    const teacherId = $('#select-teacher-appoint').val();
    if (!teacherId) return Swal.fire('กรุณาเลือกครู');
    try {
        const { error } = await db.from('core_scholarship_admins').insert({ user_id: teacherId, module_id: 'scholarship' });
        if (error) throw error;
        Swal.fire('สำเร็จ', 'แต่งตั้งเรียบร้อย', 'success');
        loadModuleAdminsList();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message, 'error');
    }
};

window.removeModuleAdmin = async function(id) {
    try {
        await db.from('core_scholarship_admins').delete().eq('id', id);
        loadModuleAdminsList();
    } catch (e) {
        Swal.fire('ผิดพลาด', e.message, 'error');
    }
};

function initTomSelects() { /* สำหรับ select ที่ใช้ tom-select */ }
async function logout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// ==========================================
// ADMIN RECORD SCHOLARSHIP
// ==========================================

async function searchStudentsForRecord(query) {
    if (!query || query.trim().length < 2) return [];
    const like = `%${query.trim()}%`;
    try {
        const { data, error } = await db.from('student_enrollments')
            .select(`
                student_id,
                classroom_id,
                core_students!inner (id, student_id_card, prefix, first_name, last_name),
                core_classrooms!inner (grade_level, room_number, academic_year, semester, adviser_id_1, adviser_id_2)
            `)
            .eq('core_classrooms.academic_year', currentYear)
            .eq('core_classrooms.semester', currentTerm)
            .or(`first_name.ilike.${like},last_name.ilike.${like},student_id_card.ilike.${like}`, { foreignTable: 'core_students' })
            .limit(20);
        if (error) throw error;

        recordSearchCache = {};
        return (data || []).map(e => {
            const s = e.core_students;
            const c = e.core_classrooms;
            recordSearchCache[s.id] = { student: s, classroom: c, classroomId: e.classroom_id };
            return {
                id: s.id,
                label: `${s.student_id_card} - ${s.prefix || ''}${s.first_name} ${s.last_name} (ม.${c.grade_level}/${c.room_number})`
            };
        });
    } catch (err) {
        console.error('Error searching students for record:', err);
        return [];
    }
}

function initRecordStudentSearch() {
    const el = document.getElementById('record_student_select');
    if (recordStudentTomSelect) {
        recordStudentTomSelect.destroy();
    }
    el.innerHTML = '';
    recordStudentTomSelect = new TomSelect("#record_student_select", {
        valueField: 'id',
        labelField: 'label',
        searchField: ['label'],
        create: false,
        placeholder: 'พิมพ์ชื่อ นามสกุล หรือรหัสนักเรียน (อย่างน้อย 2 ตัวอักษร)',
        maxOptions: 20,
        shouldLoad: (query) => query.trim().length >= 2,
        load: function(query, callback) {
            searchStudentsForRecord(query)
                .then(results => callback(results))
                .catch(() => callback());
        },
        onChange: async (val) => {
            if (val) await fillRecordStudentData(val);
            else clearRecordFields();
        }
    });
}

async function fillRecordStudentData(studentId) {
    const cached = recordSearchCache[studentId];
    if (!cached) return;
    const { student: s, classroom: c } = cached;
    document.getElementById('record_student_id').value = s.student_id_card;
    document.getElementById('record_student_name').value = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
    document.getElementById('record_student_grade').value = `ม.${c.grade_level}/${c.room_number}`;
    document.getElementById('record_academic_year').value = currentYear || '';
    document.getElementById('record_semester').value = currentTerm || '';

    let adv1 = '', adv2 = '';
    if (c.adviser_id_1) {
        const { data: t } = await db.from('core_personnel').select('first_name, last_name').eq('id', c.adviser_id_1).single();
        if (t) adv1 = `ครู${t.first_name} ${t.last_name}`;
    }
    if (c.adviser_id_2) {
        const { data: t } = await db.from('core_personnel').select('first_name, last_name').eq('id', c.adviser_id_2).single();
        if (t) adv2 = `ครู${t.first_name} ${t.last_name}`;
    }
    document.getElementById('record_advisor_1').value = adv1;
    document.getElementById('record_advisor_2').value = adv2;
}

function clearRecordFields() {
    ['record_student_id', 'record_student_name', 'record_student_grade', 'record_advisor_1', 'record_advisor_2',
        'record_scholarship_name', 'record_amount', 'record_academic_year', 'record_note'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const sem = document.getElementById('record_semester');
    if (sem) sem.value = '';
}

window.openRecordScholarshipModal = async function() {
    clearRecordFields();
    document.getElementById('record_scholarship_name').value = '';
    document.getElementById('record_amount').value = '';
    document.getElementById('record_academic_year').value = currentYear || '';
    document.getElementById('record_semester').value = currentTerm || '';
    document.getElementById('record_note').value = '';
    initRecordStudentSearch();
    $('#recordScholarshipModal').removeClass('hidden').addClass('flex');
};

window.closeRecordScholarshipModal = function() {
    $('#recordScholarshipModal').addClass('hidden').removeClass('flex');
};

window.saveScholarshipRecord = async function() {
    const studentId = document.getElementById('record_student_select').value;
    if (!studentId) {
        closeRecordScholarshipModal();
        return Swal.fire('กรุณาเลือกนักเรียน', '', 'error');
    }

    const scholarshipName = document.getElementById('record_scholarship_name').value.trim();
    const amount = parseFloat(document.getElementById('record_amount').value);
    const academicYear = document.getElementById('record_academic_year').value.trim();
    const semester = document.getElementById('record_semester').value;
    const note = document.getElementById('record_note').value.trim();

    if (!scholarshipName || !amount || !academicYear || !semester) {
        closeRecordScholarshipModal();
        return Swal.fire('กรุณากรอกข้อมูลให้ครบถ้วน', '', 'error');
    }

    // ตรวจสอบข้อมูลซ้ำ
    try {
        const { data: existing, error: checkErr } = await db.from('core_scholarships')
            .select('id, scholarship_name, amount, academic_year, semester')
            .eq('student_id', studentId)
            .eq('scholarship_name', scholarshipName)
            .eq('amount', amount)
            .eq('academic_year', academicYear)
            .eq('semester', semester);

        if (checkErr) throw checkErr;

        if (existing && existing.length > 0) {
            closeRecordScholarshipModal();
            const existingRecord = existing[0];
            await Swal.fire({
                icon: 'warning',
                title: '⚠️ มีข้อมูลทุนนี้อยู่แล้ว!',
                html: `
                    <div style="text-align:left; padding:0 10px;">
                        <p><strong>ชื่อทุน:</strong> ${existingRecord.scholarship_name}</p>
                        <p><strong>จำนวนเงิน:</strong> ${existingRecord.amount.toLocaleString()} บาท</p>
                        <p><strong>ปีการศึกษา:</strong> ${existingRecord.academic_year}</p>
                        <p><strong>ภาคเรียน:</strong> ${existingRecord.semester}</p>
                    </div>
                    <p style="margin-top:12px;color:#b45309;">ไม่สามารถบันทึกซ้ำได้ กรุณาตรวจสอบข้อมูล</p>
                `,
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#d97706'
            });
            return;
        }
    } catch (checkErr) {
        console.error('Error checking duplicate:', checkErr);
        closeRecordScholarshipModal();
        await Swal.fire({
            icon: 'info',
            title: 'ไม่สามารถตรวจสอบข้อมูลซ้ำได้',
            text: 'ระบบจะบันทึกข้อมูลให้ แต่กรุณาตรวจสอบความซ้ำซ้อนด้วยตนเอง',
            confirmButtonText: 'ดำเนินการต่อ'
        });
    }

    // บันทึกข้อมูล
    try {
        const insertData = {
            student_id: studentId,
            scholarship_name: scholarshipName,
            amount: amount,
            academic_year: academicYear,
            semester: semester,
            scholarship_type: 'ทุนทั่วไป',
            created_by: currentUser.id,
            created_at: new Date().toISOString()
        };
        if (note) insertData.note = note;

        const { error } = await db.from('core_scholarships').insert([insertData]);
        if (error) throw error;

        closeRecordScholarshipModal();
        await Swal.fire('บันทึกสำเร็จ', 'เพิ่มประวัติทุนเรียบร้อย', 'success');
        if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
        if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
            $('#recipientTable').DataTable().ajax.reload(null, false);
        }
    } catch (err) {
        console.error(err);
        closeRecordScholarshipModal();

        if (err.code === '42703' || err.message?.includes('column "note" does not exist')) {
            try {
                const insertData = {
                    student_id: studentId,
                    scholarship_name: scholarshipName,
                    amount: amount,
                    academic_year: academicYear,
                    semester: semester,
                    scholarship_type: 'ทุนทั่วไป',
                    created_by: currentUser.id,
                    created_at: new Date().toISOString()
                };
                const { error } = await db.from('core_scholarships').insert([insertData]);
                if (error) throw error;
                await Swal.fire('บันทึกสำเร็จ', 'เพิ่มประวัติทุนเรียบร้อย (ไม่บันทึกหมายเหตุ)', 'success');
                if (currentClassroomId) await loadStudentsForTable(currentClassroomId);
                if ($('#tab-recipients').hasClass('active') && $.fn.DataTable.isDataTable('#recipientTable')) {
                    $('#recipientTable').DataTable().ajax.reload(null, false);
                }
            } catch (e2) {
                await Swal.fire('ผิดพลาด', e2.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
            }
        } else if (err.code === '42P01' || err.message?.includes('relation') || err.code === '404') {
            await Swal.fire({
                icon: 'error',
                title: 'ไม่พบตาราง core_scholarships',
                html: `<p>กรุณาสร้างตารางใน Supabase SQL Editor ด้วยคำสั่ง:</p>
                       <pre style="text-align:left;background:#1e293b;color:#e2e8f0;padding:12px;border-radius:12px;font-size:12px;overflow-x:auto;">
CREATE TABLE IF NOT EXISTS public.core_scholarships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.core_students(id) ON DELETE CASCADE,
    scholarship_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    academic_year TEXT NOT NULL,
    semester TEXT NOT NULL,
    scholarship_type TEXT DEFAULT 'ทุนทั่วไป',
    created_by UUID REFERENCES public.core_personnel(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    note TEXT
);
ALTER TABLE public.core_scholarships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all authenticated users" ON public.core_scholarships;
CREATE POLICY "Allow all authenticated users" ON public.core_scholarships
    FOR ALL USING (auth.role() = 'authenticated');</pre>`,
                confirmButtonText: 'เข้าใจแล้ว',
                width: 700
            });
        } else {
            await Swal.fire('ผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    }
};

// ==========================================
// APPLICANT LIST MODAL
// ==========================================

window.openApplicantListModal = async function() {
    const modal = document.getElementById('applicantListModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('applicantListContent').innerHTML =
        '<div class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin text-3xl mb-3"></i><p>กำลังโหลดข้อมูล...</p></div>';

    try {
        const { data: applications, error } = await db.from('core_scholarship_applications')
            .select(`
                id,
                student_id,
                reason,
                usage_plan,
                status,
                created_at,
                core_students!inner (
                    id,
                    student_id_card,
                    prefix,
                    first_name,
                    last_name
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!applications || applications.length === 0) {
            document.getElementById('applicantListContent').innerHTML = `
                <div class="text-center py-16 text-slate-400">
                    <i class="fas fa-inbox text-5xl mb-4 text-slate-300"></i>
                    <p class="text-lg font-medium">ยังไม่มีรายการคำขอทุน</p>
                    <p class="text-sm">ยังไม่มีนักเรียนทำการขอทุนในระบบ</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-scroll">
                <table class="w-full text-sm border-collapse">
                    <thead class="bg-slate-50 border-b-2 border-slate-200">
                        <tr>
                            <th class="p-3 text-left font-bold text-slate-600">รหัสประจำตัว</th>
                            <th class="p-3 text-left font-bold text-slate-600">ชื่อ-สกุล</th>
                            <th class="p-3 text-left font-bold text-slate-600">เหตุผลขอทุน</th>
                            <th class="p-3 text-left font-bold text-slate-600">แผนการใช้เงิน</th>
                            <th class="p-3 text-center font-bold text-slate-600">สถานะ</th>
                            <th class="p-3 text-center font-bold text-slate-600">วันที่ขอ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
        `;

        const statusMap = {
            'pending': { label: 'รอดำเนินการ', cls: 'badge-pending' },
            'approved': { label: 'อนุมัติ', cls: 'badge-approved' },
            'rejected': { label: 'ไม่อนุมัติ', cls: 'badge-rejected' }
        };

        applications.forEach(a => {
            const student = a.core_students;
            const name = student ? `${student.prefix || ''}${student.first_name} ${student.last_name}` : 'ไม่พบข้อมูล';
            const code = student ? student.student_id_card : '-';
            const statusInfo = statusMap[a.status] || { label: a.status || 'รอดำเนินการ', cls: 'badge-pending' };
            const date = a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : '-';

            const reasonShort = a.reason ? (a.reason.length > 60 ? a.reason.substring(0, 60) + '...' : a.reason) : '-';
            const usageShort = a.usage_plan ? (a.usage_plan.length > 60 ? a.usage_plan.substring(0, 60) + '...' : a.usage_plan) : '-';

            html += `
                <tr class="hover:bg-slate-50/60 transition">
                    <td class="p-3 font-mono text-slate-600">${code}</td>
                    <td class="p-3 font-medium text-slate-800">${name}</td>
                    <td class="p-3 text-sm text-slate-600" title="${a.reason || ''}">${reasonShort}</td>
                    <td class="p-3 text-sm text-slate-600" title="${a.usage_plan || ''}">${usageShort}</td>
                    <td class="p-3 text-center"><span class="badge-status ${statusInfo.cls}">${statusInfo.label}</span></td>
                    <td class="p-3 text-center text-sm text-slate-500">${date}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
            <div class="mt-3 text-sm text-slate-500 bg-slate-50 p-2 rounded-xl text-center">
                <i class="fas fa-database mr-1"></i> พบข้อมูลทั้งหมด ${applications.length} รายการ
            </div>
        `;

        document.getElementById('applicantListContent').innerHTML = html;
    } catch (err) {
        console.error('Error loading applicant list:', err);
        document.getElementById('applicantListContent').innerHTML = `
            <div class="text-center py-10 text-rose-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p>เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</p>
            </div>
        `;
    }
};

window.closeApplicantListModal = function() {
    document.getElementById('applicantListModal').classList.add('hidden');
    document.getElementById('applicantListModal').classList.remove('flex');
};

window.exportApplicantListExcel = function() {
    Swal.fire({
        icon: 'info',
        title: 'ส่งออก Excel',
        text: 'กำลังพัฒนาฟังก์ชันส่งออกผู้ขอทุน',
        confirmButtonText: 'ตกลง'
    });
};

// ==========================================
// EXPORT FUNCTIONS (Placeholder)
// ==========================================

window.exportRecipientListExcel = function() {
    Swal.fire({
        icon: 'info',
        title: 'ส่งออก Excel',
        text: 'กำลังพัฒนาฟังก์ชันส่งออกผู้รับทุน',
        confirmButtonText: 'ตกลง'
    });
};

window.closeRecipientListModal = function() {
    document.getElementById('recipientListModal').classList.add('hidden');
    document.getElementById('recipientListModal').classList.remove('flex');
};

// ==========================================
// DOM READY
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    const dependentsItems = ['ผู้สูงอายุ', 'ผู้ป่วยติดเตียง', 'ผู้พิการ', 'ผู้ที่ไม่สามารถช่วยเหลือตนเองได้',
        'ผู้ที่ต้องบำบัด', 'เด็กทารก 0-3 ปี', 'คนว่างงานอายุ 15-65 ปี', 'เป็นพ่อหรือแม่เลี้ยงเดี่ยว'
    ];
    const container = document.getElementById('dependents_checklist');
    if (container) {
        dependentsItems.forEach(item => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 hover:border-amber-300 transition cursor-pointer";
            label.innerHTML = `<input type="checkbox" name="dependents" value="${item}" class="accent-amber-600"> <span class="text-sm">${item}</span>`;
            container.appendChild(label);
        });
    }
    document.querySelectorAll('input[name="has_disease"]').forEach(radio => radio.addEventListener('change', function() {
        document.getElementById('disease_fields').classList.toggle('hidden', this.value === 'no');
    }));
    const reasonTextarea = document.getElementById('reason');
    const usageTextarea = document.getElementById('usage_plan');
    if (reasonTextarea) {
        reasonTextarea.addEventListener('input', () => document.getElementById('reason_counter').innerText = reasonTextarea.value.length);
    }
    if (usageTextarea) {
        usageTextarea.addEventListener('input', () => document.getElementById('usage_counter').innerText = usageTextarea.value.length);
    }
});
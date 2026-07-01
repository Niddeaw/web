// ==========================================
// scholarship_teacher.js
// ==========================================
let currentUser = null;
let currentViewRole = 'teacher';
let actualRole = '';
let isReadOnly = false;
let currentYear = '';
let currentTerm = '';
let currentClassroomId = null;
let studentTomSelect = null;
let tsClassroom = null;
let moduleSettings = { gas_url: "", drive_folder_id: "", pdf_api_url: "", slide_template_id: "" };
let currentStudentForForm = null; // student id ที่กำลังกรอกฟอร์มขอทุน

// ========== Auth & Init ==========
$(document).ready(async () => {
    try {
        await checkAuth();
        await loadModuleSettings();
        initTomSelects();
        await loadClassrooms();
        applyAdminVisibility();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
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
    if (sInfo) { currentYear = sInfo.current_academic_year; currentTerm = sInfo.current_semester; document.getElementById('term-display').innerText = `${currentTerm}/${currentYear}`; }
    const { data: modAdmin } = await db.from('core_scholarship_admins').select('id').eq('user_id', currentUser.id).maybeSingle();
    const { data: discHead } = await db.from('core_discipline_heads').select('id').eq('personnel_id', currentUser.id).eq('academic_year', currentYear).maybeSingle();
    const { data: gradeHead } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', currentUser.id).maybeSingle();
    if (actualRole === 'super_admin') currentViewRole = 'super_admin';
    else if (modAdmin) currentViewRole = 'module_admin';
    else if (discHead) currentViewRole = 'head_discipline';
    else if (gradeHead) currentViewRole = 'head_grade';
    else currentViewRole = 'teacher';
    isReadOnly = ['head_grade','head_discipline'].includes(currentViewRole);
    updateUIByRole();
    if (actualRole !== 'teacher') document.getElementById('btnAdminMode')?.classList.remove('hidden');
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
}

window.toggleRoleView = function() {
    if (actualRole === 'teacher') return;
    currentViewRole = (currentViewRole === 'teacher') ? actualRole : 'teacher';
    isReadOnly = ['head_grade','head_discipline'].includes(currentViewRole);
    const btn = document.getElementById('btnAdminMode');
    btn.innerHTML = currentViewRole === 'teacher' ? '<i class="fa-solid fa-user-shield"></i><span> โหมดแอดมิน</span>' : '<i class="fa-solid fa-chalkboard-user"></i><span> โหมดครู</span>';
    updateUIByRole();
    loadClassrooms();
    Swal.fire({ toast: true, icon: 'info', title: `สลับเป็น${currentViewRole === 'teacher' ? 'โหมดครู' : 'โหมดผู้ดูแล'}`, timer: 1500 });
};

async function loadModuleSettings() {
    const { data } = await db.from('core_scholarship_settings').select('settings').single();
    if (data?.settings) moduleSettings = data.settings;
}

async function loadClassrooms() {
    let query = db.from('core_classrooms').select('*').eq('academic_year', currentYear).eq('semester', currentTerm).order('grade_level').order('room_number');
    const isHighLevel = ['super_admin','module_admin','head_discipline'].includes(currentViewRole);
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
    (classrooms || []).forEach(c => { select.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`; });
    tsClassroom = new TomSelect("#select-classroom", { create: false, placeholder: "ค้นหาห้องเรียน", onChange: (val) => { if (val) onClassroomSelected(val); else clearClassroomSelection(); } });
    if (currentViewRole === 'teacher' && classrooms && classrooms.length === 1) tsClassroom.setValue(classrooms[0].id);
}

async function onClassroomSelected(classroomId) {
    currentClassroomId = classroomId;
    await loadStudentsForTable(classroomId);
    await loadStudentSelectForForm(classroomId);
    document.getElementById('status-badge').innerHTML = `<i class="fas fa-check-circle text-emerald-500"></i> ห้องเรียนถูกเลือกแล้ว`;
}

async function loadStudentsForTable(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments').select('student_number, student_id, core_students(id, student_id_card, prefix, first_name, last_name, avatar_students_url)').eq('classroom_id', classroomId).order('student_number');
    if (!enrolls?.length) { document.getElementById('tb-students').innerHTML = '<tr><td colspan="6" class="text-center py-10">ไม่มีนักเรียน</td></tr>'; return; }
    const studentIds = enrolls.map(e => e.student_id);
    const { data: scholarships } = await db.from('core_scholarships').select('student_id, amount').in('student_id', studentIds).eq('academic_year', currentYear);
    const schMap = {};
    (scholarships || []).forEach(s => { schMap[s.student_id] = true; });
    let html = '';
    for (let e of enrolls) {
        const s = e.core_students;
        const hasSch = schMap[s.id] ? 'เคยได้รับทุน' : 'ไม่เคยได้รับทุน';
        const avatar = s.avatar_students_url ? `<img src="${s.avatar_students_url}" class="w-10 h-10 rounded-full object-cover">` : '<div class="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center"><i class="fas fa-user"></i></div>';
        html += `<tr class="hover:bg-slate-50">
            <td class="p-3">${avatar}</td>
            <td class="p-3">${e.student_number}</td>
            <td class="p-3">${s.student_id_card}</td>
            <td class="p-3 font-bold">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
            <td class="p-3"><span class="px-3 py-1 rounded-full text-xs ${hasSch==='เคยได้รับทุน'?'bg-emerald-100 text-emerald-700':'bg-slate-100'}">${hasSch}</span></td>
            <td class="p-3"><button onclick="viewStudentDetail('${s.id}')" class="text-blue-600 mr-2"><i class="fas fa-eye"></i></button><button onclick="editScholarship('${s.id}')" class="text-amber-600 mr-2"><i class="fas fa-edit"></i></button><button onclick="requestScholarship('${s.id}')" class="text-green-600"><i class="fas fa-hand-holding-heart"></i> ขอทุน</button></td>
        </tr>`;
    }
    document.getElementById('tb-students').innerHTML = html;
}

async function loadStudentSelectForForm(classroomId) {
    const { data: enrolls } = await db.from('student_enrollments').select('student_id, core_students(id, student_id_card, prefix, first_name, last_name)').eq('classroom_id', classroomId).order('student_number');
    const options = (enrolls || []).map(e => ({ value: e.core_students.id, text: `${e.core_students.student_id_card} - ${e.core_students.prefix || ''}${e.core_students.first_name} ${e.core_students.last_name}` }));
    if (studentTomSelect) studentTomSelect.destroy();
    studentTomSelect = new TomSelect('#student_select', { create: false, placeholder: 'เลือกนักเรียน', options, onChange: (val) => { if (val) loadStudentDataForForm(val); } });
}

async function loadStudentDataForForm(studentId) {
    currentStudentForForm = studentId;
    const { data: enroll } = await db.from('student_enrollments').select('student_number, classroom_id, core_students(*), core_classrooms(grade_level, room_number)').eq('student_id', studentId).eq('classroom_id', currentClassroomId).single();
    if (!enroll) return;
    const s = enroll.core_students;
    document.getElementById('student_id_card').value = s.student_id_card;
    document.getElementById('student_fullname').value = `${s.prefix || ''}${s.first_name} ${s.last_name}`;
    document.getElementById('student_grade').value = `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}`;
    // ครูที่ปรึกษา
    const { data: classroom } = await db.from('core_classrooms').select('adviser_id_1, adviser_id_2').eq('id', currentClassroomId).single();
    let teacherName = '';
    if (classroom?.adviser_id_1) { const { data: t } = await db.from('core_personnel').select('first_name, last_name').eq('id', classroom.adviser_id_1).single(); if(t) teacherName = `${t.first_name} ${t.last_name}`; }
    document.getElementById('teacher_name').value = teacherName;
    // ดึงข้อมูลเยี่ยมบ้านมาเติม
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

function openMapFromLink() { const link = document.getElementById('map_link').value; if(link) window.open(link, '_blank'); else Swal.fire('ไม่มีพิกัด','กรุณาเลือกนักเรียนที่มีข้อมูลพิกัดจากระบบเยี่ยมบ้าน','info'); }

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
    const { error } = await db.from('core_scholarship_applications').insert([{ student_id: currentStudentForForm, teacher_id: currentUser.id, form_data: formData, status: 'pending', reason: formData.reason, usage_plan: formData.usage_plan }]);
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else Swal.fire('สำเร็จ', 'ส่งคำขอรับทุนเรียบร้อย', 'success').then(() => switchTab('list'));
}

window.viewStudentDetail = async function(studentId) {
    const { data: scholarships } = await db.from('core_scholarships').select('*').eq('student_id', studentId).order('academic_year', { ascending: false });
    const { data: applications } = await db.from('core_scholarship_applications').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
    let html = `<div class="space-y-4"><h4>ประวัติทุนที่ได้รับ</h4><table class="w-full text-sm border"><thead><tr><th>ปี</th><th>ประเภททุน</th><th>ชื่อทุน</th><th>จำนวนเงิน</th></tr></thead><tbody>`;
    (scholarships || []).forEach(s => { html += `<tr><td>${s.academic_year}</td><td>${s.scholarship_type}</td><td>${s.scholarship_name}</td><td>${s.amount}</td></tr>`; });
    html += `</tbody></table><h4 class="mt-4">คำขอทุนล่าสุด</h4><div class="border rounded-xl p-3">${applications?.[0]?.reason || 'ไม่มี'}</div></div>`;
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailModal').classList.add('flex');
};
window.closeDetailModal = () => { document.getElementById('detailModal').classList.add('hidden'); document.getElementById('detailModal').classList.remove('flex'); };
window.editScholarship = async function(studentId) { /* สำหรับ admin สามารถเพิ่มทุนให้ student */ Swal.fire('ฟังก์ชันแก้ไขทุน','สามารถบันทึกประวัติทุนได้','info'); };
window.requestScholarship = function(studentId) { if(studentTomSelect) studentTomSelect.setValue(studentId); switchTab('form'); goToStep(1); };

// Navigation steps
let currentStep = 1;
function goToStep(step) { currentStep = step; $('.step-content').removeClass('active'); $(`#step-${step}`).addClass('active'); const progress = (step-1)*33.33; $('#progressBar').css('width',`${progress}%`); for(let i=1;i<=4;i++){ if(i<=step){ $(`#circle-${i}`).removeClass('bg-slate-100 text-slate-400').addClass('bg-amber-600 text-white'); $(`#text-step-${i}`).removeClass('text-slate-400').addClass('text-amber-700'); }else{ $(`#circle-${i}`).removeClass('bg-amber-600 text-white').addClass('bg-slate-100 text-slate-400'); $(`#text-step-${i}`).removeClass('text-amber-700').addClass('text-slate-400'); } } }
function nextStep(step) { goToStep(step); }
function prevStep(step) { goToStep(step); }

function switchTab(tabId) {
    $('#tab-list, #tab-form').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');
    const activeClass = 'bg-amber-600 text-white', inactiveClass = 'bg-white text-slate-600 border';
    if(tabId === 'list') { $('#tab-list-btn').removeClass(inactiveClass).addClass(activeClass); $('#tab-form-btn').removeClass(activeClass).addClass(inactiveClass); }
    else { $('#tab-form-btn').removeClass(inactiveClass).addClass(activeClass); $('#tab-list-btn').removeClass(activeClass).addClass(inactiveClass); }
    if(tabId === 'list') loadDataTable();
}
function loadDataTable() { if(currentClassroomId) loadStudentsForTable(currentClassroomId); }

function exportToExcel() { Swal.fire('ส่งออก Excel', 'กำลังพัฒนาฟังก์ชันส่งออก', 'info'); }

// Admin functions
window.openAdminModal = async function() {
    await loadModuleSettings();
    $('#set-gas-url').val(moduleSettings.gas_url);
    $('#set-drive-folder-id').val(moduleSettings.drive_folder_id);
    $('#set-pdf-api-url').val(moduleSettings.pdf_api_url);
    $('#set-slide-id').val(moduleSettings.slide_template_id);
    await loadTeachersForAppoint();
    await loadModuleAdminsList();
    $('#admin-modal').removeClass('hidden').addClass('flex');
};
function closeAdminModal() { $('#admin-modal').addClass('hidden').removeClass('flex'); }
async function saveAdminSettings() {
    const settings = { gas_url: $('#set-gas-url').val(), drive_folder_id: $('#set-drive-folder-id').val(), pdf_api_url: $('#set-pdf-api-url').val(), slide_template_id: $('#set-slide-id').val() };
    const { error } = await db.from('core_scholarship_settings').update({ settings }).eq('id', (await db.from('core_scholarship_settings').select('id').single()).data.id);
    if(error) Swal.fire('ผิดพลาด',error.message,'error'); else { moduleSettings=settings; Swal.fire('สำเร็จ','บันทึกเรียบร้อย','success'); closeAdminModal(); }
}
async function loadTeachersForAppoint() {
    const { data } = await db.from('core_personnel').select('id, first_name, last_name');
    const select = $('#select-teacher-appoint');
    select.html('<option value="">-- เลือกครู --</option>');
    data?.forEach(t => select.append(`<option value="${t.id}">${t.first_name} ${t.last_name}</option>`));
    new TomSelect("#select-teacher-appoint", { create: false });
}
async function loadModuleAdminsList() {
    const { data } = await db.from('core_scholarship_admins').select('id, core_personnel(first_name, last_name)').eq('module_id','scholarship');
    const container = $('#module-admin-list');
    if(!data?.length) { container.html('<p class="text-slate-400">ไม่มีผู้ดูแลระบบ</p>'); return; }
    let html = '<table class="w-full text-sm"><thead><tr><th>ชื่อ</th><th></th></tr></thead><tbody>';
    data.forEach(a => { html += `<tr><td>${a.core_personnel.first_name} ${a.core_personnel.last_name}</td><td><button onclick="removeModuleAdmin('${a.id}')" class="text-rose-500"><i class="fas fa-trash"></i></button></td></tr>`; });
    html += '</tbody></table>';
    container.html(html);
}
window.appointModuleAdmin = async function() {
    const teacherId = $('#select-teacher-appoint').val();
    if(!teacherId) return Swal.fire('กรุณาเลือกครู');
    const { error } = await db.from('core_scholarship_admins').insert({ user_id: teacherId, module_id: 'scholarship' });
    if(error) Swal.fire('ผิดพลาด',error.message,'error');
    else { Swal.fire('สำเร็จ','แต่งตั้งเรียบร้อย','success'); loadModuleAdminsList(); }
};
window.removeModuleAdmin = async function(id) {
    await db.from('core_scholarship_admins').delete().eq('id', id);
    loadModuleAdminsList();
};
function applyAdminVisibility() { if(['super_admin','module_admin'].includes(currentViewRole)) document.getElementById('admin-settings-btn')?.classList.remove('hidden'); }
function initTomSelects() { /* สำหรับ select ที่ใช้ tom-select */ }
async function logout() { await db.auth.signOut(); window.location.href='index.html'; }
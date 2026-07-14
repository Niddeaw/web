// scholarship_student.js
let currentStudent = null;
let currentAcademicYear = null;
let currentSemester = null;
let currentStep = 1;

$(document).ready(async () => {
    await checkAuth();
    await loadCurrentYearAndSemester();
    await loadStudentData();
    loadApplicationHistory();
    loadReceivedScholarships();
    // ตั้งค่าเริ่มต้น Step 1
    goToStep(1);
});

// ===== ตรวจสอบสิทธิ์ (ใช้ student_id_card จากอีเมล) =====
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('login.html');

    const userEmail = session.user.email;
    const studentIdCard = userEmail.split('@')[0];

    const { data: profile, error } = await db.from('core_students')
        .select('*')
        .eq('student_id_card', studentIdCard)
        .maybeSingle();

    if (error || !profile) {
        console.error('Student not found:', error);
        await db.auth.signOut();
        return window.location.replace('login.html');
    }

    currentStudent = profile;
    $('#studentName').text(`${profile.prefix || ''}${profile.first_name} ${profile.last_name}`);
    $('#studentIdCard').text(`รหัสประจำตัว: ${profile.student_id_card}`);
}

// ===== โหลดปี/เทอมปัจจุบัน =====
async function loadCurrentYearAndSemester() {
    try {
        const { data, error } = await db.from('core_school_info')
            .select('current_academic_year, current_semester')
            .single();
        if (error) throw error;
        currentAcademicYear = data?.current_academic_year || 2567;
        currentSemester = data?.current_semester || 1;
    } catch (e) {
        console.warn('Cannot load school info, using default', e);
        currentAcademicYear = 2567;
        currentSemester = 1;
    }
}

// ===== ดึงข้อมูลเยี่ยมบ้านล่าสุด =====
async function getHomeVisit(studentId) {
    try {
        const { data } = await db.from('module_home_visits')
            .select('*')
            .eq('student_id', studentId)
            .order('visit_date', { ascending: false, nullsFirst: false })
            .maybeSingle();
        return data;
    } catch (e) {
        console.warn('Cannot load home visit', e);
        return null;
    }
}

// ===== ดึงข้อมูลชั้นเรียนปัจจุบัน =====
async function getCurrentClassroom(studentId) {
    try {
        const { data } = await db.from('student_enrollments')
            .select('core_classrooms(grade_level, room_number)')
            .eq('student_id', studentId)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (data && data.core_classrooms) {
            return `ม.${data.core_classrooms.grade_level}/${data.core_classrooms.room_number}`;
        }
        return '-';
    } catch (e) {
        return '-';
    }
}

// ===== โหลดข้อมูลฟอร์มขอทุน (Multi-Step) =====
async function loadStudentData() {
    const homevisit = await getHomeVisit(currentStudent.id);
    const grade = await getCurrentClassroom(currentStudent.id);

    // เติมข้อมูลนักเรียน
    document.getElementById('student_id_card').value = currentStudent.student_id_card || '';
    document.getElementById('student_fullname').value = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
    document.getElementById('student_grade').value = grade;

    // เติมข้อมูลครอบครัว (ถ้ามี homevisit)
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

        // ที่อยู่
        document.getElementById('addr_house').value = homevisit.house_number || '';
        document.getElementById('addr_moo').value = homevisit.village_no || '';
        document.getElementById('addr_subdistrict').value = homevisit.sub_district || '';
        document.getElementById('addr_district').value = homevisit.district || '';
        document.getElementById('addr_province').value = homevisit.province || '';
        document.getElementById('addr_zipcode').value = homevisit.zipcode || '';

        // ภาพ
        document.getElementById('preview_outside').src = homevisit.photo_outside || '';
        document.getElementById('preview_inside').src = homevisit.photo_inside || '';
        document.getElementById('preview_teacher').src = homevisit.photo_teacher || '';

        // เศรษฐกิจ
        document.getElementById('family_income').value = homevisit.economic_data?.income || '';
        document.getElementById('travel_expense').value = homevisit.economic_data?.travel_expense || '';
        document.getElementById('food_expense').value = homevisit.economic_data?.food_expense || '';
        document.getElementById('other_expense').value = homevisit.economic_data?.other_expense || '';

        // โรคประจำตัว
        const diseaseData = homevisit.disease_data || {};
        if (diseaseData.has_disease === 'yes') {
            document.querySelector('input[name="has_disease"][value="yes"]').checked = true;
            document.getElementById('disease_fields').classList.remove('hidden');
            document.getElementById('disease_name').value = diseaseData.name || '';
            document.getElementById('disease_medicine').value = diseaseData.medicine || '';
            document.getElementById('disease_hospital').value = diseaseData.hospital || '';
        } else {
            document.querySelector('input[name="has_disease"][value="no"]').checked = true;
            document.getElementById('disease_fields').classList.add('hidden');
        }

        // ภาระพึ่งพิง (ถ้ามี)
        const dependents = homevisit.dependents || [];
        document.querySelectorAll('input[name="dependents"]').forEach(cb => {
            cb.checked = dependents.includes(cb.value);
        });

        // พี่น้อง
        const siblings = homevisit.siblings || {};
        document.getElementById('siblings_total').value = siblings.total || '';
        document.getElementById('siblings_study').value = siblings.study || '';
        document.getElementById('siblings_work').value = siblings.work || '';
        document.getElementById('siblings_notwork').value = siblings.notwork || '';

    } else {
        // ถ้าไม่มีข้อมูลเยี่ยมบ้าน แสดงข้อความ
        const msg = document.createElement('div');
        msg.className = 'text-amber-600 bg-amber-50 p-3 rounded-xl text-sm';
        msg.innerHTML = '<i class="fas fa-info-circle mr-2"></i> ยังไม่มีข้อมูลเยี่ยมบ้าน กรุณาติดต่อครูที่ปรึกษา';
        document.getElementById('step-1').prepend(msg);
    }

    // สร้าง checkbox ภาระพึ่งพิง (นักเรียนสามารถเลือกได้เอง)
    const dependentsItems = [
        'ผู้สูงอายุ', 'ผู้ป่วยติดเตียง', 'ผู้พิการ',
        'ผู้ที่ไม่สามารถช่วยเหลือตนเองได้', 'ผู้ที่ต้องบำบัด',
        'เด็กทารก 0-3 ปี', 'คนว่างงานอายุ 15-65 ปี',
        'เป็นพ่อหรือแม่เลี้ยงเดี่ยว'
    ];
    const container = document.getElementById('dependents_checklist');
    if (container) {
        container.innerHTML = '';
        dependentsItems.forEach(item => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 hover:border-amber-300 transition cursor-pointer";
            // ✅ ไม่มี disabled เพื่อให้เลือกได้
            label.innerHTML = `<input type="checkbox" name="dependents" value="${item}" class="accent-amber-600"> <span class="text-sm">${item}</span>`;
            container.appendChild(label);
        });
    }

    // หลังจากสร้าง checkbox แล้ว ถ้ามี homevisit ให้ tick ตามข้อมูลเดิมอีกครั้ง
    if (homevisit && homevisit.dependents) {
        const dependents = homevisit.dependents || [];
        document.querySelectorAll('input[name="dependents"]').forEach(cb => {
            cb.checked = dependents.includes(cb.value);
        });
    }

    // ผูก Event radio disease
    document.querySelectorAll('input[name="has_disease"]').forEach(radio => {
        radio.addEventListener('change', function() {
            document.getElementById('disease_fields').classList.toggle('hidden', this.value === 'no');
        });
    });

    // ผูก Event textarea นับตัวอักษร
    const reasonTextarea = document.getElementById('reason');
    const usageTextarea = document.getElementById('usage_plan');
    if (reasonTextarea) {
        reasonTextarea.addEventListener('input', () => {
            document.getElementById('reason_counter').innerText = reasonTextarea.value.length;
        });
    }
    if (usageTextarea) {
        usageTextarea.addEventListener('input', () => {
            document.getElementById('usage_counter').innerText = usageTextarea.value.length;
        });
    }
}

// ===== STEP NAVIGATION =====
function goToStep(step) {
    currentStep = step;

    $('.step-content').removeClass('active');
    $(`#step-${step}`).addClass('active');

    const progress = (step - 1) * 33.33;
    $('#progressBar').css('width', `${progress}%`);

    for (let i = 1; i <= 4; i++) {
        const circle = $(`#circle-${i}`);
        const label = $(`#text-step-${i}`);

        if (i <= step) {
            circle.removeClass('inactive').addClass('active');
            label.removeClass('inactive').addClass('active');
        } else {
            circle.removeClass('active').addClass('inactive');
            label.removeClass('active').addClass('inactive');
        }
    }
}

function nextStep(step) { goToStep(step); }
function prevStep(step) { goToStep(step); }

// ===== ส่งคำขอรับทุน =====
async function submitStudentApplication() {
    if (!currentStudent) return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียน', 'error');

    const reason = document.getElementById('reason').value.trim();
    const usage_plan = document.getElementById('usage_plan').value.trim();

    if (!reason || !usage_plan) {
        return Swal.fire('กรุณากรอกเหตุผลและแผนการใช้เงิน', '', 'error');
    }

    const formData = {
        student_id: currentStudent.id,
        father: {
            name: document.getElementById('father_name').value,
            job: document.getElementById('father_job').value,
            phone: document.getElementById('father_phone').value
        },
        mother: {
            name: document.getElementById('mother_name').value,
            job: document.getElementById('mother_job').value,
            phone: document.getElementById('mother_phone').value
        },
        guardian: {
            name: document.getElementById('guardian_name').value,
            job: document.getElementById('guardian_job').value,
            phone: document.getElementById('guardian_phone').value
        },
        parents_status: document.getElementById('parents_status').value,
        siblings: {
            total: document.getElementById('siblings_total').value,
            study: document.getElementById('siblings_study').value,
            work: document.getElementById('siblings_work').value,
            notwork: document.getElementById('siblings_notwork').value
        },
        dependents: Array.from(document.querySelectorAll('input[name="dependents"]:checked')).map(cb => cb.value),
        address: {
            house: document.getElementById('addr_house').value,
            moo: document.getElementById('addr_moo').value,
            subdistrict: document.getElementById('addr_subdistrict').value,
            district: document.getElementById('addr_district').value,
            province: document.getElementById('addr_province').value,
            zipcode: document.getElementById('addr_zipcode').value
        },
        economy: {
            family_income: document.getElementById('family_income').value,
            travel_expense: document.getElementById('travel_expense').value,
            food_expense: document.getElementById('food_expense').value,
            other_expense: document.getElementById('other_expense').value
        },
        disease: {
            has: document.querySelector('input[name="has_disease"]:checked')?.value || 'no',
            name: document.getElementById('disease_name').value,
            medicine: document.getElementById('disease_medicine').value,
            hospital: document.getElementById('disease_hospital').value
        },
        reason: reason,
        usage_plan: usage_plan
    };

    try {
        const { error } = await db.from('core_scholarship_applications').insert([{
            student_id: currentStudent.id,
            teacher_id: null,
            form_data: formData,
            status: 'pending',
            reason: reason,
            usage_plan: usage_plan,
            created_at: new Date().toISOString()
        }]);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'ส่งคำขอสำเร็จ',
            text: 'รอการพิจารณาจากครูผู้ดูแล',
            confirmButtonText: 'ตกลง'
        }).then(() => {
            showTab('history');
            loadApplicationHistory();
        });

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ===== ประวัติการขอทุน =====
async function loadApplicationHistory() {
    const { data, error } = await db.from('core_scholarship_applications')
        .select('*')
        .eq('student_id', currentStudent.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading history:', error);
        $('#historyList').html('<p class="text-rose-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>');
        return;
    }

    if (!data || data.length === 0) {
        $('#historyList').html('<p class="text-slate-400 text-center py-6">ยังไม่มีประวัติการขอทุน</p>');
        return;
    }

    let html = '';
    data.forEach(app => {
        const statusMap = {
            'pending': { label: 'รอการพิจารณา', cls: 'text-amber-600 bg-amber-50' },
            'approved': { label: 'อนุมัติ', cls: 'text-emerald-600 bg-emerald-50' },
            'rejected': { label: 'ปฏิเสธ', cls: 'text-rose-600 bg-rose-50' }
        };
        const st = statusMap[app.status] || statusMap['pending'];
        html += `
            <div class="border rounded-xl p-4 shadow-sm hover:shadow transition">
                <div class="flex justify-between items-center">
                    <span class="font-bold px-3 py-1 rounded-full text-sm ${st.cls}">${st.label}</span>
                    <small class="text-slate-400">${new Date(app.created_at).toLocaleDateString('th-TH')}</small>
                </div>
                <p class="mt-2 text-sm text-slate-600">${app.reason?.substring(0, 120)}${app.reason?.length > 120 ? '...' : ''}</p>
                ${app.usage_plan ? `<p class="text-xs text-slate-500 mt-1">📌 แผนการใช้เงิน: ${app.usage_plan}</p>` : ''}
            </div>
        `;
    });
    $('#historyList').html(html);
}

// ===== ทุนที่ได้รับ =====
async function loadReceivedScholarships() {
    const { data, error } = await db.from('core_scholarships')
        .select('*')
        .eq('student_id', currentStudent.id)
        .order('academic_year', { ascending: false });

    if (error) {
        console.error('Error loading received:', error);
        $('#receivedList').html('<p class="text-rose-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>');
        return;
    }

    if (!data || data.length === 0) {
        $('#receivedList').html('<p class="text-slate-400 text-center py-6">ไม่เคยได้รับทุน</p>');
        return;
    }

    let html = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
                <thead class="bg-slate-100">
                    <tr>
                        <th class="p-2 text-left">ปีการศึกษา</th>
                        <th class="p-2 text-left">ภาคเรียน</th>
                        <th class="p-2 text-left">ประเภท</th>
                        <th class="p-2 text-left">ชื่อทุน</th>
                        <th class="p-2 text-right">จำนวนเงิน</th>
                    </tr>
                </thead>
                <tbody>
    `;
    data.forEach(s => {
        html += `
            <tr class="border-b hover:bg-slate-50">
                <td class="p-2">${s.academic_year}</td>
                <td class="p-2">${s.semester}</td>
                <td class="p-2">${s.scholarship_type || 'ทุนทั่วไป'}</td>
                <td class="p-2 font-medium">${s.scholarship_name}</td>
                <td class="p-2 text-right font-bold text-emerald-600">${s.amount?.toLocaleString() || 0}</td>
            </tr>
        `;
    });
    html += `
                </tbody>
            </table>
        </div>
    `;
    $('#receivedList').html(html);
}

// ===== สลับแท็บ =====
function showTab(tab) {
    $('#applyPanel, #historyPanel, #receivedPanel').addClass('hidden');
    if (tab === 'apply') {
        $('#applyPanel').removeClass('hidden');
        $('#applyTab').addClass('bg-amber-600 text-white').removeClass('bg-white border');
        $('#historyTab, #receivedTab').removeClass('bg-amber-600 text-white').addClass('bg-white border');
    } else if (tab === 'history') {
        $('#historyPanel').removeClass('hidden');
        $('#historyTab').addClass('bg-amber-600 text-white').removeClass('bg-white border');
        $('#applyTab, #receivedTab').removeClass('bg-amber-600 text-white').addClass('bg-white border');
    } else if (tab === 'received') {
        $('#receivedPanel').removeClass('hidden');
        $('#receivedTab').addClass('bg-amber-600 text-white').removeClass('bg-white border');
        $('#applyTab, #historyTab').removeClass('bg-amber-600 text-white').addClass('bg-white border');
    }
}

// ===== ออกจากระบบ =====
async function logout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}
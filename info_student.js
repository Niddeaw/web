// info_student.js - สำหรับนักเรียนดูข้อมูลของตนเอง
let currentStudentId = null;
let chartInstance = null;
let gasSettingsCache = null;
let currentAcademicYear = null;
let currentSemester = null;

// ========== โหลดปี/ภาคปัจจุบัน ==========
async function loadCurrentYearAndSemester() {
    if (currentAcademicYear !== null && currentSemester !== null) return;
    try {
        const { data, error } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        if (error) throw error;
        currentAcademicYear = data?.current_academic_year || 2567;
        currentSemester = data?.current_semester || 1;
        updateTermDisplay();
    } catch (err) {
        console.warn('Cannot load year/semester, using default', err);
        currentAcademicYear = 2567;
        currentSemester = 1;
        updateTermDisplay();
    }
}

function updateTermDisplay() {
    const el = document.getElementById('termDisplay');
    if (el && currentAcademicYear && currentSemester) {
        el.innerHTML = `📅 ภาคเรียนที่ ${currentSemester} ปีการศึกษา ${currentAcademicYear}`;
    }
}

// ========== GAS Settings ==========
async function loadGasSettings() {
    if (gasSettingsCache) return gasSettingsCache;
    try {
        let { data, error } = await db.from('core_school_info').select('gas_avatar_api_url, gas_avatar_folder_id').limit(1).maybeSingle();
        if (error) throw error;
        if (!data) {
            const { data: inserted, error: insertError } = await db.from('core_school_info').insert({ gas_avatar_api_url: '', gas_avatar_folder_id: '' }).select().single();
            if (insertError) throw insertError;
            data = inserted;
        }
        gasSettingsCache = data || { gas_avatar_api_url: null, gas_avatar_folder_id: null };
        return gasSettingsCache;
    } catch (err) {
        console.error('Error loading GAS settings:', err);
        return { gas_avatar_api_url: null, gas_avatar_folder_id: null };
    }
}

// ========== อัปโหลดรูป ==========
function resizeImageBlob(file, maxSize = 600) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let scale = maxSize / Math.max(img.width, img.height);
                if (scale > 1) scale = 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
            };
        };
        reader.readAsDataURL(file);
    });
}
function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}
async function uploadFileToDrive(file, studentIdCard) {
    const settings = await loadGasSettings();
    const gasUrl = settings.gas_avatar_api_url;
    const folderId = settings.gas_avatar_folder_id;
    if (!gasUrl || !folderId) {
        Swal.fire({ icon: 'info', title: 'ยังไม่ตั้งค่าระบบอัปโหลด', html: '<p class="text-sm">กรุณาติดต่อผู้ดูแลระบบ</p>', confirmButtonText: 'รับทราบ' });
        return null;
    }
    Swal.fire({ title: 'กำลังอัปโหลด...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
        const resizedBlob = await resizeImageBlob(file, 600);
        const base64Data = await blobToBase64(resizedBlob);
        const response = await fetch(gasUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload', base64: base64Data, fileName: `avatar_${studentIdCard}.jpg`, folderId })
        });
        const result = await response.json();
        if (result.status === 'success' && result.url) { Swal.close(); return result.url; }
        else throw new Error(result.message || 'GAS ตอบกลับผิดปกติ');
    } catch (err) {
        Swal.close();
        Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error');
        return null;
    }
}

function triggerProfileUpload() { document.getElementById('profileFileInput').click(); }
async function handleProfileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'error');
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById('profileImage').src = e.target.result; };
    reader.readAsDataURL(file);
    document.getElementById('uploadSpinner').classList.remove('hidden');
    let studentIdCard = null;
    if (currentStudentId) {
        const { data: stu } = await db.from('core_students').select('student_id_card').eq('id', currentStudentId).single();
        if (stu) studentIdCard = stu.student_id_card;
    }
    if (!studentIdCard) {
        document.getElementById('uploadSpinner').classList.add('hidden');
        return Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสนักเรียน', 'error');
    }
    const driveUrl = await uploadFileToDrive(file, studentIdCard);
    if (driveUrl) {
        await db.from('core_students').update({ avatar_students_url: driveUrl }).eq('id', currentStudentId);
        document.getElementById('profileImage').src = driveUrl;
        Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
    }
    document.getElementById('uploadSpinner').classList.add('hidden');
    event.target.value = '';
}

// ========== โหลดและแสดงข้อมูลนักเรียน ==========
async function openMyData(studentId, studentData) {
    const modal = document.getElementById('studentDetailModal');
    modal.classList.remove('hidden');
    document.getElementById('modalLoadingOverlay').classList.remove('hidden');

    const fullName = `${studentData.prefix || ''}${studentData.first_name} ${studentData.last_name}`;
    document.getElementById('modalStudentName').innerText = fullName;
    document.getElementById('modalStudentCode').innerText = `รหัสประจำตัว: ${studentData.student_id_card}`;
    document.getElementById('view_fullname').innerText = fullName;

    if (studentData.avatar_students_url) {
        document.getElementById('profileImage').src = studentData.avatar_students_url;
    } else {
        document.getElementById('profileImage').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`;
    }

    document.getElementById('view_national_id').innerText = studentData.national_id ? formatNationalId(studentData.national_id) : 'ไม่มีข้อมูล';

    try {
        // หา enrollment ปัจจุบัน
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_number, core_classrooms(grade_level, room_number)')
            .eq('student_id', studentId)
            .eq('academic_year', currentAcademicYear)
            .eq('semester', currentSemester)
            .maybeSingle();
        if (enroll && enroll.core_classrooms) {
            document.getElementById('view_class_info').innerText = `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}  เลขที่ ${enroll.student_number || '-'}`;
        } else {
            // fallback ไม่แสดงคำว่า (ปี/ภาคอื่น) แล้ว
            const { data: anyEnroll } = await db.from('student_enrollments')
                .select('student_number, core_classrooms(grade_level, room_number)')
                .eq('student_id', studentId)
                .maybeSingle();
            if (anyEnroll && anyEnroll.core_classrooms) {
                document.getElementById('view_class_info').innerText = `ม.${anyEnroll.core_classrooms.grade_level}/${anyEnroll.core_classrooms.room_number}  เลขที่ ${anyEnroll.student_number || '-'}`;
            } else {
                document.getElementById('view_class_info').innerText = '-';
            }
        }

        // ข้อมูลครอบครัวและที่อยู่
        const { data: homeVisit } = await db.from('module_home_visits')
            .select('*')
            .eq('student_id', studentId)
            .order('visit_date', { ascending: false })
            .maybeSingle();

        if (homeVisit) {
            document.getElementById('view_parent_status').innerText = `สถานะครอบครัว: ${homeVisit.parents_status || 'ไม่ระบุ'}`;
            document.getElementById('view_father_name').innerText = homeVisit.father_name || '-';
            document.getElementById('view_father_job').innerText = homeVisit.father_job || '-';
            document.getElementById('view_father_phone').innerText = homeVisit.father_phone || '-';
            document.getElementById('view_mother_name').innerText = homeVisit.mother_name || '-';
            document.getElementById('view_mother_job').innerText = homeVisit.mother_job || '-';
            document.getElementById('view_mother_phone').innerText = homeVisit.mother_phone || '-';
            document.getElementById('view_guardian_name').innerText = homeVisit.guardian_name || '-';
            document.getElementById('view_guardian_relation').innerText = homeVisit.guardian_relation || '-';
            document.getElementById('view_guardian_job').innerText = homeVisit.guardian_job || '-';
            document.getElementById('view_guardian_phone').innerText = homeVisit.guardian_phone || '-';
            const addrParts = [
                homeVisit.house_number ? `บ้านเลขที่ ${homeVisit.house_number}` : '',
                homeVisit.village_no ? `หมู่ ${homeVisit.village_no}` : '',
                homeVisit.sub_district ? `ต.${homeVisit.sub_district}` : '',
                homeVisit.district ? `อ.${homeVisit.district}` : '',
                homeVisit.province ? `จ.${homeVisit.province}` : '',
                homeVisit.zipcode ? `รหัสไปรษณีย์ ${homeVisit.zipcode}` : ''
            ].filter(p => p).join(' ');
            document.getElementById('view_address').innerText = addrParts || 'ไม่มีข้อมูลที่อยู่';
        } else {
            document.getElementById('view_parent_status').innerText = 'สถานะครอบครัว: ไม่มีข้อมูล';
            ['father_name','father_job','father_phone','mother_name','mother_job','mother_phone',
             'guardian_name','guardian_relation','guardian_job','guardian_phone'].forEach(id => {
                const el = document.getElementById(`view_${id}`);
                if (el) el.innerText = '-';
            });
            document.getElementById('view_address').innerText = 'ยังไม่มีการบันทึกข้อมูลเยี่ยมบ้าน';
        }

        // Attendance
        let present=0,absent=0,late=0,pleave=0,sleave=0;
        const { data: attData } = await db.from('homeroom_attendance').select('status').eq('student_id', studentId);
        if (attData) attData.forEach(r => {
            if (r.status==='มา') present++;
            else if (r.status==='ขาด') absent++;
            else if (r.status==='สาย') late++;
            else if (r.status==='ลา') pleave++;
            else if (r.status==='ป่วย') sleave++;
        });
        const totalDays = present+absent+late+pleave+sleave;
        document.getElementById('total_school_days').innerText = totalDays;
        document.getElementById('stat_present').innerText = present;
        document.getElementById('stat_absent').innerText = absent;
        document.getElementById('stat_late').innerText = late;
        document.getElementById('stat_pleave').innerText = pleave;
        document.getElementById('stat_sleave').innerText = sleave;
        renderAttendanceChart(present,absent,late,pleave,sleave);

        // Behavior
        const { data: behaviors } = await db.from('behavior_scores').select('score_change').eq('student_id', studentId);
        let added=0,deducted=0;
        if (behaviors) behaviors.forEach(b => { if (b.score_change>0) added+=b.score_change; else deducted+=Math.abs(b.score_change); });
        document.getElementById('score_added').innerText = `+${added}`;
        document.getElementById('score_deducted').innerText = `-${deducted}`;
        document.getElementById('view_behavior_score').innerText = 100+added-deducted;

        // SDQ
        const { data: sdqData } = await db.from('sdq_assessments').select('*').eq('student_id', studentId);
        const sdqContainer = document.getElementById('view_sdq');
        if (!sdqData || sdqData.length===0) {
            sdqContainer.innerHTML = '<div class="p-4 bg-slate-100 text-center rounded-xl">ยังไม่ได้ประเมิน</div>';
        } else {
            sdqContainer.innerHTML = '';
            sdqData.forEach(item => {
                const colorClass = item.result_summary==='ปกติ' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
                sdqContainer.innerHTML += `<div class="flex justify-between p-3 rounded-lg border"><span>${getEvaluatorLabel(item.evaluator_type)}</span><span class="px-3 py-1 rounded-full text-xs ${colorClass}">${item.result_summary}</span></div>`;
            });
        }

        // EQ
        const { data: eqData } = await db.from('eq_assessments').select('*').eq('student_id', studentId).maybeSingle();
        const eqContainer = document.getElementById('view_eq_container');
        if (!eqData) eqContainer.innerHTML = '<div class="text-slate-500 font-bold"><i class="fa-solid fa-circle-exclamation"></i> ยังไม่ได้ประเมิน</div>';
        else eqContainer.innerHTML = `<div class="text-3xl font-black ${eqData.result_summary==='ปกติ'?'text-pink-600':'text-orange-500'}">${eqData.result_summary}</div><p class="text-sm">${eqData.detail || ''}</p>`;

        // Club
        const clubName = await fetchStudentClub(studentId);
        document.getElementById('view_club_name').innerText = clubName;

    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงข้อมูลบางส่วน', 'error');
    } finally {
        document.getElementById('modalLoadingOverlay').classList.add('hidden');
    }
}

async function fetchStudentClub(studentId) {
    try {
        const { data: reg } = await db.from('club_registrations').select('club_id').eq('student_id', studentId).maybeSingle();
        if (reg?.club_id) {
            const { data: clubInfo } = await db.from('club_lists').select('club_name').eq('id', reg.club_id).maybeSingle();
            return clubInfo ? clubInfo.club_name : 'ไม่พบชื่อชุมนุม';
        } else return 'ยังไม่ได้ลงทะเบียนชุมนุม';
    } catch (e) { return 'ไม่สามารถดึงข้อมูลได้'; }
}

function formatNationalId(id) {
    if (!id) return '-';
    const s = id.toString().replace(/\D/g, '');
    if (s.length !== 13) return id;
    return `${s[0]}-${s.slice(1,5)}-${s.slice(5,10)}-${s.slice(10,12)}-${s[12]}`;
}
function getEvaluatorLabel(type) {
    const map = { student:'นักเรียน', parent:'ผู้ปกครอง', teacher:'ครูประจำชั้น' };
    return map[type] || type;
}
function renderAttendanceChart(p,a,l,pl,sl) {
    const ctx = document.getElementById('attendanceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type:'doughnut',
        data:{ labels:['มาเรียน','ขาด','สาย','ลากิจ','ลาป่วย'], datasets:[{ data:[p,a,l,pl,sl], backgroundColor:['#10b981','#f43f5e','#f97316','#eab308','#3b82f6'], borderWidth:2 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'right' } } }
    });
}

// function closeStudentModal() {
//     document.getElementById('studentDetailModal').classList.add('hidden');
// }
// แทนที่ฟังก์ชัน closeStudentModal เดิมด้วยโค้ดนี้
function closeStudentModal() {
    // ปิด Modal (เพื่อความลื่นไหล)
    const modal = document.getElementById('studentDetailModal');
    if (modal) modal.classList.add('hidden');
    // กลับไปหน้าแรกของนักเรียน
    window.location.href = 'student_index.html';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('text-blue-700','bg-blue-200/50'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('btn-'+tabId).classList.add('text-blue-700','bg-blue-200/50');
}
function logout() {
    db.auth.signOut().then(() => window.location.replace('login.html'));
}

// ========== เริ่มต้น ==========
window.onload = async () => {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('login.html');

    const userEmail = session.user.email;
    const studentIdCard = userEmail.split('@')[0];

    const { data: student, error } = await db
        .from('core_students')
        .select('id, student_id_card, prefix, first_name, last_name, national_id, avatar_students_url')
        .eq('student_id_card', studentIdCard)
        .maybeSingle();

    if (error || !student) {
        await db.auth.signOut();
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียนของอีเมลนี้ กรุณาติดต่อครูผู้ดูแล', 'error')
            .then(() => window.location.replace('login.html'));
        return;
    }

    currentStudentId = student.id;
    await loadCurrentYearAndSemester();
    await openMyData(currentStudentId, student);
};
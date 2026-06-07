// info_student.js - สำหรับนักเรียนดูข้อมูลของตนเอง (ฉบับสมบูรณ์)
let currentStudentId = null;
let chartInstance = null;
let gasSettingsCache = null;
let currentAcademicYear = null;
let currentSemester = null;
let pendingProfileFile = null;
let moduleSettings = { gas_avatar_api_url: "", gas_avatar_folder_id: "" };

// Helper safe
function safeSetText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; else console.warn(`Element ${id} not found`); }
function safeSetHtml(id, html) { const el = document.getElementById(id); if(el) el.innerHTML = html; else console.warn(`Element ${id} not found`); }
function safeSetSrc(id, src) { const el = document.getElementById(id); if(el) el.src = src; else console.warn(`Element ${id} not found`); }

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
    if (el && currentAcademicYear && currentSemester) el.innerHTML = `📅 ภาคเรียนที่ ${currentSemester} ปีการศึกษา ${currentAcademicYear}`;
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
        gasSettingsCache = data;
        moduleSettings.gas_avatar_api_url = data?.gas_avatar_api_url || '';
        moduleSettings.gas_avatar_folder_id = data?.gas_avatar_folder_id || '';
        return gasSettingsCache;
    } catch (err) {
        console.error('Error loading GAS settings:', err);
        return { gas_avatar_api_url: null, gas_avatar_folder_id: null };
    }
}

// ========== อัปโหลดรูป (compressImage) ==========
async function compressImage(file, maxSizeMB = 2) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const MAX_SIZE = 1920;
                if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                let quality = 0.9;
                let base64 = canvas.toDataURL('image/jpeg', quality);
                while (Math.round((base64.length * 3) / 4) / (1024 * 1024) > maxSizeMB && quality > 0.1) {
                    quality -= 0.1;
                    base64 = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(base64.split(',')[1]);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}
async function uploadProfilePicture(file, studentCode) {
    const GAS_URL = moduleSettings.gas_avatar_api_url;
    const FOLDER_ID = moduleSettings.gas_avatar_folder_id;
    if (!GAS_URL || !FOLDER_ID) {
        Swal.fire({ icon: 'info', title: 'ยังไม่ตั้งค่าระบบอัปโหลด', html: '<p class="text-sm">กรุณาติดต่อผู้ดูแลระบบ</p>', confirmButtonText: 'รับทราบ' });
        return null;
    }
    Swal.fire({ title: 'กำลังอัปโหลด...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
        const compressedBase64 = await compressImage(file, 2);
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({ action: 'upload', base64: compressedBase64, fileName: `avatar_${studentCode}.jpg`, folderId: FOLDER_ID })
        });
        const result = await response.json();
        if (result.status === 'success' && result.url) { Swal.close(); return result.url; }
        else throw new Error(result.message || "ไม่สามารถอัปโหลดได้");
    } catch (err) {
        Swal.close();
        Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error');
        return null;
    }
}

// ========== จัดการรูป (กล้อง + เมฆ) ==========
function onFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'error');
    pendingProfileFile = file;
    const reader = new FileReader();
    reader.onload = (e) => safeSetSrc('profileImage', e.target.result);
    reader.readAsDataURL(file);
}
async function uploadPendingProfile() {
    if (!pendingProfileFile) return Swal.fire('ยังไม่มีรูป', 'กรุณาเลือกรูปด้วยปุ่มกล้องก่อน', 'info');
    if (!currentStudentId) return;
    const { data: student, error } = await db.from('core_students').select('student_id_card').eq('id', currentStudentId).single();
    if (error || !student) return Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสนักเรียน', 'error');
    const spinner = document.getElementById('uploadSpinner');
    if (spinner) spinner.classList.remove('hidden');
    const driveUrl = await uploadProfilePicture(pendingProfileFile, student.student_id_card);
    if (driveUrl) {
        await db.from('core_students').update({ avatar_students_url: driveUrl }).eq('id', currentStudentId);
        safeSetSrc('profileImage', driveUrl);
        Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
        pendingProfileFile = null;
    }
    if (spinner) spinner.classList.add('hidden');
}

// ========== ลบรูปโปรไฟล์ ==========
async function deleteProfilePicture() {
    if (!currentStudentId) return;
    const result = await Swal.fire({
        icon: 'warning',
        title: 'ลบรูปโปรไฟล์?',
        text: 'รูปจะถูกลบออกจากระบบ และไม่สามารถกู้คืนได้',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ลบรูป',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;
    const { error } = await db.from('core_students').update({ avatar_students_url: null }).eq('id', currentStudentId);
    if (error) return Swal.fire('ผิดพลาด', 'ไม่สามารถลบรูปได้', 'error');
    const el = document.getElementById('profileImage');
    if (el) {
        const fullName = document.getElementById('modalStudentName')?.innerText || '';
        el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`;
    }
    pendingProfileFile = null;
    Swal.fire({ icon: 'success', title: 'ลบรูปเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
}

// ========== Lightbox ==========
function openLightbox(imgSrc) { if(imgSrc){ const img = document.getElementById('lightboxImage'); if(img) img.src = imgSrc; document.getElementById('lightboxModal')?.classList.remove('hidden'); } }
function closeLightbox() { document.getElementById('lightboxModal')?.classList.add('hidden'); }

// ========== โหลดและแสดงข้อมูลนักเรียน ==========
// ========== แก้ไข openMyData ให้แสดงข้อมูลครอบครัวและเพิ่มรหัสนักเรียน ==========
async function openMyData(studentId, studentData) {
    const modal = document.getElementById('studentDetailModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const overlay = document.getElementById('modalLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    const fullName = `${studentData.prefix || ''}${studentData.first_name} ${studentData.last_name}`;
    safeSetText('modalStudentName', fullName);
    safeSetText('modalStudentCode', `รหัสประจำตัว: ${studentData.student_id_card}`);
    safeSetText('view_fullname', fullName);
    safeSetSrc('profileImage', studentData.avatar_students_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`);
    safeSetText('view_national_id', studentData.national_id ? formatNationalId(studentData.national_id) : 'ไม่มีข้อมูล');

    try {
        // 1. ดึงข้อมูลชั้นเรียนและเลขที่ (ปี/ภาคปัจจุบัน)
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_number, core_classrooms(grade_level, room_number)')
            .eq('student_id', studentId)
            .eq('academic_year', currentAcademicYear)
            .eq('semester', currentSemester)
            .maybeSingle();

        let classInfoText = '-';
        if (enroll && enroll.core_classrooms) {
            classInfoText = `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}  เลขที่ ${enroll.student_number || '-'}`;
        } else {
            // fallback กรณีไม่มีข้อมูลในปี/ภาคปัจจุบัน
            const { data: anyEnroll } = await db.from('student_enrollments')
                .select('student_number, core_classrooms(grade_level, room_number)')
                .eq('student_id', studentId)
                .maybeSingle();
            if (anyEnroll && anyEnroll.core_classrooms) {
                classInfoText = `ม.${anyEnroll.core_classrooms.grade_level}/${anyEnroll.core_classrooms.room_number}  เลขที่ ${anyEnroll.student_number || '-'}`;
            }
        }
        // เพิ่มรหัสนักเรียนต่อท้าย (ตามที่ขอ)
        if (studentData.student_id_card) {
            classInfoText += ` (รหัสประจำตัว: ${studentData.student_id_card})`;
        }
        safeSetText('view_class_info', classInfoText);

        // 2. ดึงข้อมูลครอบครัวและที่อยู่ (จาก module_home_visits ล่าสุด)
let homeVisit = null;
try {
    const { data, error } = await db.from('module_home_visits')
        .select('*')
        .eq('student_id', studentId)
        .order('visit_date', { ascending: false, nullsFirst: false })
        .maybeSingle();
    
    if (error) {
        console.error('❌ Error fetching homeVisit:', error);
    } else {
        homeVisit = data;
        console.log('📋 homeVisit data:', homeVisit);
    }
} catch(err) {
    console.error('❌ Exception fetching homeVisit:', err);
}

// ตรวจสอบว่า element ต่างๆ มีอยู่จริงก่อน set
const requiredIds = ['view_parent_status', 'view_father_name', 'view_father_job', 'view_father_phone',
                     'view_mother_name', 'view_mother_job', 'view_mother_phone',
                     'view_guardian_name', 'view_guardian_relation', 'view_guardian_job', 'view_guardian_phone',
                     'view_address'];

const missingIds = requiredIds.filter(id => !document.getElementById(id));
if (missingIds.length > 0) {
    console.warn('⚠️ Missing elements in HTML:', missingIds);
}

if (homeVisit) {
    safeSetText('view_parent_status', `สถานะครอบครัว: ${homeVisit.parents_status || 'ไม่ระบุ'}`);
    safeSetText('view_father_name', homeVisit.father_name || '-');
    safeSetText('view_father_job', homeVisit.father_job || '-');
    safeSetText('view_father_phone', homeVisit.father_phone || '-');
    safeSetText('view_mother_name', homeVisit.mother_name || '-');
    safeSetText('view_mother_job', homeVisit.mother_job || '-');
    safeSetText('view_mother_phone', homeVisit.mother_phone || '-');
    safeSetText('view_guardian_name', homeVisit.guardian_name || '-');
    safeSetText('view_guardian_relation', homeVisit.guardian_relation || '-');
    safeSetText('view_guardian_job', homeVisit.guardian_job || '-');
    safeSetText('view_guardian_phone', homeVisit.guardian_phone || '-');

    const addrParts = [
        homeVisit.house_number ? `บ้านเลขที่ ${homeVisit.house_number}` : '',
        homeVisit.village_no ? `หมู่ ${homeVisit.village_no}` : '',
        homeVisit.sub_district ? `ต.${homeVisit.sub_district}` : '',
        homeVisit.district ? `อ.${homeVisit.district}` : '',
        homeVisit.province ? `จ.${homeVisit.province}` : '',
        homeVisit.zipcode ? `รหัสไปรษณีย์ ${homeVisit.zipcode}` : ''
    ].filter(p => p).join(' ');
    safeSetText('view_address', addrParts || 'ไม่มีข้อมูลที่อยู่');
} else {
    console.log('ℹ️ No home visit record for student', studentId);
    safeSetText('view_parent_status', 'สถานะครอบครัว: ไม่มีข้อมูล');
    ['father_name','father_job','father_phone','mother_name','mother_job','mother_phone',
     'guardian_name','guardian_relation','guardian_job','guardian_phone'].forEach(id => safeSetText(`view_${id}`, '-'));
    safeSetText('view_address', 'ยังไม่มีการบันทึกข้อมูลเยี่ยมบ้าน');
}

        // 3. Attendance, Behavior, SDQ, EQ, Club (คงเดิม ไม่ต้องแก้)
        // Attendance
        let present = 0, absent = 0, late = 0, pleave = 0, sleave = 0;
        const { data: attData } = await db.from('homeroom_attendance').select('status').eq('student_id', studentId);
        if (attData) attData.forEach(r => {
            if (r.status === 'มา') present++;
            else if (r.status === 'ขาด') absent++;
            else if (r.status === 'สาย') late++;
            else if (r.status === 'ลา') pleave++;
            else if (r.status === 'ป่วย') sleave++;
        });
        safeSetText('total_school_days', present + absent + late + pleave + sleave);
        safeSetText('stat_present', present);
        safeSetText('stat_absent', absent);
        safeSetText('stat_late', late);
        safeSetText('stat_pleave', pleave);
        safeSetText('stat_sleave', sleave);
        renderAttendanceChart(present, absent, late, pleave, sleave);

        // Behavior
        const { data: behaviors } = await db.from('behavior_scores').select('score_change').eq('student_id', studentId);
        let added = 0, deducted = 0;
        if (behaviors) behaviors.forEach(b => {
            if (b.score_change > 0) added += b.score_change;
            else deducted += Math.abs(b.score_change);
        });
        safeSetText('score_added', `+${added}`);
        safeSetText('score_deducted', `-${deducted}`);
        safeSetText('view_behavior_score', 100 + added - deducted);

        // SDQ
        const { data: sdqData } = await db.from('sdq_assessments').select('*').eq('student_id', studentId);
        const sdqDiv = document.getElementById('view_sdq');
        if (sdqDiv) {
            if (!sdqData || sdqData.length === 0) {
                sdqDiv.innerHTML = '<div class="p-4 bg-slate-100 text-center rounded-xl">ยังไม่ได้ประเมิน</div>';
            } else {
                sdqDiv.innerHTML = '';
                sdqData.forEach(item => {
                    const colorClass = item.result_summary === 'ปกติ' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
                    sdqDiv.innerHTML += `<div class="flex justify-between p-3 rounded-lg border"><span>${getEvaluatorLabel(item.evaluator_type)}</span><span class="px-3 py-1 rounded-full text-xs ${colorClass}">${item.result_summary}</span></div>`;
                });
            }
        }

        // EQ
        const { data: eqData } = await db.from('eq_assessments').select('*').eq('student_id', studentId).maybeSingle();
        const eqDiv = document.getElementById('view_eq_container');
        if (eqDiv) {
            if (!eqData) eqDiv.innerHTML = '<div class="text-slate-500 font-bold"><i class="fa-solid fa-circle-exclamation"></i> ยังไม่ได้ประเมิน</div>';
            else eqDiv.innerHTML = `<div class="text-3xl font-black ${eqData.result_summary === 'ปกติ' ? 'text-pink-600' : 'text-orange-500'}">${eqData.result_summary}</div><p class="text-sm">${eqData.detail || ''}</p>`;
        }

        // Club
        const clubName = await fetchStudentClub(studentId);
        safeSetText('view_club_name', clubName);

    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงข้อมูลบางส่วน', 'error');
    } finally {
        if (overlay) overlay.classList.add('hidden');
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
    // ลบอักขระที่ไม่ใช่ตัวเลขออก แล้วแสดงเป็นเลข 13 หลักติดกัน (ไม่มีขีด)
    return id.toString().replace(/\D/g, '');
}

function getEvaluatorLabel(type) {
    const map = { student:'นักเรียน', parent:'ผู้ปกครอง', teacher:'ครูประจำชั้น' };
    return map[type] || type;
}
function renderAttendanceChart(p,a,l,pl,sl) {
    const ctx = document.getElementById('attendanceChart')?.getContext('2d');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type:'doughnut',
        data:{ labels:['มาเรียน','ขาด','สาย','ลากิจ','ลาป่วย'], datasets:[{ data:[p,a,l,pl,sl], backgroundColor:['#10b981','#f43f5e','#f97316','#eab308','#3b82f6'], borderWidth:2 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'right' } } }
    });
}
function closeStudentModal() {
    const modal = document.getElementById('studentDetailModal');
    if (modal) modal.classList.add('hidden');
    window.location.href = 'student_index.html';  // กลับไปหน้าแรก
}
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('text-blue-700','bg-blue-200/50'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');
    const btn = document.getElementById('btn-'+tabId);
    if (btn) btn.classList.add('text-blue-700','bg-blue-200/50');
}
function logout() { db.auth.signOut().then(() => window.location.replace('login.html')); }

// ========== เริ่มต้น ==========
document.addEventListener('DOMContentLoaded', async () => {
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
    await loadGasSettings();
    await openMyData(currentStudentId, student);

    // ผูกอีเวนต์
    document.getElementById('profileFileInput')?.addEventListener('change', onFileSelected);
    document.getElementById('cloudUploadBtn')?.addEventListener('click', uploadPendingProfile);
});
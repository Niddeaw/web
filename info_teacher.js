// ========== ตัวแปร Global ==========
let currentUserRole = 'teacher';
let actualUserRole = 'teacher';
let isCurrentAdminMode = false;
let currentUserId = null;
let chartInstance = null;
let activeStudentId = null;
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
    } catch (err) {
        console.warn('Cannot load year/semester, using default', err);
        currentAcademicYear = 2567;
        currentSemester = 1;
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

async function saveGasSettingsToDb(gasUrl, folderId) {
    const { data: existing, error: findError } = await db.from('core_school_info').select('id').limit(1).maybeSingle();
    if (findError) throw findError;
    if (existing) {
        const { error } = await db.from('core_school_info').update({ gas_avatar_api_url: gasUrl, gas_avatar_folder_id: folderId }).eq('id', existing.id);
        if (error) throw error;
    } else {
        const { error } = await db.from('core_school_info').insert({ gas_avatar_api_url: gasUrl, gas_avatar_folder_id: folderId });
        if (error) throw error;
    }
    gasSettingsCache = null;
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
    if (activeStudentId) {
        const { data: stu } = await db.from('core_students').select('student_id_card').eq('id', activeStudentId).single();
        if (stu) studentIdCard = stu.student_id_card;
    }
    if (!studentIdCard) {
        document.getElementById('uploadSpinner').classList.add('hidden');
        return Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสนักเรียน', 'error');
    }
    const driveUrl = await uploadFileToDrive(file, studentIdCard);
    if (driveUrl) {
        await db.from('core_students').update({ avatar_students_url: driveUrl }).eq('id', activeStudentId);
        document.getElementById('profileImage').src = driveUrl;
        Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
    }
    document.getElementById('uploadSpinner').classList.add('hidden');
    event.target.value = '';
}

// ========== Settings Modal ==========
async function openSettingsModal() {
    const settings = await loadGasSettings();
    document.getElementById('settingsGasUrl').value = settings.gas_avatar_api_url || '';
    document.getElementById('settingsFolderId').value = settings.gas_avatar_folder_id || '';
    document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }
async function saveSettings() {
    const gasUrl = document.getElementById('settingsGasUrl').value.trim();
    const folderId = document.getElementById('settingsFolderId').value.trim();
    if (!gasUrl) return Swal.fire('กรุณากรอก GAS URL', '', 'warning');
    try {
        await saveGasSettingsToDb(gasUrl, folderId);
        closeSettingsModal();
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
    }
}

// ========== โหลดห้องเรียน (แอดมินและครู กรองปี/ภาคปัจจุบัน) ==========
async function loadClassrooms() {
    await loadCurrentYearAndSemester();

    const isHighLevel = ['super_admin', 'admin', 'module_admin'].includes(actualUserRole);
    
    let classrooms = [];
    let error = null;

    // ✅ ทั้งแอดมินและครูใช้ core_classrooms กรอง academic_year, semester
    let query = db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .eq('academic_year', currentAcademicYear)
        .eq('semester', currentSemester)
        .order('grade_level').order('room_number');

    if (!isHighLevel) {
        // ครูที่ปรึกษา: กรองเฉพาะห้องที่ตัวเองเป็นที่ปรึกษา
        query = query.or(`adviser_id_1.eq.${currentUserId},adviser_id_2.eq.${currentUserId}`);
    }

    const { data, error: err } = await query;
    classrooms = data;
    error = err;

    if (error) {
        console.error(error);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดห้องเรียนได้', 'error');
        return;
    }

    if (isHighLevel) {
        // แอดมิน: แสดง dropdown ทุกห้องในปี/ภาคปัจจุบัน
        document.getElementById('adminFilterSection').classList.remove('hidden');
        document.getElementById('no-classroom-msg').classList.remove('hidden');
        document.getElementById('studentDataTable').classList.add('hidden');

        const sel = document.getElementById('classSelector');
        sel.innerHTML = '<option value="">-- เลือกห้องเรียน (ปี/ภาคปัจจุบัน) --</option>';
        if (classrooms.length === 0) {
            sel.innerHTML += '<option disabled>ไม่มีห้องเรียนในปี/ภาคนี้</option>';
        } else {
            classrooms.forEach(c => {
                sel.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
            });
        }
        sel.onchange = () => {
            if (sel.value) loadStudentsData(sel.value, true);
            else {
                if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
                document.getElementById('tb-students').innerHTML = '';
                document.getElementById('studentDataTable').classList.add('hidden');
                document.getElementById('no-classroom-msg').classList.remove('hidden');
            }
        };
    } else {
        // ครู: โหลดห้องแรกที่พบ (ปกติมีห้องเดียว) หรือแสดงถ้าไม่มี
        document.getElementById('adminFilterSection').classList.add('hidden');
        if (classrooms && classrooms.length > 0) {
            await loadStudentsData(classrooms[0].id, false);
        } else {
            Swal.fire('แจ้งเตือน', `คุณไม่มีข้อมูลห้องโฮมรูมในปีการศึกษา ${currentAcademicYear} ภาค ${currentSemester}`, 'info');
            // ซ่อนตารางและแสดงข้อความ
            document.getElementById('studentDataTable').classList.add('hidden');
            document.getElementById('no-classroom-msg').classList.remove('hidden');
            document.getElementById('no-classroom-msg').innerHTML = '<i class="fa-solid fa-school-circle-exclamation text-3xl mb-3 block"></i><p class="font-bold">ไม่มีห้องเรียนที่ปรึกษาในปี/ภาคนี้</p>';
        }
    }
}

// ========== โหลดรายชื่อนักเรียนในห้อง (มี fallback แบบเดิมที่เคยใช้ได้) ==========
async function loadStudentsData(classroomId, isAdmin = true) {
    if (!classroomId) return;
    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: () => Swal.showLoading() });

    // ลองดึงข้อมูลในปี/ภาคปัจจุบันก่อน
    let { data, error } = await db.from('student_enrollments')
        .select(`id, student_number,
            core_classrooms(grade_level, room_number),
            core_students(id, student_id_card, prefix, first_name, last_name, national_id, status)`)
        .eq('classroom_id', classroomId)
        .eq('academic_year', currentAcademicYear)
        .eq('semester', currentSemester)
        .order('student_number');

    let usedFallback = false;
    // ถ้าไม่มีข้อมูลในปี/ภาคปัจจุบัน ให้ลองดึงข้อมูลทั้งหมดของห้องนั้น (ไม่จำกัดปี/ภาค)
    if (!error && (!data || data.length === 0)) {
        const { data: allData, error: allError } = await db.from('student_enrollments')
            .select(`id, student_number,
                core_classrooms(grade_level, room_number),
                core_students(id, student_id_card, prefix, first_name, last_name, national_id, status)`)
            .eq('classroom_id', classroomId)
            .order('student_number');
        if (!allError && allData && allData.length > 0) {
            data = allData;
            usedFallback = true;
        }
    }

    if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
    const tbody = document.getElementById('tb-students');
    const table = document.getElementById('studentDataTable');
    const noMsg = document.getElementById('no-classroom-msg');

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>`;
        table.classList.remove('hidden');
        noMsg.classList.add('hidden');
        Swal.close();
        if (!usedFallback) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่มีข้อมูลในปี/ภาคปัจจุบัน',
                text: `ไม่มีข้อมูลนักเรียนในปีการศึกษา ${currentAcademicYear} ภาค ${currentSemester}`,
                confirmButtonText: 'รับทราบ'
            });
        }
        return;
    }

    if (usedFallback) {
        Swal.fire({
            icon: 'warning',
            title: 'แสดงข้อมูลจากปี/ภาคอื่น',
            html: `ไม่พบข้อมูลในปีการศึกษา ${currentAcademicYear} ภาค ${currentSemester}<br>กำลังแสดงข้อมูลนักเรียนทั้งหมดที่มีในห้องนี้`,
            timer: 3000,
            showConfirmButton: false
        });
    }

    // สร้างแถว (ไม่มีปุ่มให้สิทธิ์)
    tbody.innerHTML = data.map(enr => {
        const st = enr.core_students;
        const cls = enr.core_classrooms;
        if (!st || !cls) return '';
        const fullName = `${st.prefix || ''}${st.first_name} ${st.last_name}`;
        return `<tr>
            <td class="py-3 px-4 text-center">ม.${cls.grade_level}/${cls.room_number}</td>
            <td class="py-3 px-4 text-center">${enr.student_number || '-'}</td>
            <td class="py-3 px-4">${st.student_id_card}</td>
            <td class="py-3 px-4">${fullName}</td>
            <td class="py-3 px-4 text-center">
                <button class="btn-open-student bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700"
                    data-student-id="${st.id}"
                    data-full-name="${fullName.replace(/"/g, '&quot;')}"
                    data-student-code="${st.student_id_card}"
                    data-grade="${cls.grade_level}"
                    data-room="${cls.room_number}"
                    data-number="${enr.student_number || '-'}"
                    data-prefix="${st.prefix || ''}"
                    data-national-id="${st.national_id || ''}">
                    <i class="fa-solid fa-magnifying-glass"></i> ดูข้อมูล
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-open-student').forEach(btn => btn.addEventListener('click', () =>
        openStudentFullData(btn.dataset.studentId, btn.dataset.fullName, btn.dataset.studentCode,
            { grade: btn.dataset.grade, room: btn.dataset.room, number: btn.dataset.number,
              prefix: btn.dataset.prefix, nationalId: btn.dataset.nationalId })
    ));

    table.classList.remove('hidden');
    noMsg.classList.add('hidden');
    $('#studentDataTable').DataTable({ scrollX: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' } });
    Swal.close();
}

// ========== เปิด Modal ดูข้อมูลนักเรียน (เดิม) ==========
async function openStudentFullData(studentId, fullName, studentCode, extraInfo = {}) {
    activeStudentId = studentId;
    document.getElementById('studentDetailModal').classList.remove('hidden');
    switchTab('tab1');
    document.getElementById('modalLoadingOverlay').classList.remove('hidden');
    document.getElementById('modalStudentName').innerText = fullName;
    document.getElementById('modalStudentCode').innerText = `รหัสประจำตัว: ${studentCode || '-'}`;
    document.getElementById('profileImage').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`;
    document.getElementById('view_fullname').innerText = fullName;
    document.getElementById('view_class_info').innerText = extraInfo.grade && extraInfo.room ? `ม.${extraInfo.grade}/${extraInfo.room}  เลขที่ ${extraInfo.number}` : '-';
    document.getElementById('view_national_id').innerText = extraInfo.nationalId ? formatNationalId(extraInfo.nationalId) : 'ไม่มีข้อมูล';
    try {
        const { data: student } = await db.from('core_students').select('*').eq('id', studentId).single();
        if (student?.avatar_students_url) document.getElementById('profileImage').src = student.avatar_students_url;
        if (student?.national_id) document.getElementById('view_national_id').innerText = formatNationalId(student.national_id);
        const { data: homeVisit } = await db.from('module_home_visits').select('*').eq('student_id', studentId).order('visit_date', { ascending: false }).maybeSingle();
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
             'guardian_name','guardian_relation','guardian_job','guardian_phone']
                .forEach(id => document.getElementById(`view_${id}`).innerText = '-');
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
        document.getElementById('view_club_name').innerText = await fetchStudentClub(studentId);
    } catch(err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงข้อมูลบางส่วน', 'error');
    } finally {
        document.getElementById('modalLoadingOverlay').classList.add('hidden');
    }
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
function closeStudentModal() { document.getElementById('studentDetailModal').classList.add('hidden'); activeStudentId = null; }
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('text-blue-700','bg-blue-200/50'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('btn-'+tabId).classList.add('text-blue-700','bg-blue-200/50');
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
function logout() { db.auth.signOut().then(() => window.location.replace('index.html')); }

// ========== Toggle Admin/Teacher Mode ==========
function updateToggleModeUI() {
    const btn = document.getElementById('btnToggleMode');
    const pageBadge = document.getElementById('pageBadge');
    if (isCurrentAdminMode) {
        btn.innerHTML = '<i class="fa-solid fa-toggle-on text-emerald-500 text-lg"></i> <span>โหมด: ผู้ดูแลระบบ</span>';
        btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 border';
        pageBadge.innerText = 'มุมมองผู้ดูแลระบบ (Admin View - เลือกดูทีละห้อง)';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-toggle-off text-slate-400 text-lg"></i> <span>โหมด: ครูที่ปรึกษา</span>';
        btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-50 border';
        pageBadge.innerText = 'มุมมองครูที่ปรึกษา (Teacher View - เฉพาะห้องโฮมรูม)';
    }
}
async function toggleTeacherAdminMode() {
    isCurrentAdminMode = !isCurrentAdminMode;
    actualUserRole = isCurrentAdminMode ? currentUserRole : 'teacher';
    updateToggleModeUI();
    if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
    document.getElementById('tb-students').innerHTML = '';
    document.getElementById('studentDataTable').classList.add('hidden');
    await loadClassrooms();
}

// ========== เริ่มต้นเมื่อโหลดหน้า ==========
window.onload = async () => {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');
    currentUserId = session.user.id;

    const { data: profile } = await db.from('core_personnel').select('role').eq('id', currentUserId).single();
    if (profile) { currentUserRole = profile.role; actualUserRole = profile.role; }

    await loadCurrentYearAndSemester();

    const isHighLevel = ['super_admin', 'admin'].includes(currentUserRole);
    if (isHighLevel) {
        document.getElementById('btnToggleMode').classList.remove('hidden');
        document.getElementById('btnSettings').classList.remove('hidden');
        isCurrentAdminMode = true;
        updateToggleModeUI();
    } else {
        isCurrentAdminMode = false;
        updateToggleModeUI();
    }

    await loadClassrooms();
};

document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal')) closeSettingsModal();
});
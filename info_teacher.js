// info_teacher.js - สำหรับครู/แอดมิน (safe check)
let currentUserRole = 'teacher';
let actualUserRole = 'teacher';
let isCurrentAdminMode = false;
let currentUserId = null;
let chartInstance = null;
let activeStudentId = null;
let gasSettingsCache = null;
let currentAcademicYear = null;
let currentSemester = null;

let pendingProfileFile = null;
let moduleSettings = { gas_avatar_api_url: "", gas_avatar_folder_id: "" };

// Helper safe
function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; else console.warn(`Element ${id} not found`); }
function safeSetHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; else console.warn(`Element ${id} not found`); }
function safeSetSrc(id, src) { const el = document.getElementById(id); if (el) el.src = src; else console.warn(`Element ${id} not found`); }

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
    moduleSettings.gas_avatar_api_url = gasUrl;
    moduleSettings.gas_avatar_folder_id = folderId;
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
    if (!activeStudentId) return;
    const { data: student, error } = await db.from('core_students').select('student_id_card').eq('id', activeStudentId).single();
    if (error || !student) return Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสนักเรียน', 'error');
    const spinner = document.getElementById('uploadSpinner');
    if (spinner) spinner.classList.remove('hidden');
    const driveUrl = await uploadProfilePicture(pendingProfileFile, student.student_id_card);
    if (driveUrl) {
        await db.from('core_students').update({ avatar_students_url: driveUrl }).eq('id', activeStudentId);
        safeSetSrc('profileImage', driveUrl);
        Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
        pendingProfileFile = null;
    }
    if (spinner) spinner.classList.add('hidden');
}

// Lightbox
function openLightbox(src) { if (src) { const img = document.getElementById('lightboxImage'); if (img) img.src = src; document.getElementById('lightboxModal')?.classList.remove('hidden'); } }
function closeLightbox() { document.getElementById('lightboxModal')?.classList.add('hidden'); }

// Settings Modal
async function openSettingsModal() { await loadGasSettings(); safeSetText('settingsGasUrl', moduleSettings.gas_avatar_api_url); safeSetText('settingsFolderId', moduleSettings.gas_avatar_folder_id); document.getElementById('settingsModal')?.classList.remove('hidden'); }
function closeSettingsModal() { document.getElementById('settingsModal')?.classList.add('hidden'); }
async function saveSettings() {
    const gasUrl = document.getElementById('settingsGasUrl')?.value.trim() || '';
    const folderId = document.getElementById('settingsFolderId')?.value.trim() || '';
    if (!gasUrl) return Swal.fire('กรุณากรอก GAS URL', '', 'warning');
    try { await saveGasSettingsToDb(gasUrl, folderId); closeSettingsModal(); Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว', timer: 1500, showConfirmButton: false }); }
    catch (err) { Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error'); }
}

// ========== โหลดห้องเรียน ==========
async function loadClassrooms() {
    await loadCurrentYearAndSemester();
    const isHighLevel = ['super_admin', 'admin', 'module_admin'].includes(actualUserRole);
    let query = db.from('core_classrooms').select('id, grade_level, room_number, core_personnel_1:core_personnel!adviser_id_1(prefix, first_name, last_name), core_personnel_2:core_personnel!adviser_id_2(prefix, first_name, last_name)').eq('academic_year', currentAcademicYear).eq('semester', currentSemester).order('grade_level').order('room_number');
    if (!isHighLevel) query = query.or(`adviser_id_1.eq.${currentUserId},adviser_id_2.eq.${currentUserId}`);
    const { data: classrooms, error } = await query;
    if (error) { console.error(error); Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดห้องเรียนได้', 'error'); return; }

    if (isHighLevel) {
        document.getElementById('adminFilterSection')?.classList.remove('hidden');
        document.getElementById('no-classroom-msg')?.classList.remove('hidden');
        document.getElementById('studentDataTable')?.classList.add('hidden');

        const sel = document.getElementById('classSelector');
        if (sel) {
            // ล้าง TomSelect เดิม (กรณี reload)
            if (sel.tomselect) sel.tomselect.destroy();

            sel.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
            if (classrooms.length === 0) {
                sel.innerHTML += '<option disabled>ไม่มีห้องเรียนในปี/ภาคนี้</option>';
            } else {
                classrooms.forEach(c => {
                    sel.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
                });
            }

            // สร้าง map classroom id -> ชื่อครูที่ปรึกษา
            const adviserMap = {};
            classrooms.forEach(c => {
                const names = [];
                if (c.core_personnel_1) names.push(`${c.core_personnel_1.prefix || ''}${c.core_personnel_1.first_name} ${c.core_personnel_1.last_name}`);
                if (c.core_personnel_2) names.push(`${c.core_personnel_2.prefix || ''}${c.core_personnel_2.first_name} ${c.core_personnel_2.last_name}`);
                adviserMap[c.id] = names.length > 0 ? names.join(' / ') : null;
            });

            function showAdviser(value) {
                const div = document.getElementById('adviserDisplay');
                const nameEl = document.getElementById('adviserNames');
                if (!div || !nameEl) return;
                const name = value ? adviserMap[value] : null;
                if (name) {
                    nameEl.textContent = name;
                    div.classList.remove('hidden');
                    div.classList.add('flex');
                } else {
                    div.classList.add('hidden');
                    div.classList.remove('flex');
                }
            }

            // Init TomSelect
            const tomSel = new TomSelect('#classSelector', {
                placeholder: 'พิมพ์หรือเลือกห้องเรียน...',
                allowEmptyOption: true,
                maxOptions: null,
                onChange(value) {
                    showAdviser(value);
                    if (value) {
                        loadStudentsData(value);
                    } else {
                        if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
                        safeSetHtml('tb-students', '');
                        document.getElementById('studentDataTable')?.classList.add('hidden');
                        document.getElementById('no-classroom-msg')?.classList.remove('hidden');
                    }
                }
            });
        }
    } else {
        document.getElementById('adminFilterSection')?.classList.add('hidden');
        if (classrooms && classrooms.length > 0) await loadStudentsData(classrooms[0].id);
        else { Swal.fire('แจ้งเตือน', `คุณไม่มีข้อมูลห้องโฮมรูมในปีการศึกษา ${currentAcademicYear} ภาค ${currentSemester}`, 'info'); document.getElementById('studentDataTable')?.classList.add('hidden'); const noMsg = document.getElementById('no-classroom-msg'); if (noMsg) { noMsg.classList.remove('hidden'); noMsg.innerHTML = '<i class="fa-solid fa-school-circle-exclamation text-3xl mb-3 block"></i><p class="font-bold">ไม่มีห้องเรียนที่ปรึกษาในปี/ภาคนี้</p>'; } }
    }
}

// ========== โหลดรายชื่อนักเรียน (พร้อมรูป) ==========
async function loadStudentsData(classroomId) {
    if (!classroomId) return;
    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: () => Swal.showLoading() });

    let { data, error } = await db.from('student_enrollments')
        .select(`id, student_number,
            core_classrooms(grade_level, room_number),
            core_students(id, student_id_card, prefix, first_name, last_name, national_id, status, avatar_students_url)`)
        .eq('classroom_id', classroomId)
        .eq('academic_year', currentAcademicYear)
        .eq('semester', currentSemester)
        .order('student_number');

    let usedFallback = false;
    if (!error && (!data || data.length === 0)) {
        const { data: allData, error: allError } = await db.from('student_enrollments')
            .select(`id, student_number,
                core_classrooms(grade_level, room_number),
                core_students(id, student_id_card, prefix, first_name, last_name, national_id, status, avatar_students_url)`)
            .eq('classroom_id', classroomId)
            .order('student_number');
        if (!allError && allData && allData.length > 0) { data = allData; usedFallback = true; }
    }

    if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
    const tbody = document.getElementById('tb-students');
    const table = document.getElementById('studentDataTable');
    const noMsg = document.getElementById('no-classroom-msg');

    if (error || !data || data.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>`;
        if (table) table.classList.remove('hidden');
        if (noMsg) noMsg.classList.add('hidden');
        Swal.close();
        if (!usedFallback) Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูลในปี/ภาคปัจจุบัน', text: `ไม่มีข้อมูลนักเรียนในปี ${currentAcademicYear} ภาค ${currentSemester}`, confirmButtonText: 'รับทราบ' });
        return;
    }
    if (usedFallback) Swal.fire({ icon: 'warning', title: 'แสดงข้อมูลจากปี/ภาคอื่น', html: `ไม่พบข้อมูลในปี ${currentAcademicYear} ภาค ${currentSemester}<br>กำลังแสดงข้อมูลทั้งหมด`, timer: 3000, showConfirmButton: false });

    if (tbody) {
        tbody.innerHTML = data.map(enr => {
            const st = enr.core_students;
            const cls = enr.core_classrooms;
            if (!st || !cls) return '';
            const fullName = `${st.prefix || ''}${st.first_name} ${st.last_name}`;
            const avatarUrl = st.avatar_students_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=4f46e5&color=fff&size=64&rounded=true`;
            return `<tr>
                <td class="py-2 px-2 text-center"><img src="${avatarUrl}" class="w-10 h-10 rounded-full object-cover mx-auto cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:scale-110 transition-all duration-200" onclick="openLightbox(this.src)" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=4f46e5&color=fff&size=64&rounded=true'"></td>
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
                { grade: btn.dataset.grade, room: btn.dataset.room, number: btn.dataset.number, prefix: btn.dataset.prefix, nationalId: btn.dataset.nationalId })
        ));
    }
    if (table) table.classList.remove('hidden');
    if (noMsg) noMsg.classList.add('hidden');
    $('#studentDataTable').DataTable({
        scrollX: true,
        responsive: true,
        pageLength: 50,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        columnDefs: [{ orderable: false, targets: 0 }, { responsivePriority: 1, targets: -1 }]
    });
    Swal.close();
}

// ========== เปิด Modal ดูข้อมูลนักเรียน (ใช้ safe functions) ==========
async function openStudentFullData(studentId, fullName, studentCode, extraInfo = {}) {
    let classInfo = (extraInfo.grade && extraInfo.room) ? `ม.${extraInfo.grade}/${extraInfo.room}  เลขที่ ${extraInfo.number}` : '-';
    activeStudentId = studentId;
    pendingProfileFile = null;
    document.getElementById('studentDetailModal')?.classList.remove('hidden');
    switchTab('tab1');
    const overlay = document.getElementById('modalLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
    safeSetText('modalStudentName', fullName);
    safeSetText('modalStudentCode', `รหัสประจำตัว: ${studentCode || '-'}`);
    safeSetSrc('profileImage', `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`);
    safeSetText('view_fullname', fullName);
    safeSetText('view_class_info', extraInfo.grade && extraInfo.room ? `ม.${extraInfo.grade}/${extraInfo.room} เลขที่ ${extraInfo.number}` : '-');
    safeSetText('view_national_id', extraInfo.nationalId ? formatNationalId(extraInfo.nationalId) : 'ไม่มีข้อมูล');
    if (studentCode) classInfo += ` (เลขประจำตัวนักเรียน: ${studentCode})`;
    document.getElementById('view_class_info').innerText = classInfo;

    try {
        const { data: student } = await db.from('core_students').select('*').eq('id', studentId).single();
        if (student?.avatar_students_url) safeSetSrc('profileImage', student.avatar_students_url);
        if (student?.national_id) safeSetText('view_national_id', formatNationalId(student.national_id));

        const { data: homeVisit } = await db.from('module_home_visits').select('*').eq('student_id', studentId).order('visit_date', { ascending: false }).maybeSingle();
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
            const addrParts = [homeVisit.house_number && `บ้านเลขที่ ${homeVisit.house_number}`, homeVisit.village_no && `หมู่ ${homeVisit.village_no}`, homeVisit.sub_district && `ต.${homeVisit.sub_district}`, homeVisit.district && `อ.${homeVisit.district}`, homeVisit.province && `จ.${homeVisit.province}`, homeVisit.zipcode && `รหัสไปรษณีย์ ${homeVisit.zipcode}`].filter(p => p).join(' ');
            safeSetText('view_address', addrParts || 'ไม่มีข้อมูลที่อยู่');
        } else {
            safeSetText('view_parent_status', 'สถานะครอบครัว: ไม่มีข้อมูล');
            ['father_name', 'father_job', 'father_phone', 'mother_name', 'mother_job', 'mother_phone', 'guardian_name', 'guardian_relation', 'guardian_job', 'guardian_phone'].forEach(id => safeSetText(`view_${id}`, '-'));
            safeSetText('view_address', 'ยังไม่มีการบันทึกข้อมูลเยี่ยมบ้าน');
        }

        let present = 0, absent = 0, late = 0, pleave = 0, sleave = 0;
        const { data: attData } = await db.from('homeroom_attendance').select('status').eq('student_id', studentId);
        if (attData) attData.forEach(r => { if (r.status === 'มา') present++; else if (r.status === 'ขาด') absent++; else if (r.status === 'สาย') late++; else if (r.status === 'ลา') pleave++; else if (r.status === 'ป่วย') sleave++; });
        safeSetText('total_school_days', present + absent + late + pleave + sleave);
        safeSetText('stat_present', present); safeSetText('stat_absent', absent); safeSetText('stat_late', late); safeSetText('stat_pleave', pleave); safeSetText('stat_sleave', sleave);
        renderAttendanceChart(present, absent, late, pleave, sleave);

        const { data: behaviors } = await db.from('behavior_scores').select('score_change').eq('student_id', studentId);
        let added = 0, deducted = 0; if (behaviors) behaviors.forEach(b => { if (b.score_change > 0) added += b.score_change; else deducted += Math.abs(b.score_change); });
        safeSetText('score_added', `+${added}`); safeSetText('score_deducted', `-${deducted}`); safeSetText('view_behavior_score', 100 + added - deducted);

        const { data: sdqData } = await db.from('sdq_assessments').select('*').eq('student_id', studentId);
        const sdqDiv = document.getElementById('view_sdq');
        if (sdqDiv) {
            if (!sdqData || sdqData.length === 0) sdqDiv.innerHTML = '<div class="p-4 bg-slate-100 text-center rounded-xl">ยังไม่ได้ประเมิน</div>';
            else { sdqDiv.innerHTML = ''; sdqData.forEach(item => { const colorClass = item.result_summary === 'ปกติ' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'; sdqDiv.innerHTML += `<div class="flex justify-between p-3 rounded-lg border"><span>${getEvaluatorLabel(item.evaluator_type)}</span><span class="px-3 py-1 rounded-full text-xs ${colorClass}">${item.result_summary}</span></div>`; }); }
        }

        const { data: eqData } = await db.from('eq_assessments').select('*').eq('student_id', studentId).maybeSingle();
        const eqDiv = document.getElementById('view_eq_container');
        if (eqDiv) {
            if (!eqData) eqDiv.innerHTML = '<div class="text-slate-500 font-bold"><i class="fa-solid fa-circle-exclamation"></i> ยังไม่ได้ประเมิน</div>';
            else eqDiv.innerHTML = `<div class="text-3xl font-black ${eqData.result_summary === 'ปกติ' ? 'text-pink-600' : 'text-orange-500'}">${eqData.result_summary}</div><p class="text-sm">${eqData.detail || ''}</p>`;
        }
        safeSetText('view_club_name', await fetchStudentClub(studentId));
    } catch (err) { console.error(err); Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงข้อมูลบางส่วน', 'error'); }
    finally { const overlay = document.getElementById('modalLoadingOverlay'); if (overlay) overlay.classList.add('hidden'); }
}

function formatNationalId(id) {
    if (!id) return '-';
    // ลบอักขระที่ไม่ใช่ตัวเลขออก แล้วแสดงเป็นเลข 13 หลักติดกัน (ไม่มีขีด)
    return id.toString().replace(/\D/g, '');
}
function getEvaluatorLabel(t) { const map = { student: 'นักเรียน', parent: 'ผู้ปกครอง', teacher: 'ครูประจำชั้น' }; return map[t] || t; }
function renderAttendanceChart(p, a, l, pl, sl) { const ctx = document.getElementById('attendanceChart')?.getContext('2d'); if (ctx) { if (chartInstance) chartInstance.destroy(); chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['มาเรียน', 'ขาด', 'สาย', 'ลากิจ', 'ลาป่วย'], datasets: [{ data: [p, a, l, pl, sl], backgroundColor: ['#10b981', '#f43f5e', '#f97316', '#eab308', '#3b82f6'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } } }); } }
function closeStudentModal() { document.getElementById('studentDetailModal')?.classList.add('hidden'); activeStudentId = null; }
function switchTab(tabId) { document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden')); document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('text-blue-700', 'bg-blue-200/50')); const t = document.getElementById(tabId); if (t) t.classList.remove('hidden'); const btn = document.getElementById('btn-' + tabId); if (btn) btn.classList.add('text-blue-700', 'bg-blue-200/50'); }
async function fetchStudentClub(id) { try { const { data: reg } = await db.from('club_registrations').select('club_id').eq('student_id', id).maybeSingle(); if (reg?.club_id) { const { data: ci } = await db.from('club_lists').select('club_name').eq('id', reg.club_id).maybeSingle(); return ci ? ci.club_name : 'ไม่พบชื่อชุมนุม'; } return 'ยังไม่ได้ลงทะเบียนชุมนุม'; } catch (e) { return 'ไม่สามารถดึงข้อมูลได้'; } }
function logout() { db.auth.signOut().then(() => window.location.replace('index.html')); }

// ========== Toggle Mode ==========
function updateToggleModeUI() {
    const btn = document.getElementById('btnToggleMode');
    const badge = document.getElementById('pageBadge');
    if (isCurrentAdminMode) {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-toggle-on text-emerald-500 text-lg"></i> <span>โหมด: ผู้ดูแลระบบ</span>';
        if (btn) btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 border';
        if (badge) badge.innerText = 'มุมมองผู้ดูแลระบบ (Admin View - เลือกดูทีละห้อง)';
    } else {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-toggle-off text-slate-400 text-lg"></i> <span>โหมด: ครูที่ปรึกษา</span>';
        if (btn) btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-50 border';
        if (badge) badge.innerText = 'มุมมองครูที่ปรึกษา (Teacher View - เฉพาะห้องโฮมรูม)';
    }
}
async function toggleTeacherAdminMode() {
    isCurrentAdminMode = !isCurrentAdminMode;
    actualUserRole = isCurrentAdminMode ? currentUserRole : 'teacher';
    updateToggleModeUI();
    // ล้างชื่อครูที่ปรึกษาทุกครั้งที่สลับโหมด
    const adviserDiv = document.getElementById('adviserDisplay');
    if (adviserDiv) { adviserDiv.classList.add('hidden'); adviserDiv.classList.remove('flex'); }
    Swal.fire({
        toast: true, position: 'top-end', icon: 'info',
        title: isCurrentAdminMode
            ? '<i class="fas fa-user-shield mr-1"></i> เปลี่ยนเป็นโหมดแอดมิน (ทุกห้องเรียน)'
            : '<i class="fas fa-chalkboard-user mr-1"></i> เปลี่ยนเป็นโหมดครู (เฉพาะห้องที่ปรึกษา)',
        showConfirmButton: false, timer: 2000
    });
    if ($.fn.DataTable.isDataTable('#studentDataTable')) $('#studentDataTable').DataTable().destroy();
    safeSetHtml('tb-students', '');
    const table = document.getElementById('studentDataTable');
    if (table) table.classList.add('hidden');
    await loadClassrooms();
}

// ========== เริ่มต้น ==========
window.onload = async () => {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');
    currentUserId = session.user.id;
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', currentUserId).single();
    if (profile) { currentUserRole = profile.role; actualUserRole = profile.role; }
    await loadCurrentYearAndSemester();
    await loadGasSettings();

    const isHighLevel = ['super_admin', 'admin'].includes(currentUserRole);
    if (isHighLevel) {
        const toggleBtn = document.getElementById('btnToggleMode');
        const settingsBtn = document.getElementById('btnSettings');
        if (toggleBtn) toggleBtn.classList.remove('hidden');
        if (settingsBtn) settingsBtn.classList.remove('hidden');
        // เริ่มต้นในโหมดครู
        isCurrentAdminMode = false;
        actualUserRole = 'teacher';
        updateToggleModeUI();
    } else {
        isCurrentAdminMode = false;
        updateToggleModeUI();
    }

    document.getElementById('profileFileInput')?.addEventListener('change', onFileSelected);
    document.getElementById('cloudUploadBtn')?.addEventListener('click', uploadPendingProfile);

    await loadClassrooms();
};

document.getElementById('settingsModal')?.addEventListener('click', e => { if (e.target === document.getElementById('settingsModal')) closeSettingsModal(); });
// info_teacher.js - สำหรับครู/แอดมิน (ปรับปรุงสิทธิ์ตาม config.js)
// ==========================================
// สิทธิ์:
// 1. super_admin, admin, director, deputy, teacher → เข้าใช้งานได้ (อัปโหลดรูปได้)
// 2. หัวหน้างานปกครอง, หัวหน้าระดับ → เข้าใช้งานได้ (ดูอย่างเดียว, ไม่สามารถอัปโหลดรูปได้)
// 3. staff, office → ไม่สามารถเข้าใช้งานได้ (แจ้งเตือนและ redirect)
// ==========================================

// ==========================================
// ตัวแปร Global
// ==========================================
let currentUser = null;
let currentUserRole = 'teacher';
let isAdminMode = false;
let isModuleAdmin = false;
let currentUserId = null;
let isHead = false;          // เป็นหัวหน้างานปกครองหรือหัวหน้าระดับ
let isReadOnly = false;      // โหมดอ่านอย่างเดียว (สำหรับหัวหน้า)
let chartInstance = null;
let activeStudentId = null;
let gasSettingsCache = null;
let currentAcademicYear = null;
let currentSemester = null;
let pendingProfileFile = null;
let moduleSettings = { gas_avatar_api_url: "", gas_avatar_folder_id: "" };

// ==========================================
// Helper safe
// ==========================================
function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; else console.warn(`Element ${id} not found`); }
function safeSetHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; else console.warn(`Element ${id} not found`); }
function safeSetSrc(id, src) { const el = document.getElementById(id); if (el) el.src = src; else console.warn(`Element ${id} not found`); }

// ==========================================
// ฟังก์ชันอัปเดต UI ตามสิทธิ์ (ใช้ config.js) (เพิ่มการแสดงปุ่มสลับโหมดสำหรับหัวหน้า)
// ==========================================
function applyAdminVisibility() {
    // ✅ ใช้ isAdminMode โดยตรง (เฉพาะ admin จริง)
    const isAdmin = isAdminMode;

    // ✅ ใช้ applyVisibilityByRole จาก config.js
    window.applyVisibilityByRole(currentUserRole, isAdminMode, {
        settingsBtn: 'btnSettings',
        toggleBtn: 'btnToggleMode'
    });

    // ✅ อัปเดตข้อความปุ่มสลับโหมด
    window.updateToggleModeUI(currentUserRole, isAdminMode, 'btnToggleMode');

    // ✅ จัดการ adminFilterSection
    const filterSection = document.getElementById('adminFilterSection');
    if (filterSection) {
        // แสดง adminFilterSection เมื่อเป็น admin หรือหัวหน้าระดับ/ปกครอง
        if (isAdminMode || isHead) {
            filterSection.classList.remove('hidden');
            filterSection.classList.add('block');
        } else {
            filterSection.classList.add('hidden');
            filterSection.classList.remove('block');
        }
    }

    // ✅ อัปเดต badge หน้าเพจ
    const badge = document.getElementById('pageBadge');
    if (badge) {
        if (isAdminMode) {
            badge.innerText = 'มุมมองผู้ดูแลระบบ (Admin View - เลือกดูทีละห้อง)';
        } else if (isHead) {
            badge.innerText = 'มุมมองหัวหน้าระดับ/ปกครอง (ดูอย่างเดียว - เลือกห้องเรียนได้)';
        } else {
            badge.innerText = 'มุมมองครูที่ปรึกษา (Teacher View - เฉพาะห้องโฮมรูม)';
        }
    }

    // ✅ ตั้งค่าปุ่มสลับโหมด (เฉพาะ admin เท่านั้น)
    const toggleBtn = document.getElementById('btnToggleMode');
    if (toggleBtn) {
        if (isAdminMode) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-chalkboard-user sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดครู</span>';
            toggleBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all shadow-sm';
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
        } else if (isAdminUser(currentUserRole, false)) {
            // admin (แต่ไม่ได้อยู่ในโหมด admin) → แสดงปุ่ม
            toggleBtn.innerHTML = '<i class="fa-solid fa-user-shield sm:mr-1"></i> <span class="hidden sm:inline text-sm font-bold">โหมดแอดมิน</span>';
            toggleBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200 transition-all shadow-sm';
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
        } else {
            // ไม่ใช่ admin → ซ่อนปุ่ม
            toggleBtn.classList.add('hidden');
            toggleBtn.classList.remove('flex');
        }
    }

    // ✅ ใช้โหมดอ่านอย่างเดียว (ถ้าเป็นหัวหน้า)
    applyReadOnlyState();
}

// ==========================================
// ฟังก์ชันใช้โหมดอ่านอย่างเดียว (สำหรับหัวหน้างานปกครอง/ระดับ)
// ==========================================
function applyReadOnlyState() {
    if (!isReadOnly) return;

    // 1. ซ่อน/ปิดการใช้งานปุ่มอัปโหลดรูป
    const uploadBtns = document.querySelectorAll('#profileFileInput, #cloudUploadBtn, .delete-profile-btn');
    uploadBtns.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    });

    // 2. ซ่อนปุ่มลบรูป
    const deleteBtn = document.querySelector('button[onclick="deleteProfilePicture()"]');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // 3. แสดงข้อความแจ้งเตือนว่าเป็นโหมดดูอย่างเดียว
    const existingBanner = document.getElementById('readonly-banner');
    if (!existingBanner) {
        const banner = document.createElement('div');
        banner.id = 'readonly-banner';
        banner.className = 'bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl mb-4 flex items-center gap-2';
        banner.innerHTML = `
            <i class="fas fa-eye text-amber-600"></i>
            <span class="font-bold">คุณอยู่ในโหมดดูข้อมูลอย่างเดียว (ไม่สามารถอัปโหลดรูปหรือแก้ไขได้)</span>
        `;
        const modalBody = document.querySelector('#studentDetailModal .p-6');
        if (modalBody) modalBody.prepend(banner);
    }

    console.log('🔒 เปิดใช้งานโหมดอ่านอย่างเดียว');
}

// ==========================================
// อัปเดตชื่อและสถานะบทบาทใน Nav Bar
// ==========================================
function updateUserDisplay() {
    const nameDisplay = document.getElementById('user-display');
    if (!nameDisplay || !currentUser) return;

    const fullName = `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`;
    let roleText = '';

    if (isAdminMode) {
        roleText = ' (ผู้ดูแลระบบ)';
    } else if (currentUserRole === 'teacher' || currentUserRole === 'staff') {
        roleText = ' (ครูที่ปรึกษา)';
    } else if (isHead) {
        roleText = ' (หัวหน้า - ดูอย่างเดียว)';
    } else {
        roleText = ' (บุคลากร)';
    }

    nameDisplay.textContent = fullName + roleText;
    nameDisplay.classList.remove('hidden');
    nameDisplay.classList.add('block');
}

// ==========================================
// โหลดปี/ภาคปัจจุบัน
// ==========================================
async function loadCurrentYearAndSemester() {
    if (currentAcademicYear !== null && currentSemester !== null) return;
    try {
        const { data, error } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        if (error) throw error;
        currentAcademicYear = data?.current_academic_year || 2569;
        currentSemester = data?.current_semester || 1;
        updateTermDisplay();
    } catch (err) {
        console.warn('Cannot load year/semester, using default', err);
        currentAcademicYear = 2569;
        currentSemester = 1;
        updateTermDisplay();
    }
}
function updateTermDisplay() {
    const el = document.getElementById('termDisplay');
    if (el && currentAcademicYear && currentSemester) el.innerHTML = `📅 ภาคเรียนที่ ${currentSemester} ปีการศึกษา ${currentAcademicYear}`;
}

// ==========================================
// GAS Settings
// ==========================================
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

// ==========================================
// อัปโหลดรูป (compressImage)
// ==========================================
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
    if (isReadOnly) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว ไม่สามารถเปลี่ยนรูปได้', 'warning');
        event.target.value = '';
        return;
    }
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'error');
    pendingProfileFile = file;
    const reader = new FileReader();
    reader.onload = (e) => safeSetSrc('profileImage', e.target.result);
    reader.readAsDataURL(file);
}
async function uploadPendingProfile() {
    if (isReadOnly) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว ไม่สามารถอัปโหลดรูปได้', 'warning');
        return;
    }
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
async function deleteProfilePicture() {
    if (isReadOnly) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว ไม่สามารถลบรูปได้', 'warning');
        return;
    }
    if (!activeStudentId) return;
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
    const { error } = await db.from('core_students').update({ avatar_students_url: null }).eq('id', activeStudentId);
    if (error) return Swal.fire('ผิดพลาด', 'ไม่สามารถลบรูปได้', 'error');
    const el = document.getElementById('profileImage');
    if (el) {
        const fullName = document.getElementById('modalStudentName')?.innerText || '';
        el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dbeafe&color=1d4ed8&size=128`;
    }
    pendingProfileFile = null;
    Swal.fire({ icon: 'success', title: 'ลบรูปเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
}

// ==========================================
// Lightbox
// ==========================================
function openLightbox(src) { if (src) { const img = document.getElementById('lightboxImage'); if (img) img.src = src; document.getElementById('lightboxModal')?.classList.remove('hidden'); } }
function closeLightbox() { document.getElementById('lightboxModal')?.classList.add('hidden'); }

// ==========================================
// Settings Modal (ใช้ requireAdmin)
// ==========================================
async function openSettingsModal() {
    if (!window.requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;
    await loadGasSettings();
    document.getElementById('settingsGasUrl').value = moduleSettings.gas_avatar_api_url;
    document.getElementById('settingsFolderId').value = moduleSettings.gas_avatar_folder_id;
    document.getElementById('settingsModal')?.classList.remove('hidden');
}
function closeSettingsModal() { document.getElementById('settingsModal')?.classList.add('hidden'); }
async function saveSettings() {
    if (!window.requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้')) return;
    const gasUrl = document.getElementById('settingsGasUrl')?.value.trim() || '';
    const folderId = document.getElementById('settingsFolderId')?.value.trim() || '';
    if (!gasUrl) return Swal.fire('กรุณากรอก GAS URL', '', 'warning');
    try {
        await saveGasSettingsToDb(gasUrl, folderId);
        closeSettingsModal();
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
    }
}

// ==========================================
// Toggle Mode (ปรับให้รองรับหัวหน้า)
// ==========================================
async function toggleTeacherAdminMode() {
    if (!window.isAdminUser(currentUserRole, isAdminMode)) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'warning');
        return;
    }

    isAdminMode = !isAdminMode;
    applyAdminVisibility();
    updateUserDisplay();

    const filterSection = document.getElementById('adminFilterSection');
    if (filterSection) {
        if (isAdminMode) {
            filterSection.classList.remove('hidden');
            filterSection.classList.add('block');
        } else {
            // ถ้าเป็นหัวหน้า ก็ยังให้แสดง filterSection (แต่จะถูกควบคุมโดย applyAdminVisibility)
            // ดังนั้นไม่ต้องซ่อนตรงนี้ ปล่อยให้ applyAdminVisibility จัดการ
        }
    }

    const adviserDiv = document.getElementById('adviserDisplay');
    if (adviserDiv) {
        adviserDiv.classList.add('hidden');
        adviserDiv.classList.remove('flex');
    }

    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: isAdminMode
            ? '<i class="fas fa-user-shield mr-1"></i> เปลี่ยนเป็นโหมดแอดมิน (ทุกห้องเรียน)'
            : '<i class="fas fa-chalkboard-user mr-1"></i> เปลี่ยนเป็นโหมดครู (เฉพาะห้องที่ปรึกษา)',
        showConfirmButton: false,
        timer: 2000
    });

    if ($.fn.DataTable.isDataTable('#studentDataTable')) {
        $('#studentDataTable').DataTable().destroy();
    }
    safeSetHtml('tb-students', '');
    const table = document.getElementById('studentDataTable');
    if (table) table.classList.add('hidden');
    await loadClassrooms();
}

// ==========================================
// โหลดห้องเรียน (รองรับหัวหน้าระดับ/ปกครอง)
// ==========================================
async function loadClassrooms() {
    await loadCurrentYearAndSemester();

    // ✅ กำหนดการแสดง adminFilterSection
    const filterSection = document.getElementById('adminFilterSection');
    if (filterSection) {
        if (isAdminMode || isHead) {
            filterSection.classList.remove('hidden');
            filterSection.classList.add('block');
        } else {
            filterSection.classList.add('hidden');
            filterSection.classList.remove('block');
        }
    }

    // ✅ กำหนด query ตามสิทธิ์
    let query = db.from('core_classrooms')
        .select('id, grade_level, room_number, core_personnel_1:core_personnel!adviser_id_1(prefix, first_name, last_name), core_personnel_2:core_personnel!adviser_id_2(prefix, first_name, last_name)')
        .eq('academic_year', currentAcademicYear)
        .eq('semester', currentSemester)
        .order('grade_level').order('room_number');

    // ถ้าเป็นครูที่ปรึกษา (ไม่ใช่ admin และไม่ใช่หัวหน้า)
    if (!isAdminMode && !isHead) {
        query = query.or(`adviser_id_1.eq.${currentUserId},adviser_id_2.eq.${currentUserId}`);
    }

    // ถ้าเป็นหัวหน้าระดับ → กรองเฉพาะระดับที่ดูแล
    if (isHead && !isAdminMode && currentUserRole !== 'super_admin' && currentUserRole !== 'admin') {
        // ตรวจสอบหัวหน้าระดับ (ไม่ใช่หัวหน้างานปกครอง)
        const { data: gradeHead } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', currentUserId)
            .maybeSingle();
        if (gradeHead) {
            query = query.eq('grade_level', gradeHead.grade_level);
        }
        // ถ้าเป็นหัวหน้างานปกครอง → ไม่กรองระดับ (เห็นทุกห้อง)
    }

    const { data: classrooms, error } = await query;
    if (error) {
        console.error(error);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดห้องเรียนได้', 'error');
        return;
    }

    // ✅ กรณี admin หรือหัวหน้า → แสดง dropdown ให้เลือกห้อง
    if (isAdminMode || isHead) {
        document.getElementById('adminFilterSection')?.classList.remove('hidden');
        document.getElementById('no-classroom-msg')?.classList.remove('hidden');
        document.getElementById('studentDataTable')?.classList.add('hidden');

        const sel = document.getElementById('classSelector');
        if (sel) {
            if (sel.tomselect) sel.tomselect.destroy();
            sel.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
            if (classrooms.length === 0) {
                sel.innerHTML += '<option disabled>ไม่มีห้องเรียนในปี/ภาคนี้</option>';
            } else {
                classrooms.forEach(c => {
                    sel.innerHTML += `<option value="${c.id}">ม.${c.grade_level}/${c.room_number}</option>`;
                });
            }

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

            new TomSelect('#classSelector', {
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
        // ครูที่ปรึกษา → ไม่มี dropdown, โหลดห้องแรก
        document.getElementById('adminFilterSection')?.classList.add('hidden');
        if (classrooms && classrooms.length > 0) {
            await loadStudentsData(classrooms[0].id);
        } else {
            Swal.fire('แจ้งเตือน', `คุณไม่มีข้อมูลห้องโฮมรูมในปีการศึกษา ${currentAcademicYear} ภาค ${currentSemester}`, 'info');
            document.getElementById('studentDataTable')?.classList.add('hidden');
            const noMsg = document.getElementById('no-classroom-msg');
            if (noMsg) {
                noMsg.classList.remove('hidden');
                noMsg.innerHTML = '<i class="fa-solid fa-school-circle-exclamation text-3xl mb-3 block"></i><p class="font-bold">ไม่มีห้องเรียนที่ปรึกษาในปี/ภาคนี้</p>';
            }
        }
    }
}

// ==========================================
// โหลดรายชื่อนักเรียน
// ==========================================
async function loadStudentsData(classroomId) {
    if (!classroomId) return;
    Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: () => Swal.showLoading() });
    let { data, error } = await db.from('student_enrollments')
        .select(`id, student_number, core_classrooms(grade_level, room_number), core_students(id, student_id_card, prefix, first_name, last_name, national_id, status, avatar_students_url)`)
        .eq('classroom_id', classroomId)
        .eq('academic_year', currentAcademicYear)
        .eq('semester', currentSemester)
        .order('student_number');
    let usedFallback = false;
    if (!error && (!data || data.length === 0)) {
        const { data: allData, error: allError } = await db.from('student_enrollments')
            .select(`id, student_number, core_classrooms(grade_level, room_number), core_students(id, student_id_card, prefix, first_name, last_name, national_id, status, avatar_students_url)`)
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

// ==========================================
// เปิด Modal ดูข้อมูลนักเรียน
// ==========================================
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
    return id.toString().replace(/\D/g, '');
}
function getEvaluatorLabel(t) { const map = { student: 'นักเรียน', parent: 'ผู้ปกครอง', teacher: 'ครูประจำชั้น' }; return map[t] || t; }
function renderAttendanceChart(p, a, l, pl, sl) { const ctx = document.getElementById('attendanceChart')?.getContext('2d'); if (ctx) { if (chartInstance) chartInstance.destroy(); chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['มาเรียน', 'ขาด', 'สาย', 'ลากิจ', 'ลาป่วย'], datasets: [{ data: [p, a, l, pl, sl], backgroundColor: ['#10b981', '#f43f5e', '#f97316', '#eab308', '#3b82f6'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } } }); } }
function closeStudentModal() { document.getElementById('studentDetailModal')?.classList.add('hidden'); activeStudentId = null; }
function switchTab(tabId) { document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden')); document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('text-blue-700', 'bg-blue-200/50')); const t = document.getElementById(tabId); if (t) t.classList.remove('hidden'); const btn = document.getElementById('btn-' + tabId); if (btn) btn.classList.add('text-blue-700', 'bg-blue-200/50'); }
async function fetchStudentClub(id) { try { const { data: reg } = await db.from('club_registrations').select('club_id').eq('student_id', id).maybeSingle(); if (reg?.club_id) { const { data: ci } = await db.from('club_lists').select('club_name').eq('id', reg.club_id).maybeSingle(); return ci ? ci.club_name : 'ไม่พบชื่อชุมนุม'; } return 'ยังไม่ได้ลงทะเบียนชุมนุม'; } catch (e) { return 'ไม่สามารถดึงข้อมูลได้'; } }

// ==========================================
// LOGOUT (มาตรฐานกลาง)
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
}

// ==========================================
// เริ่มต้น (ใช้ checkSessionAndRole) — แก้ไขเพิ่มการตรวจสอบหัวหน้า
// ==========================================
window.onload = async () => {
    try {
        // ✅ ขั้นตอนที่ 1: ตรวจสอบ session
        const { data: { session } } = await db.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        // ✅ ขั้นตอนที่ 2: ดึงข้อมูลบุคลากรเพื่อตรวจสอบ role
        const { data: personnel, error: profileError } = await db.from('core_personnel')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError || !personnel) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่พบข้อมูลบุคลากร',
                text: 'กรุณาติดต่อผู้ดูแลระบบ',
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => {
                window.location.href = 'index.html';
            });
            return;
        }

        const role = personnel.role;

        // ✅ ขั้นตอนที่ 3: ตรวจสอบสิทธิ์ staff / office → แสดง SweetAlert และ redirect
        if (role === 'staff' || role === 'office') {
            await Swal.fire({
                icon: 'error',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้ระบบข้อมูลนักเรียน กรุณาติดต่อผู้ดูแลระบบ',
                confirmButtonText: 'กลับหน้าหลัก'
            });
            window.location.href = 'index.html';
            return;
        }

        // ✅ ขั้นตอนที่ 4: ใช้ checkSessionAndRole สำหรับ role ที่อนุญาต
        const result = await window.checkSessionAndRole('info_teacher', ['super_admin', 'admin', 'director', 'deputy', 'teacher']);
        if (!result) return;

        const { user, isAdmin, isTeacher } = result;
        currentUser = personnel;
        currentUserId = user.id;
        currentUserRole = role;
        isAdminMode = isAdmin;

        // ✅ ตรวจสอบหัวหน้างานปกครอง / หัวหน้าระดับ (สำหรับสิทธิ์อ่านอย่างเดียว + เลือกห้องเรียนได้)
        const { data: sInfo } = await db.from('core_school_info').select('current_academic_year, current_semester').single();
        currentAcademicYear = sInfo?.current_academic_year;
        currentSemester = sInfo?.current_semester;
        updateTermDisplay();

        let isDisciplineHead = false;
        let isGradeHead = false;

        // ตรวจสอบหัวหน้างานปกครอง
        const { data: discHead } = await db.from('core_discipline_heads')
            .select('id')
            .eq('personnel_id', user.id)
            .eq('academic_year', currentAcademicYear)
            .maybeSingle();
        if (discHead) isDisciplineHead = true;

        // ตรวจสอบหัวหน้าระดับ
        const { data: gradeHead } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', user.id)
            .maybeSingle();
        if (gradeHead) isGradeHead = true;

        // ✅ ตั้งค่า isHead และ isReadOnly
        if (isDisciplineHead || isGradeHead) {
            isHead = true;
            isReadOnly = true;
        } else {
            isHead = false;
            isReadOnly = false;
        }

        // ✅ แสดงชื่อและบทบาท
        updateUserDisplay();

        // ✅ ตรวจสอบ Module Admin
        isModuleAdmin = await window.hasModuleAccess(role, 'info_teacher', user.id);
        applyAdminVisibility();

        // ✅ แสดงปุ่มตั้งค่าเฉพาะผู้มีสิทธิ์
        if (isAdmin || isModuleAdmin) {
            document.getElementById('btnSettings')?.classList.remove('hidden');
            document.getElementById('btnToggleMode')?.classList.remove('hidden');
        } else {
            document.getElementById('btnSettings')?.classList.add('hidden');
            document.getElementById('btnToggleMode')?.classList.add('hidden');
        }

        await loadCurrentYearAndSemester();
        await loadGasSettings();

        document.getElementById('profileFileInput')?.addEventListener('change', onFileSelected);
        document.getElementById('cloudUploadBtn')?.addEventListener('click', uploadPendingProfile);

        await loadClassrooms();

        // ✅ บันทึก Log การเข้าใช้งาน
        await window.logUserAction('เข้าสู่ระบบข้อมูลนักเรียน', 'info_teacher');

        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');

    } catch (err) {
        console.error('Error initializing:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
};

document.getElementById('settingsModal')?.addEventListener('click', e => { if (e.target === document.getElementById('settingsModal')) closeSettingsModal(); });
// ==========================================
// homevisit_upload.js (ฉบับสมบูรณ์ รองรับทั้ง Teacher และ Student)
// อัปโหลดรูป, บีบอัด, Preview, Clear, Sync Cam
// ==========================================

/**
 * บีบอัดไฟล์ภาพให้มีขนาดไม่เกิน maxSizeMB
 * @param {File} file - ไฟล์ภาพที่เลือก
 * @param {number} maxSizeMB - ขนาดสูงสุดที่ต้องการ (MB)
 * @returns {Promise<string>} base64 string (เฉพาะส่วนข้อมูล)
 */
async function compressImage(file, maxSizeMB = 2) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 1920;
                if (width > height && width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
                canvas.width = width;
                canvas.height = height;
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
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * อัปโหลดรูปภาพไปยัง Google Drive ผ่าน Apps Script
 * รองรับทั้งหน้า Teacher และ Student โดยใช้ตัวแปร window.currentStudentId / currentStudentCode
 * @param {Event} event - event จากปุ่มที่คลิก
 * @param {string} inputId - id ของ input type file
 * @param {string} type - ประเภทภาพ: 'student_pic', 'outside_pic', 'inside_pic', 'teacher_pic'
 */
window.triggerSingleUpload = async function (event, inputId, type) {
    // ตรวจสอบสิทธิ์ (ถ้ามี isReadOnly)
    if (typeof isReadOnly !== 'undefined' && isReadOnly) {
        return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');
    }

    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files[0];

    // --- ดึงข้อมูลนักเรียน (รองรับทั้ง Teacher และ Student) ---
    let studentId = null;
    let studentCode = null;

    // 1. พยายามจาก #hv_student (หน้า Teacher)
    const hvStudent = document.getElementById('hv_student');
    if (hvStudent && hvStudent.value) {
        studentId = hvStudent.value;
        studentCode = document.getElementById('student_code')?.value || '';
    }

    // 2. ถ้ายังไม่มี ให้ใช้ window.currentStudentId (หน้า Student)
    if (!studentId && window.currentStudentId) {
        studentId = window.currentStudentId;
        studentCode = window.currentStudentCode || document.getElementById('student_code')?.value || '';
    }

    // 3. ถ้ายังไม่มี ให้แจ้งเตือน พร้อมแสดงข้อมูล debug
    if (!file || !studentId || !studentCode) {
        console.warn('❌ อัปโหลดล้มเหลว: file=', !!file, 'studentId=', studentId, 'studentCode=', studentCode);
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนและไฟล์รูปภาพก่อนทำการอัพโหลด', 'warning');
    }

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัพโหลด...`;
    btn.disabled = true;

    // ตรวจสอบ GAS_URL
    const GAS_URL = moduleSettings?.gas_url;
    if (!GAS_URL) {
        Swal.fire('Error', 'ยังไม่ได้ตั้งค่า URL สำหรับอัปโหลด กรุณาติดต่อผู้ดูแลระบบ', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    const FOLDER_HOMEVISIT = moduleSettings?.drive_folder_id || '';
    const FOLDER_PROFILE = '168WCLk-GfvyGZnlE5ywGOVx2Qz8QRvnN'; // โฟลเดอร์รูปโปรไฟล์ (คงที่)

    let targetFolderId = FOLDER_HOMEVISIT;
    let targetFileName = `HV_${studentCode}_${type}.jpg`;

    if (type === 'student_pic') {
        targetFolderId = FOLDER_PROFILE;
        targetFileName = `avatar_${studentCode}.jpg`;
    }

    try {
        const compressedBase64 = await compressImage(file, 2);
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({
                action: 'upload',
                base64: compressedBase64,
                fileName: targetFileName,
                folderId: targetFolderId
            }),
        });

        // อ่านข้อความตอบกลับก่อน แล้วพยายามแปลงเป็น JSON
        const text = await response.text();
        let res;
        try {
            res = JSON.parse(text);
        } catch (e) {
            console.error('Invalid JSON response:', text);
            throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (อาจเป็น URL ผิด หรือต้องล็อกอิน)');
        }

        if (res.status === 'success' && res.url) {
            // เก็บ URL ลงใน dataset ของ input เพื่อใช้บันทึกข้อมูล
            fileInput.dataset.uploadedUrl = res.url;

            // อัปเดต preview image (เก็บ URL สำหรับเปิดดู)
            const previewMap = {
                'pic_student': 'preview1',
                'pic_outside': 'preview2',
                'pic_inside': 'preview3',
                'pic_teacher': 'preview4'
            };
            const previewId = previewMap[inputId];
            if (previewId) {
                const img = document.getElementById(previewId);
                if (img) {
                    img.dataset.url = res.url;
                }
            }

            // ถ้าเป็นรูปโปรไฟล์ ให้อัปเดตในฐานข้อมูล
            if (type === 'student_pic') {
                await db.from('core_students')
                    .update({ avatar_students_url: res.url })
                    .eq('student_id_card', studentCode);

                // ✅ ถ้าอยู่ในหน้า Student ให้ refresh ข้อมูล
                if (window.location.pathname.includes('student') && typeof loadExistingHomeVisit === 'function') {
                    await loadExistingHomeVisit(studentId);
                }
            }

            btn.innerHTML = `<i class="fa-solid fa-check text-green-400"></i> อัพโหลดสำเร็จ`;
            btn.classList.add('bg-slate-700', 'text-white');
            btn.classList.remove('bg-green-600', 'opacity-40');
        } else {
            throw new Error(res.message || "ไม่สามารถอัพโหลดได้");
        }
    } catch (err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        Swal.fire('Error', 'ไม่สามารถอัพโหลดได้: ' + err.message, 'error');
    }
};

/**
 * แสดงตัวอย่างภาพที่เลือก (ยังไม่ขึ้นโหลด)
 * @param {HTMLInputElement} input - input type file
 * @param {string} previewId - id ของ img ที่ใช้แสดงตัวอย่าง
 * @param {string} cloudBtnId - id ของปุ่มอัพโหลด (จะเปิดใช้งาน)
 * @param {string} delBtnId - id ของปุ่มลบ (จะแสดง)
 */
window.previewSelectedImage = function (input, previewId, cloudBtnId, delBtnId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById(previewId);
            if (img) {
                img.src = e.target.result;
                img.classList.remove('hidden');
                delete img.dataset.url; // ยังไม่ได้อัพโหลด
            }
            const delBtn = document.getElementById(delBtnId);
            if (delBtn) delBtn.classList.remove('hidden');
            const cloudBtn = document.getElementById(cloudBtnId);
            if (cloudBtn) {
                cloudBtn.disabled = false;
                cloudBtn.classList.remove('opacity-40');
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

/**
 * ล้างรูปที่เลือก (ยกเลิกการเลือก)
 * @param {Event} event - event จากปุ่มลบ
 * @param {string} inputId - id ของ input type file
 * @param {string} previewId - id ของ img ที่ใช้แสดงตัวอย่าง
 * @param {string} cloudBtnId - id ของปุ่มอัพโหลด (จะปิดใช้งาน)
 */
window.clearSelectedImage = function (event, inputId, previewId, cloudBtnId) {
    const fileInput = document.getElementById(inputId);
    if (fileInput) fileInput.value = '';

    const img = document.getElementById(previewId);
    if (img) {
        img.src = '';
        img.classList.add('hidden');
        delete img.dataset.url;
    }
    const delBtn = event.currentTarget;
    if (delBtn) delBtn.classList.add('hidden');
    const cloudBtn = document.getElementById(cloudBtnId);
    if (cloudBtn) {
        cloudBtn.disabled = true;
        cloudBtn.classList.add('opacity-40', 'bg-green-600', 'text-white');
        cloudBtn.classList.remove('bg-slate-700');
        cloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้';
    }
    if (fileInput) delete fileInput.dataset.uploadedUrl;
};

/**
 * เปิดภาพในแท็บใหม่ (คลิกที่รูป preview)
 * @param {HTMLImageElement} imgElement - element img ที่คลิก
 */
window.openImagePreview = function(imgElement) {
    let url = imgElement.dataset.url || imgElement.src;
    if (!url || url.startsWith('data:')) {
        Swal.fire('ยังไม่มีรูป', 'กรุณาอัปโหลดรูปก่อน หรือรูปนี้เป็นรูปตัวอย่างที่ยังไม่ได้อัปโหลด', 'info');
        return;
    }
    window.open(url, '_blank');
};

/**
 * ซิงค์ไฟล์จากปุ่ม "เปิดกล้อง" ไปยัง input หลัก (สำหรับหน้า Teacher/Student)
 * @param {HTMLInputElement} camInput - input type file จากกล้อง
 * @param {string} mainId - id ของ input หลัก
 * @param {string} previewId - id ของ img preview
 * @param {string} cloudBtnId - id ของปุ่มอัพโหลด
 * @param {string} delBtnId - id ของปุ่มลบ
 */
function syncCamToMain(camInput, mainId, previewId, cloudBtnId, delBtnId) {
    if (!camInput.files || !camInput.files[0]) return;
    const file = camInput.files[0];
    const dt = new DataTransfer();
    dt.items.add(file);
    const mainInput = document.getElementById(mainId);
    mainInput.files = dt.files;
    window.previewSelectedImage(mainInput, previewId, cloudBtnId, delBtnId);
}
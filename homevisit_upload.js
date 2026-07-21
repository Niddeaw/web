// ==========================================
// homevisit_upload.js
// อัปโหลดรูป, บีบอัด, Preview, Clear, Sync Cam
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
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 1920;
                if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
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

window.triggerSingleUpload = async function (event, inputId, type) {
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files[0];
    const studentId = document.getElementById('hv_student')?.value;
    const studentCode = document.getElementById('student_code')?.value;

    if (!file || !studentId || !studentCode) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนและไฟล์รูปภาพก่อนทำการอัพโหลด', 'warning');
    }

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัพโหลด...`;
    btn.disabled = true;

    const GAS_URL = moduleSettings.gas_url;
    const FOLDER_HOMEVISIT = moduleSettings.drive_folder_id;
    const FOLDER_PROFILE = '168WCLk-GfvyGZnlE5ywGOVx2Qz8QRvnN';

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
        const res = await response.json();

        if (res.status === 'success' && res.url) {
            fileInput.dataset.uploadedUrl = res.url;
            if (type === 'student_pic') {
                await db.from('core_students')
                    .update({ avatar_students_url: res.url })
                    .eq('student_id_card', studentCode);
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

window.previewSelectedImage = function (input, previewId, cloudBtnId, delBtnId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById(previewId);
            if (img) { img.src = e.target.result; img.classList.remove('hidden'); }
            const delBtn = document.getElementById(delBtnId);
            if (delBtn) delBtn.classList.remove('hidden');
            const cloudBtn = document.getElementById(cloudBtnId);
            if (cloudBtn) { cloudBtn.disabled = false; cloudBtn.classList.remove('opacity-40'); }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.clearSelectedImage = function (event, inputId, previewId, cloudBtnId) {
    document.getElementById(inputId).value = '';
    const img = document.getElementById(previewId);
    if (img) { img.src = ''; img.classList.add('hidden'); }
    const delBtn = event.currentTarget;
    if (delBtn) delBtn.classList.add('hidden');
    const cloudBtn = document.getElementById(cloudBtnId);
    if (cloudBtn) {
        cloudBtn.disabled = true;
        cloudBtn.classList.add('opacity-40', 'bg-green-600', 'text-white');
        cloudBtn.classList.remove('bg-slate-700');
        cloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลดรูปนี้';
    }
    const fileInput = document.getElementById(inputId);
    if (fileInput) delete fileInput.dataset.uploadedUrl;
};

function syncCamToMain(camInput, mainId, previewId, cloudBtnId, delBtnId) {
    if (!camInput.files || !camInput.files[0]) return;
    const file = camInput.files[0];
    const dt = new DataTransfer();
    dt.items.add(file);
    const mainInput = document.getElementById(mainId);
    mainInput.files = dt.files;
    previewSelectedImage(mainInput, previewId, cloudBtnId, delBtnId);
}

// ==========================================
// homevisit_upload.js (เพิ่มส่วนนี้)
// ==========================================

/**
 * เปิดรูปภาพในหน้าต่างใหม่ (เมื่อคลิกที่ preview)
 * @param {HTMLElement} imgElement - element <img> ที่ถูกคลิก
 */
window.openImagePreview = function(imgElement) {
    // ตรวจสอบว่ามี URL หรือไม่
    let url = imgElement.dataset.url || imgElement.src;
    if (!url || url.startsWith('data:')) {
        Swal.fire('ยังไม่มีรูป', 'กรุณาอัปโหลดรูปก่อน หรือรูปนี้เป็นรูปตัวอย่างที่ยังไม่ได้อัปโหลด', 'info');
        return;
    }
    window.open(url, '_blank');
};

// --- ปรับปรุง triggerSingleUpload ---
window.triggerSingleUpload = async function (event, inputId, type) {
    if (isReadOnly) return Swal.fire('ไม่มีสิทธิ์', 'คุณอยู่ในโหมดดูข้อมูลอย่างเดียว', 'warning');

    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files[0];
    const studentId = document.getElementById('hv_student')?.value;
    const studentCode = document.getElementById('student_code')?.value;

    if (!file || !studentId || !studentCode) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนและไฟล์รูปภาพก่อนทำการอัพโหลด', 'warning');
    }

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังอัพโหลด...`;
    btn.disabled = true;

    const GAS_URL = moduleSettings.gas_url;
    const FOLDER_HOMEVISIT = moduleSettings.drive_folder_id;
    const FOLDER_PROFILE = '168WCLk-GfvyGZnlE5ywGOVx2Qz8QRvnN';

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
        const res = await response.json();

        if (res.status === 'success' && res.url) {
            fileInput.dataset.uploadedUrl = res.url;

            // ✅ หา img preview ที่เกี่ยวข้อง
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
                    img.dataset.url = res.url;   // เก็บ URL สำหรับเปิดลิงก์
                }
            }

            if (type === 'student_pic') {
                await db.from('core_students')
                    .update({ avatar_students_url: res.url })
                    .eq('student_id_card', studentCode);
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

// --- ปรับปรุง previewSelectedImage ---
window.previewSelectedImage = function (input, previewId, cloudBtnId, delBtnId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById(previewId);
            if (img) {
                img.src = e.target.result;
                img.classList.remove('hidden');
                // ✅ ล้าง dataset.url เพราะเป็นรูปใหม่ที่ยังไม่อัปโหลด
                delete img.dataset.url;
            }
            const delBtn = document.getElementById(delBtnId);
            if (delBtn) delBtn.classList.remove('hidden');
            const cloudBtn = document.getElementById(cloudBtnId);
            if (cloudBtn) { cloudBtn.disabled = false; cloudBtn.classList.remove('opacity-40'); }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// --- ปรับปรุง clearSelectedImage ---
window.clearSelectedImage = function (event, inputId, previewId, cloudBtnId) {
    document.getElementById(inputId).value = '';
    const img = document.getElementById(previewId);
    if (img) {
        img.src = '';
        img.classList.add('hidden');
        // ✅ ลบ dataset.url
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
    const fileInput = document.getElementById(inputId);
    if (fileInput) delete fileInput.dataset.uploadedUrl;
};

// ==========================================
// ฟังก์ชันเปิดรูปภาพเมื่อคลิกที่ preview
// ==========================================
window.openImagePreview = function(imgElement) {
    // ตรวจสอบว่ามี URL หรือไม่
    let url = imgElement.dataset.url || imgElement.src;
    if (!url || url.startsWith('data:')) {
        Swal.fire('ยังไม่มีรูป', 'กรุณาอัปโหลดรูปก่อน หรือรูปนี้เป็นรูปตัวอย่างที่ยังไม่ได้อัปโหลด', 'info');
        return;
    }
    window.open(url, '_blank');
};
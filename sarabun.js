// sarabun.js
let currentUser = null;
let userRole = null;
let isSarabunAdmin = false;
let systemSettings = {};
let appointTomSelect = null;

window.onload = async () => {
    await checkAuth();
    initUIComponents();
    await loadSettings();
    await loadDocuments();
};

// ==========================================
// 1. ระบบตรวจสอบสิทธิ์แบบ RBAC (เชื่อม Core)
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // ดึงโปรไฟล์
    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    if (!profile) return window.location.replace('index.html');

    currentUser = profile;
    userRole = profile.role;

    // อัปเดต UI Navbar
    document.getElementById('userNameDisplay').innerText = `${profile.first_name} ${profile.last_name}`;
    document.getElementById('userRoleDisplay').innerText = profile.role === 'super_admin' ? 'Super Admin' : (profile.role === 'admin' ? 'Admin' : 'Teacher');

    const recorderDisplay = document.getElementById('recorder_name_display');
    if (recorderDisplay) recorderDisplay.innerText = `${profile.first_name} ${profile.last_name}`;

    // เช็คสิทธิ์ Module Admin
    if (userRole === 'super_admin') {
        isSarabunAdmin = true;
    } else {
        const { data: adminCheck } = await db.from('core_module_admins')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('module_name', 'sarabun')
            .maybeSingle();
        if (adminCheck) isSarabunAdmin = true;
    }

    setupTabsByRole();
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
}

function setupTabsByRole() {
    if (isSarabunAdmin || userRole === 'super_admin') {
        document.getElementById('tab-admin').classList.remove('hidden');
    }
    if (userRole === 'super_admin') {
        document.getElementById('admin-settings-btn').classList.remove('hidden');
    }
}

async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (result.isConfirmed) {
        await db.auth.signOut();
        window.location.replace('index.html');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('block'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }

    // จัดการสไตล์ปุ่ม
    document.querySelectorAll('#roleTabs button').forEach(btn => {
        btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600', 'border', 'border-slate-100');
        btn.classList.add('text-slate-500', 'hover:text-slate-700', 'hover:bg-white/50');
    });
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'hover:text-slate-700', 'hover:bg-white/50');
        activeBtn.classList.add('bg-white', 'shadow-sm', 'text-blue-600', 'border', 'border-slate-100');
    }
}

function toggleAdminPanel(panel) {
    if (panel === 'table') {
        document.getElementById('adminTablePanel').classList.remove('hidden');
        document.getElementById('adminFormPanel').classList.add('hidden');
    } else {
        document.getElementById('adminTablePanel').classList.add('hidden');
        document.getElementById('adminFormPanel').classList.remove('hidden');
    }
}

// ==========================================
// 2. Initialize UI (TomSelect, Flatpickr)
// ==========================================
function initUIComponents() {
    document.querySelectorAll('.tom-select-single').forEach(el => new TomSelect(el, { create: true }));
    document.querySelectorAll('.tom-select-multi').forEach(el => new TomSelect(el, { plugins: ['remove_button'] }));

    flatpickr(".thai-datepicker", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d M Y"
    });
}

// ==========================================
// 3. ระบบ OCR ดึงข้อมูลด้วย AI (Tesseract.js)
// ==========================================
function nextStep(step) {
    if (step === 1) {
        document.getElementById('step1').classList.remove('hidden');
        document.getElementById('step2').classList.add('hidden');
    } else {
        document.getElementById('step1').classList.add('hidden');
        document.getElementById('step2').classList.remove('hidden');
    }
}

async function processOCR() {
    const fileInput = document.getElementById('ocrImageInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาอัปโหลดรูปภาพก่อน', 'warning');
    }

    Swal.fire({
        title: 'กำลังใช้ AI อ่านเอกสาร...',
        html: 'กระบวนการนี้อาจใช้เวลา 5-10 วินาที โปรดรอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const file = fileInput.files[0];
        
        // 1. ลดขนาดภาพลงเหลือ 800px (เพิ่มความเร็ว)
        const resizedBlob = await resizeImage(file, 800);
        
        // 2. Preprocess เบาๆ (ไม่ต้องทำ binary อาจทำให้เสียรายละเอียด)
        const processedCanvas = await preprocessImageLight(resizedBlob);
        
        // 3. แปลงเป็น Blob
        const processedBlob = await new Promise(resolve => processedCanvas.toBlob(resolve, 'image/jpeg', 0.7));
        
        // 4. เรียก Tesseract
        const result = await Tesseract.recognize(
            processedBlob,
            'tha',
            {
                logger: m => console.log(m),
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY
            }
        );
        
        const fullText = result.data.text;
        console.log('OCR เต็ม:', fullText);
        
        // 5. พยายามจับคู่ "จาก" และ "เรื่อง"
        let fromText = null;
        let subjectText = null;
        
        // regex แบบยืดหยุ่น
        const fromMatch = fullText.match(/จาก\s*(.+?)(?:\n|$)/i);
        const subjectMatch = fullText.match(/เรื่อง\s*(.+?)(?:\n|$)/i);
        
        if (fromMatch) fromText = fromMatch[1].trim();
        if (subjectMatch) subjectText = subjectMatch[1].trim();
        
        // 6. ถ้าหาไม่เจอ ให้ใช้ข้อความทั้งหมด (หรือบางส่วน) แสดงให้ผู้ใช้เลือก
        if (!fromText && !subjectText && fullText.trim().length > 0) {
            // แสดง Modal ให้ผู้ใช้เลือกว่าจะเอาข้อความไหนไปใส่
            const { value: selectedField } = await Swal.fire({
                title: 'ไม่พบคำว่า "จาก" หรือ "เรื่อง" ในเอกสาร',
                html: `
                    <p class="text-left text-sm mb-2">ข้อความที่อ่านได้:</p>
                    <textarea id="ocrFullText" rows="4" class="w-full border rounded p-2 text-sm">${fullText.trim()}</textarea>
                    <p class="text-left text-sm mt-3">เลือกปลายทาง:</p>
                    <select id="targetField" class="w-full border rounded p-2">
                        <option value="from">นำไปใส่ช่อง "จาก"</option>
                        <option value="subject">นำไปใส่ช่อง "เรื่อง"</option>
                        <option value="both">ใส่ทั้งสองช่อง (ข้อความเดียวกัน)</option>
                    </select>
                `,
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ข้าม',
                preConfirm: () => {
                    const text = document.getElementById('ocrFullText').value;
                    const target = document.getElementById('targetField').value;
                    return { text, target };
                }
            });
            
            if (selectedField) {
                if (selectedField.target === 'from') {
                    document.getElementById('doc_from').value = selectedField.text;
                } else if (selectedField.target === 'subject') {
                    document.getElementById('doc_subject').value = selectedField.text;
                } else if (selectedField.target === 'both') {
                    document.getElementById('doc_from').value = selectedField.text;
                    document.getElementById('doc_subject').value = selectedField.text;
                }
            }
        } else {
            // เจอ pattern ปกติ
            if (fromText) document.getElementById('doc_from').value = fromText;
            if (subjectText) document.getElementById('doc_subject').value = subjectText;
            
            // ถ้ามีแค่ subject แต่ไม่มี from ให้แจ้งเตือน
            if (!fromText && subjectText) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูล "จาก" กรุณากรอกด้วยตนเอง', 'info');
            } else if (fromText && !subjectText) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูล "เรื่อง" กรุณากรอกด้วยตนเอง', 'info');
            }
        }
        
        Swal.fire({
            icon: 'success',
            title: 'อ่านข้อมูลสำเร็จ',
            text: 'กรุณาตรวจสอบความถูกต้องอีกครั้ง',
            timer: 2000,
            showConfirmButton: false
        });
        
        nextStep(2);
    } catch (error) {
        console.error('OCR Error:', error);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอ่านข้อความจากรูปภาพได้ กรุณากรอกด้วยตนเอง', 'error');
        nextStep(2);
    }
}

// resize ภาพ (ปรับขนาดเล็กลงเพื่อความเร็ว)
function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, 'image/jpeg', 0.7);
            };
        };
    });
}

// preprocess เบาๆ (ปรับ contrast และทำให้เป็น灰度 ไม่ทำ binary)
function preprocessImageLight(imageBlob) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(imageBlob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // ปรับ contrast และทำ grayscale (ไม่ทำ binary เพื่อรักษารายละเอียด)
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                // เพิ่ม contrast เล็กน้อย
                const contrast = 1.2;
                const bright = 20;
                let newGray = contrast * (gray - 128) + 128 + bright;
                newGray = Math.min(255, Math.max(0, newGray));
                data[i] = data[i+1] = data[i+2] = newGray;
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
        };
    });
}

// ==========================================
// 4. บีบอัดรูปภาพ (Client-side Compression)
// ==========================================
async function compressImage(file, maxSizeMB = 2) {
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_WIDTH = 2000;
                const MAX_HEIGHT = 2000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
        };
        reader.onerror = error => reject(error);
    });
}

// ==========================================
// 5. บันทึกข้อมูลและอัปโหลดไฟล์ไป GAS
// ==========================================
async function submitDocument(e) {
    e.preventDefault();

    const fileInput = document.getElementById('doc_file');
    let fileUrl = null;

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                file = await compressImage(file);
            }
            fileUrl = await uploadToGAS(file);
        }

        // อ่านค่าจาก TomSelect instance โดยตรง เพื่อความถูกต้อง
        const relatedSelectEl = document.getElementById('doc_related');
        const relatedTomSelect = relatedSelectEl && relatedSelectEl.tomselect;
        const relatedDepts = relatedTomSelect
            ? relatedTomSelect.getValue()
            : Array.from(relatedSelectEl.options).filter(opt => opt.selected).map(opt => opt.value);

        const docData = {
            receive_number: document.getElementById('doc_receive_number').value,
            receive_date: document.getElementById('doc_receive_date').value,
            speed_level: document.getElementById('doc_speed').value,
            secret_level: document.getElementById('doc_secret').value,
            doc_number: document.getElementById('doc_number').value,
            doc_date: document.getElementById('doc_date').value,
            doc_from: document.getElementById('doc_from').value,
            doc_to: document.getElementById('doc_to').value,
            doc_subject: document.getElementById('doc_subject').value,
            doc_action: document.getElementById('doc_action').value,
            related_depts: JSON.stringify(relatedDepts),
            file_url: fileUrl,
            recorder_id: currentUser.id
        };

        const { error } = await db.from('module_sarabun_docs').insert([docData]);
        if (error) throw error;

        if (systemSettings.telegram_token && systemSettings.telegram_chat_id) {
            const msg = `📣 แจ้งเตือนหนังสือรับใหม่\nเลขรับ: ${docData.receive_number}\nเรื่อง: ${docData.doc_subject}\nจาก: ${docData.doc_from}\nความเร็ว: ${docData.speed_level}`;
            await sendTelegram(msg);
        }

        Swal.fire('สำเร็จ', 'บันทึกหนังสือรับเข้าระบบเรียบร้อย', 'success').then(() => {
            document.getElementById('sarabunForm').reset();
            // Reset TomSelect instances ให้ครบทุกตัวในฟอร์ม
            document.querySelectorAll('#sarabunForm .ts-wrapper').forEach(wrapper => {
                const originalSelect = wrapper.nextElementSibling || wrapper.previousElementSibling;
                const ts = wrapper.querySelector('select') && wrapper.querySelector('select').tomselect;
                if (ts) ts.clear();
            });
            nextStep(1);
            toggleAdminPanel('table');
            loadDocuments();
        });

    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function uploadToGAS(file) {
    if (!systemSettings.gas_api_url) throw new Error("ยังไม่ได้ตั้งค่า GAS API URL ในเมนูตั้งค่าระบบ");

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = reader.result.split(",")[1];
            try {
                const response = await fetch(systemSettings.gas_api_url, {
                    method: 'POST',
                    body: JSON.stringify({
                        filename: file.name,
                        mimeType: file.type,
                        folderId: systemSettings.gas_folder_id,
                        fileData: base64Data
                    })
                });
                const result = await response.json();
                if (result.url) resolve(result.url);
                else reject(new Error("อัปโหลดไม่สำเร็จ"));
            } catch (err) { reject(err); }
        };
    });
}

// ==========================================
// 6. โหลดข้อมูลลง DataTables
// ==========================================
async function loadDocuments() {
    const { data, error } = await db.from('module_sarabun_docs')
        .select('*, core_personnel(first_name, last_name)')
        .order('receive_date', { ascending: false });

    if (error) return console.error(error);

    const formatData = data.map(d => [
        `<span class="text-sm font-medium text-slate-600">${d.receive_date}</span>`,
        `<span class="text-blue-600 font-bold">${d.receive_number}</span>`,
        d.doc_number,
        d.doc_subject,
        `<span class="px-2 py-1 bg-${d.speed_level.includes('ด่วน') ? 'red' : 'green'}-100 text-${d.speed_level.includes('ด่วน') ? 'red' : 'green'}-700 rounded-lg text-[11px] font-bold border border-${d.speed_level.includes('ด่วน') ? 'red' : 'green'}-200">${d.speed_level}</span>`,
        `<button onclick="viewDoc('${d.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-sm text-xs font-bold transition"><i class="fa-solid fa-eye mr-1 text-slate-500"></i> ดู</button>`
    ]);

    if ($.fn.DataTable.isDataTable('#teacherDocsTable')) $('#teacherDocsTable').DataTable().destroy();
    $('#teacherDocsTable').DataTable({
        data: formatData,
        responsive: true,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });

    if (isSarabunAdmin) {
        const adminFormatData = data.map(d => [
            `<span class="text-slate-600">${d.receive_date}</span>`,
            `<span class="font-bold text-blue-600">${d.receive_number}</span>`,
            d.doc_subject,
            `${d.core_personnel.first_name} ${d.core_personnel.last_name}`,
            `<div class="flex gap-2">
                <button onclick="viewDoc('${d.id}')" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition"><i class="fa-solid fa-eye"></i></button>
                <button onclick="deleteDoc('${d.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"><i class="fa-solid fa-trash"></i></button>
             </div>`
        ]);
        if ($.fn.DataTable.isDataTable('#adminDocsTable')) $('#adminDocsTable').DataTable().destroy();
        $('#adminDocsTable').DataTable({
            data: adminFormatData,
            responsive: true,
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
        });
    }
}

// ดูรายละเอียด
async function viewDoc(id) {
    const { data } = await db.from('module_sarabun_docs').select('*, core_personnel(first_name, last_name)').eq('id', id).single();
    if (!data) return;

    let relatedArray = [];
    try {
        relatedArray = JSON.parse(data.related_depts);
    } catch (e) {
        relatedArray = [data.related_depts];
    }

    let html = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">เลขทะเบียนรับ</span> <strong class="text-blue-700 text-base">${data.receive_number}</strong></div>
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">วันที่ลงรับ</span> <strong class="text-slate-800">${data.receive_date}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ที่หนังสือ:</span> <strong class="text-slate-800">${data.doc_number}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ลงวันที่:</span> <strong class="text-slate-800">${data.doc_date}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">จาก:</span> <strong class="text-slate-800">${data.doc_from}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">เรื่อง:</span> <strong class="text-slate-800 text-base">${data.doc_subject}</strong></div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">กลุ่มที่เกี่ยวข้อง:</span> 
                <div class="flex flex-wrap gap-2">
                    ${relatedArray.map(r => `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg text-xs font-bold">${r}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
    if (data.file_url) {
        html += `<div class="mt-6 pt-6 border-t border-slate-100"><a href="${data.file_url}" target="_blank" class="flex w-full items-center justify-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl shadow-md transition font-bold"><i class="fa-solid fa-file-pdf mr-2 text-xl"></i> เปิดดูไฟล์แนบ / ต้นฉบับ</a></div>`;
    }

    document.getElementById('docModalBody').innerHTML = html;

    const modal = document.getElementById('docDetailModal');
    const content = document.getElementById('docModalContent');
    modal.classList.remove('hidden');
    // Allow display block to apply before fading in
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('docDetailModal');
    const content = document.getElementById('docModalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function deleteDoc(id) {
    Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "คุณต้องการลบหนังสือรับรายการนี้ใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { error } = await db.from('module_sarabun_docs').delete().eq('id', id);
            if (error) {
                Swal.fire('Error', error.message, 'error');
            } else {
                Swal.fire('ลบแล้ว!', 'ลบหนังสือรับเรียบร้อย', 'success');
                loadDocuments();
            }
        }
    });
}

// ==========================================
// 7. Super Admin Settings & Module Admin
// ==========================================
async function openSettingsModal() {
    await loadSettings();
    await loadTeachersForAppoint();
    await loadModuleAdmins();

    const modal = document.getElementById('adminSettingsModal');
    const content = document.getElementById('adminSettingsContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeSettingsModal() {
    const modal = document.getElementById('adminSettingsModal');
    const content = document.getElementById('adminSettingsContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function loadSettings() {
    try {
        const { data, error } = await db.from('module_sarabun_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle(); // ใช้ .maybeSingle() แทน .single() เพื่อกัน error กรณีไม่พบข้อมูล

        if (error) {
            console.error("Error loading settings:", error);
            return;
        }

        if (data) {
            systemSettings = data;
            document.getElementById('set_gas_url').value = data.gas_api_url || '';
            document.getElementById('set_folder_id').value = data.gas_folder_id || '';
            document.getElementById('set_telegram_token').value = data.telegram_token || '';
            document.getElementById('set_telegram_chat').value = data.telegram_chat_id || '';
        }
    } catch (e) {
        console.error("System Error:", e);
    }
}

async function saveSettings() {
    const updates = {
        id: 1,
        gas_api_url: document.getElementById('set_gas_url').value,
        gas_folder_id: document.getElementById('set_folder_id').value,
        telegram_token: document.getElementById('set_telegram_token').value,
        telegram_chat_id: document.getElementById('set_telegram_chat').value,
        updated_at: new Date()
    };

    const { error } = await db.from('module_sarabun_settings').upsert(updates);
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกการตั้งค่าระบบเรียบร้อย', timer: 1500, showConfirmButton: false });
    systemSettings = updates;
}

async function loadTeachersForAppoint() {
    const { data: personnel } = await db.from('core_personnel').select('id, first_name, last_name').neq('role', 'super_admin');
    const { data: currentAdmins } = await db.from('core_module_admins').select('user_id, module_name').eq('module_name', 'sarabun');

    const adminIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];
    const available = personnel.filter(p => !adminIds.includes(p.id));

    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาและเลือกรายชื่อ --</option>';
    available.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`;
    });

    if (appointTomSelect) appointTomSelect.destroy();
    appointTomSelect = new TomSelect(select, { create: false, sortField: { field: "text", direction: "asc" } });
}

async function loadModuleAdmins() {
    // Query 1: ดึงรายการ admin ของ module sarabun
    const { data, error } = await db.from('core_module_admins')
        .select('id, user_id, module_name')
        .eq('module_name', 'sarabun');

    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '';
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบเพิ่มเติม</td></tr>';
        return;
    }

    // Query 2: ดึงชื่อจาก core_personnel แยกต่างหาก
    const userIds = data.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel')
        .select('id, first_name, last_name')
        .in('id', userIds);

    const personnelMap = {};
    if (personnel) personnel.forEach(p => { personnelMap[p.id] = p; });

    data.forEach(admin => {
        const person = personnelMap[admin.user_id] || {};
        const fullName = person.first_name ? `${person.first_name} ${person.last_name}` : `(id: ${admin.user_id})`;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2.5 px-4 font-bold text-slate-700">${fullName}</td>
                <td class="py-2.5 px-4 text-center">
                    <button onclick="removeModuleAdmin('${admin.id}')" class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition flex items-center justify-center mx-auto" title="ถอดถอน">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

async function appointModuleAdmin() {
    const userId = appointTomSelect.getValue();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากรที่ต้องการแต่งตั้ง', 'warning');

    const { error } = await db.from('core_module_admins').insert([{
        user_id: userId,
        module_name: 'sarabun'
    }]);

    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
    await loadTeachersForAppoint();
    await loadModuleAdmins();
}

async function removeModuleAdmin(recordId) {
    Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        text: "ผู้ใช้นี้จะหมดสิทธิ์ในการจัดการหนังสือรับทันที",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ถอดถอน'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { error } = await db.from('core_module_admins').delete().eq('id', recordId);
            if (error) return Swal.fire('Error', error.message, 'error');
            Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadTeachersForAppoint();
            await loadModuleAdmins();
        }
    });
}

async function sendTelegram(message) {
    if (!systemSettings.telegram_token || !systemSettings.telegram_chat_id) return;
    const url = `https://api.telegram.org/bot${systemSettings.telegram_token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: systemSettings.telegram_chat_id, text: message })
        });
    } catch (err) { console.error("Telegram Error: ", err); }
}
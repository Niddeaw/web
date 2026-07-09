// sarabun.js - ฉบับปรับปรุงสมบูรณ์ (Server-side DataTables, Excel, RLS, วันที่ไทย)
let currentUser = null;
let currentProfile = null;
let userRole = null;
let isSarabunAdmin = false;
let isAdminMode = false;
let systemSettings = {};
let settingsCache = null;
let appointTomSelect = null;
let cropper = null;

let teacherTable = null;
let adminTable = null;

window.onload = async () => {
    await checkAuth();
    initUIComponents();
    initCropperEvents();
    await loadSettings();
    await loadDocuments();
};

// ==========================================
// ฟังก์ชันแปลงวันที่เป็นภาษาไทย (แบบเต็ม)
// ==========================================
function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
}

// ==========================================
// 1. ระบบตรวจสอบสิทธิ์ (ใช้ config.js)
// ==========================================
async function checkAuth() {
    const result = await checkSessionAndRole('sarabun', WRK_ROLES.ALLOWED);
    if (!result) return;

    currentUser = result.user;
    currentProfile = result.personnel;
    userRole = currentProfile.role;

    // อัปเดตชื่อผู้ใช้
    const userDisplay = document.getElementById('userNameDisplay');
    if (userDisplay) {
        const prefix = currentProfile.prefix || '';
        userDisplay.innerText = `${prefix}${currentProfile.first_name} ${currentProfile.last_name}`;
    }

    // อัปเดตชื่อผู้บันทึกในฟอร์ม
    const recorderDisplay = document.getElementById('recorder_name_display');
    if (recorderDisplay) {
        const prefix = currentProfile.prefix || '';
        recorderDisplay.innerText = `${prefix}${currentProfile.first_name} ${currentProfile.last_name}`;
    }

    // ตรวจสอบสิทธิ์ Admin
    const isGlobalAdmin = isAdminUser(userRole, false);
    if (isGlobalAdmin) {
        isSarabunAdmin = true;
    } else {
        isSarabunAdmin = await hasModuleAccess(userRole, 'sarabun', currentUser.id);
    }

    // ตั้งค่าโหมด Admin
    const hasAdminRight = isAdminUser(userRole, false) || isSarabunAdmin;
    isAdminMode = hasAdminRight;

    // อัปเดต UI
    updateUIByRole();

    // จัดการปุ่มสลับโหมด
    const toggleBtn = document.getElementById('btnToggleMode');
    if (toggleBtn) {
        if (isAdminMode) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.classList.add('flex');
            window.updateToggleModeUI(userRole, isAdminMode, 'btnToggleMode');
        } else {
            toggleBtn.classList.add('hidden');
            toggleBtn.classList.remove('flex');
        }
    }

    // โหลด DataTables (Server-side)
    await loadDocuments();

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
}

function updateUIByRole() {
    applyVisibilityByRole(userRole, isAdminMode, {
        settingsBtn: 'admin-settings-btn'
    });

    const tabAdmin = document.getElementById('tab-admin');
    if (isAdminMode) {
        tabAdmin.classList.remove('hidden');
        tabAdmin.classList.add('flex');
    } else {
        tabAdmin.classList.add('hidden');
        tabAdmin.classList.remove('flex');
    }

    let roleText = 'Teacher';
    if (isAdminMode) {
        if (userRole === 'super_admin') roleText = 'Super Admin';
        else if (userRole === 'admin') roleText = 'Admin';
        else if (isSarabunAdmin) roleText = 'Sarabun Admin';
    }
    const roleDisplay = document.getElementById('userRoleDisplay');
    if (roleDisplay) roleDisplay.innerText = roleText;
}

// ==========================================
// 2. ฟังก์ชันสลับโหมด
// ==========================================
async function toggleRoleView() {
    const hasAdminRight = isAdminUser(userRole, false) || isSarabunAdmin;
    if (!hasAdminRight) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ใช่ผู้ดูแลระบบ', 'warning');
        return;
    }
    isAdminMode = !isAdminMode;
    window.updateToggleModeUI(userRole, isAdminMode, 'btnToggleMode');
    updateUIByRole();
    // รีเฟรช DataTables
    if (teacherTable) teacherTable.ajax.reload(null, false);
    if (adminTable) adminTable.ajax.reload(null, false);

    Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: 'info',
        title: isAdminMode ? 'เปลี่ยนเป็นโหมด Admin' : 'เปลี่ยนเป็นโหมดครู',
        showConfirmButton: false,
        timer: 2000
    });
}

// ==========================================
// 3. Logout
// ==========================================
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
        window.location.replace('login.html');
    }
}

// ==========================================
// 4. UI Components
// ==========================================
function initUIComponents() {
    document.querySelectorAll('.tom-select-single').forEach(el => new TomSelect(el, { create: true }));
    document.querySelectorAll('.tom-select-multi').forEach(el => new TomSelect(el, { plugins: ['remove_button'] }));

    flatpickr(".thai-datepicker", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d F Y"
    });
}

function initCropperEvents() {
    const fileInput = document.getElementById('ocrImageInput');
    if (!fileInput) return;
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const img = document.getElementById('ocrPreviewImage');
        const url = URL.createObjectURL(file);
        img.src = url;
        img.classList.remove('hidden');
        document.getElementById('noImageMsg')?.classList.add('hidden');
        if (cropper) cropper.destroy();
        img.onload = () => {
            cropper = new Cropper(img, {
                aspectRatio: NaN,
                viewMode: 1,
                dragMode: 'crop',
                autoCropArea: 0.8,
                cropBoxMovable: true,
                cropBoxResizable: true
            });
            const btn = document.getElementById('cropAndOCRBtn');
            if (btn) btn.disabled = false;
        };
    });
}

// ==========================================
// 5. OCR และฟอร์ม
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

async function cropAndOCR() {
    if (!cropper) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรูปภาพและลากกรอบบริเวณข้อความ "จาก" และ "เรื่อง" ก่อน', 'warning');
    }
    const croppedCanvas = cropper.getCroppedCanvas();
    if (!croppedCanvas) {
        return Swal.fire('แจ้งเตือน', 'กรุณาลากเมาส์เลือกพื้นที่ที่มีข้อความ', 'warning');
    }

    Swal.fire({
        title: 'กำลังอ่านข้อความเฉพาะพื้นที่ที่เลือก...',
        html: 'ใช้เวลาประมาณ 2-4 วินาที',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/jpeg', 0.9));
        const resizedBlob = await resizeImageBlob(blob, 1200);
        const result = await Tesseract.recognize(
            resizedBlob,
            'tha+eng',
            { logger: m => console.log('[OCR]', m.status, m.progress ? Math.round(m.progress*100)+'%' : '') }
        );
        let rawText = result.data.text;
        console.log('OCR Result (cropped):', rawText);

        const normalized = normalizeThaiText(rawText);
        const fromMatch = normalized.match(/(?:^|\n)[^\n]*จาก[\s:]*(\S[^\n]*)/m);
        const subjectMatch = normalized.match(/(?:^|\n)[^\n]*เรื่อง[\s:]*(\S[^\n]*)/m);

        if (fromMatch) document.getElementById('doc_from').value = fromMatch[1].trim();
        if (subjectMatch) document.getElementById('doc_subject').value = subjectMatch[1].trim();

        if (!fromMatch && !subjectMatch && normalized.trim().length > 0) {
            const { value: selected } = await Swal.fire({
                title: 'ไม่พบคำว่า "จาก" หรือ "เรื่อง" อัตโนมัติ',
                html: `
                    <p class="text-left text-sm mb-2">ข้อความที่อ่านได้ (ปรับแต่งให้ต่อเนื่องแล้ว):</p>
                    <textarea id="ocrCleanText" rows="5" class="w-full border rounded p-2 text-sm font-mono">${escapeHtml(normalized.substring(0, 800))}</textarea>
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
                    const text = document.getElementById('ocrCleanText').value;
                    const target = document.getElementById('targetField').value;
                    return { text, target };
                }
            });
            if (selected) {
                if (selected.target === 'from') document.getElementById('doc_from').value = selected.text;
                else if (selected.target === 'subject') document.getElementById('doc_subject').value = selected.text;
                else if (selected.target === 'both') {
                    document.getElementById('doc_from').value = selected.text;
                    document.getElementById('doc_subject').value = selected.text;
                }
            }
        } else if (fromMatch || subjectMatch) {
            Swal.fire('สำเร็จ', 'ดึงข้อมูล "จาก" และ/หรือ "เรื่อง" สำเร็จ', 'success');
        }
        nextStep(2);
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'OCR ล้มเหลว กรุณากรอกข้อมูลด้วยตนเอง', 'error');
        nextStep(2);
    }
}

function skipOCR() {
    nextStep(2);
}

function resizeImageBlob(blob, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize) {
                h = (h * maxSize) / w;
                w = maxSize;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(resolve, 'image/jpeg', 0.8);
        };
    });
}

function normalizeThaiText(text) {
    let lines = text.split('\n');
    lines = lines.map(line => {
        let cleaned = line.replace(/[ \t]+/g, ' ');
        let previous;
        do {
            previous = cleaned;
            cleaned = cleaned.replace(/([ก-๙]) (?=[ก-๙])/g, '$1');
        } while (cleaned !== previous);
        return cleaned.trim();
    });
    return lines.filter(l => l.length > 0).join('\n');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==========================================
// 6. บีบอัดรูป
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
                let width = img.width, height = img.height;
                const MAX_WIDTH = 2000, MAX_HEIGHT = 2000;
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
// 7. บันทึกข้อมูลและอัปโหลด
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

        const relatedSelectEl = document.getElementById('doc_related');
        const relatedTomSelect = relatedSelectEl && relatedSelectEl.tomselect;
        const relatedDepts = relatedTomSelect
            ? relatedTomSelect.getValue()
            : Array.from(relatedSelectEl.options).filter(opt => opt.selected).map(opt => opt.value);

        if (!currentUser || !currentUser.id) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่', 'error');
            return;
        }

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
        if (error) {
            console.error('Insert error:', error);
            if (error.message && error.message.includes('row-level security')) {
                Swal.fire({
                    icon: 'error',
                    title: 'ข้อผิดพลาดด้านความปลอดภัย (RLS)',
                    html: `<p class="text-left text-sm">ระบบไม่สามารถบันทึกข้อมูลได้ เนื่องจากข้อจำกัดด้านความปลอดภัยของฐานข้อมูล</p>
                           <p class="text-left text-xs bg-slate-100 p-3 rounded-lg mt-2 font-mono">${error.message}</p>
                           <p class="text-left text-xs text-amber-600 mt-3">💡 กรุณาแจ้ง Super Admin เพื่อตั้งค่า RLS Policy ใน Supabase</p>`,
                    confirmButtonText: 'ตกลง'
                });
            } else {
                Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
            }
            return;
        }

        if (systemSettings.telegram_token && systemSettings.telegram_chat_id) {
            await sendTelegram({
                ...docData,
                recorder_name: `${currentProfile.first_name} ${currentProfile.last_name}`
            });
        }

        Swal.fire('สำเร็จ', 'บันทึกหนังสือรับเข้าระบบเรียบร้อย', 'success').then(() => {
            document.getElementById('sarabunForm').reset();
            document.querySelectorAll('#sarabunForm .ts-wrapper').forEach(wrapper => {
                const ts = wrapper.querySelector('select')?.tomselect;
                if (ts) ts.clear();
            });
            nextStep(1);
            toggleAdminPanel('table');
            // รีเฟรช DataTables
            if (teacherTable) teacherTable.ajax.reload(null, false);
            if (adminTable) adminTable.ajax.reload(null, false);
        });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function uploadToGAS(file) {
    if (!systemSettings.gas_api_url) throw new Error('ยังไม่ได้ตั้งค่า GAS API URL ในเมนูตั้งค่าระบบ');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            try {
                const response = await fetch(systemSettings.gas_api_url, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'upload',
                        fileName: file.name,
                        mimeType: file.type,
                        folderId: systemSettings.gas_folder_id,
                        base64: base64Data
                    })
                });
                const result = await response.json();
                if (result.status === 'success' && result.url) resolve(result.url);
                else reject(new Error(result.message || 'อัปโหลดไม่สำเร็จ'));
            } catch (err) { reject(err); }
        };
    });
}

// ==========================================
// 8. โหลดข้อมูล DataTables (Server-side)
// ==========================================
function loadDocuments() {
    // --- Teacher Table ---
    if ($.fn.DataTable.isDataTable('#teacherDocsTable')) {
        $('#teacherDocsTable').DataTable().destroy();
    }
    teacherTable = $('#teacherDocsTable').DataTable({
        processing: true,
        serverSide: true,
        ajax: function(dtParams, callback, settings) {
            loadTableDataServerSide(dtParams, callback, 'teacher');
        },
        columns: [
            { data: 'receive_date', render: (d) => formatThaiDate(d) },
            { data: 'receive_number' },
            { data: 'doc_number' },
            { data: 'doc_subject' },
            { data: 'speed_level', render: (d) => {
                const color = d && d.includes('ด่วน') ? 'red' : 'green';
                return `<span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-lg text-[11px] font-bold border border-${color}-200">${escapeHtml(d || 'ปกติ')}</span>`;
            }},
            { data: 'id', orderable: false, render: (id) => 
                `<button onclick="viewDoc('${id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-sm text-xs font-bold transition">
                    <i class="fa-solid fa-eye mr-1 text-slate-500"></i> ดู
                </button>`
            }
        ],
        order: [[0, 'desc']],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });

    // --- Admin Table (เฉพาะ Admin) ---
    if (isAdminMode) {
        if ($.fn.DataTable.isDataTable('#adminDocsTable')) {
            $('#adminDocsTable').DataTable().destroy();
        }
        adminTable = $('#adminDocsTable').DataTable({
            processing: true,
            serverSide: true,
            ajax: function(dtParams, callback, settings) {
                loadTableDataServerSide(dtParams, callback, 'admin');
            },
            columns: [
                { data: 'receive_date', render: (d) => formatThaiDate(d) },
                { data: 'receive_number' },
                { data: 'doc_subject' },
                { data: 'recorder_name', defaultContent: '-' },
                { data: 'id', orderable: false, render: (id) => `
                    <div class="flex gap-1 justify-center">
                        <button onclick="viewDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="ดู"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="editDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteDoc('${id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" title="ลบ"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `}
            ],
            order: [[0, 'desc']],
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
        });
    }
}

// ==========================================
// 9. ฟังก์ชันโหลดข้อมูลแบบ Server-side
// ==========================================
async function loadTableDataServerSide(dtParams, callback, tableType) {
    const { start, length, search, order, draw } = dtParams;

    try {
        let query = db.from('module_sarabun_docs')
            .select(`
                id, receive_number, receive_date, doc_number, doc_subject,
                speed_level, secret_level, doc_from, doc_to, doc_action,
                related_depts, file_url, recorder_id,
                core_personnel ( first_name, last_name )
            `, { count: 'exact', head: false });

        // ค้นหา
        if (search.value) {
            const term = `%${search.value}%`;
            query = query.or(
                `receive_number.ilike.${term},` +
                `doc_number.ilike.${term},` +
                `doc_subject.ilike.${term},` +
                `doc_from.ilike.${term}`
            );
        }

        // เรียงลำดับ
        if (order && order.length > 0) {
            const colIndex = order[0].column;
            let colName = 'receive_date';
            if (tableType === 'teacher') {
                const colMap = ['receive_date', 'receive_number', 'doc_number', 'doc_subject', 'speed_level'];
                colName = colMap[colIndex] || 'receive_date';
            } else {
                const colMap = ['receive_date', 'receive_number', 'doc_subject', 'recorder_name'];
                colName = colMap[colIndex] || 'receive_date';
            }
            query = query.order(colName, { ascending: order[0].dir === 'asc' });
        } else {
            query = query.order('receive_date', { ascending: false });
        }

        // Pagination
        const { data, error, count } = await query.range(start, start + length - 1);

        if (error) throw error;

        // แปลงข้อมูล
        const formattedData = (data || []).map(row => {
            const recorderName = row.core_personnel
                ? `${row.core_personnel.first_name} ${row.core_personnel.last_name}`
                : '-';
            return {
                id: row.id,
                receive_date: row.receive_date,
                receive_number: row.receive_number,
                doc_number: row.doc_number,
                doc_subject: row.doc_subject,
                speed_level: row.speed_level,
                doc_from: row.doc_from,
                doc_to: row.doc_to,
                doc_action: row.doc_action,
                related_depts: row.related_depts,
                file_url: row.file_url,
                recorder_name: recorderName
            };
        });

        callback({
            draw: draw,
            recordsTotal: count || 0,
            recordsFiltered: count || 0,
            data: formattedData
        });

    } catch (err) {
        console.error('Server-side error:', err);
        callback({
            draw: dtParams.draw,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
        });
    }
}

// ==========================================
// 10. View/Edit/Delete
// ==========================================
async function viewDoc(id) {
    // ใช้ query แยก เพื่อดึงข้อมูลแบบเต็ม (ไม่ใช้ DataTable)
    const { data } = await db.from('module_sarabun_docs')
        .select('*, core_personnel(first_name, last_name)')
        .eq('id', id)
        .single();
    if (!data) return;

    let relatedArray = [];
    try {
        relatedArray = JSON.parse(data.related_depts || '[]');
    } catch (e) {
        relatedArray = [data.related_depts];
    }

    let html = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">เลขทะเบียนรับ</span> <strong class="text-blue-700 text-base">${escapeHtml(data.receive_number)}</strong></div>
            <div class="col-span-2 sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-100"><span class="text-slate-500 block text-xs mb-1">วันที่ลงรับ</span> <strong class="text-slate-800">${escapeHtml(formatThaiDate(data.receive_date))}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ที่หนังสือ:</span> <strong class="text-slate-800">${escapeHtml(data.doc_number)}</strong></div>
            <div class="col-span-2 sm:col-span-1 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">ลงวันที่:</span> <strong class="text-slate-800">${escapeHtml(formatThaiDate(data.doc_date))}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">จาก:</span> <strong class="text-slate-800">${escapeHtml(data.doc_from)}</strong></div>
            <div class="col-span-2 border-b border-slate-100 pb-2"><span class="text-slate-500 mr-2">เรื่อง:</span> <strong class="text-slate-800 text-base">${escapeHtml(data.doc_subject)}</strong></div>
            <div class="col-span-2 pt-1"><span class="text-slate-500 block mb-2">กลุ่มที่เกี่ยวข้อง:</span> 
                <div class="flex flex-wrap gap-2">
                    ${relatedArray.map(r => `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg text-xs font-bold">${escapeHtml(r)}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
    if (data.file_url) {
        html += `<div class="mt-6 pt-6 border-t border-slate-100"><a href="${escapeHtml(data.file_url)}" target="_blank" class="flex w-full items-center justify-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl shadow-md transition font-bold"><i class="fa-solid fa-file-pdf mr-2 text-xl"></i> เปิดดูไฟล์แนบ / ต้นฉบับ</a></div>`;
    }
    document.getElementById('docModalBody').innerHTML = html;
    const modal = document.getElementById('docDetailModal');
    const content = document.getElementById('docModalContent');
    modal.classList.remove('hidden');
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

// ==========================================
// 11. แก้ไขหนังสือ (Admin)
// ==========================================
function closeEditModal() {
    const modal = document.getElementById('editDocModal');
    const content = document.getElementById('editModalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function editDoc(id) {
    if (!isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขหนังสือได้', 'warning');
        return;
    }

    const { data, error } = await db.from('module_sarabun_docs').select('*').eq('id', id).single();
    if (error || !data) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลหนังสือ', 'error');
        return;
    }

    document.getElementById('edit_doc_id').value = data.id;
    document.getElementById('edit_receive_number').value = data.receive_number || '';
    document.getElementById('edit_receive_date').value = data.receive_date || '';
    document.getElementById('edit_doc_number').value = data.doc_number || '';
    document.getElementById('edit_doc_date').value = data.doc_date || '';
    document.getElementById('edit_doc_from').value = data.doc_from || '';
    document.getElementById('edit_doc_subject').value = data.doc_subject || '';
    document.getElementById('edit_doc_to').value = data.doc_to || 'ผู้อำนวยการโรงเรียน';
    document.getElementById('edit_speed_level').value = data.speed_level || 'ปกติ';
    document.getElementById('edit_secret_level').value = data.secret_level || 'ปกติ';
    document.getElementById('edit_doc_action').value = data.doc_action || 'มอบหมาย';

    let relatedDepts = [];
    try {
        relatedDepts = JSON.parse(data.related_depts || '[]');
    } catch (e) {
        relatedDepts = [data.related_depts];
    }
    const relatedSelect = document.getElementById('edit_related_depts');
    if (relatedSelect && relatedSelect.tomselect) {
        relatedSelect.tomselect.setValue(relatedDepts);
    }

    const modal = document.getElementById('editDocModal');
    const content = document.getElementById('editModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);

    flatpickr(".thai-datepicker", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d F Y"
    });
}

async function saveEditDoc(e) {
    e.preventDefault();
    const id = document.getElementById('edit_doc_id').value;
    if (!id) return Swal.fire('ผิดพลาด', 'ไม่พบ ID หนังสือ', 'error');

    const receiveNumber = document.getElementById('edit_receive_number').value.trim();
    const receiveDate = document.getElementById('edit_receive_date').value;
    const docNumber = document.getElementById('edit_doc_number').value.trim();
    const docDate = document.getElementById('edit_doc_date').value;
    const docFrom = document.getElementById('edit_doc_from').value.trim();
    const docSubject = document.getElementById('edit_doc_subject').value.trim();
    const speedLevel = document.getElementById('edit_speed_level').value;
    const secretLevel = document.getElementById('edit_secret_level').value;
    const docAction = document.getElementById('edit_doc_action').value;
    const docTo = document.getElementById('edit_doc_to').value.trim();

    const relatedSelect = document.getElementById('edit_related_depts');
    const relatedDepts = relatedSelect && relatedSelect.tomselect
        ? relatedSelect.tomselect.getValue()
        : [];

    if (!receiveNumber || !docNumber || !docFrom || !docSubject) {
        return Swal.fire('กรุณากรอกข้อมูล', 'เลขทะเบียนรับ, ที่หนังสือ, จาก และเรื่อง เป็นข้อมูลจำเป็น', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกการแก้ไข...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const updateData = {
        receive_number: receiveNumber,
        receive_date: receiveDate,
        doc_number: docNumber,
        doc_date: docDate,
        doc_from: docFrom,
        doc_subject: docSubject,
        speed_level: speedLevel,
        secret_level: secretLevel,
        doc_action: docAction,
        doc_to: docTo,
        related_depts: JSON.stringify(relatedDepts)
    };

    try {
        const { error } = await db.from('module_sarabun_docs').update(updateData).eq('id', id);
        if (error) throw error;

        Swal.fire('สำเร็จ', 'แก้ไขหนังสือเรียบร้อย', 'success');
        closeEditModal();
        if (teacherTable) teacherTable.ajax.reload(null, false);
        if (adminTable) adminTable.ajax.reload(null, false);
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 12. ลบหนังสือ (Admin)
// ==========================================
async function deleteDoc(id) {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบหนังสือได้')) return;

    Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "คุณต้องการลบหนังสือรับรายการนี้ใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ใช่, ลบเลย!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { error } = await db.from('module_sarabun_docs').delete().eq('id', id);
            if (error) Swal.fire('Error', error.message, 'error');
            else {
                Swal.fire('ลบแล้ว!', 'ลบหนังสือรับเรียบร้อย', 'success');
                if (teacherTable) teacherTable.ajax.reload(null, false);
                if (adminTable) adminTable.ajax.reload(null, false);
            }
        }
    });
}

// ==========================================
// 13. สลับแท็บ / Panel
// ==========================================
function toggleAdminPanel(panel) {
    if (panel === 'table') {
        document.getElementById('adminTablePanel').classList.remove('hidden');
        document.getElementById('adminFormPanel').classList.add('hidden');
        if (adminTable) adminTable.ajax.reload(null, false);
    } else {
        document.getElementById('adminTablePanel').classList.add('hidden');
        document.getElementById('adminFormPanel').classList.remove('hidden');
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
    document.querySelectorAll('#roleTabs button').forEach(btn => {
        btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600', 'border', 'border-slate-100');
        btn.classList.add('text-slate-500', 'hover:text-slate-700', 'hover:bg-white/50');
    });
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'hover:text-slate-700', 'hover:bg-white/50');
        activeBtn.classList.add('bg-white', 'shadow-sm', 'text-blue-600', 'border', 'border-slate-100');
    }

    // รีเฟรช DataTable
    if (tabId === 'teacherView' && teacherTable) {
        teacherTable.ajax.reload(null, false);
    } else if (tabId === 'adminView' && adminTable) {
        adminTable.ajax.reload(null, false);
    }
}

// ==========================================
// 14. Super Admin Settings & Module Admin
// ==========================================
async function openSettingsModal() {
    if (!requireAdmin(userRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถตั้งค่าระบบได้')) return;
    await loadSettings(true);
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

async function loadSettings(forceRefresh = false) {
    if (settingsCache && !forceRefresh) {
        systemSettings = settingsCache;
        document.getElementById('set_gas_url').value = settingsCache.gas_api_url || '';
        document.getElementById('set_folder_id').value = settingsCache.gas_folder_id || '';
        document.getElementById('set_telegram_token').value = settingsCache.telegram_token || '';
        document.getElementById('set_telegram_chat').value = settingsCache.telegram_chat_id || '';
        return;
    }
    try {
        const { data, error } = await db.from('module_sarabun_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
        if (error) { console.error("Error loading settings:", error); return; }
        if (data) {
            systemSettings = data;
            settingsCache = data;
            document.getElementById('set_gas_url').value = data.gas_api_url || '';
            document.getElementById('set_folder_id').value = data.gas_folder_id || '';
            document.getElementById('set_telegram_token').value = data.telegram_token || '';
            document.getElementById('set_telegram_chat').value = data.telegram_chat_id || '';
        }
    } catch (e) { console.error("System Error:", e); }
}

async function saveSettings() {
    const updates = {
        id: 1,
        gas_api_url: document.getElementById('set_gas_url').value,
        gas_folder_id: document.getElementById('set_folder_id').value,
        telegram_token: document.getElementById('set_telegram_token').value,
        telegram_chat_id: document.getElementById('set_telegram_chat').value
    };
    const { error } = await db.from('module_sarabun_settings').upsert(updates);
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกการตั้งค่าระบบเรียบร้อย', timer: 1500, showConfirmButton: false });
    systemSettings = updates;
    settingsCache = updates;
}

// ==========================================
// 15. Module Admin Management
// ==========================================
async function ensureModuleExists(moduleId) {
    const { data, error } = await db.from('core_system_modules')
        .select('module_id')
        .eq('module_id', moduleId)
        .maybeSingle();
    if (error) {
        console.error('Error checking module:', error);
        return false;
    }
    if (!data) {
        const { error: insertError } = await db.from('core_system_modules')
            .insert({
                module_id: moduleId,
                module_name: 'ระบบสารบรรณ',
                is_active: true,
                updated_at: new Date()
            });
        if (insertError) {
            console.error('Error inserting module:', insertError);
            return false;
        }
        console.log(`✅ เพิ่ม module_id "${moduleId}" ลงใน core_system_modules แล้ว`);
        return true;
    }
    return true;
}

async function loadTeachersForAppoint() {
    const { data: personnel } = await db.from('core_personnel')
        .select('id, first_name, last_name, prefix')
        .order('first_name', { ascending: true });

    const { data: currentAdmins } = await db.from('core_module_admins')
        .select('user_id')
        .eq('module_id', 'sarabun');

    const adminIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];
    const available = personnel ? personnel.filter(p => !adminIds.includes(p.id)) : [];

    const select = document.getElementById('select-teacher-appoint');
    select.innerHTML = '<option value="">-- ค้นหาและเลือกรายชื่อ --</option>';
    available.forEach(p => {
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        select.innerHTML += `<option value="${p.id}">${escapeHtml(fullName)}</option>`;
    });

    if (appointTomSelect) appointTomSelect.destroy();
    appointTomSelect = new TomSelect(select, { create: false, sortField: { field: "text", direction: "asc" } });
}

async function loadModuleAdmins() {
    const { data, error } = await db.from('core_module_admins')
        .select('id, user_id')
        .eq('module_id', 'sarabun');

    const tbody = document.getElementById('module-admin-list');
    tbody.innerHTML = '';

    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบเพิ่มเติม</td></tr>';
        return;
    }

    const userIds = data.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name')
        .in('id', userIds);

    const personnelMap = {};
    if (personnel) personnel.forEach(p => { personnelMap[p.id] = p; });

    data.forEach(admin => {
        const person = personnelMap[admin.user_id] || {};
        const fullName = person.first_name ?
            `${person.prefix || ''}${escapeHtml(person.first_name)} ${escapeHtml(person.last_name)}` :
            `(id: ${admin.user_id})`;
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

    const moduleExists = await ensureModuleExists('sarabun');
    if (!moduleExists) {
        return Swal.fire('Error', 'ไม่สามารถตรวจสอบหรือเพิ่มโมดูลได้ กรุณาติดต่อผู้ดูแลระบบ', 'error');
    }

    const { data: existing } = await db.from('core_module_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('module_id', 'sarabun')
        .maybeSingle();

    if (existing) {
        return Swal.fire('แจ้งเตือน', 'บุคลากรนี้เป็นผู้ดูแลระบบอยู่แล้ว', 'info');
    }

    const { error } = await db.from('core_module_admins')
        .insert([{ user_id: userId, module_id: 'sarabun' }]);

    if (error) {
        console.error('Insert error:', error);
        return Swal.fire('Error', error.message, 'error');
    }

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

// ==========================================
// 16. ส่งออก Excel (Admin)
// ==========================================
async function exportToExcel() {
    if (!isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถส่งออกข้อมูลได้', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { data, error } = await db.from('module_sarabun_docs')
            .select('*, core_personnel(first_name, last_name)')
            .order('receive_date', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบหนังสือรับในระบบ', 'info');
            return;
        }

        const rows = data.map(d => ({
            'วันที่ลงรับ': formatThaiDate(d.receive_date),
            'เลขทะเบียนรับ': d.receive_number,
            'ที่หนังสือ': d.doc_number,
            'ลงวันที่': formatThaiDate(d.doc_date),
            'จาก': d.doc_from,
            'ถึง': d.doc_to,
            'เรื่อง': d.doc_subject,
            'ชั้นความเร็ว': d.speed_level,
            'ชั้นความลับ': d.secret_level,
            'การดำเนินการ': d.doc_action,
            'ผู้บันทึก': `${d.core_personnel.first_name} ${d.core_personnel.last_name}`,
            'กลุ่มที่เกี่ยวข้อง': d.related_depts ? JSON.parse(d.related_depts).join(', ') : '',
            'ไฟล์แนบ': d.file_url || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        ws['!cols'] = [
            { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
            { wch: 30 }, { wch: 20 }, { wch: 40 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 30 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'หนังสือรับ');
        XLSX.writeFile(wb, `หนังสือรับ_${new Date().toISOString().slice(0, 10)}.xlsx`);

        Swal.close();
        Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 17. นำเข้า Excel (Admin)
// ==========================================
async function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลได้', 'warning');
        event.target.value = '';
        return;
    }

    const confirm = await Swal.fire({
        title: 'ยืนยันการนำเข้า?',
        html: `<p class="text-sm">คุณต้องการนำเข้าข้อมูลจากไฟล์ <b>${escapeHtml(file.name)}</b> ใช่หรือไม่?</p>
               <p class="text-xs text-amber-600 mt-2">⚠️ ระบบจะเพิ่มข้อมูลใหม่เท่านั้น ไม่มีการอัปเดตข้อมูลเดิม</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'นำเข้าเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirm.isConfirmed) {
        event.target.value = '';
        return;
    }

    Swal.fire({ title: 'กำลังอ่านไฟล์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);

            if (!rows || rows.length === 0) {
                Swal.fire('ไฟล์ว่าง', 'ไม่พบข้อมูลในไฟล์ Excel', 'warning');
                event.target.value = '';
                return;
            }

            let success = 0, fail = 0, errors = [];

            for (const row of rows) {
                try {
                    if (!row['เลขทะเบียนรับ'] || !row['ที่หนังสือ'] || !row['จาก'] || !row['เรื่อง']) {
                        fail++;
                        errors.push(`ขาดข้อมูล: ${row['เลขทะเบียนรับ'] || '(ไม่ระบุ)'}`);
                        continue;
                    }

                    const receiveDate = parseThaiDate(row['วันที่ลงรับ']) || new Date().toISOString().slice(0, 10);
                    const docDate = parseThaiDate(row['ลงวันที่']) || new Date().toISOString().slice(0, 10);

                    let relatedDepts = [];
                    if (row['กลุ่มที่เกี่ยวข้อง']) {
                        if (typeof row['กลุ่มที่เกี่ยวข้อง'] === 'string') {
                            relatedDepts = row['กลุ่มที่เกี่ยวข้อง'].split(',').map(s => s.trim()).filter(Boolean);
                        } else {
                            relatedDepts = [String(row['กลุ่มที่เกี่ยวข้อง'])];
                        }
                    }

                    const docData = {
                        receive_number: String(row['เลขทะเบียนรับ']).trim(),
                        receive_date: receiveDate,
                        speed_level: row['ชั้นความเร็ว'] || 'ปกติ',
                        secret_level: row['ชั้นความลับ'] || 'ปกติ',
                        doc_number: String(row['ที่หนังสือ']).trim(),
                        doc_date: docDate,
                        doc_from: String(row['จาก']).trim(),
                        doc_to: row['ถึง'] || 'ผู้อำนวยการโรงเรียน',
                        doc_subject: String(row['เรื่อง']).trim(),
                        doc_action: row['การดำเนินการ'] || 'มอบหมาย',
                        related_depts: JSON.stringify(relatedDepts),
                        file_url: row['ไฟล์แนบ'] || null,
                        recorder_id: currentUser.id
                    };

                    const { error } = await db.from('module_sarabun_docs').insert([docData]);
                    if (error) {
                        fail++;
                        errors.push(`ID: ${docData.receive_number} - ${error.message}`);
                    } else {
                        success++;
                    }
                } catch (err) {
                    fail++;
                    errors.push(`แถว: ${row['เลขทะเบียนรับ'] || '(ไม่ระบุ)'} - ${err.message}`);
                }
            }

            event.target.value = '';

            let msg = `✅ นำเข้าสำเร็จ ${success} รายการ`;
            if (fail > 0) {
                msg += `\n❌ ล้มเหลว ${fail} รายการ`;
                if (errors.length <= 10) {
                    msg += `\n\n${errors.join('\n')}`;
                } else {
                    msg += `\n\n${errors.slice(0, 10).join('\n')}\n... และอีก ${errors.length - 10} รายการ`;
                }
            }

            Swal.fire({
                icon: fail === 0 ? 'success' : 'warning',
                title: 'ผลการนำเข้า',
                text: msg,
                confirmButtonText: 'ตกลง'
            });

            // รีเฟรช DataTables
            if (teacherTable) teacherTable.ajax.reload(null, false);
            if (adminTable) adminTable.ajax.reload(null, false);

        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 18. แปลงวันที่ภาษาไทยเป็น ISO
// ==========================================
function parseThaiDate(thaiDateStr) {
    if (!thaiDateStr) return null;
    const str = String(thaiDateStr).trim();
    if (str === '') return null;

    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    let day, month, year;

    let parts = str.split(' ');
    if (parts.length === 3) {
        day = parseInt(parts[0]);
        month = months.indexOf(parts[1]);
        if (month === -1) {
            const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                                 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            month = shortMonths.indexOf(parts[1]);
        }
        year = parseInt(parts[2]);
        if (year > 2500) year -= 543;
        if (!isNaN(day) && month !== -1 && !isNaN(year)) {
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        let y = parseInt(isoMatch[1]);
        const m = parseInt(isoMatch[2]);
        const d = parseInt(isoMatch[3]);
        if (y > 2500) y -= 543;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return null;
}

// ==========================================
// 19. Telegram
// ==========================================
async function sendTelegram(docData) {
    if (!systemSettings.telegram_token || !systemSettings.telegram_chat_id) return;
    if (!systemSettings.gas_api_url) return;
    try {
        await fetch(systemSettings.gas_api_url, {
            method: 'POST',
            body: JSON.stringify({
                action: 'notify_telegram',
                token: systemSettings.telegram_token,
                chatId: systemSettings.telegram_chat_id,
                webUrl: window.location.href,
                doc: docData
            })
        });
    } catch (err) { console.error('Telegram Error:', err); }
}
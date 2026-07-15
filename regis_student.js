// regis_student.js - ระบบขอเอกสารงานทะเบียน (นักเรียน)
// ปรับปรุงการแจ้งเตือนหลังบันทึก: แสดงรหัสคำขอ (8 ตัวแรก) และข้อความใหม่

let currentStudent = null;
let schoolInfo = null;
let flatpickrInstance = null;

window.onload = async () => {
    await checkAuth();
};

// ==========================================
// ตรวจสอบสิทธิ์ (ใช้ email เพื่อดึง student_id_card)
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('login.html');
        return;
    }

    // 1. ดึงข้อมูลโรงเรียน
    const { data: sInfo, error: schoolError } = await db.from('core_school_info').select('*').maybeSingle();
    if (schoolError) {
        console.warn('ไม่สามารถโหลดข้อมูลโรงเรียน:', schoolError);
        schoolInfo = { school_name: 'โรงเรียน............................' };
    } else {
        schoolInfo = sInfo || { school_name: 'โรงเรียน............................' };
    }

    // 2. ดึง student_id_card จาก email
    const userEmail = session.user.email;
    if (!userEmail) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบอีเมลผู้ใช้', 'error').then(() => {
            window.location.replace('login.html');
        });
        return;
    }
    const studentIdCard = userEmail.split('@')[0];

    // 3. ค้นหานักเรียนจาก student_id_card
    const { data: student, error: studentError } = await db.from('core_students')
        .select(`*, student_enrollments(student_number, core_classrooms(grade_level, room_number))`)
        .eq('student_id_card', studentIdCard)
        .maybeSingle();

    if (studentError || !student) {
        await db.auth.signOut();
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลนักเรียนของอีเมลนี้ กรุณาติดต่อครูผู้ดูแล', 'error')
            .then(() => window.location.replace('login.html'));
        return;
    }

    currentStudent = student;

    // แสดงชื่อใน navbar
    const displayName = document.getElementById('studentDisplayName');
    if (displayName) {
        displayName.textContent = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    }

    document.getElementById('mainBody').classList.remove('hidden');
    setupUI();
    await loadHistory();
}

// ==========================================
// ตั้งค่า UI และ Flatpickr
// ==========================================
function setupUI() {
    // ตั้งค่า Flatpickr แบบ พ.ศ.
    const fp = flatpickr("#requestDate", {
        locale: "th",
        defaultDate: new Date(),
        dateFormat: "d/m/Y",
        altFormat: "d/m/Y",
        altInput: true,
        onReady: function(selectedDates, dateStr, instance) {
            const now = new Date();
            const thaiYear = now.getFullYear() + 543;
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            instance.setDate(now);
            if (instance.altInput) {
                instance.altInput.value = `${day}/${month}/${thaiYear}`;
            }
        },
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length > 0) {
                const d = selectedDates[0];
                const thaiYear = d.getFullYear() + 543;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                instance.altInput.value = `${day}/${month}/${thaiYear}`;
            }
        }
    });
    flatpickrInstance = fp;

    // แสดงข้อมูลนักเรียน
    let classInfo = 'ยังไม่มีห้องเรียน';
    let stdNum = '-';
    if (currentStudent.student_enrollments && currentStudent.student_enrollments.length > 0) {
        const enroll = currentStudent.student_enrollments[0];
        classInfo = `${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}`;
        stdNum = enroll.student_number;
    }

    document.getElementById('studentInfoText').innerHTML = 
        `<b>ชื่อ-สกุล:</b> ${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name} <br>
         <b>ชั้น:</b> ${classInfo} &nbsp;&nbsp; <b>เลขที่:</b> ${stdNum} &nbsp;&nbsp; <b>รหัสประจำตัว:</b> ${currentStudent.student_id_card}`;
}

// ==========================================
// จัดการ checkbox
// ==========================================
function toggleInput(inputId, isChecked) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.disabled = !isChecked;
    if (!isChecked) el.value = '';
    if (isChecked) el.focus();
}

function toggleInputOther(isChecked) {
    toggleInput('docOtherText', isChecked);
    toggleInput('docOtherQty', isChecked);
}

// ==========================================
// ส่งคำขอ (ปรับปรุงการแจ้งเตือน)
// ==========================================
async function submitRequest(e) {
    e.preventDefault();

    // ตรวจสอบเอกสารอย่างน้อย 1 รายการ
    const chkPP1 = document.getElementById('chkPP1').checked;
    const chkPP7 = document.getElementById('chkPP7').checked;
    const chkOther = document.getElementById('chkOther').checked;

    if (!chkPP1 && !chkPP7 && !chkOther) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารที่ต้องการขออย่างน้อย 1 รายการ', 'warning');
        return;
    }

    // ตรวจสอบความสมบูรณ์
    if (chkPP1 && !document.getElementById('docPP1Qty').value) {
        Swal.fire('แจ้งเตือน', 'กรุณากรอกจำนวนใบ ปพ.1', 'warning');
        document.getElementById('docPP1Qty').focus();
        return;
    }
    if (chkPP7 && !document.getElementById('docPP7Qty').value) {
        Swal.fire('แจ้งเตือน', 'กรุณากรอกจำนวนใบ ปพ.7', 'warning');
        document.getElementById('docPP7Qty').focus();
        return;
    }
    if (chkOther) {
        if (!document.getElementById('docOtherText').value.trim()) {
            Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อเอกสารอื่นๆ', 'warning');
            document.getElementById('docOtherText').focus();
            return;
        }
        if (!document.getElementById('docOtherQty').value) {
            Swal.fire('แจ้งเตือน', 'กรุณากรอกจำนวนเอกสารอื่นๆ', 'warning');
            document.getElementById('docOtherQty').focus();
            return;
        }
    }

    // ใช้วันที่จากฟอร์ม
    let requestDate = new Date().toISOString().split('T')[0];
    if (flatpickrInstance && flatpickrInstance.selectedDates.length > 0) {
        const d = flatpickrInstance.selectedDates[0];
        requestDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const pp1Qty = chkPP1 ? parseInt(document.getElementById('docPP1Qty').value) : 0;
    const pp7Qty = chkPP7 ? parseInt(document.getElementById('docPP7Qty').value) : 0;
    const otherQty = chkOther ? parseInt(document.getElementById('docOtherQty').value) : 0;
    const totalPhotos = pp1Qty + pp7Qty + otherQty;

    const payload = {
        student_id: currentStudent.id,
        request_date: requestDate,
        father_name: document.getElementById('fatherName').value.trim(),
        mother_name: document.getElementById('motherName').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        doc_pp1_qty: pp1Qty,
        doc_pp7_qty: pp7Qty,
        doc_other_text: chkOther ? document.getElementById('docOtherText').value.trim() : '',
        doc_other_qty: otherQty,
        purpose: document.getElementById('purpose').value.trim(),
        status: 'กำลังดำเนินการ'
    };

    try {
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data, error } = await db.from('regis_requests').insert([payload]).select().single();
        if (error) {
            if (error.code === '42501' || error.message.includes('row-level security')) {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่สามารถบันทึกได้',
                    html: `<p class="text-left">ระบบไม่สามารถบันทึกคำขอของคุณได้เนื่องจากข้อจำกัดด้านความปลอดภัย (RLS)</p>
                           <p class="text-left text-sm text-slate-600 mt-2">กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่า RLS Policy สำหรับตาราง <b>regis_requests</b></p>`,
                    confirmButtonText: 'รับทราบ'
                });
                return;
            } else {
                throw error;
            }
        }

        // ✅ คำนวณวันที่จะได้รับเอกสาร (request_date + 3 วัน)
        const receiveDate = new Date(requestDate);
        receiveDate.setDate(receiveDate.getDate() + 3);
        const receiveDateStr = receiveDate.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // ✅ ใช้รหัสคำขอ 8 ตัวแรก
        const requestCode = data.id.substring(0, 8).toUpperCase();

        // ✅ แสดง SweetAlert แจ้งรหัสคำขอ จำนวนรูป และวันที่รับ
        await Swal.fire({
            icon: 'info',
            title: '✅ ยื่นคำขอสำเร็จ',
            html: `
                <div class="text-left space-y-3">
                    <p><strong>รหัสคำขอของคุณคือ</strong> <span class="text-blue-600 font-bold text-lg">${requestCode}</span></p>
                    <p><strong>นักเรียนต้องส่งรูปถ่าย</strong> จำนวน <span class="text-blue-600 font-bold">${totalPhotos}</span> รูป</p>
                    <p><strong>จะได้รับเอกสารภายในวันที่</strong> <span class="text-emerald-600 font-bold">${receiveDateStr}</span></p>
                    <p class="text-sm text-slate-600 mt-3 border-t pt-3">
                        <i class="fa-solid fa-circle-info text-blue-500 mr-1"></i>
                        กรุณากรอกรหัสคำขอ พร้อมส่งรูปถ่ายและมารับเอกสารได้หลังจากวันที่ระบุ
                    </p>
                </div>
            `,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#4f46e5'
        });

        // ล้างฟอร์มบางส่วน
        document.getElementById('fatherName').value = '';
        document.getElementById('motherName').value = '';
        document.getElementById('phone').value = '';
        document.getElementById('purpose').value = '';
        document.getElementById('chkPP1').checked = false;
        document.getElementById('chkPP7').checked = false;
        document.getElementById('chkOther').checked = false;
        toggleInput('docPP1Qty', false);
        toggleInput('docPP7Qty', false);
        toggleInputOther(false);
        flatpickrInstance.setDate(new Date());

        // โหลดประวัติใหม่
        loadHistory();

    } catch (err) {
        console.error('Submit error:', err);
        Swal.fire('ข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
}

// ==========================================
// โหลดประวัติคำขอ (คอมเมนท์ปุ่ม PDF ไว้ก่อน)
// ==========================================
async function loadHistory() {
    try {
        const { data, error } = await db.from('regis_requests')
            .select('*')
            .eq('student_id', currentStudent.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('historyContainer');
        container.innerHTML = '';

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">ยังไม่มีประวัติการยื่นคำขอ</p>`;
            return;
        }

        data.forEach(req => {
            const dateObj = new Date(req.created_at);
            const dateStr = dateObj.toLocaleDateString('th-TH');
            
            const badgeColor = req.status === 'กำลังดำเนินการ' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
            const icon = req.status === 'กำลังดำเนินการ' ? 'fa-hourglass-half' : 'fa-check-circle';

            const card = document.createElement('div');
            card.className = 'p-3 rounded-xl border border-slate-100 bg-slate-50 shadow-sm relative';
            card.innerHTML = `
                <span class="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full ${badgeColor}">
                    <i class="fa-solid ${icon}"></i> ${req.status}
                </span>
                <p class="text-sm font-bold text-slate-700 mb-1">วันที่: ${dateStr}</p>
                <p class="text-xs text-slate-500 mb-2 truncate">วัตถุประสงค์: ${req.purpose}</p>
                <div class="flex gap-2">
                    <!-- ปุ่ม PDF ถูกคอมเมนท์ไว้ -->
                    <span class="text-xs text-slate-400 italic"></span>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error('Error loading history:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดประวัติคำขอได้', 'error');
    }
}

// ==========================================
// สร้าง PDF ด้วย html2pdf (คอมเมนท์ไว้ก่อน)
// ==========================================
/*
function generatePDF(reqData) {
    const template = document.getElementById('pdfTemplate');
    const student = currentStudent;
    const school = schoolInfo;

    const toThaiDate = (isoDate) => {
        if (!isoDate) return '-';
        const parts = isoDate.split('-');
        const d = parseInt(parts[2]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[0]) + 543;
        return `${d}/${m}/${y}`;
    };

    template.innerHTML = `
        <div style="font-family: 'Sarabun', 'TH Sarabun New', sans-serif; padding: 30px 40px; max-width: 800px; margin: 0 auto; background: white;">
            <div style="text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="margin:0; font-size: 24px; color: #0f172a;">ใบคำขอเอกสารงานทะเบียน</h2>
                <p style="margin:5px 0 0; font-size: 16px; color: #334155;">${school.school_name || 'โรงเรียน............................'}</p>
                <p style="margin:2px 0 0; font-size: 14px; color: #475569;">ปีการศึกษา ${school.academic_year || ''}</p>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <div><strong>เลขที่คำขอ:</strong> ${reqData.id.substring(0, 8).toUpperCase()}</div>
                <div><strong>วันที่:</strong> ${toThaiDate(reqData.request_date)}</div>
            </div>

            <div style="margin-top: 20px;">
                <p><strong>เรื่อง</strong> ขอเอกสารทางการศึกษา</p>
                <br>
                <p><strong>ข้าพเจ้า</strong> ${student.prefix || ''}${student.first_name} ${student.last_name}</p>
                <p><strong>ชื่อบิดา</strong> ${reqData.father_name} &nbsp;&nbsp; <strong>ชื่อมารดา</strong> ${reqData.mother_name}</p>
                <p><strong>เบอร์โทรติดต่อ</strong> ${reqData.phone}</p>
                <p><strong>มีความประสงค์ขอรับเอกสารดังนี้:</strong></p>
                <ul style="list-style-type: disc; padding-left: 30px;">
                    ${reqData.doc_pp1_qty > 0 ? `<li>ใบแสดงผลการเรียน (ปพ.1) จำนวน ${reqData.doc_pp1_qty} ฉบับ</li>` : ''}
                    ${reqData.doc_pp7_qty > 0 ? `<li>ใบรับรองการเป็นนักเรียน (ปพ.7) จำนวน ${reqData.doc_pp7_qty} ฉบับ</li>` : ''}
                    ${reqData.doc_other_qty > 0 ? `<li>${reqData.doc_other_text} จำนวน ${reqData.doc_other_qty} ฉบับ</li>` : ''}
                </ul>
                <p><strong>เพื่อนำไปใช้:</strong> ${reqData.purpose}</p>
            </div>

            <div style="margin-top: 50px; display: flex; justify-content: flex-end; text-align: center;">
                <div style="width: 250px;">
                    <p style="border-top: 1px solid #0f172a; padding-top: 5px;">ลงชื่อ .................................................. ผู้ยื่นคำขอ</p>
                    <p style="font-weight: bold; margin-top: -5px;">(${student.prefix || ''}${student.first_name} ${student.last_name})</p>
                </div>
            </div>
        </div>
    `;

    template.classList.remove('hidden');

    const opt = {
        margin:       0.5,
        filename:     `Request_${reqData.id.substring(0,8)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, letterRendering: true },
        jsPDF:        { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(template).save().then(() => {
        template.classList.add('hidden');
    }).catch(err => {
        console.error('PDF generation error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        template.classList.add('hidden');
    });
}
*/

// ==========================================
// ออกจากระบบ (logout)
// ==========================================
async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ออกจากระบบ',
        confirmButtonColor: '#dc2626'
    });
    if (result.isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}
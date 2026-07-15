let currentStudent = null;
let schoolInfo = null;

window.onload = async () => {
    await checkAuth();
};

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // ดึงข้อมูลปีการศึกษาจาก core_school_info (Single Source of Truth)
    const { data: sInfo } = await db.from('core_school_info').select('*').single();
    schoolInfo = sInfo;

    // หาข้อมูลนักเรียนจาก auth
    const { data: student } = await db.from('core_students')
        .select(`*, student_enrollments(student_number, core_classrooms(grade_level, room_number))`)
        .eq('user_id', session.user.id) // สมมติว่ามีฟิลด์ user_id ผูกกับ auth
        .single();
    
    if (!student) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลประวัตินักเรียนของคุณในระบบ', 'error');
        return;
    }
    
    currentStudent = student;
    document.getElementById('mainBody').classList.remove('hidden');
    
    setupUI();
    loadHistory();
}

function setupUI() {
    // ตั้งค่า Flatpickr แบบ พ.ศ.
    flatpickr("#requestDate", {
        locale: "th",
        defaultDate: new Date(),
        dateFormat: "d/m/Y",
        onChange: function(selectedDates, dateStr, instance) {
            // โลจิกแปลงเป็น พ.ศ. แสดงผล (ถ้าใช้แบบง่าย)
        }
    });

    // แสดงข้อมูลนักเรียน
    let classInfo = 'ยังไม่มีห้องเรียน';
    let stdNum = '-';
    if(currentStudent.student_enrollments && currentStudent.student_enrollments.length > 0) {
        const enroll = currentStudent.student_enrollments[0];
        classInfo = `${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}`;
        stdNum = enroll.student_number;
    }

    document.getElementById('studentInfoText').innerHTML = 
        `<b>ชื่อ-สกุล:</b> ${currentStudent.prefix}${currentStudent.first_name} ${currentStudent.last_name} <br>
         <b>ชั้น:</b> ${classInfo} &nbsp;&nbsp; <b>เลขที่:</b> ${stdNum} &nbsp;&nbsp; <b>รหัสประจำตัว:</b> ${currentStudent.student_id_card}`;
}

function toggleInput(inputId, isChecked) {
    const el = document.getElementById(inputId);
    el.disabled = !isChecked;
    if(!isChecked) el.value = '';
    if(isChecked) el.focus();
}

function toggleInputOther(isChecked) {
    toggleInput('docOtherText', isChecked);
    toggleInput('docOtherQty', isChecked);
}

async function submitRequest(e) {
    e.preventDefault();
    
    // ตรวจสอบเอกสารอย่างน้อย 1 รายการ
    const chkPP1 = document.getElementById('chkPP1').checked;
    const chkPP7 = document.getElementById('chkPP7').checked;
    const chkOther = document.getElementById('chkOther').checked;

    if(!chkPP1 && !chkPP7 && !chkOther) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกเอกสารที่ต้องการขออย่างน้อย 1 รายการ', 'warning');
        return;
    }

    const payload = {
        student_id: currentStudent.id,
        request_date: new Date().toISOString().split('T')[0],
        father_name: document.getElementById('fatherName').value,
        mother_name: document.getElementById('motherName').value,
        phone: document.getElementById('phone').value,
        doc_pp1_qty: chkPP1 ? parseInt(document.getElementById('docPP1Qty').value) : 0,
        doc_pp7_qty: chkPP7 ? parseInt(document.getElementById('docPP7Qty').value) : 0,
        doc_other_text: chkOther ? document.getElementById('docOtherText').value : '',
        doc_other_qty: chkOther ? parseInt(document.getElementById('docOtherQty').value) : 0,
        purpose: document.getElementById('purpose').value,
        status: 'กำลังดำเนินการ'
    };

    try {
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const { data, error } = await db.from('regis_requests').insert([payload]).select().single();
        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'ยื่นคำขอสำเร็จ',
            text: 'ระบบได้บันทึกคำขอของคุณเรียบร้อยแล้ว',
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-print"></i> พิมพ์ใบคำขอ (PDF)',
            cancelButtonText: 'ปิด'
        }).then((result) => {
            if (result.isConfirmed) generatePDF(data);
            document.getElementById('requestForm').reset();
            loadHistory();
        });

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

async function loadHistory() {
    const { data, error } = await db.from('regis_requests')
        .select('*')
        .eq('student_id', currentStudent.id)
        .order('created_at', { ascending: false });

    if (error) return;
    
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">ยังไม่มีประวัติการยื่นคำขอ</p>`;
        return;
    }

    data.forEach(req => {
        const dateObj = new Date(req.created_at);
        const dateStr = dateObj.toLocaleDateString('th-TH');
        
        const badgeColor = req.status === 'กำลังดำเนินการ' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
        const icon = req.status === 'กำลังดำเนินการ' ? 'fa-hourglass-half' : 'fa-check-circle';

        const card = `
            <div class="p-3 rounded-xl border border-slate-100 bg-slate-50 shadow-sm relative">
                <span class="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full ${badgeColor}">
                    <i class="fa-solid ${icon}"></i> ${req.status}
                </span>
                <p class="text-sm font-bold text-slate-700 mb-1">วันที่: ${dateStr}</p>
                <p class="text-xs text-slate-500 mb-2 truncate">วัตถุประสงค์: ${req.purpose}</p>
                <div class="flex gap-2">
                    <button onclick='generatePDF(${JSON.stringify(req)})' class="text-xs bg-blue-100 text-blue-600 hover:bg-blue-200 px-2 py-1 rounded">
                        <i class="fa-solid fa-file-pdf"></i> พิมพ์ใบคำขอ
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}

function generatePDF(reqData) {
    const template = document.getElementById('pdfTemplate');
    // โครงสร้างหน้าตา PDF อย่างง่าย
    template.innerHTML = `
        <div style="font-family: 'Sarabun', sans-serif; padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin:0;">ใบคำขอเอกสารงานทะเบียน</h2>
                <p style="margin:0;">โรงเรียน ${schoolInfo.school_name || '............................'}</p>
            </div>
            <p style="text-align: right;">วันที่ ${new Date(reqData.request_date).toLocaleDateString('th-TH')}</p>
            <p><b>เรื่อง</b> ขอเอกสารทางการศึกษา</p>
            <br>
            <p><b>ข้าพเจ้า</b> ${currentStudent.prefix}${currentStudent.first_name} ${currentStudent.last_name}</p>
            <p><b>ชื่อบิดา</b> ${reqData.father_name} <b>ชื่อมารดา</b> ${reqData.mother_name}</p>
            <p><b>เบอร์โทรติดต่อ</b> ${reqData.phone}</p>
            <p><b>มีความประสงค์ขอรับเอกสารดังนี้:</b></p>
            <ul>
                ${reqData.doc_pp1_qty > 0 ? `<li>ใบแสดงผลการเรียน (ปพ.1) จำนวน ${reqData.doc_pp1_qty} ฉบับ</li>` : ''}
                ${reqData.doc_pp7_qty > 0 ? `<li>ใบรับรองการเป็นนักเรียน (ปพ.7) จำนวน ${reqData.doc_pp7_qty} ฉบับ</li>` : ''}
                ${reqData.doc_other_qty > 0 ? `<li>${reqData.doc_other_text} จำนวน ${reqData.doc_other_qty} ฉบับ</li>` : ''}
            </ul>
            <p><b>เพื่อนำไปใช้:</b> ${reqData.purpose}</p>
            <br><br><br>
            <div style="text-align: right; margin-top: 50px;">
                <p>ลงชื่อ.......................................................ผู้ยื่นคำขอ</p>
                <p>(${currentStudent.prefix}${currentStudent.first_name} ${currentStudent.last_name})</p>
            </div>
        </div>
    `;
    
    template.classList.remove('hidden');
    
    const opt = {
        margin:       1,
        filename:     `Request_${reqData.id.substring(0,8)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(template).save().then(() => {
        template.classList.add('hidden');
    });
}

async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true,
        cancelButtonText: 'ยกเลิก', confirmButtonText: 'ออกจากระบบ'
    });
    if (result.isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}
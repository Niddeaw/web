// ============================================================
// government_trip_core.js — ฟังก์ชันกลาง (ฉบับสมบูรณ์)
// ============================================================

// ==========================================
// 1. Format วันที่
// ==========================================
window.formatTripDateThai = function (isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
};

window.formatTripDateThaiFull = function (isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `วันที่ ${d.getDate()} เดือน ${months[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
};

window.getTripThaiMonths = function () {
    return ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
};

// ==========================================
// 2. คำนวณวันเดินทาง
// ==========================================
window.calculateTripDays = function (startIso, endIso) {
    if (!startIso || !endIso) return 0;
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

window.calculateTripDaysWithHalfDay = function (startIso, endIso, isHalfDay) {
    if (isHalfDay) return 0.5;
    return window.calculateTripDays(startIso, endIso);
};

// ==========================================
// 3. อัปโหลดไฟล์ผ่าน GAS
// ==========================================
window.uploadTripFile = async function (file, folderId, gasUrl) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1];
            const payload = {
                action: 'upload',
                folderId: folderId,
                fileName: `trip_${Date.now()}_${file.name}`,
                base64: base64,
                mimeType: file.type
            };
            try {
                const response = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.status === 'success' && result.fileId) resolve(result.fileId);
                else reject(new Error(result.message || 'อัปโหลดไม่สำเร็จ'));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    });
};

// ==========================================
// 4. ตรวจสอบใบซ้ำ
// ==========================================
window.checkDuplicateTrip = async function (personnelId, title, startDate, endDate, excludeId = null) {
    try {
        let query = window.db
            .from('government_trip_requests')
            .select('id, status, title, start_date, end_date')
            .eq('personnel_id', personnelId)
            .eq('title', title)
            .eq('start_date', startDate)
            .eq('end_date', endDate)
            .neq('status', 'ไม่อนุมัติ');

        if (excludeId) query = query.neq('id', excludeId);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return { exists: !!data, existingTrip: data };
    } catch (err) {
        console.error('checkDuplicateTrip error:', err);
        return { exists: false, existingTrip: null };
    }
};

// ==========================================
// 5. Category helpers
// ==========================================
window.getTripPersonnelCategory = function (trip, allDeptHeads) {
    const pos = trip?.core_personnel?.position || trip?.position || '';
    const personnelId = trip?.personnel_id;

    const isHead = (allDeptHeads || []).some(h => h.personnel_id === personnelId);
    if (isHead) return 'head';

    const staffKeywords = [
        'เจ้าหน้าที่', 'พนักงานขับรถ', 'พนักงานบริการ',
        'พนักงานขับรถยนต์', 'พนักงานรักษาความปลอดภัย',
        'ลูกจ้าง', 'ลูกจ้างชั่วคราว', 'ลูกจ้างประจำ',
        'พนักงานธุรการ', 'พนักงานบริการทั่วไป',
        'พนักงานบริการโรงเรียน', 'ครูพี่เลี้ยงเด็กพิการ'
    ];
    if (staffKeywords.some(kw => pos.includes(kw))) return 'staff';

    if (pos.includes('ครู') || pos.includes('พนักงานราชการ')) return 'teacher';
    return 'staff';
};

// ครูในกลุ่ม → ต้องให้หัวหน้ากลุ่มสาระฯ รับทราบ
window.needsTripHeadAckByDept = function (trip, allDeptHeads) {
    const category = window.getTripPersonnelCategory(trip, allDeptHeads);
    if (category !== 'teacher') return false;
    const dept = trip.core_personnel?.department || trip.department;
    if (!dept) return false;
    const head = (allDeptHeads || []).find(h => h.department_name === dept);
    if (!head) return false;
    if (head.personnel_id === trip.personnel_id) return false;
    return true;
};

// หัวหน้ากลุ่มสาระฯ → ต้องให้รองวิชาการ รับทราบ
window.needsTripAcademicAckByLeave = function (trip, allDeptHeads) {
    const category = window.getTripPersonnelCategory(trip, allDeptHeads);
    return category === 'head';
};

// ==========================================
// 6. Dept Head Info
// ==========================================
window.getTripDeptHeadInfo = async function (userId) {
    if (!userId) return null;
    try {
        const { data, error } = await window.db
            .from('core_department_heads')
            .select('department_id, department_name')
            .eq('personnel_id', userId)
            .maybeSingle();
        if (error || !data) return null;
        return { personnel_id: userId, ...data };
    } catch (err) {
        console.warn('getTripDeptHeadInfo error:', err);
        return null;
    }
};

// ==========================================
// 7. รับทราบในฐานะหัวหน้ากลุ่มสาระฯ
// ==========================================
window.acknowledgeTripHead = async function (id) {
    const Swal = window.Swal;
    const currentUser = window.currentUser;
    const currentUserRole = window.currentUserRole;

    if (!currentUser) {
        Swal.fire('ไม่มีสิทธิ์', 'กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
    }

    const isSuperAdmin = currentUserRole === 'super_admin';

    const { data: trip, error: fetchError } = await window.db
        .from('government_trip_requests')
        .select('id, personnel_id, ack_head, core_personnel:personnel_id(department, role)')
        .eq('id', id)
        .single();
    if (fetchError) { Swal.fire('ผิดพลาด', fetchError.message, 'error'); return; }
    if (trip.ack_head) { Swal.fire('แจ้งเตือน', 'รายการนี้ถูกรับทราบแล้ว', 'info'); return; }

    let headInfo = null;
    if (!isSuperAdmin) {
        headInfo = await window.getTripDeptHeadInfo(currentUser.id);
        if (!headInfo) {
            Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ใช่หัวหน้ากลุ่มสาระฯ', 'error'); return;
        }
        const tripDept = trip.core_personnel?.department;
        if (tripDept !== headInfo.department_name) {
            Swal.fire('ไม่มีสิทธิ์', 'คุณไม่ใช่หัวหน้ากลุ่มสาระฯ ของครูท่านนี้', 'error'); return;
        }
        if (trip.personnel_id === currentUser.id) {
            Swal.fire('ไม่มีสิทธิ์', 'ไม่สามารถรับทราบใบของตัวเองได้', 'error'); return;
        }
    }

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customDate } = await Swal.fire({
        title: 'วันที่รับทราบ',
        text: 'ระบุวันที่ (ย้อนหลังได้) หรือกดตกลงเพื่อใช้วันนี้',
        input: 'date', inputValue: today,
        showCancelButton: true,
        confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customDate === undefined) return;

    const finalDate = customDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    let headPersonnelId = currentUser.id;
    let headDept = headInfo?.department_name || null;

    if (isSuperAdmin) {
        const tripDept = trip.core_personnel?.department;
        if (tripDept) {
            const { data: actualHead } = await window.db
                .from('core_department_heads')
                .select('personnel_id, department_name')
                .eq('department_name', tripDept)
                .maybeSingle();
            if (actualHead) {
                headPersonnelId = actualHead.personnel_id;
                headDept = actualHead.department_name;
            }
        }
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await window.db.from('government_trip_requests').update({
        ack_head: true,
        ack_head_at: finalDateTime,
        head_personnel_id: headPersonnelId,
        head_department: headDept,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }

    if (typeof window.logUserAction === 'function') {
        await window.logUserAction(`รับทราบใบไปราชการ (หัวหน้ากลุ่มฯ) ID: ${id}`, 'government_trip');
    }

    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: 'บันทึกการรับทราบเรียบร้อย' });

    if (typeof window.loadTripDashboardStats === 'function') await window.loadTripDashboardStats();
    if (typeof window.loadTripDeptHeadRequests === 'function') await window.loadTripDeptHeadRequests();
};

// ==========================================
// 8. รับทราบในฐานะรองวิชาการ
// ==========================================
window.acknowledgeTripAcademic = async function (id) {
    const Swal = window.Swal;
    const currentUser = window.currentUser;
    const currentUserRole = window.currentUserRole;

    if (!currentUser) {
        Swal.fire('ไม่มีสิทธิ์', 'กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
    }

    const isSuperAdmin = currentUserRole === 'super_admin';
    const academicPersonnelId = window.academicPersonnelId;

    const { data: trip, error: fetchError } = await window.db
        .from('government_trip_requests')
        .select('id, ack_academic')
        .eq('id', id)
        .single();

    if (fetchError) { Swal.fire('ผิดพลาด', fetchError.message, 'error'); return; }
    if (trip.ack_academic) { Swal.fire('แจ้งเตือน', 'รายการนี้ถูกรับทราบแล้ว', 'info'); return; }

    if (!isSuperAdmin && currentUser.id !== academicPersonnelId) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะรองผู้อำนวยการกลุ่มบริหารวิชาการ หรือ Super Admin เท่านั้น', 'error');
        return;
    }

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customDate } = await Swal.fire({
        title: 'วันที่รับทราบ (รองวิชาการ)',
        text: 'ระบุวันที่ (ย้อนหลังได้) หรือกดตกลงเพื่อใช้วันนี้',
        input: 'date', inputValue: today,
        showCancelButton: true,
        confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (customDate === undefined) return;

    const finalDate = customDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await window.db.from('government_trip_requests').update({
        ack_academic: true,
        ack_academic_at: finalDateTime,
        academic_personnel_id: academicPersonnelId || currentUser.id,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }

    if (typeof window.logUserAction === 'function') {
        await window.logUserAction(`รับทราบใบไปราชการ (รองวิชาการ) ID: ${id}`, 'government_trip');
    }

    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: 'บันทึกการรับทราบเรียบร้อย' });

    if (typeof window.loadTripDashboardStats === 'function') await window.loadTripDashboardStats();
};

// ==========================================
// 9. Helper: ตรวจสอบ ack_academic
// ==========================================
window.needsTripAcademicAck = function (trip, allDeptHeads) {
    return window.needsTripAcademicAckByLeave(trip, allDeptHeads);
};

// ==========================================
// 10. แก้ไขวันที่รับทราบ
// ==========================================
window.editTripAckDate = async function (tripId, field) {
    const Swal = window.Swal;
    const ALLOWED_FIELDS = ['ack_head', 'ack_academic', 'ack_admin', 'ack_deputy_hr'];
    if (!ALLOWED_FIELDS.includes(field)) return;

    const FIELD_LABELS = {
        ack_head: 'หัวหน้ากลุ่มสาระฯ',
        ack_academic: 'รอง ผอ.กลุ่มบริหารวิชาการ',
        ack_admin: 'แอดมิน',
        ack_deputy_hr: 'รอง ผอ.กลุ่มบริหารงานบุคคล'
    };

    const { data: trip, error } = await window.db
        .from('government_trip_requests').select('*').eq('id', tripId).single();
    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }

    if (!trip[field]) {
        Swal.fire('แจ้งเตือน', `ยังไม่มีการรับทราบจาก ${FIELD_LABELS[field]}`, 'info'); return;
    }

    const currentAckAt = trip[field + '_at'];
    const currentDateStr = currentAckAt
        ? new Date(currentAckAt).toLocaleDateString('sv-SE')
        : new Date().toLocaleDateString('sv-SE');

    const { value: newDate } = await Swal.fire({
        title: 'แก้ไขวันที่รับทราบ',
        html: `<p class="text-sm text-slate-500 mb-2">แก้ไขวันที่ <b>${FIELD_LABELS[field]}</b> รับทราบ</p>`,
        input: 'date', inputValue: currentDateStr,
        showCancelButton: true,
        confirmButtonColor: '#8b5cf6',
        confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก'
    });
    if (newDate === undefined) return;

    const finalDate = newDate || currentDateStr;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error: upErr } = await window.db.from('government_trip_requests').update({
        [field + '_at']: finalDateTime,
        updated_at: new Date().toISOString()
    }).eq('id', tripId);

    if (upErr) { Swal.fire('ผิดพลาด', upErr.message, 'error'); return; }

    if (typeof window.logUserAction === 'function') {
        await window.logUserAction(`แก้ไขวันที่รับทราบ ${FIELD_LABELS[field]} ID: ${tripId}`, 'government_trip');
    }

    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
        .fire({ icon: 'success', title: 'แก้ไขวันที่เรียบร้อย' });

    if (typeof window.loadTripDashboardStats === 'function') await window.loadTripDashboardStats();
    if (typeof window.loadTripDeptHeadRequests === 'function') await window.loadTripDeptHeadRequests();
};

// ==========================================
// 11. สร้าง PDF
// ==========================================
window.generateTripPDF = async function (id, systemSettings) {
    const db = window.db;
    const Swal = window.Swal;

    if (!systemSettings.gas_url || !systemSettings.slide_template_id || !systemSettings.pdf_folder_id) {
        let missing = [];
        if (!systemSettings.gas_url) missing.push('GAS URL');
        if (!systemSettings.slide_template_id) missing.push('Slide Template ID');
        if (!systemSettings.pdf_folder_id) missing.push('PDF Folder ID');
        Swal.fire('ตั้งค่าไม่สมบูรณ์', `กรุณาตั้งค่า ${missing.join(', ')} ก่อนพิมพ์ PDF`, 'warning');
        return false;
    }

    Swal.fire({
        title: 'กำลังสร้างไฟล์ PDF...',
        html: 'ระบบกำลังประมวลผลผ่าน GAS<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false, showConfirmButton: false
    });

    try {
        const { data: trip, error } = await db.from('government_trip_requests')
            .select('*, core_personnel(*)').eq('id', id).single();
        if (error) throw error;
        const p = trip.core_personnel;

        const { data: school } = await db.from('core_school_info').select('*').single();
        const directorName = school?.director_name || '...................................................';
        const deputyHrName = school?.deputy_hr || '...................................................';
        const deputyAcademicName = school?.deputy_academic || '...................................................';
        const schoolName = school?.school_name || '........................';

        // หัวหน้ากลุ่มสาระฯ
        let headName = '';
        const { data: headInfo } = await db.from('core_department_heads')
            .select('core_personnel!inner(prefix, first_name, last_name)')
            .eq('department_name', p.department)
            .maybeSingle();
        if (headInfo?.core_personnel) {
            const h = headInfo.core_personnel;
            headName = `${h.prefix || ''}${h.first_name} ${h.last_name}`;
        }

                const thMonths = window.getTripThaiMonths();
        const sDate = new Date(trip.start_date);
        const eDate = new Date(trip.end_date);
        const writeDate = trip.submitted_date ? new Date(trip.submitted_date) : new Date(trip.created_at);

        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const fullPosition = `${p.position || ''}${p.rank ? ' ' + p.rank : ''}${p.academic_standing ? ' ' + p.academic_standing : ''}`;

        // ==========================================
        // ✅ ดึงข้อมูลผู้ร่วมเดินทาง
        // ==========================================
        const companions = await window.fetchTripCompanions(trip);
        const companionHtml = window.buildCompanionsHtml(companions);

        // ==========================================
        // ✅ Helper: แปลง Time (HH:MM:SS) → "HH.MM น."
        // ==========================================
        const formatTime = (t) => {
            if (!t) return '-';
            const parts = String(t).split(':');
            return `${parts[0]}.${parts[1]} น.`;
        };

        // ==========================================
        // ✅ Helper: แปลงวันที่สำหรับแสดงในบริบทต่างๆ
        // ==========================================
        const fmtDateThai = (iso) => {
            if (!iso) return '-';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '-';
            return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
        };

        // ==========================================
        // ✅ Purpose (ความประสงค์)
        // ==========================================
        const purposeText = trip.purpose || '-';
        const purposeOtherText = trip.purpose_other || '';

        // ตัวเลือกติ๊กถูก/ไม่ติ๊กถูก สำหรับเช็คบ็อกซ์
        const checkPurpose = (val) => (trip.purpose === val ? '☑' : '☐');
        const checkPurposeMeeting = checkPurpose('เข้าร่วมประชุม/อบรม/สัมมนา');
        const checkPurposeStudy = checkPurpose('ศึกษาดูงาน');
        const checkPurposeSpeaker = checkPurpose('เป็นวิทยากร');
        const checkPurposeOther = checkPurpose('อื่นๆ');

        // ==========================================
        // ✅ Companion counts
        // ==========================================
        const companionTotal = companions.total || 1;
        const companionTeachersCount = companions.teachers.length;
        const companionStudentsCount = companions.students.length;
        const hasCompanions = companionTotal > 1;
        const hasCompanionsText = hasCompanions ? 'มี' : 'ไม่มี';

        // ==========================================
        // ✅ Companion: รายชื่อครู (comma-separated)
        // ==========================================
        const companionTeachersNames = companions.teachers.length > 0
            ? companions.teachers.map(t => t.name).join(', ')
            : '-';

        // ==========================================
        // ✅ Companion: รายชื่อนักเรียน (comma-separated)
        // ==========================================
        const companionStudentsNames = companions.students.length > 0
            ? companions.students.map(s => `${s.name} (${s.class_text})`).join(', ')
            : '-';

        // ==========================================
        // ✅ Doc date
        // ==========================================
        const docDateText = trip.doc_date ? fmtDateThai(trip.doc_date) : '-';

        // ==========================================
        // ✅ Depart / Return
        // ==========================================
        const departFromDateText = trip.depart_from_date ? fmtDateThai(trip.depart_from_date) : '-';
        const returnToDateText = trip.return_to_date ? fmtDateThai(trip.return_to_date) : '-';
        const departFromTimeText = formatTime(trip.depart_from_time);
        const returnToTimeText = formatTime(trip.return_to_time);

        // ==========================================
        // ✅ Req (ขอความอนุเคราะห์)
        // ==========================================
        const reqOfficialText = trip.req_official_letter ? '☑' : '☐';
        const reqParentText = trip.req_parent_notice ? '☑' : '☐';
        const reqTravelExpenseText = trip.req_travel_expense ? '☑' : '☐';
        const reqSchoolCarText = trip.req_school_car ? '☑' : '☐';
        const reqOtherText = trip.req_other ? '☑' : '☐';
        const travelExpenseAmountText = trip.travel_expense_amount
            ? Number(trip.travel_expense_amount).toLocaleString('th-TH')
            : '-';
        const reqOtherDetail = trip.req_other_text || '';

        // ==========================================
        // ✅ REPLACEMENTS
        // ==========================================
        const replacements = {
            // ---------- วันที่เขียนใบ ----------
            '{{W_DAY}}': writeDate.getDate().toString(),
            '{{W_MONTH}}': thMonths[writeDate.getMonth()],
            '{{W_YEAR}}': (writeDate.getFullYear() + 543).toString(),
            '{{WRITE_DATE}}': `${writeDate.getDate()} ${thMonths[writeDate.getMonth()]} ${writeDate.getFullYear() + 543}`,

            // ---------- วันเริ่ม/สิ้นสุด ----------
            '{{START_D}}': sDate.getDate().toString(),
            '{{START_M}}': thMonths[sDate.getMonth()],
            '{{START_Y}}': (sDate.getFullYear() + 543).toString(),
            '{{END_D}}': eDate.getDate().toString(),
            '{{END_M}}': thMonths[eDate.getMonth()],
            '{{END_Y}}': (eDate.getFullYear() + 543).toString(),
            '{{START_DATE}}': window.formatTripDateThai(trip.start_date),
            '{{END_DATE}}': window.formatTripDateThai(trip.end_date),
            '{{TOTAL_DAYS}}': trip.total_days.toString(),

            // ---------- โรงเรียน / ผู้ขอ ----------
            '{{SCHOOL_NAME}}': schoolName,
            '{{FULL_NAME}}': fullName,
            '{{POSITION}}': p.position || '-',
            '{{RANK}}': p.rank || '',
            '{{ACADEMIC_STANDING}}': p.academic_standing || '',
            '{{FULL_POSITION}}': fullPosition,
            '{{DEPARTMENT}}': p.department || '-',

            // ---------- ความประสงค์ ----------
            '{{PURPOSE}}': purposeText,
            '{{PURPOSE_OTHER}}': purposeOtherText,
            '{{CHECK_PURPOSE_MEETING}}': checkPurposeMeeting,
            '{{CHECK_PURPOSE_STUDY}}': checkPurposeStudy,
            '{{CHECK_PURPOSE_SPEAKER}}': checkPurposeSpeaker,
            '{{CHECK_PURPOSE_OTHER}}': checkPurposeOther,

            // ---------- รายละเอียดการไป ----------
            '{{TRIP_TYPE}}': trip.trip_type || 'ไปราชการ',
            '{{TITLE}}': trip.title,
            '{{OBJECTIVE}}': trip.objective || '-',
            '{{LOCATION}}': trip.location || '-',

            // ---------- หนังสือราชการ ----------
            '{{DOC_NUMBER}}': trip.doc_number || '-',
            '{{DOC_DATE}}': docDateText,

            // ---------- การเดินทาง ----------
            '{{TRAVEL_BY}}': trip.travel_by || '-',
            '{{TRAVEL_VEHICLE}}': trip.travel_vehicle || '-',
            '{{VEHICLE}}': trip.vehicle_registration || '-',
            '{{DEPART_FROM_DATE}}': departFromDateText,
            '{{DEPART_FROM_TIME}}': departFromTimeText,
            '{{RETURN_TO_DATE}}': returnToDateText,
            '{{RETURN_TO_TIME}}': returnToTimeText,

            // ---------- งบประมาณ ----------
            '{{BUDGET_SOURCE}}': trip.budget_source || '-',
            '{{BUDGET_AMOUNT}}': trip.budget_amount
                ? Number(trip.budget_amount).toLocaleString('th-TH')
                : '-',

            // ---------- ขอความอนุเคราะห์ ----------
            '{{REQ_OFFICIAL_LETTER}}': reqOfficialText,
            '{{REQ_PARENT_NOTICE}}': reqParentText,
            '{{REQ_TRAVEL_EXPENSE}}': reqTravelExpenseText,
            '{{TRAVEL_EXPENSE_AMOUNT}}': travelExpenseAmountText,
            '{{REQ_SCHOOL_CAR}}': reqSchoolCarText,
            '{{REQ_OTHER}}': reqOtherText,
            '{{REQ_OTHER_TEXT}}': reqOtherDetail,

            // ---------- ติดต่อ ----------
            '{{CONTACT_PHONE}}': trip.contact_phone || '-',
            '{{CONTACT_ADDRESS}}': trip.contact_address || '-',

            // ---------- ผู้ร่วมเดินทาง (Companions) ----------
            '{{HAS_COMPANIONS}}': hasCompanionsText,
            '{{COMPANION_COUNT}}': companionTotal.toString(),
            '{{COMPANION_TEACHERS_COUNT}}': companionTeachersCount.toString(),
            '{{COMPANION_STUDENTS_COUNT}}': companionStudentsCount.toString(),
            '{{COMPANION_TEACHERS_NAMES}}': companionTeachersNames,
            '{{COMPANION_STUDENTS_NAMES}}': companionStudentsNames,
            '{{COMPANION_LIST_HTML}}': companionHtml,

            // ---------- ผู้ลงนาม ----------
            '{{HEAD_NAME}}': headName || '...................................................',
            '{{DEPUTY_ACADEMIC_NAME}}': deputyAcademicName,
            '{{DEPUTY_HR_NAME}}': deputyHrName,
            '{{DIRECTOR_NAME}}': directorName,

            // ---------- ลายเซ็น ----------
            '{{PERSONNEL_SIGNATURE_IMAGE}}': p.signature_file_id
                ? `https://drive.google.com/uc?id=${p.signature_file_id}`
                : ''
        };

        const payload = {
            action: 'generate_pdf',
            templateId: systemSettings.slide_template_id,
            pdfFolderId: systemSettings.pdf_folder_id,
            fileName: `ใบไปราชการ_${p.first_name}_${trip.start_date.replace(/-/g, '')}`,
            replacements
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(systemSettings.gas_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const rawText = await response.text();
        let result;
        try { result = JSON.parse(rawText); }
        catch (e) { throw new Error('GAS ตอบกลับไม่ใช่ JSON: ' + rawText.substring(0, 200)); }

        if (result && result.status === 'success' && result.url) {
            await db.from('government_trip_requests').update({ pdf_url: result.url }).eq('id', id);
            if (window.logUserAction) await window.logUserAction(`สร้าง PDF ใบไปราชการ ID: ${id}`, 'government_trip');
            Swal.close();
            window.open(result.url, '_blank');
            return true;
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }
    } catch (err) {
        console.error('generateTripPDF Error:', err);
        let errorMsg = err.message;
        if (err.name === 'AbortError') errorMsg = 'การเชื่อมต่อหมดเวลา (30 วินาที) กรุณาลองใหม่';
        Swal.fire('ผิดพลาด', errorMsg, 'error');
        return false;
    }
};

// ==========================================
// ✅ Helper: ดึงข้อมูลผู้ร่วมเดินทาง
// ==========================================
window.fetchTripCompanions = async function (trip) {
    const result = { teachers: [], students: [], total: 0 };
    
    try {
        // 1. ดึงครู
        const teacherIds = Array.isArray(trip.companion_teachers) ? trip.companion_teachers : [];
        if (teacherIds.length > 0) {
            const { data: teachers } = await window.db.from('core_personnel')
                .select('id, prefix, first_name, last_name, position, department')
                .in('id', teacherIds);
            
            // เรียงตามลำดับที่เลือกไว้
            result.teachers = teacherIds
                .map(id => (teachers || []).find(t => t.id === id))
                .filter(Boolean)
                .map(t => ({
                    id: t.id,
                    name: `${t.prefix || ''}${t.first_name} ${t.last_name}`,
                    position: t.position || '',
                    department: t.department || ''
                }));
        }
        
        // 2. ดึงนักเรียน + enrollment ปัจจุบัน
        const studentIds = Array.isArray(trip.companion_students) ? trip.companion_students : [];
        if (studentIds.length > 0) {
            // ดึง core_students
            const { data: students } = await window.db.from('core_students')
                .select('id, prefix, first_name, last_name, student_id_card')
                .in('id', studentIds);
            
            // ดึง enrollment ล่าสุดของแต่ละคน
            const { data: enrolls } = await window.db.from('student_enrollments')
                .select(`
                    student_id, student_number,
                    core_classrooms(grade_level, room_number),
                    academic_year, semester
                `)
                .in('student_id', studentIds)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false });
            
            const enrollMap = {};
            (enrolls || []).forEach(e => {
                if (!enrollMap[e.student_id]) enrollMap[e.student_id] = e;
            });
            
            result.students = studentIds
                .map(id => (students || []).find(s => s.id === id))
                .filter(Boolean)
                .map(s => {
                    const enr = enrollMap[s.id];
                    const cls = enr?.core_classrooms;
                    return {
                        id: s.id,
                        name: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                        student_id_card: s.student_id_card || '',
                        class_text: cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
                        student_number: enr?.student_number || '-'
                    };
                });
        }
        
        result.total = 1 + result.teachers.length + result.students.length;
        return result;
    } catch (err) {
        console.error('fetchTripCompanions error:', err);
        return result;
    }
};

// ==========================================
// ✅ Helper: สร้าง HTML รายชื่อ (สำหรับ PDF)
// ==========================================
window.buildCompanionsHtml = function (companions) {
    if (!companions || companions.total <= 1) return '';
    
    let html = '';
    
    // ส่วนที่ 1: ครู
    if (companions.teachers.length > 0) {
        html += `<div style="margin-top:8px;padding:6px;background:#f0f9ff;border-left:3px solid #0ea5e9;border-radius:4px;">
            <div style="font-weight:bold;font-size:12px;color:#0369a1;margin-bottom:4px;">
                👨‍🏫 ครูผู้ร่วมเดินทาง (${companions.teachers.length} คน)
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#e0f2fe;">
                    <th style="padding:3px;border:1px solid #bae6fd;text-align:center;width:40px;">ที่</th>
                    <th style="padding:3px;border:1px solid #bae6fd;text-align:left;">ชื่อ-สกุล</th>
                    <th style="padding:3px;border:1px solid #bae6fd;text-align:left;">ตำแหน่ง/กลุ่มสาระ</th>
                </tr></thead>
                <tbody>`;
        companions.teachers.forEach((t, idx) => {
            html += `<tr>
                <td style="padding:3px;border:1px solid #e0f2fe;text-align:center;">${idx + 1}</td>
                <td style="padding:3px;border:1px solid #e0f2fe;">${t.name}</td>
                <td style="padding:3px;border:1px solid #e0f2fe;">${t.position}${t.department ? ` (${t.department})` : ''}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // ส่วนที่ 2: นักเรียน
    if (companions.students.length > 0) {
        html += `<div style="margin-top:8px;padding:6px;background:#f0fdf4;border-left:3px solid #10b981;border-radius:4px;">
            <div style="font-weight:bold;font-size:12px;color:#065f46;margin-bottom:4px;">
                🎓 นักเรียนผู้ร่วมเดินทาง (${companions.students.length} คน)
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#d1fae5;">
                    <th style="padding:3px;border:1px solid #a7f3d0;text-align:center;width:40px;">ที่</th>
                    <th style="padding:3px;border:1px solid #a7f3d0;text-align:left;">ชื่อ-สกุล</th>
                    <th style="padding:3px;border:1px solid #a7f3d0;text-align:center;width:80px;">ชั้น</th>
                    <th style="padding:3px;border:1px solid #a7f3d0;text-align:center;width:60px;">เลขที่</th>
                </tr></thead>
                <tbody>`;
        companions.students.forEach((s, idx) => {
            html += `<tr>
                <td style="padding:3px;border:1px solid #d1fae5;text-align:center;">${idx + 1}</td>
                <td style="padding:3px;border:1px solid #d1fae5;">${s.name}</td>
                <td style="padding:3px;border:1px solid #d1fae5;text-align:center;">${s.class_text}</td>
                <td style="padding:3px;border:1px solid #d1fae5;text-align:center;">${s.student_number}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    return html;
};

console.log('✅ government_trip_core.js loaded (ฉบับสมบูรณ์ + academic ack)');
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

        const replacements = {
            '{{W_DAY}}': writeDate.getDate().toString(),
            '{{W_MONTH}}': thMonths[writeDate.getMonth()],
            '{{W_YEAR}}': (writeDate.getFullYear() + 543).toString(),
            '{{START_D}}': sDate.getDate().toString(),
            '{{START_M}}': thMonths[sDate.getMonth()],
            '{{START_Y}}': (sDate.getFullYear() + 543).toString(),
            '{{END_D}}': eDate.getDate().toString(),
            '{{END_M}}': thMonths[eDate.getMonth()],
            '{{END_Y}}': (eDate.getFullYear() + 543).toString(),
            '{{START_DATE}}': window.formatTripDateThai(trip.start_date),
            '{{END_DATE}}': window.formatTripDateThai(trip.end_date),
            '{{TOTAL_DAYS}}': trip.total_days.toString(),
            '{{SCHOOL_NAME}}': schoolName,
            '{{FULL_NAME}}': fullName,
            '{{POSITION}}': p.position || '-',
            '{{FULL_POSITION}}': fullPosition,
            '{{DEPARTMENT}}': p.department || '-',
            '{{TRIP_TYPE}}': trip.trip_type || 'ไปราชการ',
            '{{TITLE}}': trip.title,
            '{{OBJECTIVE}}': trip.objective || '-',
            '{{LOCATION}}': trip.location || '-',
            '{{TRAVEL_BY}}': trip.travel_by || '-',
            '{{VEHICLE}}': trip.vehicle_registration || '-',
            '{{BUDGET_SOURCE}}': trip.budget_source || '-',
            '{{BUDGET_AMOUNT}}': trip.budget_amount ? Number(trip.budget_amount).toLocaleString('th-TH') : '-',
            '{{CONTACT_PHONE}}': trip.contact_phone || '-',
            '{{CONTACT_ADDRESS}}': trip.contact_address || '-',
            '{{HEAD_NAME}}': headName || '...................................................',
            '{{DEPUTY_ACADEMIC_NAME}}': deputyAcademicName,
            '{{DEPUTY_HR_NAME}}': deputyHrName,
            '{{DIRECTOR_NAME}}': directorName,
            '{{PERSONNEL_SIGNATURE_IMAGE}}': p.signature_file_id ? `https://drive.google.com/uc?id=${p.signature_file_id}` : ''
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

console.log('✅ government_trip_core.js loaded (ฉบับสมบูรณ์ + academic ack)');
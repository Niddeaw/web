// ============================================================
// leave_core.js — ฟังก์ชันกลางระบบการลา (ใช้ร่วมกันทุกไฟล์)
// ============================================================
// ประกาศฟังก์ชันเป็น global เพื่อให้ไฟล์อื่นเรียกใช้ได้

// ==========================================
// 1. ฟังก์ชันหาเพศจากคำนำหน้า
// ==========================================
window.getGenderFromPrefix = function (prefix) {
    if (!prefix) return 'unknown';
    const malePrefixes = ['นาย', 'ว่าที่ ร.ต.', 'ร.ต.', 'ด.ต.', 'ว่าที่', 'สามเณร', 'พระ', 'หม่อมหลวง'];
    const femalePrefixes = ['นางสาว', 'นาง', 'น.ส.', 'หม่อมหลวงหญิง'];
    if (malePrefixes.some(male => prefix.includes(male) || prefix === male)) return 'ชาย';
    if (femalePrefixes.some(female => prefix.includes(female) || prefix === female)) return 'หญิง';
    return 'unknown';
};

// ==========================================
// 2. คำนวณวันลาตามประเภท (แบบเดิม ใช้เป็นฟอลแบ็ก)
// ==========================================
window.calculateDaysByType = function (startIso, endIso, type) {
    if (!startIso || !endIso || !type) return 0;
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    if (endDate < startDate) return 0;
    let count = 0;
    let curDate = new Date(startDate);
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        if (type === 'ลาคลอดบุตร') {
            count++;
        } else {
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    return count;
};

// ==========================================
// 2.1 คำนวณวันลาตามประเภท (รองรับวันหยุดของโรงเรียน) — ผ่าน RPC
// ==========================================
window.calculateDaysByTypeWithHoliday = async function (startIso, endIso, type) {
    if (!startIso || !endIso || !type) return 0;

    try {
        // เรียกใช้ RPC function ที่สร้างใน Supabase
        const { data, error } = await window.db.rpc('calculate_leave_days', {
            p_start_date: startIso,
            p_end_date: endIso,
            p_leave_type: type
        });

        if (error) throw error;
        return data || 0;
    } catch (err) {
        console.warn('RPC คำนวณวันลาล้มเหลว ใช้ฟังก์ชันสำรอง (ไม่นับวันหยุด):', err);
        // Fallback ไปใช้ฟังก์ชันเดิมที่ไม่นับวันหยุด
        return window.calculateDaysByType(startIso, endIso, type);
    }
};

// ==========================================
// 3. คำนวณวันลารวมกับตัวเลือกครึ่งวัน (เวอร์ชันใหม่ รองรับวันหยุด)
// ==========================================
window.calculateDaysWithHalfDay = async function (startIso, endIso, type, isHalfDay) {
    if (isHalfDay) {
        return 0.5;
    }
    // เรียกใช้ฟังก์ชันที่รองรับวันหยุด
    return await window.calculateDaysByTypeWithHoliday(startIso, endIso, type);
};

// ==========================================
// 4. แปลงวันที่เป็นภาษาไทย (แบบสั้น)
// ==========================================
window.formatDateThai = function (isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
};

window.formatDateThaiFull = function (isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `วันที่ ${d.getDate()} เดือน ${months[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
};

// ==========================================
// 5. รายชื่อเดือนภาษาไทย
// ==========================================
window.getThaiMonths = function () {
    return ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
};

// ==========================================
// 6. สลับไปโหมดครู
// ==========================================
window.switchToTeacherMode = function () {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'สลับเป็นโหมดครูผู้สอน',
        showConfirmButton: false,
        timer: 1000,
        timerProgressBar: true
    });
    setTimeout(() => {
        window.location.href = 'leave_teacher.html';
    }, 500);
};

// ==========================================
// 7. สลับไปโหมดแอดมิน (ตรวจสอบสิทธิ์)
// ==========================================
window.switchToAdminMode = function () {
    const isAdmin = window.isAdminUser?.(window.currentProfile?.role, false);
    const isModuleAdmin = window.isModuleAdmin || false;
    if (!isAdmin && !isModuleAdmin) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้น', 'error');
        return;
    }
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'สลับเป็นโหมดผู้ดูแลระบบ',
        showConfirmButton: false,
        timer: 1000,
        timerProgressBar: true
    });
    setTimeout(() => {
        window.location.href = 'leave_admin.html';
    }, 500);
};

// ==========================================
// 8. อัปโหลดไฟล์หลักฐาน (evidence) ผ่าน GAS
// ==========================================
window.uploadEvidenceFile = async function (file, folderId, gasUrl) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1];
            const payload = {
                action: 'upload',
                folderId: folderId,
                fileName: `evidence_${Date.now()}_${file.name}`,
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
                if (result.status === 'success' && result.fileId) {
                    resolve(result.fileId);
                } else {
                    reject(new Error(result.message || 'อัปโหลดไม่สำเร็จ'));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = function () {
            reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
        };
    });
};

// ==========================================
// 9. สร้าง PDF ใบลา (ฟังก์ชันหลัก) พร้อมลายเซ็น, ครึ่งวัน, วันที่ย้อนหลัง
// ==========================================
window.generateLeavePDF = async function (id, systemSettings) {
    const db = window.db;
    const Swal = window.Swal;
    if (!systemSettings.gas_url || !systemSettings.slide_template_id || !systemSettings.pdf_folder_id) {
        let missing = [];
        if (!systemSettings.gas_url) missing.push('GAS URL');
        if (!systemSettings.slide_template_id) missing.push('Slide Template ID');
        if (!systemSettings.pdf_folder_id) missing.push('PDF Folder ID');
        Swal.fire('ตั้งค่าไม่สมบูรณ์', `กรุณาตั้งค่า ${missing.join(', ')} ในเมนู "ตั้งค่าระบบ" ก่อนพิมพ์ PDF`, 'warning');
        return false;
    }

    Swal.fire({
        title: 'กำลังสร้างไฟล์ PDF...',
        html: 'ระบบกำลังดึงข้อมูลและประมวลผลผ่านระบบส่วนกลาง<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    try {
        const { data: leave, error } = await db.from('leave_requests')
            .select('*, core_personnel(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        const p = leave.core_personnel;

        const { data: school } = await db.from('core_school_info').select('*').single();
        const directorName = school?.director_name || '...................................................';
        const schoolName = school?.school_name || '........................';
        const deputyAcademicName = school?.deputy_academic || '...................................................';

        // ---- คำนวณ commander (หัวหน้ากลุ่ม/รองวิชาการ) ----
        let commanderName = '', commanderPosition = '';
        const isDeputyDirector = p.position?.startsWith('รองผู้อำนวยการ');
        if (isDeputyDirector) {
            commanderName = '';
            commanderPosition = '';
        } else {
            const { data: isHead } = await db.from('core_department_heads')
                .select('department_id, department_name')
                .eq('personnel_id', p.id)
                .maybeSingle();
            if (isHead) {
                commanderName = deputyAcademicName;
                commanderPosition = 'รองผู้อำนวยการกลุ่มบริหารวิชาการ';
            } else {
                const { data: headPerson } = await db.from('core_department_heads')
                    .select('core_personnel!inner(prefix, first_name, last_name)')
                    .eq('department_name', p.department)
                    .maybeSingle();
                if (headPerson?.core_personnel) {
                    const head = headPerson.core_personnel;
                    commanderName = `${head.prefix || ''}${head.first_name} ${head.last_name}`;
                    commanderPosition = `หัวหน้ากลุ่มสาระการเรียนรู้${p.department || ''}`;
                } else {
                    commanderName = '...................................................';
                    commanderPosition = '...................................................';
                }
            }
        }

        // ---- ดึง signature_file_id ของบุคลากรที่ลา ----
        const personnelSignatureFileId = p.signature_file_id || null;

        // ---- ดึง signature_file_id ของ commander (ถ้ามี) ----
        let commanderSignatureFileId = null;
        if (commanderName && commanderName !== '...................................................') {
            const cleanName = commanderName.replace(/^(นาย|นางสาว|นาง|ด.ต.|ร.ต.|ว่าที่ ร.ต.|พระ|สามเณร|หม่อมหลวง|หม่อมหลวงหญิง)\s*/, '');
            const nameParts = cleanName.split(' ');
            let query = db.from('core_personnel').select('id, signature_file_id');
            if (nameParts.length >= 2) {
                query = query.or(`first_name.ilike.%${nameParts[0]}%,last_name.ilike.%${nameParts[1]}%`);
            } else {
                query = query.ilike('first_name', `%${cleanName}%`);
            }
            const { data: commanderData } = await query.maybeSingle();
            if (commanderData && commanderData.signature_file_id) {
                commanderSignatureFileId = commanderData.signature_file_id;
            }
        }

        // ---- คำนวณสถิติการลา ----
        const { data: allLeavesStats, error: statsError } = await db.from('leave_requests')
            .select('type, total_days, id, created_at, start_date, end_date, is_half_day')
            .eq('personnel_id', leave.personnel_id)
            .eq('fiscal_year', leave.fiscal_year)
            .neq('status', 'ไม่อนุมัติ')
            .lte('created_at', leave.created_at);
        if (statsError) throw statsError;

        const statsData = {
            sick: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            personal: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            maternity: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            other: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } }
        };
        for (const l of allLeavesStats) {
            const isCurrent = (l.id === leave.id);
            let category = null;
            if (l.type === 'ลาป่วย') category = 'sick';
            else if (l.type === 'ลากิจส่วนตัว') category = 'personal';
            else if (l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') category = 'maternity';
            else category = 'other';
            if (!category) continue;
            const dayCount = l.is_half_day ? 0.5 : l.total_days;
            if (isCurrent) {
                statsData[category].now.count = 1;
                statsData[category].now.days = dayCount;
            } else {
                statsData[category].prior.count += 1;
                statsData[category].prior.days += dayCount;
            }
        }
        for (const cat of ['sick', 'personal', 'maternity', 'other']) {
            statsData[cat].total.count = statsData[cat].prior.count + statsData[cat].now.count;
            statsData[cat].total.days = statsData[cat].prior.days + statsData[cat].now.days;
        }

        // ---- เตรียมข้อมูลสำหรับแทนที่ ----
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const position = p.position || 'ครู';
        const rank = p.rank || '';
        const academicStanding = p.academic_standing || '';
        const fullPosition = `${position}${rank ? ' ' + rank : ''}${academicStanding ? ' ' + academicStanding : ''}`;

        const thMonths = window.getThaiMonths();

        // วันที่ส่ง (ใช้ submitted_date ถ้ามี ถ้าไม่ใช้ created_at)
        let writeDateObj;
        if (leave.submitted_date) {
            writeDateObj = new Date(leave.submitted_date);
        } else {
            writeDateObj = new Date(leave.created_at);
        }
        const strWriteDate = `วันที่ ${writeDateObj.getDate()} เดือน ${thMonths[writeDateObj.getMonth()]} พ.ศ. ${writeDateObj.getFullYear() + 543}`;

        const approvedCheck = leave.status === 'อนุมัติ' ? '✓' : '';

        // วันที่เริ่มต้นและสิ้นสุด
        const sDate = new Date(leave.start_date);
        const eDate = new Date(leave.end_date);

        const leaveType = leave.type;
        const isSick = leaveType === 'ลาป่วย';
        const isPersonal = leaveType === 'ลากิจส่วนตัว';
        const isMaternity = leaveType === 'ลาคลอดบุตร';
        const isOther = !isSick && !isPersonal && !isMaternity;

        const checkSick = isSick ? '✓' : '';
        const checkPersonal = isPersonal ? '✓' : '';
        const checkMaternity = isMaternity ? '✓' : '';
        const checkOther = isOther ? '✓' : '';

        let reasonRed = '', reasonBlue = '';
        if (isSick || isPersonal) reasonRed = leave.reason;
        else reasonBlue = leave.reason;

        const leaveTypeForTitle = leaveType;
        const leaveTypeForOther = isOther ? leaveType : '';

        // ---- ข้อมูลการลาครั้งก่อน ----
        const previousLeaves = allLeavesStats.filter(l => l.id !== leave.id);
        let lastLeave = null;
        if (previousLeaves.length > 0) {
            previousLeaves.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            lastLeave = previousLeaves[0];
        }
        let lastStartDate = '', lastEndDate = '', lastTotalDays = '';
        let lastCheckSick = '', lastCheckPersonal = '', lastCheckMaternity = '';
        let lastLeaveTypeName = '';
        let lastStartD = '', lastStartM = '', lastStartY = '';
        let lastEndD = '', lastEndM = '', lastEndY = '';
        if (lastLeave && lastLeave.start_date && lastLeave.end_date) {
            const start = new Date(lastLeave.start_date);
            const end = new Date(lastLeave.end_date);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                lastStartDate = window.formatDateThai(lastLeave.start_date);
                lastEndDate = window.formatDateThai(lastLeave.end_date);
                lastTotalDays = (lastLeave.is_half_day ? 0.5 : lastLeave.total_days).toString();
                if (lastLeave.type === 'ลาป่วย') lastCheckSick = '✓';
                else if (lastLeave.type === 'ลากิจส่วนตัว') lastCheckPersonal = '✓';
                else if (lastLeave.type === 'ลาคลอดบุตร' || lastLeave.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') lastCheckMaternity = '✓';
                else lastLeaveTypeName = lastLeave.type;
                lastStartD = start.getDate().toString();
                lastStartM = thMonths[start.getMonth()];
                lastStartY = (start.getFullYear() + 543).toString();
                lastEndD = end.getDate().toString();
                lastEndM = thMonths[end.getMonth()];
                lastEndY = (end.getFullYear() + 543).toString();
            }
        }

        // ---- ดึงวันที่รับทราบ (แบบเต็ม) ----
        const ackAdminAt = leave.ack_admin_at ? window.formatDateThaiFull(leave.ack_admin_at) : '-';
        const ackDeputyAt = leave.ack_deputy_at ? window.formatDateThaiFull(leave.ack_deputy_at) : '-';
        const ackDirectorAt = leave.ack_director_at ? window.formatDateThaiFull(leave.ack_director_at) : '-';

        // วันที่อนุมัติ (แบบเต็ม)
        const approvedDateDisplay = leave.approved_date
            ? window.formatDateThaiFull(leave.approved_date)
            : (leave.approved_at ? window.formatDateThaiFull(leave.approved_at) : '-');

        // ---- ตัวแปรแสดงครึ่งวัน ----
        const isHalfDay = leave.is_half_day || false;
        const totalDaysDisplay = isHalfDay ? '0.5 (ครึ่งวัน)' : leave.total_days + ' วัน';
        const halfDayCheck = isHalfDay ? '✓' : '';

        // ---- เตรียม Replacements ----
        const replacements = {
            // วันที่เขียน (ส่ง)
            "{{W_DAY}}": writeDateObj.getDate().toString(),
            "{{W_MONTH}}": thMonths[writeDateObj.getMonth()],
            "{{W_YEAR}}": (writeDateObj.getFullYear() + 543).toString(),
            "{{START_D}}": sDate.getDate().toString(),
            "{{START_M}}": thMonths[sDate.getMonth()],
            "{{START_Y}}": (sDate.getFullYear() + 543).toString(),
            "{{END_D}}": eDate.getDate().toString(),
            "{{END_M}}": thMonths[eDate.getMonth()],
            "{{END_Y}}": (eDate.getFullYear() + 543).toString(),
            "{{WRITE_DATE}}": strWriteDate,
            "{{SCHOOL_NAME}}": schoolName,
            "{{LEAVE_TYPE}}": leaveTypeForTitle,
            "{{LEAVE_TYPE_OTHER}}": leaveTypeForOther,
            "{{FULL_NAME}}": fullName,
            "{{POSITION}}": position,
            "{{RANK}}": rank,
            "{{ACADEMIC_STANDING}}": academicStanding,
            "{{FULL_POSITION}}": fullPosition,
            "{{DEPARTMENT}}": p.department || '-',
            "{{REASON}}": leave.reason,
            "{{START_DATE}}": window.formatDateThai(leave.start_date),
            "{{END_DATE}}": window.formatDateThai(leave.end_date),
            "{{TOTAL_DAYS}}": isHalfDay ? '0.5' : leave.total_days.toString(),
            "{{TOTAL_DAYS_DISPLAY}}": totalDaysDisplay,
            "{{IS_HALF_DAY}}": halfDayCheck,
            "{{CONTACT_ADDRESS}}": leave.contact_address || '-',
            "{{PHONE_NUMBER}}": leave.phone_number || '-',
            "{{COMMANDER_NAME}}": commanderName,
            "{{COMMANDER_POSITION}}": commanderPosition,
            "{{DIRECTOR_NAME}}": directorName,
            "{{CHECK_SICK}}": checkSick,
            "{{CHECK_PERSONAL}}": checkPersonal,
            "{{CHECK_MATERNITY}}": checkMaternity,
            "{{CHECK_OTHER}}": checkOther,
            "{{REASON_RED}}": reasonRed,
            "{{REASON_BLUE}}": reasonBlue,
            "{{STAT_SICK_PRIOR}}": statsData.sick.prior.days.toString(),
            "{{STAT_SICK_NOW}}": statsData.sick.now.days.toString(),
            "{{STAT_SICK_TOTAL}}": statsData.sick.total.days.toString(),
            "{{STAT_PERS_PRIOR}}": statsData.personal.prior.days.toString(),
            "{{STAT_PERS_NOW}}": statsData.personal.now.days.toString(),
            "{{STAT_PERS_TOTAL}}": statsData.personal.total.days.toString(),
            "{{STAT_MAT_PRIOR}}": statsData.maternity.prior.days.toString(),
            "{{STAT_MAT_NOW}}": statsData.maternity.now.days.toString(),
            "{{STAT_MAT_TOTAL}}": statsData.maternity.total.days.toString(),
            "{{LAST_START_DATE}}": lastStartDate,
            "{{LAST_END_DATE}}": lastEndDate,
            "{{LAST_TOTAL_DAYS}}": lastTotalDays,
            "{{LAST_CHECK_SICK}}": lastCheckSick,
            "{{LAST_CHECK_PERSONAL}}": lastCheckPersonal,
            "{{LAST_CHECK_MATERNITY}}": lastCheckMaternity,
            "{{LAST_LEAVE_TYPE_NAME}}": lastLeaveTypeName,
            "{{LAST_START_D}}": lastStartD,
            "{{LAST_START_M}}": lastStartM,
            "{{LAST_START_Y}}": lastStartY,
            "{{LAST_END_D}}": lastEndD,
            "{{LAST_END_M}}": lastEndM,
            "{{LAST_END_Y}}": lastEndY,
            // สถิติ (ตัวเลข)
            "{{A1}}": statsData.sick.prior.count,
            "{{A2}}": statsData.sick.prior.days,
            "{{A3}}": statsData.sick.now.count,
            "{{A4}}": statsData.sick.now.days,
            "{{A5}}": statsData.sick.total.count,
            "{{A6}}": statsData.sick.total.days,
            "{{A7}}": statsData.personal.prior.count,
            "{{A8}}": statsData.personal.prior.days,
            "{{A9}}": statsData.personal.now.count,
            "{{A10}}": statsData.personal.now.days,
            "{{A11}}": statsData.personal.total.count,
            "{{A12}}": statsData.personal.total.days,
            "{{A13}}": statsData.maternity.prior.count,
            "{{A14}}": statsData.maternity.prior.days,
            "{{A15}}": statsData.maternity.now.count,
            "{{A16}}": statsData.maternity.now.days,
            "{{A17}}": statsData.maternity.total.count,
            "{{A18}}": statsData.maternity.total.days,
            "{{A19}}": statsData.other.prior.count,
            "{{A20}}": statsData.other.prior.days,
            "{{A21}}": statsData.other.now.count,
            "{{A22}}": statsData.other.now.days,
            "{{A23}}": statsData.other.total.count,
            "{{A24}}": statsData.other.total.days,
            // วันที่รับทราบและอนุมัติ
            "{{ACK_ADMIN_AT}}": ackAdminAt,
            "{{ACK_DEPUTY_AT}}": ackDeputyAt,
            "{{ACK_DIRECTOR_AT}}": ackDirectorAt,
            "{{APPROVED_DATE}}": approvedDateDisplay,
            "{{APPROVED_CHECK}}": approvedCheck,
            // ลายเซ็น (ใช้ _IMAGE เพื่อให้ GAS แทนที่ด้วยรูป)
            "{{COMMANDER_SIGNATURE_IMAGE}}": commanderSignatureFileId ? `https://drive.google.com/uc?id=${commanderSignatureFileId}` : '',
            "{{PERSONNEL_SIGNATURE_IMAGE}}": personnelSignatureFileId ? `https://drive.google.com/uc?id=${personnelSignatureFileId}` : ''
        };

        const payload = {
            action: 'generate_pdf',
            templateId: systemSettings.slide_template_id,
            pdfFolderId: systemSettings.pdf_folder_id,
            fileName: `ใบลา_${p.first_name}_${leave.start_date.replace(/-/g, '')}`,
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
        try {
            result = JSON.parse(rawText);
        } catch (e) {
            throw new Error('GAS ตอบกลับไม่ใช่ JSON: ' + rawText.substring(0, 200));
        }
        if (result && result.status === 'success' && result.url) {
            await db.from('leave_requests').update({ pdf_url: result.url }).eq('id', id);
            await window.logUserAction?.(`สร้าง PDF ใบลา ID: ${id}`, 'leave');
            Swal.close();
            window.open(result.url, '_blank');
            return true;
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }
    } catch (err) {
        console.error('generateLeavePDF Error:', err);
        let errorMsg = err.message;
        if (err.name === 'AbortError') errorMsg = 'การเชื่อมต่อหมดเวลา (30 วินาที) กรุณาลองใหม่อีกครั้ง';
        Swal.fire('ผิดพลาด', errorMsg, 'error');
        return false;
    }
};

console.log('✅ leave_core.js loaded (all functions registered globally) — using RPC for holiday calculation');
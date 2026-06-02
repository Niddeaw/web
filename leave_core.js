// ==========================================
// CORE FUNCTIONS for Leave System
// ใช้ร่วมกันระหว่าง leave_teacher.js และ leave_admin.js
// ==========================================

// ฟังก์ชันตรวจสอบเพศจากคำนำหน้า
function getGenderFromPrefix(prefix) {
    if (!prefix) return 'unknown';
    const malePrefixes = ['นาย', 'ว่าที่ ร.ต.', 'ร.ต.', 'ด.ต.', 'ว่าที่', 'สามเณร', 'พระ', 'หม่อมหลวง'];
    const femalePrefixes = ['นางสาว', 'นาง', 'น.ส.', 'หม่อมหลวงหญิง'];
    if (malePrefixes.some(male => prefix.includes(male) || prefix === male)) return 'ชาย';
    if (femalePrefixes.some(female => prefix.includes(female) || prefix === female)) return 'หญิง';
    return 'unknown';
}

// จัดรูปแบบวันที่แบบไทย (เต็ม)
function formatDateThai(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// คืนค่า array ชื่อเดือนภาษาไทย
function getThaiMonths() {
    return ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
}

// คำนวณจำนวนวันลา (startIso, endIso, type)
function calculateDaysByType(startIso, endIso, type) {
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
}

// ฟังก์ชันหลักสร้าง PDF และบันทึก URL (ใช้ร่วมกัน)
async function generateLeavePDF(id, systemSettings, db, Swal, window) {
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
        // ดึงข้อมูลใบลา + บุคลากร
        const { data: leave, error } = await db.from('leave_requests')
            .select('*, core_personnel(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        const p = leave.core_personnel;

        // ดึงข้อมูลโรงเรียน
        const { data: school } = await db.from('core_school_info').select('*').single();
        const directorName = school?.director_name || '...................................................';
        const schoolName = school?.school_name || '........................';
        const deputyAcademicName = school?.deputy_academic || '...................................................';

        // หาผู้บังคับบัญชา
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

        // ดึงใบลาทั้งหมดสำหรับสถิติ
        const { data: allLeavesStats, error: statsError } = await db.from('leave_requests')
            .select('type, total_days, id, created_at, start_date, end_date')
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
            if (isCurrent) {
                statsData[category].now.count = 1;
                statsData[category].now.days = l.total_days;
            } else {
                statsData[category].prior.count += 1;
                statsData[category].prior.days += l.total_days;
            }
        }
        for (const cat of ['sick', 'personal', 'maternity', 'other']) {
            statsData[cat].total.count = statsData[cat].prior.count + statsData[cat].now.count;
            statsData[cat].total.days = statsData[cat].prior.days + statsData[cat].now.days;
        }

        // จัดรูปแบบข้อมูลทั่วไป
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const position = p.position || 'ครู';
        const rank = p.rank || '';
        const academicStanding = p.academic_standing || '';
        const fullPosition = `${position}${rank ? ' ' + rank : ''}${academicStanding ? ' ' + academicStanding : ''}`;

        const thMonths = getThaiMonths();
        const sDate = new Date(leave.start_date);
        const eDate = new Date(leave.end_date);
        const wDateObj = new Date(leave.created_at);
        const strWriteDate = `วันที่ ${wDateObj.getDate()} เดือน ${thMonths[wDateObj.getMonth()]} พ.ศ. ${wDateObj.getFullYear() + 543}`;

        const leaveType = leave.type;
        const isSick = leaveType === 'ลาป่วย';
        const isPersonal = leaveType === 'ลากิจส่วนตัว';
        const isMaternity = leaveType === 'ลาคลอดบุตร';
        const isOther = !isSick && !isPersonal && !isMaternity;
        const checkSick = isSick ? '☑' : '☐';
        const checkPersonal = isPersonal ? '☑' : '☐';
        const checkMaternity = isMaternity ? '☑' : '☐';
        const checkOther = isOther ? '☑' : '☐';
        let reasonRed = '', reasonBlue = '';
        if (isSick || isPersonal) reasonRed = leave.reason;
        else reasonBlue = leave.reason;

        const leaveTypeForTitle = leaveType;
        const leaveTypeForOther = isOther ? leaveType : '';

        // การลาครั้งสุดท้าย
        const previousLeaves = allLeavesStats.filter(l => l.id !== leave.id);
        let lastLeave = null;
        if (previousLeaves.length > 0) {
            previousLeaves.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            lastLeave = previousLeaves[0];
        }
        let lastStartDate = '', lastEndDate = '', lastTotalDays = '';
        let lastCheckSick = '☐', lastCheckPersonal = '☐', lastCheckMaternity = '☐';
        let lastLeaveTypeName = '';
        let lastStartD = '', lastStartM = '', lastStartY = '';
        let lastEndD = '', lastEndM = '', lastEndY = '';
        if (lastLeave && lastLeave.start_date && lastLeave.end_date) {
            const start = new Date(lastLeave.start_date);
            const end = new Date(lastLeave.end_date);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                lastStartDate = formatDateThai(lastLeave.start_date);
                lastEndDate = formatDateThai(lastLeave.end_date);
                lastTotalDays = lastLeave.total_days.toString();
                if (lastLeave.type === 'ลาป่วย') lastCheckSick = '☑';
                else if (lastLeave.type === 'ลากิจส่วนตัว') lastCheckPersonal = '☑';
                else if (lastLeave.type === 'ลาคลอดบุตร' || lastLeave.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') lastCheckMaternity = '☑';
                else lastLeaveTypeName = lastLeave.type;
                lastStartD = start.getDate().toString();
                lastStartM = thMonths[start.getMonth()];
                lastStartY = (start.getFullYear() + 543).toString();
                lastEndD = end.getDate().toString();
                lastEndM = thMonths[end.getMonth()];
                lastEndY = (end.getFullYear() + 543).toString();
            }
        }

        const replacements = {
            "{{W_DAY}}": wDateObj.getDate().toString(),
            "{{W_MONTH}}": thMonths[wDateObj.getMonth()],
            "{{W_YEAR}}": (wDateObj.getFullYear() + 543).toString(),
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
            "{{START_DATE}}": formatDateThai(leave.start_date),
            "{{END_DATE}}": formatDateThai(leave.end_date),
            "{{TOTAL_DAYS}}": leave.total_days.toString(),
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
            "{{A24}}": statsData.other.total.days
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
}

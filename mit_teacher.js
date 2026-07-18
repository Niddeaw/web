/**
 * mit_teacher.js — ระบบบริหารพหุปัญญา (MI) 8 ด้าน
 * ปรับปรุงให้ใช้ config.js มาตรฐาน, ตรวจสอบสิทธิ์, Log ทุกการกระทำ
 * ส่วนที่ 1: INIT, Authentication, UI Control, Load Data, CRUD
 */

const MODULE_ID = 'mit';

// ==========================================
// ตัวแปร Global
// ==========================================
let currentUser = null;
let currentProfile = null;
let currentUserId = null;
let currentUserRole = null;
let isAdminMode = false;
let isModuleAdmin = false;
let schoolInfo = null;
let miTable = null;
let allResults = [];
let allClassrooms = [];
let importMode = 'excel';
let adviserMap = {};
let currentSelectedClassroomId = null;
let miBarChartInstance = null;
let miDoughnutChartInstance = null;

// ==========================================
// LOGOUT (มาตรฐานกลาง)
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: 'คุณต้องการออกจากระบบใช่หรือไม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}

// ==========================================
// INIT — ใช้ checkSessionAndRole
// ==========================================
window.addEventListener('load', async () => {
    // อนุญาตเฉพาะ role เหล่านี้ (staff, office จะถูกปฏิเสธ)
    const allowedRoles = ['super_admin', 'admin', 'director', 'deputy', 'teacher'];
    const result = await checkSessionAndRole(MODULE_ID, allowedRoles);
    if (!result) return;

    currentUser = result.user;
    currentProfile = result.personnel;
    currentUserId = currentUser.id;
    currentUserRole = result.role;

    // ตรวจสอบ admin โดย role หรือ module admin
    const isAdminByRole = isAdminUser(currentUserRole, false);
    isModuleAdmin = await hasModuleAccess(currentUserRole, MODULE_ID, currentUserId);
    isAdminMode = isAdminByRole || isModuleAdmin;

    // แสดงชื่อบน navbar
    const nameDisplay = document.getElementById('user-display');
    if (nameDisplay) {
        nameDisplay.textContent = `${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`;
        nameDisplay.classList.remove('hidden');
        nameDisplay.classList.add('inline-block');
    }

    // ใช้ applyVisibilityByRole แสดง/ซ่อนปุ่มต่างๆ
    applyVisibilityByRole(currentUserRole, isAdminMode, {
        settingsBtn: 'btn-settings',
        toggleBtn: 'btnToggleMode'
    });

    // ปุ่มจัดการแอดมิน แสดงเฉพาะผู้ที่มีสิทธิ์ตั้งค่า
    // const btnAdminManager = document.getElementById('btnAdminManager');
    // if (btnAdminManager) {
    //     if (canManageSettings()) {
    //         btnAdminManager.classList.remove('hidden');
    //         btnAdminManager.classList.add('flex');
    //     } else {
    //         btnAdminManager.classList.add('hidden');
    //         btnAdminManager.classList.remove('flex');
    //     }
    // }
    const btnAdminManager = document.getElementById('btnAdminManager');
    if (btnAdminManager) {
        // ✅ เปลี่ยนเป็น window.canManageSettings(currentUserRole)
        if (window.canManageSettings(currentUserRole)) {
            btnAdminManager.classList.remove('hidden');
            btnAdminManager.classList.add('flex');
        } else {
            btnAdminManager.classList.add('hidden');
            btnAdminManager.classList.remove('flex');
        }
    }
    // อัปเดตข้อความปุ่มสลับโหมด
    updateToggleModeUI(currentUserRole, isAdminMode, 'btnToggleMode');

    // โหลดข้อมูลโรงเรียน
    const { data: si } = await db.from('core_school_info').select('*').single();
    schoolInfo = si;

    if (si) {
        const { data: s } = await db.from('mi_settings')
            .select('*')
            .eq('academic_year', String(si.current_academic_year))
            .eq('semester', String(si.current_semester))
            .maybeSingle();
        if (s) {
            document.getElementById('set-delay').value = s.delay_seconds || 10;
            document.getElementById('set-active').checked = s.is_active !== false;
        }
    }

    // โหลดห้องเรียนและข้อมูล
    await loadClassrooms();

    // บันทึก Log เข้าสู่ระบบ
    await logUserAction('เข้าสู่ระบบบริหาร MI', MODULE_ID);

    // แสดงเนื้อหา
    document.getElementById('mainBody')?.classList?.replace('opacity-0', 'opacity-100');
});

// ==========================================
// สลับโหมด (เฉพาะ admin เท่านั้น)
// ==========================================
async function toggleMode() {
    if (!isAdminMode) {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่สามารถสลับโหมดได้', 'warning');
        return;
    }
    isAdminMode = !isAdminMode;
    applyVisibilityByRole(currentUserRole, isAdminMode, {
        settingsBtn: 'btn-settings',
        toggleBtn: 'btnToggleMode'
    });
    updateToggleModeUI(currentUserRole, isAdminMode, 'btnToggleMode');
    if (miTable) { miTable.destroy(); miTable = null; }
    document.getElementById('mi-tbody').innerHTML = '';
    await loadClassrooms();
    await loadStats();
    await logUserAction(`สลับโหมดเป็น ${isAdminMode ? 'Admin' : 'Teacher'}`, MODULE_ID);
}

// ==========================================
// โหลดห้องเรียน
// ==========================================
async function loadClassrooms() {
    let q = db.from('core_classrooms')
        .select('id, grade_level, room_number, core_personnel_1:core_personnel!adviser_id_1(prefix, first_name, last_name), core_personnel_2:core_personnel!adviser_id_2(prefix, first_name, last_name)')
        .eq('academic_year', String(schoolInfo?.current_academic_year))
        .eq('semester', String(schoolInfo?.current_semester))
        .order('grade_level').order('room_number');

    if (!isAdminMode) {
        q = q.or(`adviser_id_1.eq.${currentUserId},adviser_id_2.eq.${currentUserId}`);
    }

    const { data } = await q;
    allClassrooms = data || [];

    adviserMap = {};
    allClassrooms.forEach(c => {
        const names = [];
        if (c.core_personnel_1) names.push(`${c.core_personnel_1.prefix || ''}${c.core_personnel_1.first_name} ${c.core_personnel_1.last_name}`);
        if (c.core_personnel_2) names.push(`${c.core_personnel_2.prefix || ''}${c.core_personnel_2.first_name} ${c.core_personnel_2.last_name}`);
        adviserMap[c.id] = names.length > 0 ? names.join(' / ') : null;
    });

    const adminFilter = document.getElementById('adminFilterSection');
    const teacherBar = document.getElementById('teacherActionBar');

    if (isAdminMode) {
        adminFilter.classList.remove('hidden');
        teacherBar.classList.add('hidden');
        const sel = document.getElementById('sel-classroom');
        if (sel.tomselect) sel.tomselect.destroy();
        sel.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>' +
            allClassrooms.map(r => `<option value="${r.id}">ม.${r.grade_level}/${r.room_number}</option>`).join('');
        new TomSelect('#sel-classroom', {
            placeholder: 'พิมพ์หรือเลือกห้องเรียน...',
            allowEmptyOption: true,
            maxOptions: null,
            onChange(value) {
                const div = document.getElementById('adviserDisplay');
                const nameEl = document.getElementById('adviserNames');
                if (value && adviserMap[value]) {
                    nameEl.textContent = adviserMap[value];
                    div.classList.remove('hidden');
                } else {
                    div.classList.add('hidden');
                }
                currentSelectedClassroomId = value || null;
                if (value) {
                    loadResults(value);
                    loadStats(value);
                } else {
                    loadResults();
                    loadStats();
                }
            }
        });
    } else {
        adminFilter.classList.add('hidden');
        teacherBar.classList.remove('hidden');
        if (allClassrooms.length > 0) {
            const firstRoomId = allClassrooms[0].id;
            currentSelectedClassroomId = firstRoomId;
            await loadResults(firstRoomId);
            await loadStats(firstRoomId);
        } else {
            currentSelectedClassroomId = null;
            Swal.fire('แจ้งเตือน', 'ไม่พบห้องเรียนที่ปรึกษาในภาคเรียนนี้', 'info');
            await loadStats();
        }
    }
}

// ==========================================
// โหลดสถิติ (loadStats, renderStatsCards, renderMICharts)
// ==========================================
// (ฟังก์ชันเหล่านี้ใช้โค้ดเดิมโดยไม่ต้องปรับปรุง ยกเว้นเพิ่ม log หากจำเป็น)
// แต่เพื่อความกระชับ ขอย่อไว้ในส่วนที่ 2

// ==========================================
// โหลดผลการประเมิน (loadResults, renderTable)
// ==========================================
// เช่นเดียวกัน ขอรวมไว้ส่วนที่ 2

// ==========================================
// ดูผล (openViewResult, closeViewModal)
// ==========================================
function closeViewModal() {
    const modal = document.getElementById('view-result-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

async function openViewResult(studentId) {
    let row = allResults.find(r => r.student_id === studentId);

    if (!row) {
        Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
            .eq('student_id', studentId)
            .single();

        const { data: mi } = await db.from('mi_assessments')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', String(schoolInfo?.current_academic_year))
            .eq('semester', String(schoolInfo?.current_semester))
            .single();

        if (!enroll) {
            Swal.close();
            Swal.fire('ไม่พบข้อมูล', 'ไม่สามารถดึงข้อมูลนักเรียนคนนี้ได้', 'error');
            return;
        }
        row = { ...enroll, mi: mi || null };
        Swal.close();
    }

    const std = row.core_students;
    const cls = row.core_classrooms;
    const mi = row.mi;
    const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    const room = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';

    document.getElementById('vr-name').textContent = fullName;
    document.getElementById('vr-room').textContent = room;

    if (!mi) {
        document.getElementById('vr-body').innerHTML = '<p class="text-center text-slate-400 py-8">ยังไม่มีข้อมูลการประเมิน</p>';
        document.getElementById('view-result-modal').classList.remove('hidden');
        document.getElementById('view-result-modal').classList.add('flex');
        return;
    }

    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: mi[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: mi[`level_${d.key}`] || ''
    }));

    const totalScore = mi.score_total || 0;
    const totalLvl = mi.level_total || '';

    const getLevelStyle = (level) => {
        if (!level) return { badge: 'bg-slate-100 text-slate-600', bar: '#94a3b8', bg: 'bg-slate-500' };
        if (['โดดเด่น', 'สูง', 'สูงกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-green-100 text-green-700', bar: '#10b981', bg: 'bg-green-500' };
        } else if (['ปานกลาง', 'เกณฑ์ปกติ'].includes(level)) {
            return { badge: 'bg-blue-100 text-blue-700', bar: '#3b82f6', bg: 'bg-blue-500' };
        } else if (['ควรพัฒนา', 'ต่ำ', 'ต่ำกว่าเกณฑ์'].includes(level)) {
            return { badge: 'bg-amber-100 text-amber-700', bar: '#f59e0b', bg: 'bg-amber-500' };
        } else {
            return { badge: 'bg-slate-100 text-slate-600', bar: '#94a3b8', bg: 'bg-slate-500' };
        }
    };

    const totalStyle = getLevelStyle(totalLvl);
    const badge = (level) => {
        const style = getLevelStyle(level);
        return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}">${level}</span>`;
    };
    const bar = (score, max, level) => {
        const pct = Math.round((score / max) * 100);
        const style = getLevelStyle(level);
        return `<div class="w-full bg-slate-100 rounded-full h-2 mt-1"><div class="h-2 rounded-full" style="width:${pct}%; background:${style.bar};"></div></div>`;
    };

    const dimsHtml = dims.map(d => `
        <div class="flex justify-between items-center border-b border-slate-100 py-2">
            <span class="text-sm">${d.label}</span>
            <div class="flex items-center gap-2">
                <span class="font-bold text-sm">${d.score}/${d.max}</span>
                ${badge(d.level)}
            </div>
            ${bar(d.score, d.max, d.level)}
        </div>
    `).join('');

    document.getElementById('vr-body').innerHTML = `
        <div class="flex justify-center mb-5">
            <div class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl ${totalStyle.bg} text-white">
                <i class="fas fa-star"></i>
                <span class="font-black text-2xl">${totalScore}</span>
                <span class="text-sm opacity-80">/ 200 คะแนน</span>
                <span class="font-bold">&nbsp;·&nbsp;${totalLvl}</span>
            </div>
        </div>
        <div class="space-y-1">${dimsHtml}</div>
        ${mi.note ? `<div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800"><i class="fas fa-note-sticky mr-1"></i><strong>หมายเหตุ:</strong> ${mi.note}</div>` : ''}
    `;

    document.getElementById('view-result-modal').classList.remove('hidden');
    document.getElementById('view-result-modal').classList.add('flex');
}

// ==========================================
// แก้ไขผล (openEditForStudent, closeEditModal, saveEdit)
// ==========================================
function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

async function openEditForStudent(studentId) {
    let row = allResults.find(r => r.student_id === studentId);
    if (!row) {
        const { data: enroll } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name)')
            .eq('student_id', studentId)
            .single();
        if (!enroll) {
            Swal.fire('ไม่พบข้อมูลนักเรียน', '', 'error');
            return;
        }
        row = { ...enroll, mi: null, core_students: enroll.core_students };
    }
    const std = row.core_students;
    const mi = row.mi || {};
    document.getElementById('edit-student-id').value = studentId;
    document.getElementById('edit-student-name').textContent = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    document.getElementById('edit-linguistic').value = mi.score_linguistic || 0;
    document.getElementById('edit-logical-mathematical').value = mi.score_logical_mathematical || 0;
    document.getElementById('edit-visual-spatial').value = mi.score_visual_spatial || 0;
    document.getElementById('edit-bodily-kinesthetic').value = mi.score_bodily_kinesthetic || 0;
    document.getElementById('edit-musical').value = mi.score_musical || 0;
    document.getElementById('edit-interpersonal').value = mi.score_interpersonal || 0;
    document.getElementById('edit-intrapersonal').value = mi.score_intrapersonal || 0;
    document.getElementById('edit-naturalist').value = mi.score_naturalist || 0;
    document.getElementById('edit-note').value = mi.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-modal').classList.add('flex');
}
async function saveEdit() {
    // ตรวจสอบสิทธิ์ (เฉพาะ admin เท่านั้นที่แก้ไขได้)
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขผลการประเมินได้')) return;

    const studentId = document.getElementById('edit-student-id').value;
    const { data: enroll, error: enrollErr } = await db.from('student_enrollments')
        .select('classroom_id')
        .eq('student_id', studentId)
        .single();
    if (enrollErr || !enroll) {
        Swal.fire('ไม่พบข้อมูลการลงทะเบียนเรียนของนักเรียน', '', 'error');
        return;
    }
    const classroomId = enroll.classroom_id;

    const scores = {
        linguistic: parseInt(document.getElementById('edit-linguistic').value) || 0,
        logical_mathematical: parseInt(document.getElementById('edit-logical-mathematical').value) || 0,
        visual_spatial: parseInt(document.getElementById('edit-visual-spatial').value) || 0,
        bodily_kinesthetic: parseInt(document.getElementById('edit-bodily-kinesthetic').value) || 0,
        musical: parseInt(document.getElementById('edit-musical').value) || 0,
        interpersonal: parseInt(document.getElementById('edit-interpersonal').value) || 0,
        intrapersonal: parseInt(document.getElementById('edit-intrapersonal').value) || 0,
        naturalist: parseInt(document.getElementById('edit-naturalist').value) || 0
    };
    const note = document.getElementById('edit-note').value;
    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    const getLevel = (score, norm) => {
        if (score < norm.min) return 'ควรพัฒนา';
        if (score <= norm.max) return 'ปานกลาง';
        return 'โดดเด่น';
    };

    const payload = {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        answers: {},
        score_linguistic: scores.linguistic,
        score_logical_mathematical: scores.logical_mathematical,
        score_visual_spatial: scores.visual_spatial,
        score_bodily_kinesthetic: scores.bodily_kinesthetic,
        score_musical: scores.musical,
        score_interpersonal: scores.interpersonal,
        score_intrapersonal: scores.intrapersonal,
        score_naturalist: scores.naturalist,
        score_total: total,
        level_linguistic: getLevel(scores.linguistic, MI_NORM.linguistic),
        level_logical_mathematical: getLevel(scores.logical_mathematical, MI_NORM.logical_mathematical),
        level_visual_spatial: getLevel(scores.visual_spatial, MI_NORM.visual_spatial),
        level_bodily_kinesthetic: getLevel(scores.bodily_kinesthetic, MI_NORM.bodily_kinesthetic),
        level_musical: getLevel(scores.musical, MI_NORM.musical),
        level_interpersonal: getLevel(scores.interpersonal, MI_NORM.interpersonal),
        level_intrapersonal: getLevel(scores.intrapersonal, MI_NORM.intrapersonal),
        level_naturalist: getLevel(scores.naturalist, MI_NORM.naturalist),
        level_total: getLevel(total, MI_NORM.total),
        note: note,
        recorder_id: currentUser.id,
        completed_at: new Date().toISOString()
    };

    const { error } = await db.from('mi_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
    if (error) {
        Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
        return;
    }
    await logUserAction(`แก้ไขผล MI ของนักเรียน ${studentId}`, MODULE_ID);
    Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1500, showConfirmButton: false });
    closeEditModal();
    loadResults();
    loadStats();
}

// ==========================================
// ลบผล (deleteResult)
// ==========================================
async function deleteResult(studentId) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบผลการประเมินได้')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ลบผลการประเมิน?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ'
    });
    if (!isConfirmed) return;

    const { error } = await db.from('mi_assessments').delete()
        .eq('student_id', studentId)
        .eq('academic_year', String(schoolInfo.current_academic_year))
        .eq('semester', String(schoolInfo.current_semester));

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
        return;
    }
    await logUserAction(`ลบผล MI ของนักเรียน ${studentId}`, MODULE_ID);
    Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1400, showConfirmButton: false });
    loadResults();
    loadStats();
}

// ==========================================
// ส่งออก Excel (exportExcel)
// ==========================================
function exportExcel() {
    if (!allResults.length) return Swal.fire('ไม่มีข้อมูล', '', 'info');
    const rows = allResults.map(r => {
        const std = r.core_students;
        const cls = r.core_classrooms;
        const mi = r.mi;
        if (!mi) return null;
        const dimKeys = MI_DIMENSIONS.map(d => d.key);
        const row = {
            'ห้องเรียน': cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
            'เลขที่': r.student_number,
            'ชื่อ-สกุล': `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`
        };
        dimKeys.forEach(key => {
            const dim = MI_DIMENSIONS.find(d => d.key === key);
            row[dim.label] = mi[`score_${key}`] || 0;
        });
        row['รวม (200)'] = mi.score_total;
        row['ระดับรวม'] = mi.level_total;
        return row;
    }).filter(r => r);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 25 }, ...MI_DIMENSIONS.map(() => ({ wch: 12 })), { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MI_8dim');
    XLSX.writeFile(wb, `MI_${isAdminMode ? 'admin' : 'teacher'}_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.xlsx`);
}

// ==========================================
// สถิติและกราฟ (loadStats, renderStatsCards, renderMICharts)
// ==========================================
function getDimIcon(key) {
    const map = {
        linguistic: 'fa-language',
        logical_mathematical: 'fa-calculator',
        visual_spatial: 'fa-cubes',
        bodily_kinesthetic: 'fa-running',
        musical: 'fa-music',
        interpersonal: 'fa-users',
        intrapersonal: 'fa-user-astronaut',
        naturalist: 'fa-leaf'
    };
    return map[key] || 'fa-brain';
}

async function loadStats(forceClassroomId = null) {
    const academicYear = String(schoolInfo?.current_academic_year);
    const semester = String(schoolInfo?.current_semester);

    let query = db.from('mi_assessments')
        .select('student_id, classroom_id, score_linguistic, score_logical_mathematical, score_visual_spatial, score_bodily_kinesthetic, score_musical, score_interpersonal, score_intrapersonal, score_naturalist')
        .eq('academic_year', academicYear)
        .eq('semester', semester);

    if (forceClassroomId) {
        query = query.eq('classroom_id', forceClassroomId);
    }

    const { data: mis, error: misErr } = await query;
    if (misErr) console.error('loadStats error:', misErr);

    let visibleStudentIds = [];
    if (!isAdminMode) {
        const roomIds = allClassrooms.map(r => r.id);
        if (roomIds.length === 0) {
            const emptyDimStats = MI_DIMENSIONS.map(d => ({ key: d.key, label: d.label, count: 0, icon: getDimIcon(d.key) }));
            renderStatsCards(0, 0, 0, emptyDimStats);
            return;
        }
        const { data: enrolls } = await db.from('student_enrollments')
            .select('student_id')
            .in('classroom_id', roomIds);
        visibleStudentIds = (enrolls || []).map(e => e.student_id);
    } else {
        if (forceClassroomId) {
            const { data: enrolls } = await db.from('student_enrollments')
                .select('student_id')
                .eq('classroom_id', forceClassroomId);
            visibleStudentIds = (enrolls || []).map(e => e.student_id);
        } else {
            const { data: allStd } = await db.from('core_students').select('id');
            visibleStudentIds = (allStd || []).map(s => s.id);
        }
    }

    const totalStudents = visibleStudentIds.length;
    const filteredAssessments = (mis || []).filter(m => visibleStudentIds.includes(m.student_id));
    const assessedCount = filteredAssessments.length;
    const notAssessedCount = totalStudents - assessedCount;

    const dimKeys = MI_DIMENSIONS.map(d => d.key);
    const topCount = {};
    dimKeys.forEach(key => { topCount[key] = 0; });
    filteredAssessments.forEach(m => {
        let maxScore = -1;
        let topKey = null;
        dimKeys.forEach(key => {
            const s = m[`score_${key}`] || 0;
            if (s > maxScore) { maxScore = s; topKey = key; }
        });
        if (topKey) topCount[topKey]++;
    });

    const dimStats = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        count: topCount[d.key] || 0,
        icon: getDimIcon(d.key)
    }));

    renderStatsCards(totalStudents, assessedCount, notAssessedCount, dimStats);
}

function renderStatsCards(total, assessed, notAssessed, dimStats) {
    const container = document.getElementById('stat-cards');
    if (!container) return;

    let html = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">`;
    const mainCards = [
        { label: 'นักเรียนทั้งหมด', value: total, icon: 'fa-users', color: 'blue' },
        { label: 'สำรวจแล้ว', value: assessed, icon: 'fa-check-circle', color: 'green' },
        { label: 'ยังไม่สำรวจ', value: notAssessed, icon: 'fa-clock', color: 'amber' }
    ];
    mainCards.forEach(card => {
        html += `
            <div class="glass rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div class="absolute -right-4 -bottom-4 text-7xl opacity-10 text-${card.color}-500">
                    <i class="fas ${card.icon}"></i>
                </div>
                <div class="relative z-10">
                    <p class="text-slate-400 text-sm font-bold uppercase tracking-wider">${card.label}</p>
                    <p class="text-4xl font-black text-slate-800 mt-1">${card.value}</p>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">`;
    const colors = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'emerald'];
    dimStats.forEach((d, idx) => {
        const color = colors[idx % colors.length];
        html += `
            <div class="glass rounded-2xl p-4 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" 
                 onclick="openDimStudentList('${d.key}')">
                <div class="h-10 w-10 bg-${color}-100 text-${color}-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas ${d.icon} text-lg"></i>
                </div>
                <div>
                    <p class="text-xs text-slate-400 font-bold uppercase leading-tight">${d.label}</p>
                    <p class="text-xl font-bold text-slate-800">${d.count}</p>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    html += `
<div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
    <div class="glass rounded-2xl shadow-sm p-5">
        <h3 class="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-chart-bar text-indigo-500"></i> จำนวนนักเรียนที่โดดเด่นรายด้าน
        </h3>
        <div class="relative" style="height:240px;">
            <canvas id="mi-bar-chart"></canvas>
        </div>
    </div>
    <div class="glass rounded-2xl shadow-sm p-5">
        <h3 class="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-chart-pie text-purple-500"></i> สัดส่วนปัญญาที่โดดเด่น (%)
        </h3>
        <div class="flex items-center gap-4">
            <div class="relative flex-shrink-0" style="width:150px;height:150px;">
                <canvas id="mi-doughnut-chart"></canvas>
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p class="text-xs text-slate-400 font-bold">รวม</p>
                    <p class="text-xl font-black text-slate-700" id="mi-doughnut-total">0</p>
                    <p class="text-xs text-slate-400">คน</p>
                </div>
            </div>
            <div class="flex-1 space-y-1 text-xs" style="max-height:220px; overflow-y:auto;" id="mi-doughnut-legend"></div>
        </div>
    </div>
</div>`;

    container.innerHTML = html;
    requestAnimationFrame(() => renderMICharts(dimStats));
}

function renderMICharts(dimStats) {
    const DIM_COLORS = ['#6366f1', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899', '#f97316', '#14b8a6', '#22c55e'];
    const labels = dimStats.map(d => d.label);
    const counts = dimStats.map(d => d.count);
    const total = counts.reduce((a, b) => a + b, 0);

    const barCanvas = document.getElementById('mi-bar-chart');
    if (barCanvas) {
        if (miBarChartInstance) { miBarChartInstance.destroy(); miBarChartInstance = null; }
        const sortedIdx = [...counts.keys()].sort((a, b) => counts[b] - counts[a]);
        miBarChartInstance = new Chart(barCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedIdx.map(i => labels[i]),
                datasets: [{
                    label: 'จำนวนนักเรียน (คน)',
                    data: sortedIdx.map(i => counts[i]),
                    backgroundColor: sortedIdx.map(i => DIM_COLORS[i] + 'CC'),
                    borderColor: sortedIdx.map(i => DIM_COLORS[i]),
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} คน` } } },
                scales: {
                    x: {
                        ticks: {
                            font: { size: 10 },
                            maxRotation: 30,
                            callback: function (val) {
                                const s = this.getLabelForValue(val);
                                return s.length > 8 ? s.slice(0, 8) + '…' : s;
                            }
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, precision: 0, font: { size: 10 } },
                        grid: { color: '#f1f5f9' }
                    }
                }
            }
        });
    }

    const doughnutCanvas = document.getElementById('mi-doughnut-chart');
    const legendEl = document.getElementById('mi-doughnut-legend');
    const totalEl = document.getElementById('mi-doughnut-total');
    if (doughnutCanvas) {
        if (miDoughnutChartInstance) { miDoughnutChartInstance.destroy(); miDoughnutChartInstance = null; }
        const hasCounts = counts.some(c => c > 0);
        const chartLabels = hasCounts ? labels : ['ยังไม่มีข้อมูล'];
        const chartData = hasCounts ? counts : [1];
        const chartColors = hasCounts ? DIM_COLORS : ['#e2e8f0'];
        if (totalEl) totalEl.textContent = total;

        miDoughnutChartInstance = new Chart(doughnutCanvas.getContext('2d'), {
            type: 'doughnut',
            data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors.map(c => c + 'DD'), borderColor: chartColors, borderWidth: 2, hoverOffset: 8 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => { if (!hasCounts) return ' ยังไม่มีข้อมูล'; const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0; return ` ${ctx.parsed} คน (${pct}%)`; } } }
                }
            }
        });

        if (legendEl) {
            if (!hasCounts) { legendEl.innerHTML = '<p class="text-slate-400 text-xs">ยังไม่มีข้อมูลสำรวจ</p>'; }
            else {
                legendEl.innerHTML = dimStats.map((d, i) => {
                    const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : '0.0';
                    const bar = total > 0 ? Math.round((d.count / total) * 100) : 0;
                    return `
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${DIM_COLORS[i]}"></span>
                        <span class="text-slate-600 truncate flex-1" title="${d.label}">${d.label}</span>
                        <span class="font-bold text-slate-700 flex-shrink-0">${d.count}</span>
                        <span class="text-slate-400 flex-shrink-0 w-10 text-right">${pct}%</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-1 mb-1">
                        <div class="h-1 rounded-full" style="width:${bar}%;background:${DIM_COLORS[i]}"></div>
                    </div>`;
                }).join('');
            }
        }
    }
}

// ==========================================
// โหลดผลการประเมิน (loadResults, renderTable)
// ==========================================
async function loadResults(forceClassroomId = null) {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const sel = document.getElementById('sel-classroom');
        const classroomId = forceClassroomId || (isAdminMode && sel ? (sel.tomselect ? sel.tomselect.getValue() : sel.value) : null);

        let roomIds = [];
        if (classroomId) {
            roomIds = [classroomId];
        } else if (isAdminMode) {
            roomIds = allClassrooms.map(r => r.id);
        } else {
            roomIds = allClassrooms.map(r => r.id);
        }

        if (roomIds.length === 0) {
            Swal.close();
            allResults = [];
            renderTable([]);
            return;
        }

        let miMap = {};
        const { data: mis, error: misErr } = await db.from('mi_assessments')
            .select('*')
            .eq('academic_year', String(schoolInfo?.current_academic_year))
            .eq('semester', String(schoolInfo?.current_semester))
            .in('classroom_id', roomIds);

        if (misErr) console.error('loadResults mis error:', misErr);
        (mis || []).forEach(e => { miMap[e.student_id] = e; });

        let { data: enrolls, error: enrollErr } = await db.from('student_enrollments')
            .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
            .in('classroom_id', roomIds)
            .order('student_number');

        if (enrollErr) {
            const fallback = await db.from('student_enrollments')
                .select('student_id, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
                .in('classroom_id', roomIds);
            enrolls = fallback.data;
            if (fallback.error) throw fallback.error;
        }

        Swal.close();
        allResults = (enrolls || []).map(e => ({ ...e, mi: miMap[e.student_id] || null }));

        if (allResults.length === 0) {
            Swal.fire({ icon: 'info', title: 'ไม่พบรายชื่อนักเรียน', text: 'ยังไม่มีการนำเข้านักเรียนในห้องเรียนนี้', timer: 2000, showConfirmButton: false });
        }
        renderTable(allResults);
    } catch (error) {
        Swal.close();
        console.error('loadResults error:', error);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
        allResults = [];
        renderTable([]);
    }
}

function renderTable(rows) {
    if (miTable) { miTable.destroy(); miTable = null; }
    const tbody = document.getElementById('mi-tbody');
    if (!tbody) return;

    const getLevelBadge = (level) => {
        if (!level) return '<span class="text-slate-300">-</span>';
        let cls = '';
        if (['โดดเด่น', 'สูง', 'สูงกว่าเกณฑ์'].includes(level)) cls = 'bg-green-100 text-green-700';
        else if (['ปานกลาง', 'เกณฑ์ปกติ'].includes(level)) cls = 'bg-blue-100 text-blue-700';
        else if (['ควรพัฒนา', 'ต่ำ', 'ต่ำกว่าเกณฑ์'].includes(level)) cls = 'bg-amber-100 text-amber-700';
        else cls = 'bg-slate-100 text-slate-600';
        return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${level}</span>`;
    };

    let html = '';
    for (const r of rows) {
        const cls = r.core_classrooms;
        const std = r.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const mi = r.mi;

        if (!mi) {
            html += `<tr>
                <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
                <td class="text-center">${r.student_number}</td>
                <td class="font-semibold text-slate-700">${fullName}</td>
                ${MI_DIMENSIONS.map(() => '<td class="text-center">-</td>').join('')}
                <td class="text-center">-</td>
                <td class="text-center text-slate-400">ยังไม่ประเมิน</td>
                <td class="text-center"><button onclick="openEditForStudent('${r.student_id}')" class="bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded text-xs">ประเมิน</button></td>
            </tr>`;
            continue;
        }

        const dimKeys = MI_DIMENSIONS.map(d => d.key);
        const dimScores = dimKeys.map(key => mi[`score_${key}`] || 0);
        const totalScore = dimScores.reduce((a, b) => a + b, 0);

        const canEdit = isAdminMode; // เฉพาะ admin เท่านั้นที่แก้ไข/ลบได้
        const actions = `<div class="flex gap-1 justify-center">
            <button onclick='openViewResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100" title="ดูผล"><i class="fas fa-eye text-xs"></i></button>
            ${canEdit ? `<button onclick='openEditForStudent("${r.student_id}")' class="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>` : ''}
            <button onclick='printStudentPdf("${r.student_id}")' class="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="PDF"><i class="fas fa-print text-xs"></i></button>
            ${canEdit ? `<button onclick='deleteResult("${r.student_id}")' class="h-7 w-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="ลบ"><i class="fas fa-trash text-xs"></i></button>` : ''}
        </div>`;

        html += `<tr>
            <td class="text-center">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
            <td class="text-center font-bold text-slate-400">${r.student_number}</td>
            <td class="font-semibold text-slate-700">${fullName}</td>
            ${dimScores.map(s => `<td class="text-center">${s}/25</td>`).join('')}
            <td class="text-center font-bold">${totalScore} / 200</td>
            <td class="text-center">${getLevelBadge(mi.level_total)}</td>
            <td class="text-center">${actions}</td>
        </tr>`;
    }

    tbody.innerHTML = html;
    try {
        miTable = new DataTable('#mi-table', {
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            responsive: true,
            scrollX: true,
            pageLength: 50,
            columnDefs: [{ responsivePriority: 1, targets: -1 }, { orderable: false, targets: [12] }]
        });
    } catch (err) { console.error('DataTable init error:', err); }
}

// ==========================================
// พิมพ์ PDF (printStudentPdf, buildMIPdfHtml, generateStudentPDFMI, generateStudentPdfFromHtml)
// ==========================================
// (โค้ดเดิมทั้งหมด ไม่ต้องปรับปรุง)

async function printStudentPdf(studentId) {
    Swal.fire({ title: 'กำลังเตรียมเอกสาร PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        if (!studentId) throw new Error('ไม่พบรหัสนักเรียน');

        const { data: assessment, error: assessErr } = await db.from('mi_assessments')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', String(schoolInfo.current_academic_year))
            .eq('semester', String(schoolInfo.current_semester))
            .single();

        if (assessErr || !assessment) {
            console.error('❌ Assessment not found:', assessErr);
            throw new Error('ไม่พบข้อมูลการประเมิน');
        }

        const { data: student, error: stdErr } = await db.from('core_students')
            .select('prefix, first_name, last_name, avatar_students_url, student_id_card')
            .eq('id', studentId)
            .single();

        if (stdErr) {
            console.warn('⚠️ Student data not found:', stdErr);
            assessment.core_students = {
                prefix: '',
                first_name: 'ไม่พบชื่อ',
                last_name: '',
                avatar_students_url: null
            };
        } else {
            assessment.core_students = student;
        }

        if (assessment.classroom_id) {
            const { data: cls, error: clsErr } = await db.from('core_classrooms')
                .select('grade_level, room_number')
                .eq('id', assessment.classroom_id)
                .single();

            if (!clsErr && cls) {
                assessment.core_classrooms = cls;
            } else {
                assessment.core_classrooms = null;
            }
        } else {
            assessment.core_classrooms = null;
        }

        let adviser1 = '-', adviser2 = '-';
        if (assessment.classroom_id) {
            try {
                const { data: cls, error: clsErr } = await db.from('core_classrooms')
                    .select(`
                        adviser1:core_personnel!adviser_id_1(prefix, first_name, last_name),
                        adviser2:core_personnel!adviser_id_2(prefix, first_name, last_name)
                    `)
                    .eq('id', assessment.classroom_id)
                    .single();

                if (!clsErr && cls) {
                    if (cls.adviser1) adviser1 = `${cls.adviser1.prefix || ''}${cls.adviser1.first_name} ${cls.adviser1.last_name}`;
                    if (cls.adviser2) adviser2 = `${cls.adviser2.prefix || ''}${cls.adviser2.first_name} ${cls.adviser2.last_name}`;
                }
            } catch (err) {
                console.warn('⚠️ Adviser data not found:', err);
            }
        }

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;

        const std = assessment.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const avatarUrl = std?.avatar_students_url || null;

        Swal.close();
        generateStudentPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        console.error('❌ printStudentPdf catch:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่พบข้อมูลการประเมิน', 'error');
    }
}

function buildMIPdfHtml(opts) {
    var assessment = opts.assessment || {};
    var schoolName = opts.schoolName || '';
    var academicYear = opts.academicYear || '';
    var semester = opts.semester || '';
    var adviser1 = opts.adviser1 || '';
    var adviser2 = opts.adviser2 || '';
    var logoUrl = opts.logoUrl || '';
    var fullName = opts.fullName || '';
    var avatarUrl = opts.avatarUrl || '';
    var dims = opts.dims || [];
    var studentIdCard = opts.studentIdCard || '-';
    var studentNumber = opts.studentNumber || '-';
    var gradeLevel = opts.gradeLevel || '-';
    var roomNumber = opts.roomNumber || '-';
    var docTitle = opts.docTitle || 'รายงานผลการประเมินพหุปัญญา (MIT)';

    var scoreTotal = assessment.score_total ?? '-';
    var totalLevel = assessment.level_total || '-';

    var isHigh = ['สูงกว่าเกณฑ์', 'โดดเด่น', 'สูง'].indexOf(totalLevel) >= 0;
    var isMid = ['เกณฑ์ปกติ', 'ปานกลาง'].indexOf(totalLevel) >= 0;
    var totalColor = isHigh ? '#15803d' : (isMid ? '#1d4ed8' : '#b91c1c');
    var totalBg = isHigh ? '#dcfce7' : (isMid ? '#dbeafe' : '#fee2e2');
    var totalBorder = isHigh ? '#16a34a' : (isMid ? '#2563eb' : '#dc2626');

    function getLvlColor(lv) {
        if (['สูงกว่าเกณฑ์', 'โดดเด่น', 'สูง'].indexOf(lv) >= 0) return '#10b981';
        if (['เกณฑ์ปกติ', 'ปานกลาง'].indexOf(lv) >= 0) return '#3b82f6';
        return '#ef4444';
    }
    function getLvlClass(lv) {
        if (['สูงกว่าเกณฑ์', 'โดดเด่น', 'สูง'].indexOf(lv) >= 0) return 'lh';
        if (['เกณฑ์ปกติ', 'ปานกลาง'].indexOf(lv) >= 0) return 'lm';
        return 'll';
    }

    var avatarHtml = avatarUrl
        ? '<img src="' + avatarUrl + '" width="70" height="90" style="object-fit:cover;display:block;" crossorigin="anonymous">'
        : '<div style="width:70px;height:90px;text-align:center;line-height:90px;font-size:30px;color:#94a3b8;">&#128100;</div>';

    var DC = ['#6366f1', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#14b8a6', '#f97316'];

    var pieTot = 0;
    for (var i = 0; i < dims.length; i++) pieTot += dims[i].score;
    if (pieTot === 0) pieTot = 1;
    var slices = '', sa = -Math.PI / 2;
    var pcx = 60, pcy = 60, pr = 48;
    for (var i = 0; i < dims.length; i++) {
        var ang = (dims[i].score / pieTot) * 2 * Math.PI;
        if (ang < 0.001) { sa += ang; continue; }
        var ea = sa + ang;
        var x1 = pcx + pr * Math.cos(sa), y1 = pcy + pr * Math.sin(sa);
        var x2 = pcx + pr * Math.cos(ea), y2 = pcy + pr * Math.sin(ea);
        var la = ang > Math.PI ? 1 : 0;
        slices += '<path d="M' + pcx + ',' + pcy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
            ' A' + pr + ',' + pr + ' 0 ' + la + ',1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
            ' Z" fill="' + DC[i] + '" stroke="white" stroke-width="1.5"/>';
        sa = ea;
    }
    var piesvg = '<svg width="110" height="110" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="white"/>' + slices + '</svg>';

    var legend = '';
    for (var i = 0; i < dims.length; i++) {
        legend += '<div style="margin-bottom:3px;font-size:11px;color:#374151;">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + DC[i] + ';margin-right:5px;vertical-align:middle;"></span>' +
            '<span style="vertical-align:middle;">' + dims[i].label + ' (' + dims[i].score + '/' + dims[i].max + ')</span></div>';
    }

    var rcx = 90, rcy = 90, rr = 55, n = dims.length;
    var grid = '', axes = '', lbs = '', dts = '', rpts = [];
    for (var i = 0; i < n; i++) {
        var ang = (2 * Math.PI * i / n) - Math.PI / 2;
        var pct = dims[i].max > 0 ? dims[i].score / dims[i].max : 0;
        rpts.push((rcx + rr * pct * Math.cos(ang)).toFixed(1) + ',' + (rcy + rr * pct * Math.sin(ang)).toFixed(1));
        var ex = rcx + rr * Math.cos(ang), ey = rcy + rr * Math.sin(ang);
        axes += '<line x1="' + rcx + '" y1="' + rcy + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#d1d5db" stroke-width="1"/>';
        var lx = rcx + (rr + 20) * Math.cos(ang), ly = rcy + (rr + 20) * Math.sin(ang);
        lbs += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="7.5" fill="#374151" font-family="Sarabun,sans-serif">' + dims[i].label + '</text>';
        var dx = rcx + rr * pct * Math.cos(ang), dy = rcy + rr * pct * Math.sin(ang);
        dts += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.5" fill="' + DC[i] + '" stroke="white" stroke-width="1"/>';
    }
    var fracs = [0.25, 0.5, 0.75, 1];
    for (var f = 0; f < 4; f++) {
        var gp = [];
        for (var i = 0; i < n; i++) {
            var ang = (2 * Math.PI * i / n) - Math.PI / 2;
            gp.push((rcx + rr * fracs[f] * Math.cos(ang)).toFixed(1) + ',' + (rcy + rr * fracs[f] * Math.sin(ang)).toFixed(1));
        }
        grid += '<polygon points="' + gp.join(' ') + '" fill="none" stroke="#e5e7eb" stroke-width="1"/>';
    }
    var radarsvg = '<svg width="170" height="170" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="180" fill="white"/>' +
        grid + axes +
        '<polygon points="' + rpts.join(' ') + '" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>' +
        dts + lbs + '</svg>';

    var bars = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? (dims[i].score / dims[i].max * 100) : 0;
        bars += '<div style="margin-bottom:3px;">' +
            '<div style="font-size:10px;margin-bottom:1px;">' +
            '<span style="font-weight:600;float:left;">' + dims[i].label + '</span>' +
            '<span style="float:right;">' + dims[i].score + '/' + dims[i].max + ' (' + Math.round(pct) + '%)</span>' +
            '<div style="clear:both;"></div></div>' +
            '<div style="background:#e5e7eb;border-radius:4px;height:6px;width:100%;">' +
            '<div style="width:' + pct.toFixed(1) + '%;background:' + getLvlColor(dims[i].level) + ';height:6px;border-radius:4px;"></div>' +
            '</div></div>';
    }

    var trows = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? Math.round(dims[i].score / dims[i].max * 100) : 0;
        trows += '<tr>' +
            '<td style="text-align:left;font-size:11px;">' + dims[i].label + '</td>' +
            '<td style="font-size:11px;">' + dims[i].score + '</td>' +
            '<td style="font-size:11px;">' + dims[i].max + '</td>' +
            '<td style="font-size:11px;">' + pct + '%</td>' +
            '<td class="' + getLvlClass(dims[i].level) + '" style="font-size:13px;">' + dims[i].level + '</td>' +
            '</tr>';
    }
    var totPct = (scoreTotal !== '-') ? Math.round(scoreTotal / 200 * 100) : '-';
    trows += '<tr style="background:#f1f5f9;font-weight:700;">' +
        '<td style="text-align:left;font-size:13px;"><b>รวม</b></td>' +
        '<td style="font-size:11px;"><b>' + scoreTotal + '</b></td>' +
        '<td style="font-size:13px;"><b>200</b></td>' +
        '<td style="font-size:11px;"><b>' + totPct + '%</b></td>' +
        '<td class="' + getLvlClass(totalLevel) + '" style="font-size:13px;"><b>' + totalLevel + '</b></td>' +
        '</tr>';

    var dateStr = new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    var printDate = new Date().toLocaleDateString('th-TH');
    var advLine = adviser1 + (adviser2 && adviser2 !== '-' ? ' / ' + adviser2 : '');
    var gradeDisp = (gradeLevel && gradeLevel !== '-') ? 'ม.' + gradeLevel : '-';

    var css =
        '* {box-sizing:border-box;margin:0;padding:0;}' +
        'html,body {width:210mm;background:white;}' +
        'body {font-family:Sarabun,Anuphan,sans-serif;font-size:11px;color:#1e293b;padding:5mm 7mm;}' +
        '.box {background:#ffffff;border:1px solid #e2e8f0;border-radius:5px;padding:6px;}' +
        '.stitle2 {font-size:11px;font-weight:700;color:#312e81;border-bottom:1px solid #e2e8f0;padding-bottom:2px;margin-bottom:4px;}' +
        'table.dt {width:100%;border-collapse:collapse;}' +
        'table.dt th,table.dt td {border:1px solid #cbd5e1;padding:3px 5px;text-align:center;vertical-align:middle;font-size:11px;}' +
        'table.dt th {background:#312e81;color:white;font-size:10px;}' +
        '.lh {color:#15803d;font-weight:700;}' +
        '.lm {color:#1d4ed8;font-weight:700;}' +
        '.ll {color:#b91c1c;font-weight:700;}' +
        '.footer {font-size:9px;text-align:center;color:#94a3b8;margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px;}';

    var html =
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + css + '</style></head><body>' +

        '<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #312e81;margin-bottom:5px;padding-bottom:4px;">' +
        '<tr>' +
        '<td width="60%" valign="middle">' +
        '<table cellpadding="0" cellspacing="0"><tr>' +
        '<td width="50" valign="middle"><img src="' + logoUrl + '" width="40" height="40" crossorigin="anonymous"></td>' +
        '<td valign="middle" style="padding-left:8px;">' +
        '<div style="color:#312e81;font-size:14px;font-weight:900;line-height:1.2;">' + schoolName + '</div>' +
        '<div style="font-size:10px;color:#475569;">' + docTitle + '</div>' +
        '</td></tr></table>' +
        '</td>' +
        '<td width="40%" align="right" valign="bottom" style="font-size:10px;line-height:1.5;">' +
        '<div><b>ภาคเรียนที่ ' + semester + '</b> ปีการศึกษา ' + academicYear + '</div>' +
        '<div>ครูที่ปรึกษา: ' + advLine + '</div>' +
        '<div>วันที่ประเมิน: ' + dateStr + '</div>' +
        '</td>' +
        '</tr></table>' +

        '<table width="100%" cellpadding="0" cellspacing="4" style="margin-bottom:5px;">' +
        '<tr>' +
        '<td width="50%" valign="top">' +
        '<div class="box">' +
        '<table cellpadding="0" cellspacing="0"><tr>' +
        '<td valign="top" style="padding-right:8px;">' +
        '<div style="width:72px;height:90px;border-radius:5px;overflow:hidden;border:1.5px solid #cbd5e1;background:#f8fafc;">' + avatarHtml + '</div>' +
        '</td>' +
        '<td valign="top" style="line-height:1.6;">' +
        '<div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:3px;">' + fullName + '</div>' +
        '<div><span style="color:#64748b;font-size:11px;">เลขประจำตัว: </span><b style="color:#312e81;font-size:13px;">' + studentIdCard + '</b></div>' +
        '<div>' +
        '<span style="color:#64748b;font-size:11px;">ชั้น: </span><b style="color:#312e81;font-size:12px;">' + gradeDisp + '</b>&nbsp;&nbsp;' +
        '<span style="color:#64748b;font-size:11px;">ห้อง: </span><b style="color:#312e81;font-size:12px;">' + roomNumber + '</b>' +
        '</div>' +
        '<div><span style="color:#64748b;font-size:11px;">เลขที่: </span><b style="color:#312e81;font-size:12px;">' + studentNumber + '</b></div>' +
        '</td>' +
        '</tr></table>' +
        '</div>' +
        '</td>' +
        '<td width="50%" valign="top">' +
        '<div class="box" style="text-align:center;">' +
        '<div class="stitle2">🏆 ผลการประเมินรวม</div>' +
        '<div style="background:' + totalBg + ';border:2px solid ' + totalBorder + ';border-radius:8px;padding:12px 8px;margin-top:4px;">' +
        '<div style="font-size:30px;font-weight:900;color:' + totalColor + ';line-height:1;">' + scoreTotal + '<span style="font-size:14px;font-weight:500;"> / 200</span></div>' +
        '<div style="font-size:13px;font-weight:700;color:' + totalColor + ';margin-top:6px;">ระดับ: ' + totalLevel + '</div>' +
        '</div>' +
        '</div>' +
        '</td>' +
        '</tr></table>' +

        '<table width="100%" cellpadding="0" cellspacing="4" style="margin-bottom:5px;">' +
        '<tr>' +
        '<td width="50%" valign="top">' +
        '<div class="box">' +
        '<div class="stitle2">🥧 สัดส่วนคะแนนรายด้าน</div>' +
        '<table cellpadding="0" cellspacing="0"><tr>' +
        '<td width="120" valign="middle" style="padding-right:4px;">' + piesvg + '</td>' +
        '<td valign="middle">' + legend + '</td>' +
        '</tr></table>' +
        '</div>' +
        '</td>' +
        '<td width="50%" valign="top">' +
        '<div class="box" style="text-align:center;">' +
        '<div class="stitle2">🕸️ กราฟเรดาร์พหุปัญญา</div>' +
        radarsvg +
        '</div>' +
        '</td>' +
        '</tr></table>' +

        '<div class="box" style="margin-bottom:4px;">' +
        '<div class="stitle2">📊 กราฟแสดงคะแนนรายด้าน 8 ด้าน</div>' +
        bars +
        '</div>' +

        '<div class="box">' +
        '<div class="stitle2">📋 ตารางสรุปผลการประเมิน 8 ด้าน</div>' +
        '<table class="dt">' +
        '<thead><tr>' +
        '<th style="text-align:left;width:30%;">ด้าน</th>' +
        '<th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th><th>ระดับ</th>' +
        '</tr></thead>' +
        '<tbody>' + trows + '</tbody>' +
        '</table>' +
        '</div>' +

        '<div class="footer">ระบบ WRK School Management System | แบบประเมินพหุปัญญา 8 ด้าน | พิมพ์วันที่ ' + printDate + '</div>' +
        '</body></html>';

    return html;
}

function generateStudentPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    const _getLevel = (score, norm) => score < norm.min ? 'ต่ำกว่าเกณฑ์' : (score <= norm.max ? 'เกณฑ์ปกติ' : 'สูงกว่าเกณฑ์');

    const dims = MI_DIMENSIONS.map(d => {
        const score = assessment['score_' + d.key] || 0;
        const levelFromDb = assessment['level_' + d.key];
        const norm = MI_NORM[d.key] || { min: 10, max: 18 };
        const level = levelFromDb || _getLevel(score, norm);
        return { key: d.key, label: d.label, score: score, max: d.maxScore, level: level };
    });

    if (assessment.score_total === undefined || assessment.score_total === null) {
        assessment.score_total = dims.reduce(function (s, d) { return s + d.score; }, 0);
    }
    if (!assessment.level_total) {
        const normTotal = MI_NORM.total || { min: 80, max: 144 };
        assessment.level_total = _getLevel(assessment.score_total, normTotal);
    }

    const cls = assessment.core_classrooms;
    const std = assessment.core_students;
    const studentIdCard = (std && std.student_id_card) ? std.student_id_card : '';
    const gradeLevel = (cls && cls.grade_level) ? cls.grade_level : '';
    const roomNumber = (cls && cls.room_number) ? cls.room_number : '';

    const resultRow = allResults.find(function (r) { return r.student_id === assessment.student_id; });
    const studentNumber = (resultRow && resultRow.student_number) ? resultRow.student_number : '';

    const html = buildMIPdfHtml({
        assessment: assessment, schoolName: schoolName, academicYear: academicYear, semester: semester,
        adviser1: adviser1, adviser2: adviser2, logoUrl: logoUrl, fullName: fullName, avatarUrl: avatarUrl,
        dims: dims,
        studentIdCard: studentIdCard, studentNumber: studentNumber, gradeLevel: gradeLevel, roomNumber: roomNumber,
        docTitle: 'รายงานผลการประเมินพหุปัญญา (MIT)'
    });

    generateStudentPdfFromHtml(html, fullName);
}

function generateStudentPdfFromHtml(html, fullName) {
    var opt = {
        margin: [0.45, 0.45, 0.7, 0.45],
        filename: 'MI_' + fullName + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            windowWidth: 794,
            logging: false
        },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(html, 'string').save();
}

// ==========================================
// นำเข้า (Import) — ครูและ admin ใช้ได้
// ==========================================
function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

function setImportMode(mode) {
    importMode = mode;
    document.getElementById('import-excel-section').classList.toggle('hidden', mode !== 'excel');
    document.getElementById('import-sheets-section').classList.toggle('hidden', mode !== 'sheets');
    document.getElementById('tab-excel').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'excel' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
    document.getElementById('tab-sheets').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode === 'sheets' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`;
}

async function handleFileImport(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        await processImportRows(rows);
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

async function handleSheetsImport() {
    const url = document.getElementById('sheets-url').value.trim();
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return Swal.fire('URL ไม่ถูกต้อง', '', 'error');
    Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading() });
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
        const res = await fetch(csvUrl);
        const text = await res.text();
        const rows = text.trim().split('\n').slice(1).map(line => {
            const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
            return {
                'รหัสนักเรียน': cols[0],
                'ภาษา': parseInt(cols[1]), 'ตรรกศาสตร์': parseInt(cols[2]),
                'มิติสัมพันธ์': parseInt(cols[3]), 'ร่างกาย': parseInt(cols[4]),
                'ดนตรี': parseInt(cols[5]), 'มนุษยสัมพันธ์': parseInt(cols[6]),
                'เข้าใจตนเอง': parseInt(cols[7]), 'ธรรมชาติ': parseInt(cols[8])
            };
        });
        Swal.close();
        await processImportRows(rows);
    } catch (err) { Swal.close(); Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function processImportRows(rows) {
    const dimMap = {
        'ภาษา': 'linguistic',
        'ตรรกศาสตร์': 'logical_mathematical',
        'มิติสัมพันธ์': 'visual_spatial',
        'ร่างกาย': 'bodily_kinesthetic',
        'ดนตรี': 'musical',
        'มนุษยสัมพันธ์': 'interpersonal',
        'เข้าใจตนเอง': 'intrapersonal',
        'ธรรมชาติ': 'naturalist'
    };
    const dataRows = rows.filter(r => r['รหัสนักเรียน']);
    if (!dataRows.length) return Swal.fire('ไม่พบข้อมูล', '', 'warning');
    Swal.fire({ title: `พบ ${dataRows.length} รายการ`, text: 'กำลังนำเข้า...', didOpen: () => Swal.showLoading() });
    const { data: stds } = await db.from('core_students').select('id, student_id_card, classroom_id');
    const stdMap = Object.fromEntries((stds || []).map(s => [String(s.student_id_card).trim(), s]));

    const getLevel = (score, norm) => score < norm.min ? 'ต่ำกว่าเกณฑ์' : (score <= norm.max ? 'เกณฑ์ปกติ' : 'สูงกว่าเกณฑ์');
    let success = 0, fail = 0;
    for (const row of dataRows) {
        const std = stdMap[String(row['รหัสนักเรียน']).trim()];
        if (!std) { fail++; continue; }
        const scores = {};
        for (const [thai, key] of Object.entries(dimMap)) {
            scores[key] = parseInt(row[thai]) || 0;
        }
        const total = Object.values(scores).reduce((a, b) => a + b, 0);
        const payload = {
            student_id: std.id, classroom_id: std.classroom_id,
            academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester,
            answers: {}, recorder_id: currentUser.id,
            score_linguistic: scores.linguistic,
            score_logical_mathematical: scores.logical_mathematical,
            score_visual_spatial: scores.visual_spatial,
            score_bodily_kinesthetic: scores.bodily_kinesthetic,
            score_musical: scores.musical,
            score_interpersonal: scores.interpersonal,
            score_intrapersonal: scores.intrapersonal,
            score_naturalist: scores.naturalist,
            score_total: total,
            level_linguistic: getLevel(scores.linguistic, MI_NORM.linguistic),
            level_logical_mathematical: getLevel(scores.logical_mathematical, MI_NORM.logical_mathematical),
            level_visual_spatial: getLevel(scores.visual_spatial, MI_NORM.visual_spatial),
            level_bodily_kinesthetic: getLevel(scores.bodily_kinesthetic, MI_NORM.bodily_kinesthetic),
            level_musical: getLevel(scores.musical, MI_NORM.musical),
            level_interpersonal: getLevel(scores.interpersonal, MI_NORM.interpersonal),
            level_intrapersonal: getLevel(scores.intrapersonal, MI_NORM.intrapersonal),
            level_naturalist: getLevel(scores.naturalist, MI_NORM.naturalist),
            level_total: getLevel(total, MI_NORM.total)
        };
        const { error } = await db.from('mi_assessments').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
        if (error) fail++; else success++;
    }
    Swal.close(); closeImportModal();
    await logUserAction(`นำเข้าข้อมูล MI ${success} รายการ (ล้มเหลว ${fail} รายการ)`, MODULE_ID);
    Swal.fire({ icon: success > 0 ? 'success' : 'error', title: 'นำเข้าเสร็จ', html: `สำเร็จ ${success} รายการ<br>ล้มเหลว ${fail} รายการ` });
    loadResults();
    loadStats();
}

// ==========================================
// ตั้งค่าระบบ (Settings) — เฉพาะ admin เท่านั้น
// ==========================================
function openSettings() {
    if (!window.canManageSettings(currentUserRole)) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าระบบได้', 'warning');
        return;
    }
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (currentUserRole === 'super_admin') {
        document.getElementById('user-management-section').classList.remove('hidden');
    } else {
        document.getElementById('user-management-section').classList.add('hidden');
    }
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
}

async function saveSettings() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;
    const delay = parseInt(document.getElementById('set-delay').value) || 0;
    const active = document.getElementById('set-active').checked;
    const { error } = await db.from('mi_settings').upsert({
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        delay_seconds: delay,
        is_active: active
    }, { onConflict: 'academic_year,semester' });
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        await logUserAction('บันทึกการตั้งค่าระบบ MI', MODULE_ID);
        Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1400, showConfirmButton: false });
        closeSettings();
    }
}

// ==========================================
// จัดการผู้ดูแลระบบ (Module Admin) — ใช้ core_module_admins
// ==========================================
function openAdminManager() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;
    document.getElementById('adminManagerModal').classList.remove('hidden');
    document.getElementById('adminManagerModal').classList.add('flex');
    loadPersonnelOptions();
    loadCurrentAdmins();
}

function closeAdminManager() {
    document.getElementById('adminManagerModal').classList.add('hidden');
    document.getElementById('adminManagerModal').classList.remove('flex');
}

async function loadPersonnelOptions() {
    try {
        const { data: currentAdmins } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', MODULE_ID);
        const adminUserIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];

        const { data: personnel, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .order('first_name', { ascending: true });
        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';
        if (select.tomselect) select.tomselect.destroy();

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- เลือกบุคลากร --';
        select.appendChild(emptyOption);

        personnel.forEach(p => {
            if (adminUserIds.includes(p.id)) return;
            const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            const dept = p.department ? ` [${p.department}]` : '';
            const pos = p.position ? ` - ${p.position}` : '';
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${fullName}${pos}${dept}`;
            select.appendChild(option);
        });

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body'
        });
    } catch (err) {
        console.error('Load personnel error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: moduleAdminsRaw, error: adminError } = await db
            .from('core_module_admins')
            .select('id, user_id, created_at')
            .eq('module_id', MODULE_ID);
        if (adminError) throw adminError;

        let moduleAdmins = [];
        if (moduleAdminsRaw && moduleAdminsRaw.length > 0) {
            const userIds = moduleAdminsRaw.map(a => a.user_id);
            const { data: personnelList, error: pErr } = await db
                .from('core_personnel')
                .select('id, prefix, first_name, last_name, position, department')
                .in('id', userIds);
            if (pErr) throw pErr;
            const personnelMap = {};
            (personnelList || []).forEach(p => { personnelMap[p.id] = p; });
            moduleAdmins = moduleAdminsRaw
                .map(a => ({ ...a, core_personnel: personnelMap[a.user_id] || null }))
                .filter(a => a.core_personnel);
        }

        const { data: superAdmins, error: superError } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');
        if (superError) throw superError;

        const adminListDiv = document.getElementById('adminList');
        let html = '';
        let totalCount = 0;

        if (superAdmins && superAdmins.length > 0) {
            superAdmins.forEach(admin => {
                const fullName = `${admin.prefix || ''}${admin.first_name} ${admin.last_name}`;
                html += `
                    <div class="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                <i class="fa-solid fa-crown text-amber-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">${fullName}</div>
                                <div class="text-xs text-slate-500">${admin.position || ''}${admin.department ? ` · ${admin.department}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">
                                    <i class="fa-solid fa-star mr-1"></i>Super Admin
                                </span>
                            </div>
                        </div>
                        <span class="text-xs text-slate-400">ถาวร</span>
                    </div>
                `;
                totalCount++;
            });
        }

        if (moduleAdmins && moduleAdmins.length > 0) {
            moduleAdmins.forEach(admin => {
                const p = admin.core_personnel;
                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const createdDate = admin.created_at ? new Date(admin.created_at).toLocaleDateString('th-TH') : 'ไม่ระบุ';
                html += `
                    <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                <i class="fa-solid fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">${fullName}</div>
                                <div class="text-xs text-slate-500">${p.position || ''}${p.department ? ` · ${p.department}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                                    <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${createdDate}
                                </span>
                            </div>
                        </div>
                        <button onclick="removeModuleAdmin('${admin.id}', '${fullName}')" 
                                class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold transition-colors">
                            <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                        </button>
                    </div>
                `;
                totalCount++;
            });
        }

        if (html === '') {
            html = `<div class="text-center text-slate-400 py-8"><i class="fa-solid fa-user-slash text-3xl mb-2"></i><p>ยังไม่มีผู้ดูแลระบบ MI</p></div>`;
        }
        adminListDiv.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${totalCount} คน)`;
    } catch (err) {
        console.error('Load admins error:', err);
        document.getElementById('adminList').innerHTML = `<div class="text-center text-rose-400 py-8"><i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i><p>ไม่สามารถโหลดข้อมูลได้</p><p class="text-xs mt-1">${err.message}</p></div>`;
    }
}

async function addModuleAdmin() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;

    const select = document.getElementById('personnelSelect');
    const personnelId = select.tomselect ? select.tomselect.getValue() : select.value;
    if (!personnelId || personnelId === '') {
        return Swal.fire('กรุณาเลือก', 'กรุณาเลือกครู/บุคลากรก่อน', 'warning');
    }

    try {
        const { data: personnel, error: personnelError } = await db
            .from('core_personnel')
            .select('id, email, prefix, first_name, last_name')
            .eq('id', personnelId)
            .single();
        if (personnelError || !personnel) return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');

        const userId = personnel.id;
        const { data: existing } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', MODULE_ID)
            .maybeSingle();
        if (existing) return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล MI อยู่แล้ว', 'info');

        const { error: insertError } = await db
            .from('core_module_admins')
            .insert({ user_id: userId, module_id: MODULE_ID, created_at: new Date().toISOString() });
        if (insertError) throw insertError;

        await logUserAction(`แต่งตั้งผู้ดูแล MI: ${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}`, MODULE_ID);
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ!', timer: 2000, showConfirmButton: false });
        if (select.tomselect) select.tomselect.clear();
        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error('Add admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มผู้ดูแลได้: ' + err.message, 'error');
    }
}

async function removeModuleAdmin(adminId, adminName) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;

    const result = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `คุณต้องการถอดถอน <strong>${adminName}</strong> จากการเป็นผู้ดูแลระบบ MI ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ถอดถอน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;

    try {
        const { error } = await db.from('core_module_admins').delete().eq('id', adminId);
        if (error) throw error;
        await logUserAction(`ถอดถอนผู้ดูแล MI: ${adminName}`, MODULE_ID);
        Swal.fire({ icon: 'success', title: 'ถอดถอนสำเร็จ!', timer: 2000, showConfirmButton: false });
        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error('Remove admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถถอดถอนได้: ' + err.message, 'error');
    }
}

// ==========================================
// รายชื่อนักเรียนตามด้าน (Dim Student List)
// ==========================================
function closeDimStudentModal() {
    const modal = document.getElementById('dim-student-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (window.dimStudentTable) {
        window.dimStudentTable.destroy();
        window.dimStudentTable = null;
    }
}

async function openDimStudentList(dimKey) {
    const dim = MI_DIMENSIONS.find(d => d.key === dimKey);
    if (!dim) return;
    document.getElementById('dim-modal-title').textContent = `ด้าน ${dim.label}`;

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        let query = db.from('mi_assessments')
            .select('student_id, classroom_id, score_linguistic, score_logical_mathematical, score_visual_spatial, score_bodily_kinesthetic, score_musical, score_interpersonal, score_intrapersonal, score_naturalist')
            .eq('academic_year', String(schoolInfo?.current_academic_year))
            .eq('semester', String(schoolInfo?.current_semester));

        if (currentSelectedClassroomId) {
            query = query.eq('classroom_id', currentSelectedClassroomId);
        }

        const { data: mis, error: misErr } = await query;
        if (misErr) throw misErr;

        let filterRoomIds = [];
        if (currentSelectedClassroomId) {
            filterRoomIds = [currentSelectedClassroomId];
        } else {
            filterRoomIds = allClassrooms.map(r => r.id);
        }

        if (filterRoomIds.length === 0) {
            Swal.close();
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบห้องเรียนในระบบ', 'info');
            return;
        }

        const targetStudentIds = [];
        const topScoreMap = {};
        const dimKeys = MI_DIMENSIONS.map(d => d.key);

        (mis || []).forEach(m => {
            if (!filterRoomIds.includes(m.classroom_id)) return;
            let maxScore = -1;
            let topKey = null;
            dimKeys.forEach(key => {
                const s = m[`score_${key}`] || 0;
                if (s > maxScore) { maxScore = s; topKey = key; }
            });
            if (topKey === dimKey) {
                targetStudentIds.push(m.student_id);
                topScoreMap[m.student_id] = maxScore;
            }
        });

        if (targetStudentIds.length === 0) {
            Swal.close();
            const tbody = document.getElementById('dim-student-tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500 font-medium">ยังไม่มีนักเรียนที่ถนัดด้านนี้เป็นอันดับ 1</td></tr>`;
            const modal = document.getElementById('dim-student-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            return;
        }

        let enrollQuery = db.from('student_enrollments')
            .select('student_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
            .in('student_id', targetStudentIds);

        if (currentSelectedClassroomId) {
            enrollQuery = enrollQuery.eq('classroom_id', currentSelectedClassroomId);
        } else {
            const roomIds = allClassrooms.map(r => r.id);
            if (roomIds.length > 0) {
                enrollQuery = enrollQuery.in('classroom_id', roomIds);
            }
        }

        const { data: enrolls, error: enrollErr } = await enrollQuery;
        if (enrollErr) throw enrollErr;
        const validEnrolls = enrolls || [];

        validEnrolls.sort((a, b) => {
            const scoreA = topScoreMap[a.student_id] || 0;
            const scoreB = topScoreMap[b.student_id] || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            const nameA = (a.core_students?.first_name || '') + ' ' + (a.core_students?.last_name || '');
            const nameB = (b.core_students?.first_name || '') + ' ' + (b.core_students?.last_name || '');
            return nameA.localeCompare(nameB);
        });

        const tbody = document.getElementById('dim-student-tbody');
        if (!tbody) return;
        let html = '';
        validEnrolls.forEach(r => {
            const std = r.core_students;
            const cls = r.core_classrooms;
            const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
            const studentIdCard = std?.student_id_card || '-';
            const gradeLevel = cls?.grade_level || '-';
            const roomNumber = cls?.room_number || '-';
            const score = topScoreMap[r.student_id] || 0;

            html += `<tr>
                <td class="text-center">${gradeLevel !== '-' ? 'ม.' + gradeLevel + '/' + roomNumber : '-'}</td>
                <td class="text-center">${studentIdCard}</td>
                <td class="font-semibold text-slate-700">${fullName}</td>
                <td class="font-bold text-center text-emerald-600">${score}</td>
                <td class="text-center">
                    <button onclick="openViewResult('${r.student_id}')" class="h-8 w-8 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100" title="ดูผล">
                        <i class="fas fa-eye text-sm"></i>
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;

        Swal.close();
        const modal = document.getElementById('dim-student-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        if (window.dimStudentTable) {
            window.dimStudentTable.destroy();
            window.dimStudentTable = null;
        }

        setTimeout(() => {
            window.dimStudentTable = new DataTable('#dim-student-table', {
                language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                responsive: true,
                scrollX: true,
                pageLength: 50,
                columnDefs: [{ orderable: false, targets: [4] }]
            });
        }, 150);

    } catch (error) {
        Swal.close();
        console.error('openDimStudentList error:', error);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลรายชื่อได้', 'error');
    }
}

// ==========================================
// ประกาศฟังก์ชัน global สำหรับส่วนที่ 1
// ==========================================
window.logout = logout;
window.toggleMode = toggleMode;
window.openViewResult = openViewResult;
window.closeViewModal = closeViewModal;
window.openEditForStudent = openEditForStudent;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteResult = deleteResult;

console.log('✅ mit_teacher.js (Part 1) loaded');
// ==========================================
// ประกาศฟังก์ชัน global สำหรับส่วนที่ 2
// ==========================================
window.exportExcel = exportExcel;
window.printStudentPdf = printStudentPdf;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.setImportMode = setImportMode;
window.handleFileImport = handleFileImport;
window.handleSheetsImport = handleSheetsImport;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.openAdminManager = openAdminManager;
window.closeAdminManager = closeAdminManager;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.openDimStudentList = openDimStudentList;
window.closeDimStudentModal = closeDimStudentModal;

console.log('✅ mit_teacher.js (Part 2) loaded');
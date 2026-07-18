// ==========================================================================
// behavior_admin.js - ระบบงานปกครอง (ผู้ดูแลระบบ) 
// ปรับปรุงให้ค้นหานักเรียนผ่านฐานข้อมูลโดยตรง (ไม่ต้องโหลด schoolStats)
// ใช้ config.js สำหรับสิทธิ์และ Log
// รองรับ: Admin, หัวหน้างานปกครอง, หัวหน้าระดับ
// ==========================================================================

let currentUser = null;
let actualRole = '';
let isAdminMode = false;
let isDisciplineHead = false;
let managedGrades = [];
let schoolInfo = null;
let systemConfig = null;
let criteriaList = [];
let table = null;
let classroomTomSelect = null;
let currentFilter = null;

// ── Cache สำหรับ export (โหลดเฉพาะเมื่อต้องการ) ──
let schoolStatsCache = null;
let cacheTimestamp = null;
const CACHE_EXPIRY = 5 * 60 * 1000;
let schoolStatsLoading = false;
let schoolStatsLoaded = false;

// ============================================================
// เริ่มต้น (ใช้ checkSessionAndRole)
// ============================================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    console.time('⏱️ Admin Management โหลด');

    try {
        // 1. ตรวจสอบเซสชันและสิทธิ์ด้วย config.js
        const session = await checkSessionAndRole('ระบบงานปกครอง (Admin)');
        if (!session) return;

        const { user, personnel, role, isAdmin, isTeacher, isOffice, isAdminMode: sessionMode } = session;
        currentUser = personnel;
        actualRole = role;
        isAdminMode = sessionMode;

        // 2. ใช้ applyVisibilityByRole เพื่อควบคุมปุ่มต่าง ๆ
        applyVisibilityByRole(role, isAdminMode, {
            settingsBtn: 'btn_settings',
            toggleBtn: null,
            adminManagerBtn: null
        });

        // 3. ตรวจสอบสิทธิ์เพิ่มเติม: หัวหน้างานปกครอง, หัวหน้าระดับ
        const { data: sInfo } = await db.from('core_school_info')
            .select('current_academic_year')
            .single();
        if (sInfo?.current_academic_year) {
            const { data: discHead } = await db.from('core_discipline_heads')
                .select('id')
                .eq('personnel_id', user.id)
                .eq('academic_year', sInfo.current_academic_year)
                .maybeSingle();
            isDisciplineHead = !!discHead;
        }
        const { data: gradeHeads } = await db.from('behavior_grade_heads')
            .select('grade_level')
            .eq('teacher_id', user.id);
        managedGrades = gradeHeads ? gradeHeads.map(g => g.grade_level) : [];

        // 4. ตรวจสอบสิทธิ์เข้าโมดูล (ถ้าไม่ใช่ admin)
        if (!isAdmin) {
            const hasAccess = await hasModuleAccess(role, 'behavior', user.id);
            const hasSpecialAccess = isDisciplineHead || managedGrades.length > 0;
            if (!hasAccess && !hasSpecialAccess) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                    text: 'คุณไม่ได้รับอนุญาตให้ใช้งานระบบงานปกครอง กรุณาติดต่อผู้ดูแลระบบ',
                    confirmButtonText: 'กลับหน้าหลัก'
                });
                window.location.href = 'index.html';
                return;
            }
        }

        // 5. ปุ่ม Dashboard (แสดงเฉพาะผู้มีสิทธิ์)
        const hasDashboardAccess = isAdmin || isDisciplineHead || managedGrades.length > 0;
        if (hasDashboardAccess) {
            $('#btnDashboard').removeClass('hidden').addClass('flex');
        } else {
            $('#btnDashboard').addClass('hidden').removeClass('flex');
        }

        // 6. ปุ่มตั้งค่า (ใช้ canManageSettings)
        if (canManageSettings(role)) {
            $('#btn_settings').removeClass('hidden').addClass('flex');
        } else {
            $('#btn_settings').addClass('hidden').removeClass('flex');
        }

        // 7. ปุ่มนำเข้า Excel (เฉพาะ super_admin)
        if (role === 'super_admin') {
            $('#btn_import_excel').removeClass('hidden').addClass('flex');
        } else {
            $('#btn_import_excel').addClass('hidden').removeClass('flex');
        }

        // 8. แสดงชื่อและบทบาท
        let roleLabel = '';
        if (role === 'super_admin') {
            roleLabel = '<i class="fas fa-crown text-amber-500 mr-1"></i> Superuser';
        } else if (isAdmin) {
            roleLabel = '<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> ผู้ดูแลระบบ';
        } else if (isDisciplineHead) {
            roleLabel = '<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> หัวหน้างานปกครอง';
        } else if (managedGrades.length > 0) {
            roleLabel = `<i class="fas fa-layer-group text-blue-500 mr-1"></i> หัวหน้าระดับ ม.${managedGrades.join(', ')}`;
        } else {
            roleLabel = '<i class="fas fa-user-tie mr-1"></i> ครูที่ปรึกษา';
        }
        $('#role_label').html(roleLabel);
        $('#user_display').html(`ครู${currentUser.first_name} ${currentUser.last_name}`);

        // 9. โหลดข้อมูลพื้นฐาน
        await Promise.all([
            loadSchoolInfo(),
            loadSystemConfig(),
            loadCriteria(),
            loadClassroomList()
        ]);

        // 10. เริ่มต้น DataTable (Server-side)
        await initTableServerSide();

        // 11. Event bindings
        $('#search_student').on('input', function () {
            const val = $(this).val();
            if (val.length >= 2) {
                searchStudent(val);
            } else {
                $('#search_results').hide();
            }
        });

        $('#evidence_file').change(function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    $('#evidence_preview').attr('src', e.target.result).removeClass('hidden');
                };
                reader.readAsDataURL(file);
            } else {
                $('#evidence_preview').addClass('hidden');
            }
        });

        // 12. ตรวจสอบ query parameter สำหรับ filter จาก Dashboard
        const urlParams = new URLSearchParams(window.location.search);
        const filterParam = urlParams.get('filter');
        if (filterParam) {
            filterByScore(filterParam);
        }

        // 13. บันทึก Log การเข้าใช้งาน
        await logUserAction('เข้าสู่ระบบงานปกครอง (Admin Management)', 'behavior');

        console.timeEnd('⏱️ Admin Management โหลด');
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ============================================================
// ฟังก์ชันออกจากระบบ
// ============================================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
}

// ============================================================
// โหลดข้อมูลพื้นฐาน
// ============================================================
async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    schoolInfo = data || {};
}

async function loadSystemConfig() {
    const { data } = await db.from('behavior_system_config').select('*').eq('id', 1).maybeSingle();
    systemConfig = data || null;
}

async function loadCriteria() {
    const { data } = await db.from('behavior_criteria').select('*');
    if (data) criteriaList = data;
}

// ============================================================
// Lazy Load: schoolStats (ใช้เฉพาะ export เท่านั้น)
// ============================================================
async function ensureSchoolStats(forceRefresh = false) {
    if (!forceRefresh && schoolStatsCache && cacheTimestamp) {
        const now = Date.now();
        if (now - cacheTimestamp < CACHE_EXPIRY) {
            if (schoolStatsCache.length > 0) return schoolStatsCache;
        }
    }
    if (schoolStatsLoading) {
        while (schoolStatsLoading) { await new Promise(resolve => setTimeout(resolve, 100)); }
        return schoolStatsCache || [];
    }
    schoolStatsLoading = true;
    try {
        const { data, error } = await db
            .from('behavior_student_summary')
            .select('*')
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true })
            .order('student_number', { ascending: true });
        if (error) throw error;
        schoolStatsCache = data || [];
        cacheTimestamp = Date.now();
        return schoolStatsCache;
    } catch (err) {
        console.error('Load schoolStats error:', err);
        return [];
    } finally {
        schoolStatsLoading = false;
    }
}

// ============================================================
// DataTable Server-side (ไม่ใช้ schoolStats)
// ============================================================
function initTableServerSide() {
    if ($.fn.DataTable.isDataTable('#studentTable')) {
        $('#studentTable').DataTable().destroy();
    }
    table = $('#studentTable').DataTable({
        processing: true,
        serverSide: true,
        ajax: function (dtParams, callback, settings) {
            loadTableDataServerSide(dtParams, callback);
        },
        columns: [
            { data: null, title: 'ห้อง', className: 'text-center', render: data => `<span class="text-slate-600 font-medium">${data.roomDisplay || '-'}</span>` },
            { data: 'student_number', title: 'เลขที่', className: 'text-center', render: data => `<span class="font-bold text-gray-600">${data || '-'}</span>` },
            { data: 'sid', title: 'รหัส', render: data => `<span class="font-medium text-slate-700">${data || '-'}</span>` },
            { data: 'fullName', title: 'ชื่อ-สกุล', className: 'font-bold text-blue-800' },
            {
                data: 'score', title: 'คะแนน', className: 'text-center', render: data => {
                    const cls = data < 50 ? 'bg-red-100 text-red-600' : (data >= 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600');
                    return `<span class="px-3 py-1 rounded-lg text-sm font-black ${cls}">${data}</span>`;
                }
            },
            {
                data: 'student_id', title: 'จัดการ', className: 'text-center', orderable: false, render: data =>
                    `<button onclick="viewHistory('${data}')" class="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-sm">
                    <i class="fas fa-eye"></i> ประวัติ
                </button>`
            }
        ],
        order: [[0, 'asc'], [1, 'asc']],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        drawCallback: function (settings) {
            const api = this.api();
            const bodyHtml = $(api.table().body()).html();
            if (bodyHtml && bodyHtml.includes('ไม่พบข้อมูลตามเงื่อนไข') && currentFilter && !classroomTomSelect?.getValue()) {
                const existing = $(api.table().container()).find('.filter-notice');
                if (existing.length === 0) {
                    const filterLabels = {
                        'positive': 'นักเรียนที่มีคะแนนทำความดี',
                        'negative': 'นักเรียนที่มีคะแนนผิดระเบียบ',
                        'high': 'นักเรียนที่มีคะแนนสูงกว่า 100',
                        'low': 'นักเรียนที่มีคะแนนต่ำกว่า 50',
                        'sev_light': 'นักเรียนกลุ่ม 1 (90+ คะแนน)',
                        'sev_medium': 'นักเรียนกลุ่ม 2 (60-89 คะแนน)',
                        'sev_heavy': 'นักเรียนกลุ่ม 3 (30-59 คะแนน)',
                        'sev_very_heavy': 'นักเรียนกลุ่ม 4 (ต่ำกว่า 30 คะแนน)'
                    };
                    const label = filterLabels[currentFilter] || currentFilter;
                    $(api.table().container()).prepend(`
                        <div class="filter-notice bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-sm text-blue-700 flex items-center gap-2">
                            <i class="fas fa-filter"></i>
                            <span>กำลังแสดง: <strong>${label}</strong> <span class="text-xs text-slate-500">(ทั่วทั้งโรงเรียน)</span></span>
                            <button onclick="resetFilter()" class="ml-auto text-xs text-blue-600 hover:underline">ยกเลิกกรอง</button>
                        </div>
                    `);
                }
            } else {
                $(api.table().container()).find('.filter-notice').remove();
            }
        }
    });
}

async function loadTableDataServerSide(dtParams, callback) {
    const { start, length, search, order, draw } = dtParams;
    try {
        let query = db.from('behavior_student_summary')
            .select('*', { count: 'exact', head: false });

        const classroomValue = classroomTomSelect?.getValue();
        if (!currentFilter && classroomValue) {
            const [grade, room] = classroomValue.split('|');
            query = query.eq('grade_level', parseInt(grade)).eq('room_number', room);
        }

        // จำกัดสิทธิ์ตามหัวหน้าระดับ (ถ้าไม่ใช่ admin)
        const isAdmin = window.isAdminUser(actualRole, isAdminMode);
        if (!isAdmin && managedGrades && managedGrades.length > 0) {
            query = query.in('grade_level', managedGrades);
        }

        if (currentFilter) {
            if (currentFilter === 'positive') query = query.gt('pos_score', 0);
            else if (currentFilter === 'negative') query = query.gt('neg_score', 0);
            else if (currentFilter === 'high') query = query.gt('total_score', 100);
            else if (currentFilter === 'low') query = query.lt('total_score', 50);
            else if (currentFilter === 'sev_light') query = query.gte('total_score', 90);
            else if (currentFilter === 'sev_medium') query = query.gte('total_score', 60).lt('total_score', 90);
            else if (currentFilter === 'sev_heavy') query = query.gte('total_score', 30).lt('total_score', 60);
            else if (currentFilter === 'sev_very_heavy') query = query.lt('total_score', 30);
            else if (currentFilter.startsWith('custom_gt_')) {
                const threshold = parseInt(currentFilter.split('_')[2]);
                query = query.gt('total_score', threshold);
            } else if (currentFilter.startsWith('custom_lt_')) {
                const threshold = parseInt(currentFilter.split('_')[2]);
                query = query.lt('total_score', threshold);
            }
        }

        if (search.value) {
            const searchTerm = `%${search.value}%`;
            query = query.or(`student_id_card.ilike.${searchTerm},first_name.ilike.${searchTerm},last_name.ilike.${searchTerm}`);
        }

        if (order && order.length > 0) {
            const colIndex = order[0].column;
            const colNames = ['room_display', 'student_number', 'student_id_card', 'full_name', 'total_score'];
            const colName = colNames[colIndex] || 'grade_level';
            query = query.order(colName, { ascending: order[0].dir === 'asc' });
        }

        const { data, error, count } = await query.range(start, start + length - 1);
        if (error) throw error;

        const formattedData = (data || []).map(row => ({
            student_id: row.student_id,
            roomDisplay: `ม.${row.grade_level}/${row.room_number}`,
            student_number: row.student_number || '-',
            sid: row.student_id_card || '-',
            fullName: row.full_name || '-',
            score: row.total_score || 100
        }));

        callback({ draw: draw, recordsTotal: count || 0, recordsFiltered: count || 0, data: formattedData });
    } catch (err) {
        console.error('Server-side error:', err);
        callback({ draw: dtParams.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
}

// ============================================================
// ฟังก์ชันค้นหานักเรียน (ใช้ฐานข้อมูลโดยตรง)
// ============================================================
async function searchStudent(val) {
    if (val.length < 2) { $('#search_results').hide(); return; }
    try {
        const { data, error } = await db
            .from('behavior_student_summary')
            .select('student_id, student_id_card, full_name, room_display')
            .or(`student_id_card.ilike.%${val}%,full_name.ilike.%${val}%`)
            .limit(10);
        if (error) throw error;
        let html = '';
        if (data && data.length > 0) {
            data.forEach(s => {
                html += `<div onclick="selectStudent('${s.student_id}')" class="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm font-medium text-slate-700">
                         ${s.student_id_card} - ${s.full_name} (${s.room_display})
                         </div>`;
            });
        } else {
            html = '<div class="p-3 text-sm text-slate-400">ไม่พบนักเรียน</div>';
        }
        $('#search_results').html(html).show();
    } catch (err) {
        console.error(err);
        $('#search_results').html('<div class="p-3 text-sm text-red-400">เกิดข้อผิดพลาด</div>').show();
    }
}

async function selectStudent(id) {
    try {
        const { data: student, error } = await db
            .from('behavior_student_summary')
            .select('student_id, student_id_card, full_name, room_display')
            .eq('student_id', id)
            .single();
        if (error || !student) {
            Swal.fire('ไม่พบข้อมูล', 'กรุณาลองค้นหาใหม่', 'error');
            return;
        }
        $('#selected_student_id').val(student.student_id);
        $('#selected_student_name').text(`นักเรียนที่เลือก: ${student.student_id_card} - ${student.full_name} (${student.room_display})`);
        $('#selected_student_info').removeClass('hidden').addClass('flex');
        $('#search_results').hide();
        $('#search_student').val('');
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function clearSelectedStudent() {
    $('#selected_student_id').val('');
    $('#selected_student_info').addClass('hidden').removeClass('flex');
}

// ============================================================
// Modal บันทึกพฤติกรรม (รองรับหัวหน้างานปกครองและหัวหน้าระดับ)
// ============================================================
function openRecordModal(type = 'all') {
    const isSpecial = isDisciplineHead || (managedGrades && managedGrades.length > 0);
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ') && !isSpecial) {
        return;
    }

    $('#recordModal').removeClass('hidden').addClass('flex');
    let html = '<option value="">-- เลือกรายการความประพฤติ --</option>';
    let filteredCriteria = criteriaList;
    if (type !== 'all') {
        filteredCriteria = criteriaList.filter(c => c.category === type);
        if (type === 'positive') $('#modalTitle').html('<i class="fas fa-plus-circle mr-3 text-green-600"></i>เพิ่มคะแนน (ทำความดี)');
        else $('#modalTitle').html('<i class="fas fa-minus-circle mr-3 text-red-600"></i>ตัดคะแนน (ผิดระเบียบ)');
    } else { $('#modalTitle').html('<i class="fas fa-edit mr-3 text-blue-600"></i>บันทึกความประพฤติ'); }
    filteredCriteria.forEach(c => {
        html += `<option value="${c.id}" data-score="${c.category === 'negative' ? -c.default_score : c.default_score}">${c.title} (${c.category === 'negative' ? '-' : '+'}${c.default_score})</option>`;
    });
    $('#criteria_select').html(html);
    $('#score_input').val('');
}

function updateDefaultScore() { $('#score_input').val($('#criteria_select option:selected').data('score')); }
function closeRecordModal() { $('#recordModal').addClass('hidden').removeClass('flex'); $('#evidence_file').val(''); $('#evidence_preview').addClass('hidden'); }

async function resizeImage(file, maxWidth = 1000) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };
        };
    });
}
function blobToBase64(blob) { return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); }); }

async function saveBehaviorRecord() {
    const isSpecial = isDisciplineHead || (managedGrades && managedGrades.length > 0);
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ') && !isSpecial) {
        return;
    }

    const studentId = $('#selected_student_id').val();
    const criteriaId = $('#criteria_select').val();
    const score = parseInt($('#score_input').val());
    const fileInput = $('#evidence_file')[0].files[0];

    if (!studentId || !criteriaId || isNaN(score)) {
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกนักเรียนและเกณฑ์ให้ถูกต้อง', 'warning');
    }
    if (!fileInput) {
        return Swal.fire('กรุณาแนบรูปหลักฐาน', 'ต้องอัปโหลดรูปภาพหลักฐานทุกครั้ง', 'warning');
    }

    const { data: studentCheck, error: checkErr } = await db
        .from('core_students')
        .select('student_id_card')
        .eq('id', studentId)
        .single();
    if (checkErr || !studentCheck) {
        return Swal.fire('ไม่พบข้อมูลนักเรียน', 'กรุณาลองค้นหาใหม่', 'error');
    }
    const studentSid = studentCheck.student_id_card;

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `behavior_${studentSid}_${dateStr}.jpg`;

    let finalImageUrl = null;
    if (fileInput) {
        if (!systemConfig || !systemConfig.gas_url || !systemConfig.drive_folder_id) {
            return Swal.fire('ตั้งค่าไม่สมบูรณ์', 'แอดมินยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive API', 'error');
        }
        try {
            Swal.fire({ title: 'กำลังย่อขนาดและอัปโหลดรูปภาพ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
            const resizedBlob = await resizeImage(fileInput);
            const base64Data = await blobToBase64(resizedBlob);
            const response = await fetch(systemConfig.gas_url, {
                method: "POST",
                body: JSON.stringify({ action: 'upload', base64: base64Data, fileName: fileName, folderId: systemConfig.drive_folder_id })
            });
            const resData = await response.json();
            if (resData.status === 'success') {
                finalImageUrl = resData.url;
            } else {
                throw new Error(resData.message);
            }
        } catch (err) {
            console.error(err);
            return Swal.fire('อัปโหลดรูปไม่สำเร็จ', 'โปรดตรวจสอบการเชื่อมต่อ API ของ Google', 'error');
        }
    }

    Swal.fire({ title: 'กำลังจัดเก็บลงฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('behavior_logs').insert([{
        student_id: studentId,
        criteria_id: criteriaId,
        score_change: score,
        recorder_id: currentUser.id,
        description: $('#description_text').val(),
        evidence_url: finalImageUrl,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester
    }]);

    if (!error) {
        schoolStatsCache = null;
        cacheTimestamp = null;
        await logUserAction(`บันทึกพฤติกรรม ${score} คะแนน ให้ ${studentSid}`, 'behavior');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
        clearSelectedStudent();
        $('#criteria_select').val('');
        $('#score_input').val('');
        $('#description_text').val('');
        closeRecordModal();
        if (table) table.ajax.reload();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

// ============================================================
// ฟังก์ชัน Import/Export (ใช้ requireAdmin)
// ============================================================
function importFromExcel() {
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;
    document.getElementById('excel_import_input').value = '';
    document.getElementById('excel_import_input').click();
}

async function handleExcelImport(input) {
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ')) return;
    const file = input.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) return Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ .xlsx หรือ .xls เท่านั้น', 'error');
    const confirm = await Swal.fire({ title: 'นำเข้าจาก Excel', html: `<div class="text-left"><p class="text-sm text-slate-600 mb-3">ไฟล์ที่เลือก: <span class="font-bold text-blue-700">${file.name}</span></p><div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700"><i class="fas fa-exclamation-triangle mr-1"></i>ระบบจะอ่านข้อมูลจากชีทแรก โดยข้ามแถวที่ไม่มีรหัสนักเรียน<br>คอลัมน์: รหัสนักเรียน*, วันที่/เวลา, รายการ, รายละเอียด, คะแนน*, หลักฐาน (URL), ผู้บันทึก</div></div>`, showCancelButton: true, confirmButtonColor: '#7c3aed', confirmButtonText: '<i class="fas fa-file-import mr-1"></i> นำเข้าเลย', cancelButtonText: 'ยกเลิก' });
    if (!confirm.isConfirmed) return;
    try {
        Swal.fire({ title: 'กำลังอ่านไฟล์ Excel...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false, cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '', range: 2 });
        if (rows.length === 0) return Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลในชีทแรก กรุณาตรวจสอบไฟล์', 'warning');
        await processImportData(rows);
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถอ่านไฟล์ได้', 'error'); }
}

async function processImportData(rows) {
    const normalizedRows = rows.map(function (r) { const norm = {}; Object.keys(r).forEach(function (k) { norm[k.replace(/\*/g, '').trim()] = r[k]; }); return norm; });
    const dataRows = normalizedRows.filter(function (r) { const stdCode = String(r['รหัสนักเรียน'] || '').trim(); return /^\d+$/.test(stdCode); });
    if (dataRows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์ (ตรวจสอบว่ามีคอลัมน์ "รหัสนักเรียน" หรือไม่)');
    Swal.fire({ title: `พบข้อมูล ${dataRows.length} รายการ`, text: 'กำลังประมวลผลและตรวจสอบรหัสนักเรียน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { data: studentsList, error: stuErr } = await db.from('core_students').select('id, student_id_card').limit(10000);
    if (stuErr) throw stuErr;
    const studentMap = {}; (studentsList || []).forEach(s => { studentMap[String(s.student_id_card).trim()] = s.id; });
    const criteriaCache = new Map(); (criteriaList || []).forEach(c => criteriaCache.set(c.title.trim(), c.id));
    const uniqueNewCriteria = new Map();
    dataRows.forEach(row => { const title = String(row['รายการ'] || 'ประวัติจากระบบเก่า (นำเข้า)').trim(); const scoreChange = parseInt(String(row['คะแนน'] || '0').replace(/[^0-9+\-]/g, '')); if (!criteriaCache.has(title) && !isNaN(scoreChange) && scoreChange !== 0) uniqueNewCriteria.set(title, scoreChange); });
    if (uniqueNewCriteria.size > 0) {
        const criteriaToInsert = Array.from(uniqueNewCriteria.entries()).map(([title, score]) => ({ title: title, category: score >= 0 ? 'positive' : 'negative', default_score: Math.abs(score) || 5 }));
        const { data: newCriteriaRecords, error: critErr } = await db.from('behavior_criteria').insert(criteriaToInsert).select();
        if (critErr) throw critErr;
        newCriteriaRecords.forEach(c => { criteriaCache.set(c.title, c.id); if (Array.isArray(criteriaList)) criteriaList.push(c); });
    }
    function parseDateTime(raw) {
        if (!raw || String(raw).trim() === '') return new Date().toISOString();
        const s = String(raw).trim();
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
        if (m) { let [, d, mo, y, hr = '12', mn = '0'] = m; if (parseInt(y) > 2400) y = parseInt(y) - 543; const dt = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hr), parseInt(mn)); if (!isNaN(dt.getTime())) return dt.toISOString(); }
        const dt2 = new Date(s); return !isNaN(dt2.getTime()) ? dt2.toISOString() : new Date().toISOString();
    }
    const logsToInsert = [], errors = [];
    for (const row of dataRows) {
        const stdCode = String(row['รหัสนักเรียน'] || '').trim();
        const title = String(row['รายการ'] || 'ประวัติจากระบบเก่า (นำเข้า)').trim();
        const scoreRaw = String(row['คะแนน'] || '0').replace(/[^0-9+\-]/g, '');
        let scoreChange = parseInt(scoreRaw);
        if (isNaN(scoreChange) || scoreChange === 0) { errors.push(`รหัส ${stdCode}: คะแนน "${row['คะแนน']}" ไม่ถูกต้อง`); continue; }
        const stdUuid = studentMap[stdCode];
        if (!stdUuid) { errors.push(`ไม่พบรหัสนักเรียน: ${stdCode}`); continue; }
        const criteriaId = criteriaCache.get(title);
        if (!criteriaId) continue;
        const desc = String(row['รายละเอียด'] || '').trim();
        const recorder = String(row['ผู้บันทึก'] || '').trim();
        const fullDesc = [desc, recorder ? `ผู้บันทึกเดิม: ${recorder}` : ''].filter(Boolean).join(' | ');
        logsToInsert.push({ student_id: stdUuid, criteria_id: criteriaId, score_change: scoreChange, description: fullDesc || null, evidence_url: String(row['หลักฐาน (URL)'] || row['หลักฐาน'] || '').trim() || null, created_at: parseDateTime(row['วันที่/เวลา']), recorder_id: currentUser.id, academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester });
    }
    if (logsToInsert.length === 0) { const errMsg = errors.slice(0, 5).join('\n'); Swal.fire('ไม่พบข้อมูลที่ใช้ได้', errMsg || 'ตรวจสอบรหัสนักเรียนและคะแนน', 'error'); return; }
    Swal.fire({ title: 'กำลังตรวจสอบรายการซ้ำ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const importStudentIds = [...new Set(logsToInsert.map(l => l.student_id))];
    const DEDUP_BATCH = 50; let existingLogs = [];
    for (let i = 0; i < importStudentIds.length; i += DEDUP_BATCH) { const batchIds = importStudentIds.slice(i, i + DEDUP_BATCH); const { data: batchLogs, error: fetchErr } = await db.from('behavior_logs').select('student_id, created_at, score_change').in('student_id', batchIds); if (fetchErr) throw fetchErr; if (batchLogs) existingLogs = existingLogs.concat(batchLogs); }
    const existingKeys = new Set((existingLogs || []).map(l => { const dt = new Date(l.created_at); const dateKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${dt.getMinutes()}`; return `${l.student_id}|${dateKey}|${l.score_change}`; }));
    const dedupedLogs = []; const dupSkipped = [];
    logsToInsert.forEach(function (log) { const dt = new Date(log.created_at); const dateKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${dt.getMinutes()}`; const key = `${log.student_id}|${dateKey}|${log.score_change}`; if (existingKeys.has(key)) dupSkipped.push(log); else dedupedLogs.push(log); });
    if (dedupedLogs.length === 0) { await Swal.fire({ icon: 'info', title: 'ไม่มีรายการใหม่', html: `<p>ข้อมูลทั้งหมด <b>${dupSkipped.length}</b> รายการมีอยู่ในระบบแล้ว</p><p class="text-sm text-slate-500 mt-1">ระบบข้ามรายการซ้ำทั้งหมด ไม่มีการเพิ่มข้อมูล</p>` }); return; }
    const BATCH = 100; let success = 0;
    for (let i = 0; i < dedupedLogs.length; i += BATCH) { const batchData = dedupedLogs.slice(i, i + BATCH); const { error } = await db.from('behavior_logs').insert(batchData); if (error) throw error; success += batchData.length; }
    const invalidSkip = dataRows.length - logsToInsert.length;
    schoolStatsCache = null;
    cacheTimestamp = null;
    await logUserAction(`นำเข้า Excel: ${success} รายการ`, 'behavior');
    await Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', html: `<div class="text-left space-y-1"><p>✅ เพิ่มใหม่ <b class="text-green-700">${success}</b> รายการ</p>${dupSkipped.length > 0 ? `<p>⏭️ ข้ามซ้ำ <b class="text-blue-600">${dupSkipped.length}</b> รายการ (มีอยู่แล้ว)</p>` : ''}${invalidSkip > 0 ? `<p>⚠️ ข้ามผิดพลาด <b class="text-amber-600">${invalidSkip}</b> รายการ (รหัสไม่พบ/คะแนนผิด)</p>` : ''}</div>${errors.length > 0 ? `<details class="mt-3 text-left"><summary class="text-xs cursor-pointer text-slate-400">รายละเอียด error (${errors.length} รายการ)</summary><pre class="text-xs text-red-400 max-h-28 overflow-y-auto mt-1 bg-red-50 p-2 rounded-lg">${errors.slice(0, 15).join('\n')}</pre></details>` : ''}` });
    if (table) table.ajax.reload();
}

// ============================================================
// ฟังก์ชันกรอง
// ============================================================
function filterByScore(type) {
    currentFilter = type;
    if (classroomTomSelect) classroomTomSelect.clear();
    if (table) table.ajax.reload(null, false);
    Swal.fire({ toast: true, position: 'bottom-end', icon: 'info', title: `กำลังแสดง: ${type}`, showConfirmButton: false, timer: 2000 });
}

function resetFilter() {
    currentFilter = null;
    $('#filter_score_val').val('');
    $('#filter_result_count').text('');
    if (table && typeof table.ajax === 'function') {
        table.ajax.reload(null, false);
    }
    if (table && typeof table.container === 'function') {
        $(table.container()).find('.filter-notice').remove();
    }
}

function filterCustomScore(mode) {
    const val = parseInt($('#filter_score_val').val());
    if (isNaN(val)) { $('#filter_result_count').text(''); return; }
    currentFilter = `custom_${mode}_${val}`;
    if (classroomTomSelect) classroomTomSelect.clear();
    if (table) table.ajax.reload(null, false);
    Swal.fire({ toast: true, position: 'bottom-end', icon: 'info', title: `กำลังแสดง: คะแนน ${mode === 'more' ? '>' : '<'} ${val}`, showConfirmButton: false, timer: 2000 });
}

// ============================================================
// ฟังก์ชันช่วยเขียน Excel
// ============================================================
function _writeExcel(exportData, fileName, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const cols = Object.keys(exportData[0] || {}).map(key => ({ wch: Math.max(key.length * 2, 12) }));
    worksheet['!cols'] = cols;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(workbook, fileName);
    Swal.close();
}

// ============================================================
// ฟังก์ชันส่งออก Excel (ใช้ Lazy load schoolStats)
// ============================================================
async function exportTable() {
    const stats = await ensureSchoolStats();
    if (!stats || stats.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลนักเรียน', 'warning');
        return;
    }

    const { value: exportType } = await Swal.fire({
        title: '<i class="fas fa-file-excel mr-2 text-green-600"></i>ส่งออก Excel',
        html: `<div class="text-left space-y-4 pt-2"><div><p class="text-xs font-bold text-slate-500 mb-2">1. เลือกประเภทรายการ</p><div class="grid grid-cols-2 gap-2"><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_type" value="positive" class="accent-blue-500"><span class="text-sm font-medium text-green-700"><i class="fas fa-plus-circle mr-1"></i>เพิ่มคะแนน</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_type" value="negative" class="accent-blue-500"><span class="text-sm font-medium text-red-700"><i class="fas fa-minus-circle mr-1"></i>ตัดคะแนน</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_type" value="both" class="accent-blue-500"><span class="text-sm font-medium text-blue-700"><i class="fas fa-exchange-alt mr-1"></i>เพิ่ม+ตัดคะแนน</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_type" value="all_students" class="accent-blue-500" checked><span class="text-sm font-medium text-slate-700"><i class="fas fa-users mr-1"></i>นักเรียนทุกคน</span></label></div></div><div><p class="text-xs font-bold text-slate-500 mb-2">2. เลือกช่วงเวลา</p><div class="grid grid-cols-2 gap-2"><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_period" value="day" class="accent-blue-500"><span class="text-sm font-medium"><i class="fas fa-calendar-day mr-1 text-slate-400"></i>รายวัน (วันนี้)</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_period" value="week" class="accent-blue-500"><span class="text-sm font-medium"><i class="fas fa-calendar-week mr-1 text-slate-400"></i>รายสัปดาห์</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_period" value="month" class="accent-blue-500" onchange="document.getElementById('month_picker').classList.toggle('hidden', this.value !== 'month')"><span class="text-sm font-medium"><i class="fas fa-calendar-alt mr-1 text-slate-400"></i>รายเดือน</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_period" value="all" class="accent-blue-500" checked onchange="document.getElementById('month_picker').classList.add('hidden')"><span class="text-sm font-medium"><i class="fas fa-calendar mr-1 text-slate-400"></i>ทั้งหมด</span></label></div><div id="month_picker" class="hidden mt-2 flex gap-2"><select id="sel_month" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">${['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'].map((m, i) => `<option value="${i}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('')}</select><select id="sel_year" class="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">${Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => `<option value="${y}" ${y === new Date().getFullYear() ? 'selected' : ''}>${y + 543}</option>`).join('')}</select></div></div><div><p class="text-xs font-bold text-slate-500 mb-2">3. เลือกระดับชั้น</p><div class="grid grid-cols-3 gap-2"><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="1" class="accent-blue-500"><span class="text-sm font-medium">ม.1</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="2" class="accent-blue-500"><span class="text-sm font-medium">ม.2</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="3" class="accent-blue-500"><span class="text-sm font-medium">ม.3</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="4" class="accent-blue-500"><span class="text-sm font-medium">ม.4</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="5" class="accent-blue-500"><span class="text-sm font-medium">ม.5</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="6" class="accent-blue-500"><span class="text-sm font-medium">ม.6</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="1-3" class="accent-blue-500"><span class="text-sm font-medium">ม.1-3</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="4-6" class="accent-blue-500"><span class="text-sm font-medium">ม.4-6</span></label><label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"><input type="radio" name="exp_grade" value="all" class="accent-blue-500" checked><span class="text-sm font-medium">ทุกระดับ</span></label></div></div></div>`,
        width: '600px', showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: '<i class="fas fa-file-excel mr-1"></i> ส่งออก Excel', cancelButtonText: 'ยกเลิก', focusConfirm: false,
        preConfirm: () => { const type = document.querySelector('input[name="exp_type"]:checked')?.value; const period = document.querySelector('input[name="exp_period"]:checked')?.value; const grade = document.querySelector('input[name="exp_grade"]:checked')?.value; if (!type || !period || !grade) return Swal.showValidationMessage('กรุณาเลือกให้ครบทุกข้อ'); const month = period === 'month' ? parseInt(document.getElementById('sel_month')?.value ?? new Date().getMonth()) : null; const year = period === 'month' ? parseInt(document.getElementById('sel_year')?.value ?? new Date().getFullYear()) : null; return { type, period, grade, month, year }; }
    });
    if (!exportType) return;
    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const now = new Date();
    let dateFrom = null;
    if (exportType.period === 'day') { dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (exportType.period === 'week') { const day = now.getDay(); const diff = (day === 0) ? 6 : day - 1; dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff); }
    else if (exportType.period === 'month') { const m = exportType.month ?? now.getMonth(); const y = exportType.year ?? now.getFullYear(); dateFrom = new Date(y, m, 1); const dateToMonth = new Date(y, m + 1, 0, 23, 59, 59); exportType._dateTo = dateToMonth; }
    let gradeFilter = null;
    if (exportType.grade === '1-3') gradeFilter = [1, 2, 3];
    else if (exportType.grade === '4-6') gradeFilter = [4, 5, 6];
    else if (exportType.grade !== 'all') gradeFilter = [parseInt(exportType.grade)];
    let filteredStudents = stats;
    if (gradeFilter) filteredStudents = filteredStudents.filter(s => gradeFilter.includes(s.grade_level));
    const typeLabel = { positive: 'เพิ่มคะแนน', negative: 'ตัดคะแนน', both: 'เพิ่มและตัดคะแนน', all_students: 'นักเรียนทุกคน' };
    const periodLabel = { day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน', all: 'ทั้งหมด' };
    const gradeLabel = exportType.grade === 'all' ? 'ทุกระดับ' : (exportType.grade === '1-3' ? 'ม.1-3' : (exportType.grade === '4-6' ? 'ม.4-6' : `ม.${exportType.grade}`));
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `ความประพฤติ_${typeLabel[exportType.type]}_${periodLabel[exportType.period]}_${gradeLabel}_${dateStr}.xlsx`;
    const filteredStudentIdSet = gradeFilter ? new Set(filteredStudents.map(s => s.id)) : null;
    if (exportType.type === 'all_students') {
        let periodScores = {};
        if (exportType.period !== 'all') {
            const { data: periodLogs } = await db.from('behavior_logs').select('student_id, score_change').gte('created_at', dateFrom.toISOString());
            (periodLogs || []).forEach(log => { if (filteredStudentIdSet && !filteredStudentIdSet.has(log.student_id)) return; if (!periodScores[log.student_id]) periodScores[log.student_id] = { pos: 0, neg: 0 }; if (log.score_change > 0) periodScores[log.student_id].pos += log.score_change; else periodScores[log.student_id].neg += Math.abs(log.score_change); });
        }
        const exportData = filteredStudents.map(s => { const row = { 'เลขประจำตัว': s.sid, 'ชื่อ-นามสกุล': s.fullName, 'ชั้นเรียน': s.roomDisplay, 'คะแนนปัจจุบัน': s.score }; if (exportType.period !== 'all') { const ps = periodScores[s.id] || { pos: 0, neg: 0 }; row['คะแนนที่ได้รับ (ช่วงนี้)'] = ps.pos; row['คะแนนที่ถูกตัด (ช่วงนี้)'] = ps.neg; } else { row['จำนวนครั้งที่ทำดี'] = s.pos; row['จำนวนครั้งที่ผิดระเบียบ'] = s.neg; } return row; });
        _writeExcel(exportData, fileName, `สรุปคะแนนความประพฤติ (${periodLabel[exportType.period]})`);
        await logUserAction(`ส่งออก Excel (${fileName})`, 'behavior');
        return;
    }
    let logQuery = db.from('behavior_logs').select(`student_id, score_change, description, created_at, behavior_criteria(title, category), student:core_students!student_id(student_id_card, prefix, first_name, last_name, student_enrollments(student_number, core_classrooms(grade_level, room_number))), recorder:core_personnel!recorder_id(prefix, first_name, last_name)`).order('created_at', { ascending: false });
    if (exportType.type === 'positive') logQuery = logQuery.gt('score_change', 0);
    else if (exportType.type === 'negative') logQuery = logQuery.lt('score_change', 0);
    if (dateFrom) logQuery = logQuery.gte('created_at', dateFrom.toISOString());
    const { data: rawLogs, error } = await logQuery.limit(10000);
    if (error) { Swal.close(); return Swal.fire('ผิดพลาด', error.message, 'error'); }
    const logs = filteredStudentIdSet ? (rawLogs || []).filter(log => filteredStudentIdSet.has(log.student_id)) : (rawLogs || []);
    if (!logs || logs.length === 0) { Swal.close(); return Swal.fire('ไม่พบข้อมูล', 'ไม่มีรายการในเงื่อนไขที่เลือก', 'info'); }
    const scoreMap = {}; stats.forEach(s => { scoreMap[s.id] = s.score; });
    const exportData = logs.map(log => { const student = log.student || {}; const enroll = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments; const classroom = enroll?.core_classrooms || {}; const roomDisplay = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-'; const fullName = ((student.prefix || '') + (student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-'; const recorder = log.recorder ? ((log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name).trim() : '-'; const createdAt = new Date(log.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); const categoryLabel = log.behavior_criteria?.category === 'positive' ? 'เพิ่มคะแนน' : 'ตัดคะแนน'; return { 'เลขประจำตัว': student.student_id_card || '-', 'ชื่อ-นามสกุล': fullName, 'ชั้นเรียน': roomDisplay, 'รายการ': log.behavior_criteria?.title || '-', 'ประเภท': categoryLabel, 'คะแนน': log.score_change > 0 ? `+${log.score_change}` : String(log.score_change), 'วันเวลา': createdAt, 'คะแนนปัจจุบัน': scoreMap[log.student_id] ?? '-', 'ผู้บันทึก': recorder, 'รายละเอียด': log.description || '' }; });
    _writeExcel(exportData, fileName, `รายการ${typeLabel[exportType.type]}`);
    await logUserAction(`ส่งออก Excel (${fileName})`, 'behavior');
}

async function exportSummary() {
    const stats = await ensureSchoolStats();
    if (!stats || stats.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลนักเรียน', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { data: allLogs, error } = await db.from('behavior_logs').select('student_id, score_change, created_at');
    if (error) { Swal.close(); return Swal.fire('ผิดพลาด', error.message, 'error'); }
    const logMap = {}; (allLogs || []).forEach(log => { if (!logMap[log.student_id]) logMap[log.student_id] = []; logMap[log.student_id].push(log); });
    const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const dayOfWeek = now.getDay(); const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sorted = [...stats].sort((a, b) => a.grade_level - b.grade_level || a.room_number - b.room_number || String(a.sid).localeCompare(String(b.sid)));
    const exportData = sorted.map(s => { const logs = logMap[s.id] || []; const logsDay = logs.filter(l => new Date(l.created_at) >= startOfDay); const logsWeek = logs.filter(l => new Date(l.created_at) >= startOfWeek); const logsMonth = logs.filter(l => new Date(l.created_at) >= startOfMonth); const posScore = arr => arr.filter(l => l.score_change > 0).reduce((acc, l) => acc + l.score_change, 0); const negScore = arr => arr.filter(l => l.score_change < 0).reduce((acc, l) => acc + Math.abs(l.score_change), 0); return { 'เลขประจำตัว': s.sid, 'ชื่อ-นามสกุล': `${s.prefix}${s.firstName} ${s.lastName}`.trim(), 'ชั้นเรียน': s.roomDisplay, 'คะแนนปัจจุบัน': s.score, 'รวมได้รับ (ทั้งหมด)': posScore(logs), 'รวมถูกตัด (ทั้งหมด)': negScore(logs), 'รวมได้รับ (เดือนนี้)': posScore(logsMonth), 'รวมถูกตัด (เดือนนี้)': negScore(logsMonth), 'รวมได้รับ (สัปดาห์นี้)': posScore(logsWeek), 'รวมถูกตัด (สัปดาห์นี้)': negScore(logsWeek), 'รวมได้รับ (วันนี้)': posScore(logsDay), 'รวมถูกตัด (วันนี้)': negScore(logsDay), 'จำนวนครั้งทำดี': s.pos, 'จำนวนครั้งผิดระเบียบ': s.neg }; });
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `สรุปคะแนนความประพฤติ_${dateStr}.xlsx`;
    _writeExcel(exportData, fileName, 'สรุปคะแนน');
    await logUserAction(`ส่งออกสรุปคะแนน (${fileName})`, 'behavior');
}

// ============================================================
// ฟังก์ชันดูประวัติ (ใช้ฐานข้อมูลโดยตรง)
// ============================================================
function viewHistory(studentId) {
    $('#historyStudentName').text('กำลังโหลด...');
    $('#historyStudentScore').text('-');
    $('#historyAvatar').addClass('hidden');
    $('#historyAvatarWrap').addClass('hidden');
    $('#historyModal').data('studentId', studentId).removeClass('hidden').addClass('flex');

    db.from('core_students')
        .select('id, student_id_card, prefix, first_name, last_name, avatar_students_url, student_enrollments(student_number, core_classrooms(grade_level, room_number)), behavior_logs(score_change)')
        .eq('id', studentId).single()
        .then(({ data: s }) => {
            if (!s) {
                $('#historyStudentName').text('ไม่พบข้อมูล');
                return;
            }
            const enroll = s.student_enrollments?.[0];
            const classroom = enroll?.core_classrooms;
            const roomDisplay = classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
            const totalScore = 100 + (s.behavior_logs?.reduce((sum, l) => sum + l.score_change, 0) || 0);
            const fullName = `${s.prefix || ''}${s.first_name || ''} ${s.last_name || ''}`.trim();
            $('#historyStudentName').text(fullName + ' (' + roomDisplay + ')');
            $('#historyStudentScore').text(totalScore);
            if (s.avatar_students_url) {
                $('#historyAvatar').attr('src', s.avatar_students_url).removeClass('hidden');
                $('#historyAvatarWrap').removeClass('hidden');
            }
        });
    loadStudentHistory(studentId);
}

async function loadStudentHistory(studentId) {
    $('#historyBody').html('<tr><td colspan="6" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>');
    const { data, error } = await db.from('behavior_logs').select('id, criteria_id, score_change, description, evidence_url, created_at, updated_at, behavior_criteria(id, title, category), recorder:core_personnel!recorder_id(prefix, first_name, last_name), updatedBy:core_personnel!updated_by(prefix, first_name, last_name)').eq('student_id', studentId).order('created_at', { ascending: false });
    if (error) { $('#historyBody').html('<tr><td colspan="6" class="text-center py-4 text-red-400">เกิดข้อผิดพลาด: ' + error.message + '</td></tr>'); return; }
    const isSuperAdmin = actualRole === 'super_admin';
    const isAdmin = window.isAdminUser(actualRole, isAdminMode);
    const canEdit = isSuperAdmin || isAdmin || isDisciplineHead;
    const canDelete = isSuperAdmin || isAdmin || isDisciplineHead;
    if (!data || data.length === 0) { $('#historyBody').html('<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่มีประวัติการบันทึก</td></tr>'); return; }
    let html = '';
    data.forEach(function (log) { const date = new Date(log.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); const isPos = log.score_change > 0; const scoreClass = isPos ? 'text-green-600' : 'text-red-600'; const scorePre = isPos ? '+' : ''; const recorder = log.recorder ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name : '-'; const evidenceLink = log.evidence_url ? '<a href="' + log.evidence_url + '" target="_blank" class="text-blue-500 hover:underline text-xs ml-1"><i class="fas fa-image"></i></a>' : ''; let editedLine = ''; if (log.updated_at && log.updated_at !== log.created_at) { const updDate = new Date(log.updated_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); const updBy = log.updatedBy ? (log.updatedBy.prefix || '') + log.updatedBy.first_name + ' ' + log.updatedBy.last_name : '-'; editedLine = '<div class="text-amber-500 text-[10px] mt-0.5"><i class="fas fa-pen mr-1"></i>แก้ไขล่าสุด ' + updDate + ' โดย ' + updBy + '</div>'; } const editBtn = canEdit ? '<button onclick="editLog(\'' + log.id + '\', \'' + studentId + '\')" class="text-blue-300 hover:text-blue-600 transition p-1 rounded-lg hover:bg-blue-50" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>' : ''; const deleteBtn = canDelete ? '<button onclick="deleteLog(\'' + log.id + '\', \'' + studentId + '\')" class="text-red-300 hover:text-red-600 transition p-1 rounded-lg hover:bg-red-50" title="ลบ"><i class="fas fa-trash-alt text-xs"></i></button>' : ''; html += '<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">' + date + '</td><td class="py-2 px-3 text-sm font-medium">' + (log.behavior_criteria ? log.behavior_criteria.title : '-') + '</td><td class="py-2 px-3 text-center font-black ' + scoreClass + '">' + scorePre + log.score_change + '</td><td class="py-2 px-3 text-xs text-slate-500">' + (log.description || '-') + evidenceLink + '<div class="text-slate-400 text-[10px] mt-0.5">บันทึกโดย: ' + recorder + '</div>' + editedLine + '</td><td class="py-2 px-3 text-center whitespace-nowrap">' + editBtn + ' ' + deleteBtn + '</td></tr>'; });
    $('#historyBody').html(html);
}

async function editLog(logId, studentId) {
    const isSpecial = isDisciplineHead;
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ') && !isSpecial) {
        return;
    }
    const { data: log, error } = await db.from('behavior_logs').select('id, criteria_id, score_change, description, evidence_url, behavior_criteria(id, title, category)').eq('id', logId).single();
    if (error || !log) return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลรายการนี้', 'error');
    const curCategory = log.behavior_criteria?.category || 'negative';
    const criteriaOptions = criteriaList.filter(c => c.category === curCategory).map(c => '<option value="' + c.id + '" data-score="' + (c.category === 'negative' ? -c.default_score : c.default_score) + '"' + (c.id === log.criteria_id ? ' selected' : '') + '>' + c.title + ' (' + (c.category === 'negative' ? '-' : '+') + c.default_score + ')</option>').join('');
    const existingImgHtml = log.evidence_url ? `<div class="mt-2"><p class="text-[10px] text-slate-400 mb-1">รูปปัจจุบัน (คลิกเพื่อดู):</p><a href="${log.evidence_url}" target="_blank"><img src="${log.evidence_url}" class="h-20 rounded-xl object-cover border border-slate-200 hover:opacity-80 transition"></a></div>` : '<p class="text-[10px] text-slate-400 mt-1">ยังไม่มีรูปหลักฐาน</p>';
    const { value: formValues } = await Swal.fire({ title: '<i class="fas fa-pen mr-2 text-blue-500"></i>แก้ไขรายการ', width: '660px', html: `<div class="text-left space-y-3"><div><label class="block text-xs font-bold text-slate-500 mb-1">รายการเกณฑ์</label><select id="edit_criteria" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" onchange="document.getElementById('edit_score').value = this.options[this.selectedIndex].dataset.score">${criteriaOptions}</select></div><div><label class="block text-xs font-bold text-slate-500 mb-1">คะแนน</label><input id="edit_score" type="number" value="${log.score_change}" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center font-bold outline-none focus:border-blue-400"></div><div><label class="block text-xs font-bold text-slate-500 mb-1">รายละเอียดเพิ่มเติม</label><textarea id="edit_desc" rows="2" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">${log.description || ''}</textarea></div><div><label class="block text-xs font-bold text-slate-500 mb-1">รูปภาพหลักฐาน <span class="font-normal text-slate-400">(เลือกใหม่เพื่อแทนที่รูปเดิม — ย่อขนาดอัตโนมัติ)</span></label>${existingImgHtml}<input type="file" id="edit_evidence" accept="image/*" class="w-full text-sm mt-2 file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" onchange="const f = this.files[0]; const preview = document.getElementById('edit_new_preview'); if (f) { preview.src = URL.createObjectURL(f); preview.classList.remove('hidden'); } else { preview.classList.add('hidden'); }"><img id="edit_new_preview" class="hidden mt-2 h-28 rounded-xl object-cover border border-blue-200 w-full"></div></div>`, showCancelButton: true, confirmButtonColor: '#2563eb', confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึก', cancelButtonText: 'ยกเลิก', focusConfirm: false, preConfirm: async () => { const criteriaId = document.getElementById('edit_criteria').value; const score = parseInt(document.getElementById('edit_score').value); const desc = document.getElementById('edit_desc').value.trim(); const fileInput = document.getElementById('edit_evidence').files[0]; if (!criteriaId || isNaN(score)) return Swal.showValidationMessage('กรุณาเลือกเกณฑ์และระบุคะแนน'); let newImageUrl = undefined; if (fileInput) { if (!systemConfig?.gas_url || !systemConfig?.drive_folder_id) return Swal.showValidationMessage('ยังไม่ได้ตั้งค่า Google Drive API'); try { const fileName = `behavior_edit_${logId}.jpg`; const resizedBlob = await resizeImage(fileInput); const base64Data = await blobToBase64(resizedBlob); const res = await fetch(systemConfig.gas_url, { method: 'POST', body: JSON.stringify({ action: 'upload', base64: base64Data, fileName: fileName, folderId: systemConfig.drive_folder_id }) }); const resData = await res.json(); if (resData.status === 'success') newImageUrl = resData.url; else return Swal.showValidationMessage('อัปโหลดรูปไม่สำเร็จ: ' + resData.message); } catch (err) { return Swal.showValidationMessage('อัปโหลดรูปไม่สำเร็จ: ' + err.message); } } return { criteriaId, score, desc, newImageUrl }; } });
    if (!formValues) return;
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const updateData = { criteria_id: formValues.criteriaId, score_change: formValues.score, description: formValues.desc, updated_at: new Date().toISOString(), updated_by: currentUser.id };
    if (formValues.newImageUrl !== undefined) updateData.evidence_url = formValues.newImageUrl;
    const { error: updErr } = await db.from('behavior_logs').update(updateData).eq('id', logId);
    if (updErr) return Swal.fire('ผิดพลาด', updErr.message, 'error');
    schoolStatsCache = null;
    cacheTimestamp = null;
    await logUserAction(`แก้ไขรายการ log ${logId}`, 'behavior');
    if (table) table.ajax.reload();
    await loadStudentHistory(studentId);
    Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', timer: 1200, showConfirmButton: false });
}

async function deleteLog(logId, studentId) {
    const isSpecial = isDisciplineHead;
    if (!requireAdmin(actualRole, isAdminMode, 'เฉพาะผู้ดูแลระบบ') && !isSpecial) {
        return;
    }
    const result = await Swal.fire({ title: 'ยืนยันการลบ', text: 'ลบรายการนี้? ไม่สามารถกู้คืนได้', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: '<i class="fas fa-trash-alt mr-1"></i> ลบเลย', cancelButtonText: 'ยกเลิก' });
    if (!result.isConfirmed) return;
    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('behavior_logs').delete().eq('id', logId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');
    schoolStatsCache = null;
    cacheTimestamp = null;
    await logUserAction(`ลบรายการ log ${logId}`, 'behavior');
    if (table) table.ajax.reload();
    await loadStudentHistory(studentId);
    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
}

function closeHistoryModal() { $('#historyModal').addClass('hidden').removeClass('flex'); }

// ============================================================
// ฟังก์ชันโหลดห้องเรียน (TomSelect)
// ============================================================
async function loadClassroomList() {
    const sel = document.getElementById('classroom_select');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- เลือกห้องเรียน --</option>';
    for (let g = 1; g <= 6; g++) {
        const maxRoom = (g <= 3) ? 15 : 12;
        for (let r = 1; r <= maxRoom; r++) {
            const opt = document.createElement('option');
            opt.value = `${g}|${r}`;
            opt.textContent = `ม.${g}/${r}`;
            sel.appendChild(opt);
        }
    }
    if (classroomTomSelect) {
        classroomTomSelect.destroy();
        classroomTomSelect = null;
    }
    classroomTomSelect = new TomSelect('#classroom_select', {
        placeholder: '— เลือกชั้นเรียน —',
        allowEmptyOption: true,
        onChange: function (value) {
            currentFilter = null;
            if (table && typeof table.ajax === 'function') {
                table.ajax.reload(null, false);
            }
            if (table && typeof table.container === 'function') {
                $(table.container()).find('.filter-notice').remove();
            }
        }
    });
    classroomTomSelect.setValue('', true);
}

// ============================================================
// ประกาศฟังก์ชัน global สำหรับ HTML
// ============================================================
window.openRecordModal = openRecordModal;
window.closeRecordModal = closeRecordModal;
window.saveBehaviorRecord = saveBehaviorRecord;
window.updateDefaultScore = updateDefaultScore;
window.searchStudent = searchStudent;
window.selectStudent = selectStudent;
window.clearSelectedStudent = clearSelectedStudent;
window.exportTable = exportTable;
window.exportSummary = exportSummary;
window.importFromExcel = importFromExcel;
window.handleExcelImport = handleExcelImport;
window.filterByScore = filterByScore;
window.resetFilter = resetFilter;
window.filterCustomScore = filterCustomScore;
window.viewHistory = viewHistory;
window.editLog = editLog;
window.deleteLog = deleteLog;
window.closeHistoryModal = closeHistoryModal;
window.logout = logout;

console.log('✅ behavior_admin.js (ฉบับสมบูรณ์ รองรับ Admin, หัวหน้างานปกครอง, หัวหน้าระดับ) loaded');
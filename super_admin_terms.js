// ==========================================
// super_admin_terms.js
// จัดการภาคเรียน (ปีการศึกษา / วันเปิด-ปิด) ส่วนกลาง
// ==========================================

let _academicTermsCache = [];

// ---------- Load ----------
async function loadAcademicTerms() {
    const tbody = document.getElementById('tb-academic-terms');
    if (!tbody) return;

    try {
        const { data, error } = await db
            .from('core_academic_terms')
            .select('*')
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: true });

        if (error) throw error;
        _academicTermsCache = data || [];

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-gray-400">
                <i class="fa-solid fa-inbox text-2xl mb-1 block text-slate-300"></i>
                ยังไม่มีข้อมูล กด "บันทึกภาคเรียน" เพื่อเริ่มต้น
            </td></tr>`;
            return;
        }

        const byYear = {};
        data.forEach(t => {
            if (!byYear[t.academic_year]) byYear[t.academic_year] = {};
            byYear[t.academic_year][t.semester] = t;
        });

        const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

        tbody.innerHTML = years.map(year => {
            const t1 = byYear[year]['1'];
            const t2 = byYear[year]['2'];

            const fmt = (t) => t
                ? `<div class="text-xs leading-relaxed">
                     <div class="text-emerald-700 font-bold"><i class="fa-solid fa-play text-[8px] mr-1"></i>${formatTHDate(t.start_date)}</div>
                     <div class="text-rose-600 font-bold"><i class="fa-solid fa-stop text-[8px] mr-1"></i>${formatTHDate(t.end_date)}</div>
                   </div>`
                : '<span class="text-slate-300 italic text-xs">- ไม่มี -</span>';

            return `
            <tr class="hover:bg-indigo-50/50 transition-colors">
                <td class="py-3 px-4 text-center">
                    <div class="font-bold text-indigo-700 text-base">${year}</div>
                </td>
                <td class="py-3 px-4 text-center">${fmt(t1)}</td>
                <td class="py-3 px-4 text-center">${fmt(t2)}</td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    <button onclick="editAcademicYear('${year}')"
                        class="text-blue-600 hover:bg-blue-100 p-2 rounded-lg transition" title="แก้ไข">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteAcademicYear('${year}')"
                        class="text-rose-600 hover:bg-rose-100 p-2 rounded-lg transition" title="ลบ">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('loadAcademicTerms error:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-red-500">
            Error: ${err.message}</td></tr>`;
    }
}

function formatTHDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

// ---------- Save (upsert ทั้ง 2 ภาคเรียน) ----------
async function saveAcademicTerms(e) {
    e.preventDefault();

    const editYear = document.getElementById('at_edit_year').value.trim();
    const year = document.getElementById('at_year').value.trim();
    const t1Start = document.getElementById('at_t1_start').value;
    const t1End   = document.getElementById('at_t1_end').value;
    const t2Start = document.getElementById('at_t2_start').value;
    const t2End   = document.getElementById('at_t2_end').value;

    if (!year || !t1Start || !t1End || !t2Start || !t2End) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบทุกช่อง', 'warning');
    }
    if (t1Start >= t1End) {
        return Swal.fire('ผิดพลาด', 'วันเปิดเทอม 1 ต้องน้อยกว่าวันปิดเทอม 1', 'error');
    }
    if (t2Start >= t2End) {
        return Swal.fire('ผิดพลาด', 'วันเปิดเทอม 2 ต้องน้อยกว่าวันปิดเทอม 2', 'error');
    }
    if (t1End >= t2Start) {
        return Swal.fire('ผิดพลาด', 'วันปิดเทอม 1 ต้องน้อยกว่าวันเปิดเทอม 2', 'error');
    }

    if (editYear && editYear !== year) {
        const confirm = await Swal.fire({
            icon: 'question', title: 'เปลี่ยนปีการศึกษา?',
            text: `ระบบจะย้ายข้อมูลจากปี ${editYear} ไปเป็นปี ${year}`,
            showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
        });
        if (!confirm.isConfirmed) return;
        await db.from('core_academic_terms').delete().eq('academic_year', editYear);
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    try {
        const now = new Date().toISOString();
        const payload = [
            { academic_year: year, semester: '1', start_date: t1Start, end_date: t1End,
              is_active: true, updated_at: now },
            { academic_year: year, semester: '2', start_date: t2Start, end_date: t2End,
              is_active: true, updated_at: now }
        ];

        const { error } = await db.from('core_academic_terms')
            .upsert(payload, { onConflict: 'academic_year,semester' });
        if (error) throw error;

        clearAcademicTermForm();
        await loadAcademicTerms();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ---------- Edit ----------
function editAcademicYear(year) {
    const yearTerms = _academicTermsCache.filter(t => t.academic_year === year);
    const t1 = yearTerms.find(t => t.semester === '1');
    const t2 = yearTerms.find(t => t.semester === '2');

    document.getElementById('at_edit_year').value = year;
    document.getElementById('at_year').value = year;
    document.getElementById('at_t1_start').value = t1?.start_date || '';
    document.getElementById('at_t1_end').value   = t1?.end_date   || '';
    document.getElementById('at_t2_start').value = t2?.start_date || '';
    document.getElementById('at_t2_end').value   = t2?.end_date   || '';

    document.getElementById('academicTermForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('at_year')?.focus();
}

// ---------- Delete ----------
async function deleteAcademicYear(year) {
    const confirm = await Swal.fire({
        icon: 'warning', title: `ลบปีการศึกษา ${year}?`,
        html: `จะลบทั้ง <b>ภาคเรียนที่ 1</b> และ <b>ภาคเรียนที่ 2</b> ของปีนี้<br>
               <span class="text-xs text-rose-500">ระบบเช็คชื่อจะไม่สามารถดึงวันจากปีนี้ได้อีก</span>`,
        showCancelButton: true, confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_academic_terms').delete().eq('academic_year', year);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    await loadAcademicTerms();
    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
}

// ---------- Clear form ----------
function clearAcademicTermForm() {
    document.getElementById('academicTermForm').reset();
    document.getElementById('at_edit_year').value = '';
}

// ---------- Helper for other modules ----------
async function getCurrentAcademicTerm() {
    const { data, error } = await db
        .from('core_academic_terms')
        .select('*')
        .eq('is_active', true)
        .order('academic_year', { ascending: false })
        .order('semester', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

window.loadAcademicTerms      = loadAcademicTerms;
window.saveAcademicTerms      = saveAcademicTerms;
window.editAcademicYear       = editAcademicYear;
window.deleteAcademicYear     = deleteAcademicYear;
window.clearAcademicTermForm  = clearAcademicTermForm;
window.getCurrentAcademicTerm = getCurrentAcademicTerm;

console.log('✅ super_admin_terms.js loaded');
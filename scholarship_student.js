let currentStudent = null;
$(document).ready(async () => {
    await checkAuth();
    loadStudentData();
    loadApplicationHistory();
    loadReceivedScholarships();
});

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('login.html');
    const { data: profile } = await db.from('core_students').select('*').eq('id', session.user.id).single();
    if (!profile) return window.location.replace('login.html');
    currentStudent = profile;
    $('#studentName').text(`${profile.prefix || ''}${profile.first_name} ${profile.last_name}`);
    $('#studentIdCard').text(`รหัสประจำตัว: ${profile.student_id_card}`);
}

async function loadStudentData() {
    // โหลดข้อมูลนักเรียนและเยี่ยมบ้านสำหรับกรอกฟอร์ม
    const { data: homevisit } = await db.from('module_home_visits').select('*').eq('student_id', currentStudent.id).single();
    // สร้างฟอร์ม (ย่อมาจาก teacher form แต่ไม่ต้องเลือกห้อง) สามารถ reuse HTML ได้
    let html = `<form id="studentScholarshipForm" onsubmit="event.preventDefault();"><div class="space-y-4">
        <div><label>ชื่อ-สกุลบิดา</label><input type="text" id="father_name" value="${homevisit?.father_name||''}" class="w-full border rounded-xl p-2"></div>
        ... (copy fields from teacher form but simplified)
        <button onclick="submitStudentApplication()" class="w-full bg-amber-600 text-white py-3 rounded-xl">ส่งคำขอรับทุน</button>
    </div></form>`;
    $('#applyPanel').html(html);
}
async function submitStudentApplication() { /* similar to teacher's submitApplication */ }
async function loadApplicationHistory() {
    const { data } = await db.from('core_scholarship_applications').select('*').eq('student_id', currentStudent.id).order('created_at', { ascending: false });
    let html = '';
    data?.forEach(app => { html += `<div class="border rounded-xl p-4"><div class="font-bold">${app.status === 'pending' ? 'รอการพิจารณา' : (app.status==='approved'?'อนุมัติ':'ปฏิเสธ')}</div><p>${app.reason?.substring(0,100)}...</p><small>${new Date(app.created_at).toLocaleDateString()}</small></div>`; });
    $('#historyList').html(html || '<p class="text-slate-400">ยังไม่มีประวัติการขอทุน</p>');
}
async function loadReceivedScholarships() {
    const { data } = await db.from('core_scholarships').select('*').eq('student_id', currentStudent.id).order('academic_year', { ascending: false });
    let html = '<table class="w-full text-sm"><thead><tr><th>ปี</th><th>ประเภททุน</th><th>ชื่อทุน</th><th>จำนวนเงิน</th></tr></thead><tbody>';
    data?.forEach(s => { html += `<tr><td>${s.academic_year}</td><td>${s.scholarship_type}</td><td>${s.scholarship_name}</td><td>${s.amount}</td></tr>`; });
    html += '</tbody></table>';
    $('#receivedList').html(html || '<p class="text-slate-400">ไม่เคยได้รับทุน</p>');
}
function showTab(tab) { $('#applyPanel, #historyPanel, #receivedPanel').addClass('hidden'); if(tab==='apply') $('#applyPanel').removeClass('hidden'); else if(tab==='history') $('#historyPanel').removeClass('hidden'); else $('#receivedPanel').removeClass('hidden'); }
async function logout() { await db.auth.signOut(); window.location.href='index.html'; }
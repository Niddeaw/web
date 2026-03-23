dayjs.locale('th');

/* ── State ─────────────────── */
let personnelTable = null;
let allPersonnelData = [];
let personnelMap = new Map(); // id → full data object
let currentUser = null;

/* ── Role Helpers ───────────── */
const isSuperAdmin = () => currentUser?.role === 'super_admin';
// เป็น Admin ถ้าระดับส่วนกลางเป็น admin/super_admin หรือ มีชื่ออยู่ใน local_admins ของระบบนี้
const isAdmin = () => {
    if(currentUser?.role === 'admin' || isSuperAdmin()) return true;
    const localAdmins = window._personnelSettings?.local_admins || [];
    return localAdmins.includes(currentUser?.id);
};
const isTeacher    = () => !isAdmin();
const canEditRecord = (id) => isAdmin() || currentUser?.id === id;
const canDelete     = ()   => isSuperAdmin();

/* ── Position Logic ─────────── */
const posLogic = {
    "ครูอัตราจ้าง":             { academic:["ไม่มีวิทยฐานะ"], rank:"-" },
    "พนักงานราชการ":            { academic:["ไม่มีวิทยฐานะ"], rank:"-" },
    "ครูผู้ช่วย":               { academic:["ไม่มีวิทยฐานะ"], rank:"ครูผู้ช่วย" },
    "ครู": {
        academic:["ไม่มีวิทยฐานะ","ครูชำนาญการ","ครูชำนาญการพิเศษ","ครูเชี่ยวชาญ","ครูเชี่ยวชาญพิเศษ"],
        map:{"ไม่มีวิทยฐานะ":"คศ.1","ครูชำนาญการ":"คศ.2","ครูชำนาญการพิเศษ":"คศ.3","ครูเชี่ยวชาญ":"คศ.4","ครูเชี่ยวชาญพิเศษ":"คศ.5"}
    },
    "รองผู้อำนวยการสถานศึกษา":{
        academic:["รองผู้อำนวยการชำนาญการ","รองผู้อำนวยการชำนาญการพิเศษ"],
        map:{"รองผู้อำนวยการชำนาญการ":"คศ.2","รองผู้อำนวยการชำนาญการพิเศษ":"คศ.3"}
    },
    "ผู้อำนวยการสถานศึกษา":{
        academic:["ผู้อำนวยการชำนาญการพิเศษ"],
        map:{"ผู้อำนวยการชำนาญการพิเศษ":"คศ.3"}
    }
};

/* ── Avatar Helpers ─────────── */
const AV_COLORS=['#6366f1','#3b82f6','#8b5cf6','#10b981','#f43f5e','#f59e0b','#06b6d4','#ec4899'];
function avColor(n){ let h=0; for(let c of(n||'ก')) h=c.charCodeAt(0)+((h<<5)-h); return AV_COLORS[Math.abs(h)%AV_COLORS.length]; }
function setAvatar(elId, name, url){
    const el=document.getElementById(elId);
    if(!el) return;
    if(url){ el.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.background='${avColor(name)}';this.parentElement.innerHTML='${(name||'?').charAt(0)}'">`; el.style.background=''; }
    else { el.innerHTML=(name||'?').charAt(0); el.style.background=avColor(name); }
}

/* ── Tab Logic ──────────────── */
function switchTab(id, btn){
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.tab-pill').forEach(b=>b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(btn) btn.classList.add('active');
    syncPaInfoPanel();
}

/* ── Bootstrap ──────────────── */
window.onload = async () => {
    document.getElementById('mainBody').classList.replace('opacity-0','opacity-100');
    try {
        const {data:{session}} = await db.auth.getSession();
        if(!session){
            Swal.fire({icon:'warning',title:'กรุณาเข้าสู่ระบบ',confirmButtonText:'ไปหน้าล็อกอิน'})
                .then(()=>window.location.replace('index.html')); return;
        }
        const {data:profile} = await db.from('core_personnel').select('*').eq('id',session.user.id).single();
        currentUser = profile || { id:session.user.id, first_name:session.user.email, last_name:'', prefix:'' };
        
        // ✅ แก้ไข: เพิ่มบรรทัดแสดงชื่อบน Navbar กลับเข้ามา
        document.getElementById('display-name').textContent =
            profile ? `${profile.prefix||''}${profile.first_name} ${profile.last_name}` : session.user.email;

        await loadCoreUsers();
        await loadSettings(); 
        await loadPersonnelList();
        applyRoleUI(); 
        renderPAInputs();
        initFlatpickr();
        updatePositionLogic();
    } catch(err){ Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
};

/* ── Apply Role UI ──────────── */
function applyRoleUI(){
    const btnAdd = document.getElementById('btn-add');
    if(btnAdd) btnAdd.style.display = isAdmin() ? '' : 'none';
    const btnSettings = document.getElementById('btn-settings');
    if(btnSettings) btnSettings.style.display = isAdmin() ? 'flex' : 'none';
    const infoBlocks = document.getElementById('info-blocks-section');
    if(infoBlocks) infoBlocks.classList.toggle('hidden', !isAdmin());
    const btnImport = document.getElementById('btn-import');
    const btnTemplate = document.getElementById('btn-template');
    if(btnImport) btnImport.style.display = isAdmin() ? '' : 'none';
    const btnImportSheets = document.getElementById('btn-import-sheets');
    if(btnImportSheets) btnImportSheets.style.display = isAdmin() ? '' : 'none';
    if(btnTemplate) btnTemplate.style.display = isAdmin() ? '' : 'none';
    
    let roleLabel = '🟢 ครูผู้สอน';
    if(isSuperAdmin()) roleLabel = '🔴 Super Admin';
    else if(currentUser?.role === 'admin') roleLabel = '🟡 Admin (ส่วนกลาง)';
    else if(isAdmin()) roleLabel = '🟣 Admin (เฉพาะระบบ)';

    const badge = document.getElementById('role-badge');
    if(badge) badge.textContent = roleLabel;

if(isTeacher()){
        const sel = document.getElementById('inp-personnel-id');
        if(sel){
            sel.value = currentUser.id;
            sel.disabled = true;
            // 🌟 อัปเดต Select2 ให้เปลี่ยนเป็นโหมดเทาๆ (Disabled)
            $('#inp-personnel-id').trigger('change'); 
        }
    }
}

/* ── Settings (Admin/SuperAdmin) ── */
let sysSettings = {};

async function loadSettings(){
    const {data} = await db.from('core_system_modules').select('*').eq('module_id','personnel').single();
    if(data){
        sysSettings = data.settings || {};
        document.getElementById('set-sys-active').checked = data.is_active !== false;
        document.getElementById('set-drive-folder-id').value = sysSettings.drive_folder_id || '';
        document.getElementById('set-oauth-client-id').value = sysSettings.oauth_client_id  || '';
        const lines = [];
        if(sysSettings.drive_folder_id) lines.push(`<p>📁 Drive Folder ID: <code class="bg-white px-1 rounded">${sysSettings.drive_folder_id}</code></p>`);
        if(sysSettings.oauth_client_id)  lines.push(`<p>🔑 OAuth Client ID: <code class="bg-white px-1 rounded">${sysSettings.oauth_client_id.slice(0,30)}...</code></p>`);
        if(lines.length){
            document.getElementById('settings-status').classList.remove('hidden');
            document.getElementById('settings-status-content').innerHTML = lines.join('');
        }
        window._personnelSettings = sysSettings;
    }
}

async function saveSetting(key, value){
    const newSettings = { ...(sysSettings||{}), [key]: value };
    const updates = key === 'is_active'
        ? { is_active: value, updated_at: new Date().toISOString() }
        : { settings: newSettings, updated_at: new Date().toISOString() };

    const {error} = await db.from('core_system_modules').update(updates).eq('module_id','personnel');
    if(error) return Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');

    if(key !== 'is_active') sysSettings = newSettings;
    window._personnelSettings = sysSettings;

    const Toast = Swal.mixin({ toast:true, position:'bottom-end', showConfirmButton:false, timer:2000, timerProgressBar:true });
    Toast.fire({ icon:'success', title:`บันทึก ${key==='is_active'?'สถานะระบบ':key==='drive_folder_id'?'Folder ID':key==='oauth_client_id'?'OAuth Client ID':'แอดมินระบบ'} สำเร็จ` });
    await loadSettings();
}

function openSettings(){
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadSettings().then(() => renderLocalAdmins());
}
function closeSettings(){
    const modal = document.getElementById('settings-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/* ── Local Admin Management ── */
function renderLocalAdmins() {
    const listEl = document.getElementById('list-local-admins');
    if(!listEl) return;
    
    const sel = document.getElementById('sel-add-local-admin');
    if(sel && sel.options.length <= 1 && document.getElementById('inp-personnel-id').options.length > 1) {
        sel.innerHTML = document.getElementById('inp-personnel-id').innerHTML;
    }

    // 🌟 เรียกใช้ Select2 ในหน้าตั้งค่า
    if(sel) {
        $(sel).select2({
            width: '100%',
            dropdownParent: $('#settings-modal')
        });
    }

    // (โค้ดดั้งเดิมที่เหลือของ renderLocalAdmins ปล่อยไว้เหมือนเดิมครับ...)
    listEl.innerHTML = '';
    const admins = window._personnelSettings?.local_admins || [];
    
    if(admins.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 text-center">ยังไม่มีการกำหนดแอดมินเฉพาะระบบ</p>';
        return;
    }

    admins.forEach(id => {
        const user = allPersonnelData.find(u => u.id === id) || {first_name: 'Unknown', last_name: ''};
        listEl.innerHTML += `
            <div class="flex justify-between items-center bg-purple-50 px-3 py-2.5 rounded-xl border border-purple-100 transition hover:bg-purple-100">
                <span class="text-sm text-purple-800 font-semibold"><i class="fas fa-user-shield mr-2 text-purple-400"></i>${user.prefix||''}${user.first_name} ${user.last_name}</span>
                <button onclick="removeLocalAdmin('${id}')" class="h-7 w-7 rounded-lg bg-white text-red-400 hover:text-red-600 shadow-sm flex items-center justify-center transition" title="ถอดสิทธิ์">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>`;
    });
}

async function addLocalAdmin() {
    const sel = document.getElementById('sel-add-local-admin');
    const uid = sel.value;
    if(!uid) return Swal.fire('แจ้งเตือน','กรุณาเลือกบุคลากรก่อน','warning');
    let admins = window._personnelSettings?.local_admins || [];
    if(admins.includes(uid)) return Swal.fire('มีอยู่แล้ว','บุคลากรท่านนี้เป็นแอดมินอยู่แล้ว','info');
    admins.push(uid);
    await saveSetting('local_admins', admins);
    renderLocalAdmins();
    sel.value = '';
}

async function removeLocalAdmin(uid) {
    let admins = window._personnelSettings?.local_admins || [];
    admins = admins.filter(id => id !== uid);
    await saveSetting('local_admins', admins);
    renderLocalAdmins();
}

async function handleLogout(){
    const r = await Swal.fire({title:'ออกจากระบบ?',icon:'warning',showCancelButton:true,
        confirmButtonColor:'#dc2626',confirmButtonText:'ออกจากระบบ',cancelButtonText:'ยกเลิก'});
    if(r.isConfirmed){ await db.auth.signOut(); window.location.replace('index.html'); }
}

/* ── Load Users Dropdown ───── */
async function loadCoreUsers(){
    const {data} = await db.from('core_personnel').select('id,first_name,last_name,prefix').order('first_name');
    const sel = document.getElementById('inp-personnel-id');
    sel.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
    (data||[]).forEach(u => sel.appendChild(new Option(`${u.prefix||''}${u.first_name} ${u.last_name}`, u.id)));

    // 🌟 เรียกใช้ Select2 เพื่อให้กล่องเลือกชื่อ ค้นหา/พิมพ์ได้
    $('#inp-personnel-id').select2({
        width: '100%',
        dropdownParent: $('#modal-container') // สำคัญมาก! ป้องกันพิมพ์หาใน Modal ไม่ได้
    });
}

function onNameSelect(){
    const sel = document.getElementById('inp-personnel-id');
    const name = sel.options[sel.selectedIndex]?.text || '?';
    setAvatar('avatar-display', name, null);
    setAvatar('modal-avatar-display', name, null);
    document.getElementById('modal-subtitle').textContent = name;
}

/* ── Global helpers ── */
function clearDate(displayId, isoId){
    const fp = document.querySelector('#'+displayId)?._flatpickr;
    if(fp) fp.clear();
    const d = document.getElementById(displayId);
    const h = document.getElementById(isoId);
    if(d) d.value = '';
    if(h) h.value = '';
    updateRankCalc();
}

/* ── Flatpickr ──────────────── */
function initFlatpickr(){
    function updateFpYearDisplay(fp){
        const yearEl = fp.calendarContainer?.querySelector('.cur-year');
        if(yearEl) yearEl.value = parseInt(yearEl.value) + 543;
    }

    function makeCfg(hiddenId, displayId){
        return {
            locale:'th',
            dateFormat:'d/m/Y',
            onChange(dates, str){
                if(!dates[0]) return;
                const dd = dates[0];
                const ceY = dd.getFullYear(), ceM = dd.getMonth()+1, ceD = dd.getDate();
                document.getElementById(hiddenId).value =
                    `${ceY}-${String(ceM).padStart(2,'0')}-${String(ceD).padStart(2,'0')}`;
                document.getElementById(displayId).value =
                    `${String(ceD).padStart(2,'0')}/${String(ceM).padStart(2,'0')}/${ceY+543}`;
                updateRankCalc();
            },
            onReady(dates, str, fp){ updateFpYearDisplay(fp); },
            onMonthChange(dates, str, fp){ updateFpYearDisplay(fp); },
            onYearChange(dates, str, fp){
                const yearEl = fp.calendarContainer?.querySelector('.cur-year');
                if(yearEl && parseInt(yearEl.value) < 2400){
                    yearEl.value = parseInt(yearEl.value) + 543;
                }
            }
        };
    }
    flatpickr('#inp-birth',       makeCfg('inp-birth-iso','inp-birth'));
    flatpickr('#inp-gov-start',   makeCfg('inp-gov-start-iso','inp-gov-start'));
    flatpickr('#inp-appoint',     makeCfg('inp-appoint-iso','inp-appoint'));
    flatpickr('#inp-license-exp', makeCfg('inp-license-exp-iso','inp-license-exp'));
}

/* ── Position / Rank Calc ───── */
function updatePositionLogic(){
    const pos=document.getElementById('sel-pos').value;
    const acSel=document.getElementById('sel-academic');
    acSel.innerHTML='';
    (posLogic[pos]?.academic||['ไม่มีวิทยฐานะ']).forEach(a=>acSel.appendChild(new Option(a,a)));
    updateRankCalc();
}

function yearsDiff(isoDate){
    if(!isoDate) return null;
    return dayjs().diff(dayjs(isoDate),'year');
}
function monthsDiff(isoDate){
    if(!isoDate) return null;
    return dayjs().diff(dayjs(isoDate),'month') % 12;
}

function updateRankCalc(){
    const pos  = document.getElementById('sel-pos').value;
    const acad = document.getElementById('sel-academic').value;
    const rank = posLogic[pos]?.map ? (posLogic[pos].map[acad]||'-') : (posLogic[pos]?.rank||'-');
    document.getElementById('inp-rank').value = rank;

    const birthIso = document.getElementById('inp-birth-iso').value;
    if(birthIso){
        const b=dayjs(birthIso);
        const ageY=dayjs().diff(b,'year');
        const ageM=dayjs().diff(b,'month')%12;
        document.getElementById('out-age').value = `${ageY} ปี ${ageM} เดือน`;
        let ry=b.year()+60; if(b.month()>8)ry++;
        document.getElementById('out-retire').value=`พ.ศ. ${ry+543}`;
        const yearsLeft = ry - dayjs().year();
        document.getElementById('out-service-left').value = yearsLeft>0 ? `อีก ${yearsLeft} ปี` : 'เกษียณแล้ว';
    }

    const govIso = document.getElementById('inp-gov-start-iso').value;
    if(govIso){
        const gy=yearsDiff(govIso), gm=monthsDiff(govIso);
        document.getElementById('out-gov-service').value = `${gy} ปี ${gm} เดือน`;
    }

    const apptIso = document.getElementById('inp-appoint-iso').value;
    if(apptIso){
        const py=yearsDiff(apptIso), pm=monthsDiff(apptIso);
        document.getElementById('out-pos-duration').value = `${py} ปี ${pm} เดือน`;
        const eligibleDate = dayjs(apptIso).add(4,'year');
        document.getElementById('out-eligible').value = `${eligibleDate.date().toString().padStart(2,'0')}/${(eligibleDate.month()+1).toString().padStart(2,'0')}/${eligibleDate.year()+543}`;
        const daysLeft = eligibleDate.diff(dayjs(),'day');
        document.getElementById('out-pa-countdown').value = daysLeft>0 ? `อีก ${Math.floor(daysLeft/365)} ปี ${Math.floor((daysLeft%365)/30)} เดือน` : 'ครบแล้ว ✅';
    }

    const licIso = document.getElementById('inp-license-exp-iso').value;
    if(licIso){
        const dl=dayjs(licIso).diff(dayjs(),'day');
        const licExp = dayjs(licIso);
        const now    = dayjs();
        const licY   = Math.abs(licExp.diff(now, 'year'));
        const licM   = Math.abs(licExp.diff(now.add(licY*(dl<0?-1:1),'year'), 'month'));
        let licStatus = '', licClass = '';
        if(dl < 0){
            licStatus = `❌ หมดอายุแล้ว ${licY>0?licY+' ปี ':''} ${licM} เดือน`;
            licClass  = 'auto-red';
        } else if(dl <= 30){
            licStatus = `⚠️ เหลืออีก ${dl} วัน`;
            licClass  = 'auto-red';
        } else if(dl <= 365){
            licStatus = `⚠️ เหลืออีก ${licM} เดือน ${dl%30} วัน`;
            licClass  = 'auto-orange';
        } else {
            licStatus = `✅ เหลืออีก ${licY} ปี ${licM} เดือน`;
            licClass  = 'auto-green';
        }
        document.getElementById('out-license-status').value = licStatus;
        document.getElementById('out-license-status').className = 'field-input ' + licClass;
    }

    syncPaInfoPanel();
}

function syncPaInfoPanel(){
    document.getElementById('pa-info-eligible').textContent = document.getElementById('out-eligible').value || '-';
    document.getElementById('pa-info-countdown').textContent = document.getElementById('out-pa-countdown').value || '-';
    document.getElementById('pa-info-duration').textContent = document.getElementById('out-pos-duration').value || '-';
}

/* ── PA Inputs ──────────────── */
const PA_YEARS = [2565,2566,2567,2568,2569,2570];
function renderPAInputs(saved={}){
    const el=document.getElementById('pa-container');
    el.innerHTML='';
    const canEdit = isAdmin(); 

    PA_YEARS.forEach(y=>{
        const v=saved[`pa_${y}`]||'';
        
        let inputHtml = '';
        if(canEdit) {
            inputHtml = `
                <div class="flex gap-2">
                    <input type="text" id="pa-${y}" value="${v}" placeholder="วาง Link Google Drive / URL"
                        class="flex-1 text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition bg-white">
                    <button type="button" onclick="previewPA(${y})"
                        class="bg-white p-2.5 border border-slate-200 rounded-xl text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition shadow-sm" title="เปิดดู">
                        <i class="fas fa-external-link-alt text-xs"></i>
                    </button>
                </div>`;
        } else {
            inputHtml = `
                <input type="hidden" id="pa-${y}" value="${v}">
                <div class="flex items-center gap-2">
                    ${v ? 
                        `<button type="button" onclick="previewPA(${y})" class="w-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-indigo-200 shadow-sm">
                            <i class="fas fa-file-pdf"></i> เปิดดูเอกสาร PA3
                        </button>`
                        : 
                        `<div class="w-full bg-slate-50 text-slate-400 p-2.5 rounded-xl text-xs text-center border border-slate-200 border-dashed">
                            ยังไม่มีการแนบไฟล์
                        </div>`
                    }
                </div>`;
        }

        el.insertAdjacentHTML('beforeend',`
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-indigo-200 transition space-y-2">
                <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">ไฟล์ PA3 ปี ${y}</p>
                ${inputHtml}
            </div>`);
    });
}
function previewPA(y){
    const u=document.getElementById(`pa-${y}`).value.trim();
    if(!u) return Swal.fire('ไม่มีลิงก์',`ยังไม่ได้ใส่ลิงก์ PA3 ปี ${y}`,'info');
    window.open(u,'_blank');
}
function collectPA(){
    const pa={};
    PA_YEARS.forEach(y=>{ const el=document.getElementById(`pa-${y}`); if(el?.value.trim()) pa[`pa_${y}`]=el.value.trim(); });
    return pa;
}

/* ── Avatar Preview ─────────── */
function parseDriveUrl(url){
    if(!url||!url.trim()) return null;
    url = url.trim();
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    m = url.match(/\/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    if(url.startsWith('http')) return url;
    return null;
}

function applyAvatarUrl(rawUrl){
    const url = parseDriveUrl(rawUrl);
    if(!url){ return; }
    document.getElementById('inp-avatar-data').value = url;
    document.getElementById('inp-avatar-url').value = rawUrl;
    const el = document.getElementById('avatar-display');
    el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;"
        onerror="this.parentElement.innerHTML=this.parentElement.dataset.init; Swal.fire('โหลดรูปไม่ได้','ลิงค์ไม่ถูกต้องหรือรูปเป็น Private','warning');">`;
    el.style.background='';
    document.getElementById('modal-avatar-display').innerHTML =
        `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
}

let _pendingAvatarFile = null;

function previewAvatar(input){
    const file = input.files[0]; if(!file) return;
    _pendingAvatarFile = file;

    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image(); img.src = e.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 600; let sc = MAX/Math.max(img.width,img.height); if(sc>1)sc=1;
            canvas.width = img.width*sc; canvas.height = img.height*sc;
            canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
            const previewUrl = canvas.toDataURL('image/jpeg',0.8);

            document.getElementById('avatar-display').innerHTML=`<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;">`;
            document.getElementById('avatar-display').style.background='';
            document.getElementById('modal-avatar-display').innerHTML=`<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
            document.getElementById('inp-avatar-url').value='';
            document.getElementById('inp-avatar-data').value='';

            const badge = document.getElementById('avatar-upload-badge');
            if(badge){ badge.classList.remove('hidden'); }
        };
    };
    reader.readAsDataURL(file);
}

function clearAvatar(){
    document.getElementById('inp-avatar-data').value='';
    document.getElementById('inp-avatar-url').value='';
    const name = document.getElementById('inp-personnel-id').options[document.getElementById('inp-personnel-id').selectedIndex]?.text||'?';
    setAvatar('avatar-display', name, null);
}

/* ── Upload Avatar to Google Drive ── */
async function _googleSignIn(clientId){
    if(!window.google?.accounts?.oauth2){
        await new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.onload = resolve;
            document.head.appendChild(s);
        });
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response) => {
            if(response.access_token){
                window._googleAccessToken = response.access_token;
                Swal.fire({icon:'success', title:'ล็อกอิน Google สำเร็จ!', timer:1200, showConfirmButton:false});
            } else {
                Swal.fire('ยกเลิก','ไม่ได้ล็อกอิน Google','warning');
            }
        }
    });
    tokenClient.requestAccessToken();
}

async function uploadFileToDrive(file, personId){
    const settings = window._personnelSettings || {};
    const folderId = settings.drive_folder_id;
    const clientId = settings.oauth_client_id;

    if(!folderId || !clientId){
        Swal.fire({
            icon:'info', title:'ยังไม่ตั้งค่า Google Drive',
            html:`<p class="text-sm text-slate-600">กรุณาไปที่ <b>⚙️ ตั้งค่าระบบ</b> แล้วระบุ<br>
                  <b>Folder ID</b> และ <b>OAuth Client ID</b> ก่อนอัปโหลดรูป</p>`,
            confirmButtonText:'ไปตั้งค่า',
            showCancelButton:true, cancelButtonText:'ยกเลิก'
        }).then(r=>{ if(r.isConfirmed) openSettings(); });
        return null;
    }

    let token = window._googleAccessToken;
    if(!token){
        token = await requestGoogleToken(clientId);
        if(!token) return null;
    }

    Swal.fire({title:'กำลังอัปโหลดรูปไป Google Drive...', allowOutsideClick:false, showConfirmButton:false, didOpen:()=>Swal.showLoading()});
    try{
        const resizedBlob = await resizeImageBlob(file, 600);
        const fileName = `avatar_${personId}_${Date.now()}.jpg`;

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({name:fileName, parents:[folderId]})], {type:'application/json'}));
        form.append('file', resizedBlob, fileName);

        const uploadRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
            { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form }
        );

        if(uploadRes.status===401){
            window._googleAccessToken = null;
            token = await requestGoogleToken(clientId);
            if(!token) throw new Error('Google authentication failed');
            const retryForm = new FormData();
            retryForm.append('metadata', new Blob([JSON.stringify({name:fileName, parents:[folderId]})], {type:'application/json'}));
            retryForm.append('file', resizedBlob, fileName);
            const retryRes = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
                { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:retryForm }
            );
            if(!retryRes.ok) throw new Error((await retryRes.json()).error?.message||'Upload failed');
            const retryData = await retryRes.json();
            await setDrivePublic(retryData.id, token);
            Swal.close();
            return `https://drive.google.com/thumbnail?id=${retryData.id}&sz=w400`;
        }

        if(!uploadRes.ok) throw new Error((await uploadRes.json()).error?.message||'Upload failed');
        const fileData = await uploadRes.json();
        await setDrivePublic(fileData.id, token);
        Swal.close();
        return `https://drive.google.com/thumbnail?id=${fileData.id}&sz=w400`;

    } catch(err){
        Swal.close();
        console.error('Drive upload error:', err);
        return null;
    }
}

async function setDrivePublic(fileId, token){
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ role:'reader', type:'anyone' })
    });
}

async function resizeImageBlob(file, maxSize){
    return new Promise(resolve=>{
        const reader = new FileReader();
        reader.onload = e=>{
            const img = new Image(); img.src = e.target.result;
            img.onload = ()=>{
                const canvas = document.createElement('canvas');
                let sc = maxSize/Math.max(img.width,img.height); if(sc>1)sc=1;
                canvas.width=img.width*sc; canvas.height=img.height*sc;
                canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
                canvas.toBlob(blob=>resolve(blob),'image/jpeg',0.85);
            };
        };
        reader.readAsDataURL(file);
    });
}

function requestGoogleToken(clientId){
    return new Promise(resolve=>{
        if(!window.google?.accounts?.oauth2){
            const s=document.createElement('script');
            s.src='https://accounts.google.com/gsi/client';
            s.onload=()=>doRequestToken(clientId, resolve);
            document.head.appendChild(s);
        } else { doRequestToken(clientId, resolve); }
    });
}

function doRequestToken(clientId, resolve){
    const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback(response){
            if(response.access_token){
                window._googleAccessToken = response.access_token;
                resolve(response.access_token);
            } else { resolve(null); }
        },
        error_callback(){ resolve(null); }
    });
    client.requestAccessToken({prompt:'consent'});
}

/* ── License Check ──────────── */
function checkLicense(){
    const num=document.getElementById('inp-license-number').value.trim();
    if(!num) return Swal.fire('ไม่มีเลขที่','กรุณากรอกเลขที่ใบอนุญาตก่อน','info');
    window.open(`https://www.ksp.or.th/ksp2018/license-check/?license=${encodeURIComponent(num)}`, '_blank');
}

/* ── Modal ──────────────────── */
function resetHiddens(){
    _pendingAvatarFile = null;
    const badge=document.getElementById('avatar-upload-badge'); if(badge) badge.classList.add('hidden');
    ['edit-id','inp-avatar-data','inp-avatar-url','inp-birth-iso','inp-gov-start-iso','inp-appoint-iso','inp-license-exp-iso']
        .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    ['out-age','out-retire','out-service-left','out-gov-service','out-pos-duration',
     'out-eligible','out-pa-countdown','out-license-status','inp-rank']
        .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
}

function openModal(mode, data=null){
    document.getElementById('main-form').reset();
    
    // 🌟 รีเซ็ตค่ากล่องค้นหาเมื่อเปิดฟอร์มใหม่
    $('#inp-personnel-id').val('').trigger('change'); 

    resetHiddens();
    setAvatar('avatar-display','?',null);
    setAvatar('modal-avatar-display','?',null);
    document.getElementById('modal-subtitle').textContent='กรอกข้อมูลให้ครบถ้วน';
    document.getElementById('out-license-status').className='field-input auto-green';
    updatePositionLogic();
    renderPAInputs();
    switchTab('tab-personal', document.querySelector('.tab-pill'));

    if(mode==='edit'&&data){ populateForm(data); document.getElementById('btn-submit').innerHTML='<i class="fas fa-floppy-disk"></i> อัปเดตข้อมูล'; }
    else { document.getElementById('modal-title').textContent='บันทึกข้อมูลบุคลากร'; document.getElementById('btn-submit').innerHTML='<i class="fas fa-floppy-disk"></i> บันทึกข้อมูล'; }

    const mc=document.getElementById('modal-container');
    mc.classList.remove('hidden'); mc.classList.add('flex');
}
function closeModal(){
    const mc=document.getElementById('modal-container');
    mc.classList.add('hidden'); mc.classList.remove('flex');
}

function isoToBE(iso){
    if(!iso) return '';
    const parts = String(iso).split('-');
    const storedYear = parseInt(parts[0]);
    const correctedIso = storedYear >= 2300
        ? `${storedYear - 543}-${parts[1]}-${parts[2]}`
        : iso;
    const d = dayjs(correctedIso);
    if(!d.isValid()) return '';
    return `${String(d.date()).padStart(2,'0')}/${String(d.month()+1).padStart(2,'0')}/${d.year()+543}`;
}

function populateForm(p){
    const fullName=`${p.prefix||''}${p.first_name} ${p.last_name}`;
    document.getElementById('modal-title').textContent=`แก้ไข: ${fullName}`;
    document.getElementById('modal-subtitle').textContent=fullName;
    document.getElementById('edit-id').value=p.id||'';
    
    document.getElementById('inp-personnel-id').value=p.id||'';
    // 🌟 สั่งให้ Select2 เปลี่ยนชื่อโชว์ตามข้อมูลที่ดึงมา
    $('#inp-personnel-id').trigger('change'); 
    
    document.getElementById('inp-cid').value=p.national_id||'';
    document.getElementById('inp-phone').value=p.phone||'';
    document.getElementById('sel-learning-area').value=p.department||'';
    document.getElementById('inp-position-number').value=p.position_number||'';
    document.getElementById('inp-license-number').value=p.license_number||'';
    document.getElementById('sel-pa-status').value=p.pa_status||'';
    if(p.position) document.getElementById('sel-pos').value=p.position;
    updatePositionLogic();
    if(p.academic_standing) document.getElementById('sel-academic').value=p.academic_standing;
    const setDate=(isoId, displayId, iso)=>{
        if(!iso) return;
        const parts = iso.split('-');
        let y=parseInt(parts[0]), m=parseInt(parts[1]), d=parseInt(parts[2]);
        if(y >= 2300){ y = y - 543; }
        const ceIso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        document.getElementById(isoId).value = ceIso;
        const fpEl = document.querySelector(`#${displayId}`)._flatpickr;
        if(fpEl){ fpEl.setDate(new Date(y, m-1, d, 12), false); }
        document.getElementById(displayId).value =
            `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y+543}`;
    };
    setDate('inp-birth-iso','inp-birth',p.birth_date);
    setDate('inp-gov-start-iso','inp-gov-start',p.government_start_date);
    setDate('inp-appoint-iso','inp-appoint',p.appointment_date);
    setDate('inp-license-exp-iso','inp-license-exp',p.license_expiry);
    updateRankCalc();
    setAvatar('avatar-display', p.first_name, p.avatar_url||null);
    setAvatar('modal-avatar-display', p.first_name, p.avatar_url||null);
    if(p.avatar_url){
        document.getElementById('inp-avatar-data').value=p.avatar_url;
        document.getElementById('inp-avatar-url').value=p.avatar_url;
    }
    renderPAInputs(p.pa_docs||{});
}

/* ── SAVE ───────────────────── */
async function savePersonnel(e){
    e.preventDefault();
    const btn=document.getElementById('btn-submit');
    btn.disabled=true;
    btn.innerHTML='<i class="fas fa-circle-notch fa-spin mr-2"></i>กำลังบันทึก...';
    try{
        const userId  = document.getElementById('inp-personnel-id').value;
        const editId  = document.getElementById('edit-id').value;
        const targetId= editId||userId;
        if(!targetId) throw new Error('กรุณาเลือกชื่อบุคลากร');
        if(!canEditRecord(targetId)) throw new Error('คุณไม่มีสิทธิ์แก้ไขข้อมูลของบุคลากรท่านอื่น');

        if(_pendingAvatarFile){
            const driveUrl = await uploadFileToDrive(_pendingAvatarFile, targetId);
            if(driveUrl){
                document.getElementById('inp-avatar-data').value = driveUrl;
                document.getElementById('inp-avatar-url').value = driveUrl;
                _pendingAvatarFile = null;
                const badge = document.getElementById('avatar-upload-badge');
                if(badge) badge.classList.add('hidden');
            } else {
                const r = await Swal.fire({
                    title:'Upload รูปไม่สำเร็จ',
                    html:'<p class="text-sm">อัปโหลดรูปไปยัง Google Drive ไม่สำเร็จ<br>ต้องการบันทึกข้อมูลโดยไม่มีรูปภาพหรือไม่?</p>',
                    icon:'warning', showCancelButton:true,
                    confirmButtonText:'บันทึกแบบไม่มีรูป', cancelButtonText:'ยกเลิก'
                });
                if(!r.isConfirmed){ btn.disabled=false; btn.innerHTML='<i class="fas fa-floppy-disk"></i> บันทึกข้อมูล'; return; }
            }
        }

        const payload={
            id:                 targetId,
            national_id:        document.getElementById('inp-cid').value.trim()||null,
            phone:              document.getElementById('inp-phone').value.trim()||null,
            department:         document.getElementById('sel-learning-area').value||null,
            position:           document.getElementById('sel-pos').value,
            position_number:    document.getElementById('inp-position-number').value.trim()||null,
            academic_standing:  document.getElementById('sel-academic').value,
            rank:               document.getElementById('inp-rank').value||null,
            birth_date:         document.getElementById('inp-birth-iso').value||null,
            government_start_date: document.getElementById('inp-gov-start-iso').value||null,
            appointment_date:   document.getElementById('inp-appoint-iso').value||null,
            license_number:     document.getElementById('inp-license-number').value.trim()||null,
            license_expiry:     document.getElementById('inp-license-exp-iso').value||null,
            pa_status:          document.getElementById('sel-pa-status').value||null,
            pa_docs:            collectPA(),
            avatar_url:         document.getElementById('inp-avatar-data').value||null,
        };

        const { id: _id, ...updatePayload } = payload;
        const {error}=await db.from('core_personnel').update(updatePayload).eq('id', targetId);
        if(error) throw error;

        await Swal.fire({icon:'success',title:'บันทึกสำเร็จ!',timer:1600,showConfirmButton:false});
        closeModal();
        await loadPersonnelList();
    } catch(err){
        Swal.fire('เกิดข้อผิดพลาด',err.message,'error');
    } finally {
        btn.disabled=false;
        btn.innerHTML='<i class="fas fa-floppy-disk"></i> บันทึกข้อมูล';
    }
}

/* ── DELETE ─────────────────── */
async function deletePersonnel(id, name){
    if(!canDelete()) return Swal.fire('ไม่มีสิทธิ์','เฉพาะ Super Admin เท่านั้นที่สามารถลบข้อมูลได้','warning');
    const r=await Swal.fire({
        title:`ลบข้อมูล "${name}"?`,
        html:'<span class="text-sm text-red-500">ข้อมูลบุคลากรจะถูกล้าง (บัญชีผู้ใช้ยังคงอยู่)</span>',
        icon:'warning',showCancelButton:true,confirmButtonColor:'#dc2626',
        confirmButtonText:'ลบข้อมูล',cancelButtonText:'ยกเลิก'
    });
    if(!r.isConfirmed) return;
    const {error}=await db.from('core_personnel').update({
        national_id:null,phone:null,department:null,position:null,position_number:null,
        academic_standing:null,rank:null,birth_date:null,government_start_date:null,
        appointment_date:null,license_number:null,license_expiry:null,
        pa_status:null,pa_docs:null,avatar_url:null
    }).eq('id',id);
    if(error) return Swal.fire('ผิดพลาด',error.message,'error');
    Swal.fire({icon:'success',title:'ลบข้อมูลแล้ว',timer:1400,showConfirmButton:false});
    await loadPersonnelList();
}

/* ── LOAD LIST ──────────────── */
async function loadPersonnelList(){
    let query = db.from('core_personnel').select('*').order('first_name');
    if(isTeacher() && currentUser?.id) query = query.eq('id', currentUser.id);
    const {data,error}= await query;
    if(error){ console.error(error); return; }
    allPersonnelData=data||[];

    if(personnelTable){ personnelTable.destroy(); personnelTable=null; }
    personnelMap.clear(); 
    const tbody=document.getElementById('main-tbody');
    tbody.innerHTML='';
    const today=dayjs(), cyBE=today.year()+543;

    allPersonnelData.forEach(p=>{
        const fullName=`${p.prefix||''}${p.first_name} ${p.last_name}`;
        const avHtml = p.avatar_url
            ? `<img src="${p.avatar_url}" style="width:38px;height:38px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'">`
            : `<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;color:#fff;background:${avColor(p.first_name)};flex-shrink:0;">${(p.first_name||'?').charAt(0)}</div>`;

        const ageY = p.birth_date ? dayjs().diff(dayjs(p.birth_date),'year') : null;

        let retireHtml='<span class="text-slate-400 text-xs">-</span>';
        if(p.birth_date){
            const b=dayjs(p.birth_date); let ry=b.year()+60; if(b.month()>8)ry++;
            const rBE=ry+543;
            retireHtml=rBE===cyBE
                ?`<span class="badge badge-orange">⚠️ ${rBE}</span>`
                :`<span class="text-slate-600 text-sm">${rBE}</span>`;
        }

        let govHtml='<span class="text-slate-400 text-xs">-</span>';
        if(p.government_start_date){
            const gy=yearsDiff(p.government_start_date);
            govHtml=`<span class="text-slate-600 text-sm">${gy} ปี</span>`;
        }

        const paMap={'ผ่าน':'badge-blue','กำลังดำเนินการ':'badge-orange','ไม่ผ่าน':'badge-red','ยังไม่ดำเนินการ':'badge-gray'};
        const paHtml=p.pa_status
            ?`<span class="badge ${paMap[p.pa_status]||'badge-gray'}">${p.pa_status}</span>`
            :`<span class="text-slate-300 text-xs">-</span>`;

        let licHtml='<span class="text-slate-400 text-xs">-</span>';
        if(p.license_expiry){
            const dl=dayjs(p.license_expiry).diff(today,'day');
            const expStr=isoToBE(p.license_expiry);
            if(dl<0)        licHtml=`<span class="badge badge-red">หมดแล้ว</span>`;
            else if(dl<=30) licHtml=`<span class="badge badge-red">⚠️ ${dl} วัน</span>`;
            else if(dl<=90) licHtml=`<span class="badge badge-orange">${expStr}</span>`;
            else            licHtml=`<span class="text-slate-500 text-xs">${expStr}</span>`;
        }

// เก็บ data ใน Map
        personnelMap.set(p.id, p);

        // 🌟 เพิ่มเงื่อนไข: ตรวจสอบว่ามีสิทธิ์ลบหรือไม่ (ถ้าไม่มีให้ปุ่มเป็นค่าว่าง)
        const deleteBtnHtml = canDelete() 
            ? `<button onclick="deletePersonnel('${p.id}','${fullName.replace(/'/g,"\\'")}')"
                    class="h-8 w-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition flex items-center justify-center" title="ลบ">
                    <i class="fas fa-trash text-xs"></i>
               </button>` 
            : '';

        tbody.insertAdjacentHTML('beforeend',`
            <tr class="hover:bg-indigo-50/40 transition-colors">
                <td class="py-3 px-3">
                    <div class="flex items-center gap-3">
                        ${avHtml}
                        <div>
                            <p class="font-semibold text-slate-800 text-sm leading-tight">${fullName}</p>
                            <p class="text-[10px] text-slate-400">${p.national_id||'ไม่มีข้อมูล'}</p>
                        </div>
                    </div>
                </td>
                <td>
                    <p class="text-sm font-medium text-slate-700">${p.position||'-'}</p>
                    <p class="text-xs text-indigo-600 font-medium">${p.academic_standing||''}</p>
                    <p class="text-[10px] text-slate-400">${p.rank||''} ${p.position_number?'| เลขที่ '+p.position_number:''}</p>
                </td>
                <td><span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-medium">${p.department||'-'}</span></td>
                <td class="text-center text-sm">${ageY!=null?`${ageY} ปี`:'-'}</td>
                <td class="text-center">${retireHtml}</td>
                <td class="text-center">${govHtml}</td>
                <td class="text-center">${licHtml}</td>
                <td class="text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick='editPersonnel("${p.id}")'
                            class="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition flex items-center justify-center" title="แก้ไข">
                            <i class="fas fa-pen text-xs"></i>
                        </button>
                        ${deleteBtnHtml}
                    </div>
                </td>
            </tr>`);
    });

    personnelTable=new DataTable('#personnelTable',{
        language:{url:'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'},
        responsive:true, scrollX:true, pageLength:25,
        columnDefs:[{orderable:false,targets:[0,7]}],
        layout:{topStart:'pageLength',topEnd:'search',bottomStart:'info',bottomEnd:'paging'}
    });
    updateDashboard(allPersonnelData);
}

function editPersonnel(id){
    const data = personnelMap.get(id);
    if(!data) return Swal.fire('ไม่พบข้อมูล','','warning');
    openModal('edit', data);
}

/* ── Dashboard ──────────────── */
function updateDashboard(data){
    const today=dayjs(), cyBE=today.year()+543;
    let retire=0,lic=0,eligible=0,paPass=0,paProc=0;
    data.forEach(p=>{
        if(p.birth_date){ const b=dayjs(p.birth_date); let ry=b.year()+60; if(b.month()>8)ry++; if(ry+543===cyBE)retire++; }
        if(p.license_expiry){ const dl=dayjs(p.license_expiry).diff(today,'day'); if(dl>=0&&dl<=30)lic++; }
        if(p.appointment_date&&p.position==='ครู'&&p.academic_standing==='ไม่มีวิทยฐานะ'){
            if(today.diff(dayjs(p.appointment_date),'year')>=4)eligible++;
        }
        if(p.pa_status==='ผ่าน') paPass++;
        if(p.pa_status==='กำลังดำเนินการ') paProc++;
    });
    document.getElementById('stat-total').textContent=data.length;
    document.getElementById('stat-retire').textContent=retire;
    document.getElementById('stat-license').textContent=lic;
    document.getElementById('stat-eligible').textContent=eligible;
    document.getElementById('stat-pa-pass').textContent=paPass;
    document.getElementById('stat-pa-proc').textContent=paProc;
    renderInfoBlocks(data);
}

/* ── Info Blocks ─────────────── */
function renderInfoBlocks(data){
    const today = dayjs();

    const acadMap = {};
    data.forEach(p=>{
        const k = p.academic_standing || 'ไม่มีวิทยฐานะ';
        acadMap[k] = (acadMap[k]||0) + 1;
    });
    const acadOrder = ['ไม่มีวิทยฐานะ','ครูผู้ช่วย','ครูชำนาญการ','ครูชำนาญการพิเศษ','ครูเชี่ยวชาญ','ครูเชี่ยวชาญพิเศษ',
        'รองผู้อำนวยการชำนาญการ','รองผู้อำนวยการชำนาญการพิเศษ','ผู้อำนวยการชำนาญการพิเศษ'];
    const acadColors = {
        'ไม่มีวิทยฐานะ':'bg-slate-100 text-slate-600',
        'ครูผู้ช่วย':'bg-sky-100 text-sky-700',
        'ครูชำนาญการ':'bg-blue-100 text-blue-700',
        'ครูชำนาญการพิเศษ':'bg-indigo-100 text-indigo-700',
        'ครูเชี่ยวชาญ':'bg-violet-100 text-violet-700',
        'ครูเชี่ยวชาญพิเศษ':'bg-purple-100 text-purple-700',
        'รองผู้อำนวยการชำนาญการ':'bg-amber-100 text-amber-700',
        'รองผู้อำนวยการชำนาญการพิเศษ':'bg-orange-100 text-orange-700',
        'ผู้อำนวยการชำนาญการพิเศษ':'bg-rose-100 text-rose-700',
    };
    Object.keys(acadMap).forEach(k=>{ if(!acadOrder.includes(k)) acadOrder.push(k); });
    const blockAcad = document.getElementById('block-academic');
    blockAcad.innerHTML = acadOrder.filter(k=>acadMap[k]).map(k=>`
        <div class="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
            <span class="text-xs font-medium text-slate-600 truncate">${k}</span>
            <span class="ml-2 flex-shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full ${acadColors[k]||'bg-slate-100 text-slate-600'}">${acadMap[k]}</span>
        </div>`).join('') || '<p class="text-slate-400 text-sm text-center py-4 col-span-full">ไม่มีข้อมูล</p>';

    const retireList = data.filter(p=>{
        if(!p.birth_date) return false;
        const b=dayjs(p.birth_date); let ry=b.year()+60; if(b.month()>8)ry++;
        const yearsLeft = ry - today.year();
        return yearsLeft>0 && yearsLeft<=10;
    }).sort((a,b)=>{
        const getRetire = p=>{ const bi=dayjs(p.birth_date); let ry=bi.year()+60; if(bi.month()>8)ry++; return ry; };
        return getRetire(a)-getRetire(b);
    }).slice(0,10);

    const blockRetire = document.getElementById('block-retire');
    blockRetire.innerHTML = retireList.length ? retireList.map(p=>{
        const b=dayjs(p.birth_date); let ry=b.year()+60; if(b.month()>8)ry++;
        const yearsLeft = ry - today.year();
        const urgency = yearsLeft<=3 ? 'text-red-600 font-bold' : yearsLeft<=5 ? 'text-orange-600 font-bold' : 'text-slate-500';
        return `<div class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5 min-w-0">
                <div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;color:#fff;background:${avColor(p.first_name)};flex-shrink:0;">${(p.first_name||'?').charAt(0)}</div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-700 truncate">${p.prefix||''}${p.first_name} ${p.last_name}</p>
                    <p class="text-[10px] text-slate-400">${p.position||'-'} | ${p.department||'-'}</p>
                </div>
            </div>
            <span class="flex-shrink-0 text-xs ${urgency} ml-2">พ.ศ. ${ry+543}<br><span class="font-normal">(อีก ${yearsLeft} ปี)</span></span>
        </div>`;
    }).join('') : '<p class="text-slate-400 text-sm text-center py-6">ไม่มีผู้ใกล้เกษียณใน 10 ปี</p>';

    const licList = data.filter(p=>{
        if(!p.license_expiry) return false;
        const dl = dayjs(p.license_expiry).diff(today,'day');
        return dl>=0 && dl<=90;
    }).sort((a,b)=>dayjs(a.license_expiry).diff(dayjs(b.license_expiry),'day'));

    const blockLic = document.getElementById('block-license');
    blockLic.innerHTML = licList.length ? licList.map(p=>{
        const dl = dayjs(p.license_expiry).diff(today,'day');
        const urgency = dl<=30 ? 'text-red-600 font-bold' : 'text-orange-600 font-bold';
        const expStr = isoToBE(p.license_expiry);
        return `<div class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5 min-w-0">
                <div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;color:#fff;background:${avColor(p.first_name)};flex-shrink:0;">${(p.first_name||'?').charAt(0)}</div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-700 truncate">${p.prefix||''}${p.first_name} ${p.last_name}</p>
                    <p class="text-[10px] text-slate-400">เลขที่: ${p.license_number||'-'}</p>
                </div>
            </div>
            <span class="flex-shrink-0 text-xs ${urgency} ml-2 text-right">หมด ${expStr}<br><span class="font-normal">(เหลือ ${dl} วัน)</span></span>
        </div>`;
    }).join('') : '<p class="text-slate-400 text-sm text-center py-6">ไม่มีใบอนุญาตหมดใน 3 เดือน</p>';

    const eligList = data.filter(p=>{
        if(!p.appointment_date) return false;
        const posOk = ['ครู','ครูผู้ช่วย'].includes(p.position);
        const acadOk = !p.academic_standing || p.academic_standing==='ไม่มีวิทยฐานะ';
        const yearsIn = today.diff(dayjs(p.appointment_date),'year');
        return posOk && acadOk && yearsIn>=4;
    }).sort((a,b)=>dayjs(a.appointment_date).diff(dayjs(b.appointment_date),'day'));

    const blockElig = document.getElementById('block-eligible');
    blockElig.innerHTML = eligList.length ? eligList.map(p=>{
        const yearsIn = today.diff(dayjs(p.appointment_date),'year');
        const monthsIn = today.diff(dayjs(p.appointment_date).add(yearsIn,'year'),'month');
        return `<div class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition">
            <div class="flex items-center gap-2.5 min-w-0">
                <div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;color:#fff;background:${avColor(p.first_name)};flex-shrink:0;">${(p.first_name||'?').charAt(0)}</div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-700 truncate">${p.prefix||''}${p.first_name} ${p.last_name}</p>
                    <p class="text-[10px] text-slate-400">${p.position||'-'} | ${p.department||'-'}</p>
                </div>
            </div>
            <span class="flex-shrink-0 text-xs text-green-700 font-bold ml-2 text-right">ดำรงตำแหน่ง<br>${yearsIn} ปี ${monthsIn} เดือน</span>
        </div>`;
    }).join('') : '<p class="text-slate-400 text-sm text-center py-6">ยังไม่มีผู้ครบคุณสมบัติ</p>';
}

/* ── EXPORT EXCEL ───────────── */
function exportToExcel(){
    if(!allPersonnelData.length) return Swal.fire('ไม่มีข้อมูล','','info');
    const be=iso=>isoToBE(iso)||'-';
    const rows=allPersonnelData.map(p=>{
        const fullName=`${p.prefix||''}${p.first_name} ${p.last_name}`;
        let retire='-';
        if(p.birth_date){ const b=dayjs(p.birth_date); let ry=b.year()+60; if(b.month()>8)ry++; retire=ry+543; }
        const govY = p.government_start_date ? dayjs().diff(dayjs(p.government_start_date),'year') : '-';
        const pa=p.pa_docs||{};
        return {
            'ชื่อ - สกุล':fullName,
            'เลขประจำตัวประชาชน':p.national_id||'',
            'ตำแหน่ง':p.position||'',
            'วิทยฐานะ':p.academic_standing||'',
            'อันดับ':p.rank||'',
            'เลขที่ตำแหน่ง':p.position_number||'',
            'กลุ่มสาระฯ':p.department||'',
            'วันเกิด (พ.ศ.)':be(p.birth_date),
            'วันบรรจุรับราชการ (พ.ศ.)':be(p.government_start_date),
            'วันแต่งตั้งตำแหน่งปัจจุบัน (พ.ศ.)':be(p.appointment_date),
            'สถานะ PA':p.pa_status||'',
            'เลขที่ใบอนุญาต':p.license_number||'',
            'หมดอายุใบอนุญาต (พ.ศ.)':be(p.license_expiry),
            'เบอร์โทร':p.phone||'',
            'อีเมล':p.email||'',
            'ไฟล์ PA3-2565':pa.pa_2565||'',
            'ไฟล์ PA3-2566':pa.pa_2566||'',
            'ไฟล์ PA3-2567':pa.pa_2567||'',
            'ไฟล์ PA3-2568':pa.pa_2568||'',
            'ไฟล์ PA3-2569':pa.pa_2569||'',
            'ไฟล์ PA3-2570':pa.pa_2570||'',
        };
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=Object.keys(rows[0]).map(k=>({wch:Math.max(k.length+2,16)}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'บุคลากร');
    XLSX.writeFile(wb,`WRK_Personnel_${new Date().toLocaleDateString('th-TH').replace(/\//g,'-')}.xlsx`);
}

/* ── DOWNLOAD TEMPLATE ──────── */
function downloadTemplate(){
    const headers=[
        'ชื่อ - สกุล','เลขประจำตัวประชาชน','ตำแหน่ง','วิทยฐานะ','อันดับ','เลขที่ตำแหน่ง',
        'กลุ่มสาระฯ','วันเกิด (พ.ศ.)','วันบรรจุรับราชการ (พ.ศ.)','วันแต่งตั้งตำแหน่งปัจจุบัน (พ.ศ.)',
        'สถานะ PA','เลขที่ใบอนุญาต','หมดอายุใบอนุญาต (พ.ศ.)','เบอร์โทร','อีเมล',
        'ไฟล์ PA3-2565','ไฟล์ PA3-2566','ไฟล์ PA3-2567','ไฟล์ PA3-2568','ไฟล์ PA3-2569','ไฟล์ PA3-2570'
    ];
    const note = [
        '** วันที่ใส่รูปแบบ วว/ดด/ปปปป (พ.ศ.) เช่น 15/06/2528 **',
        '','','','','','','','','','','','','','','','','','','',''
    ];
    const example=[
        'นายสมชาย ใจดี','1234567890123','ครู','ครูชำนาญการ','คศ.2','4301','คณิตศาสตร์',
        '15/06/2528','01/05/2553','01/10/2561',
        'กำลังดำเนินการ','ค.12345','31/03/2570','0812345678','somchai@school.ac.th',
        'https://drive.google.com/...','','','','',''
    ];
    const ws=XLSX.utils.aoa_to_sheet([headers, note, example]);
    ws['!cols']=headers.map(h=>({wch:Math.max(h.length+4,20)}));

    const dateCols = [7, 8, 9, 12];
    const totalRows = 3; 
    for(let r=0; r<totalRows; r++){
        dateCols.forEach(ci=>{
            const addr = XLSX.utils.encode_cell({r, c:ci});
            if(ws[addr]){
                ws[addr].t = 's'; 
                ws[addr].z = '@'; 
            }
        });
    }

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'บุคลากร');
    XLSX.writeFile(wb,'WRK_Personnel_Template.xlsx');
}

/* ── processImportRows: shared logic สำหรับทั้ง Excel และ Google Sheets ── */
async function processImportRows(rows, foundHeaders){
    const pad2 = n => String(n).padStart(2,'0');

    function forceCE(y, m, d){
        const yr = y >= 2300 ? y - 543 : y;
        return `${yr}-${pad2(m)}-${pad2(d)}`;
    }

    function parseDate(val){
        if(val === null || val === undefined || val === '' || val === '-' || val === 0) return null;
        if(val instanceof Date){
            if(isNaN(val.getTime())) return null;
            return forceCE(val.getFullYear(), val.getMonth()+1, val.getDate());
        }
        const s = String(val).trim();
        if(!s || s==='-' || s==='0') return null;
        const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(isoM) return forceCE(+isoM[1],+isoM[2],+isoM[3]);
        const dmyM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if(dmyM) return forceCE(+dmyM[3],+dmyM[2],+dmyM[1]);
        const num = Number(s);
        if(!isNaN(num) && num > 20000 && num < 80000){
            try{ const dd=XLSX.SSF.parse_date_code(num); if(dd&&dd.y>1900) return forceCE(dd.y,dd.m,dd.d); }
            catch(e){}
        }
        return null;
    }

    function gv(row,...keys){
        for(const k of keys){
            const v=row[k];
            if(v===undefined||v===null) continue;
            if(v instanceof Date) return v;
            const s=String(v).trim();
            if(s===''||s==='-'||s==='0') continue;
            return s;
        }
        return null;
    }

    function splitFullName(full){
        if(!full) return {prefix:'',first_name:'',last_name:''};
        const pfx=['นางสาว','นาย','นาง','ด.ช.','ด.ญ.'];
        let prefix='', name=String(full).trim();
        for(const p of pfx){ if(name.startsWith(p)){prefix=p; name=name.slice(p.length).trim(); break;} }
        const parts=name.split(/\s+/);
        return {prefix, first_name:parts[0]||'', last_name:parts.slice(1).join(' ')||''};
    }

    const payloads = rows.map(row=>{
        let prefix='',first_name='',last_name='';
        const combined=gv(row,'ชื่อ - สกุล','ชื่อ-สกุล','ชื่อ-นามสกุล','full_name');
        if(combined){ const sp=splitFullName(combined); prefix=sp.prefix; first_name=sp.first_name; last_name=sp.last_name; }
        else { prefix=gv(row,'คำนำหน้า (prefix)','prefix','คำนำหน้า')||''; first_name=gv(row,'ชื่อจริง (first_name)*','first_name','ชื่อจริง','ชื่อ')||''; last_name=gv(row,'นามสกุล (last_name)*','last_name','นามสกุล')||''; }
        let position='',academic_standing='',position_number='',rank='';
        const posRaw=gv(row,'ตำแหน่งวิทยฐานะตำแหน่งเลขที่อันดับ','ตำแหน่ง/วิทยฐานะ');
        if(posRaw){
            const posMap=['ผู้อำนวยการสถานศึกษา','รองผู้อำนวยการสถานศึกษา','ครู','ครูผู้ช่วย','พนักงานราชการ','ครูอัตราจ้าง'];
            for(const p of posMap){ if(posRaw.includes(p)){position=p;break;} }
            if(!position) position=posRaw;
            const acadMap=['ครูชำนาญการพิเศษ','ครูชำนาญการ','ครูเชี่ยวชาญพิเศษ','ครูเชี่ยวชาญ','ผู้อำนวยการชำนาญการพิเศษ','รองผู้อำนวยการชำนาญการพิเศษ','รองผู้อำนวยการชำนาญการ'];
            for(const a of acadMap){ if(posRaw.includes(a)){academic_standing=a;break;} }
            const nm=posRaw.match(/\d{4,6}/); if(nm) position_number=nm[0];
            const rm=posRaw.match(/คศ\.?\s*\d/); if(rm) rank=rm[0].replace(/[.\s]/g,'');
        }
        position=gv(row,'ตำแหน่ง','position')||position;
        academic_standing=gv(row,'วิทยฐานะ','academic_standing')||academic_standing;
        position_number=gv(row,'เลขที่ตำแหน่ง','position_number')||position_number;
        rank=gv(row,'อันดับ','rank')||rank;
        let phone='';
        const pr=gv(row,'เบอร์โทรศัพท์อายุ','เบอร์โทรศัพท์','เบอร์โทร','phone');
        if(pr){ const m=pr.match(/0\d[\d\s-]{7,}/); phone=m?m[0].replace(/[\s-]/g,''):pr.split(/\s+/)[0]; }
        return {
            first_name, last_name, prefix,
            national_id:           gv(row,'เลขประจำตัวประชาชน','national_id'),
            position:              position||null, position_number:position_number||null,
            academic_standing:     academic_standing||null, rank:rank||null,
            department:            gv(row,'กลุ่มสาระการเรียนรู้','กลุ่มสาระฯ','กลุ่มสาระ','department'),
            phone:                 phone||null,
            birth_date:            parseDate(gv(row,'วันเกิด (พ.ศ.)','วันเดือนปีเกิด (พ.ศ.)','วันเกิด YYYY-MM-DD','birth_date','วันเกิด')),
            government_start_date: parseDate(gv(row,'วันบรรจุรับราชการ (พ.ศ.)','วันบรรจุรับราชการ YYYY-MM-DD','government_start_date')),
            appointment_date:      parseDate(gv(row,'วันแต่งตั้งตำแหน่งปัจจุบัน (พ.ศ.)','วันที่แต่งตั้งตำแหน่งปัจจุบัน','วันแต่งตั้งตำแหน่งปัจจุบัน YYYY-MM-DD','appointment_date')),
            license_number:        gv(row,'เลขที่ใบอนุญาต','license_number'),
            license_expiry:        parseDate(gv(row,'หมดอายุใบอนุญาต (พ.ศ.)','วันหมดอายุใบอนุญาตฯ (พ.ศ.)','วันหมดอายุใบอนุญาต YYYY-MM-DD','license_expiry')),
            pa_status:             gv(row,'สถานะ PA','pa_status'),
            pa_docs:(()=>{ const pa={}; [2565,2566,2567,2568,2569,2570].forEach(y=>{ const v=gv(row,`ไฟล์ PA3-${y}`,`PA3-${y}`); if(v&&v!=='0'&&v!==0) pa[`pa_${y}`]=v; }); return Object.keys(pa).length?pa:null; })()
        };
    }).filter(p=>p.first_name);

    if(!payloads.length){
        return Swal.fire({
            title:'ไม่พบข้อมูลที่ใช้ได้',
            html:`<div class="text-left text-sm"><p class="text-red-500 font-bold mb-2">ระบบไม่สามารถอ่านคอลัมน์ชื่อได้</p>
            <p class="text-slate-500 text-xs mb-1">Header ที่พบ (${foundHeaders.length} คอลัมน์):</p>
            <pre class="text-xs bg-slate-100 p-2 rounded-lg overflow-auto max-h-32 text-slate-600">${(foundHeaders||[]).join('\n')}</pre>
            <p class="text-indigo-500 text-xs mt-2">💡 ดาวน์โหลดไฟล์ต้นแบบเพื่อดูรูปแบบ header ที่ถูกต้อง</p></div>`,
            icon:'warning', confirmButtonText:'รับทราบ'
        });
    }

    Swal.fire({title:'กำลังเตรียมข้อมูล...',allowOutsideClick:false,showConfirmButton:false,didOpen:()=>Swal.showLoading()});
    const {data:existingList} = await db.from('core_personnel').select('id,first_name,last_name,prefix');
    Swal.close();

    const nameMap = {};
    (existingList||[]).forEach(p=>{
        nameMap[`${p.first_name}|${p.last_name}`.toLowerCase()] = p.id;
        nameMap[`${p.prefix||''}${p.first_name}|${p.last_name}`.toLowerCase()] = p.id;
    });

    const matched=[], unmatched=[];
    payloads.forEach(p=>{
        const id = nameMap[`${p.first_name}|${p.last_name}`.toLowerCase()]
                || nameMap[`${p.prefix}${p.first_name}|${p.last_name}`.toLowerCase()];
        if(id) matched.push({...p,id}); else unmatched.push(p);
    });

    const confirmRes = await Swal.fire({
        title:`พบข้อมูล ${payloads.length} รายการ`,
        html:`<div class="text-left text-sm space-y-2">
            <div class="flex gap-3">
                <div class="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p class="text-2xl font-bold text-green-600">${matched.length}</p>
                    <p class="text-xs text-green-700 font-bold">จับคู่ชื่อพบ → อัปเดต</p>
                </div>
                <div class="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p class="text-2xl font-bold text-amber-600">${unmatched.length}</p>
                    <p class="text-xs text-amber-700 font-bold">ไม่พบในระบบ → ข้ามไป</p>
                </div>
            </div>
            ${unmatched.length>0?`<p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-lg">⚠️ ไม่พบ: ${unmatched.slice(0,5).map(p=>`${p.prefix}${p.first_name} ${p.last_name}`).join(', ')}${unmatched.length>5?` ...+${unmatched.length-5}`:''}</p>`:''}
            ${matched.length>0?`<p class="text-xs text-slate-400">ตัวอย่าง: <b>${matched[0].prefix}${matched[0].first_name} ${matched[0].last_name}</b> | ${matched[0].position||'-'} | ${matched[0].birth_date||'(ไม่มีวันเกิด)'}</p>`:''}
        </div>`,
        icon:'question', showCancelButton:true,
        confirmButtonColor:'#6366f1',
        confirmButtonText: matched.length>0 ? `อัปเดต ${matched.length} รายการ` : 'ไม่มีรายการที่จะอัปเดต',
        cancelButtonText:'ยกเลิก'
    });
    if(!confirmRes.isConfirmed || matched.length===0) return;

    Swal.fire({title:`กำลังอัปเดต 0/${matched.length}...`,allowOutsideClick:false,showConfirmButton:false,didOpen:()=>Swal.showLoading()});
    let success=0, failed=0, errors=[];
    for(let i=0; i<matched.length; i++){
        const {id, first_name, last_name, prefix, ...updateData} = matched[i];
        if(i%10===0) Swal.update({title:`กำลังอัปเดต ${i}/${matched.length}...`});
        const {error} = await db.from('core_personnel').update(updateData).eq('id',id);
        if(error){ failed++; errors.push(`${prefix}${first_name} ${last_name}: ${error.message}`); }
        else { success++; }
    }
    Swal.close();

    let html=`<div class="text-left text-sm space-y-1">
        <p class="text-green-600 font-bold">✅ อัปเดตสำเร็จ: ${success} รายการ</p>
        ${failed>0?`<p class="text-red-500 font-bold">❌ ล้มเหลว: ${failed} รายการ</p>
        <details><summary class="text-xs cursor-pointer text-slate-400">ดูรายละเอียด</summary>
        <pre class="text-xs text-red-400 mt-1 max-h-24 overflow-y-auto">${errors.slice(0,15).join('\n')}</pre></details>`:''}
        ${unmatched.length>0?`<p class="text-amber-600 text-xs mt-2">⚠️ ข้ามไป: ${unmatched.length} รายการ (ไม่พบในระบบ)</p>`:''}
    </div>`;
    await Swal.fire({icon:failed===0?'success':'warning', title:'ผลการนำเข้า', html});
    await loadPersonnelList();
}

/* ── IMPORT FROM GOOGLE SHEETS ── */
async function importFromGoogleSheets(){
    const { value: sheetUrl } = await Swal.fire({
        title: '<i class="fab fa-google-drive text-green-600 mr-2"></i>นำเข้าจาก Google Sheets',
        html: `<div class="text-left text-sm space-y-3">
            <p class="text-slate-600">วาง URL ของ Google Sheets ที่ต้องการนำเข้า</p>
            <input id="swal-sheet-url" type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                class="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-green-500 text-sm">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                <p class="font-bold">⚠️ ข้อกำหนด:</p>
                <p>1. ต้องตั้งค่าการแชร์ชีตเป็น <b>"ทุกคนที่มีลิงก์"</b></p>
                <p>2. ใช้โครงสร้างตามไฟล์ต้นแบบ (ดาวน์โหลดจากปุ่มซ้ายมือ)</p>
                <p>3. ชีตแรกเท่านั้นที่จะถูกนำเข้า</p>
            </div>
            <p class="text-[10px] text-slate-400">วันที่ใน Google Sheets จะถูกอ่านเป็น Text ตรงๆ ไม่มีปัญหา Auto-convert</p>
        </div>`,
        showCancelButton: true,
        confirmButtonText: 'นำเข้าข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        focusConfirm: false,
        preConfirm: () => {
            const v = document.getElementById('swal-sheet-url').value.trim();
            if(!v) Swal.showValidationMessage('กรุณาวาง URL ของ Google Sheets');
            return v;
        }
    });

    if(!sheetUrl) return;

    const csvUrl = convertSheetToCsvUrl(sheetUrl);
    if(!csvUrl){
        return Swal.fire('URL ไม่ถูกต้อง',
            'กรุณาใช้ URL จาก Google Sheets เช่น https://docs.google.com/spreadsheets/d/...',
            'error');
    }

    Swal.fire({title:'กำลังดึงข้อมูลจาก Google Sheets...', allowOutsideClick:false,
        showConfirmButton:false, didOpen:()=>Swal.showLoading()});

    try {
        const res = await fetch(csvUrl);
        if(!res.ok) throw new Error(`HTTP ${res.status} — ตรวจสอบว่าได้แชร์ชีตเป็นสาธารณะแล้ว`);
        const csvText = await res.text();
        Swal.close();

        const rows = parseCsv(csvText);
        if(rows.length < 2) return Swal.fire('ไม่พบข้อมูล','ไม่พบแถวข้อมูลในชีต','warning');

        const headers = rows[0];
        const dataRows = rows.slice(1).filter(r => r.some(v => v.trim()));

        const objRows = dataRows.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i] || ''; });
            return obj;
        });

        await processImportRows(objRows, headers);

    } catch(err){
        Swal.close();
        if(err.message === 'Failed to fetch') {
            Swal.fire({
                title: 'เข้าถึงไฟล์ไม่ได้!',
                html: 'ระบบถูกบล็อกการดึงข้อมูล กรุณาตรวจสอบว่าไฟล์ Google Sheets ได้เปิดสิทธิ์การแชร์เป็น <br><b class="text-green-600">"ทุกคนที่มีลิงก์ (Anyone with the link)"</b> หรือยัง?',
                icon: 'error'
            });
        } else {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

function convertSheetToCsvUrl(url){
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if(!m) return null;
    const sheetId = m[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseCsv(text){
    const rows = [];
    const lines = text.split(/\r?\n/);
    for(const line of lines){
        if(!line.trim()) continue;
        const cols = [];
        let cur = '', inQ = false;
        for(let i=0; i<line.length; i++){
            const ch = line[i];
            if(ch === '"'){
                if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
                else { inQ = !inQ; }
            } else if(ch === ',' && !inQ){
                cols.push(cur); cur = '';
            } else { cur += ch; }
        }
        cols.push(cur);
        rows.push(cols);
    }
    return rows;
}

/* ── IMPORT FROM EXCEL ──────── */
async function importFromExcel(event){
    const file = event.target.files[0]; if(!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = async(e) => {
        try{
            const wb = XLSX.read(e.target.result, {type:'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, {defval:'', cellDates:true, raw:true});
            if(!rows.length) return Swal.fire('ไฟล์ว่างเปล่า','ไม่พบข้อมูลในชีตแรก','warning');
            const headers = Object.keys(rows[0]);
            await processImportRows(rows, headers);
        } catch(err){
            Swal.close();
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}
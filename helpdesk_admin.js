// ==========================================
// helpdesk_admin.js — ระบบศูนย์ช่วยเหลือ (ผู้ดูแลระบบ)
// ปรับใช้ config.js ฉบับใหม่
// - ใช้ checkSessionAndRole(), requireAdmin(), hasModuleAccess()
// - ใช้ logUserAction() ทุก CRUD
// - ใช้ logout() มาตรฐานกลาง
// ==========================================

let currentUserId = null;
let currentUserRole = null;
let currentTicketId = null;
let currentTicketSenderId = null;
let currentTicketSenderType = null;
let isProcessing = false;
let allTicketsList = [];
let currentFilterStatus = 'all';
let isModuleAdmin = false;

// ==========================================
// LOGOUT (มาตรฐานกลาง)
// ==========================================
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

// ==========================================
// INIT (ใช้ checkSessionAndRole)
// ==========================================
window.onload = async () => {
    try {
        // ✅ ใช้ checkSessionAndRole จาก config.js
        const result = await window.checkSessionAndRole('helpdesk_admin');
        if (!result) return;

        const { user, personnel, role, isAdmin } = result;
        currentUserId = user.id;
        currentUserRole = role;

        // ✅ ตรวจสอบสิทธิ์ Module Admin
        isModuleAdmin = await window.hasModuleAccess(role, 'helpdesk', user.id);

        // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
        if (!isAdmin && !isModuleAdmin) {
            await Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้ระบบศูนย์ช่วยเหลือ',
                confirmButtonText: 'กลับหน้าหลัก'
            });
            window.location.href = 'index.html';
            return;
        }

        // ✅ บันทึก Log การเข้าใช้งาน
        await window.logUserAction('เข้าสู่ระบบศูนย์ช่วยเหลือ (Admin)', 'helpdesk');

        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        await loadTickets();

    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
};

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-500 underline hover:text-blue-700">${escapeHtml(url)}</a>`;
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

function formatThaiDateTime(dateString) {
    const d = dayjs(dateString);
    const yearAD = d.year();
    const yearBE = yearAD + 543;
    return d.locale('th').format('DD MMM ') + yearBE + d.format(' HH:mm');
}

// ==========================================
// โหลดตั๋วทั้งหมด (Admin)
// ==========================================
async function loadTickets() {
    try {
        const { data: tickets, error } = await db.from('module_helpdesk_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (tickets && tickets.length > 0) {
            allTicketsList = await Promise.all(tickets.map(async (ticket) => {
                let senderName = "ไม่พบข้อมูลผู้ใช้งาน";
                try {
                    if (ticket.sender_type === 'teacher') {
                        const { data: teacher } = await db.from('core_personnel').select('first_name, last_name').eq('id', ticket.sender_id).maybeSingle();
                        if (teacher) senderName = `ครู ${teacher.first_name} ${teacher.last_name}`;
                    } else if (ticket.sender_type === 'student') {
                        const { data: student } = await db.from('core_students').select('prefix, first_name, last_name').eq('id', ticket.sender_id).maybeSingle();
                        if (student) senderName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
                    }
                } catch (e) {}
                return { ...ticket, sender_display_name: senderName };
            }));
        } else {
            allTicketsList = [];
        }

        updateBadgeCount();
        filterTickets();

    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

function updateBadgeCount() {
    const openCount = allTicketsList.filter(t => t.status === 'open' || t.status === 'replied').length;
    const badge = document.getElementById('unreadCountBadge');
    if (openCount > 0) {
        badge.innerText = `${openCount} ข้อความใหม่`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function filterTickets() {
    const keyword = document.getElementById('searchTicketInput').value.toLowerCase();
    
    const filtered = allTicketsList.filter(t => {
        if (currentFilterStatus !== 'all' && t.status !== currentFilterStatus) return false;
        if (keyword) {
            const topic = (t.topic || '').toLowerCase();
            const senderName = (t.sender_display_name || '').toLowerCase();
            return topic.includes(keyword) || senderName.includes(keyword);
        }
        return true;
    });
    
    renderTicketList(filtered);
}

function setFilter(status) {
    currentFilterStatus = status;
    ['all', 'open', 'closed'].forEach(s => {
        const btn = document.getElementById('btnFilter_' + s);
        if (s === status) {
            btn.className = "flex-1 py-1 text-xs font-bold rounded-md bg-slate-800 text-white transition-colors";
        } else {
            btn.className = "flex-1 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors";
        }
    });
    filterTickets();
}

function renderTicketList(tickets) {
    const ticketList = document.getElementById('ticketList');
    if (tickets.length > 0) {
        ticketList.innerHTML = tickets.map(ticket => {
            const statusColor = ticket.status === 'open' ? 'bg-amber-100 text-amber-700' 
                : (ticket.status === 'replied' ? 'bg-green-100 text-green-700'
                : (ticket.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'));
            const statusText = ticket.status === 'open' ? 'รอตรวจสอบ' 
                : (ticket.status === 'replied' ? 'ตอบแล้ว' 
                : (ticket.status === 'closed' ? 'ปิดงาน' : 'รอตรวจสอบ'));
            
            const redBadgeHtml = (ticket.status === 'open' || ticket.status === 'replied') && ticket.id !== currentTicketId
                ? `<span class="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.6)]"></span>`
                : '';

            return `
            <div onclick="openTicket('${ticket.id}', '${ticket.topic.replace(/'/g, "\\'")}', '${ticket.sender_id}', '${ticket.sender_type}')" 
                 class="relative p-3 bg-white border border-gray-100 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors ${ticket.id === currentTicketId ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                ${redBadgeHtml}
                <div class="flex justify-between items-start mb-1">
                    <h4 class="font-bold text-gray-800 text-sm truncate pr-4">${ticket.topic}</h4>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}">${statusText}</span>
                </div>
                <div class="text-[11px] text-gray-500 flex justify-between items-center mt-1">
                    <span class="truncate max-w-[150px]"><i class="fa-solid fa-user text-gray-400 mr-1"></i>${ticket.sender_display_name}</span>
                    <span>${formatThaiDateTime(ticket.created_at)}</span>
                </div>
            </div>`;
        }).join('');
    } else {
        ticketList.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">ไม่พบข้อความ</div>';
    }
}

// ==========================================
// เปิดแชท (Admin)
// ==========================================
async function openTicket(ticketId, topic, senderId, senderType) {
    currentTicketId = ticketId;
    currentTicketSenderId = senderId;
    currentTicketSenderType = senderType;
    
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('messagesContainer').classList.remove('hidden');
    document.getElementById('replyBox').classList.remove('hidden');
    
    document.getElementById('activeTopic').innerText = topic;
    
    let displayName = "ไม่พบข้อมูลผู้ใช้งาน";
    let detailText = senderType === 'teacher' ? 'บุคลากร/ครู' : 'นักเรียน';
    let avatarUrl = `https://ui-avatars.com/api/?name=${senderType}&background=random`;

    document.getElementById('activeSenderName').innerText = "กำลังโหลด...";
    document.getElementById('activeSenderDetail').innerText = detailText;

    try {
        if (senderType === 'teacher') {
            const { data, error } = await db.from('core_personnel')
                .select('prefix, first_name, last_name, avatar_url')
                .eq('id', senderId)
                .single();
            if (data) {
                displayName = `ครู ${data.first_name} ${data.last_name}`;
                if (data.avatar_url) avatarUrl = data.avatar_url;
                else avatarUrl = `https://ui-avatars.com/api/?name=${data.first_name}&background=random`;
            }
        } else {
            const { data, error } = await db.from('core_students')
                .select('student_id_card, prefix, first_name, last_name, avatar_students_url')
                .eq('id', senderId)
                .maybeSingle();
            if (data) {
                displayName = `${data.prefix || ''}${data.first_name} ${data.last_name}`;
                detailText = `รหัส: ${data.student_id_card || 'ไม่มีข้อมูล'}`;
                if (data.avatar_students_url) {
                    avatarUrl = data.avatar_students_url;
                } else {
                    avatarUrl = `https://ui-avatars.com/api/?name=${data.first_name}&background=random`;
                }
            }
        }
    } catch (err) {
        console.error("Error fetching user detail:", err);
    }

    document.getElementById('activeSenderName').innerText = displayName;
    document.getElementById('activeSenderDetail').innerText = detailText;
    
    const avatarImgElement = document.getElementById('senderAvatarImg');
    if (avatarImgElement) {
        avatarImgElement.src = avatarUrl;
    }

    await checkUserBanStatus();
    await fetchMessages();
    showChatOnMobile();
}

// ==========================================
// ตรวจสอบสถานะแบน
// ==========================================
async function checkUserBanStatus() {
    if (!currentTicketSenderId || !currentTicketSenderType) return;
    
    try {
        const table = currentTicketSenderType === 'teacher' ? 'core_personnel' : 'core_students';
        const { data } = await db.from(table).select('helpdesk_banned').eq('id', currentTicketSenderId).maybeSingle();
        
        const btnBan = document.getElementById('btnBanUser');
        const btnUnban = document.getElementById('btnUnbanUser');
        
        if (data && data.helpdesk_banned === true) {
            btnBan.classList.add('hidden');
            btnUnban.classList.remove('hidden');
        } else {
            btnBan.classList.remove('hidden');
            btnUnban.classList.add('hidden');
        }
    } catch (err) {
        console.error("เช็คสถานะแบนไม่ได้", err);
    }
}

// ==========================================
// ดึงข้อความแชท (Admin)
// ==========================================
async function fetchMessages() {
    if (!currentTicketId) return;

    try {
        const { data, error } = await db.from('module_helpdesk_messages')
            .select('*')
            .eq('ticket_id', currentTicketId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const container = document.getElementById('messagesContainer');
        if (data) {
            container.innerHTML = data.map(msg => {
                const isAdmin = msg.sender_id === currentUserId;
                const alignment = isAdmin ? 'justify-end' : 'justify-start';
                const bubbleColor = isAdmin ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none';
                const textColor = isAdmin ? 'text-blue-100' : 'text-gray-400';
                
                const deleteBtnHtml = `<button onclick="deleteMessage('${msg.id}')" class="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-[10px] bg-red-100 text-red-600 hover:bg-red-500 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"><i class="fa-solid fa-trash"></i> ลบ</button>`;

                return `
                <div class="flex w-full ${alignment} group">
                    <div class="max-w-[75%] p-3 rounded-2xl shadow-sm ${bubbleColor}">
                        <p class="text-sm whitespace-pre-wrap break-words">${linkify(msg.message)}</p>
                        <div class="flex justify-between items-center mt-1">
                            <p class="text-[9px] ${textColor}">${dayjs(msg.created_at).locale('th').format('HH:mm')}</p>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                </div>`;
            }).join('');
            container.scrollTop = container.scrollHeight;
        }
    } catch (err) {
        console.error(err);
    }
}

// ==========================================
// ส่งข้อความ (Admin) — ใช้ requireAdmin
// ==========================================
async function sendMessage(e) {
    e.preventDefault();
    if (!currentTicketId || isProcessing) return;
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const input = document.getElementById('replyMessage');
    const message = input.value.trim();
    if (!message) return;
    if (message.length > 5000) {
        Swal.fire('ข้อความยาวเกินไป', 'ข้อความต้องไม่เกิน 5000 ตัวอักษร', 'warning');
        return;
    }
    
    isProcessing = true;
    try {
        const { error: msgErr } = await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: message
        });
        if (msgErr) throw msgErr;
        await db.from('module_helpdesk_tickets').update({ status: 'replied' }).eq('id', currentTicketId);
        
        // ✅ บันทึก Log
        await window.logUserAction(`ตอบกลับข้อความ Helpdesk (Ticket: ${currentTicketId})`, 'helpdesk');
        
        input.value = '';
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถส่งข้อความได้');
    } finally {
        isProcessing = false;
    }
}

// ==========================================
// ปิด Ticket — ใช้ requireAdmin
// ==========================================
async function closeTicket() {
    if (!currentTicketId || isProcessing) return;
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการปิดงาน?',
        text: "คุณได้แก้ไขปัญหานี้เรียบร้อยแล้วใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ปิดงาน',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        isProcessing = true;
        try {
            await db.from('module_helpdesk_tickets').update({ status: 'closed' }).eq('id', currentTicketId);
            await db.from('module_helpdesk_messages').insert({
                ticket_id: currentTicketId,
                sender_id: currentUserId,
                message: '🟢 ผู้ดูแลระบบได้ทำการปิดเคสนี้เรียบร้อยแล้ว'
            });
            
            // ✅ บันทึก Log
            await window.logUserAction(`ปิด Ticket Helpdesk (ID: ${currentTicketId})`, 'helpdesk');
            
            Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ', timer: 1500, showConfirmButton: false });
            await fetchMessages();
            await loadTickets();
        } catch (err) {
            handleError(err, 'ไม่สามารถปิดงานได้');
        } finally {
            isProcessing = false;
        }
    }
}

// ==========================================
// ลบข้อความ — ใช้ requireAdmin
// ==========================================
async function deleteMessage(messageId) {
    if (isProcessing) return;
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบข้อความ',
        text: 'คุณต้องการลบข้อความนี้ใช่หรือไม่? (ข้อความจะหายจากระบบทันที)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    
    isProcessing = true;
    try {
        const { error } = await db.from('module_helpdesk_messages').delete().eq('id', messageId);
        if (error) throw error;
        
        // ✅ บันทึก Log
        await window.logUserAction(`ลบข้อความ Helpdesk (ID: ${messageId})`, 'helpdesk');
        
        Swal.fire({ icon: 'success', title: 'ลบข้อความเรียบร้อย', toast: true, timer: 2000 });
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถลบข้อความได้');
    } finally {
        isProcessing = false;
    }
}

// ==========================================
// ลบข้อความทั้งหมด — ใช้ requireAdmin
// ==========================================
async function deleteAllMessages() {
    if (!currentTicketId || isProcessing) return;
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบข้อความทั้งหมด',
        html: `คุณต้องการลบ <strong>ข้อความทั้งหมด</strong> ในแชทนี้ใช่หรือไม่?<br>(ข้อความของผู้แจ้งและผู้ดูแลระบบจะถูกลบอย่างถาวร)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบทั้งหมดทันที',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    
    isProcessing = true;
    try {
        await db.from('module_helpdesk_messages').delete().eq('ticket_id', currentTicketId);
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: '🗑️ ผู้ดูแลระบบได้ลบข้อความทั้งหมดในแชทนี้แล้ว'
        });
        
        // ✅ บันทึก Log
        await window.logUserAction(`ลบข้อความทั้งหมดใน Ticket ${currentTicketId}`, 'helpdesk');
        
        Swal.fire({ icon: 'success', title: 'ลบข้อความทั้งหมดเรียบร้อย', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถลบข้อความได้');
    } finally {
        isProcessing = false;
    }
}

// ==========================================
// ลบ Ticket — ใช้ requireAdmin
// ==========================================
async function deleteTicket() {
    if (!currentTicketId || isProcessing) return;
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ลบ Ticket นี้ทิ้งทั้งใบ?',
        html: `คุณต้องการลบ <strong>หัวข้อและข้อความทั้งหมด</strong> ของ Ticket นี้ใช่หรือไม่?<br>(การดำเนินการนี้ไม่สามารถกู้คืนได้)`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    
    isProcessing = true;
    try {
        await db.from('module_helpdesk_messages').delete().eq('ticket_id', currentTicketId);
        await db.from('module_helpdesk_tickets').delete().eq('id', currentTicketId);
        
        // ✅ บันทึก Log
        await window.logUserAction(`ลบ Ticket Helpdesk (ID: ${currentTicketId})`, 'helpdesk');
        
        Swal.fire({ icon: 'success', title: 'ลบ Ticket สำเร็จ', timer: 1500, showConfirmButton: false });
        currentTicketId = null;
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('chatHeader').classList.add('hidden');
        document.getElementById('messagesContainer').classList.add('hidden');
        document.getElementById('replyBox').classList.add('hidden');
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถลบ Ticket ได้');
    } finally {
        isProcessing = false;
    }
}

// ==========================================
// แบนผู้ใช้ — ใช้ requireAdmin
// ==========================================
async function banUser() {
    if (!currentTicketSenderId || !currentTicketSenderType || isProcessing) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
    if (currentTicketSenderId === currentUserId) {
        Swal.fire('ไม่สามารถแบนตัวเองได้', 'คุณคือผู้ดูแลระบบ', 'error');
        return;
    }
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'แบนผู้ใช้นี้',
        html: `คุณต้องการแบนผู้ใช้นี้ไม่ให้สร้างเรื่องใหม่หรือส่งข้อความในระบบ Helpdesk ใช่หรือไม่?<br><strong>ผู้ใช้จะยังคงเห็นข้อความเดิม แต่ไม่สามารถโต้ตอบได้</strong>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'แบน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    
    isProcessing = true;
    try {
        const table = currentTicketSenderType === 'teacher' ? 'core_personnel' : 'core_students';
        const { error } = await db.from(table).update({ helpdesk_banned: true }).eq('id', currentTicketSenderId);
        if (error) throw error;
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: `🚫 ผู้ดูแลระบบได้ทำการแบนผู้ใช้นี้ (${currentTicketSenderType}) ไม่ให้ส่งข้อความเพิ่มเติม`
        });
        
        // ✅ บันทึก Log
        await window.logUserAction(`แบนผู้ใช้ Helpdesk (ID: ${currentTicketSenderId})`, 'helpdesk');
        
        Swal.fire({ icon: 'success', title: 'แบนผู้ใช้สำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        handleError(err, 'ไม่สามารถแบนผู้ใช้ได้');
    } finally {
        isProcessing = false;
    }
}

// ==========================================
// ยกเลิกแบน — ใช้ requireAdmin
// ==========================================
async function unbanUser() {
    if (!currentTicketSenderId || !currentTicketSenderType || isProcessing) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
    
    // ✅ ใช้ requireAdmin ตรวจสอบสิทธิ์
    if (!window.requireAdmin(currentUserRole, false, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({
        title: 'ยกเลิกแบนผู้ใช้',
        text: `คุณต้องการยกเลิกแบนผู้ใช้นี้ใช่หรือไม่? เขาจะสามารถส่งข้อความและสร้างเรื่องใหม่ได้อีกครั้ง`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ยกเลิกแบน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    
    isProcessing = true;
    try {
        const table = currentTicketSenderType === 'teacher' ? 'core_personnel' : 'core_students';
        const { error } = await db.from(table).update({ helpdesk_banned: false }).eq('id', currentTicketSenderId);
        if (error) throw error;
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: `✅ ผู้ดูแลระบบได้ยกเลิกแบนผู้ใช้นี้ (${currentTicketSenderType}) แล้ว`
        });
        
        // ✅ บันทึก Log
        await window.logUserAction(`ยกเลิกแบนผู้ใช้ Helpdesk (ID: ${currentTicketSenderId})`, 'helpdesk');
        
        Swal.fire({ icon: 'success', title: 'ยกเลิกแบนสำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        handleError(err, 'ไม่สามารถยกเลิกแบนได้');
    } finally {
        isProcessing = false;
    }
}

function handleError(err, userMessage) {
    console.error('Error:', err);
    Swal.fire('ข้อผิดพลาด', userMessage || err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
}

// ==========================================
// Mobile UI Handlers
// ==========================================
function showChatOnMobile() {
    if (window.innerWidth >= 768) return;
    const sidebar = document.getElementById('sidebarPanel');
    const chat = document.getElementById('chatPanel');
    sidebar.classList.remove('flex');
    sidebar.classList.add('hidden');
    chat.classList.remove('hidden');
    chat.classList.add('flex');
}

function showSidebarOnMobile() {
    const sidebar = document.getElementById('sidebarPanel');
    const chat = document.getElementById('chatPanel');
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    chat.classList.remove('flex');
    chat.classList.add('hidden');
    currentTicketId = null;
    if (typeof loadTickets === 'function') loadTickets();
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.logout = logout;
window.setFilter = setFilter;
window.filterTickets = filterTickets;
window.openTicket = openTicket;
window.sendMessage = sendMessage;
window.closeTicket = closeTicket;
window.deleteMessage = deleteMessage;
window.deleteAllMessages = deleteAllMessages;
window.deleteTicket = deleteTicket;
window.banUser = banUser;
window.unbanUser = unbanUser;
window.showSidebarOnMobile = showSidebarOnMobile;

console.log('✅ helpdesk_admin.js loaded with config.js integration');
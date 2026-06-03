let currentUserId = null;
let currentTicketId = null;
let currentTicketSenderId = null;
let currentTicketSenderType = null;
let isProcessing = false; // Prevent rapid-fire requests

window.onload = async () => {
    await checkAuth();
};

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }
    currentUserId = session.user.id;
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', currentUserId).single();
    let isAuthorized = false;
    if (profile && profile.role === 'super_admin') {
        isAuthorized = true;
    } else {
        const { data: adminRight } = await db.from('core_module_admins')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('module_id', 'helpdesk')
            .single();
        if (adminRight) isAuthorized = true;
    }
    if (!isAuthorized) {
        Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เข้าถึงระบบฝากข้อความ', 'error');
        setTimeout(() => window.location.replace('index.html'), 2000);
        return;
    }
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    await loadTickets();
}

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

// Refactored: Single function to load sender maps (teachers and students)
async function loadSenderMaps(teacherIds, studentIds) {
    let teachersMap = new Map();
    let studentsMap = new Map();

    // Load teachers
    if (teacherIds.length) {
        try {
            const { data: teachers, error: err } = await db.from('core_personnel')
                .select('id, prefix, first_name, last_name, avatar_url')
                .in('id', teacherIds);
            if (err) throw err;
            if (teachers) {
                teachers.forEach(t => {
                    const fullName = `${t.prefix || ''}${t.prefix ? ' ' : ''}${t.first_name} ${t.last_name}`.trim();
                    teachersMap.set(t.id, {
                        fullName: fullName || 'บุคลากร',
                        photoUrl: t.avatar_url || '',
                        shortName: (t.first_name || '') + ' ' + (t.last_name || '')
                    });
                });
            }
        } catch (e) {
            console.error('โหลดครูผิดพลาด:', e);
            teacherIds.forEach(id => {
                teachersMap.set(id, { fullName: 'บุคลากร', photoUrl: '', shortName: 'บุคลากร' });
            });
        }
    }

    // Load students (from core_students ONLY - removed risky admin.listUsers call)
    if (studentIds.length) {
        try {
            const { data: students, error: errStudent } = await db.from('core_students')
                .select('id, student_id_card, prefix, first_name, last_name, avatar_students_url')
                .in('id', studentIds);
            
            if (errStudent) throw errStudent;

            if (students && students.length) {
                students.forEach(s => {
                    const fullName = `${s.prefix || ''}${s.prefix ? ' ' : ''}${s.first_name || ''} ${s.last_name || ''}`.trim();
                    const shortName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
                    studentsMap.set(s.id, {
                        fullName: fullName || `นักเรียน (${s.student_id_card || '-'})`,
                        photoUrl: s.avatar_students_url || '',
                        shortName: shortName || `นศ.${s.student_id_card?.slice(-4) || '?'}`,
                        detailLine: `เลขที่ ${s.student_id_card || '-'}`
                    });
                });
            }

            // Fallback for IDs not found in core_students
            const foundIds = students ? students.map(s => s.id) : [];
            const missingIds = studentIds.filter(id => !foundIds.includes(id));
            missingIds.forEach(id => {
                studentsMap.set(id, {
                    fullName: `นักเรียน (ID: ${id.slice(0,8)}...)`,
                    photoUrl: '',
                    shortName: 'นักเรียน',
                    detailLine: 'ไม่พบข้อมูลในระบบ'
                });
            });
        } catch (e) {
            console.error('โหลดนักเรียนผิดพลาด:', e);
            studentIds.forEach(id => {
                studentsMap.set(id, {
                    fullName: 'นักเรียน',
                    photoUrl: '',
                    shortName: 'นักเรียน',
                    detailLine: 'ไม่พบข้อมูล'
                });
            });
        }
    }

    return { teachersMap, studentsMap };
}

// โหลดรายการ Ticket ทาง Sidebar และแสดงชื่อผู้แจ้งจริง
async function loadTickets() {
    try {
        // 1. ดึงตั๋วทั้งหมดออกมาก่อน
        const { data: tickets, error } = await db.from('module_helpdesk_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const ticketList = document.getElementById('ticketList');
        if (tickets && tickets.length > 0) {
            
            // 2. ใช้ Promise.all เพื่อไปดึงชื่อจริงของผู้แจ้งแต่ละคนแบบ Dynamic
            const ticketsWithSenderNames = await Promise.all(tickets.map(async (ticket) => {
                let senderName = "ไม่พบข้อมูลผู้ใช้งาน";
                
                try {
                    if (ticket.sender_type === 'teacher') {
                        // ดึงชื่อครู/บุคลากร
                        const { data: teacher } = await db.from('core_personnel')
                            .select('first_name, last_name')
                            .eq('id', ticket.sender_id)
                            .single();
                        if (teacher) senderName = `ครู ${teacher.first_name} ${teacher.last_name}`;
                    } else if (ticket.sender_type === 'student') {
                        // ดึงชื่อนักเรียน
                        const { data: student } = await db.from('core_students')
                            .select('prefix, first_name, last_name')
                            .eq('id', ticket.sender_id)
                            .single();
                        if (student) senderName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
                    }
                } catch (nameErr) {
                    console.error("Error fetching sender name:", nameErr);
                }

                // คืนค่าตั๋วกลับไปพร้อมกับแปะชื่อผู้ส่งชื่อจริงเข้าวัตถุ (Object)
                return { ...ticket, sender_display_name: senderName };
            }));

            // 3. นำข้อมูลที่ได้มาร้อยเรียงลงใน HTML (เปลี่ยนจาก ticket.sender_type เป็นชื่อที่เราหามาได้)
            ticketList.innerHTML = ticketsWithSenderNames.map(ticket => {
                const statusColor = ticket.status === 'open' ? 'bg-amber-100 text-amber-700' : (ticket.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700');
                const statusText = ticket.status === 'open' ? 'รอตรวจสอบ' : (ticket.status === 'closed' ? 'ปิดงาน' : 'ตอบแล้ว');
                
                return `
                <div onclick="openTicket('${ticket.id}', '${ticket.topic.replace(/'/g, "\\'")}', '${ticket.sender_id}', '${ticket.sender_type}')" 
                     class="p-3 bg-white border border-gray-100 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors ${ticket.id === currentTicketId ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-gray-800 text-sm truncate pr-2">${ticket.topic}</h4>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}">${statusText}</span>
                    </div>
                    <div class="text-[11px] text-gray-500 flex justify-between items-center mt-1">
                        <span class="truncate max-w-[150px]"><i class="fa-solid fa-user text-gray-400 mr-1"></i>${ticket.sender_display_name}</span>
                        <span>${formatThaiDateTime(ticket.created_at)}</span>
                    </div>
                </div>`;
            }).join('');
        } else {
            ticketList.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">ไม่มีข้อความใหม่</div>';
        }
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

// เปิดหน้าต่างแชท (อัปเดตใหม่ให้ดึงชื่อผู้ส่งจริงมาแสดงที่หัวแชทด้วย)
// เปิดหน้าต่างแชท และดึงข้อมูลผู้ใช้ (รองรับ Avatar และ รหัสนักเรียน)
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
    let avatarUrl = `https://ui-avatars.com/api/?name=${senderType}&background=random`; // รูปพื้นฐาน
    
    document.getElementById('activeSenderName').innerText = "กำลังโหลด...";
    document.getElementById('activeSenderDetail').innerText = detailText;

    try {
        if (senderType === 'teacher') {
            // ดึงข้อมูลครู (สมมติว่าตารางครูมีคอลัมน์ avatar_url)
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
            // ดึงข้อมูลนักเรียน ตามตารางที่คุณยืนยันมา
            const { data, error } = await db.from('core_students')
                .select('student_id_card, prefix, first_name, last_name, avatar_students_url')
                .eq('id', senderId)
                .maybeSingle(); // <--- เปลี่ยนเป็นตัวนี้
                
            if (data) {
                displayName = `${data.prefix || ''}${data.first_name} ${data.last_name}`;
                detailText = `รหัส: ${data.student_id_card || 'ไม่มีข้อมูล'}`;
                
                // ใช้รูปนักเรียนถ้ามี ถ้าไม่มีให้สร้างจากชื่อ
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

    // อัปเดตข้อมูลขึ้นหน้าจอ
    document.getElementById('activeSenderName').innerText = displayName;
    document.getElementById('activeSenderDetail').innerText = detailText;
    
    const avatarImgElement = document.getElementById('senderAvatarImg');
    if (avatarImgElement) {
        avatarImgElement.src = avatarUrl;
    }

    // โหลดข้อความแชท
    await fetchMessages();
}

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
                // FIX: Allow admins to delete messages
                const showDeleteBtn = true; // All messages can be deleted by admin
                return `
                <div class="flex w-full ${alignment} group message-item">
                    <div class="max-w-[70%] p-3 rounded-2xl shadow-sm ${bubbleColor} relative">
                        ${showDeleteBtn ? `
                        <button onclick="deleteMessage('${msg.id}')" 
                                class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                title="ลบข้อความนี้">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                        ` : ''}
                        <p class="text-sm whitespace-pre-wrap">${linkify(escapeHtml(msg.message))}</p>
                        <p class="text-[9px] mt-1 text-right ${isAdmin ? 'text-blue-200' : 'text-gray-400'}">
                            ${dayjs(msg.created_at).locale('th').format('HH:mm')}
                        </p>
                    </div>
                </div>`;
            }).join('');
            container.scrollTop = container.scrollHeight;
        }
    } catch (err) {
        console.error(err);
        handleError(err, 'ไม่สามารถโหลดข้อความได้');
    }
}

async function sendMessage(e) {
    e.preventDefault();
    if (!currentTicketId || isProcessing) return;
    
    const input = document.getElementById('replyMessage');
    const message = input.value.trim();
    
    // FIX: Add message validation
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
        input.value = '';
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถส่งข้อความได้');
    } finally {
        isProcessing = false;
    }
}

async function closeTicket() {
    if (!currentTicketId || isProcessing) return;
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
            Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ', timer: 1500, showConfirmButton: false });
            await db.from('module_helpdesk_messages').insert({
                ticket_id: currentTicketId,
                sender_id: currentUserId,
                message: '🟢 ผู้ดูแลระบบได้ทำการปิดเคสนี้เรียบร้อยแล้ว'
            });
            await fetchMessages();
            await loadTickets();
        } catch (err) {
            handleError(err, 'ไม่สามารถปิดงานได้');
        } finally {
            isProcessing = false;
        }
    }
}

async function deleteMessage(messageId) {
    if (isProcessing) return;
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
        console.log('Attempting to delete message ID:', messageId);
        const { data, error } = await db.from('module_helpdesk_messages').delete().eq('id', messageId).select();
        if (error) throw error;
        console.log('Delete successful, deleted count:', data?.length);
        Swal.fire({ icon: 'success', title: 'ลบข้อความเรียบร้อย', toast: true, timer: 2000 });
        
        // รีเฟรชข้อมูลอย่างแน่นอน
        await fetchMessages();
        await loadTickets(); // เพื่ออัปเดต badge สถานะถ้ามีผล
    } catch (err) {
        console.error('Delete failed:', err);
        handleError(err, 'ไม่สามารถลบข้อความได้');
    } finally {
        isProcessing = false;
    }
}

async function deleteAllMessages() {
    if (!currentTicketId || isProcessing) return;
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
        Swal.fire({ icon: 'success', title: 'ลบข้อความทั้งหมดเรียบร้อย', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        handleError(err, 'ไม่สามารถลบข้อความได้');
    } finally {
        isProcessing = false;
    }
}

async function deleteTicket() {
    if (!currentTicketId || isProcessing) return;
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

async function banUser() {
    if (!currentTicketSenderId || !currentTicketSenderType || isProcessing) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
    if (currentTicketSenderId === currentUserId) {
        Swal.fire('ไม่สามารถแบนตัวเองได้', 'คุณคือผู้ดูแลระบบ', 'error');
        return;
    }
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
        Swal.fire({ icon: 'success', title: 'แบนผู้ใช้สำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        handleError(err, 'ไม่สามารถแบนผู้ใช้ได้');
    } finally {
        isProcessing = false;
    }
}

async function unbanUser() {
    if (!currentTicketSenderId || !currentTicketSenderType || isProcessing) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
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
        Swal.fire({ icon: 'success', title: 'ยกเลิกแบนสำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        handleError(err, 'ไม่สามารถยกเลิกแบนได้');
    } finally {
        isProcessing = false;
    }
}

// Unified error handler (consistent feedback to users)
function handleError(err, userMessage) {
    console.error('Error:', err);
    Swal.fire('ข้อผิดพลาด', userMessage || err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
}
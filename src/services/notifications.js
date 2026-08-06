import { pushTextMessage } from './line.js';
import config from '../config.js';

const statusLabels = {
  new: 'รับเรื่องใหม่',
  received: 'รับเรื่องแล้ว',
  assigned: 'มอบหมายหน่วยงานแล้ว',
  in_progress: 'กำลังดำเนินการ',
  waiting_for_info: 'รอข้อมูลเพิ่มเติม',
  completed: 'ดำเนินการเสร็จสิ้น',
  rejected: 'ไม่รับดำเนินการ',
  cancelled: 'ยกเลิก',
};

export function getStatusLabel(status) {
  return statusLabels[status] || status;
}

function getComplaintTrackingUrl(referenceNo) {
  const url = new URL(config.appBaseUrl);
  url.searchParams.set('tab', 'history');
  if (referenceNo) url.searchParams.set('reference', referenceNo);
  return url.toString();
}

export async function notifyComplaintCreated(complaint) {
  const text = [
    'ระบบได้รับเรื่องร้องเรียนของท่านแล้ว',
    `ติดตามเรื่อง: ${getComplaintTrackingUrl(complaint.reference_no)}`,
    `เลขรับเรื่อง: ${complaint.reference_no}`,
    `เรื่อง: ${complaint.title}`,
    `สถานะ: ${getStatusLabel(complaint.status)}`,
    '',
    'สามารถเปิดเมนู “ติดตามเรื่อง” ใน LINE OA เพื่อตรวจสอบสถานะได้',
  ].join('\n');

  try {
    await pushTextMessage(complaint.line_user_id, text);
  } catch (error) {
    // การส่ง LINE ไม่สำเร็จต้องไม่ทำให้ข้อมูลร้องเรียนหาย
    console.error('Unable to send complaint-created notification:', error.message);
  }
}

export async function notifyStatusChanged(complaint, note) {
  const lines = [
    'สถานะเรื่องร้องเรียนของท่านมีการเปลี่ยนแปลง',
    `ติดตามเรื่อง: ${getComplaintTrackingUrl(complaint.reference_no)}`,
    `เลขรับเรื่อง: ${complaint.reference_no}`,
    `สถานะ: ${getStatusLabel(complaint.status)}`,
  ];

  if (note) lines.push(`หมายเหตุ: ${note}`);

  try {
    await pushTextMessage(complaint.line_user_id, lines.join('\n'));
    return true;
  } catch (error) {
    console.error('Unable to send status notification:', error.message);
    return false;
  }
}

export async function notifyAssignmentChanged(complaint, note) {
  const lines = [
    'เรื่องร้องเรียนของท่านได้รับการมอบหมายแล้ว',
    `ติดตามเรื่อง: ${getComplaintTrackingUrl(complaint.reference_no)}`,
    `เลขรับเรื่อง: ${complaint.reference_no}`,
    `เรื่อง: ${complaint.title}`,
    'เจ้าหน้าที่ได้ส่งเรื่องให้หน่วยงานที่รับผิดชอบแล้ว',
  ];

  if (note) lines.push(`หมายเหตุ: ${note}`);

  try {
    await pushTextMessage(complaint.line_user_id, lines.join('\n'));
    return true;
  } catch (error) {
    console.error('Unable to send assignment notification:', error.message);
    return false;
  }
}

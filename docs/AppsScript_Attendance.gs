/**
 * Attendance Sync - Google Apps Script Web App
 *
 * Bind this script to the spreadsheet that should receive attendance data.
 *
 * Deploy:  Deploy -> New deployment -> Web app
 *            Execute as: Me
 *            Who has access: Anyone
 *          Copy the /exec URL and paste it into:
 *            Admin Panel -> Datasets -> Sync Targets
 *            (purpose = "attendance", is_active = true)
 *
 * Inbound payloads from the Supabase sync-to-sheet Edge Function:
 *   { action: "ping" }
 *   { action: "sync_master", students: [...] }
 *   { action: "sync_attendance", date: "YYYY-MM-DD", records: [...] }
 *   { action: "sync_absentees", date: "YYYY-MM-DD", absentees: [...] }
 *   { action: "sync_analytics", date: "YYYY-MM-DD", ...counts }
 */

const MASTER_TAB = 'Master Students';
const ATTENDANCE_TAB = 'Attendance';
const ABSENTEES_TAB = 'Absentees';
const ANALYTICS_TAB = 'Analytics';

const MASTER_HEADER = [
  'Student Key', 'User ID', 'Roll No', 'Student Name', 'Classroom',
  'Curriculum', 'Grade', 'Center', 'Enrollment Status', 'Mobile Number',
  'Emergency Contact 1', 'Emergency Contact 2', 'Last Synced'
];

const ATTENDANCE_HEADER = [
  'Student Key', 'Date', 'Session', 'Status', 'Remark', 'Student Name',
  'Roll No', 'User ID', 'Classroom', 'Curriculum', 'Grade', 'Center',
  'Synced At'
];

const ABSENTEES_HEADER = [
  'Student Key', 'Date', 'Session', 'Status', 'Remark', 'Student Name',
  'Roll No', 'User ID', 'Classroom', 'Curriculum', 'Grade', 'Center',
  'Synced At'
];

const ANALYTICS_HEADER = [
  'Date', 'Total Students', 'Present Count', 'Absent Count', 'Synced At'
];

function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (_) {}

  try {
    if (payload.action === 'ping') return _json({ ok: true, success: true, service: 'attendance-sync' });
    if (payload.action === 'sync_master') return _json({ ok: true, success: true, written: _syncMaster(payload.students || []) });
    if (payload.action === 'sync_attendance') return _json({ ok: true, success: true, written: _syncAttendance(payload.records || [], payload.date) });
    if (payload.action === 'sync_absentees') return _json({ ok: true, success: true, written: _syncAbsentees(payload.absentees || [], payload.date) });
    if (payload.action === 'sync_analytics') return _json({ ok: true, success: true, written: _syncAnalytics(payload) });

    return _json({ ok: false, success: false, error: 'Unknown action: ' + payload.action });
  } catch (err) {
    return _json({ ok: false, success: false, error: String((err && err.message) || err) });
  }
}

function doGet() {
  return _json({ ok: true, service: 'attendance-sync' });
}

function _syncMaster(students) {
  const sh = _sheet(MASTER_TAB, MASTER_HEADER);
  const now = new Date().toISOString();
  let written = 0;

  students.forEach(function(student) {
    const key = _studentKey(student);
    if (!key) return;

    const row = [
      key,
      _first(student.user_id_vedantu, student.user_id),
      student.roll_no || '',
      student.student_name || '',
      student.classroom_name || '',
      student.curriculum || '',
      student.grade || '',
      student.center || '',
      student.enrollment_status || '',
      student.mobile_number || '',
      student.emergency_contact_1 || '',
      student.emergency_contact_2 || '',
      now
    ];

    _upsertRow(sh, 1, key, row);
    written++;
  });

  return written;
}

function _syncAttendance(records, payloadDate) {
  const sh = _sheet(ATTENDANCE_TAB, ATTENDANCE_HEADER);
  const now = new Date().toISOString();
  let written = 0;

  records.forEach(function(record) {
    const row = _attendanceRow(record, payloadDate, now);
    if (!row) return;

    const key = row[0] + '|' + row[1] + '|' + row[2];
    _upsertRow(sh, 1, key, row, function(existing) {
      return String(existing[0]).trim() + '|' + String(existing[1]).trim() + '|' + String(existing[2]).trim();
    });
    written++;
  });

  return written;
}

function _syncAbsentees(absentees, payloadDate) {
  const sh = _sheet(ABSENTEES_TAB, ABSENTEES_HEADER);
  const now = new Date().toISOString();
  let written = 0;

  absentees.forEach(function(record) {
    const row = _attendanceRow(record, payloadDate, now);
    if (!row) return;

    const key = row[0] + '|' + row[1] + '|' + row[2];
    _upsertRow(sh, 1, key, row, function(existing) {
      return String(existing[0]).trim() + '|' + String(existing[1]).trim() + '|' + String(existing[2]).trim();
    });
    written++;
  });

  return written;
}

function _syncAnalytics(payload) {
  const sh = _sheet(ANALYTICS_TAB, ANALYTICS_HEADER);
  const date = String(payload.date || '').trim();
  if (!date) return 0;

  const total = _first(payload.total_students, payload.total, 0);
  const present = _first(payload.present_count, payload.present, 0);
  const absent = _first(payload.absent_count, payload.absent, 0);
  const row = [date, Number(total || 0), Number(present || 0), Number(absent || 0), new Date().toISOString()];

  _upsertRow(sh, 1, date, row);
  return 1;
}

function _attendanceRow(record, payloadDate, syncedAt) {
  const student = record.students || {};
  const studentKey = _studentKey(record) || _studentKey(student) || record.student_id || '';
  if (!studentKey) return null;

  const date = String(record.date || payloadDate || '').trim();
  if (!date) return null;

  const session = String(record.session || 'AM').trim() || 'AM';
  return [
    studentKey,
    date,
    session,
    record.status || '',
    record.remark || '',
    _first(record.student_name, student.student_name),
    _first(record.roll_no, student.roll_no),
    _first(record.user_id_vedantu, record.user_id, student.user_id_vedantu, student.user_id),
    _first(record.classroom_name, student.classroom_name),
    _first(record.curriculum, student.curriculum),
    _first(record.grade, student.grade),
    _first(record.center, student.center),
    syncedAt
  ];
}

function _sheet(tabName, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tabName);
  if (!sh) sh = ss.insertSheet(tabName);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    const existingHeader = sh.getRange(1, 1, 1, header.length).getValues()[0];
    const hasHeader = existingHeader.some(function(value) { return String(value || '').trim(); });
    if (!hasHeader) sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  }

  return sh;
}

function _upsertRow(sh, keyColumn, key, row, keyBuilder) {
  const last = sh.getLastRow();
  let rowIndex = -1;

  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, Math.max(row.length, keyColumn)).getValues();
    for (let i = 0; i < values.length; i++) {
      const existingKey = keyBuilder ? keyBuilder(values[i]) : String(values[i][keyColumn - 1]).trim();
      if (existingKey === key) {
        rowIndex = i + 2;
        break;
      }
    }
  }

  if (rowIndex < 0) rowIndex = sh.getLastRow() + 1;
  sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function _studentKey(source) {
  return String(_first(
    source.user_id_vedantu,
    source.user_id,
    source.dedup_key,
    source.student_key,
    source.match_key,
    source.student_identifier,
    source.roll_no,
    source.student_id
  ) || '').trim();
}

function _first() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

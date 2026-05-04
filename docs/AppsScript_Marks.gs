/**
 * Marks Sync — Google Apps Script Web App
 * Bind this script to the spreadsheet that holds the marks tabs:
 *   - Quarterly
 *   - Half Yearly
 *   - Pre Final 1
 *   - Pre Final 2
 *
 * Deploy:  Deploy → New deployment → Web app
 *            Execute as: Me
 *            Who has access: Anyone
 *          Copy the /exec URL and paste it into:
 *            Admin Panel → Datasets → Sync Targets
 *            (purpose = "marks", is_active = true)
 *
 * Inbound payloads (from Lovable Cloud edge functions):
 *   { action: "ping" }                          → { ok:true }
 *   { action: "sync_exam_marks",  ... single }  → upserts one student row
 *   { action: "sync_exam_marks_bulk", students:[...] } → upserts many
 *
 * Sheet layout (auto-created if missing). Header row written on first run.
 *   A: User ID | B: Student Name | C: Roll No | D: Classroom |
 *   E: Curriculum | F: Grade | G: Enrollment Status |
 *   H..M: Subjects (Sanskrit, English, Maths A/Botany, Maths B/Zoology, Physics, Chemistry)
 *           each subject = "obtained / max"
 *   N: Total Obtained | O: Total Max | P: Percentage | Q: Last Synced
 */

const TAB_FOR_EXAM = {
  quarterly:   'Quarterly',
  half_yearly: 'Half Yearly',
  pre_final_1: 'Pre Final 1',
  pre_final_2: 'Pre Final 2',
};

const HEADER = [
  'User ID','Student Name','Roll No','Classroom','Curriculum','Grade','Enrollment Status',
  'Sanskrit','English','Maths A / Botany','Maths B / Zoology','Physics','Chemistry',
  'Total Obtained','Total Max','Percentage','Last Synced'
];

const SUBJECT_COLS = {
  'Sanskrit': 8, 'English': 9,
  'Maths A': 10, 'Botany': 10,
  'Maths B': 11, 'Zoology': 11,
  'Physics': 12, 'Chemistry': 13,
};

function doPost(e) {
  let payload = {};
  try { payload = JSON.parse(e.postData.contents || '{}'); } catch (_) {}

  try {
    if (payload.action === 'ping') return _json({ ok: true, success: true });

    if (payload.action === 'sync_exam_marks') {
      const n = _writeStudent(payload.exam_type, payload);
      return _json({ ok: true, success: true, written: n });
    }

    if (payload.action === 'sync_exam_marks_bulk') {
      const list = Array.isArray(payload.students) ? payload.students : [];
      let written = 0;
      list.forEach(s => { written += _writeStudent(payload.exam_type, s); });
      return _json({ ok: true, success: true, written: written, count: list.length });
    }

    return _json({ ok: false, success: false, error: 'Unknown action: ' + payload.action });
  } catch (err) {
    return _json({ ok: false, success: false, error: String(err && err.message || err) });
  }
}

function doGet() { return _json({ ok: true, service: 'marks-sync' }); }

function _writeStudent(examType, s) {
  const tabName = TAB_FOR_EXAM[examType];
  if (!tabName) throw new Error('Unknown exam_type: ' + examType);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tabName);
  if (!sh) sh = ss.insertSheet(tabName);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  const userId = String(s.student_user_id || '').trim();
  if (!userId) return 0;

  // Find existing row by User ID (col A)
  const last = sh.getLastRow();
  let rowIndex = -1;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === userId) { rowIndex = i + 2; break; }
    }
  }
  if (rowIndex < 0) rowIndex = sh.getLastRow() + 1;

  const row = new Array(HEADER.length).fill('');
  row[0] = userId;
  row[1] = s.student_name || '';
  row[2] = s.roll_number || '';
  row[3] = s.classroom || '';
  row[4] = s.curriculum || '';
  row[5] = s.grade || '';
  row[6] = s.enrollment_status || '';

  const marks = s.marks || {};
  Object.keys(marks).forEach(sub => {
    const col = SUBJECT_COLS[sub];
    if (!col) return;
    const v = marks[sub] || {};
    const obt = Number(v.obtained || 0), max = Number(v.max || 0);
    row[col - 1] = (max > 0) ? (obt + ' / ' + max) : '';
  });

  row[13] = Number(s.total_obtained || 0);
  row[14] = Number(s.total_max || 0);
  row[15] = (s.percentage != null) ? (Number(s.percentage) + '%') : '';
  row[16] = s.synced_at || new Date().toISOString();

  sh.getRange(rowIndex, 1, 1, HEADER.length).setValues([row]);
  return 1;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
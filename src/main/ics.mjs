// iCalendar (.ics) files for Apple Calendar. Events are all-day, keep stable IDs (so re-importing
// updates rather than duplicates in most calendar apps) and can carry reminders.

function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines at 75 octets as RFC 5545 requires. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (len + b > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const ymd = (iso) => iso.replace(/-/g, '');

function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * @param {Array<{uid,title,date,endDate?,url?,detail?,kind}>} items
 */
export function buildIcs(items, { calendarName = 'Atelier', alarmsDaysBefore = [7, 1], now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atelier//Artist opportunities//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  for (const it of items) {
    const end = it.endDate ? nextDay(it.endDate) : nextDay(it.date);
    const desc = [it.detail, it.url].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(it.uid)}@atelier.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(it.date)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${esc(it.title)}`,
    );
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (it.url) lines.push(`URL:${esc(it.url)}`);
    lines.push('TRANSP:TRANSPARENT', `CATEGORIES:${esc(it.kind || 'Atelier')}`);
    if (it.kind === 'deadline' || it.kind === 'rec' || it.kind === 'target') {
      for (const days of alarmsDaysBefore) {
        // 9:00 AM on the day N days before (all-day events start at midnight).
        const n = Math.max(1, Number(days) || 1);
        const trigger = n === 1 ? '-PT15H' : `-P${n - 1}DT15H`;
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
      }
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

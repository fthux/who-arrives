export interface LocalTime {
  evaluatedAt: string;
  date: string;
  time: string;
  dateTime: string;
  utcOffset: string;
  utcOffsetSeconds: number;
}

export function localTime(timezone: string | null, now: Date): LocalTime | null {
  if (!timezone || !Number.isFinite(now.getTime())) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    const utcOffsetSeconds = (Date.parse(`${date}T${time}Z`) - Math.floor(now.getTime() / 1000) * 1000) / 1000;
    if (!Number.isFinite(utcOffsetSeconds)) return null;
    const absolute = Math.abs(utcOffsetSeconds);
    const pad = (value: number) => String(value).padStart(2, '0');
    const seconds = absolute % 60;
    const utcOffset = `${utcOffsetSeconds < 0 ? '-' : '+'}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute % 3600 / 60))}${seconds ? `:${pad(seconds)}` : ''}`;
    return { evaluatedAt: now.toISOString(), date, time, dateTime: `${date}T${time}${utcOffset}`, utcOffset, utcOffsetSeconds };
  } catch {
    // An unavailable/invalid client time zone must not break the other fields.
    return null;
  }
}

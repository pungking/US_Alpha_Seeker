const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatByUtcShift = (date: Date): string => {
  // Intl fallback: convert to KST(+09:00) by shifting epoch and then read via UTC getters.
  const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}_${pad2(kst.getUTCHours())}-${pad2(kst.getUTCMinutes())}-${pad2(kst.getUTCSeconds())}`;
};

export function formatKstFilenameTimestamp(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);

    const partMap: Record<string, string> = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') partMap[part.type] = part.value;
    });

    const hasAll = Boolean(
      partMap.year &&
      partMap.month &&
      partMap.day &&
      partMap.hour &&
      partMap.minute &&
      partMap.second
    );
    if (!hasAll) return formatByUtcShift(date);

    return `${partMap.year}-${partMap.month}-${partMap.day}_${partMap.hour}-${partMap.minute}-${partMap.second}`;
  } catch {
    return formatByUtcShift(date);
  }
}

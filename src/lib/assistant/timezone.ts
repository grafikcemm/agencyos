/**
 * Timezone helpers for Europe/Istanbul
 */
export function getIstanbulDateAndDay(): { todayStr: string; dow: number } {
  const dateObj = new Date();
  
  // Resolve day of the week in Istanbul
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "long"
  });
  
  const weekdayLong = dayFormatter.format(dateObj); // "Sunday", "Monday", etc.
  const weekdayMap: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6
  };
  const dow = weekdayMap[weekdayLong] ?? dateObj.getDay();

  // Resolve date string (YYYY-MM-DD) in Istanbul
  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const formattedParts = partsFormatter.formatToParts(dateObj);
  let year = "";
  let month = "";
  let day = "";
  for (const part of formattedParts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  const todayStr = `${year}-${month}-${day}`;

  return { todayStr, dow };
}

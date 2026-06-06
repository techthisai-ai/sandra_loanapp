/** YYYY-MM-DD for report export filenames */
export function reportDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

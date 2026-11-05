export function logEvent(message: string) {
  try { console.log(message.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')); } catch {}
}

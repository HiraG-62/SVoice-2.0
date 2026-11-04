export function shouldSubmitJoinAuth(event: Pick<KeyboardEvent, 'key' | 'isComposing'>, locked: boolean, pending: boolean) {
  return event.key === 'Enter' && !event.isComposing && !locked && !pending;
}

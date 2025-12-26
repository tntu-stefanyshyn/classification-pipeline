export function isInteractiveTarget(target: EventTarget | null) {
  if (!target) return false;
  if (target instanceof Element) {
    return Boolean(
      target.closest('button, a, input, select, textarea, [role="button"], [data-row-action]')
    );
  }
  if (target instanceof Node && target.parentElement) {
    return Boolean(
      target.parentElement.closest(
        'button, a, input, select, textarea, [role="button"], [data-row-action]'
      )
    );
  }
  return false;
}

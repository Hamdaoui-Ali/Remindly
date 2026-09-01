export function isValidEmail(value: string): boolean {
  const atIndex = value.indexOf('@');
  const lastAtIndex = value.lastIndexOf('@');
  const dotIndex = value.lastIndexOf('.');

  if (atIndex <= 0 || atIndex !== lastAtIndex || dotIndex <= atIndex + 1 || dotIndex >= value.length - 1) {
    return false;
  }

  for (const character of value) {
    if (character.trim() === '') return false;
  }

  return true;
}

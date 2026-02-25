const SUBNET_REGEX = /^subnet-[0-9a-zA-Z]{8,17}$/;
const SECURITY_GROUP_REGEX = /^sg-[0-9a-zA-Z]{8,17}$/;

/**
 * Parse a comma-separated string of IDs into a trimmed array.
 */
export function parseCommaSeparatedIds(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Validate comma-separated subnet IDs.
 * Returns `true` if valid, or an error message string if invalid.
 */
export function validateSubnetsInput(value: string): true | string {
  const ids = parseCommaSeparatedIds(value);
  if (ids.length === 0) {
    return 'At least one subnet ID is required';
  }
  if (ids.length > 16) {
    return 'Maximum 16 subnet IDs allowed';
  }
  for (const id of ids) {
    if (!SUBNET_REGEX.test(id)) {
      return `Invalid subnet ID: "${id}". Expected format: subnet-xxxxxxxx`;
    }
  }
  return true;
}

/**
 * Validate comma-separated security group IDs.
 * Returns `true` if valid, or an error message string if invalid.
 */
export function validateSecurityGroupsInput(value: string): true | string {
  const ids = parseCommaSeparatedIds(value);
  if (ids.length === 0) {
    return 'At least one security group ID is required';
  }
  if (ids.length > 16) {
    return 'Maximum 16 security group IDs allowed';
  }
  for (const id of ids) {
    if (!SECURITY_GROUP_REGEX.test(id)) {
      return `Invalid security group ID: "${id}". Expected format: sg-xxxxxxxx`;
    }
  }
  return true;
}

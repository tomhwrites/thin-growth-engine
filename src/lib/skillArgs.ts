export function withAliases(args: Record<string, unknown>): Record<string, unknown> {
  const aliased = { ...args };

  for (const [key, value] of Object.entries(args)) {
    const upperSnake = key.replace(/([A-Z])/g, "_$1").toUpperCase();
    if (!(upperSnake in aliased)) {
      aliased[upperSnake] = value;
    }
  }

  return aliased;
}

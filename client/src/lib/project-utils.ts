export function generateClientShortName(clientName: string | null | undefined): string {
  if (!clientName) return 'UNK';
  const words = clientName.trim().split(/\s+/);
  if (words.length === 1) {
    return clientName.substring(0, 4).toUpperCase();
  }
  return words.map(w => w[0]).join('').toUpperCase().substring(0, 5);
}

export function getClientShortName(client: { shortName?: string | null; name?: string | null } | null | undefined): string {
  if (client?.shortName) return client.shortName;
  return generateClientShortName(client?.name);
}

export function formatProjectLabel(project: { name: string; client?: { shortName?: string | null; name?: string | null } | null }): string {
  const clientShortName = getClientShortName(project.client);
  return `${clientShortName} | ${project.name}`;
}

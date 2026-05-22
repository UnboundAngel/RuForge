export function priorityBadgeClass(priority: string): string {
  if (priority === 'Extremely important') return 'rf-badge rf-badge-critical';
  if (priority === 'High') return 'rf-badge rf-badge-high';
  return 'rf-badge bg-rf-surface text-rf-text-muted';
}

export function statusBadgeClass(status: 'Finished' | 'To-Do'): string {
  return status === 'Finished' ? 'rf-badge rf-badge-done' : 'rf-badge rf-badge-todo';
}

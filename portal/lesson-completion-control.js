export function lessonCompletionControlMarkup(completed) {
  const label = completed
    ? 'Aula concluída. Clique para desmarcar.'
    : 'Concluir a aula';
  const icon = completed ? '✓' : '○';
  const visibleLabel = completed
    ? ''
    : '<span class="lesson-complete-label">Concluir a aula</span>';

  return `<button class="lesson-complete-control" type="button" data-mark-complete aria-pressed="${completed}" aria-label="${label}" title="${label}">${visibleLabel}<span class="lesson-complete-symbol" aria-hidden="true">${icon}</span></button>`;
}

export function createQuizStepper(questionCount) {
  const responses = Array.from({ length: Math.max(0, questionCount) }, () => null);
  let currentIndex = 0;

  return {
    get currentIndex() { return currentIndex; },
    get responses() { return [...responses]; },
    get isComplete() { return responses.every(response => response !== null); },
    answer(responseIndex) {
      if (!Number.isInteger(responseIndex) || responseIndex < 0 || currentIndex >= responses.length) return false;
      responses[currentIndex] = responseIndex;
      return true;
    },
    next() {
      if (responses[currentIndex] === null || currentIndex >= responses.length - 1) return false;
      currentIndex += 1;
      return true;
    },
    previous() {
      if (currentIndex <= 0) return false;
      currentIndex -= 1;
      return true;
    },
  };
}

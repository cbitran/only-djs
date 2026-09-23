const DATABASE_NAME = 'only-djs-student-preview';
const DATABASE_VERSION = 1;
const STORE_NAME = 'student-files';
const AVATAR_KEY = 'avatar';

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new Error('Browser storage is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Browser storage operation failed.'));
  });
}

export function createStudentAvatarStore({ indexedDB = globalThis.indexedDB, openDatabase: open = () => openDatabase(indexedDB) } = {}) {
  return {
    async save(imageBlob) {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const completed = transactionComplete(transaction);
      transaction.objectStore(STORE_NAME).put(imageBlob, AVATAR_KEY);
      await completed;
    },
    async load() {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const completed = transactionComplete(transaction);
      const request = transaction.objectStore(STORE_NAME).get(AVATAR_KEY);
      const [imageBlob] = await Promise.all([
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error || new Error('Could not read browser storage.'));
        }),
        completed,
      ]);
      return imageBlob;
    },
    async remove() {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const completed = transactionComplete(transaction);
      transaction.objectStore(STORE_NAME).delete(AVATAR_KEY);
      await completed;
    },
  };
}

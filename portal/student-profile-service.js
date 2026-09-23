import { saveStudentProfile } from './student-account-actions.js';
import { saveAccountAvatar, removeAccountAvatar, removeObsoleteAvatar } from './student-avatar-actions.js';

export function createStudentProfileService({ client = null, userId = null, previewStore = null, avatarStore = null } = {}) {
  return {
    loadPreview() {
      return previewStore?.load() || null;
    },
    savePreview(fields) {
      if (!previewStore) return false;
      return previewStore.save({ ...(previewStore.load() || {}), ...fields });
    },
    loadPreviewAvatar() {
      return avatarStore?.load() ?? Promise.resolve(null);
    },
    savePreviewAvatar(image) {
      return avatarStore?.save(image) ?? Promise.reject(new Error('Preview avatar storage is unavailable.'));
    },
    removePreviewAvatar() {
      return avatarStore?.remove() ?? Promise.reject(new Error('Preview avatar storage is unavailable.'));
    },
    saveConnectedProfile(updates) {
      if (!client || !userId) return Promise.resolve(false);
      return saveStudentProfile(client, userId, updates);
    },
    saveConnectedAvatar(path, file) {
      if (!client || !userId) return Promise.resolve({ status: 'error' });
      return saveAccountAvatar(client, userId, path, file);
    },
    removeConnectedAvatar(path) {
      if (!client || !userId) return Promise.resolve('error');
      return removeAccountAvatar(client, userId, path);
    },
    removeObsoleteConnectedAvatar(path) {
      if (!client) return Promise.resolve(false);
      return removeObsoleteAvatar(client, path);
    },
  };
}

import { config } from '../config/index.js';

/**
 * Niveau d'un créateur à partir de ses statistiques
 */
export function levelFor(stats = {}) {
  const jobs = stats.completedJobs || 0;
  const rating = stats.rating || 0;
  const b = config.badges;
  if (jobs >= b.expertJobs && rating >= b.expertRating) return 'expert';
  if (jobs >= b.confirmedJobs && rating >= b.confirmedRating) return 'confirmed';
  return 'new';
}

/**
 * Liste des badges d'un créateur (niveau + ambassadeur)
 */
export function badgesFor(user) {
  const stats = user.profile?.stats || {};
  const badges = [levelFor(stats)];
  if (user.profile?.ambassador?.status === 'approved') badges.push('ambassador');
  return badges;
}

export function isAmbassador(user) {
  return user?.profile?.ambassador?.status === 'approved';
}

/**
 * Prochain palier à atteindre (pour motiver le créateur)
 */
export function nextLevelHint(stats = {}) {
  const level = levelFor(stats);
  const b = config.badges;
  if (level === 'expert') return null;
  const target = level === 'new'
    ? { name: 'Confirmé', jobs: b.confirmedJobs, rating: b.confirmedRating }
    : { name: 'Expert', jobs: b.expertJobs, rating: b.expertRating };
  const missingJobs = Math.max(0, target.jobs - (stats.completedJobs || 0));
  return {
    level: target.name,
    missingJobs,
    minRating: target.rating,
    message: `Encore ${missingJobs} mission(s) avec une note ≥ ${target.rating} pour devenir ${target.name}.`,
  };
}

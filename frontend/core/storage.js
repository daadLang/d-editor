const RECENTS_KEY = 'recentProjects';

export function getRecentProjects() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

export function saveRecentProjects(projects) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(projects.slice(0, 5)));
  } catch {
    // Local storage can be disabled by the host environment.
  }
}

export function addRecentProject(projectPath) {
  if (!projectPath) return;
  const projects = getRecentProjects().filter(project => project !== projectPath);
  projects.unshift(projectPath);
  saveRecentProjects(projects);
}
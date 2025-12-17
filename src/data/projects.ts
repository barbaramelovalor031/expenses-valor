// Project options for dropdowns across the application
export const PROJECT_OPTIONS = [
  'Annual Summit - 2025',
  'FII Riyadh - 2025',
  'Milken CDMX - 2025',
  'Milken Singapore - 2025',
  'Partner Offsite - 2025',
  'Middle East Roadshows - 2025',
  'Asia Roadshows - 2025',
  'Milken Brazil - 2025',
  'Singapore Fintech Festival - 2025',
  'Milken Miami - 2025',
  'Token 2049 - 2025',
  'Japan Fintech Festival - 2025',
  'LAVCA Week - 2025',
  'Brazil Roadshows - 2025',
  'Mexico Roadshows - 2025',
  'US Roadshows - 2025',
  'Milken LA - 2025',
  'Brazil Silicon Valley Week - 2025',
] as const;

export type ProjectOption = typeof PROJECT_OPTIONS[number];
